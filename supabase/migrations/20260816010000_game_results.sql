-- KickHub V2 — resultado do jogo e estatísticas por jogador.
--
-- O placar é guardado explicitamente em vez de derivado da soma dos golos:
-- autogolos contam para o adversário, e uma pelada que só registe o resultado
-- sem detalhar quem marcou continua a poder fechar o jogo.
--
-- As estatísticas ficam numa tabela à parte, com uma linha por jogador, porque
-- é sobre elas que o ranking e o overall calculado vão assentar.

create table public.game_results (
  game_id uuid primary key,
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  score_a int not null check (score_a between 0 and 99),
  score_b int not null check (score_b between 0 and 99),
  notes text check (notes is null or char_length(notes) <= 500),
  recorded_by uuid references public.pelada_memberships(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (game_id, pelada_id) references public.games (id, pelada_id) on delete cascade
);

create table public.game_player_stats (
  game_id uuid not null,
  membership_id uuid not null,
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  goals int not null default 0 check (goals between 0 and 99),
  assists int not null default 0 check (assists between 0 and 99),
  own_goals int not null default 0 check (own_goals between 0 and 99),
  saves int not null default 0 check (saves between 0 and 99),
  primary key (game_id, membership_id),
  foreign key (game_id, pelada_id) references public.games (id, pelada_id) on delete cascade,
  foreign key (membership_id, pelada_id) references public.pelada_memberships (id, pelada_id) on delete cascade
);

create index game_player_stats_pelada_idx on public.game_player_stats (pelada_id, membership_id);

create trigger game_results_touch_updated_at
  before update on public.game_results
  for each row execute function public.touch_updated_at();

alter table public.game_results enable row level security;
alter table public.game_player_stats enable row level security;

create policy game_results_member_read on public.game_results
  for select using (public.is_active_member(pelada_id));

create policy game_player_stats_member_read on public.game_player_stats
  for select using (public.is_active_member(pelada_id));

-- Guardar o resultado fecha o jogo. É idempotente: corrigir um placar mal
-- registado substitui as estatísticas em vez de as somar outra vez.
create or replace function public.save_game_result(
  p_game_id uuid,
  p_score_a int,
  p_score_b int,
  p_notes text,
  p_stats jsonb
)
returns public.game_results
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_actor uuid;
  v_result public.game_results;
  v_count int;
  v_valid int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if not public.has_pelada_role(v_game.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_game.status = 'cancelled' then
    raise exception 'GAME_CANCELLED';
  end if;
  if p_stats is not null and jsonb_typeof(p_stats) <> 'array' then
    raise exception 'INVALID_STATS';
  end if;

  -- Só entra nas estatísticas quem esteve no jogo: presença confirmada ou
  -- escalação sorteada. Sem isto, a RPC aceitaria creditar golos a alguém de
  -- outra pelada, ou a quem faltou.
  select
    count(*),
    count(*) filter (
      where attendance.membership_id is not null or lineup.membership_id is not null
    )
  into v_count, v_valid
  from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) as entry
  left join public.game_attendance attendance
    on attendance.game_id = p_game_id
   and attendance.membership_id = (entry->>'membership_id')::uuid
   and attendance.status = 'confirmed'
  left join public.game_lineups lineup
    on lineup.game_id = p_game_id
   and lineup.membership_id = (entry->>'membership_id')::uuid;

  if v_valid <> v_count then
    raise exception 'INVALID_STATS';
  end if;

  select id into v_actor
  from public.pelada_memberships
  where pelada_id = v_game.pelada_id
    and profile_id = public.current_profile_id()
    and status = 'active';

  insert into public.game_results (game_id, pelada_id, score_a, score_b, notes, recorded_by)
  values (p_game_id, v_game.pelada_id, p_score_a, p_score_b, nullif(btrim(coalesce(p_notes, '')), ''), v_actor)
  on conflict (game_id) do update
    set score_a = excluded.score_a,
        score_b = excluded.score_b,
        notes = excluded.notes,
        recorded_by = excluded.recorded_by
  returning * into v_result;

  delete from public.game_player_stats where game_id = p_game_id;

  insert into public.game_player_stats (game_id, membership_id, pelada_id, goals, assists, own_goals, saves)
  select
    p_game_id,
    (entry->>'membership_id')::uuid,
    v_game.pelada_id,
    coalesce((entry->>'goals')::int, 0),
    coalesce((entry->>'assists')::int, 0),
    coalesce((entry->>'own_goals')::int, 0),
    coalesce((entry->>'saves')::int, 0)
  from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) as entry;

  update public.games set status = 'played' where id = p_game_id;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_game.pelada_id,
    public.current_profile_id(),
    'game.result_recorded',
    'games',
    p_game_id,
    jsonb_build_object('score_a', p_score_a, 'score_b', p_score_b, 'players', v_count)
  );

  return v_result;
end;
$$;

create or replace function public.get_game_result(p_game_id uuid)
returns table (
  score_a int,
  score_b int,
  notes text,
  recorded_at timestamptz,
  membership_id uuid,
  display_name text,
  team text,
  goals int,
  assists int,
  own_goals int,
  saves int
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    result.score_a,
    result.score_b,
    result.notes,
    result.recorded_at,
    stat.membership_id,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    lineup.team,
    stat.goals,
    stat.assists,
    stat.own_goals,
    stat.saves
  from public.game_results result
  left join public.game_player_stats stat on stat.game_id = result.game_id
  left join public.pelada_memberships member on member.id = stat.membership_id
  left join public.profiles profile on profile.id = member.profile_id
  left join public.game_lineups lineup
    on lineup.game_id = result.game_id and lineup.membership_id = stat.membership_id
  where result.game_id = p_game_id
    and public.is_active_member(result.pelada_id)
  order by stat.goals desc nulls last, stat.assists desc nulls last, stat.membership_id;
$$;

revoke all on function public.save_game_result(uuid, int, int, text, jsonb) from public, anon;
revoke all on function public.get_game_result(uuid) from public, anon;

grant execute on function public.save_game_result(uuid, int, int, text, jsonb) to authenticated;
grant execute on function public.get_game_result(uuid) to authenticated;

grant select on public.game_results, public.game_player_stats to authenticated;
