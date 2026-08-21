-- KickHub V2 — os títulos ganham escalões, e o ranking passa a medir a invencibilidade.
--
-- A especificação dos bónus da Browns divide os títulos em ouro, prata e bronze,
-- e acrescenta títulos que o servidor ainda não sabia medir. Dos dez que ficam
-- calculáveis com o que a pelada regista hoje, nove saem de colunas que a RPC já
-- devolvia. O décimo — 💪 Invicto, a **maior** sequência sem perder — não: a
-- sequência que existia era a de vitórias **vivas**, que é um estado, e esta é
-- um recorde.
--
-- Calcula-se por ilhas: numerando os jogos de cada jogador por ordem cronológica,
-- a diferença entre a posição e a contagem dentro do grupo mantém-se constante
-- enquanto a série sem derrota durar, e muda assim que ela quebra. Cada valor
-- dessa diferença é uma série; a maior delas é o recorde.
--
-- `get_my_player_profile` leva a mesma lista de títulos que `computeTitles`
-- aplica ao ranking. São duas implementações da mesma regra, o que é um risco
-- real de divergência — mas o perfil calcula os títulos no servidor e a tabela
-- calcula-os no cliente, e uni-las era um trabalho maior do que este. Se
-- divergirem, o overall do perfil deixa de bater certo com o da tabela para a
-- mesma pessoa.

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
  best_unbeaten_streak int,
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
  -- A maior sequencia sem perder de sempre, e nao a viva: e um recorde, nao um
  -- estado. Ilhas de jogos consecutivos sem derrota — a diferenca entre a
  -- posicao e a contagem dentro do grupo e constante enquanto a ilha durar.
  cronologico as (
    select
      membership_id,
      outcome,
      row_number() over (partition by membership_id order by scheduled_at, membership_id) as pos
    from resultados_ordenados
  ),
  ilhas as (
    select
      membership_id,
      outcome,
      pos - row_number() over (
        partition by membership_id, (outcome <> 'loss') order by pos
      ) as ilha
    from cronologico
  ),
  invencibilidade as (
    select membership_id, max(tamanho)::int as best_unbeaten_streak
    from (
      select membership_id, ilha, count(*)::int as tamanho
      from ilhas where outcome <> 'loss'
      group by membership_id, ilha
    ) corridas
    group by membership_id
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
    coalesce(invencibilidade.best_unbeaten_streak, 0),
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
  left join invencibilidade on invencibilidade.membership_id = member.id
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

revoke all on function public.get_pelada_ranking(uuid) from public, anon;
grant execute on function public.get_pelada_ranking(uuid) to authenticated;

create or replace function public.get_my_player_profile()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
  v_peladas jsonb;
begin
  select * into v_profile
  from public.profiles
  where id = public.current_profile_id() and deleted_at is null;

  if not found then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', pelada.id,
      'slug', pelada.slug,
      'name', pelada.name,
      'city', pelada.city,
      'country_code', pelada.country_code,
      'role', member.role,
      'membership_id', member.id,
      'player_type', member.player_type,
      'primary_position', member.primary_position,
      'secondary_position', member.secondary_position,
      'member_count', (
        select count(*)::int from public.pelada_memberships active_member
        where active_member.pelada_id = pelada.id and active_member.status = 'active'
      ),
      'stats', sport.payload
    ) order by pelada.created_at desc, pelada.id
  ), '[]'::jsonb)
  into v_peladas
  from public.pelada_memberships member
  join public.peladas pelada on pelada.id = member.pelada_id and pelada.status = 'active'
  left join lateral (
    with ranking as materialized (
      select * from public.get_pelada_ranking(member.pelada_id)
    ),
    mine as (
      select * from ranking where membership_id = member.id
    )
    select to_jsonb(mine) || jsonb_build_object(
      'titles', array_remove(array[
        case when mine.goals > 0 and mine.goals = (select max(goals) from ranking) then 'topScorer' end,
        case when mine.assists > 0 and mine.assists = (select max(assists) from ranking) then 'topAssists' end,
        case when mine.wins > 0 and mine.wins = (select max(wins) from ranking) then 'mostWins' end,
        case when mine.craques > 0 and mine.craques = (select max(craques) from ranking) then 'mostCraques' end,
        case when mine.games_played > 0 and mine.games_played = (select max(games_played) from ranking) then 'mostGames' end,
        case when mine.current_win_streak >= 3 then 'winStreak' end,
        -- Os títulos abaixo entraram com os escalões. Esta lista é a mesma que
        -- `computeTitles` aplica ao ranking: se as duas divergirem, o overall do
        -- perfil deixa de bater certo com o da tabela, para a mesma pessoa.
        case when mine.best_unbeaten_streak > 0
          and mine.best_unbeaten_streak = (select max(best_unbeaten_streak) from ranking)
          then 'unbeaten' end,
        case when mine.gk_clean_sheets > 0
          and mine.gk_clean_sheets = (select max(gk_clean_sheets) from ranking)
          then 'wall' end,
        case when mine.saves > 0 and mine.saves = (select max(saves) from ranking)
          then 'saves' end,
        -- Aproveitamento, só entre quem tem o mínimo de rodadas: sem o filtro,
        -- quem ganhou o único jogo que fez liderava com 100%.
        case when mine.games_played >= 3 and (3 * mine.wins + mine.draws) > 0
          and (3.0 * mine.wins + mine.draws) / (3.0 * mine.games_played) = (
            select max((3.0 * outro.wins + outro.draws) / (3.0 * outro.games_played))
            from ranking outro where outro.games_played >= 3
          )
          then 'accuracy' end
      ]::text[], null),
      'gk_league_conceded_per_game', (
        select sum(gk_conceded)::numeric / nullif(sum(gk_matches), 0)
        from ranking
      )
    ) as payload
    from mine
  ) sport on true
  where member.profile_id = v_profile.id and member.status = 'active';

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'username', v_profile.username,
      'display_name', v_profile.display_name,
      -- O caminho so sai daqui quando o objeto ja esta no bucket; o bucket vai
      -- junto porque e ele que diz ao cliente que isto precisa de assinatura e
      -- nao e um URL que o browser carregue sozinho.
      'avatar_path', public.ready_avatar_path(v_profile.avatar_path, v_profile.avatar_status),
      'avatar_bucket_id', v_profile.avatar_bucket_id,
      'bio', v_profile.bio,
      'country_code', v_profile.country_code,
      'city', v_profile.city,
      'locale', v_profile.locale,
      'timezone', v_profile.timezone
    ),
    'peladas', v_peladas
  );
end;
$$;

revoke all on function public.get_my_player_profile() from public, anon;
grant execute on function public.get_my_player_profile() to authenticated;
