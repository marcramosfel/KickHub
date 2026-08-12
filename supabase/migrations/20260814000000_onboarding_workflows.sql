-- KickHub V2 — transactional onboarding workflows.
-- All membership transitions happen on the server and produce audit records.

create extension if not exists pgcrypto with schema extensions;

alter table public.pelada_join_requests
  drop constraint if exists pelada_join_requests_pelada_id_profile_id_status_key;

create unique index if not exists pelada_join_requests_one_pending_per_profile
  on public.pelada_join_requests (pelada_id, profile_id)
  where status = 'pending';

create index if not exists peladas_public_discovery_idx
  on public.peladas (city, created_at desc)
  where visibility = 'public' and status = 'active';

create or replace function public.discover_public_peladas(
  p_query text default null,
  p_city text default null,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  logo_path text,
  country_code text,
  region text,
  city text,
  join_mode text,
  timezone text,
  created_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.id, p.slug, p.name, p.description, p.logo_path, p.country_code,
    p.region, p.city, p.join_mode, p.timezone, p.created_at
  from public.peladas p
  where p.visibility = 'public'
    and p.status = 'active'
    and (nullif(trim(p_query), '') is null or p.name ilike '%' || trim(p_query) || '%' or p.city ilike '%' || trim(p_query) || '%')
    and (nullif(trim(p_city), '') is null or p.city ilike trim(p_city))
  order by p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 24), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.request_pelada_membership(
  p_pelada_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_pelada public.peladas;
  v_request_id uuid;
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if char_length(coalesce(p_message, '')) > 500 then raise exception 'MESSAGE_TOO_LONG'; end if;

  select * into v_pelada
  from public.peladas
  where id = p_pelada_id and status = 'active'
  for update;

  if not found then raise exception 'PELADA_NOT_FOUND'; end if;
  if v_pelada.visibility <> 'public' then raise exception 'PELADA_NOT_DISCOVERABLE'; end if;
  if v_pelada.join_mode = 'invite' then raise exception 'INVITE_REQUIRED'; end if;

  if exists (
    select 1 from public.pelada_memberships
    where pelada_id = p_pelada_id and profile_id = v_profile_id and status = 'active'
  ) then
    return jsonb_build_object('status', 'active', 'request_id', null);
  end if;

  if v_pelada.join_mode = 'open' then
    insert into public.pelada_memberships (pelada_id, profile_id, role, status, approved_at, approved_by)
    values (p_pelada_id, v_profile_id, 'player', 'active', now(), v_profile_id)
    on conflict (pelada_id, profile_id) where profile_id is not null and status <> 'removed'
    do update set status = 'active', role = 'player', approved_at = now(), approved_by = v_profile_id, removed_at = null;

    insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, metadata)
    values (p_pelada_id, v_profile_id, 'membership.joined_open', 'membership', jsonb_build_object('source', 'discovery'));
    return jsonb_build_object('status', 'active', 'request_id', null);
  end if;

  select id into v_request_id
  from public.pelada_join_requests
  where pelada_id = p_pelada_id and profile_id = v_profile_id and status = 'pending';

  if v_request_id is null then
    insert into public.pelada_join_requests (pelada_id, profile_id, message)
    values (p_pelada_id, v_profile_id, nullif(trim(p_message), ''))
    returning id into v_request_id;

    insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id)
    values (p_pelada_id, v_profile_id, 'join_request.created', 'join_request', v_request_id);
  end if;

  return jsonb_build_object('status', 'pending', 'request_id', v_request_id);
end;
$$;

create or replace function public.review_pelada_join_request(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_request public.pelada_join_requests;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'INVALID_DECISION'; end if;

  select * into v_request
  from public.pelada_join_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'pending' then raise exception 'REQUEST_ALREADY_REVIEWED'; end if;
  if not public.has_pelada_role(v_request.pelada_id, array['owner','admin']) then raise exception 'FORBIDDEN'; end if;

  update public.pelada_join_requests
  set status = p_decision, reviewed_by = v_actor, reviewed_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    insert into public.pelada_memberships (pelada_id, profile_id, role, status, approved_at, approved_by)
    values (v_request.pelada_id, v_request.profile_id, 'player', 'active', now(), v_actor)
    on conflict (pelada_id, profile_id) where profile_id is not null and status <> 'removed'
    do update set status = 'active', role = 'player', approved_at = now(), approved_by = v_actor, removed_at = null;
  end if;

  insert into public.notifications (profile_id, pelada_id, kind, title, body, payload)
  values (
    v_request.profile_id,
    v_request.pelada_id,
    'join_request_' || p_decision,
    case when p_decision = 'approved' then 'Pedido aprovado' else 'Pedido não aprovado' end,
    case when p_decision = 'approved' then 'Já podes entrar na pelada.' else 'O organizador não aprovou este pedido.' end,
    jsonb_build_object('request_id', p_request_id)
  );

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_request.pelada_id, v_actor, 'join_request.' || p_decision, 'join_request', p_request_id, jsonb_build_object('profile_id', v_request.profile_id));

  return jsonb_build_object('request_id', p_request_id, 'status', p_decision);
end;
$$;

create or replace function public.create_pelada_invite(
  p_pelada_id uuid,
  p_role text default 'player',
  p_max_uses int default 25,
  p_expires_in_hours int default 168
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_token text;
  v_invite_id uuid;
  v_expires_at timestamptz;
begin
  if not public.has_pelada_role(p_pelada_id, array['owner','admin']) then raise exception 'FORBIDDEN'; end if;
  if p_role not in ('admin','player') then raise exception 'INVALID_ROLE'; end if;
  if p_role = 'admin' and not public.has_pelada_role(p_pelada_id, array['owner']) then raise exception 'OWNER_REQUIRED'; end if;
  if p_max_uses not between 1 and 1000 then raise exception 'INVALID_MAX_USES'; end if;
  if p_expires_in_hours not between 1 and 2160 then raise exception 'INVALID_EXPIRY'; end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expires_at := now() + make_interval(hours => p_expires_in_hours);

  insert into public.pelada_invites (pelada_id, token_hash, role, max_uses, expires_at, created_by)
  values (p_pelada_id, digest(v_token, 'sha256'), p_role, p_max_uses, v_expires_at, v_actor)
  returning id into v_invite_id;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (p_pelada_id, v_actor, 'invite.created', 'invite', v_invite_id, jsonb_build_object('role', p_role, 'max_uses', p_max_uses));

  return jsonb_build_object('token', v_token, 'invite_id', v_invite_id, 'expires_at', v_expires_at);
end;
$$;

create or replace function public.accept_pelada_invite(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_invite public.pelada_invites;
  v_slug text;
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_token is null or char_length(p_token) <> 48 then raise exception 'INVALID_INVITE'; end if;

  select * into v_invite
  from public.pelada_invites
  where token_hash = digest(p_token, 'sha256')
  for update;

  if not found or v_invite.revoked_at is not null then raise exception 'INVALID_INVITE'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'INVITE_EXHAUSTED'; end if;

  if exists (
    select 1 from public.pelada_memberships
    where pelada_id = v_invite.pelada_id and profile_id = v_profile_id and status = 'active'
  ) then
    select slug into v_slug from public.peladas where id = v_invite.pelada_id;
    return jsonb_build_object('pelada_id', v_invite.pelada_id, 'slug', v_slug, 'status', 'active', 'already_member', true);
  end if;

  insert into public.pelada_memberships (pelada_id, profile_id, role, status, approved_at, approved_by)
  values (v_invite.pelada_id, v_profile_id, v_invite.role, 'active', now(), v_invite.created_by)
  on conflict (pelada_id, profile_id) where profile_id is not null and status <> 'removed'
  do update set status = 'active', role = excluded.role, approved_at = now(), approved_by = v_invite.created_by, removed_at = null;

  update public.pelada_invites set use_count = use_count + 1 where id = v_invite.id;
  select slug into v_slug from public.peladas where id = v_invite.pelada_id;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_invite.pelada_id, v_profile_id, 'invite.accepted', 'invite', v_invite.id, jsonb_build_object('role', v_invite.role));

  return jsonb_build_object('pelada_id', v_invite.pelada_id, 'slug', v_slug, 'status', 'active');
end;
$$;

revoke all on function public.request_pelada_membership(uuid,text) from public, anon;
revoke all on function public.review_pelada_join_request(uuid,text) from public, anon;
revoke all on function public.create_pelada_invite(uuid,text,int,int) from public, anon;
revoke all on function public.accept_pelada_invite(text) from public, anon;
grant execute on function public.request_pelada_membership(uuid,text) to authenticated;
grant execute on function public.review_pelada_join_request(uuid,text) to authenticated;
grant execute on function public.create_pelada_invite(uuid,text,int,int) to authenticated;
grant execute on function public.accept_pelada_invite(text) to authenticated;
revoke all on function public.discover_public_peladas(text,text,int,int) from public;
grant execute on function public.discover_public_peladas(text,text,int,int) to anon, authenticated;

revoke insert, update on public.pelada_join_requests from authenticated;
revoke update on public.pelada_memberships from authenticated;
revoke insert, update, delete on public.pelada_invites from authenticated;
