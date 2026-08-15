-- KickHub V2 — jogos e confirmação de presença por pelada.
--
-- As entidades apontam para `pelada_memberships` e não para a tabela legada
-- `players`: a identidade legada é o PIN, que o ADR 0001 retira. A ponte para o
-- histórico Browns é `pelada_memberships.legacy_player_id`, já existente.
--
-- Chaves compostas (id, pelada_id) tornam um vínculo cross-tenant impossível no
-- banco, em vez de depender apenas da RLS: uma presença nunca pode ligar um jogo
-- de uma pelada a uma membership de outra.

alter table public.pelada_memberships
  add constraint pelada_memberships_id_pelada_key unique (id, pelada_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes int not null default 90 check (duration_minutes between 15 and 300),
  location text check (location is null or char_length(location) <= 160),
  format text not null check (format in ('5x5','6x6','7x7','8x8','11x11','custom')),
  team_size int not null check (team_size between 3 and 15),
  max_players int check (max_players is null or max_players between 4 and 60),
  status text not null default 'scheduled' check (status in ('scheduled','played','cancelled')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references public.pelada_memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint games_id_pelada_key unique (id, pelada_id)
);

create index games_pelada_schedule_idx on public.games (pelada_id, scheduled_at desc);
create index games_pelada_upcoming_idx on public.games (pelada_id, scheduled_at) where status = 'scheduled';

create trigger games_touch_updated_at
  before update on public.games
  for each row execute function public.touch_updated_at();

create table public.game_attendance (
  game_id uuid not null,
  membership_id uuid not null,
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed','declined','waitlist')),
  note text check (note is null or char_length(note) <= 200),
  responded_at timestamptz not null default now(),
  primary key (game_id, membership_id),
  foreign key (game_id, pelada_id) references public.games (id, pelada_id) on delete cascade,
  foreign key (membership_id, pelada_id) references public.pelada_memberships (id, pelada_id) on delete cascade
);

create index game_attendance_game_status_idx on public.game_attendance (game_id, status, responded_at);

alter table public.games enable row level security;
alter table public.game_attendance enable row level security;

-- Leitura para membros ativos; escrita direta fechada. As transições passam
-- pelas RPCs para garantir auditoria, limite de vagas e lista de espera.
create policy games_member_read on public.games
  for select using (public.is_active_member(pelada_id));

create policy game_attendance_member_read on public.game_attendance
  for select using (public.is_active_member(pelada_id));

-- ---------------------------------------------------------------- RPCs

create or replace function public.create_game(
  p_pelada_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes int,
  p_location text,
  p_format text,
  p_team_size int,
  p_max_players int,
  p_notes text
)
returns public.games
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_actor uuid;
begin
  if not public.has_pelada_role(p_pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if p_format not in ('5x5','6x6','7x7','8x8','11x11','custom') then
    raise exception 'INVALID_FORMAT';
  end if;

  select id into v_actor
  from public.pelada_memberships
  where pelada_id = p_pelada_id
    and profile_id = public.current_profile_id()
    and status = 'active';

  insert into public.games (
    pelada_id, scheduled_at, duration_minutes, location,
    format, team_size, max_players, notes, created_by
  ) values (
    p_pelada_id,
    p_scheduled_at,
    coalesce(p_duration_minutes, 90),
    nullif(btrim(coalesce(p_location, '')), ''),
    p_format,
    p_team_size,
    p_max_players,
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_actor
  )
  returning * into v_game;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    p_pelada_id,
    public.current_profile_id(),
    'game.created',
    'games',
    v_game.id,
    jsonb_build_object('scheduled_at', v_game.scheduled_at, 'format', v_game.format)
  );

  -- Convocatória: uma notificação por membro ativo, exceto quem criou o jogo.
  insert into public.notifications (profile_id, pelada_id, kind, title, body, payload)
  select
    member.profile_id,
    p_pelada_id,
    'game.created',
    pelada.name,
    null,
    jsonb_build_object('game_id', v_game.id, 'scheduled_at', v_game.scheduled_at)
  from public.pelada_memberships member
  join public.peladas pelada on pelada.id = member.pelada_id
  where member.pelada_id = p_pelada_id
    and member.status = 'active'
    and member.profile_id is not null
    and member.profile_id <> public.current_profile_id();

  return v_game;
end;
$$;

create or replace function public.cancel_game(p_game_id uuid, p_reason text)
returns public.games
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if not public.has_pelada_role(v_game.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  update public.games
  set status = 'cancelled', cancelled_at = now()
  where id = p_game_id
  returning * into v_game;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_game.pelada_id,
    public.current_profile_id(),
    'game.cancelled',
    'games',
    v_game.id,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return v_game;
end;
$$;

-- Confirmação de presença do próprio jogador.
--
-- A vaga é atribuída dentro de um lock da linha do jogo: sem isso, duas
-- confirmações simultâneas podiam ambas ler "há vaga" e ultrapassar o limite.
-- Quem desiste liberta a vaga para o primeiro da lista de espera, pela ordem em
-- que responderam.
create or replace function public.set_game_attendance(
  p_game_id uuid,
  p_status text,
  p_note text
)
returns public.game_attendance
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_membership uuid;
  v_status text;
  v_confirmed int;
  v_result public.game_attendance;
begin
  if p_status not in ('confirmed','declined') then
    raise exception 'INVALID_ATTENDANCE_STATUS';
  end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if v_game.status <> 'scheduled' then
    raise exception 'GAME_NOT_OPEN';
  end if;

  select id into v_membership
  from public.pelada_memberships
  where pelada_id = v_game.pelada_id
    and profile_id = public.current_profile_id()
    and status = 'active';
  if v_membership is null then
    raise exception 'FORBIDDEN';
  end if;

  v_status := p_status;
  if p_status = 'confirmed' and v_game.max_players is not null then
    select count(*) into v_confirmed
    from public.game_attendance
    where game_id = p_game_id
      and status = 'confirmed'
      and membership_id <> v_membership;
    if v_confirmed >= v_game.max_players then
      v_status := 'waitlist';
    end if;
  end if;

  insert into public.game_attendance (game_id, membership_id, pelada_id, status, note, responded_at)
  values (p_game_id, v_membership, v_game.pelada_id, v_status, nullif(btrim(coalesce(p_note, '')), ''), now())
  on conflict (game_id, membership_id) do update
    set status = excluded.status,
        note = excluded.note,
        responded_at = now()
  returning * into v_result;

  if v_status = 'declined' and v_game.max_players is not null then
    update public.game_attendance promoted
    set status = 'confirmed'
    where promoted.game_id = p_game_id
      and promoted.membership_id = (
        select membership_id
        from public.game_attendance
        where game_id = p_game_id and status = 'waitlist'
        order by responded_at, membership_id
        limit 1
      )
      and (
        select count(*)
        from public.game_attendance
        where game_id = p_game_id and status = 'confirmed'
      ) < v_game.max_players;
  end if;

  return v_result;
end;
$$;

-- Read model paginado do calendário. Devolve as contagens agregadas e a resposta
-- do próprio utilizador, evitando N+1 no cliente.
create or replace function public.list_pelada_games(
  p_pelada_id uuid,
  p_limit int,
  p_offset int
)
returns table (
  id uuid,
  scheduled_at timestamptz,
  duration_minutes int,
  location text,
  format text,
  team_size int,
  max_players int,
  status text,
  notes text,
  confirmed_count int,
  waitlist_count int,
  declined_count int,
  my_status text
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    game.id,
    game.scheduled_at,
    game.duration_minutes,
    game.location,
    game.format,
    game.team_size,
    game.max_players,
    game.status,
    game.notes,
    count(*) filter (where attendance.status = 'confirmed')::int as confirmed_count,
    count(*) filter (where attendance.status = 'waitlist')::int as waitlist_count,
    count(*) filter (where attendance.status = 'declined')::int as declined_count,
    max(attendance.status) filter (where attendance.membership_id = mine.id) as my_status
  from public.games game
  join public.pelada_memberships mine
    on mine.pelada_id = game.pelada_id
   and mine.profile_id = public.current_profile_id()
   and mine.status = 'active'
  left join public.game_attendance attendance on attendance.game_id = game.id
  where game.pelada_id = p_pelada_id
  group by game.id, mine.id
  order by game.scheduled_at desc, game.id
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.create_game(uuid,timestamptz,int,text,text,int,int,text) from public, anon;
revoke all on function public.cancel_game(uuid,text) from public, anon;
revoke all on function public.set_game_attendance(uuid,text,text) from public, anon;
revoke all on function public.list_pelada_games(uuid,int,int) from public, anon;

grant execute on function public.create_game(uuid,timestamptz,int,text,text,int,int,text) to authenticated;
grant execute on function public.cancel_game(uuid,text) to authenticated;
grant execute on function public.set_game_attendance(uuid,text,text) to authenticated;
grant execute on function public.list_pelada_games(uuid,int,int) to authenticated;

grant select on public.games to authenticated;
grant select on public.game_attendance to authenticated;
