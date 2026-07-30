-- =====================================================================
--  PELADA BROWNS — Migração 21: trocas livres na escalação publicada
--
--  A 0018 abriu UMA porta num sorteio publicado: substituir quem desistiu.
--  Esta abre a segunda, e são as duas que existem: TROCAR dois jogadores
--  de equipa (um de cada lado), ou substituir alguém por opção do admin
--  sem o marcar como desistente. Continua sem haver re-sorteio: cada
--  mexida é cirúrgica, fica na auditoria e aparece no feed.
--
--  `match_substitutions.kind` distingue as duas histórias:
--    DESISTENCIA — "não posso ir" e entrou outro no lugar;
--    TROCA       — o admin mexeu por opção (equilíbrio, atraso, etc.).
--  A distinção importa aos jogadores: uma desistência explica o
--  desequilíbrio, uma troca é decisão — e os dois avisos dizem coisas
--  diferentes.
--
--  Códigos de erro novos: TROCAGK (goleiro só troca com goleiro),
--  MESMAEQUIPA, JOGOMEXIDO (outra pessoa mexeu na escalação primeiro).
-- =====================================================================

-- ---------- O TIPO DA MEXIDA ----------
alter table match_substitutions
  add column if not exists kind text not null default 'DESISTENCIA';

do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'match_substitutions_kind_chk'
      and conrelid = 'public.match_substitutions'::regclass
  ) then
    alter table match_substitutions add constraint match_substitutions_kind_chk
      check (kind in ('DESISTENCIA','TROCA'));
  end if;
end
$chk$;

-- ---------- SUBSTITUIR, AGORA COM O TIPO (0020 → aqui) ----------
-- Corpo da 0020 + p_kind. A versão de 6 argumentos leva drop, senão o
-- PostgREST ficava com duas assinaturas e recusava a chamada.
drop function if exists admin_substitute_player(text, uuid, uuid, uuid, int, text);

create or replace function admin_substitute_player(
  p_pw text, p_match uuid, p_out uuid, p_in uuid, p_in_overall int, p_reason text,
  p_kind text default 'DESISTENCIA'
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text;
  v_linha match_lineup%rowtype;
  v_primaria text;
  v_fora boolean;
  v_out_nome text; v_in_nome text;
  v_sub_id uuid;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_out is null or p_in is null then raise exception 'SEMJOGADOR'; end if;
  if p_out = p_in then raise exception 'MESMOJOGADOR'; end if;
  if p_kind is null or p_kind not in ('DESISTENCIA','TROCA') then raise exception 'INVALIDO'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  -- `for update` tranca a linha até ao fim da transação: sem isto, dois
  -- admins a substituir o MESMO jogador ao mesmo tempo passavam ambos nas
  -- verificações (cada um com o seu snapshot) e o segundo gravava uma
  -- substituição que nunca chegou a acontecer.
  select * into v_linha from match_lineup l
  where l.match_id = p_match and l.player_id = p_out
  for update;
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
  -- cinto e suspensórios: se o update não apanhou nada, alguém mexeu entre
  -- o select e agora — melhor falhar do que registar uma troca fantasma
  if not found then raise exception 'JOGOMEXIDO'; end if;

  insert into match_substitutions(
    match_id, out_player_id, in_player_id, team, assigned_position,
    is_goalkeeper, out_overall, in_overall, reason, kind)
  values (
    p_match, p_out, p_in, v_linha.team, v_linha.assigned_position,
    v_linha.is_goalkeeper, v_linha.overall_at_draw, p_in_overall,
    nullif(btrim(p_reason), ''), p_kind)
  returning id into v_sub_id;

  perform recalcular_forcas_do_jogo(p_match);
  perform registar_atividade(p_match,
    case when p_kind = 'TROCA' then 'JOGADOR_TROCADO' else 'JOGADOR_SUBSTITUIDO' end,
    jsonb_build_object('saiu', p_out, 'entrou', p_in, 'motivo', nullif(btrim(p_reason), '')));

  select p.name into v_out_nome from players p where p.id = p_out;
  select p.name into v_in_nome  from players p where p.id = p_in;
  perform publicar_no_feed(p_match, 'SUBSTITUICAO', '🔄 Mudança na escalação',
    nullif(btrim(p_reason), ''),
    (select jsonb_build_object(
       'sub_id', v_sub_id,
       'kind', p_kind,
       'out_name', v_out_nome, 'in_name', v_in_nome,
       'team', v_linha.team, 'position', v_linha.assigned_position,
       'is_goalkeeper', v_linha.is_goalkeeper,
       'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall,
       'kickoff_at', m.kickoff_at)
     from matches m where m.id = p_match));

  return match_public_json(p_match);
end; $$;

-- ---------- REGISTO DAS TROCAS ENTRE EQUIPAS ----------
-- Uma troca não cabe em `match_substitutions`: ali há um que sai e um que
-- entra, e numa troca continuam os dois a jogar. Tabela própria — e é ela
-- que dá o "Desfazer" e a explicação aos jogadores quando o equilíbrio
-- muda sem ninguém ter desistido.
create table if not exists match_swaps (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references matches(id) on delete cascade,
  a_player_id   uuid not null references players(id) on delete cascade,
  b_player_id   uuid not null references players(id) on delete cascade,
  a_team        text not null check (a_team in ('A','B')),  -- de onde A veio
  b_team        text not null check (b_team in ('A','B')),
  a_position    text not null,
  b_position    text not null,
  is_goalkeeper boolean not null default false,
  a_overall     int,
  b_overall     int,
  reason        text,
  created_at    timestamptz not null default now()
);

alter table match_swaps enable row level security;

create index if not exists match_swaps_match_idx on match_swaps (match_id, created_at);

-- ---------- TROCAR DOIS JOGADORES DE EQUIPA ----------
-- Um de cada lado; cada um assume o LUGAR do outro. Goleiro só troca com
-- goleiro (senão uma equipa ficava sem ninguém na baliza). A justificação
-- é opcional de propósito — trocar é uma decisão do admin, não um evento
-- que precise de desculpa.
--
-- O apagar+inserir em vez de dois updates não é estilo: o índice único
-- (match_id, team, assigned_position) é verificado a cada linha alterada,
-- e o primeiro update punha dois jogadores no mesmo lugar por um instante
-- — rebentava com 23505 antes de o segundo update compor as coisas.
create or replace function admin_swap_players(
  p_pw text, p_match uuid, p_a uuid, p_b uuid, p_reason text default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text;
  la match_lineup%rowtype;
  lb match_lineup%rowtype;
  v_nome_a text; v_nome_b text;
  v_swap_id uuid;
  v_apagadas int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_a is null or p_b is null then raise exception 'SEMJOGADOR'; end if;
  if p_a = p_b then raise exception 'MESMOJOGADOR'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  -- as duas linhas ficam trancadas até ao commit; sem isto, dois admins a
  -- confirmar a MESMA troca em simultâneo desfaziam-na um ao outro em
  -- silêncio (o segundo delete apanhava as linhas já trocadas) e o feed
  -- ficava com dois posts de uma troca que no fim não aconteceu.
  -- Ordenados por id para dois pedidos cruzados não ficarem em impasse.
  perform 1 from match_lineup l
  where l.match_id = p_match and l.player_id in (p_a, p_b)
  order by l.player_id
  for update;

  select * into la from match_lineup l where l.match_id = p_match and l.player_id = p_a;
  if not found then raise exception 'SEMLINEUP'; end if;
  select * into lb from match_lineup l where l.match_id = p_match and l.player_id = p_b;
  if not found then raise exception 'SEMLINEUP'; end if;

  if la.team = lb.team then raise exception 'MESMAEQUIPA'; end if;
  if la.is_goalkeeper <> lb.is_goalkeeper then raise exception 'TROCAGK'; end if;

  delete from match_lineup
  where match_id = p_match and player_id in (p_a, p_b);
  get diagnostics v_apagadas = row_count;
  if v_apagadas <> 2 then raise exception 'JOGOMEXIDO'; end if;

  -- cada um herda equipa E lugar do outro; o overall e a posição preferida
  -- congelados no sorteio viajam com o jogador (são dele, não do lugar) —
  -- ler `players.primary_position` outra vez aqui punha o histórico a mudar
  -- quando o admin corrigisse uma posição depois da publicação
  insert into match_lineup(match_id, player_id, team, assigned_position,
                           preferred_position, was_out_of_position,
                           overall_at_draw, is_goalkeeper)
  values
    (p_match, p_a, lb.team, lb.assigned_position, la.preferred_position,
     (not lb.is_goalkeeper) and (la.preferred_position is distinct from lb.assigned_position),
     la.overall_at_draw, lb.is_goalkeeper),
    (p_match, p_b, la.team, la.assigned_position, lb.preferred_position,
     (not la.is_goalkeeper) and (lb.preferred_position is distinct from la.assigned_position),
     lb.overall_at_draw, la.is_goalkeeper);

  insert into match_swaps(match_id, a_player_id, b_player_id, a_team, b_team,
                          a_position, b_position, is_goalkeeper,
                          a_overall, b_overall, reason)
  values (p_match, p_a, p_b, la.team, lb.team,
          la.assigned_position, lb.assigned_position, la.is_goalkeeper,
          la.overall_at_draw, lb.overall_at_draw, nullif(btrim(p_reason), ''))
  returning id into v_swap_id;

  perform recalcular_forcas_do_jogo(p_match);
  perform registar_atividade(p_match, 'JOGADORES_TROCADOS',
    jsonb_build_object('a', p_a, 'b', p_b, 'motivo', nullif(btrim(p_reason), '')));

  select p.name into v_nome_a from players p where p.id = p_a;
  select p.name into v_nome_b from players p where p.id = p_b;
  perform publicar_no_feed(p_match, 'SUBSTITUICAO', '🔁 Troca de times',
    nullif(btrim(p_reason), ''),
    (select jsonb_build_object(
       'swap', true,
       'swap_id', v_swap_id,
       'a_name', v_nome_a, 'a_team', lb.team,   -- para onde FOI
       'b_name', v_nome_b, 'b_team', la.team,
       'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall,
       'kickoff_at', m.kickoff_at)
     from matches m where m.id = p_match));

  return match_public_json(p_match);
end; $$;

-- ---------- DESFAZER UMA TROCA ----------
-- Como no desfazer das substituições: só se ninguém mexeu por cima, ou seja,
-- se cada um ainda está no lugar que herdou do outro.
create or replace function admin_undo_swap(p_pw text, p_swap uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  s match_swaps%rowtype;
  v_status text;
  la match_lineup%rowtype;
  lb match_lineup%rowtype;
  v_apagadas int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select * into s from match_swaps x where x.id = p_swap;
  if not found then raise exception 'INVALIDO'; end if;

  select m.status into v_status from matches m where m.id = s.match_id;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  perform 1 from match_lineup l
  where l.match_id = s.match_id and l.player_id in (s.a_player_id, s.b_player_id)
  order by l.player_id
  for update;

  -- A está no lugar de B e B no lugar de A? Se não, houve outra mexida.
  select * into la from match_lineup l
  where l.match_id = s.match_id and l.player_id = s.a_player_id
    and l.team = s.b_team and l.assigned_position = s.b_position;
  if not found then raise exception 'SUBTROCADA'; end if;
  select * into lb from match_lineup l
  where l.match_id = s.match_id and l.player_id = s.b_player_id
    and l.team = s.a_team and l.assigned_position = s.a_position;
  if not found then raise exception 'SUBTROCADA'; end if;

  delete from match_lineup
  where match_id = s.match_id and player_id in (s.a_player_id, s.b_player_id);
  get diagnostics v_apagadas = row_count;
  if v_apagadas <> 2 then raise exception 'JOGOMEXIDO'; end if;

  insert into match_lineup(match_id, player_id, team, assigned_position,
                           preferred_position, was_out_of_position,
                           overall_at_draw, is_goalkeeper)
  values
    (s.match_id, s.a_player_id, s.a_team, s.a_position, la.preferred_position,
     (not s.is_goalkeeper) and (la.preferred_position is distinct from s.a_position),
     la.overall_at_draw, s.is_goalkeeper),
    (s.match_id, s.b_player_id, s.b_team, s.b_position, lb.preferred_position,
     (not s.is_goalkeeper) and (lb.preferred_position is distinct from s.b_position),
     lb.overall_at_draw, s.is_goalkeeper);

  delete from match_swaps where id = p_swap;

  delete from match_publications
  where match_id = s.match_id
    and type = 'SUBSTITUICAO'
    and payload->>'swap_id' = p_swap::text;

  perform recalcular_forcas_do_jogo(s.match_id);

  return match_public_json(s.match_id);
end; $$;

-- ---------- O JSON PÚBLICO GANHA `kind` E `swaps` ----------
-- Corpo da 0020 + duas coisas: `kind` em cada substituição (sem ele o
-- frontend não distinguia desistência de troca — a razão de ser da coluna)
-- e o array `swaps`, para as trocas entre equipas explicarem o equilíbrio
-- novo em vez de o mudarem sem deixar rasto.
create or replace function match_public_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', m.id,
    'kickoff_at', m.kickoff_at,
    'played_at', m.played_at,
    'location', m.location,
    'map_url', m.map_url,
    'status', m.status,
    'result_status', m.result_status,
    'published_at', m.published_at,
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
grant execute on function admin_substitute_player(text, uuid, uuid, uuid, int, text, text) to anon, authenticated;
grant execute on function admin_swap_players(text, uuid, uuid, uuid, text)                 to anon, authenticated;
grant execute on function admin_undo_swap(text, uuid)                                      to anon, authenticated;
grant execute on function match_public_json(uuid)                                          to anon, authenticated;
