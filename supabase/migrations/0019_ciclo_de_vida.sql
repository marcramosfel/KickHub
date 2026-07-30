-- =====================================================================
--  PELADA BROWNS — Migração 19: o jogo como registo único, do rascunho
--  ao resultado publicado
--
--  Até aqui o resultado era registado num sítio (aba "Jogos", pela via
--  antiga admin_save_match) sem relação com o jogo agendado noutro (aba
--  "Próximo jogo"). Esta migração fecha essa bifurcação:
--
--    1. O resultado ganha um estado próprio (`result_status`): pode ficar
--       em rascunho, invisível e fora das estatísticas, até o admin o
--       publicar. Editar um resultado publicado REGRAVA as linhas do
--       mesmo jogo — nunca cria outro — por isso nada duplica.
--    2. `matches_validas` passa a ser a ÚNICA definição de "jogo que
--       conta para as estatísticas". Todas as funções de agregação são
--       redefinidas em cima dela. Sem isto, um rascunho de resultado (ou
--       um jogo cancelado com estatísticas já gravadas) contaminava os
--       rankings.
--    3. `match_media`: fotos do jogo (N em vez das 2 colunas fixas), com
--       uma marcada como principal. As colunas antigas ficam como estão —
--       as rodadas históricas continuam a lê-las; o JSON junta as duas
--       fontes.
--    4. `match_activity`: auditoria por jogo (quem fez o quê, quando).
--       As funções da 0016/0018 passam a registar aqui também.
--    5. Craque/bagre: a votação dos jogadores continua a decidir; o admin
--       ganha um OVERRIDE por jogo (para empates ou rodadas sem votos),
--       sempre registado na auditoria. As funções de estatísticas contam
--       primeiro o override e só na falta dele a votação.
--
--  Aditiva e idempotente como as anteriores: colunas novas com default,
--  nenhum dado alterado além do backfill inofensivo de result_status.
--
--  Códigos de erro novos: SEMRESULTADO, RESPUBLICADO, JOGOCANCELADO.
-- =====================================================================

-- ---------- 1. O ESTADO DO RESULTADO ----------
-- Separado do status do jogo de propósito: "o jogo acabou" e "o resultado
-- está pronto para o grupo ver" são momentos diferentes. NONE = ainda nem
-- começou a preencher; DRAFT = guardado mas invisível; PUBLISHED = conta.
alter table matches add column if not exists result_status text not null default 'NONE';
alter table matches add column if not exists result_published_at timestamptz;
alter table matches add column if not exists cancelled_at timestamptz;
alter table matches add column if not exists cancel_reason text;

do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_result_status_chk' and conrelid = 'public.matches'::regclass
  ) then
    alter table matches add constraint matches_result_status_chk
      check (result_status in ('NONE','DRAFT','PUBLISHED'));
  end if;
end
$chk$;

-- Backfill: tudo o que hoje está COMPLETED tem o resultado à vista de
-- todos há semanas — é PUBLISHED por definição. O carimbo exato da
-- publicação não existe para o passado; created_at é a melhor aproximação
-- e fica registado que é isso que ele é.
update matches
   set result_status = 'PUBLISHED',
       result_published_at = coalesce(result_published_at, created_at)
 where status = 'COMPLETED' and result_status = 'NONE';

-- Craque/bagre: override do admin (a votação continua a mandar; isto só
-- se usa para desempatar ou quando ninguém votou, e fica na auditoria).
alter table matches add column if not exists craque_override uuid references players(id) on delete set null;
alter table matches add column if not exists bagre_override  uuid references players(id) on delete set null;

-- ---------- 2. A DEFINIÇÃO ÚNICA DE "JOGO QUE CONTA" ----------
-- Uma view e não uma cláusula repetida: da próxima vez que a regra mudar
-- (temporadas, jogos amigáveis…), muda-se aqui e todas as funções seguem.
-- `security_invoker = false` não existe para views no PG15 do Supabase da
-- forma clássica; como só é lida por funções SECURITY DEFINER, o RLS das
-- tabelas de baixo não a bloqueia.
create or replace view matches_validas as
  select m.*
  from matches m
  where m.status = 'COMPLETED'
    and m.result_status = 'PUBLISHED';

-- ---------- 3. FOTOS DO JOGO ----------
create table if not exists match_media (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  kind       text not null default 'PHOTO' check (kind in ('PHOTO','WINNER','LOCATION')),
  data_url   text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table match_media enable row level security;

create index if not exists match_media_match_idx on match_media (match_id, created_at);

-- No máximo UMA foto principal por jogo — a régua fica na base de dados.
create unique index if not exists match_media_primary_uidx
  on match_media (match_id) where is_primary;

-- ---------- 4. AUDITORIA POR JOGO ----------
-- `actor` é texto livre ("admin") e não uma FK: o painel autentica-se por
-- senha partilhada, não há utilizador-admin na tabela players. Quando
-- houver, muda-se aqui.
create table if not exists match_activity (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references matches(id) on delete cascade,
  action     text not null,
  detail     jsonb,
  actor      text not null default 'admin',
  created_at timestamptz not null default now()
);

alter table match_activity enable row level security;

create index if not exists match_activity_match_idx on match_activity (match_id, created_at);

-- Registo interno; nunca é chamada de fora (revoke lá em baixo).
create or replace function registar_atividade(p_match uuid, p_action text, p_detail jsonb)
returns void language sql security definer set search_path = public, extensions as $$
  insert into match_activity(match_id, action, detail) values (p_match, p_action, p_detail);
$$;

-- ---------- 5. GRAVAR O RESULTADO (rascunho ou edição) ----------
-- Substitui o uso de admin_save_match para jogos do ciclo novo. Regrava
-- SEMPRE as linhas do próprio jogo (delete + insert dentro da mesma
-- transação): editar nunca duplica, porque não há segundo jogo.
--
-- p_stats:    [{player_id, team, goals, assists}]
-- p_gk_stats: [{goalkeeper_id, team, saves, goals_conceded}]
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
  -- Só jogos do ciclo novo ou já fechados: um DRAFT ainda nem equipas tem.
  if v_status = 'DRAFT' then raise exception 'SEMESCALACAO'; end if;

  if coalesce(p_score_a,0) < 0 or coalesce(p_score_a,0) > 99
     or coalesce(p_score_b,0) < 0 or coalesce(p_score_b,0) > 99 then raise exception 'PLACAR'; end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) < 3 then
    raise exception 'JOGADORES';
  end if;
  -- craque/bagre (override): iguais é o mesmo erro de sempre
  if p_craque is not null and p_craque = p_bagre then raise exception 'IGUAL'; end if;

  -- regrava as linhas deste jogo — nunca insere um jogo novo
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
    -- um resultado publicado continua publicado ao ser editado; um NONE
    -- passa a rascunho. É isto que deixa "editar sem despublicar".
    result_status = case when result_status = 'PUBLISHED' then 'PUBLISHED' else 'DRAFT' end
  where id = p_match;

  perform registar_atividade(p_match,
    case when v_result = 'PUBLISHED' then 'RESULTADO_EDITADO' else 'RESULTADO_GRAVADO' end,
    jsonb_build_object('score_a', p_score_a, 'score_b', p_score_b,
                       'jogadores', jsonb_array_length(p_stats)));

  return match_public_json(p_match);
end; $$;

-- ---------- 6. PUBLICAR O RESULTADO ----------
-- Publicar é o que fecha o jogo (status COMPLETED) e o faz contar. Antes
-- disto, as estatísticas de rascunho existem mas nenhuma agregação as vê.
create or replace function admin_publish_result(p_pw text, p_match uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_result text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status into v_status, v_result
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

  return match_public_json(p_match);
end; $$;

-- ---------- 7. CANCELAR O JOGO ----------
-- Sai das estatísticas (nunca fica COMPLETED), fica no histórico com o
-- motivo. A dupla confirmação é da UI; aqui garante-se só que um jogo com
-- resultado publicado não se cancela por engano — despublica-se primeiro,
-- o que hoje não tem porta (de propósito: seria reescrever história).
create or replace function admin_cancel_match(p_pw text, p_match uuid, p_reason text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_result text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status into v_status, v_result
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then return match_public_json(p_match); end if; -- idempotente
  if v_result = 'PUBLISHED' then raise exception 'RESPUBLICADO'; end if;

  update matches set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = nullif(btrim(p_reason), '')
  where id = p_match;

  perform registar_atividade(p_match, 'JOGO_CANCELADO',
    jsonb_build_object('motivo', nullif(btrim(p_reason), '')));

  return match_public_json(p_match);
end; $$;

-- ---------- 8. FOTOS ----------
create or replace function admin_add_media(p_pw text, p_match uuid, p_kind text, p_data text, p_primary boolean)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_data is null or btrim(p_data) = '' then raise exception 'FOTO'; end if;
  if not exists (select 1 from matches m where m.id = p_match) then raise exception 'INVALIDO'; end if;

  -- marcar esta como principal desmarca a anterior (índice único parcial)
  if coalesce(p_primary, false) then
    update match_media set is_primary = false where match_id = p_match and is_primary;
  end if;

  insert into match_media(match_id, kind, data_url, is_primary)
  values (p_match, coalesce(nullif(btrim(p_kind), ''), 'PHOTO'), p_data, coalesce(p_primary, false))
  returning id into v_id;

  perform registar_atividade(p_match, 'FOTO_ADICIONADA', jsonb_build_object('kind', p_kind));
  return v_id;
end; $$;

create or replace function admin_set_primary_media(p_pw text, p_media uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_match uuid;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  select match_id into v_match from match_media where id = p_media;
  if v_match is null then raise exception 'INVALIDO'; end if;
  update match_media set is_primary = false where match_id = v_match and is_primary;
  update match_media set is_primary = true where id = p_media;
end; $$;

create or replace function admin_delete_media(p_pw text, p_media uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from match_media where id = p_media;
  if not found then raise exception 'INVALIDO'; end if;
end; $$;

-- ---------- 9. HISTÓRICO DE UM JOGO ----------
create or replace function admin_match_activity(p_pw text, p_match uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (
    select coalesce(json_agg(json_build_object(
             'id', a.id, 'action', a.action, 'detail', a.detail,
             'actor', a.actor, 'created_at', a.created_at)
           order by a.created_at desc, a.id desc), '[]'::json)
    from match_activity a where a.match_id = p_match
  );
end; $$;

-- ---------- 10. AUDITORIA NAS FUNÇÕES QUE JÁ EXISTIAM ----------
-- Redefinições mínimas: corpo igual ao da migração de origem + uma linha
-- de registo. (Fica aqui e não na origem para a 0016/0018 continuarem a
-- poder correr sozinhas numa base nova.)

-- publicar o sorteio (0016) — só ganha o registo
create or replace function admin_publish_match(p_pw text, p_match uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status <> 'DRAFT' then raise exception 'JAPUBLICADO'; end if;
  if not exists (select 1 from match_lineup l where l.match_id = p_match) then
    raise exception 'SEMESCALACAO';
  end if;

  update matches set status = 'PUBLISHED', published_at = now() where id = p_match;
  perform registar_atividade(p_match, 'SORTEIO_PUBLICADO', null);

  return match_public_json(p_match);
end; $$;

-- substituição por desistência (0018) — só ganha o registo
create or replace function admin_substitute_player(
  p_pw text, p_match uuid, p_out uuid, p_in uuid, p_in_overall int, p_reason text
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text;
  v_linha match_lineup%rowtype;
  v_primaria text;
  v_fora boolean;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_out is null or p_in is null then raise exception 'SEMJOGADOR'; end if;
  if p_out = p_in then raise exception 'MESMOJOGADOR'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  select * into v_linha from match_lineup l
  where l.match_id = p_match and l.player_id = p_out;
  if not found then raise exception 'SEMLINEUP'; end if;

  if exists (select 1 from match_lineup l where l.match_id = p_match and l.player_id = p_in) then
    raise exception 'JAESCALADO';
  end if;

  select p.primary_position into v_primaria from players p where p.id = p_in;
  if not found then raise exception 'SEMJOGADOR'; end if;

  v_fora := (not v_linha.is_goalkeeper) and (v_primaria is distinct from v_linha.assigned_position);

  update match_lineup set
    player_id           = p_in,
    preferred_position  = v_primaria,
    was_out_of_position = v_fora,
    overall_at_draw     = p_in_overall
  where match_id = p_match and player_id = p_out;

  insert into match_substitutions(
    match_id, out_player_id, in_player_id, team, assigned_position,
    is_goalkeeper, out_overall, in_overall, reason)
  values (
    p_match, p_out, p_in, v_linha.team, v_linha.assigned_position,
    v_linha.is_goalkeeper, v_linha.overall_at_draw, p_in_overall,
    nullif(btrim(p_reason), ''));

  perform recalcular_forcas_do_jogo(p_match);
  perform registar_atividade(p_match, 'JOGADOR_SUBSTITUIDO',
    jsonb_build_object('saiu', p_out, 'entrou', p_in, 'motivo', nullif(btrim(p_reason), '')));

  return match_public_json(p_match);
end; $$;

-- ---------- 11. AS ESTATÍSTICAS PASSAM A VER SÓ JOGOS VÁLIDOS ----------
-- Cada corpo é o da migração de origem com `matches` → `matches_validas`
-- (ou um filtro por ela). Craque/bagre: o override do admin conta como o
-- vencedor; sem override decide a votação, como sempre.

-- (0002) totais gerais
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
      -- override em jogos SEM votos: a votação não tem linhas, mas o
      -- prémio existe na mesma
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
  )
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'name', p.name, 'photo', p.photo_url,
           'matches', coalesce(t.matches, 0),
           'goals',   coalesce(t.goals, 0),
           'assists', coalesce(t.assists, 0),
           'craques', coalesce(cw.wins, 0),
           'bagres',  coalesce(bw.wins, 0))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t    on t.player_id  = p.id
  left join craque_w cw on cw.player_id = p.id
  left join bagre_w bw  on bw.player_id = p.id
  where p.approved;
$$;

-- (0013) totais por período
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
                         and not exists (select 1 from award_votes av where av.match_id = mt.id)))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t on t.player_id = p.id
  where p.approved;
$$;

-- (0012) perfil
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
    'history', (
      select coalesce(json_agg(json_build_object(
               'match_id', m.id, 'played_at', m.played_at,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists,
               'score_a', m.score_a, 'score_b', m.score_b,
               'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
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

-- (0013) química
create or replace function get_player_chemistry(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  with meus as (
    select ms.match_id, ms.team,
           case
             when (ms.team = 'A' and m.score_a > m.score_b)
               or (ms.team = 'B' and m.score_b > m.score_a) then 'V'
             when m.score_a = m.score_b then 'E'
             else 'D'
           end as res
    from match_stats ms
    join matches_validas m on m.id = ms.match_id
    where ms.player_id = p_id and ms.team is not null
  ),
  parceiros as (
    select o.player_id as pid,
           count(*)::int                                as jogos,
           count(*) filter (where meus.res = 'V')::int  as vitorias
    from meus
    join match_stats o
      on o.match_id = meus.match_id and o.team = meus.team and o.player_id <> p_id
    group by o.player_id
  ),
  advers as (
    select o.player_id as pid,
           count(*)::int                                as jogos,
           count(*) filter (where meus.res = 'V')::int  as vitorias
    from meus
    join match_stats o
      on o.match_id = meus.match_id and o.team is not null and o.team <> meus.team
    group by o.player_id
  )
  select json_build_object(
    'parceiros', (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url,
               'jogos', x.jogos, 'vitorias', x.vitorias,
               'pct', round(100.0 * x.vitorias / nullif(x.jogos, 0))::int)
             order by round(100.0 * x.vitorias / nullif(x.jogos, 0)) desc nulls last,
                      x.jogos desc, p.name), '[]'::json)
      from parceiros x join players p on p.id = x.pid),
    'adversarios', (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url,
               'jogos', x.jogos, 'vitorias', x.vitorias,
               'pct', round(100.0 * x.vitorias / nullif(x.jogos, 0))::int)
             order by round(100.0 * x.vitorias / nullif(x.jogos, 0)) desc nulls last,
                      x.jogos desc, p.name), '[]'::json)
      from advers x join players p on p.id = x.pid)
  );
$$;

-- (0017) goleiros
create or replace function get_goalkeeper_stats()
returns json language sql stable security definer set search_path = public, extensions as $$
  with agg as (
    select g.goalkeeper_id                                    as pid,
           count(*)::int                                      as matches,
           coalesce(sum(g.saves), 0)::int                     as saves,
           coalesce(sum(g.goals_conceded), 0)::int            as goals_conceded,
           count(*) filter (where g.goals_conceded = 0)::int  as clean_sheets,
           count(*) filter (
             where g.team is not null
               and ((g.team = 'A' and m.score_a > m.score_b)
                 or (g.team = 'B' and m.score_b > m.score_a)))::int as wins,
           count(*) filter (
             where g.team is not null and m.score_a = m.score_b)::int as draws,
           count(*) filter (
             where g.team is not null
               and ((g.team = 'A' and m.score_a < m.score_b)
                 or (g.team = 'B' and m.score_b < m.score_a)))::int as losses
    from goalkeeper_match_stats g
    join matches_validas m on m.id = g.match_id
    join players gp on gp.id = g.goalkeeper_id and gp.approved
    group by g.goalkeeper_id
  )
  select json_build_object(
    'league', json_build_object(
      'avg_goals_conceded',
      coalesce((select round(sum(a.goals_conceded)::numeric / nullif(sum(a.matches), 0), 2)
                from agg a), 0)
    ),
    'goalkeepers', (
      select coalesce(json_agg(json_build_object(
               'id', p.id, 'name', p.name, 'photo', p.photo_url,
               'player_type',    p.player_type,
               'matches',        coalesce(a.matches, 0),
               'saves',          coalesce(a.saves, 0),
               'goals_conceded', coalesce(a.goals_conceded, 0),
               'clean_sheets',   coalesce(a.clean_sheets, 0),
               'wins',           coalesce(a.wins, 0),
               'draws',          coalesce(a.draws, 0),
               'losses',         coalesce(a.losses, 0))
             order by p.name, p.id), '[]'::json)
      from players p
      left join agg a on a.pid = p.id
      where p.approved and (a.pid is not null or p.player_type = 'GOALKEEPER')
    )
  );
$$;

-- (0016) histórico e destaque — "COMPLETED" passa a "válido"
create or replace function get_matches()
returns json language sql security definer set search_path = public, extensions as $$
  select coalesce(json_agg(match_json(m.id, false) order by m.played_at desc, m.created_at desc), '[]'::json)
  from matches_validas m;
$$;

create or replace function get_latest_match()
returns json language sql security definer set search_path = public, extensions as $$
  select match_json(m.id, true)
  from matches_validas m
  order by m.played_at desc, m.created_at desc limit 1;
$$;

-- ---------- 12. O JSON DO JOGO GANHA O CICLO COMPLETO ----------
-- match_public_json: corpo da 0018 + result_status, cancelamento, craque/
-- bagre (votação + override) e fotos (tabela nova + colunas antigas).
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
    'stats', (
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
    'media', (
      select coalesce(json_agg(json_build_object(
               'id', md.id, 'kind', md.kind, 'data_url', md.data_url,
               'is_primary', md.is_primary, 'created_at', md.created_at)
             order by md.is_primary desc, md.created_at), '[]'::json)
      from match_media md where md.match_id = m.id)
  )
  from matches m where m.id = p_id;
$$;

-- O caminho ANTIGO de registar rodadas (aba "Jogos", 0016) continua a
-- existir enquanto a UI migra. Ele fecha o jogo com status COMPLETED —
-- mas agora "contar" exige result_status PUBLISHED, e sem esta linha as
-- rodadas gravadas por ele ficavam invisíveis nas estatísticas. Corpo
-- igual ao da 0016, mais o carimbo do resultado.
create or replace function admin_save_match(
  p_pw text, p_id uuid, p_played_at date,
  p_team_a_name text, p_team_b_name text,
  p_score_a int, p_score_b int,
  p_winner_photo text, p_location_photo text, p_notes text,
  p_stats jsonb
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_match uuid; r_row record; v_goals int; v_assists int; v_team text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_played_at is null then raise exception 'DATA'; end if;
  if p_stats is null or jsonb_array_length(p_stats) < 3 then raise exception 'JOGADORES'; end if;
  if coalesce(p_score_a,0) < 0 or coalesce(p_score_a,0) > 99
     or coalesce(p_score_b,0) < 0 or coalesce(p_score_b,0) > 99 then raise exception 'PLACAR'; end if;

  if p_id is null then
    insert into matches(played_at, team_a_name, team_b_name, score_a, score_b,
                        winner_photo, location_photo, notes,
                        result_status, result_published_at)
    values (p_played_at, coalesce(nullif(btrim(p_team_a_name),''),'Amarelos'),
            coalesce(nullif(btrim(p_team_b_name),''),'Azuis'),
            coalesce(p_score_a,0), coalesce(p_score_b,0),
            nullif(p_winner_photo,''), nullif(p_location_photo,''), nullif(btrim(p_notes),''),
            'PUBLISHED', now())
    returning id into v_match;
  else
    v_match := p_id;
    update matches set
      played_at = p_played_at,
      team_a_name = coalesce(nullif(btrim(p_team_a_name),''),'Amarelos'),
      team_b_name = coalesce(nullif(btrim(p_team_b_name),''),'Azuis'),
      score_a = coalesce(p_score_a,0), score_b = coalesce(p_score_b,0),
      winner_photo = nullif(p_winner_photo,''),
      location_photo = nullif(p_location_photo,''),
      notes = nullif(btrim(p_notes),''),
      status = 'COMPLETED',
      result_status = 'PUBLISHED',
      result_published_at = coalesce(result_published_at, now())
    where id = v_match;
    if not found then raise exception 'INVALIDO'; end if;
    delete from match_stats where match_id = v_match;
  end if;

  for r_row in select value from jsonb_array_elements(p_stats) loop
    v_goals   := coalesce((r_row.value->>'goals')::int, 0);
    v_assists := coalesce((r_row.value->>'assists')::int, 0);
    v_team    := nullif(r_row.value->>'team', '');
    if v_goals < 0 or v_goals > 99 or v_assists < 0 or v_assists > 99 then raise exception 'STATS'; end if;
    if v_team is not null and v_team not in ('A','B') then raise exception 'STATS'; end if;
    insert into match_stats(match_id, player_id, team, goals, assists)
    values (v_match, (r_row.value->>'player_id')::uuid, v_team, v_goals, v_assists);
  end loop;

  perform registar_atividade(v_match, 'RESULTADO_PUBLICADO',
    jsonb_build_object('via', 'registo_rapido'));

  return v_match;
end; $$;

-- A agenda do admin passa a incluir jogos à espera de resultado e
-- cancelados recentes — é a lista da página de jogos do painel novo.
create or replace function admin_matches_upcoming(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (
    select coalesce(json_agg(match_public_json(t.id) order by t.quando desc, t.created_at desc), '[]'::json)
    from (
      select m.id,
             coalesce(m.kickoff_at, m.played_at::timestamp at time zone 'Europe/Lisbon') as quando,
             m.created_at
      from matches m
      where m.status in ('DRAFT','PUBLISHED','IN_PROGRESS')
         or (m.status = 'COMPLETED' and m.result_status <> 'PUBLISHED')
         or (m.status = 'CANCELLED' and m.cancelled_at > now() - interval '30 days')
    ) t
  );
end; $$;

-- ---------- PERMISSÕES ----------
revoke execute on function registar_atividade(uuid, text, jsonb) from public, anon, authenticated;
-- a view é só um atalho interno das funções; ninguém a lê diretamente
revoke select on matches_validas from public, anon, authenticated;

grant execute on function admin_save_result(text, uuid, int, int, jsonb, jsonb, text, uuid, uuid) to anon, authenticated;
grant execute on function admin_publish_result(text, uuid)       to anon, authenticated;
grant execute on function admin_cancel_match(text, uuid, text)   to anon, authenticated;
grant execute on function admin_add_media(text, uuid, text, text, boolean) to anon, authenticated;
grant execute on function admin_set_primary_media(text, uuid)    to anon, authenticated;
grant execute on function admin_delete_media(text, uuid)         to anon, authenticated;
grant execute on function admin_match_activity(text, uuid)       to anon, authenticated;
grant execute on function admin_publish_match(text, uuid)        to anon, authenticated;
grant execute on function admin_substitute_player(text, uuid, uuid, uuid, int, text) to anon, authenticated;
grant execute on function get_player_stats()                     to anon, authenticated;
grant execute on function get_player_stats_range(date, date)     to anon, authenticated;
grant execute on function get_player_profile(uuid)               to anon, authenticated;
grant execute on function get_player_chemistry(uuid)             to anon, authenticated;
grant execute on function get_goalkeeper_stats()                 to anon, authenticated;
grant execute on function get_matches()                          to anon, authenticated;
grant execute on function get_latest_match()                     to anon, authenticated;
grant execute on function admin_save_match(text, uuid, date, text, text, int, int, text, text, text, jsonb) to anon, authenticated;
grant execute on function match_public_json(uuid)                to anon, authenticated;
grant execute on function admin_matches_upcoming(text)           to anon, authenticated;
