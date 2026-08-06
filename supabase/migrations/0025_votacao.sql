-- =====================================================================
--  PELADA BROWNS — Migração 25: uma votação só, com prazo, link e fecho
--
--  O problema que isto resolve não é de código, é de participação: quase
--  ninguém votava. E não votava porque votar custava seis navegações e
--  dois envios — a votação de craque/bagre vivia num cartão e a avaliação
--  por estrelas noutro, os dois escondidos dentro de Estatísticas →
--  Rodadas, sem prazo, sem lembrete e sem forma de partilhar um link.
--
--  Esta migração dá:
--
--    1. UM ESTADO SÓ. `voting_status` (NONE → OPEN → REVIEW → CLOSED)
--       manda nas duas votações ao mesmo tempo. `post_rating_status`
--       (0023) fica sincronizada por trigger durante uma versão, para
--       nada do que já a lê deixar de funcionar.
--
--    2. PRAZO. `voting_deadline` é validado no SERVIDOR — o contador no
--       ecrã é decoração. O fecho é preguiçoso: `fechar_votacoes_expiradas()`
--       corre no início das leituras e o estado converge sozinho, sem
--       precisar de pg_cron. (Com pg_cron disponível, chamar a mesma
--       função de 15 em 15 minutos dá fecho ao segundo — é idempotente.)
--
--    3. UMA CÉDULA. `get_round_ballot` traz tudo o que o ecrã precisa
--       numa chamada e `submit_round_vote` grava estrelas + craque +
--       bagre numa transação. Aceita votos parciais: quem sai a meio não
--       perde o que já fez.
--
--    4. SESSÃO SEM GUARDAR O PIN. `player_devices` guarda um token que
--       autoriza LER e VOTAR — nada mais. Trocar PIN, trocar foto ou
--       entrar no admin continuam a exigir o PIN escrito. Assim o link do
--       WhatsApp abre direto na cédula a partir da segunda vez, sem
--       quebrar a promessa do README ("o PIN só vive em memória").
--
--    5. RESULTADO CONGELADO. `craque_final`/`bagre_final` gravam quem
--       ganhou no momento do fecho. Até aqui o craque de TODAS as rodadas
--       era recalculado a cada `get_player_stats` — editar uma rodada de
--       há seis meses reescrevia a história e mexia nos títulos.
--
--    6. QUÓRUM. Uma rodada em que votaram 3 de 14 não pode valer o mesmo
--       que uma com 12 de 14. Sem quórum (ou com empate no topo) o jogo
--       vai para REVIEW e é o admin que decide.
--
--  Aditiva e idempotente.
--
--  Códigos de erro novos: PRAZOVOTACAO, VOTACAOREVISAO, TOKENINVALIDO.
-- =====================================================================

-- ---------- 1. COLUNAS NOVAS EM matches ----------

alter table matches add column if not exists voting_status    text not null default 'NONE';
alter table matches add column if not exists voting_deadline  timestamptz;
alter table matches add column if not exists voting_closed_at timestamptz;
alter table matches add column if not exists voting_quorum_pct int not null default 50;
alter table matches add column if not exists craque_final uuid references players(id) on delete set null;
alter table matches add column if not exists bagre_final  uuid references players(id) on delete set null;

do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_voting_status_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_voting_status_chk
      check (voting_status in ('NONE','OPEN','REVIEW','CLOSED'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_voting_quorum_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_voting_quorum_chk
      check (voting_quorum_pct between 0 and 100);
  end if;
end
$chk$;

-- Índice do fecho preguiçoso: a pergunta "há votações expiradas?" é feita
-- a cada leitura de jogos e tem de custar quase nada.
create index if not exists matches_voting_open_idx
  on matches (voting_deadline) where voting_status = 'OPEN';

-- A view nasceu na 0019 com `select m.*` e ficou com as colunas que
-- existiam nessa altura — as da 0024 e as de cima não estão lá. Recriar
-- acrescenta-as no fim (CREATE OR REPLACE VIEW só deixa ACRESCENTAR, e é
-- por isso que a definição tem de ficar igual em tudo o resto).
create or replace view matches_validas as
  select m.*
  from matches m
  where m.status = 'COMPLETED'
    and m.result_status = 'PUBLISHED';

-- ---------- 2. BACKFILL DOS JOGOS QUE JÁ ESTÃO ABERTOS ----------
-- Sem isto, a primeira leitura depois do deploy fechava TODAS as votações
-- de uma vez (deadline nulo → expirado). Quem tem a avaliação aberta hoje
-- passa a OPEN com três dias de prazo a contar de agora.
update matches set
  voting_status   = 'OPEN',
  voting_deadline = coalesce(voting_deadline, now() + interval '3 days')
where voting_status = 'NONE'
  and post_rating_status = 'OPEN'
  and overall_version = 2
  and status = 'COMPLETED'
  and result_status = 'PUBLISHED';

-- As rodadas já jogadas ficam CLOSED. `craque_final` fica NULO de
-- propósito: quem ganhou nessas rodadas continua a ser decidido pela
-- contagem de votos de sempre (ver o ramo `legado` em get_player_stats).
-- Congelar aqui um vencedor calculado agora era reescrever a história
-- com a régua nova — exatamente o que esta migração quer evitar.
--
-- Consequência assumida: uma rodada antiga deixa de aceitar votos novos.
-- Se faltar mesmo o voto de alguém, o admin reabre-a em Jogos → Votação.
update matches set voting_status = 'CLOSED', voting_closed_at = coalesce(result_published_at, now())
where voting_status = 'NONE'
  and status = 'COMPLETED'
  and result_status = 'PUBLISHED';

-- ---------- 3. post_rating_status SEGUE voting_status ----------
-- Uma versão de convivência: tudo o que já lê `post_rating_status`
-- continua certo sem saber que existe um eixo novo.
create or replace function sincronizar_post_rating_status()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.voting_status is distinct from old.voting_status then
    new.post_rating_status := case when new.voting_status = 'OPEN' then 'OPEN' else 'CLOSED' end;
    if new.voting_status = 'OPEN' then
      new.post_rating_opened_at := coalesce(new.post_rating_opened_at, now());
      new.post_rating_closed_at := null;
    else
      new.post_rating_closed_at := coalesce(new.post_rating_closed_at, now());
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists matches_voting_sync_trg on matches;
create trigger matches_voting_sync_trg
  before update on matches
  for each row execute function sincronizar_post_rating_status();

-- ---------- 4. O PRAZO POR OMISSÃO ----------
-- "Jogo à sexta ⇒ votação até terça às 23:59" não pode ser lido à letra:
-- há jogos a meio da semana. A regra que generaliza é `kickoff + 4 dias,
-- às 23:59 desse dia` — dá terça para os jogos de sexta e faz sentido
-- para todos os outros.
--
-- Tudo em Europe/Lisbon: um jogador em viagem tem de ver o mesmo INSTANTE,
-- não a mesma hora local. Por isso a conta é feita no fuso da pelada e o
-- resultado guardado como timestamptz.
-- `stable` e não `immutable`: o coalesce cai em now() quando não há
-- kickoff, e o Postgres pode pré-calcular uma immutable no plano.
create or replace function prazo_de_votacao(p_kickoff timestamptz, p_dias int default 4)
returns timestamptz
language sql stable set search_path = public, extensions as $$
  select ((((coalesce(p_kickoff, now()) at time zone 'Europe/Lisbon')::date
            + coalesce(p_dias, 4)) + time '23:59')
          at time zone 'Europe/Lisbon');
$$;

-- ---------- 5. QUEM VOTOU, QUANTOS SÃO, HÁ QUÓRUM? ----------
-- Um jogador conta como "votou" se entregou QUALQUER das duas coisas:
-- o voto de craque/bagre ou pelo menos uma estrela. É a definição que a
-- barra de progresso do admin mostra e a que o quórum usa.
create or replace function participacao_da_votacao(p_match uuid)
returns table(votantes int, total int, pct int)
language sql stable security definer set search_path = public, extensions as $$
  with jogadores as (
    select distinct pj.player_id from participantes_do_jogo pj where pj.match_id = p_match
  ), votaram as (
    select av.voter_id as player_id from award_votes av where av.match_id = p_match
    union
    select pr.rater_id from post_match_ratings pr where pr.match_id = p_match
  )
  select
    (select count(*) from votaram v where v.player_id in (select player_id from jogadores))::int,
    (select count(*) from jogadores)::int,
    case when (select count(*) from jogadores) = 0 then 0
         else round(100.0
                    * (select count(*) from votaram v
                        where v.player_id in (select player_id from jogadores))
                    / (select count(*) from jogadores))::int
    end;
$$;

-- Quem lidera o craque (ou o bagre) e se há empate no topo.
-- `p_tipo` é 'CRAQUE' ou 'BAGRE'.
create or replace function lider_do_premio(p_match uuid, p_tipo text)
returns table(player_id uuid, votos int, empatados int)
language sql stable security definer set search_path = public, extensions as $$
  with contagem as (
    select case when p_tipo = 'CRAQUE' then av.craque_id else av.bagre_id end as pid,
           count(*)::int as n
    from award_votes av
    where av.match_id = p_match
    group by 1
  ), topo as (
    select max(n) as n from contagem
  )
  select c.pid, c.n, (select count(*)::int from contagem c2 where c2.n = (select n from topo))
  from contagem c
  where c.n = (select n from topo);
$$;

-- ---------- 6. FECHAR O QUE O PRAZO EXPIROU ----------
-- Idempotente e barata: sem votações expiradas não escreve nada.
--
-- CLOSED quando há quórum e um único líder de cada lado. Caso contrário
-- REVIEW — e aí é o admin que decide, com todos os números à frente.
create or replace function fechar_votacao(p_match uuid, p_forcar boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_quorum int; v_pct int; v_votantes int; v_total int;
  v_craque uuid; v_bagre uuid;
  v_craque_emp int; v_bagre_emp int;
  v_over_craque uuid; v_over_bagre uuid;
  v_estado text;
begin
  select m.voting_quorum_pct, m.craque_override, m.bagre_override
    into v_quorum, v_over_craque, v_over_bagre
  from matches m where m.id = p_match;
  if v_quorum is null then return null; end if;

  select p.votantes, p.total, p.pct into v_votantes, v_total, v_pct
  from participacao_da_votacao(p_match) p;

  select l.player_id, l.empatados into v_craque, v_craque_emp
  from lider_do_premio(p_match, 'CRAQUE') l limit 1;
  select l.player_id, l.empatados into v_bagre, v_bagre_emp
  from lider_do_premio(p_match, 'BAGRE') l limit 1;

  -- O override do admin manda: quando existe, não há empate que resolver.
  if v_over_craque is not null then v_craque := v_over_craque; v_craque_emp := 1; end if;
  if v_over_bagre  is not null then v_bagre  := v_over_bagre;  v_bagre_emp  := 1; end if;

  v_estado := case
    when p_forcar then 'CLOSED'
    when v_total = 0 then 'REVIEW'
    when coalesce(v_pct, 0) < v_quorum then 'REVIEW'
    when v_craque is null or v_bagre is null then 'REVIEW'
    when coalesce(v_craque_emp, 0) > 1 or coalesce(v_bagre_emp, 0) > 1 then 'REVIEW'
    else 'CLOSED'
  end;

  update matches set
    voting_status    = v_estado,
    voting_closed_at = case when v_estado = 'CLOSED' then now() else voting_closed_at end,
    craque_final     = case when v_estado = 'CLOSED' then v_craque else craque_final end,
    bagre_final      = case when v_estado = 'CLOSED' then v_bagre  else bagre_final  end
  where id = p_match;

  perform registar_atividade(p_match,
    case when v_estado = 'CLOSED' then 'VOTACAO_FECHADA' else 'VOTACAO_EM_REVISAO' end,
    jsonb_build_object('votantes', v_votantes, 'total', v_total, 'pct', v_pct,
                       'quorum', v_quorum));

  return v_estado;
end; $$;

create or replace function fechar_votacoes_expiradas()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_n int := 0;
begin
  for r in
    select m.id from matches m
    where m.voting_status = 'OPEN'
      and m.voting_deadline is not null
      and m.voting_deadline <= now()
  loop
    perform fechar_votacao(r.id, false);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

-- ---------- 7. ENCERRAR O JOGO NUM PASSO SÓ ----------
-- Era isto: preencher o resultado → guardar rascunho → publicar → ir à
-- secção da avaliação → abrir. Cinco passos para uma decisão só ("o jogo
-- acabou"), e a votação de craque/bagre nem interruptor tinha.
--
-- Devolve já o que o admin precisa para partilhar: o prazo e a votação
-- abertos, para o ecrã montar a mensagem e o link sem outra chamada.
create or replace function admin_close_game(
  p_pw text, p_match uuid,
  p_score_a int, p_score_b int,
  p_stats jsonb, p_gk_stats jsonb,
  p_notes text, p_resenha text default null,
  p_deadline timestamptz default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_result text; v_versao int; v_kickoff timestamptz; v_prazo timestamptz;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.result_status, m.overall_version, m.kickoff_at
    into v_result, v_versao, v_kickoff
  from matches m where m.id = p_match;
  if v_result is null then raise exception 'INVALIDO'; end if;

  -- O resultado primeiro (valida placar, estatísticas e elegibilidade),
  -- a publicação a seguir. Se alguma falhar, a transação leva tudo atrás —
  -- é essa a diferença face a fazer os dois passos à mão.
  perform admin_save_result(p_pw, p_match, p_score_a, p_score_b,
                            p_stats, p_gk_stats, p_notes, null, null);

  if v_result <> 'PUBLISHED' then
    perform admin_publish_result(p_pw, p_match, p_resenha);
  end if;

  -- Jogos da versão 1 não abrem votação nenhuma (a 0023 garante que o
  -- passado não se reavalia) — o jogo fecha na mesma, só sem cédula.
  if v_versao = 2 then
    v_prazo := coalesce(p_deadline, prazo_de_votacao(v_kickoff));
    update matches set
      voting_status    = 'OPEN',
      voting_deadline  = v_prazo,
      voting_closed_at = null,
      craque_final     = null,
      bagre_final      = null
    where id = p_match;
    perform registar_atividade(p_match, 'VOTACAO_ABERTA',
      jsonb_build_object('prazo', v_prazo, 'via', 'encerrar_jogo'));
  end if;

  return match_admin_json(p_match);
end; $$;

-- ---------- 8. O ADMIN MEXE NO PRAZO E NO ESTADO ----------
create or replace function admin_set_voting(
  p_pw text, p_match uuid, p_status text default null,
  p_deadline timestamptz default null, p_quorum int default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_versao int; v_result text; v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.overall_version, m.result_status, m.status
    into v_versao, v_result, v_status
  from matches m where m.id = p_match;
  if v_versao is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_result <> 'PUBLISHED' then raise exception 'SEMRESULTADO'; end if;
  -- Sem guarda de versão: reabrir uma rodada antiga é legítimo (só o
  -- craque/bagre é que volta a aceitar votos — as estrelas continuam
  -- fechadas ao passado por `submit_round_vote`).

  if p_status is not null and p_status not in ('OPEN','REVIEW','CLOSED') then
    raise exception 'INVALIDO';
  end if;

  update matches set
    voting_quorum_pct = coalesce(p_quorum, voting_quorum_pct),
    voting_deadline   = coalesce(p_deadline, voting_deadline),
    voting_status     = coalesce(p_status, voting_status),
    -- reabrir limpa o fecho: senão o jogo dizia "fechada a 12/08" com a
    -- votação a aceitar votos
    voting_closed_at  = case when coalesce(p_status, voting_status) = 'OPEN' then null else voting_closed_at end
  where id = p_match;

  if p_status = 'OPEN' then
    perform registar_atividade(p_match, 'VOTACAO_ABERTA', jsonb_build_object('via', 'admin'));
  elsif p_status is not null then
    perform registar_atividade(p_match, 'VOTACAO_FECHADA', jsonb_build_object('via', 'admin'));
  end if;

  return match_admin_json(p_match);
end; $$;

-- ---------- 9. REVISÃO DO ADMIN ----------
-- Tudo o que ele precisa para desempatar: contagens, participação e quem
-- ainda não votou.
--
-- ANONIMATO: as estrelas saem SÓ como média por jogador — nem aqui se vê
-- quem deu que nota, porque foi isso que se prometeu a quem vota
-- (src/components/PostMatchRating.jsx). O craque/bagre, esse, tem o
-- votante identificado desde a 0002 e continua a tê-lo: são regras
-- diferentes e o ecrã do admin diz qual é qual.
create or replace function admin_voting_review(p_pw text, p_match uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_json json;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select json_build_object(
    'match_id', m.id,
    'voting_status', m.voting_status,
    'voting_deadline', m.voting_deadline,
    'quorum_pct', m.voting_quorum_pct,
    'participacao', (select row_to_json(p) from participacao_da_votacao(p_match) p),
    'craque', (
      select coalesce(json_agg(json_build_object(
               'player_id', t.pid, 'name', pl.name, 'photo', pl.photo_url, 'votes', t.n)
             order by t.n desc, pl.name), '[]'::json)
      from (select av.craque_id as pid, count(*)::int as n
              from award_votes av where av.match_id = p_match group by av.craque_id) t
      join players pl on pl.id = t.pid),
    'bagre', (
      select coalesce(json_agg(json_build_object(
               'player_id', t.pid, 'name', pl.name, 'photo', pl.photo_url, 'votes', t.n)
             order by t.n desc, pl.name), '[]'::json)
      from (select av.bagre_id as pid, count(*)::int as n
              from award_votes av where av.match_id = p_match group by av.bagre_id) t
      join players pl on pl.id = t.pid),
    -- só médias: quem deu que estrela não sai daqui, nem para o admin
    'estrelas', (
      select coalesce(json_agg(json_build_object(
               'player_id', t.pid, 'name', pl.name, 'photo', pl.photo_url,
               'avg', t.media, 'votes', t.n)
             order by t.media desc, pl.name), '[]'::json)
      from (select pr.target_id as pid, round(avg(pr.stars)::numeric, 2) as media, count(*)::int as n
              from post_match_ratings pr where pr.match_id = p_match group by pr.target_id) t
      join players pl on pl.id = t.pid),
    'faltam', (
      select coalesce(json_agg(json_build_object(
               'player_id', pl.id, 'name', pl.name, 'photo', pl.photo_url)
             order by pl.name), '[]'::json)
      from (select distinct pj.player_id from participantes_do_jogo pj where pj.match_id = p_match) j
      join players pl on pl.id = j.player_id
      where not exists (select 1 from award_votes av
                         where av.match_id = p_match and av.voter_id = j.player_id)
        and not exists (select 1 from post_match_ratings pr
                         where pr.match_id = p_match and pr.rater_id = j.player_id))
  ) into v_json
  from matches m where m.id = p_match;

  if v_json is null then raise exception 'INVALIDO'; end if;
  return v_json;
end; $$;

-- O admin confirma o resultado final da votação. `p_craque`/`p_bagre`
-- nulos = aceitar quem a votação elegeu.
create or replace function admin_finalize_voting(
  p_pw text, p_match uuid, p_craque uuid default null, p_bagre uuid default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.voting_status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if p_craque is not null and p_craque = p_bagre then raise exception 'IGUAL'; end if;

  -- A escolha do admin obedece à MESMA régua da votação: não se corrige à
  -- mão o que a votação proíbe (craque tem de estar entre os vencedores).
  if p_craque is not null
     and not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = p_craque) then
    raise exception 'CRAQUEPERDEDOR';
  end if;
  if p_bagre is not null
     and not exists (select 1 from elegiveis_premio(p_match, 'BAGRE') e where e.player_id = p_bagre) then
    raise exception 'BAGREVENCEDOR';
  end if;

  if p_craque is not null or p_bagre is not null then
    update matches set
      craque_override = coalesce(p_craque, craque_override),
      bagre_override  = coalesce(p_bagre,  bagre_override)
    where id = p_match;
  end if;

  -- `forcar` porque é exatamente isso que o admin está a fazer: fechar
  -- apesar de faltar quórum ou de haver empate.
  perform fechar_votacao(p_match, true);
  return match_admin_json(p_match);
end; $$;

-- ---------- 10. A CÉDULA, NUMA CHAMADA ----------
-- Tudo o que o ecrã de votação precisa. `p_pin` OU `p_token` — o token
-- vem do "lembrar-me neste telemóvel" e evita pedir o PIN outra vez.
create or replace function autenticar_votante(p_voter uuid, p_pin text, p_token uuid)
returns uuid language plpgsql stable security definer set search_path = public, extensions as $$
declare r players; v_id uuid;
begin
  if p_token is not null then
    select d.player_id into v_id
    from player_devices d
    where d.token = p_token and d.revoked_at is null and d.expires_at > now();
    if v_id is null then raise exception 'TOKENINVALIDO'; end if;
    -- o token identifica quem é; um p_voter diferente é um pedido mal
    -- formado, não uma sessão válida
    if p_voter is not null and p_voter <> v_id then raise exception 'TOKENINVALIDO'; end if;
  else
    select * into r from players where id = p_voter;
    if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
      raise exception 'CRED';
    end if;
    if not r.approved then raise exception 'PENDENTE'; end if;
    v_id := r.id;
  end if;
  return v_id;
end; $$;

create or replace function get_round_ballot(
  p_voter uuid, p_pin text, p_match uuid, p_token uuid default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; m matches%rowtype; v_equipa text; v_json json;
begin
  perform fechar_votacoes_expiradas();
  v_id := autenticar_votante(p_voter, p_pin, p_token);

  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'INVALIDO'; end if;
  if m.status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if m.result_status <> 'PUBLISHED' then raise exception 'SEMRESULTADO'; end if;

  select j.team into v_equipa from jogadores_do_jogo(p_match) j where j.player_id = v_id;

  select json_build_object(
    'match_id', m.id,
    'played_at', m.played_at,
    'kickoff_at', m.kickoff_at,
    'team_a_name', m.team_a_name,
    'team_b_name', m.team_b_name,
    'score_a', m.score_a,
    'score_b', m.score_b,
    'voting_status', m.voting_status,
    'voting_deadline', m.voting_deadline,
    'overall_version', m.overall_version,
    'me', json_build_object('player_id', v_id, 'team', v_equipa,
                            'jogou', v_equipa is not null
                                     or exists (select 1 from jogadores_do_jogo(p_match) j
                                                 where j.player_id = v_id)),
    -- companheiros de equipa, com a nota que já lhes dei
    'teammates', case when v_equipa is null then '[]'::json else (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url,
               'stars', (select pr.stars from post_match_ratings pr
                          where pr.match_id = m.id and pr.rater_id = v_id and pr.target_id = p.id))
             order by p.name), '[]'::json)
      from participantes_do_jogo pj
      join players p on p.id = pj.player_id
      where pj.match_id = m.id and pj.team = v_equipa and pj.player_id <> v_id) end,
    'craque_candidates', (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url) order by p.name), '[]'::json)
      from elegiveis_premio(m.id, 'CRAQUE') e
      join players p on p.id = e.player_id
      where e.player_id <> v_id),
    'bagre_candidates', (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url) order by p.name), '[]'::json)
      from elegiveis_premio(m.id, 'BAGRE') e
      join players p on p.id = e.player_id
      where e.player_id <> v_id),
    'already_voted_award', exists (select 1 from award_votes av
                                    where av.match_id = m.id and av.voter_id = v_id),
    'participacao', (select row_to_json(pp) from participacao_da_votacao(m.id) pp)
  ) into v_json;

  return v_json;
end; $$;

-- ---------- 11. UM ENVIO SÓ ----------
-- Estrelas + craque + bagre na mesma transação. Tudo é opcional: dar só
-- estrelas, só o craque/bagre, ou tudo. Quem sai a meio não perde o que
-- já fez, e quem já votou no prémio pode voltar para acabar as estrelas.
create or replace function submit_round_vote(
  p_voter uuid, p_pin text, p_match uuid,
  p_craque uuid default null, p_bagre uuid default null,
  p_ratings jsonb default null, p_token uuid default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid; m matches%rowtype;
  v_equipa text; r_row record; v_alvo uuid; v_estrelas int;
  v_notas int := 0; v_premio boolean := false;
begin
  perform fechar_votacoes_expiradas();
  v_id := autenticar_votante(p_voter, p_pin, p_token);

  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'INVALIDO'; end if;
  if m.status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if m.result_status <> 'PUBLISHED' then raise exception 'SEMRESULTADO'; end if;
  -- a versão só é exigida no ramo das ESTRELAS, lá em baixo: o craque e o
  -- bagre existem desde a 0002 e uma rodada antiga reaberta pelo admin
  -- continua a poder ser votada
  if m.voting_status = 'REVIEW' then raise exception 'VOTACAOREVISAO'; end if;
  if m.voting_status <> 'OPEN' then raise exception 'PRAZOVOTACAO'; end if;
  -- o relógio que manda é o do servidor; o contador do ecrã é decoração
  if m.voting_deadline is not null and now() > m.voting_deadline then
    raise exception 'PRAZOVOTACAO';
  end if;

  select j.team into v_equipa from jogadores_do_jogo(p_match) j where j.player_id = v_id;
  if not found then raise exception 'NAOJOGOU'; end if;

  -- ---- craque e bagre ----
  if p_craque is not null or p_bagre is not null then
    if p_craque is null or p_bagre is null then raise exception 'INVALIDO'; end if;
    if p_craque = v_id or p_bagre = v_id then raise exception 'PROPRIO'; end if;
    if p_craque = p_bagre then raise exception 'IGUAL'; end if;
    if not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = p_craque) then
      raise exception 'CRAQUEPERDEDOR';
    end if;
    if not exists (select 1 from elegiveis_premio(p_match, 'BAGRE') e where e.player_id = p_bagre) then
      raise exception 'BAGREVENCEDOR';
    end if;
    if exists (select 1 from award_votes where match_id = p_match and voter_id = v_id) then
      raise exception 'VOTOFEITO';
    end if;
    insert into award_votes(match_id, voter_id, craque_id, bagre_id)
    values (p_match, v_id, p_craque, p_bagre);
    v_premio := true;
  end if;

  -- ---- estrelas ----
  if p_ratings is not null and jsonb_typeof(p_ratings) = 'array' and jsonb_array_length(p_ratings) > 0 then
    -- a avaliação pós-jogo só existe na versão 2 (0023): o passado não se
    -- reavalia, nem por esta porta
    if m.overall_version <> 2 then raise exception 'VERSAOANTIGA'; end if;
    if v_equipa is null then raise exception 'SEMEQUIPAS'; end if;
    for r_row in select value from jsonb_array_elements(p_ratings) loop
      v_alvo := (r_row.value->>'player_id')::uuid;
      -- só inteiros: "3.5" rebentava no cast com um erro cru do Postgres,
      -- que a app mostrava como "erro de ligação"
      if (r_row.value->>'stars') is null or (r_row.value->>'stars') !~ '^\d+$' then
        raise exception 'ESTRELAS';
      end if;
      v_estrelas := (r_row.value->>'stars')::int;
      if v_estrelas < 0 or v_estrelas > 5 then raise exception 'ESTRELAS'; end if;
      if v_alvo is null or v_alvo = v_id then raise exception 'PROPRIO'; end if;
      if not exists (select 1 from jogadores_do_jogo(p_match) j
                      where j.player_id = v_alvo and j.team = v_equipa) then
        raise exception 'SEMCOMPANHEIRO';
      end if;

      insert into post_match_ratings(match_id, rater_id, target_id, stars)
      values (p_match, v_id, v_alvo, v_estrelas)
      on conflict (match_id, rater_id, target_id)
      do update set stars = excluded.stars, updated_at = now();
      v_notas := v_notas + 1;
    end loop;
  end if;

  return json_build_object(
    'match_id', p_match, 'premio', v_premio, 'avaliados', v_notas,
    'participacao', (select row_to_json(pp) from participacao_da_votacao(p_match) pp));
end; $$;

-- ---------- 12. O QUE ESTÁ ABERTO PARA MIM ----------
-- Alimenta a faixa de lembrete: as rodadas em que joguei, com votação
-- aberta, e o que me falta em cada uma.
create or replace function get_my_open_votes(p_voter uuid, p_pin text, p_token uuid default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform fechar_votacoes_expiradas();
  v_id := autenticar_votante(p_voter, p_pin, p_token);

  return (
    select coalesce(json_agg(json_build_object(
             'match_id', x.id,
             'played_at', x.played_at,
             'team_a_name', x.team_a_name, 'team_b_name', x.team_b_name,
             'score_a', x.score_a, 'score_b', x.score_b,
             'deadline', x.voting_deadline,
             'falta_premio', not exists (select 1 from award_votes av
                                          where av.match_id = x.id and av.voter_id = v_id),
             'falta_estrelas', (
               select count(*) from participantes_do_jogo pj
               where pj.match_id = x.id and pj.team = x.equipa and pj.player_id <> v_id
                 and not exists (select 1 from post_match_ratings pr
                                  where pr.match_id = x.id and pr.rater_id = v_id
                                    and pr.target_id = pj.player_id)))
           order by x.voting_deadline), '[]'::json)
    from (
      select m.id, m.played_at, m.team_a_name, m.team_b_name, m.score_a, m.score_b,
             m.voting_deadline,
             (select pj.team from participantes_do_jogo pj
               where pj.match_id = m.id and pj.player_id = v_id) as equipa
      from matches m
      where m.voting_status = 'OPEN'
        and m.overall_version = 2
        and exists (select 1 from participantes_do_jogo pj
                     where pj.match_id = m.id and pj.player_id = v_id)
    ) x
  );
end; $$;

-- ---------- 13. SESSÃO POR DISPOSITIVO ----------
-- Guarda um token, NUNCA o PIN. O token autoriza LER e VOTAR — trocar
-- PIN, trocar foto e entrar no admin continuam a exigir o PIN escrito
-- (as funções que os fazem validam o PIN elas próprias e não conhecem
-- tokens). Um telemóvel emprestado fica em "votou por ti", não em
-- "mudou-te a conta".
create table if not exists player_devices (
  token        uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '180 days',
  revoked_at   timestamptz
);

alter table player_devices enable row level security;
create index if not exists player_devices_player_idx on player_devices (player_id);

create or replace function issue_device_token(p_id uuid, p_pin text, p_label text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_token uuid;
begin
  select * into r from players where id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  -- Um telemóvel, um token: sem isto, cada entrada deixava um token vivo
  -- para trás e "sair deste telemóvel" não chegava para fechar a porta.
  delete from player_devices d
   where d.player_id = p_id and d.label is not distinct from nullif(btrim(p_label), '');

  insert into player_devices(player_id, label)
  values (p_id, nullif(btrim(p_label), ''))
  returning token into v_token;
  return v_token;
end; $$;

create or replace function login_with_device(p_token uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_id uuid; v_pending int;
begin
  select d.player_id into v_id
  from player_devices d
  where d.token = p_token and d.revoked_at is null and d.expires_at > now();
  if v_id is null then raise exception 'TOKENINVALIDO'; end if;

  select * into r from players where id = v_id;
  if r.id is null or not r.approved then raise exception 'TOKENINVALIDO'; end if;

  update player_devices set last_seen_at = now() where token = p_token;

  select count(*) into v_pending
    from players p
    where p.approved and p.id <> r.id
      and not exists (select 1 from ratings rt where rt.rater_id = r.id and rt.target_id = p.id);

  -- `is_admin` fica de FORA de propósito: a área de admin tem senha
  -- própria e não é isto que a abre.
  return json_build_object(
    'id', r.id, 'name', r.name, 'user_id', r.user_id,
    'is_admin', false, 'voted', v_pending = 0,
    'player_type', r.player_type,
    'primary_position', r.primary_position,
    'secondary_position', r.secondary_position,
    'accepts_other_positions', r.accepts_other_positions,
    'position_status', r.position_status,
    'position_notice', null,
    'device', true
  );
end; $$;

create or replace function revoke_device(p_token uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  -- Não pede PIN: quem tem o token é quem está a sair do próprio telemóvel,
  -- e obrigar ao PIN para SAIR é a forma mais rápida de ninguém sair.
  update player_devices set revoked_at = now() where token = p_token and revoked_at is null;
end; $$;

create or replace function admin_revoke_devices(p_pw text, p_id uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_n int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update player_devices set revoked_at = now() where player_id = p_id and revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

-- ---------- 14. O FECHO PREGUIÇOSO ENTRA NAS LEITURAS ----------
-- `get_matches` e `get_next_match` são chamadas em cada visita: é aí que o
-- estado converge, sem pg_cron e sem infraestrutura nova.
create or replace function get_matches()
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  perform fechar_votacoes_expiradas();
  return (
    select coalesce(json_agg(match_json(m.id, false) order by m.played_at desc, m.created_at desc), '[]'::json)
    from matches_validas m
  );
end; $$;

-- ---------- 14a. O JSON DO JOGO PARA O ADMIN ----------
-- `match_public_json` já tem 200 linhas e foi recopiado de migração em
-- migração (0016 → 0020 → 0023 → 0024). Uma quarta cópia só para lhe
-- juntar seis chaves era a garantia de as versões divergirem.
--
-- Em vez disso, um envelope: o mesmo JSON de sempre MAIS o estado da
-- votação. Quem lê é o painel do admin — os ecrãs públicos continuam a
-- chamar `match_public_json` e não passam a ver contagens de votos.
create or replace function match_admin_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select (
    match_public_json(p_id)::jsonb || jsonb_build_object(
      'voting_status',     m.voting_status,
      'voting_deadline',   m.voting_deadline,
      'voting_closed_at',  m.voting_closed_at,
      'voting_quorum_pct', m.voting_quorum_pct,
      'craque_final',      m.craque_final,
      'bagre_final',       m.bagre_final,
      'voting_voters',     (select p.votantes from participacao_da_votacao(p_id) p),
      'voting_total',      (select p.total    from participacao_da_votacao(p_id) p),
      'voting_pct',        (select p.pct      from participacao_da_votacao(p_id) p)
    )
  )::json
  from matches m where m.id = p_id;
$$;

-- Um jogo COMPLETED com o resultado publicado saía da agenda do admin —
-- e é precisamente esse que tem a votação a decorrer. Sem isto, o painel
-- de votação existia e o admin não tinha por onde lá chegar.
create or replace function admin_matches_upcoming(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  perform fechar_votacoes_expiradas();
  return (
    select coalesce(json_agg(match_admin_json(t.id) order by t.quando desc, t.created_at desc), '[]'::json)
    from (
      select m.id,
             coalesce(m.kickoff_at, m.played_at::timestamp at time zone 'Europe/Lisbon') as quando,
             m.created_at
      from matches m
      where m.status in ('DRAFT','PUBLISHED','IN_PROGRESS')
         or (m.status = 'COMPLETED' and m.result_status <> 'PUBLISHED')
         or (m.status = 'CANCELLED' and m.cancelled_at > now() - interval '30 days')
         or m.voting_status in ('OPEN','REVIEW')
    ) t
  );
end; $$;

-- ---------- 14b. AS RPC ANTIGAS TAMBÉM RESPEITAM O PRAZO ----------
-- `vote_award` e `submit_post_match_ratings` (0023) continuam concedidas
-- e continuam a funcionar — mas deixam de ser uma porta lateral para
-- votar depois de a votação ter fechado.
create or replace function vote_award(p_voter uuid, p_pin text, p_match uuid, p_craque uuid, p_bagre uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform submit_round_vote(p_voter, p_pin, p_match, p_craque, p_bagre, null, null);
end; $$;

create or replace function submit_post_match_ratings(
  p_voter uuid, p_pin text, p_match uuid, p_ratings jsonb
) returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  return submit_round_vote(p_voter, p_pin, p_match, null, null, p_ratings, null);
end; $$;

-- `get_my_post_ratings` (0023) lia `post_rating_status`, que agora é um
-- espelho de `voting_status`. Passa a ler a fonte, e a trazer o prazo.
create or replace function get_my_post_ratings(p_voter uuid, p_pin text)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players where id = p_voter;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;

  return (
    select coalesce(json_agg(json_build_object(
             'match_id',    x.id,
             'played_at',   x.played_at,
             'kickoff_at',  x.kickoff_at,
             'deadline',    x.voting_deadline,
             'team',        x.equipa,
             'team_a_name', x.team_a_name,
             'team_b_name', x.team_b_name,
             'score_a',     x.score_a,
             'score_b',     x.score_b,
             'teammates', (
               select coalesce(json_agg(json_build_object(
                        'player_id', p.id, 'name', p.name, 'photo', p.photo_url,
                        'stars', (select pr.stars from post_match_ratings pr
                                   where pr.match_id = x.id and pr.rater_id = p_voter
                                     and pr.target_id = p.id))
                      order by p.name), '[]'::json)
               from participantes_do_jogo pj
               join players p on p.id = pj.player_id
               where pj.match_id = x.id and pj.team = x.equipa and pj.player_id <> p_voter))
           order by x.played_at desc, x.created_at desc), '[]'::json)
    from (
      select m.id, m.played_at, m.created_at, m.kickoff_at, m.voting_deadline,
             m.team_a_name, m.team_b_name, m.score_a, m.score_b,
             (select pj.team from participantes_do_jogo pj
               where pj.match_id = m.id and pj.player_id = p_voter) as equipa
      from matches_validas m
      where m.overall_version = 2
        and m.voting_status = 'OPEN'
        and exists (select 1 from participantes_do_jogo pj
                     where pj.match_id = m.id and pj.player_id = p_voter)
    ) x
    where x.equipa is not null
  );
end; $$;

-- ---------- 15. O QUÓRUM ENTRA NOS PRÉMIOS ----------
-- Uma rodada onde votaram 3 de 14 não pode valer o mesmo que uma com 12.
-- A partir daqui só contam para craque/bagre as rodadas FECHADAS — e o
-- vencedor é o congelado no fecho, não um recálculo a cada leitura.
create or replace view premios_da_rodada as
  select m.id as match_id, m.played_at, m.craque_final, m.bagre_final
  from matches_validas m
  where m.voting_status = 'CLOSED';

create or replace function get_player_stats()
returns json language sql security definer set search_path = public, extensions as $$
  with validas as (select id from matches_validas),
  -- Rodadas anteriores à 0025 não têm `craque_final` gravado: para essas
  -- vale o cálculo de sempre (contagem de votos + override), senão a
  -- história desaparecia toda no dia do deploy.
  legado as (
    select mv.id as match_id, mv.craque_override, mv.bagre_override
    from matches_validas mv
    where mv.voting_status <> 'CLOSED' or (mv.craque_final is null and mv.bagre_final is null)
  ),
  craque_t as (
    select av.match_id, coalesce(l.craque_override, av.craque_id) as player_id, count(*) as n
    from award_votes av join legado l on l.match_id = av.match_id
    group by av.match_id, coalesce(l.craque_override, av.craque_id)
  ), craque_w as (
    select player_id, count(distinct match_id) as wins from (
      select t.match_id, t.player_id from craque_t t
      where t.n = (select max(n) from craque_t t2 where t2.match_id = t.match_id)
      union
      select l.match_id, l.craque_override from legado l
      where l.craque_override is not null
        and not exists (select 1 from award_votes av where av.match_id = l.match_id)
      union
      select pr.match_id, pr.craque_final from premios_da_rodada pr where pr.craque_final is not null
    ) w group by player_id
  ), bagre_t as (
    select av.match_id, coalesce(l.bagre_override, av.bagre_id) as player_id, count(*) as n
    from award_votes av join legado l on l.match_id = av.match_id
    group by av.match_id, coalesce(l.bagre_override, av.bagre_id)
  ), bagre_w as (
    select player_id, count(distinct match_id) as wins from (
      select t.match_id, t.player_id from bagre_t t
      where t.n = (select max(n) from bagre_t t2 where t2.match_id = t.match_id)
      union
      select l.match_id, l.bagre_override from legado l
      where l.bagre_override is not null
        and not exists (select 1 from award_votes av where av.match_id = l.match_id)
      union
      select pr.match_id, pr.bagre_final from premios_da_rodada pr where pr.bagre_final is not null
    ) w group by player_id
  ), totals as (
    select ms.player_id, count(*) as matches, sum(ms.goals) as goals, sum(ms.assists) as assists
    from match_stats ms
    where ms.match_id in (select id from validas)
    group by ms.player_id
  ), pos as (
    select pr.target_id as player_id,
           round(avg(pr.stars)::numeric, 2) as media,
           count(*)::int                    as n
    from post_ratings_validas pr
    group by pr.target_id
  )
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'name', p.name, 'photo', p.photo_url,
           'matches', coalesce(t.matches, 0),
           'goals',   coalesce(t.goals, 0),
           'assists', coalesce(t.assists, 0),
           'craques', coalesce(cw.wins, 0),
           'bagres',  coalesce(bw.wins, 0),
           'post_rating_avg',   ps.media,
           'post_rating_count', coalesce(ps.n, 0))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t    on t.player_id  = p.id
  left join craque_w cw on cw.player_id = p.id
  left join bagre_w bw  on bw.player_id = p.id
  left join pos ps      on ps.player_id = p.id
  where p.approved;
$$;

-- ---------- PERMISSÕES ----------
revoke select on premios_da_rodada from public, anon, authenticated;
revoke execute on function fechar_votacao(uuid, boolean)            from public, anon, authenticated;
revoke execute on function fechar_votacoes_expiradas()              from public, anon, authenticated;
revoke execute on function participacao_da_votacao(uuid)            from public, anon, authenticated;
revoke execute on function lider_do_premio(uuid, text)              from public, anon, authenticated;
revoke execute on function autenticar_votante(uuid, text, uuid)     from public, anon, authenticated;
revoke execute on function sincronizar_post_rating_status()         from public, anon, authenticated;

revoke execute on function match_admin_json(uuid)                   from public, anon, authenticated;

grant execute on function prazo_de_votacao(timestamptz, int)        to anon, authenticated;
grant execute on function get_round_ballot(uuid, text, uuid, uuid)  to anon, authenticated;
grant execute on function submit_round_vote(uuid, text, uuid, uuid, uuid, jsonb, uuid) to anon, authenticated;
grant execute on function get_my_open_votes(uuid, text, uuid)       to anon, authenticated;
grant execute on function issue_device_token(uuid, text, text)      to anon, authenticated;
grant execute on function login_with_device(uuid)                   to anon, authenticated;
grant execute on function revoke_device(uuid)                       to anon, authenticated;
grant execute on function admin_revoke_devices(text, uuid)          to anon, authenticated;
grant execute on function admin_close_game(text, uuid, int, int, jsonb, jsonb, text, text, timestamptz)
  to anon, authenticated;
grant execute on function admin_set_voting(text, uuid, text, timestamptz, int) to anon, authenticated;
grant execute on function admin_voting_review(text, uuid)           to anon, authenticated;
grant execute on function admin_finalize_voting(text, uuid, uuid, uuid) to anon, authenticated;
grant execute on function get_matches()                             to anon, authenticated;
grant execute on function get_player_stats()                        to anon, authenticated;
