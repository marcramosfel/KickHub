-- KickHub V2 — claim Browns operável e conteúdo histórico multi-tenant.
--
-- Esta migration é deliberadamente append-only. Corrige o conflito entre o
-- profile criado no primeiro login e o profile legado, acrescenta uma consola
-- segura de claims e cria o read model do feed/mídia sem expor data URLs.

-- O hardening original aplicava a validação mesmo quando a foto opcional era
-- NULL. Isso contradizia o schema e impedia restaurar jogadores Browns sem
-- avatar. Mantém os mesmos limites quando uma imagem realmente existe.
create or replace function public.validar_imagem_guardada()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name = 'players' then
    if new.photo_url is not null then
      perform public.validar_imagem_data_url(new.photo_url, 1500000);
    end if;
  elsif tg_table_name = 'match_media' then
    perform public.validar_imagem_data_url(new.data_url, 3000000);
  elsif tg_table_name = 'matches' then
    if new.winner_photo is not null then
      perform public.validar_imagem_data_url(new.winner_photo, 3000000);
    end if;
    if new.location_photo is not null then
      perform public.validar_imagem_data_url(new.location_photo, 3000000);
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- claims

alter table public.legacy_claims
  add column revoked_at timestamptz,
  add column revoked_by_profile_id uuid references public.profiles(id) on delete set null,
  add column revoke_reason text;

drop index public.legacy_claims_open_per_profile_idx;
create unique index legacy_claims_open_per_profile_idx
  on public.legacy_claims (profile_id)
  where consumed_at is null and revoked_at is null;

create or replace function public.issue_legacy_claim(
  p_membership_id uuid,
  p_reason text
)
returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_membership public.pelada_memberships;
  v_profile public.profiles;
  v_actor uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_code text;
begin
  select * into v_membership
  from public.pelada_memberships
  where id = p_membership_id
  for update;

  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
  if not public.has_pelada_role(v_membership.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_membership.profile_id is null then raise exception 'MEMBERSHIP_WITHOUT_PROFILE'; end if;
  if v_membership.legacy_player_id is null then raise exception 'NOT_A_LEGACY_MEMBER'; end if;
  if v_reason is null or char_length(v_reason) < 8 or char_length(v_reason) > 240 then
    raise exception 'INVALID_REASON';
  end if;

  select * into v_profile from public.profiles where id = v_membership.profile_id;
  if v_profile.auth_user_id is not null then raise exception 'ALREADY_CLAIMED'; end if;

  -- Uma reemissão não apaga o rasto da anterior.
  update public.legacy_claims
  set revoked_at = now(),
      revoked_by_profile_id = v_actor,
      revoke_reason = 'Replaced by a new claim'
  where profile_id = v_profile.id
    and consumed_at is null
    and revoked_at is null;

  v_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  v_code := regexp_replace(v_code, '(.{4})(?=.)', '\1-', 'g');

  insert into public.legacy_claims (
    pelada_id, profile_id, code_hash, expires_at, issued_by_profile_id, reason
  ) values (
    v_membership.pelada_id,
    v_profile.id,
    encode(extensions.digest(v_code, 'sha256'), 'hex'),
    now() + interval '30 minutes',
    v_actor,
    v_reason
  );

  insert into public.tenant_audit_log (
    pelada_id, actor_profile_id, action, entity_type, entity_id, metadata
  ) values (
    v_membership.pelada_id, v_actor, 'legacy_claim.issued',
    'pelada_membership', p_membership_id,
    jsonb_build_object('reason', v_reason)
  );

  return v_code;
end;
$$;

create or replace function public.get_legacy_claim_candidates(p_pelada_id uuid)
returns table (
  membership_id uuid,
  profile_id uuid,
  display_name text,
  nickname text,
  has_account boolean,
  claim_state text,
  claim_created_at timestamptz,
  claim_expires_at timestamptz,
  claim_reason text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_pelada_role(p_pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    membership.id,
    profile.id,
    profile.display_name,
    membership.nickname,
    profile.auth_user_id is not null,
    case
      when profile.auth_user_id is not null then 'claimed'
      when claim.id is null then 'none'
      when claim.consumed_at is not null then 'claimed'
      when claim.revoked_at is not null then 'revoked'
      when claim.expires_at <= now() then 'expired'
      else 'active'
    end,
    claim.created_at,
    claim.expires_at,
    claim.reason
  from public.pelada_memberships membership
  join public.profiles profile on profile.id = membership.profile_id
  left join lateral (
    select candidate.*
    from public.legacy_claims candidate
    where candidate.profile_id = profile.id
      and candidate.pelada_id = p_pelada_id
    order by candidate.created_at desc
    limit 1
  ) claim on true
  where membership.pelada_id = p_pelada_id
    and membership.legacy_player_id is not null
    and membership.status <> 'removed'
  order by lower(coalesce(membership.nickname, profile.display_name)), membership.id;
end;
$$;

create or replace function public.revoke_legacy_claim(
  p_membership_id uuid,
  p_reason text
)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_membership public.pelada_memberships;
  v_actor uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_count int;
begin
  select * into v_membership
  from public.pelada_memberships
  where id = p_membership_id;

  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
  if not public.has_pelada_role(v_membership.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_reason is null or char_length(v_reason) < 8 or char_length(v_reason) > 240 then
    raise exception 'INVALID_REASON';
  end if;

  update public.legacy_claims
  set revoked_at = now(), revoked_by_profile_id = v_actor, revoke_reason = v_reason
  where profile_id = v_membership.profile_id
    and consumed_at is null
    and revoked_at is null;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.tenant_audit_log (
      pelada_id, actor_profile_id, action, entity_type, entity_id, metadata
    ) values (
      v_membership.pelada_id, v_actor, 'legacy_claim.revoked',
      'pelada_membership', p_membership_id,
      jsonb_build_object('reason', v_reason)
    );
  end if;

  return v_count > 0;
end;
$$;

-- Só um profile recém-criado e ainda vazio pode ser substituído pelo legado.
-- A lista é explícita: se o produto ganhar uma nova relação restritiva, o delete
-- falha fechado em vez de fundir dados silenciosamente.
create or replace function public.profile_is_disposable_for_legacy_claim(p_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = p_profile_id and profile.auth_user_id = auth.uid()
  )
  and not exists (select 1 from public.pelada_memberships where profile_id = p_profile_id)
  and not exists (select 1 from public.peladas where owner_profile_id = p_profile_id)
  and not exists (select 1 from public.pelada_join_requests where profile_id = p_profile_id)
  and not exists (select 1 from public.pelada_invites where created_by = p_profile_id)
  and not exists (select 1 from public.notifications where profile_id = p_profile_id)
  and not exists (select 1 from public.tenant_audit_log where actor_profile_id = p_profile_id)
  and not exists (select 1 from public.legacy_claims where issued_by_profile_id = p_profile_id);
$$;

create or replace function public.claim_legacy_profile(p_code text)
returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_auth uuid := auth.uid();
  v_current public.profiles;
  v_target public.profiles;
  v_claim public.legacy_claims;
  v_limit json;
  v_hash text;
begin
  if v_auth is null then raise exception 'AUTH_REQUIRED'; end if;

  v_limit := public.consume_api_rate_limit(
    'legacy_claim',
    encode(extensions.digest(v_auth::text, 'sha256'), 'hex'),
    encode(extensions.digest(v_auth::text, 'sha256'), 'hex'),
    5, 900
  );
  if coalesce((v_limit->>'allowed')::boolean, false) is not true then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  select * into v_current
  from public.profiles
  where auth_user_id = v_auth
  for update;

  if found and not public.profile_is_disposable_for_legacy_claim(v_current.id) then
    raise exception 'ACCOUNT_ALREADY_LINKED';
  end if;

  v_hash := encode(extensions.digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex');
  select * into v_claim
  from public.legacy_claims
  where code_hash = v_hash
  for update;

  if not found then raise exception 'INVALID_CLAIM'; end if;
  if v_claim.revoked_at is not null then raise exception 'INVALID_CLAIM'; end if;
  if v_claim.consumed_at is not null then raise exception 'CLAIM_ALREADY_USED'; end if;
  if v_claim.expires_at <= now() then raise exception 'CLAIM_EXPIRED'; end if;

  select * into v_target from public.profiles where id = v_claim.profile_id for update;
  if v_target.auth_user_id is not null then raise exception 'ALREADY_CLAIMED'; end if;

  if v_current.id is not null and v_current.id <> v_target.id then
    -- Preserva a identidade Browns e só preenche preferências/campos ausentes.
    update public.profiles
    set avatar_path = coalesce(avatar_path, v_current.avatar_path),
        bio = coalesce(bio, v_current.bio),
        country_code = coalesce(country_code, v_current.country_code),
        city = coalesce(city, v_current.city),
        locale = v_current.locale,
        timezone = v_current.timezone,
        privacy = v_current.privacy
    where id = v_target.id;

    delete from public.profiles where id = v_current.id;
  end if;

  update public.profiles set auth_user_id = v_auth where id = v_target.id;
  update public.legacy_claims
  set consumed_at = now(), consumed_by_auth_user = v_auth
  where id = v_claim.id;

  insert into public.tenant_audit_log (
    pelada_id, actor_profile_id, action, entity_type, entity_id, metadata
  ) values (
    v_claim.pelada_id, v_target.id, 'legacy_claim.consumed',
    'profile', v_target.id,
    jsonb_build_object('replaced_bootstrap_profile', v_current.id is not null and v_current.id <> v_target.id)
  );

  return v_target.id;
end;
$$;

-- ---------------------------------------------------------------- feed e mídia

create table public.game_media (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  game_id uuid not null,
  kind text not null default 'photo' check (kind in ('photo','winner','location')),
  bucket_id text not null default 'game-media',
  object_path text not null unique,
  mime_type text check (mime_type is null or mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  byte_size bigint check (byte_size is null or byte_size between 1 and 10485760),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  is_primary boolean not null default false,
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  legacy_media_id uuid unique,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  foreign key (game_id, pelada_id) references public.games(id, pelada_id) on delete cascade
);

create index game_media_game_idx on public.game_media (game_id, created_at);
create unique index game_media_primary_idx on public.game_media (game_id) where is_primary and status = 'ready';

create table public.pelada_feed_events (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  game_id uuid,
  event_key text not null,
  kind text not null check (kind in ('scheduled','draw','result','cancellation','substitution')),
  legacy_title text,
  legacy_body text,
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  legacy_publication_id uuid unique,
  created_at timestamptz not null default now(),
  foreign key (game_id, pelada_id) references public.games(id, pelada_id) on delete cascade,
  unique (pelada_id, event_key)
);

create index pelada_feed_events_timeline_idx
  on public.pelada_feed_events (pelada_id, published_at desc, id desc);

alter table public.game_media enable row level security;
alter table public.pelada_feed_events enable row level security;

create policy game_media_member_read on public.game_media
  for select using (status = 'ready' and public.is_active_member(pelada_id));
create policy pelada_feed_events_member_read on public.pelada_feed_events
  for select using (public.is_active_member(pelada_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-media', 'game-media', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy game_media_objects_member_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'game-media'
    and case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_active_member(split_part(name, '/', 1)::uuid)
      else false
    end
  );

create or replace function public.get_pelada_feed(
  p_pelada_id uuid,
  p_limit int default 30,
  p_before timestamptz default null
)
returns table (
  id uuid,
  game_id uuid,
  kind text,
  title text,
  body text,
  payload jsonb,
  published_at timestamptz,
  media jsonb
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_member(p_pelada_id) then raise exception 'FORBIDDEN'; end if;
  if coalesce(p_limit, 0) < 1 or p_limit > 100 then raise exception 'INVALID_LIMIT'; end if;

  return query
  select
    event.id,
    event.game_id,
    event.kind,
    event.legacy_title,
    event.legacy_body,
    event.payload,
    event.published_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', media_item.id,
        'bucket', media_item.bucket_id,
        'path', media_item.object_path,
        'kind', media_item.kind,
        'alt', coalesce(event.legacy_title, event.kind)
      ) order by media_item.is_primary desc, media_item.created_at)
      from public.game_media media_item
      where media_item.game_id = event.game_id and media_item.status = 'ready'
    ), '[]'::jsonb)
  from public.pelada_feed_events event
  where event.pelada_id = p_pelada_id
    and (p_before is null or event.published_at < p_before)
  order by event.published_at desc, event.id desc
  limit p_limit;
end;
$$;

create or replace function public.capture_game_feed_event()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- Jogos importados recebem as publicações históricas; não criamos duplicados.
  if exists (select 1 from public.matches legacy where legacy.id = new.id) then return new; end if;

  if tg_op = 'INSERT' then
    insert into public.pelada_feed_events (pelada_id, game_id, event_key, kind, payload, published_at)
    values (
      new.pelada_id, new.id, 'game:scheduled', 'scheduled',
      jsonb_build_object('scheduled_at', new.scheduled_at, 'location', new.location, 'format', new.format),
      new.created_at
    ) on conflict (pelada_id, event_key) do nothing;
  else
    if new.drawn_at is not null and old.drawn_at is distinct from new.drawn_at then
      insert into public.pelada_feed_events (pelada_id, game_id, event_key, kind, payload, published_at)
      values (
        new.pelada_id, new.id, 'game:draw', 'draw',
        jsonb_build_object('scheduled_at', new.scheduled_at), new.drawn_at
      ) on conflict (pelada_id, event_key) do update
        set payload = excluded.payload, published_at = excluded.published_at;
    end if;

    if new.status = 'cancelled' and old.status is distinct from new.status then
      insert into public.pelada_feed_events (pelada_id, game_id, event_key, kind, payload, published_at)
      values (
        new.pelada_id, new.id, 'game:cancellation', 'cancellation',
        jsonb_build_object('scheduled_at', new.scheduled_at), coalesce(new.cancelled_at, now())
      ) on conflict (pelada_id, event_key) do update
        set payload = excluded.payload, published_at = excluded.published_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger games_capture_feed_insert
  after insert on public.games
  for each row execute function public.capture_game_feed_event();
create trigger games_capture_feed_update
  after update of drawn_at, status on public.games
  for each row execute function public.capture_game_feed_event();

create or replace function public.capture_result_feed_event()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.matches legacy where legacy.id = new.game_id) then return new; end if;

  insert into public.pelada_feed_events (pelada_id, game_id, event_key, kind, payload, published_at)
  values (
    new.pelada_id, new.game_id, 'game:result', 'result',
    jsonb_build_object('score_a', new.score_a, 'score_b', new.score_b), new.recorded_at
  ) on conflict (pelada_id, event_key) do update
    set payload = excluded.payload, published_at = excluded.published_at;
  return new;
end;
$$;

create trigger game_results_capture_feed_insert
  after insert on public.game_results
  for each row execute function public.capture_result_feed_event();
create trigger game_results_capture_feed_update
  after update of score_a, score_b on public.game_results
  for each row execute function public.capture_result_feed_event();

create or replace function public.backfill_browns_content()
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pelada_id uuid := '00000000-0000-4000-8000-000000000101';
  v_media int;
  v_events int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;

  if exists (select 1 from public.matches legacy left join public.games game on game.id = legacy.id where game.id is null) then
    raise exception 'BROWNS_HISTORY_BACKFILL_REQUIRED';
  end if;

  insert into public.game_media (
    id, pelada_id, game_id, kind, object_path, mime_type,
    is_primary, status, legacy_media_id, created_at
  )
  select
    legacy.id,
    v_pelada_id,
    legacy.match_id,
    lower(legacy.kind),
    v_pelada_id::text || '/' || legacy.match_id::text || '/' || legacy.id::text ||
      case
        when legacy.data_url like 'data:image/png;%' then '.png'
        when legacy.data_url like 'data:image/webp;%' then '.webp'
        when legacy.data_url like 'data:image/gif;%' then '.gif'
        else '.jpg'
      end,
    case
      when legacy.data_url like 'data:image/png;%' then 'image/png'
      when legacy.data_url like 'data:image/webp;%' then 'image/webp'
      when legacy.data_url like 'data:image/gif;%' then 'image/gif'
      else 'image/jpeg'
    end,
    legacy.is_primary,
    'pending',
    legacy.id,
    legacy.created_at
  from public.match_media legacy
  on conflict (legacy_media_id) do update
  set kind = excluded.kind,
      object_path = excluded.object_path,
      mime_type = excluded.mime_type,
      is_primary = excluded.is_primary;
  get diagnostics v_media = row_count;

  insert into public.pelada_feed_events (
    id, pelada_id, game_id, event_key, kind, legacy_title,
    legacy_body, payload, published_at, legacy_publication_id, created_at
  )
  select
    publication.id,
    v_pelada_id,
    publication.match_id,
    'legacy:' || publication.id::text,
    case publication.type
      when 'SORTEIO' then 'draw'
      when 'RESULTADO' then 'result'
      when 'CANCELAMENTO' then 'cancellation'
      else 'substitution'
    end,
    publication.title,
    publication.body,
    coalesce(publication.payload, '{}'::jsonb),
    publication.published_at,
    publication.id,
    publication.created_at
  from public.match_publications publication
  on conflict (legacy_publication_id) do update
  set legacy_title = excluded.legacy_title,
      legacy_body = excluded.legacy_body,
      payload = excluded.payload,
      published_at = excluded.published_at;
  get diagnostics v_events = row_count;

  insert into public.tenant_audit_log (pelada_id, action, entity_type, metadata)
  values (
    v_pelada_id, 'browns.content_backfilled', 'migration',
    jsonb_build_object(
      'media_rows_touched', v_media,
      'feed_rows_touched', v_events,
      'legacy_media', (select count(*) from public.match_media),
      'legacy_publications', (select count(*) from public.match_publications)
    )
  );

  return jsonb_build_object(
    'media_rows_touched', v_media,
    'feed_rows_touched', v_events,
    'legacy_media', (select count(*) from public.match_media),
    'legacy_publications', (select count(*) from public.match_publications)
  );
end;
$$;

create or replace function public.mark_browns_media_ready(
  p_media_id uuid,
  p_mime_type text,
  p_sha256 text,
  p_byte_size bigint
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp','image/gif')
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_byte_size < 1
    or p_byte_size > 10485760 then
    raise exception 'INVALID_MEDIA_METADATA';
  end if;

  update public.game_media
  set mime_type = p_mime_type,
      sha256 = p_sha256,
      byte_size = p_byte_size,
      status = 'ready',
      uploaded_at = now()
  where id = p_media_id and legacy_media_id is not null;

  if not found then raise exception 'MEDIA_NOT_FOUND'; end if;
end;
$$;

create or replace function public.mark_browns_media_failed(p_media_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  update public.game_media
  set status = 'failed'
  where id = p_media_id and legacy_media_id is not null and status = 'pending';
  if not found then raise exception 'MEDIA_NOT_FOUND'; end if;
end;
$$;

revoke all on table public.game_media, public.pelada_feed_events from public, anon;
grant select on table public.game_media, public.pelada_feed_events to authenticated;

revoke all on function public.issue_legacy_claim(uuid, text) from public, anon;
revoke all on function public.claim_legacy_profile(text) from public, anon;
revoke all on function public.get_legacy_claim_candidates(uuid) from public, anon;
revoke all on function public.revoke_legacy_claim(uuid, text) from public, anon;
revoke all on function public.get_pelada_feed(uuid, int, timestamptz) from public, anon;

grant execute on function public.issue_legacy_claim(uuid, text) to authenticated;
grant execute on function public.claim_legacy_profile(text) to authenticated;
grant execute on function public.get_legacy_claim_candidates(uuid) to authenticated;
grant execute on function public.revoke_legacy_claim(uuid, text) to authenticated;
grant execute on function public.get_pelada_feed(uuid, int, timestamptz) to authenticated;

revoke all on function public.profile_is_disposable_for_legacy_claim(uuid) from public, anon, authenticated;
revoke all on function public.capture_game_feed_event() from public, anon, authenticated;
revoke all on function public.capture_result_feed_event() from public, anon, authenticated;
revoke all on function public.backfill_browns_content() from public, anon, authenticated;
revoke all on function public.mark_browns_media_ready(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.mark_browns_media_failed(uuid) from public, anon, authenticated;

grant execute on function public.backfill_browns_content() to service_role;
grant execute on function public.mark_browns_media_ready(uuid, text, text, bigint) to service_role;
grant execute on function public.mark_browns_media_failed(uuid) to service_role;
