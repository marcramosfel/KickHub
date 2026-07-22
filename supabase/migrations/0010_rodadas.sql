-- =====================================================================
--  PELADA BROWNS — Migração 10: resumo completo da rodada
--
--  Estende o sistema de partidas (matches/match_stats) já existente com:
--    - nome de cada time + placar final
--    - time de cada jogador (A/B)
--    - foto do time vencedor + foto do local + observações
--
--  Não duplica nada: reutiliza matches/match_stats e as regras de gols/
--  assistências/craque/bagre. Rodadas antigas continuam válidas (time = null,
--  placar 0-0, sem fotos) e a app trata esses casos com empty states.
-- =====================================================================

-- ---------- COLUNAS NOVAS ----------
alter table matches add column if not exists team_a_name   text not null default 'Amarelos';
alter table matches add column if not exists team_b_name   text not null default 'Azuis';
alter table matches add column if not exists score_a       int  not null default 0;
alter table matches add column if not exists score_b       int  not null default 0;
alter table matches add column if not exists winner_photo   text; -- base64, opcional
alter table matches add column if not exists location_photo text; -- base64, opcional
alter table matches add column if not exists notes          text; -- opcional

alter table match_stats add column if not exists team text; -- 'A' | 'B' | null (rodadas antigas)

-- ---------- JSON de uma rodada (partilhado) ----------
-- p_photos = false devolve tudo menos as fotos grandes (para listas leves).
create or replace function match_json(p_id uuid, p_photos boolean)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', m.id, 'played_at', m.played_at, 'created_at', m.created_at,
    'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
    'score_a', m.score_a, 'score_b', m.score_b,
    'notes', m.notes,
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
    'votes', (select count(*)::int from award_votes av where av.match_id = m.id),
    'craque', (
      select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
               order by t.n desc, t.nome), '[]'::json)
      from (select av.craque_id as pid, p.name as nome, count(*)::int as n
              from award_votes av join players p on p.id = av.craque_id
             where av.match_id = m.id group by av.craque_id, p.name) t),
    'bagre', (
      select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
               order by t.n desc, t.nome), '[]'::json)
      from (select av.bagre_id as pid, p.name as nome, count(*)::int as n
              from award_votes av join players p on p.id = av.bagre_id
             where av.match_id = m.id group by av.bagre_id, p.name) t)
  )
  from matches m where m.id = p_id;
$$;

-- ---------- LISTAS / DETALHE ----------

-- Todas as rodadas (recente → antiga), SEM as fotos grandes (lista leve).
create or replace function get_matches()
returns json language sql security definer set search_path = public, extensions as $$
  select coalesce(json_agg(match_json(m.id, false) order by m.played_at desc, m.created_at desc), '[]'::json)
  from matches m;
$$;

-- A rodada mais recente, COM fotos (para o destaque "Campeões da semana").
create or replace function get_latest_match()
returns json language sql security definer set search_path = public, extensions as $$
  select match_json(m.id, true)
  from matches m order by m.played_at desc, m.created_at desc limit 1;
$$;

-- Uma rodada específica, COM fotos (para "Ver detalhes").
create or replace function get_match(p_id uuid)
returns json language sql security definer set search_path = public, extensions as $$
  select match_json(p_id, true);
$$;

-- ---------- CRIAR / EDITAR RODADA ----------
-- p_id = null cria; senão atualiza (apaga e regrava os stats).
-- p_stats: [{player_id, team, goals, assists}]
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
    insert into matches(played_at, team_a_name, team_b_name, score_a, score_b, winner_photo, location_photo, notes)
    values (p_played_at, coalesce(nullif(btrim(p_team_a_name),''),'Amarelos'),
            coalesce(nullif(btrim(p_team_b_name),''),'Azuis'),
            coalesce(p_score_a,0), coalesce(p_score_b,0),
            nullif(p_winner_photo,''), nullif(p_location_photo,''), nullif(btrim(p_notes),''))
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
      notes = nullif(btrim(p_notes),'')
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

  return v_match;
end; $$;

-- ---------- PERMISSÕES ----------
grant execute on function get_matches()          to anon, authenticated;
grant execute on function get_latest_match()     to anon, authenticated;
grant execute on function get_match(uuid)        to anon, authenticated;
grant execute on function admin_save_match(text, uuid, date, text, text, int, int, text, text, text, jsonb) to anon, authenticated;
