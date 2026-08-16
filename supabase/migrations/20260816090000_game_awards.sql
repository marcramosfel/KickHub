-- KickHub V2 — craque e bagre da rodada.
--
-- Cada equipa vota no seu. Quem ganhou elege o craque entre os seus; quem
-- perdeu elege o bagre entre os seus. Num empate no placar não há lados, e
-- vota-se nos dois — sempre dentro da própria equipa.
--
-- Isto não é uma restrição de conveniência: é o que impede a votação de virar
-- ajuste de contas entre adversários. O servidor verifica-a, porque a interface
-- não pode garantir nada.
--
-- Os votos são privados, pela mesma razão das estrelas: saber quem votou bagre
-- envenena o balneário. A política de leitura devolve a cada um apenas o que
-- ele votou. A escrita não tem política — passa toda pela RPC.
--
-- ## Quem levou o prémio
--
-- Por esta ordem: **override do admin → vencedor congelado no fecho → contagem
-- de votos**. Uma rodada fechada não se recalcula a cada leitura: um voto que
-- chegasse tarde mudaria retroactivamente quem foi craque há três meses, e o
-- overall de duas pessoas com ele.
--
-- ## Empates
--
-- Craque empatado premeia **todos** os empatados. Bagre empatado **não castiga
-- ninguém**. É deliberadamente assimétrico — premiar mais do que castigar é a
-- regra que governa o resto da conta, e um empate no bagre é precisamente o
-- caso em que o grupo não chegou a acordo sobre quem teve culpa.

create table public.game_award_votes (
  game_id uuid not null,
  voter_membership_id uuid not null,
  award text not null check (award in ('craque','bagre')),
  nominee_membership_id uuid not null,
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um voto por prémio e por votante: não se distribui craque por dois.
  primary key (game_id, voter_membership_id, award),
  constraint game_award_votes_not_self check (voter_membership_id <> nominee_membership_id),
  foreign key (game_id, pelada_id) references public.games (id, pelada_id) on delete cascade,
  foreign key (voter_membership_id, pelada_id) references public.pelada_memberships (id, pelada_id) on delete cascade,
  foreign key (nominee_membership_id, pelada_id) references public.pelada_memberships (id, pelada_id) on delete cascade
);

create index game_award_votes_tally_idx
  on public.game_award_votes (pelada_id, game_id, award, nominee_membership_id);

-- **Que o prémio está decidido** e **quem o levou** são factos diferentes, e
-- guardá-los na mesma tabela custou um defeito: quando o admin decidia que
-- ninguém tinha sido bagre, a lista de vencedores ficava vazia — indistinguível
-- de "ainda não decidido" — e a resolução caía outra vez na contagem ao vivo,
-- ressuscitando o bagre que ele tinha acabado de retirar.
create table public.game_award_decisions (
  game_id uuid not null,
  award text not null check (award in ('craque','bagre')),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  source text not null check (source in ('votes','admin')),
  decided_at timestamptz not null default now(),
  primary key (game_id, award),
  foreign key (game_id, pelada_id) references public.games (id, pelada_id) on delete cascade
);

-- Quem levou. Varias linhas por prémio são possíveis — um craque empatado
-- premeia todos — e **nenhuma** também: ninguém ser bagre é um resultado.
create table public.game_awards (
  game_id uuid not null,
  award text not null check (award in ('craque','bagre')),
  membership_id uuid not null,
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  primary key (game_id, award, membership_id),
  foreign key (game_id, award) references public.game_award_decisions (game_id, award) on delete cascade,
  foreign key (game_id, pelada_id) references public.games (id, pelada_id) on delete cascade,
  foreign key (membership_id, pelada_id) references public.pelada_memberships (id, pelada_id) on delete cascade
);

alter table public.game_award_votes enable row level security;
alter table public.game_award_decisions enable row level security;
alter table public.game_awards enable row level security;

-- Cada um vê o que votou, e mais nada.
create policy game_award_votes_own_read on public.game_award_votes
  for select using (
    public.is_active_member(pelada_id)
    and voter_membership_id in (
      select id from public.pelada_memberships
      where pelada_id = game_award_votes.pelada_id
        and profile_id = public.current_profile_id()
    )
  );

-- O resultado, esse, é da pelada inteira: é o que se celebra.
create policy game_awards_member_read on public.game_awards
  for select using (public.is_active_member(pelada_id));
create policy game_award_decisions_member_read on public.game_award_decisions
  for select using (public.is_active_member(pelada_id));

-- ----------------------------------------------------------------- votação

/**
 * De que lado cada equipa está, para este jogo: 'winner', 'loser' ou 'draw'.
 * Sai do placar e não do que o cliente disser.
 */
create or replace function public.game_team_outcome(p_game_id uuid, p_team text)
returns text
language sql stable
set search_path = public, pg_temp
as $$
  select case
    when result.score_a = result.score_b then 'draw'
    when p_team = 'A' and result.score_a > result.score_b then 'winner'
    when p_team = 'B' and result.score_b > result.score_a then 'winner'
    else 'loser'
  end
  from public.game_results result
  where result.game_id = p_game_id;
$$;

/**
 * Vota no craque e/ou no bagre. `null` retira o voto desse prémio — é a forma
 * de mudar de ideias para "não voto", e é explícita de propósito.
 */
create or replace function public.vote_game_awards(
  p_game_id uuid,
  p_craque uuid,
  p_bagre uuid
)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_voter uuid;
  v_team text;
  v_outcome text;
  v_count int := 0;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if v_game.status <> 'played' then
    raise exception 'GAME_NOT_PLAYED';
  end if;

  select id into v_voter
  from public.pelada_memberships
  where pelada_id = v_game.pelada_id
    and profile_id = public.current_profile_id()
    and status = 'active';
  if v_voter is null then
    raise exception 'FORBIDDEN';
  end if;

  select team into v_team
  from public.game_lineups
  where game_id = p_game_id and membership_id = v_voter;
  if v_team is null then
    raise exception 'NOT_IN_LINEUP';
  end if;

  -- Uma rodada fechada não se reabre por um voto atrasado. A pergunta é se
  -- houve decisão — não se houve vencedor, porque não haver vencedor também é
  -- uma decisão.
  if exists (select 1 from public.game_award_decisions where game_id = p_game_id) then
    raise exception 'AWARDS_CLOSED';
  end if;

  v_outcome := public.game_team_outcome(p_game_id, v_team);
  if v_outcome is null then
    raise exception 'RESULT_NOT_RECORDED';
  end if;

  -- Craque: só quem ganhou, ou toda a gente se empataram.
  if p_craque is not null then
    if v_outcome = 'loser' then
      raise exception 'CRAQUE_IS_FOR_WINNERS';
    end if;
    if not exists (
      select 1 from public.game_lineups
      where game_id = p_game_id and membership_id = p_craque and team = v_team
    ) or p_craque = v_voter then
      raise exception 'INVALID_AWARD_TARGET';
    end if;
    insert into public.game_award_votes (game_id, voter_membership_id, award, nominee_membership_id, pelada_id)
    values (p_game_id, v_voter, 'craque', p_craque, v_game.pelada_id)
    on conflict (game_id, voter_membership_id, award)
      do update set nominee_membership_id = excluded.nominee_membership_id, updated_at = now();
    v_count := v_count + 1;
  else
    delete from public.game_award_votes
    where game_id = p_game_id and voter_membership_id = v_voter and award = 'craque';
  end if;

  -- Bagre: só quem perdeu, ou toda a gente se empataram.
  if p_bagre is not null then
    if v_outcome = 'winner' then
      raise exception 'BAGRE_IS_FOR_LOSERS';
    end if;
    if not exists (
      select 1 from public.game_lineups
      where game_id = p_game_id and membership_id = p_bagre and team = v_team
    ) or p_bagre = v_voter then
      raise exception 'INVALID_AWARD_TARGET';
    end if;
    insert into public.game_award_votes (game_id, voter_membership_id, award, nominee_membership_id, pelada_id)
    values (p_game_id, v_voter, 'bagre', p_bagre, v_game.pelada_id)
    on conflict (game_id, voter_membership_id, award)
      do update set nominee_membership_id = excluded.nominee_membership_id, updated_at = now();
    v_count := v_count + 1;
  else
    delete from public.game_award_votes
    where game_id = p_game_id and voter_membership_id = v_voter and award = 'bagre';
  end if;

  return v_count;
end;
$$;

create or replace function public.get_my_game_award_votes(p_game_id uuid)
returns table (award text, nominee_membership_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select vote.award, vote.nominee_membership_id
  from public.game_award_votes vote
  join public.games game on game.id = vote.game_id
  where vote.game_id = p_game_id
    and public.is_active_member(game.pelada_id)
    and vote.voter_membership_id in (
      select id from public.pelada_memberships
      where pelada_id = game.pelada_id
        and profile_id = public.current_profile_id()
    );
$$;

-- ------------------------------------------------------------- apuramento

/**
 * Vencedores por contagem de votos, com a regra dos empates:
 * craque empatado premeia todos; bagre empatado não castiga ninguém.
 */
create or replace function public.tally_game_awards(p_game_id uuid)
returns table (award text, membership_id uuid)
language sql stable
set search_path = public, pg_temp
as $$
  with contagem as (
    select vote.award, vote.nominee_membership_id, count(*)::int as votos
    from public.game_award_votes vote
    where vote.game_id = p_game_id
    group by vote.award, vote.nominee_membership_id
  ),
  topo as (
    select contagem.award, max(contagem.votos) as maximo,
           count(*) filter (where true) as _ignorado
    from contagem group by contagem.award
  ),
  empatados as (
    select contagem.award, count(*)::int as quantos
    from contagem
    join topo on topo.award = contagem.award and contagem.votos = topo.maximo
    group by contagem.award
  )
  select contagem.award, contagem.nominee_membership_id
  from contagem
  join topo on topo.award = contagem.award and contagem.votos = topo.maximo
  join empatados on empatados.award = contagem.award
  where contagem.award = 'craque' or empatados.quantos = 1;
$$;

/**
 * Quem levou o prémio, resolvido na ordem que interessa:
 * override do admin → vencedor congelado → contagem ao vivo.
 */
create or replace function public.get_game_awards(p_game_id uuid)
returns table (award text, membership_id uuid, display_name text, source text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with pelada as (
    select game.pelada_id from public.games game where game.id = p_game_id
  ),
  -- Se há decisão, ela manda — mesmo que não tenha vencedores.
  decidido as (
    select decisao.award, award.membership_id, decisao.source
    from public.game_award_decisions decisao
    left join public.game_awards award
      on award.game_id = decisao.game_id and award.award = decisao.award
    where decisao.game_id = p_game_id
  ),
  efectivo as (
    select decidido.award, decidido.membership_id, decidido.source
    from decidido
    where decidido.membership_id is not null
    union all
    select tally.award, tally.membership_id, 'live'
    from public.tally_game_awards(p_game_id) tally
    where not exists (
      select 1 from public.game_award_decisions decisao
      where decisao.game_id = p_game_id and decisao.award = tally.award
    )
  )
  select
    efectivo.award,
    efectivo.membership_id,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    efectivo.source
  from efectivo
  join public.pelada_memberships member on member.id = efectivo.membership_id
  left join public.profiles profile on profile.id = member.profile_id
  where public.is_active_member((select pelada_id from pelada));
$$;

/**
 * Fecha a votação e congela quem ganhou. Só quem organiza, e só uma vez: um
 * voto que chegasse depois mudaria retroactivamente o overall de duas pessoas.
 */
create or replace function public.close_game_awards(p_game_id uuid)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_written int;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if not public.has_pelada_role(v_game.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_game.status <> 'played' then
    raise exception 'GAME_NOT_PLAYED';
  end if;
  if exists (select 1 from public.game_award_decisions where game_id = p_game_id) then
    raise exception 'AWARDS_ALREADY_CLOSED';
  end if;

  -- Os dois prémios ficam decididos, mesmo aquele em que ninguém reuniu votos:
  -- é isso que impede a contagem ao vivo de voltar a decidir por conta própria.
  insert into public.game_award_decisions (game_id, award, pelada_id, source)
  select p_game_id, premio, v_game.pelada_id, 'votes'
  from unnest(array['craque','bagre']) as premio;

  insert into public.game_awards (game_id, award, membership_id, pelada_id)
  select p_game_id, tally.award, tally.membership_id, v_game.pelada_id
  from public.tally_game_awards(p_game_id) tally;

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

/**
 * O admin corrige o prémio. Substitui o que estiver decidido para aquele
 * prémio; uma lista vazia diz "ninguém levou", que é uma decisão legítima.
 */
create or replace function public.set_game_award_override(
  p_game_id uuid,
  p_award text,
  p_membership_ids uuid[]
)
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_written int;
begin
  if p_award not in ('craque','bagre') then
    raise exception 'INVALID_AWARD';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if not public.has_pelada_role(v_game.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  -- Quem recebe o prémio tem de ter jogado. Sem isto, a correção podia premiar
  -- alguém que não esteve em campo — ou de outra pelada.
  if exists (
    select 1 from unnest(coalesce(p_membership_ids, '{}'::uuid[])) as pedido(id)
    where not exists (
      select 1 from public.game_lineups
      where game_id = p_game_id and membership_id = pedido.id
    )
  ) then
    raise exception 'INVALID_AWARD_TARGET';
  end if;

  delete from public.game_awards where game_id = p_game_id and award = p_award;

  insert into public.game_award_decisions (game_id, award, pelada_id, source)
  values (p_game_id, p_award, v_game.pelada_id, 'admin')
  on conflict (game_id, award)
    do update set source = 'admin', decided_at = now();

  insert into public.game_awards (game_id, award, membership_id, pelada_id)
  select p_game_id, p_award, pedido.id, v_game.pelada_id
  from unnest(coalesce(p_membership_ids, '{}'::uuid[])) as pedido(id);

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

revoke all on function public.game_team_outcome(uuid, text) from public, anon, authenticated;
revoke all on function public.vote_game_awards(uuid, uuid, uuid) from public, anon;
revoke all on function public.get_my_game_award_votes(uuid) from public, anon;
-- Privadas de propósito: contam os votos de toda a gente e só são alcançáveis
-- de dentro de `get_game_awards` e `get_pelada_ranking`, que verificam pertença.
revoke all on function public.tally_game_awards(uuid) from public, anon, authenticated;
revoke all on function public.get_game_awards(uuid) from public, anon;
revoke all on function public.close_game_awards(uuid) from public, anon;
revoke all on function public.set_game_award_override(uuid, text, uuid[]) from public, anon;

grant execute on function public.vote_game_awards(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_my_game_award_votes(uuid) to authenticated;
grant execute on function public.get_game_awards(uuid) to authenticated;
grant execute on function public.close_game_awards(uuid) to authenticated;
grant execute on function public.set_game_award_override(uuid, text, uuid[]) to authenticated;

-- Sem grant a política não chega a correr. Os votos ficam legíveis à tabela
-- porque a política os reduz aos próprios; o resultado é da pelada inteira.
grant select on public.game_award_votes to authenticated;
grant select on public.game_award_decisions to authenticated;
grant select on public.game_awards to authenticated;

-- ------------------------------------------------------ prémios no ranking

/**
 * Os prémios de toda a pelada, com a mesma ordem de resolução por jogo:
 * override do admin → vencedor congelado → contagem ao vivo.
 *
 * Existe separada de `get_game_awards` porque o ranking precisa disto para
 * centenas de jogos de uma vez, e chamar a função por jogo faria uma consulta
 * por linha. A regra de resolução é a mesma e vive nos dois sítios — se um dia
 * divergirem, o ranking passa a contar prémios que a página do jogo não mostra.
 */
create or replace function public.pelada_award_winners(p_pelada_id uuid)
returns table (game_id uuid, award text, membership_id uuid)
language sql stable
set search_path = public, pg_temp
as $$
  with contagem as (
    select vote.game_id, vote.award, vote.nominee_membership_id, count(*)::int as votos
    from public.game_award_votes vote
    where vote.pelada_id = p_pelada_id
    group by vote.game_id, vote.award, vote.nominee_membership_id
  ),
  topo as (
    select contagem.game_id, contagem.award, max(contagem.votos) as maximo
    from contagem group by contagem.game_id, contagem.award
  ),
  empatados as (
    select contagem.game_id, contagem.award, count(*)::int as quantos
    from contagem
    join topo on topo.game_id = contagem.game_id and topo.award = contagem.award
             and contagem.votos = topo.maximo
    group by contagem.game_id, contagem.award
  ),
  ao_vivo as (
    select contagem.game_id, contagem.award, contagem.nominee_membership_id as membership_id
    from contagem
    join topo on topo.game_id = contagem.game_id and topo.award = contagem.award
             and contagem.votos = topo.maximo
    join empatados on empatados.game_id = contagem.game_id and empatados.award = contagem.award
    where contagem.award = 'craque' or empatados.quantos = 1
  ),
  decidido as (
    select award.game_id, award.award, award.membership_id
    from public.game_awards award
    where award.pelada_id = p_pelada_id
  )
  select game_id, award, membership_id from decidido
  union all
  select ao_vivo.game_id, ao_vivo.award, ao_vivo.membership_id
  from ao_vivo
  where not exists (
    select 1 from public.game_award_decisions decisao
    where decisao.game_id = ao_vivo.game_id and decisao.award = ao_vivo.award
  );
$$;

-- Privada pela mesma razão de `tally_game_awards`: conta os votos de toda a
-- gente e só é alcançável de dentro de `get_pelada_ranking`, que verifica
-- pertença. Ao alcance do cliente, devolveria contagens erradas em silêncio.
revoke all on function public.pelada_award_winners(uuid) from public, anon, authenticated;

-- O ranking passa a trazer quantas vezes cada um foi craque e bagre. O overall
-- usa a **taxa**, não o total: craque em todas as rodadas vale o máximo, craque
-- numa de vinte vale quase nada. Assim quem joga há mais tempo não acumula
-- bónus só por ter jogado mais.

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
  bagres int
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
    coalesce(awards.bagres, 0)
  from public.pelada_memberships member
  left join public.profiles profile on profile.id = member.profile_id
  left join totals on totals.membership_id = member.id
  left join ratings on ratings.membership_id = member.id
  left join awards on awards.membership_id = member.id
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
