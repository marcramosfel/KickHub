-- =====================================================================
--  PELADA BROWNS — Migração 8: IDs únicos de utilizador + login por Nome/ID
--
--  Problema: login só por nome causava dificuldades (nomes iguais, acentos,
--  espaços). Solução: cada jogador ganha um `user_id` único e estável,
--  gerado a partir do nome (minúsculas, sem acentos/espaços/símbolos), com
--  numeração automática em caso de repetição (joaosilva, joaosilva2, ...).
--
--  O login passa a aceitar NOME ou USER_ID. Nomes repetidos deixam de ser
--  bloqueados (é para isso que serve o user_id); a desambiguação no login
--  pede o ID único quando o nome é partilhado.
--
--  Inclui backfill dos jogadores já existentes, com as mesmas regras.
-- =====================================================================

-- ---------- HELPERS ----------

-- Normaliza um texto para slug: minúsculas, sem acentos, só [a-z0-9].
-- Usa translate() (sem depender da extensão unaccent, que tem gotchas de
-- schema no Supabase) — cobre os acentos do português de forma determinística.
create or replace function slugify(p text)
returns text language sql immutable as $$
  select regexp_replace(
    translate(
      lower(coalesce(p, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+', '', 'g'
  );
$$;

-- Gera um user_id único a partir do nome (sufixo numérico se já existir).
create or replace function gen_user_id(p_name text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare base text; candidate text; n int := 1;
begin
  base := slugify(p_name);
  if base = '' then base := 'jogador'; end if;
  candidate := base;
  while exists (select 1 from players where user_id = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  return candidate;
end; $$;

-- ---------- COLUNA + BACKFILL ----------

alter table players add column if not exists user_id text;

-- nomes repetidos passam a ser permitidos (distinguidos pelo user_id)
drop index if exists players_name_key;

-- gera user_id para quem ainda não tem, por ordem de criação
do $$
declare rec record;
begin
  for rec in select id, name from players where user_id is null order by created_at, id loop
    update players set user_id = gen_user_id(name) where id = rec.id;
  end loop;
end $$;

alter table players alter column user_id set not null;
create unique index if not exists players_user_id_key on players(user_id);

-- ---------- REGISTER (agora gera e devolve o user_id) ----------
-- returns muda de void para text -> é preciso drop + create.
drop function if exists register(text, date, text, text);
create function register(p_name text, p_dob date, p_photo text, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_uid text;
begin
  if length(coalesce(btrim(p_name), '')) = 0 then raise exception 'NOME'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN'; end if;
  if coalesce(length(p_photo), 0) = 0 then raise exception 'FOTO'; end if;
  -- nomes repetidos já não são bloqueados: o user_id garante a unicidade
  v_uid := gen_user_id(p_name);
  insert into players(name, dob, photo_url, approved, pin_hash, user_id)
  values (btrim(p_name), p_dob, p_photo, false, crypt(p_pin, gen_salt('bf')), v_uid);
  return v_uid;
end; $$;

-- ---------- LOGIN por NOME ou USER_ID ----------
create or replace function login(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; norm text; name_ids uuid[]; v_pending int;
begin
  norm := slugify(p_name);
  if norm = '' then raise exception 'CRED'; end if;
  -- 1) match exato por user_id (o identificador único vence sempre)
  select * into r from players where user_id = norm;
  -- 2) senão, por nome normalizado (ignora maiúsculas/acentos/espaços)
  if r.id is null then
    select array_agg(id) into name_ids from players where slugify(name) = norm;
    if coalesce(array_length(name_ids, 1), 0) >= 2 then raise exception 'AMBIGUO'; end if;
    if array_length(name_ids, 1) = 1 then select * into r from players where id = name_ids[1]; end if;
  end if;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  select count(*) into v_pending
    from players p
    where p.approved and p.id <> r.id
      and not exists (select 1 from ratings rt where rt.rater_id = r.id and rt.target_id = p.id);
  return json_build_object(
    'id', r.id, 'name', r.name, 'user_id', r.user_id,
    'is_admin', r.is_admin, 'voted', v_pending = 0
  );
end; $$;

-- ---------- ADMIN: gestão de IDs ----------

-- Lista TODOS os utilizadores (aprovados e pendentes) com o seu estado.
create or replace function admin_users(p_pw text)
returns table(id uuid, name text, user_id text, approved boolean, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return query
    select p.id, p.name, p.user_id, p.approved, p.created_at
    from players p order by p.created_at;
end; $$;

-- Regenera o user_id a partir do nome atual (com deduplicação).
-- Exclui o próprio jogador da verificação (a coluna é NOT NULL, por isso
-- não se pode passar por null; deduplica ignorando o id atual).
create or replace function admin_regen_user_id(p_pw text, p_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_name text; base text; candidate text; n int := 1;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  select name into v_name from players where id = p_id;
  if v_name is null then raise exception 'CRED'; end if;
  base := slugify(v_name);
  if base = '' then base := 'jogador'; end if;
  candidate := base;
  while exists (select 1 from players where user_id = candidate and id <> p_id) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  update players set user_id = candidate where id = p_id;
  return candidate;
end; $$;

-- Define um user_id personalizado (normalizado; tem de ser único).
create or replace function admin_set_user_id(p_pw text, p_id uuid, p_new text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_slug text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  v_slug := slugify(p_new);
  if v_slug = '' then raise exception 'IDVAZIO'; end if;
  if exists (select 1 from players where user_id = v_slug and id <> p_id) then raise exception 'IDEXISTE'; end if;
  update players set user_id = v_slug where id = p_id;
  return v_slug;
end; $$;

-- ---------- PERMISSÕES ----------
grant execute on function register(text, date, text, text)   to anon, authenticated;
grant execute on function admin_users(text)                  to anon, authenticated;
grant execute on function admin_regen_user_id(text, uuid)    to anon, authenticated;
grant execute on function admin_set_user_id(text, uuid, text) to anon, authenticated;
