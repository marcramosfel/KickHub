-- KickHub V2 — a nota base viaja com o ranking.
--
-- Havia dois números a chamar-se "overall" e a discordar: o plantel mostrava
-- `pelada_memberships.overall`, escrito à mão por quem administra, e o ranking
-- mostrava um valor calculado a partir das estatísticas. Verificado em staging:
-- a mesma jogadora aparecia com 82 no plantel e 53 no ranking, no mesmo dia. O
-- sorteio usava o primeiro; a tabela publicava o segundo.
--
-- Passa a haver um só overall, calculado. O valor escrito à mão deixa de ser a
-- resposta e passa a ser uma das parcelas da conta — a opinião do grupo sobre
-- o jogador, que nenhuma estatística captura: quem marca a linha, quem corre,
-- quem joga simples.
--
-- Para a conta poder acontecer num sítio só, o ranking tem de trazer essa
-- parcela. É o que esta migration faz: acrescenta `base_rating` ao retorno.
-- Continua a poder ser nulo, e nulo aqui quer dizer "ainda ninguém avaliou" —
-- não "zero". Quem consome tem de deixar a parcela cair, não de a tratar por
-- zero, senão castiga quem nunca foi avaliado.
--
-- O tipo de retorno muda outra vez, portanto larga-se e recria-se a função,
-- pela mesma razão contida da migration anterior.

drop function if exists public.get_pelada_ranking(uuid);

create function public.get_pelada_ranking(p_pelada_id uuid)
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
  losses int,
  is_former boolean,
  base_rating int
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
    (select count(*)::int from outcomes where outcomes.membership_id = member.id and outcomes.outcome = 'loss'),
    member.status <> 'active',
    member.overall
  from public.pelada_memberships member
  left join public.profiles profile on profile.id = member.profile_id
  left join totals on totals.membership_id = member.id
  where member.pelada_id = p_pelada_id
    and (
      member.status = 'active'
      or totals.membership_id is not null
      or exists (select 1 from participation where participation.membership_id = member.id)
    )
    and public.is_active_member(p_pelada_id)
  order by
    coalesce(totals.goals, 0) desc,
    coalesce(totals.assists, 0) desc,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    member.id;
$$;

revoke all on function public.get_pelada_ranking(uuid) from public, anon;
grant execute on function public.get_pelada_ranking(uuid) to authenticated;
