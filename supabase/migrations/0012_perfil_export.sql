-- =====================================================================
--  PELADA BROWNS — Migração 12: perfil do jogador + exportação de dados
--
--  1) get_player_profile(id): tudo de um jogador numa chamada — média,
--     jogos, gols, assistências, títulos de craque/bagre e o HISTÓRICO
--     rodada a rodada (com o time, o placar e se foi craque/bagre nessa
--     rodada). O histórico permite calcular troféus e sequências no
--     frontend, sem queries extra.
--
--  2) admin_export(pw, com_fotos): snapshot dos dados em JSON para
--     guardares como backup. NÃO exporta os hashes de PIN (segurança).
--
--  Ambas são SÓ LEITURA — não alteram nada.
-- =====================================================================

create or replace function get_player_profile(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  with craque_top as (
    select av.match_id, av.craque_id as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av group by av.match_id, av.craque_id
  ),
  bagre_top as (
    select av.match_id, av.bagre_id as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av group by av.match_id, av.bagre_id
  )
  select json_build_object(
    'id', p.id, 'name', p.name, 'user_id', p.user_id, 'photo', p.photo_url,
    'avg',     (select round(avg(r.score)::numeric, 2) from ratings r where r.target_id = p.id),
    'votes',   (select count(*) from ratings r where r.target_id = p.id),
    'matches', (select count(*) from match_stats ms where ms.player_id = p.id),
    'goals',   (select coalesce(sum(ms.goals), 0) from match_stats ms where ms.player_id = p.id),
    'assists', (select coalesce(sum(ms.assists), 0) from match_stats ms where ms.player_id = p.id),
    'craques', (select count(*) from craque_top ct where ct.pid = p.id and ct.n = ct.top),
    'bagres',  (select count(*) from bagre_top  bt where bt.pid = p.id and bt.n = bt.top),
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
      from match_stats ms join matches m on m.id = ms.match_id
      where ms.player_id = p.id
    )
  )
  from players p where p.id = p_id;
$$;

-- Snapshot dos dados para backup. p_photos = true inclui as fotos (fica
-- bem maior). Nunca exporta pin_hash.
create or replace function admin_export(p_pw text, p_photos boolean)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return json_build_object(
    'exported_at', now(),
    'com_fotos', coalesce(p_photos, false),
    'players', (
      select coalesce(json_agg(json_build_object(
               'id', p.id, 'name', p.name, 'user_id', p.user_id, 'dob', p.dob,
               'approved', p.approved, 'is_admin', p.is_admin, 'created_at', p.created_at,
               'photo', case when p_photos then p.photo_url else null end)
             order by p.created_at), '[]'::json) from players p),
    'ratings', (
      select coalesce(json_agg(json_build_object(
               'rater_id', r.rater_id, 'target_id', r.target_id, 'score', r.score)), '[]'::json)
      from ratings r),
    'matches', (
      select coalesce(json_agg(json_build_object(
               'id', m.id, 'played_at', m.played_at,
               'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
               'score_a', m.score_a, 'score_b', m.score_b, 'notes', m.notes,
               'winner_photo',   case when p_photos then m.winner_photo   else null end,
               'location_photo', case when p_photos then m.location_photo else null end)
             order by m.played_at), '[]'::json) from matches m),
    'match_stats', (
      select coalesce(json_agg(json_build_object(
               'match_id', ms.match_id, 'player_id', ms.player_id,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists)), '[]'::json)
      from match_stats ms),
    'award_votes', (
      select coalesce(json_agg(json_build_object(
               'match_id', av.match_id, 'voter_id', av.voter_id,
               'craque_id', av.craque_id, 'bagre_id', av.bagre_id)), '[]'::json)
      from award_votes av)
  );
end; $$;

grant execute on function get_player_profile(uuid)      to anon, authenticated;
grant execute on function admin_export(text, boolean)   to anon, authenticated;
