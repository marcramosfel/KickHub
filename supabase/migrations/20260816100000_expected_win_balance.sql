-- KickHub V2 — saldo de vitórias acima do esperado.
--
-- A pergunta não é "ganhaste?" — é "ganhaste mais do que era suposto?".
--
-- A taxa de vitórias crua não serve, e numa pelada com sorteio equilibrado é
-- pior do que inútil: o motor existe para igualar as equipas, portanto se ele
-- funcionar as taxas convergem para 50% e a parcela mede ruído. Verificado
-- neste próprio staging — o único jogo com escalação tem as duas equipas em
-- 70,40 de média, ou seja, uma probabilidade de 50/50 por construção.
--
-- Por isso mede-se o **saldo**: por cada rodada, o resultado real menos o que a
-- diferença de forças previa. Ganhar sendo favorito a 93% vale +0,07; ganhar
-- sendo favorito a 74% vale +0,26.
--
-- ## A probabilidade esperada
--
-- Sai de uma logística sobre a diferença de médias de overall congelado no
-- sorteio: `1 / (1 + e^(-(mediaMinha - mediaDelas) / 5))`.
--
-- O 5 é uma escolha, e é a única constante inventada aqui. Foi calibrada para
-- os exemplos do próprio modelo caírem onde ele diz: 93% de favoritismo exige
-- cerca de 13 pontos de diferença de média, e 74% cerca de 5. Numa pelada, uma
-- equipa 13 pontos acima em média é de facto uma equipa muito mais forte, e uma
-- diferença de 5 é a vantagem ligeira que o sorteio costuma deixar.
--
-- A **média** e não a soma: equipas com número diferente de jogadores não devem
-- parecer mais fortes só por serem mais.
--
-- Só entram rodadas com escalação **e** resultado — sem saber de que lado se
-- jogou não há expectativa a comparar. É a mesma razão pela qual as vitórias já
-- só contavam a partir da escalação.
--
-- O que a nota e o peso deslizante fazem com este saldo vive no domínio, em
-- `player-overall.ts`, com o resto da conta.

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
  base_rating int,
  post_rating_avg numeric,
  post_rating_count int,
  craques int,
  bagres int,
  wae_saldo numeric,
  wae_matches int
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
  -- A força de cada equipa naquele jogo é a média dos overalls congelados no
  -- sorteio. A média e não a soma: equipas com número diferente de jogadores
  -- não devem parecer mais fortes só por serem mais.
  forcas as (
    select lineup.game_id, lineup.team, avg(lineup.overall_at_draw)::numeric as media
    from public.game_lineups lineup
    join played_games on played_games.id = lineup.game_id
    group by lineup.game_id, lineup.team
  ),
  saldo_por_jogo as (
    select
      lineup.membership_id,
      case
        when result.score_a = result.score_b then 0.5
        when (lineup.team = 'A') = (result.score_a > result.score_b) then 1.0
        else 0.0
      end
      -
      1.0 / (1.0 + exp(-(
        (case when lineup.team = 'A' then forca_a.media - forca_b.media
              else forca_b.media - forca_a.media end) / 5.0
      ))) as saldo
    from public.game_lineups lineup
    join played_games on played_games.id = lineup.game_id
    join public.game_results result on result.game_id = lineup.game_id
    join forcas forca_a on forca_a.game_id = lineup.game_id and forca_a.team = 'A'
    join forcas forca_b on forca_b.game_id = lineup.game_id and forca_b.team = 'B'
  ),
  wae as (
    select
      saldo_por_jogo.membership_id,
      sum(saldo_por_jogo.saldo)::numeric as wae_saldo,
      count(*)::int as wae_matches
    from saldo_por_jogo
    group by saldo_por_jogo.membership_id
  ),
  awards as (
    select
      winner.membership_id,
      count(*) filter (where winner.award = 'craque')::int as craques,
      count(*) filter (where winner.award = 'bagre')::int as bagres
    from public.pelada_award_winners(p_pelada_id) winner
    group by winner.membership_id
  ),
  ratings as (
    select
      rating.rated_membership_id as membership_id,
      avg(rating.stars)::numeric as post_rating_avg,
      count(*)::int as post_rating_count
    from public.game_ratings rating
    where rating.pelada_id = p_pelada_id
    group by rating.rated_membership_id
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
    member.overall,
    -- Deliberadamente sem `coalesce`: nulo quer dizer "ainda ninguém o avaliou",
    -- e a parcela tem de cair da conta em vez de valer zero. A contagem, essa,
    -- é mesmo zero — zero avaliações é um facto, não uma ausência.
    ratings.post_rating_avg,
    coalesce(ratings.post_rating_count, 0),
    -- Contagens são factos: zero prémios é mesmo zero, não uma ausência.
    coalesce(awards.craques, 0),
    coalesce(awards.bagres, 0),
    -- Nulo quando não houve rodada medida: sem jogo com escalação e resultado
    -- não há saldo, e a parcela tem de cair em vez de valer "exactamente o
    -- esperado". A contagem, essa, é mesmo zero.
    wae.wae_saldo,
    coalesce(wae.wae_matches, 0)
  from public.pelada_memberships member
  left join public.profiles profile on profile.id = member.profile_id
  left join totals on totals.membership_id = member.id
  left join ratings on ratings.membership_id = member.id
  left join awards on awards.membership_id = member.id
  left join wae on wae.membership_id = member.id
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
