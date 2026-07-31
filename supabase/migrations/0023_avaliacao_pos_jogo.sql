-- =====================================================================
--  PELADA BROWNS — Migração 23: avaliação pós-jogo, overall v2 e
--  candidatos de craque/bagre por resultado
--
--  Três mudanças que andam juntas:
--
--    1. VERSÃO DA FÓRMULA. `matches.overall_version` separa o passado do
--       futuro. Tudo o que já foi jogado fica na versão 1 e NUNCA é
--       recalculado; os jogos por jogar (e os que vierem) nascem na 2.
--       Enquanto um jogador não tiver uma avaliação pós-jogo válida na
--       versão 2, o overall dele continua a ser calculado como hoje —
--       por isso nenhum número muda no dia do deploy. Quem fecha essa
--       porta é o frontend (src/lib/overall.js), que só passa a v2
--       quando `post_rating_count > 0`; aqui garante-se que esse contador
--       só pode crescer com avaliações de jogos da versão 2.
--
--    2. AVALIAÇÃO PÓS-JOGO. Depois de o admin publicar o resultado abre
--       uma votação em que cada jogador dá 0 a 5 estrelas aos COMPANHEIROS
--       DE EQUIPA daquele jogo. Serve para reconhecer quem jogou bem sem
--       marcar: zagueiro que fechou, quem recuperou bolas, quem organizou,
--       goleiro que defendeu. Guarda-se quem votou (para impedir voto
--       duplo e permitir corrigir), mas para fora só sai a MÉDIA.
--
--    3. CANDIDATOS DE CRAQUE E BAGRE. Craque só entre os vencedores,
--       bagre só entre os derrotados. Num EMPATE não há vencedor nem
--       derrotado: aí vale toda a gente que jogou, como até aqui (decisão
--       do grupo). A regra é validada no servidor — a UI só a espelha.
--
--  Aditiva e idempotente: colunas novas com default, tabela nova, e o
--  único UPDATE de dados é o que marca como versão 2 os jogos que ainda
--  não têm resultado publicado.
--
--  Códigos de erro novos: VOTACAOFECHADA, CRAQUEPERDEDOR, BAGREVENCEDOR,
--  VERSAOANTIGA, AVFECHADA, ESTRELAS, SEMCOMPANHEIRO, SEMEQUIPAS.
-- =====================================================================

-- ---------- 1. COLUNAS NOVAS EM matches ----------

-- O default é 1 DE PROPÓSITO: as linhas que já existem herdam-no no
-- próprio ADD COLUMN, sem UPDATE nenhum, e ficam para sempre na fórmula
-- antiga. Só depois é que o default passa a 2, para os jogos futuros.
-- Correr isto duas vezes não estraga nada (o ADD é no-op na segunda).
alter table matches add column if not exists overall_version int not null default 1;
alter table matches alter column overall_version set default 2;

-- Um jogo já agendado mas ainda por jogar é "partida realizada depois
-- desta versão" — entra na fórmula nova. Só os que já têm resultado
-- publicado (ou foram cancelados) é que ficam no passado.
update matches set overall_version = 2
 where overall_version = 1
   and status in ('DRAFT','PUBLISHED','IN_PROGRESS')
   and result_status <> 'PUBLISHED';

-- Estado da votação pós-jogo. CLOSED até o admin publicar o resultado
-- (a publicação abre-a sozinha) e depois de ele a encerrar.
alter table matches add column if not exists post_rating_status    text not null default 'CLOSED';
alter table matches add column if not exists post_rating_opened_at timestamptz;
alter table matches add column if not exists post_rating_closed_at timestamptz;

do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_post_rating_status_chk' and conrelid = 'public.matches'::regclass
  ) then
    alter table matches add constraint matches_post_rating_status_chk
      check (post_rating_status in ('CLOSED','OPEN'));
  end if;
end
$chk$;

-- A view foi criada na 0019 com `select m.*`: as colunas de cima ainda
-- não existiam quando ela nasceu, por isso não estão lá. Recriar acrescenta
-- as novas no fim (CREATE OR REPLACE só permite ACRESCENTAR colunas — é
-- por isso que a definição tem de ficar igual em tudo o resto).
create or replace view matches_validas as
  select m.*
  from matches m
  where m.status = 'COMPLETED'
    and m.result_status = 'PUBLISHED';

-- ---------- 2. A TABELA DAS AVALIAÇÕES ----------
-- Uma linha por (jogo, quem avalia, quem é avaliado). A chave primária é
-- a regra "um voto por companheiro" — não é uma verificação que se possa
-- esquecer numa função. `rater_id` fica guardado para impedir o voto
-- duplo e deixar o jogador corrigir a nota; nenhuma leitura pública o
-- devolve.
create table if not exists post_match_ratings (
  match_id   uuid not null references matches(id)  on delete cascade,
  rater_id   uuid not null references players(id)  on delete cascade,
  target_id  uuid not null references players(id)  on delete cascade,
  stars      int  not null check (stars between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, rater_id, target_id),
  constraint post_match_ratings_nao_proprio check (rater_id <> target_id)
);

alter table post_match_ratings enable row level security;

create index if not exists post_match_ratings_target_idx
  on post_match_ratings (target_id, match_id);

-- Só contam as avaliações de jogos válidos (resultado publicado, jogo não
-- cancelado) e da versão 2. Uma avaliação de um jogo que o admin despublique
-- deixa de contar sozinha — e volta a contar se ele o republicar.
create or replace view post_ratings_validas as
  select r.match_id, r.rater_id, r.target_id, r.stars, r.created_at,
         m.played_at
  from post_match_ratings r
  join matches_validas m on m.id = r.match_id
  where m.overall_version = 2;

-- ---------- 3. QUEM JOGOU, QUEM VENCEU, QUEM PODE SER VOTADO ----------

-- Participantes de um jogo, com a equipa. Os goleiros entram por duas
-- portas (o admin grava-os em match_stats a partir da escalação, mas a
-- tabela de baliza é a fonte que nunca falha), por isso a união exclui
-- quem já veio pela primeira — senão um goleiro aparecia duas vezes e
-- contava a dobrar nas contagens.
--
-- É uma VIEW e não só uma função por causa das leituras: uma função em
-- FROM não pode receber colunas do mesmo nível da consulta, e as funções
-- de leitura precisam de juntar participantes a vários jogos de uma vez.
create or replace view participantes_do_jogo as
  select ms.match_id, ms.player_id, ms.team
  from match_stats ms
  union all
  select g.match_id, g.goalkeeper_id, g.team
  from goalkeeper_match_stats g
  where not exists (select 1 from match_stats ms2
                     where ms2.match_id = g.match_id and ms2.player_id = g.goalkeeper_id);

-- O mesmo, para um jogo só — é a forma cómoda dentro das validações.
create or replace function jogadores_do_jogo(p_match uuid)
returns table(player_id uuid, team text)
language sql stable security definer set search_path = public, extensions as $$
  select pj.player_id, pj.team from participantes_do_jogo pj where pj.match_id = p_match;
$$;

-- 'A', 'B' ou null (empate, ou jogo ainda sem placar).
create or replace function vencedor_do_jogo(p_match uuid)
returns text
language sql stable security definer set search_path = public, extensions as $$
  select case
           when m.score_a is null or m.score_b is null then null
           when m.score_a > m.score_b then 'A'
           when m.score_b > m.score_a then 'B'
           else null
         end
  from matches m where m.id = p_match;
$$;

-- Quem pode receber votos de craque ('CRAQUE') ou de bagre ('BAGRE').
--
-- Empate ⇒ toda a gente que jogou (não há vencedor nem derrotado).
-- Rodada antiga sem equipas atribuídas ⇒ idem, senão a votação de uma
-- rodada histórica ficava sem candidatos e ninguém percebia porquê.
--
-- Exige gente dos DOIS lados antes de filtrar: com um deles vazio, uma das
-- listas ficava sem ninguém. É a mesma régua de `src/lib/awards.js` — as
-- duas têm de concordar, senão a UI oferece um candidato que isto recusa.
create or replace function elegiveis_premio(p_match uuid, p_tipo text)
returns table(player_id uuid)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_vencedor text; v_lado text; v_a int; v_b int;
begin
  v_vencedor := vencedor_do_jogo(p_match);

  select count(*) filter (where j.team = 'A'),
         count(*) filter (where j.team = 'B')
    into v_a, v_b
  from jogadores_do_jogo(p_match) j;

  if v_vencedor is null or v_a = 0 or v_b = 0 then
    return query select j.player_id from jogadores_do_jogo(p_match) j;
    return;
  end if;

  v_lado := case
              when p_tipo = 'CRAQUE' then v_vencedor
              when v_vencedor = 'A'  then 'B'
              else 'A'
            end;

  return query select j.player_id from jogadores_do_jogo(p_match) j where j.team = v_lado;
end; $$;

-- ---------- 4. VOTAR NO CRAQUE E NO BAGRE (0002 → aqui) ----------
-- Corpo da 0002 + três guardas novas: o jogo tem de ter resultado
-- publicado (antes disso não há vencedor definido, logo não há candidatos),
-- o craque tem de estar entre os vencedores e o bagre entre os derrotados.
create or replace function vote_award(p_voter uuid, p_pin text, p_match uuid, p_craque uuid, p_bagre uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players where id = p_voter;
  -- p_pin is null: crypt() é STRICT e devolveria NULL, e um IF com condição
  -- NULL não dispara — sem este guard o PIN seria contornável com pin nulo
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  -- a votação vive do resultado: sem ele publicado não há vencedor, e sem
  -- vencedor não há lista de candidatos que se possa defender
  if not exists (select 1 from matches_validas mv where mv.id = p_match) then
    raise exception 'VOTACAOFECHADA';
  end if;

  if not exists (select 1 from jogadores_do_jogo(p_match) j where j.player_id = p_voter) then
    raise exception 'NAOJOGOU';
  end if;
  if p_craque = p_voter or p_bagre = p_voter then raise exception 'PROPRIO'; end if;
  if p_craque = p_bagre then raise exception 'IGUAL'; end if;
  if not exists (select 1 from jogadores_do_jogo(p_match) j where j.player_id = p_craque)
     or not exists (select 1 from jogadores_do_jogo(p_match) j where j.player_id = p_bagre) then
    raise exception 'INVALIDO';
  end if;

  if not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = p_craque) then
    raise exception 'CRAQUEPERDEDOR';
  end if;
  if not exists (select 1 from elegiveis_premio(p_match, 'BAGRE') e where e.player_id = p_bagre) then
    raise exception 'BAGREVENCEDOR';
  end if;

  if exists(select 1 from award_votes where match_id = p_match and voter_id = p_voter) then raise exception 'VOTOFEITO'; end if;
  insert into award_votes(match_id, voter_id, craque_id, bagre_id) values (p_match, p_voter, p_craque, p_bagre);
end; $$;

-- ---------- 5. LIMPAR O QUE O RESULTADO INVALIDOU ----------
-- Chamada sempre que o placar ou as equipas mudam. Um voto de craque num
-- jogador que passou a estar do lado derrotado deixa de ser válido — e um
-- voto inválido que ficasse na tabela continuava a contar para os títulos.
--
-- Apaga em vez de marcar: `award_votes` guarda craque e bagre na MESMA
-- linha, com as duas colunas NOT NULL, por isso não há forma de anular
-- meia votação. Quem perdeu o voto volta a ver o cartão de votação.
create or replace function limpar_votos_invalidos(p_match uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_votos int; v_notas int;
begin
  delete from award_votes av
   where av.match_id = p_match
     and (   not exists (select 1 from jogadores_do_jogo(p_match) j where j.player_id = av.voter_id)
          or not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = av.craque_id)
          or not exists (select 1 from elegiveis_premio(p_match, 'BAGRE')  e where e.player_id = av.bagre_id));
  get diagnostics v_votos = row_count;

  -- as avaliações pós-jogo seguem a mesma sorte: quem deixou de ser
  -- companheiro (ou de ter jogado) não pode continuar a dar nota
  delete from post_match_ratings r
   where r.match_id = p_match
     and not exists (
       select 1
       from participantes_do_jogo jr
       join participantes_do_jogo jt
         on jt.match_id = jr.match_id and jt.team = jr.team and jt.team is not null
       where jr.match_id = p_match
         and jr.player_id = r.rater_id
         and jt.player_id = r.target_id
     );
  get diagnostics v_notas = row_count;

  if v_votos > 0 or v_notas > 0 then
    perform registar_atividade(p_match, 'VOTOS_ANULADOS',
      jsonb_build_object('craque_bagre', v_votos, 'pos_jogo', v_notas,
                         'motivo', 'resultado alterado'));
  end if;

  return v_votos + v_notas;
end; $$;

-- ---------- 6. GRAVAR O RESULTADO (0020 → aqui) ----------
-- Corpo da 0020 + duas coisas no fim: a correção de craque/bagre do admin
-- passa a obedecer à mesma regra da votação (não se corrige à mão o que a
-- votação proíbe), e os votos que o novo resultado invalidou são apagados.
create or replace function admin_save_result(
  p_pw text, p_match uuid,
  p_score_a int, p_score_b int,
  p_stats jsonb, p_gk_stats jsonb,
  p_notes text,
  p_craque uuid, p_bagre uuid
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text; v_result text;
  r_row record; v_goals int; v_assists int; v_team text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status into v_status, v_result
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_status = 'DRAFT' then raise exception 'SEMESCALACAO'; end if;

  if coalesce(p_score_a,0) < 0 or coalesce(p_score_a,0) > 99
     or coalesce(p_score_b,0) < 0 or coalesce(p_score_b,0) > 99 then raise exception 'PLACAR'; end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) < 3 then
    raise exception 'JOGADORES';
  end if;
  if p_craque is not null and p_craque = p_bagre then raise exception 'IGUAL'; end if;

  delete from match_stats where match_id = p_match;
  for r_row in select value from jsonb_array_elements(p_stats) loop
    v_goals   := coalesce((r_row.value->>'goals')::int, 0);
    v_assists := coalesce((r_row.value->>'assists')::int, 0);
    v_team    := nullif(r_row.value->>'team', '');
    if v_goals < 0 or v_goals > 99 or v_assists < 0 or v_assists > 99 then raise exception 'STATS'; end if;
    if v_team is not null and v_team not in ('A','B') then raise exception 'STATS'; end if;
    insert into match_stats(match_id, player_id, team, goals, assists)
    values (p_match, (r_row.value->>'player_id')::uuid, v_team, v_goals, v_assists);
  end loop;

  delete from goalkeeper_match_stats where match_id = p_match;
  if p_gk_stats is not null and jsonb_typeof(p_gk_stats) = 'array' then
    for r_row in select value from jsonb_array_elements(p_gk_stats) loop
      insert into goalkeeper_match_stats(match_id, goalkeeper_id, team, saves, goals_conceded)
      values (p_match,
              (r_row.value->>'goalkeeper_id')::uuid,
              nullif(r_row.value->>'team',''),
              coalesce((r_row.value->>'saves')::int, 0),
              coalesce((r_row.value->>'goals_conceded')::int, 0));
    end loop;
  end if;

  update matches set
    score_a = coalesce(p_score_a, 0),
    score_b = coalesce(p_score_b, 0),
    notes   = nullif(btrim(p_notes), ''),
    craque_override = p_craque,
    bagre_override  = p_bagre,
    result_status = case when result_status = 'PUBLISHED' then 'PUBLISHED' else 'DRAFT' end
  where id = p_match;

  -- A partir daqui o placar e as equipas já são os novos — é com eles que
  -- se decide quem podia ser craque e quem podia ser bagre.
  if p_craque is not null
     and not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = p_craque) then
    raise exception 'CRAQUEPERDEDOR';
  end if;
  if p_bagre is not null
     and not exists (select 1 from elegiveis_premio(p_match, 'BAGRE') e where e.player_id = p_bagre) then
    raise exception 'BAGREVENCEDOR';
  end if;

  perform limpar_votos_invalidos(p_match);

  perform registar_atividade(p_match,
    case when v_result = 'PUBLISHED' then 'RESULTADO_EDITADO' else 'RESULTADO_GRAVADO' end,
    jsonb_build_object('score_a', p_score_a, 'score_b', p_score_b,
                       'jogadores', jsonb_array_length(p_stats)));

  if v_result = 'PUBLISHED' then
    update match_publications set payload = payload_resultado(p_match)
    where match_id = p_match and type = 'RESULTADO';
  end if;

  return match_public_json(p_match);
end; $$;

-- ---------- 7. PUBLICAR O RESULTADO ABRE A AVALIAÇÃO (0020 → aqui) ----------
create or replace function admin_publish_result(p_pw text, p_match uuid, p_resenha text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_result text; v_versao int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status, m.overall_version into v_status, v_result, v_versao
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_result = 'NONE' then raise exception 'SEMRESULTADO'; end if;
  if v_result = 'PUBLISHED' then raise exception 'RESPUBLICADO'; end if;

  update matches set
    result_status = 'PUBLISHED',
    result_published_at = now(),
    status = 'COMPLETED'
  where id = p_match;

  perform registar_atividade(p_match, 'RESULTADO_PUBLICADO', null);

  -- Publicar é o gatilho da avaliação pós-jogo: é a partir daqui que há
  -- equipas confirmadas e vencedor definido. Jogos da versão 1 nunca a
  -- abrem — o passado não se reavalia.
  if v_versao = 2 then
    update matches set
      post_rating_status = 'OPEN',
      post_rating_opened_at = now(),
      post_rating_closed_at = null
    where id = p_match;
    perform registar_atividade(p_match, 'POSJOGO_ABERTA', jsonb_build_object('via', 'publicacao'));
  end if;

  perform publicar_no_feed(p_match, 'RESULTADO', '🏆 Resultado publicado',
                           nullif(btrim(p_resenha), ''), payload_resultado(p_match));

  return match_public_json(p_match);
end; $$;

-- ---------- 8. O ADMIN ABRE, ENCERRA E REABRE ----------
create or replace function admin_set_post_rating_status(p_pw text, p_match uuid, p_open boolean)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_result text; v_versao int; v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.result_status, m.overall_version, m.status
    into v_result, v_versao, v_status
  from matches m where m.id = p_match;
  if v_result is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  -- sem resultado publicado não há equipas confirmadas para avaliar
  if v_result <> 'PUBLISHED' then raise exception 'SEMRESULTADO'; end if;
  if v_versao <> 2 then raise exception 'VERSAOANTIGA'; end if;

  if coalesce(p_open, false) then
    update matches set post_rating_status = 'OPEN',
                       post_rating_opened_at = now(),
                       post_rating_closed_at = null
    where id = p_match;
    perform registar_atividade(p_match, 'POSJOGO_ABERTA', jsonb_build_object('via', 'admin'));
  else
    update matches set post_rating_status = 'CLOSED',
                       post_rating_closed_at = now()
    where id = p_match;
    perform registar_atividade(p_match, 'POSJOGO_ENCERRADA', null);
  end if;

  return match_public_json(p_match);
end; $$;

-- ---------- 9. O JOGADOR AVALIA OS COMPANHEIROS ----------
-- p_ratings: [{"player_id": uuid, "stars": 0..5}]
--
-- Aceita avaliações parciais (dar nota a três hoje e aos outros amanhã) e
-- reescreve as que já existiam enquanto a votação estiver aberta. Depois de
-- encerrada, nem uma nem outra coisa: a guarda é a mesma.
create or replace function submit_post_match_ratings(
  p_voter uuid, p_pin text, p_match uuid, p_ratings jsonb
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  r players; m matches%rowtype;
  v_equipa text; r_row record; v_alvo uuid; v_estrelas int; v_n int := 0;
begin
  select * into r from players where id = p_voter;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'INVALIDO'; end if;
  if m.overall_version <> 2 then raise exception 'VERSAOANTIGA'; end if;
  if m.status <> 'COMPLETED' or m.result_status <> 'PUBLISHED' then raise exception 'SEMRESULTADO'; end if;
  if m.post_rating_status <> 'OPEN' then raise exception 'AVFECHADA'; end if;

  select j.team into v_equipa from jogadores_do_jogo(p_match) j where j.player_id = p_voter;
  if not found then raise exception 'NAOJOGOU'; end if;
  -- sem equipas atribuídas não existe "companheiro de equipa" que se possa
  -- definir; avaliar toda a gente seria outra votação, não esta
  if v_equipa is null then raise exception 'SEMEQUIPAS'; end if;

  if p_ratings is null or jsonb_typeof(p_ratings) <> 'array' then raise exception 'INVALIDO'; end if;

  for r_row in select value from jsonb_array_elements(p_ratings) loop
    v_alvo := (r_row.value->>'player_id')::uuid;
    -- só inteiros: "3.5" ou "muitas" rebentavam no cast com um erro de
    -- Postgres cru, que a app mostrava como "erro de ligação"
    -- o `is null` à frente não é redundante: `null !~ '…'` dá NULL, o IF não
    -- dispara, e a estrela nula ia rebentar lá em baixo no NOT NULL
    if (r_row.value->>'stars') is null or (r_row.value->>'stars') !~ '^\d+$' then
      raise exception 'ESTRELAS';
    end if;
    v_estrelas := (r_row.value->>'stars')::int;
    if v_estrelas < 0 or v_estrelas > 5 then raise exception 'ESTRELAS'; end if;
    if v_alvo is null or v_alvo = p_voter then raise exception 'PROPRIO'; end if;
    if not exists (select 1 from jogadores_do_jogo(p_match) j
                    where j.player_id = v_alvo and j.team = v_equipa) then
      raise exception 'SEMCOMPANHEIRO';
    end if;

    insert into post_match_ratings(match_id, rater_id, target_id, stars)
    values (p_match, p_voter, v_alvo, v_estrelas)
    on conflict (match_id, rater_id, target_id)
    do update set stars = excluded.stars, updated_at = now();
    v_n := v_n + 1;
  end loop;

  return json_build_object('match_id', p_match, 'avaliados', v_n);
end; $$;

-- ---------- 10. O QUE O JOGADOR TEM PARA AVALIAR ----------
-- Só jogos com a votação ABERTA em que ele jogou. Traz os companheiros de
-- equipa (sem ele) e a nota que já lhes deu, para o ecrã abrir preenchido.
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
      select m.id, m.played_at, m.created_at, m.kickoff_at,
             m.team_a_name, m.team_b_name, m.score_a, m.score_b,
             (select pj.team from participantes_do_jogo pj
               where pj.match_id = m.id and pj.player_id = p_voter) as equipa
      from matches_validas m
      where m.overall_version = 2
        and m.post_rating_status = 'OPEN'
        and exists (select 1 from participantes_do_jogo pj
                     where pj.match_id = m.id and pj.player_id = p_voter)
    ) x
    where x.equipa is not null
  );
end; $$;

-- ---------- 11. AS MÉDIAS ENTRAM NAS ESTATÍSTICAS ----------
-- Média e número de avaliações recebidas, sempre por jogador. A ausência
-- de avaliações devolve NULL (nunca 0): quem não foi avaliado não tem nota,
-- e o overall trata isso mostrando o número antigo em vez de o baixar.

-- (0019) totais gerais — corpo igual + as duas colunas novas
create or replace function get_player_stats()
returns json language sql security definer set search_path = public, extensions as $$
  with validas as (select id from matches_validas),
  craque_t as (
    select av.match_id, coalesce(mv.craque_override, av.craque_id) as player_id, count(*) as n
    from award_votes av
    join matches_validas mv on mv.id = av.match_id
    group by av.match_id, coalesce(mv.craque_override, av.craque_id)
  ), craque_w as (
    select player_id, count(distinct match_id) as wins from (
      select t.match_id, t.player_id from craque_t t
      where t.n = (select max(n) from craque_t t2 where t2.match_id = t.match_id)
      union
      select mv.id, mv.craque_override from matches_validas mv
      where mv.craque_override is not null
        and not exists (select 1 from award_votes av where av.match_id = mv.id)
    ) w group by player_id
  ), bagre_t as (
    select av.match_id, coalesce(mv.bagre_override, av.bagre_id) as player_id, count(*) as n
    from award_votes av
    join matches_validas mv on mv.id = av.match_id
    group by av.match_id, coalesce(mv.bagre_override, av.bagre_id)
  ), bagre_w as (
    select player_id, count(distinct match_id) as wins from (
      select t.match_id, t.player_id from bagre_t t
      where t.n = (select max(n) from bagre_t t2 where t2.match_id = t.match_id)
      union
      select mv.id, mv.bagre_override from matches_validas mv
      where mv.bagre_override is not null
        and not exists (select 1 from award_votes av where av.match_id = mv.id)
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

-- (0019) totais por período — idem, com a média do MESMO período
create or replace function get_player_stats_range(p_from date, p_to date)
returns json language sql stable security definer set search_path = public, extensions as $$
  with mt as (
    select m.id, m.craque_override, m.bagre_override from matches_validas m
    where (p_from is null or m.played_at >= p_from)
      and (p_to   is null or m.played_at <= p_to)
  ),
  craque_t as (
    select av.match_id, coalesce(mt.craque_override, av.craque_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join mt on mt.id = av.match_id
    group by av.match_id, coalesce(mt.craque_override, av.craque_id)
  ),
  bagre_t as (
    select av.match_id, coalesce(mt.bagre_override, av.bagre_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join mt on mt.id = av.match_id
    group by av.match_id, coalesce(mt.bagre_override, av.bagre_id)
  ),
  totals as (
    select ms.player_id,
           count(*)::int                    as matches,
           coalesce(sum(ms.goals), 0)::int   as goals,
           coalesce(sum(ms.assists), 0)::int as assists
    from match_stats ms
    where ms.match_id in (select id from mt)
    group by ms.player_id
  ),
  pos as (
    select pr.target_id as player_id,
           round(avg(pr.stars)::numeric, 2) as media,
           count(*)::int                    as n
    from post_ratings_validas pr
    where pr.match_id in (select id from mt)
    group by pr.target_id
  )
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'name', p.name, 'photo', p.photo_url,
           'matches', coalesce(t.matches, 0),
           'goals',   coalesce(t.goals, 0),
           'assists', coalesce(t.assists, 0),
           'craques', (select count(*) from craque_t c where c.pid = p.id and c.n = c.top)
                    + (select count(*) from mt where mt.craque_override = p.id
                         and not exists (select 1 from award_votes av where av.match_id = mt.id)),
           'bagres',  (select count(*) from bagre_t  b where b.pid = p.id and b.n = b.top)
                    + (select count(*) from mt where mt.bagre_override = p.id
                         and not exists (select 1 from award_votes av where av.match_id = mt.id)),
           'post_rating_avg',   ps.media,
           'post_rating_count', coalesce(ps.n, 0))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t on t.player_id = p.id
  left join pos ps   on ps.player_id = p.id
  where p.approved;
$$;

-- (0019) perfil — média geral + a média recebida em cada rodada
create or replace function get_player_profile(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  with craque_top as (
    select av.match_id, coalesce(mv.craque_override, av.craque_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join matches_validas mv on mv.id = av.match_id
    group by av.match_id, coalesce(mv.craque_override, av.craque_id)
  ),
  bagre_top as (
    select av.match_id, coalesce(mv.bagre_override, av.bagre_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join matches_validas mv on mv.id = av.match_id
    group by av.match_id, coalesce(mv.bagre_override, av.bagre_id)
  )
  select json_build_object(
    'id', p.id, 'name', p.name, 'user_id', p.user_id, 'photo', p.photo_url,
    'avg',     (select round(avg(r.score)::numeric, 2) from ratings r where r.target_id = p.id),
    'votes',   (select count(*) from ratings r where r.target_id = p.id),
    'matches', (select count(*) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'goals',   (select coalesce(sum(ms.goals), 0) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'assists', (select coalesce(sum(ms.assists), 0) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'craques', (select count(*) from craque_top ct where ct.pid = p.id and ct.n = ct.top)
             + (select count(*) from matches_validas mv
                 where mv.craque_override = p.id
                   and not exists (select 1 from award_votes av where av.match_id = mv.id)),
    'bagres',  (select count(*) from bagre_top  bt where bt.pid = p.id and bt.n = bt.top)
             + (select count(*) from matches_validas mv
                 where mv.bagre_override = p.id
                   and not exists (select 1 from award_votes av where av.match_id = mv.id)),
    -- null (e não 0) quando ninguém o avaliou ainda: é o que diz ao overall
    -- para continuar na fórmula antiga em vez de o castigar
    'post_rating_avg',   (select round(avg(pr.stars)::numeric, 2) from post_ratings_validas pr
                           where pr.target_id = p.id),
    'post_rating_count', (select count(*)::int from post_ratings_validas pr
                           where pr.target_id = p.id),
    'history', (
      select coalesce(json_agg(json_build_object(
               'match_id', m.id, 'played_at', m.played_at,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists,
               'score_a', m.score_a, 'score_b', m.score_b,
               'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
               'post_rating_avg', (select round(avg(pr.stars)::numeric, 2)
                                     from post_ratings_validas pr
                                    where pr.match_id = m.id and pr.target_id = p.id),
               'craque', exists (select 1 from craque_top c2
                                  where c2.match_id = m.id and c2.pid = p.id and c2.n = c2.top),
               'bagre',  exists (select 1 from bagre_top b2
                                  where b2.match_id = m.id and b2.pid = p.id and b2.n = b2.top))
             order by m.played_at desc, m.created_at desc), '[]'::json)
      from match_stats ms join matches_validas m on m.id = ms.match_id
      where ms.player_id = p.id
    )
  )
  from players p where p.id = p_id;
$$;

-- ---------- 12. O JOGO PASSA A CONTAR A SUA AVALIAÇÃO ----------
-- match_json (0020) + estado da votação pós-jogo e a média por jogador
-- daquele jogo. Só médias: quem deu que nota não sai daqui.
create or replace function match_json(p_id uuid, p_photos boolean)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', m.id, 'played_at', m.played_at, 'created_at', m.created_at,
    'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
    'score_a', m.score_a, 'score_b', m.score_b,
    'notes', m.notes,
    'overall_version', m.overall_version,
    'post_rating_status', m.post_rating_status,
    'has_winner_photo', m.winner_photo is not null,
    'has_location_photo', m.location_photo is not null,
    'winner_photo',   case when p_photos then m.winner_photo   else null end,
    'location_photo', case when p_photos then m.location_photo else null end,
    'players', (
      select coalesce(json_agg(json_build_object(
               'player_id', ms.player_id, 'name', p.name, 'photo', p.photo_url,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists)
             order by ms.goals desc, ms.assists desc, p.name), '[]'::json)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = m.id),
    'gk_stats', (
      select coalesce(json_agg(json_build_object(
               'goalkeeper_id', g.goalkeeper_id, 'name', p.name,
               'team', g.team, 'saves', g.saves, 'goals_conceded', g.goals_conceded)
             order by p.name), '[]'::json)
      from goalkeeper_match_stats g join players p on p.id = g.goalkeeper_id
      where g.match_id = m.id),
    'post_ratings', (
      select coalesce(json_agg(json_build_object(
               'player_id', t.pid, 'name', p.name, 'photo', p.photo_url,
               'avg', t.media, 'votes', t.n)
             order by t.media desc, p.name), '[]'::json)
      from (select pr.target_id as pid,
                   round(avg(pr.stars)::numeric, 2) as media,
                   count(*)::int as n
            from post_match_ratings pr
            where pr.match_id = m.id
            group by pr.target_id) t
      join players p on p.id = t.pid),
    'votes', (select count(*)::int from award_votes av where av.match_id = m.id),
    -- o override do admin (0019) MANDA: quando existe, o vencedor é ele,
    -- com os votos reais que teve (pode ser 0 — foi decisão do admin).
    'craque', case when m.craque_override is not null then (
      select json_agg(json_build_object('player_id', p.id, 'name', p.name,
               'votes', (select count(*)::int from award_votes av
                          where av.match_id = m.id and av.craque_id = p.id)))
      from players p where p.id = m.craque_override
    ) else (
      select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
               order by t.n desc, t.nome), '[]'::json)
      from (select av.craque_id as pid, p.name as nome, count(*)::int as n
              from award_votes av join players p on p.id = av.craque_id
             where av.match_id = m.id group by av.craque_id, p.name) t
    ) end,
    'bagre', case when m.bagre_override is not null then (
      select json_agg(json_build_object('player_id', p.id, 'name', p.name,
               'votes', (select count(*)::int from award_votes av
                          where av.match_id = m.id and av.bagre_id = p.id)))
      from players p where p.id = m.bagre_override
    ) else (
      select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
               order by t.n desc, t.nome), '[]'::json)
      from (select av.bagre_id as pid, p.name as nome, count(*)::int as n
              from award_votes av join players p on p.id = av.bagre_id
             where av.match_id = m.id group by av.bagre_id, p.name) t
    ) end
  )
  from matches m where m.id = p_id;
$$;

-- Buraco tapado de passagem: `get_match` (0010) devolvia `match_json` de
-- QUALQUER jogo, com fotos, sem olhar ao estado. A 0020 fechou o acesso
-- direto a match_json exatamente para isso, mas esta porta ficou aberta —
-- quem soubesse um id lia um resultado ainda em rascunho. Os dois sítios
-- que a chamam (detalhe da rodada e painel de rodadas antigas) só usam ids
-- vindos de `get_matches`, que já é filtrado; nada muda para eles.
create or replace function get_match(p_id uuid)
returns json language sql security definer set search_path = public, extensions as $$
  select match_json(m.id, true) from matches_validas m where m.id = p_id;
$$;

-- match_public_json (0021) + o estado da avaliação pós-jogo e quantas
-- notas já entraram — é o que o painel do admin mostra no jogo.
create or replace function match_public_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', m.id,
    'kickoff_at', m.kickoff_at,
    'played_at', m.played_at,
    'location', m.location,
    'map_url', m.map_url,
    'status', m.status,
    'published_at', m.published_at,
    'result_status', m.result_status,
    'result_published_at', m.result_published_at,
    'cancelled_at', m.cancelled_at,
    'cancel_reason', m.cancel_reason,
    'team_a_name', m.team_a_name,
    'team_b_name', m.team_b_name,
    'team_a_overall', m.team_a_overall,
    'team_b_overall', m.team_b_overall,
    'balance_pct', m.balance_pct,
    'score_a', m.score_a,
    'score_b', m.score_b,
    'notes', m.notes,
    'craque_override', m.craque_override,
    'bagre_override', m.bagre_override,
    'overall_version', m.overall_version,
    'post_rating_status', m.post_rating_status,
    'post_rating_opened_at', m.post_rating_opened_at,
    'post_rating_closed_at', m.post_rating_closed_at,
    -- quantos jogadores já entregaram notas e quantos podiam entregar
    'post_rating_voters', (
      select count(distinct pr.rater_id)::int from post_match_ratings pr where pr.match_id = m.id),
    'post_rating_total', (
      select count(*)::int from post_match_ratings pr where pr.match_id = m.id),
    'lineup', (
      select coalesce(json_agg(json_build_object(
               'player_id', l.player_id, 'name', p.name, 'photo', p.photo_url,
               'team', l.team,
               'assigned_position', l.assigned_position,
               'preferred_position', l.preferred_position,
               'was_out_of_position', l.was_out_of_position,
               'overall_at_draw', l.overall_at_draw,
               'is_goalkeeper', l.is_goalkeeper,
               'substitute_for', sub.out_name,
               'substitute_for_id', sub.out_id)
             order by l.team,
                      case l.assigned_position
                        when 'GK'    then 1
                        when 'DEF-L' then 2
                        when 'DEF-R' then 3
                        when 'MID-L' then 4
                        when 'MID-C' then 5
                        when 'MID-R' then 6
                        when 'ST'    then 7
                        else 8
                      end,
                      p.name), '[]'::json)
      from match_lineup l
      join players p on p.id = l.player_id
      left join lateral (
        select po.id as out_id, po.name as out_name
        from match_substitutions s
        join players po on po.id = s.out_player_id
        where s.match_id = m.id and s.in_player_id = l.player_id
        order by s.created_at desc
        limit 1
      ) sub on true
      where l.match_id = m.id),
    'substitutions', (
      select coalesce(json_agg(json_build_object(
               'id', s.id,
               'kind', s.kind,
               'out_player_id', s.out_player_id, 'out_name', po.name, 'out_photo', po.photo_url,
               'in_player_id', s.in_player_id, 'in_name', pi.name, 'in_photo', pi.photo_url,
               'team', s.team,
               'assigned_position', s.assigned_position,
               'is_goalkeeper', s.is_goalkeeper,
               'out_overall', s.out_overall,
               'in_overall', s.in_overall,
               'reason', s.reason,
               'created_at', s.created_at)
             order by s.created_at), '[]'::json)
      from match_substitutions s
      join players po on po.id = s.out_player_id
      join players pi on pi.id = s.in_player_id
      where s.match_id = m.id),
    'swaps', (
      select coalesce(json_agg(json_build_object(
               'id', x.id,
               'a_player_id', x.a_player_id, 'a_name', pa.name, 'a_photo', pa.photo_url,
               'b_player_id', x.b_player_id, 'b_name', pb.name, 'b_photo', pb.photo_url,
               'a_team', x.a_team, 'b_team', x.b_team,
               'a_position', x.a_position, 'b_position', x.b_position,
               'is_goalkeeper', x.is_goalkeeper,
               'a_overall', x.a_overall, 'b_overall', x.b_overall,
               'reason', x.reason,
               'created_at', x.created_at)
             order by x.created_at), '[]'::json)
      from match_swaps x
      join players pa on pa.id = x.a_player_id
      join players pb on pb.id = x.b_player_id
      where x.match_id = m.id),
    'media', (
      select coalesce(json_agg(json_build_object(
               'id', md.id, 'data_url', md.data_url, 'kind', md.kind,
               'is_primary', md.is_primary)
             order by md.is_primary desc, md.created_at), '[]'::json)
      from match_media md where md.match_id = m.id),
    'stats', (
      select coalesce(json_agg(json_build_object(
               'player_id', ms.player_id, 'name', p.name,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists)
             order by p.name), '[]'::json)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = m.id),
    'gk_stats', (
      select coalesce(json_agg(json_build_object(
               'goalkeeper_id', g.goalkeeper_id, 'name', p.name,
               'team', g.team, 'saves', g.saves, 'goals_conceded', g.goals_conceded)
             order by p.name), '[]'::json)
      from goalkeeper_match_stats g join players p on p.id = g.goalkeeper_id
      where g.match_id = m.id)
  )
  from matches m where m.id = p_id;
$$;

-- ---------- PERMISSÕES ----------
-- As views e os auxiliares são canalização interna das funções acima: quem
-- decide o que se vê são as funções de leitura, não quem souber um id.
-- (O default do Postgres é EXECUTE para PUBLIC — por isso o revoke é
-- explícito. As funções SECURITY DEFINER correm como o dono e continuam a
-- poder chamá-las.)
revoke select on participantes_do_jogo from public, anon, authenticated;
revoke select on post_ratings_validas  from public, anon, authenticated;
revoke select on matches_validas       from public, anon, authenticated;
revoke execute on function limpar_votos_invalidos(uuid) from public, anon, authenticated;
revoke execute on function jogadores_do_jogo(uuid)      from public, anon, authenticated;
revoke execute on function vencedor_do_jogo(uuid)       from public, anon, authenticated;
revoke execute on function elegiveis_premio(uuid, text) from public, anon, authenticated;
-- match_json continua fechada (0020): quem manda no que se vê são os wrappers
revoke execute on function match_json(uuid, boolean) from public, anon, authenticated;

grant execute on function vote_award(uuid,text,uuid,uuid,uuid)   to anon, authenticated;
grant execute on function submit_post_match_ratings(uuid, text, uuid, jsonb) to anon, authenticated;
grant execute on function get_my_post_ratings(uuid, text)        to anon, authenticated;
grant execute on function admin_set_post_rating_status(text, uuid, boolean)  to anon, authenticated;
grant execute on function admin_save_result(text, uuid, int, int, jsonb, jsonb, text, uuid, uuid) to anon, authenticated;
grant execute on function admin_publish_result(text, uuid, text) to anon, authenticated;
grant execute on function get_player_stats()                     to anon, authenticated;
grant execute on function get_player_stats_range(date, date)     to anon, authenticated;
grant execute on function get_player_profile(uuid)               to anon, authenticated;
grant execute on function match_public_json(uuid)                to anon, authenticated;
grant execute on function get_match(uuid)                        to anon, authenticated;
