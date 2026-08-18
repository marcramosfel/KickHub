-- KickHub V2 — o guarda-redes rotativo deixa de ser confundido com um titular.
--
-- Três defeitos apareceram juntos assim que o histórico real da Browns entrou:
--
--  1. Quem guardou a baliza numa rodada antiga existia apenas em
--     `goalkeeper_match_stats`. O backfill dava-lhe presença e defesas, mas
--     nenhuma linha em `game_lineups` — logo, sem equipa, aparecia no ranking
--     com jogos e defesas e um registo `0-0-0`. Pior: a média de forças daquele
--     jogo era calculada a menos de um jogador, e é dessa média que sai o saldo
--     acima do esperado de toda a gente que jogou com ele.
--
--  2. `match_lineup.is_goalkeeper` no legado marca **quem começou na baliza**,
--     não quem é guarda-redes. Numa pelada de goleiros rotativos os dois são
--     coisas diferentes, e o ranking não tinha como as distinguir: `player_type`
--     não saía de `get_pelada_ranking`.
--
--  3. A Browns joga com rotação, mas as definições ficaram em `fixed`.
--
-- A migration é append-only e repetível: `create or replace` nas duas funções e
-- um `backfill_browns_history()` no fim, que repara instalações onde os dados já
-- entraram. Em instalação limpa é um no-op.

create or replace function public.backfill_browns_history()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_browns constant uuid := '00000000-0000-4000-8000-000000000101';
  v_owner constant uuid := '00000000-0000-4000-8000-000000000001';
  v_result jsonb;
begin
  if not exists (select 1 from public.peladas where id = v_browns and slug = 'browns') then
    raise exception 'BROWNS_TENANT_NOT_FOUND';
  end if;

  -- Um UUID legado não pode ocupar um jogo de outra pelada. Fazer esta
  -- verificação antes dos upserts evita uma importação parcialmente silenciosa.
  if exists (
    select 1
    from public.matches legacy
    join public.games game on game.id = legacy.id
    where game.pelada_id <> v_browns
  ) then
    raise exception 'BROWNS_GAME_ID_COLLISION';
  end if;

  -- ---------------------------------------------------------------- profiles
  -- IDs determinísticos tornam a repetição segura. O username não reutiliza o
  -- `user_id` legado: esse identificador era credencial de login juntamente
  -- com o PIN, e não deve ganhar significado global no KickHub.
  insert into public.profiles (
    id, username, display_name, avatar_path, locale, timezone, privacy, created_at
  )
  select
    public.browns_profile_id(player.id),
    'br-' || left(replace(player.id::text, '-', ''), 24),
    player.name,
    player.photo_url,
    'pt',
    'Europe/Zurich',
    '{"profile":"members","stats":"members"}'::jsonb,
    player.created_at
  from public.players player
  on conflict (id) do nothing;

  -- ------------------------------------------------------------- memberships
  -- `is_member` no legado significava mensalista, não autorização para jogar.
  -- Quem já tinha sido aprovado continua ativo; só pedidos ainda não aprovados
  -- permanecem pendentes. Administradores legados tornam-se admins locais; o
  -- owner técnico criado na Foundation continua a garantir um dono único.
  insert into public.pelada_memberships (
    id, pelada_id, profile_id, legacy_player_id, role, status, nickname,
    player_type, primary_position, secondary_position,
    accepts_other_positions, overall, joined_at, approved_at, approved_by,
    created_at
  )
  select
    public.browns_membership_id(player.id),
    v_browns,
    public.browns_profile_id(player.id),
    player.id,
    case when player.is_admin then 'admin' else 'player' end,
    case when player.approved then 'active' else 'pending' end,
    nullif(btrim(player.nickname), ''),
    case when player.player_type = 'GOALKEEPER' then 'GOALKEEPER' else 'FIELD' end,
    case
      when player.primary_position = 'GK' then 'GK'
      when player.primary_position like 'DEF-%' then 'DEF'
      when player.primary_position like 'MID-%' then 'MID'
      when player.primary_position = 'ST' then 'ATT'
      else null
    end,
    case
      when player.secondary_position = 'GK' then 'GK'
      when player.secondary_position like 'DEF-%' then 'DEF'
      when player.secondary_position like 'MID-%' then 'MID'
      when player.secondary_position = 'ST' then 'ATT'
      else null
    end,
    player.accepts_other_positions,
    group_rating.overall,
    player.created_at,
    case when player.approved then player.created_at else null end,
    case when player.approved then v_owner else null end,
    player.created_at
  from public.players player
  left join lateral (
    select greatest(1, least(99, round(avg(rating.score) * 20)::int)) as overall
    from public.ratings rating
    where rating.target_id = player.id and rating.score is not null
  ) group_rating on true
  on conflict (legacy_player_id) do update
  set profile_id = coalesce(public.pelada_memberships.profile_id, excluded.profile_id);

  -- ------------------------------------------------------------------- games
  insert into public.games (
    id, pelada_id, scheduled_at, duration_minutes, location, format,
    team_size, max_players, status, notes, created_by, created_at, updated_at,
    cancelled_at, draw_seed, drawn_at
  )
  select
    legacy.id,
    v_browns,
    coalesce(
      legacy.kickoff_at,
      legacy.played_at::timestamp at time zone 'Europe/Zurich'
    ),
    90,
    nullif(btrim(legacy.location), ''),
    case
      when legacy.team_size in (5, 6, 7, 8, 11) then legacy.team_size::text || 'x' || legacy.team_size::text
      else 'custom'
    end,
    greatest(3, least(15, coalesce(legacy.team_size, 7))),
    greatest(6, least(30, coalesce(legacy.team_size, 7) * 2)),
    case
      when legacy.status = 'CANCELLED' then 'cancelled'
      when legacy.status = 'COMPLETED' or legacy.result_status in ('DRAFT', 'PUBLISHED') then 'played'
      else 'scheduled'
    end,
    nullif(left(btrim(coalesce(legacy.notes, '')), 500), ''),
    creator.id,
    legacy.created_at,
    greatest(legacy.created_at, coalesce(legacy.result_published_at, legacy.published_at, legacy.created_at)),
    case when legacy.status = 'CANCELLED'
      then coalesce(legacy.cancelled_at, legacy.kickoff_at, legacy.created_at)
      else null
    end,
    legacy.draw_seed,
    case when exists (select 1 from public.match_lineup lineup where lineup.match_id = legacy.id)
      then coalesce(legacy.published_at, legacy.created_at)
      else null
    end
  from public.matches legacy
  left join public.pelada_memberships creator
    on creator.pelada_id = v_browns and creator.legacy_player_id = legacy.created_by
  on conflict (id) do update
  set scheduled_at = excluded.scheduled_at,
      location = excluded.location,
      format = excluded.format,
      team_size = excluded.team_size,
      max_players = excluded.max_players,
      status = excluded.status,
      notes = excluded.notes,
      cancelled_at = excluded.cancelled_at,
      draw_seed = excluded.draw_seed,
      drawn_at = excluded.drawn_at,
      updated_at = excluded.updated_at
  where public.games.pelada_id = excluded.pelada_id;

  -- -------------------------------------------------------------- attendance
  -- Primeiro entram as respostas. Depois, quem efetivamente apareceu numa
  -- escalação/estatística prevalece como confirmado, mesmo que a resposta
  -- antiga tenha ficado desatualizada.
  insert into public.game_attendance (
    game_id, membership_id, pelada_id, status, note, responded_at
  )
  select
    availability.match_id,
    member.id,
    v_browns,
    case when availability.available then 'confirmed' else 'declined' end,
    nullif(left(btrim(coalesce(availability.note, '')), 200), ''),
    availability.responded_at
  from public.match_availability availability
  join public.games game on game.id = availability.match_id and game.pelada_id = v_browns
  join public.pelada_memberships member
    on member.pelada_id = v_browns and member.legacy_player_id = availability.player_id
  on conflict (game_id, membership_id) do update
  set status = excluded.status, note = excluded.note, responded_at = excluded.responded_at;

  insert into public.game_attendance (
    game_id, membership_id, pelada_id, status, responded_at
  )
  select participant.match_id, member.id, v_browns, 'confirmed', game.scheduled_at
  from (
    select match_id, player_id from public.match_stats
    union
    select match_id, player_id from public.match_lineup
    union
    select match_id, goalkeeper_id from public.goalkeeper_match_stats
  ) participant
  join public.games game on game.id = participant.match_id and game.pelada_id = v_browns
  join public.pelada_memberships member
    on member.pelada_id = v_browns and member.legacy_player_id = participant.player_id
  on conflict (game_id, membership_id) do update
  set status = 'confirmed';

  -- ---------------------------------------------------------------- lineups
  insert into public.game_lineups (
    game_id, membership_id, pelada_id, team, is_goalkeeper,
    overall_at_draw, overall_estimated, created_at
  )
  select
    lineup.match_id,
    member.id,
    v_browns,
    lineup.team,
    lineup.is_goalkeeper,
    greatest(1, least(99, coalesce(lineup.overall_at_draw, member.overall, 50))),
    lineup.overall_at_draw is null,
    lineup.created_at
  from public.match_lineup lineup
  join public.games game on game.id = lineup.match_id and game.pelada_id = v_browns
  join public.pelada_memberships member
    on member.pelada_id = v_browns and member.legacy_player_id = lineup.player_id
  on conflict (game_id, membership_id) do update
  set team = excluded.team,
      is_goalkeeper = excluded.is_goalkeeper,
      overall_at_draw = excluded.overall_at_draw,
      overall_estimated = excluded.overall_estimated,
      created_at = excluded.created_at;

  -- Rodadas anteriores à escalação persistida ainda têm equipa em
  -- `match_stats`. Criar a linha mínima mantém vitórias/derrotas históricas.
  insert into public.game_lineups (
    game_id, membership_id, pelada_id, team, is_goalkeeper,
    overall_at_draw, overall_estimated, created_at
  )
  select
    stat.match_id,
    member.id,
    v_browns,
    stat.team,
    exists (
      select 1 from public.goalkeeper_match_stats keeper
      where keeper.match_id = stat.match_id and keeper.goalkeeper_id = stat.player_id
    ),
    greatest(1, least(99, coalesce(member.overall, 50))),
    true,
    game.created_at
  from public.match_stats stat
  join public.games game on game.id = stat.match_id and game.pelada_id = v_browns
  join public.pelada_memberships member
    on member.pelada_id = v_browns and member.legacy_player_id = stat.player_id
  where stat.team in ('A', 'B')
  on conflict (game_id, membership_id) do nothing;

  -- Quem guardou a baliza podia nunca ter chegado a `match_lineup`: nas rodadas
  -- antigas o guarda-redes ficava registado apenas em `goalkeeper_match_stats`.
  -- Sem linha de escalação ele entrava no ranking com jogos e defesas mas sem
  -- equipa — logo sem vitória nem derrota, sem rodada na baliza — e a média de
  -- forças daquele jogo era calculada a menos de um jogador, o que enviesava o
  -- saldo acima do esperado de toda a gente que jogou com ele.
  --
  -- Vem depois dos outros dois inserts de propósito: `is_goalkeeper` das duas
  -- origens é disjunto no legado, e quem defendeu tem a última palavra.
  insert into public.game_lineups (
    game_id, membership_id, pelada_id, team, is_goalkeeper,
    overall_at_draw, overall_estimated, created_at
  )
  select
    keeper.match_id,
    member.id,
    v_browns,
    keeper.team,
    true,
    greatest(1, least(99, coalesce(member.overall, 50))),
    true,
    coalesce(keeper.created_at, game.created_at)
  from public.goalkeeper_match_stats keeper
  join public.games game on game.id = keeper.match_id and game.pelada_id = v_browns
  join public.pelada_memberships member
    on member.pelada_id = v_browns and member.legacy_player_id = keeper.goalkeeper_id
  where keeper.team in ('A', 'B')
  on conflict (game_id, membership_id) do update
  set is_goalkeeper = true;

  -- ------------------------------------------------------------ result/stats
  insert into public.game_results (
    game_id, pelada_id, score_a, score_b, notes, recorded_by, recorded_at, updated_at
  )
  select
    legacy.id,
    v_browns,
    legacy.score_a,
    legacy.score_b,
    nullif(left(btrim(coalesce(legacy.notes, '')), 500), ''),
    recorder.id,
    coalesce(legacy.result_published_at, legacy.published_at, legacy.created_at),
    coalesce(legacy.result_published_at, legacy.published_at, legacy.created_at)
  from public.matches legacy
  join public.games game on game.id = legacy.id and game.pelada_id = v_browns and game.status = 'played'
  left join public.pelada_memberships recorder
    on recorder.pelada_id = v_browns and recorder.legacy_player_id = legacy.created_by
  on conflict (game_id) do update
  set score_a = excluded.score_a,
      score_b = excluded.score_b,
      notes = excluded.notes,
      recorded_by = excluded.recorded_by,
      recorded_at = excluded.recorded_at,
      updated_at = excluded.updated_at;

  with participants as (
    select match_id, player_id from public.match_stats
    union
    select match_id, goalkeeper_id from public.goalkeeper_match_stats
  )
  insert into public.game_player_stats (
    game_id, membership_id, pelada_id, goals, assists, own_goals, saves
  )
  select
    participant.match_id,
    member.id,
    v_browns,
    coalesce(stat.goals, 0),
    coalesce(stat.assists, 0),
    coalesce(stat.own_goals, 0),
    coalesce(keeper.saves, 0)
  from participants participant
  join public.games game on game.id = participant.match_id and game.pelada_id = v_browns
  join public.pelada_memberships member
    on member.pelada_id = v_browns and member.legacy_player_id = participant.player_id
  left join public.match_stats stat
    on stat.match_id = participant.match_id and stat.player_id = participant.player_id
  left join public.goalkeeper_match_stats keeper
    on keeper.match_id = participant.match_id and keeper.goalkeeper_id = participant.player_id
  on conflict (game_id, membership_id) do update
  set goals = excluded.goals,
      assists = excluded.assists,
      own_goals = excluded.own_goals,
      saves = excluded.saves;

  -- -------------------------------------------------------- post-game ratings
  -- Zero era permitido pelo schema antigo, mas significava ausência; o modelo
  -- novo usa apenas estrelas efetivamente dadas, de 1 a 5.
  insert into public.game_ratings (
    game_id, rater_membership_id, rated_membership_id, pelada_id,
    stars, created_at, updated_at
  )
  select
    rating.match_id,
    rater.id,
    rated.id,
    v_browns,
    rating.stars,
    rating.created_at,
    rating.updated_at
  from public.post_match_ratings rating
  join public.games game on game.id = rating.match_id and game.pelada_id = v_browns
  join public.pelada_memberships rater
    on rater.pelada_id = v_browns and rater.legacy_player_id = rating.rater_id
  join public.pelada_memberships rated
    on rated.pelada_id = v_browns and rated.legacy_player_id = rating.target_id
  where rating.stars between 1 and 5 and rating.rater_id <> rating.target_id
  on conflict (game_id, rater_membership_id, rated_membership_id) do update
  set stars = excluded.stars, updated_at = excluded.updated_at;

  -- ------------------------------------------------------------ award votes
  insert into public.game_award_votes (
    game_id, voter_membership_id, award, nominee_membership_id,
    pelada_id, created_at, updated_at
  )
  select
    vote.match_id,
    voter.id,
    nominee.award,
    nominated.id,
    v_browns,
    vote.created_at,
    vote.created_at
  from public.award_votes vote
  cross join lateral (values
    ('craque'::text, vote.craque_id),
    ('bagre'::text, vote.bagre_id)
  ) nominee(award, player_id)
  join public.games game on game.id = vote.match_id and game.pelada_id = v_browns
  join public.pelada_memberships voter
    on voter.pelada_id = v_browns and voter.legacy_player_id = vote.voter_id
  join public.pelada_memberships nominated
    on nominated.pelada_id = v_browns and nominated.legacy_player_id = nominee.player_id
  where vote.voter_id <> nominee.player_id
  on conflict (game_id, voter_membership_id, award) do update
  set nominee_membership_id = excluded.nominee_membership_id,
      updated_at = excluded.updated_at;

  insert into public.game_award_decisions (game_id, award, pelada_id, source, decided_at)
  select
    legacy.id,
    candidate.award,
    v_browns,
    case when candidate.override_id is not null then 'admin' else 'votes' end,
    coalesce(legacy.voting_closed_at, legacy.result_published_at, legacy.created_at)
  from public.matches legacy
  cross join lateral (values
    ('craque'::text, coalesce(legacy.craque_final, legacy.craque_override), legacy.craque_override),
    ('bagre'::text, coalesce(legacy.bagre_final, legacy.bagre_override), legacy.bagre_override)
  ) candidate(award, winner_id, override_id)
  join public.games game on game.id = legacy.id and game.pelada_id = v_browns
  where legacy.voting_status = 'CLOSED' or candidate.winner_id is not null
  on conflict (game_id, award) do update
  set source = excluded.source, decided_at = excluded.decided_at;

  -- Uma decisão administrativa pode dizer "ninguém foi bagre". Apaga-se o
  -- vencedor anterior apenas para as decisões que vieram do legado, antes de
  -- recolocar o vencedor atual (se houver).
  delete from public.game_awards award
  using public.matches legacy
  where award.game_id = legacy.id
    and award.pelada_id = v_browns
    and (
      (award.award = 'craque' and (legacy.voting_status = 'CLOSED' or legacy.craque_final is not null or legacy.craque_override is not null))
      or
      (award.award = 'bagre' and (legacy.voting_status = 'CLOSED' or legacy.bagre_final is not null or legacy.bagre_override is not null))
    );

  insert into public.game_awards (game_id, award, membership_id, pelada_id)
  select legacy.id, candidate.award, winner.id, v_browns
  from public.matches legacy
  cross join lateral (values
    ('craque'::text, coalesce(legacy.craque_final, legacy.craque_override)),
    ('bagre'::text, coalesce(legacy.bagre_final, legacy.bagre_override))
  ) candidate(award, winner_id)
  join public.pelada_memberships winner
    on winner.pelada_id = v_browns and winner.legacy_player_id = candidate.winner_id
  join public.game_award_decisions decision
    on decision.game_id = legacy.id and decision.award = candidate.award
  where candidate.winner_id is not null
  on conflict (game_id, award, membership_id) do nothing;

  -- -------------------------------------------------------------- reconcile
  v_result := jsonb_build_object(
    'legacy_players', (select count(*) from public.players),
    'profiles', (select count(*) from public.pelada_memberships where pelada_id = v_browns and legacy_player_id is not null),
    'legacy_matches', (select count(*) from public.matches),
    'games', (
      select count(*) from public.games game
      join public.matches legacy on legacy.id = game.id
      where game.pelada_id = v_browns
    ),
    'legacy_match_stats', (select count(*) from public.match_stats),
    'game_player_stats', (
      select count(*) from public.game_player_stats stat
      join public.matches legacy on legacy.id = stat.game_id
      where stat.pelada_id = v_browns
    ),
    'legacy_goals', (select coalesce(sum(goals), 0) from public.match_stats),
    'goals', (
      select coalesce(sum(stat.goals), 0) from public.game_player_stats stat
      join public.matches legacy on legacy.id = stat.game_id
      where stat.pelada_id = v_browns
    ),
    'legacy_assists', (select coalesce(sum(assists), 0) from public.match_stats),
    'assists', (
      select coalesce(sum(stat.assists), 0) from public.game_player_stats stat
      join public.matches legacy on legacy.id = stat.game_id
      where stat.pelada_id = v_browns
    ),
    'legacy_post_ratings', (select count(*) from public.post_match_ratings where stars between 1 and 5 and rater_id <> target_id),
    'game_ratings', (
      select count(*) from public.game_ratings rating
      join public.matches legacy on legacy.id = rating.game_id
      where rating.pelada_id = v_browns
    ),
    'legacy_award_choices', (
      select count(*) from public.award_votes vote
      cross join lateral (values (vote.craque_id), (vote.bagre_id)) choice(player_id)
      where vote.voter_id <> choice.player_id
    ),
    'game_award_votes', (
      select count(*) from public.game_award_votes vote
      join public.matches legacy on legacy.id = vote.game_id
      where vote.pelada_id = v_browns
    )
  );

  if (v_result->>'legacy_players')::int <> (v_result->>'profiles')::int
    or (v_result->>'legacy_matches')::int <> (v_result->>'games')::int
    or (v_result->>'legacy_match_stats')::int > (v_result->>'game_player_stats')::int
    or (v_result->>'legacy_goals')::int <> (v_result->>'goals')::int
    or (v_result->>'legacy_assists')::int <> (v_result->>'assists')::int
    or (v_result->>'legacy_post_ratings')::int <> (v_result->>'game_ratings')::int
    or (v_result->>'legacy_award_choices')::int <> (v_result->>'game_award_votes')::int
  then
    raise exception 'BROWNS_RECONCILIATION_FAILED: %', v_result;
  end if;

  if (v_result->>'legacy_players')::int > 0 then
    insert into public.tenant_audit_log (
      pelada_id, actor_profile_id, action, entity_type, entity_id, metadata
    ) values (
      v_browns, null, 'browns.history_backfilled', 'pelada', v_browns, v_result
    );
  end if;

  return v_result;
end;
$$;

comment on function public.backfill_browns_history() is
  'Projeta as tabelas legadas restauradas da Pelada Browns no modelo multi-tenant e valida contagens/agregados.';

revoke all on function public.backfill_browns_history() from public, anon, authenticated;
grant execute on function public.backfill_browns_history() to service_role;

-- ------------------------------------------------------------------ ranking
-- `player_type` passa a atravessar a fronteira. É o único sinal que separa
-- "a pelada trata-o como guarda-redes" de "calhou-lhe a baliza nesta rodada",
-- e sem ele o domínio não consegue escolher a escala certa.

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
  gk_win_points numeric,
  -- Distingue quem a pelada trata como guarda-redes de quem apenas calhou
  -- comecar na baliza numa rodada de rotacao. O dominio precisa da diferenca.
  player_type text
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
      end as pontos
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
      sum(jogos_na_baliza.pontos)::numeric as gk_win_points
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
    coalesce(guarda_redes.gk_win_points, 0),
    member.player_type
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

-- ----------------------------------------------------------------- Browns
-- A Browns sempre jogou com goleiros rotativos; ficou em `fixed` porque esse é
-- o default da tabela e ninguém o corrigiu no cutover.
update public.pelada_settings
set goalkeeper_mode = 'rotating', updated_at = now()
where pelada_id = '00000000-0000-4000-8000-000000000101'
  and goalkeeper_mode = 'fixed';

-- Repara instalações onde o histórico já tinha entrado sem a linha de
-- escalação do guarda-redes. Em instalação limpa não há legado e é um no-op.
select public.backfill_browns_history();
