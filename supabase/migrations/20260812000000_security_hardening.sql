-- PR2 — hardening imediato do legado Browns.
--
-- Esta migration é append-only e preserva todos os IDs e dados funcionais.
-- Ela prepara a fronteira segura usada por `functions/secure-rpc`:
--   * rate limiting persistente, consumido em transação separada;
--   * operações sensíveis executáveis apenas por service_role;
--   * tokens de dispositivo armazenados somente como SHA-256;
--   * DOB removida do DTO público de jogadores;
--   * validação server-side de imagens base64.

-- ========================== RATE LIMITING ==========================

create table if not exists public.api_rate_limits (
  scope            text        not null,
  fingerprint_hash text        not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  subject_hash     text        not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_start     timestamptz not null,
  attempts         integer     not null default 0 check (attempts >= 0),
  expires_at       timestamptz not null,
  primary key (scope, fingerprint_hash, subject_hash, window_start)
);

alter table public.api_rate_limits enable row level security;
create index if not exists api_rate_limits_expiry_idx
  on public.api_rate_limits (expires_at);

create or replace function public.api_rate_limit_status(
  p_scope text,
  p_fingerprint_hash text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
) returns json
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  v_start timestamptz;
  v_attempts integer;
  v_retry integer;
begin
  if p_scope is null or p_scope !~ '^[a-z0-9:_-]{1,80}$'
     or p_fingerprint_hash !~ '^[0-9a-f]{64}$'
     or p_subject_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 10000
     or p_window_seconds not between 10 and 86400 then
    raise exception 'RATELIMITCONFIG';
  end if;

  v_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  select r.attempts into v_attempts
  from public.api_rate_limits r
  where r.scope = p_scope
    and r.fingerprint_hash = p_fingerprint_hash
    and r.subject_hash = p_subject_hash
    and r.window_start = v_start;

  v_attempts := coalesce(v_attempts, 0);
  v_retry := greatest(1, ceil(extract(epoch from
    (v_start + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer);

  return json_build_object(
    'allowed', v_attempts < p_limit,
    'attempts', v_attempts,
    'retry_after', case when v_attempts >= p_limit then v_retry else 0 end
  );
end;
$$;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_fingerprint_hash text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
) returns json
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_start timestamptz;
  v_attempts integer;
  v_retry integer;
begin
  if p_scope is null or p_scope !~ '^[a-z0-9:_-]{1,80}$'
     or p_fingerprint_hash !~ '^[0-9a-f]{64}$'
     or p_subject_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 10000
     or p_window_seconds not between 10 and 86400 then
    raise exception 'RATELIMITCONFIG';
  end if;

  v_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_limits(
    scope, fingerprint_hash, subject_hash, window_start, attempts, expires_at
  ) values (
    p_scope, p_fingerprint_hash, p_subject_hash, v_start, 1,
    v_start + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (scope, fingerprint_hash, subject_hash, window_start)
  do update set
    attempts = public.api_rate_limits.attempts + 1,
    expires_at = excluded.expires_at
  returning attempts into v_attempts;

  -- Retenção curta: estes hashes servem apenas para proteção contra abuso.
  delete from public.api_rate_limits where expires_at < clock_timestamp();

  v_retry := greatest(1, ceil(extract(epoch from
    (v_start + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer);

  return json_build_object(
    'allowed', v_attempts <= p_limit,
    'attempts', v_attempts,
    'retry_after', case when v_attempts > p_limit then v_retry else 0 end
  );
end;
$$;

revoke all on table public.api_rate_limits from public, anon, authenticated;
revoke all on function public.api_rate_limit_status(text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.consume_api_rate_limit(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.api_rate_limit_status(text, text, text, integer, integer)
  to service_role;
grant execute on function public.consume_api_rate_limit(text, text, text, integer, integer)
  to service_role;

create or replace function public.admin_change_password(p_pw text, p_new text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_new is null or char_length(p_new) < 12 or char_length(p_new) > 128 then
    raise exception 'SENHAFRACA';
  end if;
  update app_config
  set admin_pw_hash = crypt(p_new, gen_salt('bf'))
  where id = 1;
end;
$$;

-- ========================== IMAGENS ================================

create or replace function public.validar_imagem_data_url(p_data text, p_max_bytes integer)
returns void
language plpgsql immutable
set search_path = public, extensions
as $$
begin
  if p_data is null or btrim(p_data) = '' then raise exception 'FOTO'; end if;
  if octet_length(p_data) > p_max_bytes then raise exception 'FOTOGRANDE'; end if;
  if p_data !~ '^data:image/(jpeg|png|webp);base64,' then raise exception 'FOTOTIPO'; end if;
end;
$$;

create or replace function public.validar_imagem_guardada()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name = 'players' then
    perform public.validar_imagem_data_url(new.photo_url, 1500000);
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

drop trigger if exists players_validar_foto on public.players;
create trigger players_validar_foto
before insert or update of photo_url on public.players
for each row execute function public.validar_imagem_guardada();

drop trigger if exists match_media_validar_foto on public.match_media;
create trigger match_media_validar_foto
before insert or update of data_url on public.match_media
for each row execute function public.validar_imagem_guardada();

drop trigger if exists matches_validar_fotos_legadas on public.matches;
create trigger matches_validar_fotos_legadas
before insert or update of winner_photo, location_photo on public.matches
for each row execute function public.validar_imagem_guardada();

revoke all on function public.validar_imagem_data_url(text, integer)
  from public, anon, authenticated;
revoke all on function public.validar_imagem_guardada()
  from public, anon, authenticated;

-- ==================== TOKENS DE DISPOSITIVO ========================

alter table public.player_devices add column if not exists id uuid;
update public.player_devices set id = gen_random_uuid() where id is null;
alter table public.player_devices alter column id set default gen_random_uuid();
alter table public.player_devices alter column id set not null;

alter table public.player_devices drop constraint if exists player_devices_pkey;
alter table public.player_devices add constraint player_devices_pkey primary key (id);

alter table public.player_devices add column if not exists token_hash bytea;
update public.player_devices
set token_hash = digest(token::text, 'sha256')
where token_hash is null and token is not null;
alter table public.player_devices alter column token_hash set not null;
create unique index if not exists player_devices_token_hash_idx
  on public.player_devices (token_hash);

alter table public.player_devices alter column token drop default;
alter table public.player_devices alter column token drop not null;
update public.player_devices set token = null where token is not null;

create or replace function public.autenticar_votante(p_voter uuid, p_pin text, p_token uuid)
returns uuid language plpgsql stable security definer set search_path = public, extensions as $$
declare r players; v_id uuid;
begin
  if p_token is not null then
    select d.player_id into v_id
    from player_devices d
    where d.token_hash = digest(p_token::text, 'sha256')
      and d.revoked_at is null and d.expires_at > now();
    if v_id is null then raise exception 'TOKENINVALIDO'; end if;
    if p_voter is not null and p_voter <> v_id then raise exception 'TOKENINVALIDO'; end if;
  else
    select * into r from players where id = p_voter;
    if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
      raise exception 'CRED';
    end if;
    if not r.approved then raise exception 'PENDENTE'; end if;
    v_id := r.id;
  end if;
  return v_id;
end; $$;

create or replace function public.issue_device_token(p_id uuid, p_pin text, p_label text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_token uuid := gen_random_uuid();
begin
  select * into r from players where id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  delete from player_devices d
   where d.player_id = p_id and d.label is not distinct from nullif(btrim(p_label), '');

  insert into player_devices(player_id, label, token_hash)
  values (p_id, nullif(btrim(p_label), ''), digest(v_token::text, 'sha256'));
  return v_token;
end; $$;

create or replace function public.login_with_device(p_token uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_id uuid; v_pending int;
begin
  select d.player_id into v_id
  from player_devices d
  where d.token_hash = digest(p_token::text, 'sha256')
    and d.revoked_at is null and d.expires_at > now();
  if v_id is null then raise exception 'TOKENINVALIDO'; end if;

  select * into r from players where id = v_id;
  if r.id is null or not r.approved then raise exception 'TOKENINVALIDO'; end if;

  update player_devices set last_seen_at = now()
  where token_hash = digest(p_token::text, 'sha256');

  select count(*) into v_pending
    from players p
    where p.approved and p.id <> r.id
      and not exists (select 1 from ratings rt where rt.rater_id = r.id and rt.target_id = p.id);

  return json_build_object(
    'id', r.id, 'name', r.name, 'user_id', r.user_id,
    'is_admin', false, 'voted', v_pending = 0,
    'player_type', r.player_type,
    'primary_position', r.primary_position,
    'secondary_position', r.secondary_position,
    'accepts_other_positions', r.accepts_other_positions,
    'position_status', r.position_status,
    'position_notice', null,
    'device', true
  );
end; $$;

create or replace function public.revoke_device(p_token uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update player_devices set revoked_at = now()
  where token_hash = digest(p_token::text, 'sha256') and revoked_at is null;
end; $$;

-- ======================= DTO PÚBLICO ===============================

drop function if exists public.get_players();
create function public.get_players()
returns table(
  id uuid, name text, photo_url text, avg numeric, votes bigint,
  player_type text, primary_position text, secondary_position text,
  accepts_other_positions boolean, position_status text,
  gk_rotation_ok boolean, gk_starts bigint, last_gk_start date,
  is_member boolean, availability_status text, availability_note text,
  primary_card text, nickname text)
language sql security definer set search_path = public, extensions as $$
  select p.id, p.name, p.photo_url,
         round(avg(r.score)::numeric, 2) as avg,
         count(r.score) as votes,
         p.player_type, p.primary_position, p.secondary_position,
         p.accepts_other_positions, p.position_status,
         p.gk_rotation_ok,
         (select count(*) from match_lineup l
           join matches m on m.id = l.match_id
          where l.player_id = p.id and l.is_goalkeeper
            and m.status <> 'CANCELLED') as gk_starts,
         (select max(m.played_at) from match_lineup l
           join matches m on m.id = l.match_id
          where l.player_id = p.id and l.is_goalkeeper
            and m.status <> 'CANCELLED') as last_gk_start,
         p.is_member, p.availability_status, p.availability_note,
         p.primary_card, p.nickname
  from players p
  left join ratings r on r.target_id = p.id
  where p.approved
  group by p.id
  order by avg desc nulls last, p.name;
$$;
revoke all on function public.get_players() from public;
grant execute on function public.get_players() to anon, authenticated;

-- ======================= CUTOVER EDGE ==============================

-- O browser passa a chamar `secure-rpc`; a Edge Function usa service_role.
-- O loop cobre todas as assinaturas atuais sem depender de uma lista manual.
do $secure_edge$
declare r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        (p.proname like 'admin\_%' escape '\' and p.proname <> 'admin_ok')
        or p.proname = any(array[
          'register', 'login', 'publish_draw', 'update_photo', 'issue_device_token'
        ])
      )
  loop
    execute 'revoke execute on function ' || r.assinatura || ' from public, anon, authenticated';
    execute 'grant execute on function ' || r.assinatura || ' to service_role';
  end loop;
end
$secure_edge$;
