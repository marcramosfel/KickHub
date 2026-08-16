-- KickHub V2 — estrelas pós-jogo.
--
-- Quem esteve em campo avalia os **companheiros de equipa** daquele jogo, de 1
-- a 5. Não se avalia o adversário: ninguém viu jogar quem tinha pelas costas, e
-- deixar avaliar quem se defronta transforma a nota numa arma.
--
-- As estrelas são **privadas por desenho**. Cada um vê o que deu e mais nada; o
-- que a pelada vê é a média. Saber quem deu dois envenena o balneário, e uma
-- pelada é um grupo de amigos antes de ser uma tabela. A RLS reflete isso: a
-- política de leitura só devolve as linhas de quem pergunta.
--
-- A escrita não tem política nenhuma. Passa toda por `rate_game_players`, que
-- valida o que o cliente não pode garantir:
--
--   * o jogo já foi disputado (avaliar antes do apito não faz sentido);
--   * quem avalia esteve escalado nesse jogo;
--   * quem é avaliado esteve escalado **na mesma equipa**;
--   * ninguém se avalia a si próprio;
--   * a nota está entre 1 e 5.
--
-- Sem estas verificações no servidor, a RPC deixava qualquer sessão escrever
-- notas sobre quem quisesse, em qualquer jogo de qualquer pelada.

create table public.game_ratings (
  game_id uuid not null,
  rater_membership_id uuid not null,
  rated_membership_id uuid not null,
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, rater_membership_id, rated_membership_id),
  constraint game_ratings_not_self check (rater_membership_id <> rated_membership_id),
  foreign key (game_id, pelada_id) references public.games (id, pelada_id) on delete cascade,
  foreign key (rater_membership_id, pelada_id) references public.pelada_memberships (id, pelada_id) on delete cascade,
  foreign key (rated_membership_id, pelada_id) references public.pelada_memberships (id, pelada_id) on delete cascade
);

-- A leitura agregada procura por avaliado; a do próprio, por avaliador.
create index game_ratings_rated_idx on public.game_ratings (pelada_id, rated_membership_id);

alter table public.game_ratings enable row level security;

-- Só as próprias. Não há política de escrita: a RPC é o único caminho.
create policy game_ratings_own_read on public.game_ratings
  for select using (
    public.is_active_member(pelada_id)
    and rater_membership_id in (
      select id from public.pelada_memberships
      where pelada_id = game_ratings.pelada_id
        and profile_id = public.current_profile_id()
    )
  );

create or replace function public.rate_game_players(
  p_game_id uuid,
  p_ratings jsonb
)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_rater uuid;
  v_team text;
  v_written int;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if v_game.status <> 'played' then
    raise exception 'GAME_NOT_PLAYED';
  end if;

  select id into v_rater
  from public.pelada_memberships
  where pelada_id = v_game.pelada_id
    and profile_id = public.current_profile_id()
    and status = 'active';
  if v_rater is null then
    raise exception 'FORBIDDEN';
  end if;

  -- Quem não jogou não avalia. A equipa de quem avalia é o que define quem ele
  -- pode avaliar, e vem da escalação — não do que o cliente enviar.
  select team into v_team
  from public.game_lineups
  where game_id = p_game_id and membership_id = v_rater;
  if v_team is null then
    raise exception 'NOT_IN_LINEUP';
  end if;

  with proposta as (
    select
      (entry->>'membership_id')::uuid as rated,
      (entry->>'stars')::smallint as stars
    from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb)) as entry
  ),
  validada as (
    select proposta.rated, proposta.stars
    from proposta
    join public.game_lineups companheiro
      on companheiro.game_id = p_game_id
     and companheiro.membership_id = proposta.rated
     and companheiro.team = v_team
    where proposta.rated <> v_rater
  ),
  gravada as (
    insert into public.game_ratings (
      game_id, rater_membership_id, rated_membership_id, pelada_id, stars
    )
    select p_game_id, v_rater, validada.rated, v_game.pelada_id, validada.stars
    from validada
    on conflict (game_id, rater_membership_id, rated_membership_id)
      do update set stars = excluded.stars, updated_at = now()
    returning 1
  )
  select count(*)::int into v_written from gravada;

  -- Uma proposta com nomes que não são companheiros de equipa não é um engano
  -- inofensivo: é o cliente a pedir algo que não devia. Recusa-se inteira em vez
  -- de gravar a parte aceitável em silêncio.
  if v_written <> (select count(*)::int from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb))) then
    raise exception 'INVALID_RATING_TARGET';
  end if;

  return v_written;
end;
$$;

-- O que eu dei neste jogo, para o formulário abrir com as notas já escolhidas.
create or replace function public.get_my_game_ratings(p_game_id uuid)
returns table (rated_membership_id uuid, stars smallint)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select rating.rated_membership_id, rating.stars
  from public.game_ratings rating
  join public.games game on game.id = rating.game_id
  where rating.game_id = p_game_id
    and public.is_active_member(game.pelada_id)
    and rating.rater_membership_id in (
      select id from public.pelada_memberships
      where pelada_id = game.pelada_id
        and profile_id = public.current_profile_id()
    );
$$;

revoke all on function public.rate_game_players(uuid, jsonb) from public, anon;
revoke all on function public.get_my_game_ratings(uuid) from public, anon;

grant execute on function public.rate_game_players(uuid, jsonb) to authenticated;
grant execute on function public.get_my_game_ratings(uuid) to authenticated;

-- A média das estrelas entra no ranking, para o overall continuar a nascer num
-- sítio só.
--
-- É aqui que o `security definer` faz trabalho sensível: a RLS de
-- `game_ratings` mostra a cada um apenas o que ele deu, e esta função vê tudo
-- para poder agregar. É o que permite publicar a média sem publicar os votos.
-- Por isso a verificação de pertença (`is_active_member`) não é decorativa —
-- sem ela, qualquer sessão autenticada lia as médias de qualquer pelada.

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
  post_rating_count int
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
    coalesce(ratings.post_rating_count, 0)
  from public.pelada_memberships member
  left join public.profiles profile on profile.id = member.profile_id
  left join totals on totals.membership_id = member.id
  left join ratings on ratings.membership_id = member.id
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
