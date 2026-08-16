-- KickHub V2 — ranking e estatísticas acumuladas por pelada.
--
-- A agregação acontece no banco e não no cliente: trazer todos os jogos e
-- somá-los no browser deixaria de funcionar à segunda época, e obrigaria a
-- expor linha a linha o que aqui sai já consolidado.
--
-- Participação e resultado são contados de fontes diferentes de propósito:
--
--   jogos disputados  ← escalação sorteada OU presença confirmada
--   vitórias/derrotas ← apenas escalação, porque só ela diz de que lado se jogou
--
-- Uma pelada que registe o placar sem sortear equipas continua a ver golos e
-- assistências; o que não aparece é o saldo de vitórias, porque ninguém sabe
-- quem estava em que equipa. Inventar isso seria pior do que deixar a zero.

create or replace function public.get_pelada_ranking(p_pelada_id uuid)
returns table (
  membership_id uuid,
  display_name text,
  games_played int,
  goals int,
  assists int,
  own_goals int,
  saves int,
  wins int,
  draws int,
  losses int
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with played_games as (
    select game.id, game.pelada_id
    from public.games game
    where game.pelada_id = p_pelada_id
      and game.status = 'played'
  ),
  participation as (
    select lineup.membership_id, lineup.game_id
    from public.game_lineups lineup
    join played_games on played_games.id = lineup.game_id
    union
    select attendance.membership_id, attendance.game_id
    from public.game_attendance attendance
    join played_games on played_games.id = attendance.game_id
    where attendance.status = 'confirmed'
  ),
  outcomes as (
    select
      lineup.membership_id,
      case
        when lineup.team = 'A' and result.score_a > result.score_b then 'win'
        when lineup.team = 'B' and result.score_b > result.score_a then 'win'
        when result.score_a = result.score_b then 'draw'
        else 'loss'
      end as outcome
    from public.game_lineups lineup
    join played_games on played_games.id = lineup.game_id
    join public.game_results result on result.game_id = lineup.game_id
  ),
  totals as (
    select
      stat.membership_id,
      sum(stat.goals)::int as goals,
      sum(stat.assists)::int as assists,
      sum(stat.own_goals)::int as own_goals,
      sum(stat.saves)::int as saves
    from public.game_player_stats stat
    join played_games on played_games.id = stat.game_id
    group by stat.membership_id
  )
  select
    member.id,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    (select count(*)::int from participation where participation.membership_id = member.id),
    coalesce(totals.goals, 0),
    coalesce(totals.assists, 0),
    coalesce(totals.own_goals, 0),
    coalesce(totals.saves, 0),
    (select count(*)::int from outcomes where outcomes.membership_id = member.id and outcomes.outcome = 'win'),
    (select count(*)::int from outcomes where outcomes.membership_id = member.id and outcomes.outcome = 'draw'),
    (select count(*)::int from outcomes where outcomes.membership_id = member.id and outcomes.outcome = 'loss')
  from public.pelada_memberships member
  left join public.profiles profile on profile.id = member.profile_id
  left join totals on totals.membership_id = member.id
  where member.pelada_id = p_pelada_id
    and member.status = 'active'
    and public.is_active_member(p_pelada_id)
  order by
    coalesce(totals.goals, 0) desc,
    coalesce(totals.assists, 0) desc,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    member.id;
$$;

-- Números da comunidade, para o cabeçalho das estatísticas.
create or replace function public.get_pelada_totals(p_pelada_id uuid)
returns table (
  games_played int,
  goals int,
  assists int,
  active_members int
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*)::int from public.games
      where pelada_id = p_pelada_id and status = 'played'),
    (select coalesce(sum(stat.goals), 0)::int from public.game_player_stats stat
      where stat.pelada_id = p_pelada_id),
    (select coalesce(sum(stat.assists), 0)::int from public.game_player_stats stat
      where stat.pelada_id = p_pelada_id),
    (select count(*)::int from public.pelada_memberships
      where pelada_id = p_pelada_id and status = 'active')
  where public.is_active_member(p_pelada_id);
$$;

revoke all on function public.get_pelada_ranking(uuid) from public, anon;
revoke all on function public.get_pelada_totals(uuid) from public, anon;

grant execute on function public.get_pelada_ranking(uuid) to authenticated;
grant execute on function public.get_pelada_totals(uuid) to authenticated;
