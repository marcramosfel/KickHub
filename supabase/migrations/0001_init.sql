-- =====================================================================
--  PELADA EQUILIBRADA — Base de dados (Supabase / Postgres)
--  Modelo de acesso: as tabelas ficam FECHADAS (RLS on, sem políticas).
--  Toda a app fala só com as funções abaixo (SECURITY DEFINER), que
--  validam PIN/senha no servidor. A chave anon nunca lê as tabelas direto.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- TABELAS ----------
create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  dob        date,
  photo_url  text,                 -- foto como data URL (base64)
  approved   boolean not null default false,
  is_admin   boolean not null default false,
  pin_hash   text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists players_name_key on players (lower(name));

create table if not exists ratings (
  rater_id   uuid not null references players(id) on delete cascade,
  target_id  uuid not null references players(id) on delete cascade,
  score      int  not null check (score between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (rater_id, target_id)
);

create table if not exists draws (
  id         uuid primary key default gen_random_uuid(),
  team_a     jsonb not null,
  team_b     jsonb not null,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists app_config (
  id            int primary key default 1,
  admin_pw_hash text not null
);
-- senha inicial do admin = 'pelada2026'
insert into app_config (id, admin_pw_hash)
values (1, crypt('pelada2026', gen_salt('bf')))
on conflict (id) do nothing;

-- ---------- FECHAR AS TABELAS ----------
alter table players    enable row level security;
alter table ratings    enable row level security;
alter table draws      enable row level security;
alter table app_config enable row level security;

-- ---------- FUNÇÕES (a API da app) ----------

create or replace function register(p_name text, p_dob date, p_photo text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(coalesce(btrim(p_name),'')) = 0 then raise exception 'NOME'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN'; end if;
  if coalesce(length(p_photo),0) = 0 then raise exception 'FOTO'; end if;
  if exists (select 1 from players where lower(name) = lower(btrim(p_name))) then raise exception 'EXISTE'; end if;
  insert into players(name, dob, photo_url, approved, pin_hash)
  values (btrim(p_name), p_dob, p_photo, false, crypt(p_pin, gen_salt('bf')));
end; $$;

create or replace function login(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_voted boolean;
begin
  select * into r from players where lower(name) = lower(btrim(p_name));
  if r.id is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  select exists(select 1 from ratings where rater_id = r.id) into v_voted;
  return json_build_object('id', r.id, 'name', r.name, 'is_admin', r.is_admin, 'voted', v_voted);
end; $$;

create or replace function get_players()
returns table(id uuid, name text, dob date, photo_url text, avg numeric, votes bigint)
language sql security definer set search_path = public, extensions as $$
  select p.id, p.name, p.dob, p.photo_url,
         round(avg(r.score)::numeric, 2) as avg,
         count(r.score) as votes
  from players p
  left join ratings r on r.target_id = p.id
  where p.approved
  group by p.id
  order by avg desc nulls last, p.name;
$$;

create or replace function get_stats()
returns json language sql security definer set search_path = public, extensions as $$
  select json_build_object(
    'approved', (select count(*) from players where approved),
    'voters',   (select count(distinct rater_id) from ratings)
  );
$$;

create or replace function submit_ratings(p_rater uuid, p_pin text, p_scores jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players; k text; v int;
begin
  select * into r from players where id = p_rater;
  if r.id is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  if exists(select 1 from ratings where rater_id = p_rater) then raise exception 'JAVOTOU'; end if;
  for k, v in select key, (value)::int from jsonb_each_text(p_scores) loop
    if v < 0 or v > 5 then raise exception 'SCORE'; end if;
    if k::uuid <> p_rater then
      insert into ratings(rater_id, target_id, score) values (p_rater, k::uuid, v);
    end if;
  end loop;
end; $$;

create or replace function admin_ok(p_pw text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select exists(select 1 from app_config where id = 1 and admin_pw_hash = crypt(p_pw, admin_pw_hash));
$$;

create or replace function admin_pending(p_pw text)
returns table(id uuid, name text, dob date, photo_url text, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return query select p.id, p.name, p.dob, p.photo_url, p.created_at
               from players p where not p.approved order by p.created_at;
end; $$;

create or replace function admin_approve(p_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update players set approved = true where id = p_id;
end; $$;

create or replace function admin_reject(p_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from players where id = p_id;
end; $$;

create or replace function publish_draw(p_pw text, p_a jsonb, p_b jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  insert into draws(team_a, team_b) values (p_a, p_b);
end; $$;

create or replace function get_published_draw()
returns json language sql security definer set search_path = public, extensions as $$
  select json_build_object('team_a', team_a, 'team_b', team_b, 'created_at', created_at)
  from draws where published order by created_at desc limit 1;
$$;

-- ---------- PERMISSÕES ----------
grant execute on function register(text,date,text,text)  to anon, authenticated;
grant execute on function login(text,text)                to anon, authenticated;
grant execute on function get_players()                   to anon, authenticated;
grant execute on function get_stats()                     to anon, authenticated;
grant execute on function submit_ratings(uuid,text,jsonb) to anon, authenticated;
grant execute on function admin_pending(text)             to anon, authenticated;
grant execute on function admin_approve(text,uuid)        to anon, authenticated;
grant execute on function admin_reject(text,uuid)         to anon, authenticated;
grant execute on function publish_draw(text,jsonb,jsonb)  to anon, authenticated;
grant execute on function get_published_draw()            to anon, authenticated;

-- Trocar senha de admin:
--   update app_config set admin_pw_hash = crypt('NOVA_SENHA', gen_salt('bf')) where id = 1;
