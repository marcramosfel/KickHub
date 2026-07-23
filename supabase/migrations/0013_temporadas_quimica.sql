-- =====================================================================
--  PELADA BROWNS — Migração 13: rankings por período + "química"
--
--  1) get_player_stats_range(de, ate): os mesmos totais do get_player_stats
--     mas filtrados por datas (temporadas / últimos 30 dias / etc.).
--     Passar NULL nas duas datas = desde sempre.
--
--  2) get_player_chemistry(id): com quem este jogador ganha mais quando
--     joga do MESMO lado (parceiros) e contra quem se dá melhor/pior
--     (adversários).
--
--  Ambas SÓ LEITURA — não alteram nada.
-- =====================================================================

create or replace function get_player_stats_range(p_from date, p_to date)
returns json language sql stable security definer set search_path = public, extensions as $$
  with mt as (
    select m.id from matches m
    where (p_from is null or m.played_at >= p_from)
      and (p_to   is null or m.played_at <= p_to)
  ),
  craque_t as (
    select av.craque_id as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av
    where av.match_id in (select id from mt)
    group by av.match_id, av.craque_id
  ),
  bagre_t as (
    select av.bagre_id as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av
    where av.match_id in (select id from mt)
    group by av.match_id, av.bagre_id
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
           'craques', (select count(*) from craque_t c where c.pid = p.id and c.n = c.top),
           'bagres',  (select count(*) from bagre_t  b where b.pid = p.id and b.n = b.top))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t on t.player_id = p.id
  where p.approved;
$$;

-- Com quem ganha mais (mesmo time) e contra quem se dá melhor.
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
    join matches m on m.id = ms.match_id
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

grant execute on function get_player_stats_range(date, date) to anon, authenticated;
grant execute on function get_player_chemistry(uuid)         to anon, authenticated;
