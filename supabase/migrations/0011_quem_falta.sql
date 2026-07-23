-- =====================================================================
--  PELADA BROWNS — Migração 11: painel "quem falta votar" (admin)
--
--  Devolve, numa só chamada:
--    1. quem jogou a rodada mais recente e ainda não votou craque/bagre;
--    2. quem ainda tem avaliações (notas 0-5) por dar, e quantas faltam.
--
--  Só leitura — não altera nada. Protegido pela senha de admin.
-- =====================================================================

create or replace function admin_pending_votes(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_match uuid; v_played date; v_total int; v_voted int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  -- rodada mais recente (se houver)
  select m.id, m.played_at into v_match, v_played
  from matches m order by m.played_at desc, m.created_at desc limit 1;

  if v_match is not null then
    select count(*) into v_total from match_stats where match_id = v_match;
    select count(*) into v_voted from award_votes where match_id = v_match;
  end if;

  return json_build_object(
    'match', case when v_match is null then null else json_build_object(
      'id', v_match, 'played_at', v_played, 'total', v_total, 'voted', v_voted
    ) end,

    -- 1) jogaram a última rodada mas ainda não votaram craque/bagre
    'award_pending', (
      select coalesce(json_agg(json_build_object(
               'id', p.id, 'name', p.name, 'user_id', p.user_id) order by p.name), '[]'::json)
      from match_stats ms
      join players p on p.id = ms.player_id
      where ms.match_id = v_match
        and not exists (
          select 1 from award_votes av
          where av.match_id = v_match and av.voter_id = ms.player_id
        )
    ),

    -- 2) ainda têm notas por dar (e quantas faltam)
    'ratings_pending', (
      select coalesce(json_agg(t order by t.faltam desc, t.name), '[]'::json)
      from (
        select me.id, me.name, me.user_id, count(*)::int as faltam
        from players me
        join players outro
          on outro.approved and outro.id <> me.id
         and not exists (
           select 1 from ratings r
           where r.rater_id = me.id and r.target_id = outro.id
         )
        where me.approved
        group by me.id, me.name, me.user_id
      ) t
    )
  );
end; $$;

grant execute on function admin_pending_votes(text) to anon, authenticated;
