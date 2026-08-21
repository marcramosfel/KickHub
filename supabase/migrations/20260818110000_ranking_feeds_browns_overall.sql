-- KickHub V2 — o ranking passa a alimentar a fórmula da Pelada Browns.
--
-- A especificação do overall da Browns é autoritativa, e a implementação
-- divergia dela em dois pontos que o servidor decide.
--
-- **A curva do saldo acima do esperado.** Era uma logística de base `e` com
-- escala 5. A especificação define uma logística de base 10 com escala 100,
-- calibrada para esta pelada: 35 pontos de diferença de força dão ~69% ao
-- favorito. Com escala 5, esses mesmos 35 pontos davam ~99,9% — praticamente
-- uma vitória certa — e o saldo de toda a gente colapsava contra zero, porque
-- ganhar quando "era certo" não vale nada e perder vale tudo. A parcela existia
-- e não media coisa nenhuma.
--
-- **As vitórias do guarda-redes.** A escala da baliza pede `vitórias / rodadas`,
-- e o servidor devolvia pontos: 1 por vitória e 0,5 por empate. Um empate não é
-- meia vitória para quem esteve lá atrás. `gk_win_points` dá lugar a `gk_wins`.
--
-- Muda o tipo de retorno, portanto leva `drop` antes do `create` — `create or
-- replace` recusa-o com 42P13.

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
  wae_matches int,
  current_win_streak int,
  gk_matches int,
  gk_saves int,
  gk_conceded int,
  gk_clean_sheets int,
  gk_wins int,
  -- Distingue quem a pelada trata como guarda-redes de quem apenas calhou
  -- comecar na baliza numa rodada de rotacao. O dominio precisa da diferenca.
  player_type text,
  -- O caminho so sai daqui quando o objeto ja esta no bucket. Enquanto a foto
  -- estiver pendente ou falhada, ninguem a ve meia carregada.
  avatar_path text,
  avatar_bucket text
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
      -- Logistica a base 10 com escala 100, calibrada para esta pelada: 35
      -- pontos de diferenca dao ~69% ao favorito. A versao anterior usava base
      -- `e` com escala 5, o que fazia a mesma diferenca valer praticamente uma
      -- vitoria certa e esmagava o saldo de toda a gente contra zero.
      1.0 / (1.0 + power(10.0, -(
        (case when lineup.team = 'A' then forca_a.media - forca_b.media
              else forca_b.media - forca_a.media end) / 100.0
      ))) as saldo
    from public.game_lineups lineup
    join played_games on played_games.id = lineup.game_id
    join public.game_results result on result.game_id = lineup.game_id
    join forcas forca_a on forca_a.game_id = lineup.game_id and forca_a.team = 'A'
    join forcas forca_b on forca_b.game_id = lineup.game_id and forca_b.team = 'B'
  ),
  -- A sequência de vitórias é sobre **agora**: conta-se do jogo mais recente
  -- para trás e pára na primeira não-vitória. Um empate corta a sequência tal
  -- como uma derrota — a marca é de vitórias seguidas, não de invencibilidade.
  resultados_ordenados as (
    select
      lineup.membership_id,
      game.scheduled_at,
      case
        when result.score_a = result.score_b then 'draw'
        when (lineup.team = 'A') = (result.score_a > result.score_b) then 'win'
        else 'loss'
      end as outcome
    from public.game_lineups lineup
    join played_games on played_games.id = lineup.game_id
    join public.games game on game.id = lineup.game_id
    join public.game_results result on result.game_id = lineup.game_id
  ),
  numerados as (
    select
      membership_id,
      outcome,
      row_number() over (partition by membership_id order by scheduled_at desc, membership_id) as pos
    from resultados_ordenados
  ),
  primeira_quebra as (
    select membership_id, min(pos) as pos
    from numerados where outcome <> 'win' group by membership_id
  ),
  sequencia as (
    select
      numerados.membership_id,
      -- Sem quebra, a sequência é tudo o que jogou.
      coalesce(primeira_quebra.pos - 1, max(numerados.pos))::int as current_win_streak
    from numerados
    left join primeira_quebra on primeira_quebra.membership_id = numerados.membership_id
    group by numerados.membership_id, primeira_quebra.pos
  ),
  -- O que um guarda-redes faz não cabe na fórmula de campo: não marca e não
  -- assiste. Os golos sofridos por ele são os da equipa adversária naquele
  -- jogo, e é a partir daí que tudo o resto se deriva.
  jogos_na_baliza as (
    select
      lineup.membership_id,
      lineup.game_id,
      case when lineup.team = 'A' then result.score_b else result.score_a end as sofridos,
      case
        when result.score_a = result.score_b then 0.5
        when (lineup.team = 'A') = (result.score_a > result.score_b) then 1.0
        else 0.0
      end as pontos,
      case
        when result.score_a = result.score_b then 0
        when (lineup.team = 'A') = (result.score_a > result.score_b) then 1
        else 0
      end as vitoria
    from public.game_lineups lineup
    join played_games on played_games.id = lineup.game_id
    join public.game_results result on result.game_id = lineup.game_id
    where lineup.is_goalkeeper
  ),
  guarda_redes as (
    select
      jogos_na_baliza.membership_id,
      count(*)::int as gk_matches,
      coalesce(sum(stat.saves), 0)::int as gk_saves,
      sum(jogos_na_baliza.sofridos)::int as gk_conceded,
      count(*) filter (where jogos_na_baliza.sofridos = 0)::int as gk_clean_sheets,
      -- A escala da baliza mede `vitorias / rodadas`, nao pontos: um empate nao
      -- e meia vitoria para quem esteve la atras.
      sum(jogos_na_baliza.vitoria)::int as gk_wins
    from jogos_na_baliza
    left join public.game_player_stats stat
      on stat.game_id = jogos_na_baliza.game_id
     and stat.membership_id = jogos_na_baliza.membership_id
    group by jogos_na_baliza.membership_id
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
    coalesce(wae.wae_matches, 0),
    -- Zero é um facto: quem nunca ganhou não tem sequência nenhuma.
    coalesce(sequencia.current_win_streak, 0),
    -- Zero rodadas na baliza é um facto, não uma ausência: quem nunca lá esteve
    -- não é julgado pela escala do guarda-redes. A média da pelada, contra a
    -- qual os golos sofridos se comparam, é calculada no domínio a partir destas
    -- linhas — é outra quantidade que exige olhar para o plantel inteiro.
    coalesce(guarda_redes.gk_matches, 0),
    coalesce(guarda_redes.gk_saves, 0),
    coalesce(guarda_redes.gk_conceded, 0),
    coalesce(guarda_redes.gk_clean_sheets, 0),
    coalesce(guarda_redes.gk_wins, 0),
    member.player_type,
    public.ready_avatar_path(profile.avatar_path, profile.avatar_status),
    profile.avatar_bucket_id
  from public.pelada_memberships member
  left join public.profiles profile on profile.id = member.profile_id
  left join totals on totals.membership_id = member.id
  left join ratings on ratings.membership_id = member.id
  left join awards on awards.membership_id = member.id
  left join wae on wae.membership_id = member.id
  left join sequencia on sequencia.membership_id = member.id
  left join guarda_redes on guarda_redes.membership_id = member.id
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
