-- KickHub V2 — core multi-tenant foundation.
-- Expand-only: legacy Browns tables and RPCs remain compatible during the transition.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  username text unique,
  display_name text not null,
  avatar_path text,
  bio text check (bio is null or char_length(bio) <= 500),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  city text,
  locale text not null default 'pt' check (locale in ('pt','en','es','fr','de')),
  timezone text not null default 'Europe/Zurich',
  privacy jsonb not null default '{"profile":"members","stats":"members"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_username_format check (
    username is null or username ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
  )
);

create table public.peladas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  name text not null check (char_length(name) between 3 and 60),
  description text check (description is null or char_length(description) <= 280),
  logo_path text,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  visibility text not null default 'private' check (visibility in ('private','unlisted','public')),
  join_mode text not null default 'approval' check (join_mode in ('invite','approval','open')),
  status text not null default 'active' check (status in ('active','archived','suspended')),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region text,
  city text not null,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  public_location_precision text not null default 'city' check (public_location_precision in ('hidden','city','approximate')),
  timezone text not null default 'Europe/Zurich',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.pelada_memberships (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete restrict,
  legacy_player_id uuid unique references public.players(id) on delete restrict,
  role text not null default 'player' check (role in ('owner','admin','player')),
  status text not null default 'pending' check (status in ('pending','active','rejected','suspended','removed')),
  nickname text check (nickname is null or char_length(nickname) <= 40),
  player_type text check (player_type is null or player_type in ('FIELD','GOALKEEPER','HYBRID')),
  primary_position text,
  secondary_position text,
  accepts_other_positions boolean not null default true,
  joined_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pelada_memberships_identity check (profile_id is not null or legacy_player_id is not null)
);

create unique index pelada_memberships_active_profile_unique
  on public.pelada_memberships (pelada_id, profile_id)
  where profile_id is not null and status <> 'removed';
create index pelada_memberships_profile_status_idx on public.pelada_memberships (profile_id, status);
create index pelada_memberships_pelada_status_idx on public.pelada_memberships (pelada_id, status);

create table public.pelada_settings (
  pelada_id uuid primary key references public.peladas(id) on delete cascade,
  default_format text not null default '7x7' check (default_format in ('5x5','6x6','7x7','8x8','11x11','custom')),
  default_team_size int not null default 7 check (default_team_size between 3 and 15),
  frequency text not null default 'weekly' check (frequency in ('weekly','fortnightly','monthly','irregular')),
  goalkeeper_mode text not null default 'fixed' check (goalkeeper_mode in ('fixed','rotating','mixed')),
  ratings_enabled boolean not null default true,
  awards_enabled boolean not null default true,
  predictions_enabled boolean not null default true,
  feed_enabled boolean not null default true,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pelada_invites (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  token_hash bytea not null unique,
  role text not null default 'player' check (role in ('admin','player')),
  max_uses int check (max_uses is null or max_uses between 1 and 1000),
  use_count int not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint pelada_invites_use_limit check (max_uses is null or use_count <= max_uses)
);
create index pelada_invites_pelada_active_idx on public.pelada_invites (pelada_id, expires_at) where revoked_at is null;

create table public.pelada_join_requests (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pelada_id, profile_id, status)
);
create index pelada_join_requests_queue_idx on public.pelada_join_requests (pelada_id, created_at) where status = 'pending';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pelada_id uuid references public.peladas(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_profile_unread_idx on public.notifications (profile_id, created_at desc) where read_at is null;

create table public.tenant_audit_log (
  id bigint generated always as identity primary key,
  pelada_id uuid references public.peladas(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index tenant_audit_log_pelada_created_idx on public.tenant_audit_log (pelada_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger peladas_touch_updated_at before update on public.peladas
for each row execute function public.touch_updated_at();
create trigger memberships_touch_updated_at before update on public.pelada_memberships
for each row execute function public.touch_updated_at();
create trigger settings_touch_updated_at before update on public.pelada_settings
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into public.profiles (auth_user_id, username, display_name, locale, timezone)
  values (
    new.id,
    'user_' || left(replace(new.id::text, '-', ''), 10),
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1), 'Jogador'),
    case when new.raw_user_meta_data->>'locale' in ('pt','en','es','fr','de') then new.raw_user_meta_data->>'locale' else 'pt' end,
    coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'Europe/Zurich')
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.current_profile_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from public.profiles where auth_user_id = auth.uid() and deleted_at is null limit 1
$$;

create or replace function public.is_active_member(p_pelada_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.pelada_memberships
    where pelada_id = p_pelada_id
      and profile_id = public.current_profile_id()
      and status = 'active'
  )
$$;

create or replace function public.has_pelada_role(p_pelada_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.pelada_memberships
    where pelada_id = p_pelada_id
      and profile_id = public.current_profile_id()
      and status = 'active'
      and role = any(p_roles)
  )
$$;

create or replace function public.create_pelada(
  p_name text,
  p_slug text,
  p_description text,
  p_country_code text,
  p_city text,
  p_timezone text default 'Europe/Zurich',
  p_visibility text default 'private',
  p_join_mode text default 'approval'
)
returns public.peladas
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_pelada public.peladas;
begin
  if v_profile is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.peladas (slug, name, description, owner_profile_id, country_code, city, timezone, visibility, join_mode)
  values (lower(trim(p_slug)), trim(p_name), nullif(trim(p_description), ''), v_profile, upper(p_country_code), trim(p_city), p_timezone, p_visibility, p_join_mode)
  returning * into v_pelada;
  insert into public.pelada_memberships (pelada_id, profile_id, role, status, approved_at, approved_by)
  values (v_pelada.id, v_profile, 'owner', 'active', now(), v_profile);
  insert into public.pelada_settings (pelada_id) values (v_pelada.id);
  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id)
  values (v_pelada.id, v_profile, 'pelada.created', 'pelada', v_pelada.id);
  return v_pelada;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.current_profile_id() from public, anon;
revoke all on function public.is_active_member(uuid) from public, anon;
revoke all on function public.has_pelada_role(uuid,text[]) from public, anon;
revoke all on function public.create_pelada(text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;
grant execute on function public.has_pelada_role(uuid,text[]) to authenticated;
grant execute on function public.create_pelada(text,text,text,text,text,text,text,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.peladas enable row level security;
alter table public.pelada_memberships enable row level security;
alter table public.pelada_settings enable row level security;
alter table public.pelada_invites enable row level security;
alter table public.pelada_join_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.tenant_audit_log enable row level security;

create policy profiles_read_self_or_shared_membership on public.profiles for select to authenticated
using (
  id = public.current_profile_id()
  or exists (
    select 1 from public.pelada_memberships mine
    join public.pelada_memberships theirs on theirs.pelada_id = mine.pelada_id
    where mine.profile_id = public.current_profile_id() and mine.status = 'active'
      and theirs.profile_id = profiles.id and theirs.status = 'active'
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
using (id = public.current_profile_id()) with check (id = public.current_profile_id());

create policy peladas_read_visible on public.peladas for select to authenticated
using ((visibility = 'public' and status = 'active') or public.is_active_member(id));
create policy peladas_update_admin on public.peladas for update to authenticated
using (public.has_pelada_role(id, array['owner','admin']))
with check (public.has_pelada_role(id, array['owner','admin']));

create policy memberships_read_tenant on public.pelada_memberships for select to authenticated
using (profile_id = public.current_profile_id() or public.is_active_member(pelada_id));
create policy memberships_update_admin on public.pelada_memberships for update to authenticated
using (public.has_pelada_role(pelada_id, array['owner','admin']))
with check (public.has_pelada_role(pelada_id, array['owner','admin']));

create policy settings_read_members on public.pelada_settings for select to authenticated
using (public.is_active_member(pelada_id));
create policy settings_update_admin on public.pelada_settings for update to authenticated
using (public.has_pelada_role(pelada_id, array['owner','admin']))
with check (public.has_pelada_role(pelada_id, array['owner','admin']));

create policy invites_admin_all on public.pelada_invites for all to authenticated
using (public.has_pelada_role(pelada_id, array['owner','admin']))
with check (public.has_pelada_role(pelada_id, array['owner','admin']));

create policy join_requests_read_own_or_admin on public.pelada_join_requests for select to authenticated
using (profile_id = public.current_profile_id() or public.has_pelada_role(pelada_id, array['owner','admin']));
create policy join_requests_insert_self on public.pelada_join_requests for insert to authenticated
with check (profile_id = public.current_profile_id());
create policy join_requests_update_admin on public.pelada_join_requests for update to authenticated
using (public.has_pelada_role(pelada_id, array['owner','admin']))
with check (public.has_pelada_role(pelada_id, array['owner','admin']));

create policy notifications_own on public.notifications for select to authenticated
using (profile_id = public.current_profile_id());
create policy notifications_mark_own on public.notifications for update to authenticated
using (profile_id = public.current_profile_id()) with check (profile_id = public.current_profile_id());

create policy tenant_audit_admin_read on public.tenant_audit_log for select to authenticated
using (public.has_pelada_role(pelada_id, array['owner','admin']));

revoke all on table public.profiles, public.peladas, public.pelada_memberships,
  public.pelada_settings, public.pelada_invites, public.pelada_join_requests,
  public.notifications, public.tenant_audit_log from anon;
grant select, update on public.profiles to authenticated;
grant select, update on public.peladas to authenticated;
grant select, update on public.pelada_memberships to authenticated;
grant select, update on public.pelada_settings to authenticated;
grant select, insert, update, delete on public.pelada_invites to authenticated;
grant select, insert, update on public.pelada_join_requests to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.tenant_audit_log to authenticated;

-- Deterministic tenant #1. Legacy players are linked in the following backfill migration.
insert into public.profiles (id, display_name, locale, timezone, privacy)
values ('00000000-0000-4000-8000-000000000001', 'Browns Legacy Owner', 'pt', 'Europe/Zurich', '{"profile":"private","stats":"private"}')
on conflict (id) do nothing;

insert into public.peladas (
  id, slug, name, description, owner_profile_id, visibility, join_mode,
  country_code, city, timezone
)
values (
  '00000000-0000-4000-8000-000000000101', 'browns', 'Pelada Browns',
  'A comunidade Browns preservada como tenant #1 do KickHub.',
  '00000000-0000-4000-8000-000000000001', 'private', 'invite', 'CH', 'Zürich', 'Europe/Zurich'
)
on conflict (id) do nothing;

insert into public.pelada_memberships (
  id, pelada_id, profile_id, role, status, approved_at, approved_by
)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'owner', 'active', now(), '00000000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

insert into public.pelada_settings (pelada_id, default_format, default_team_size, frequency)
values ('00000000-0000-4000-8000-000000000101', '7x7', 7, 'weekly')
on conflict (pelada_id) do nothing;
