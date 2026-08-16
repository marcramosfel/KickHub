-- KickHub V2 — quem sai não apaga o que fez.
--
-- Remover um membro passou a ser possível na migration anterior, e a interface
-- promete que "o histórico de jogos mantém-se". No ranking não se mantinha: a
-- consulta filtrava por `member.status = 'active'`, portanto quem saía levava
-- consigo os golos, as assistências e as vitórias da tabela por jogador.
--
-- Verificado com dados reais em staging: um jogador com 3 golos e uma escalação
-- desapareceu do ranking no instante em que foi removido. As linhas ficavam nas
-- tabelas — o que as escondia era o modelo de leitura.
--
-- Pior do que a ausência era a incoerência: `get_pelada_totals` soma
-- `game_player_stats` pela pelada e não pelo membro, portanto o total continuava
-- a contar esses golos. O mesmo ecrã mostrava um total que as suas próprias
-- linhas já não somavam.
--
-- Quem saiu passa a aparecer, marcado como antigo membro, desde que tenha
-- história. Um membro removido que nunca jogou não tem nada para mostrar e fica
-- de fora — o ranking é sobre o que aconteceu em campo, não sobre quem passou
-- pela lista.
--
-- O tipo de retorno muda, o que obriga a largar e recriar a função. É
-- deliberadamente contido: `get_pelada_ranking` é lida apenas pelo ecrã de
-- ranking e estatísticas, ao contrário de `list_my_peladas`, que é lida em todo
-- o produto e por isso foi poupada a este tratamento noutra fatia.

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
  is_former boolean
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
    member.status <> 'active'
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
