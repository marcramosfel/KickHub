-- KickHub V2 — garantir que toda a conta Auth tem um profile global.
--
-- O trigger original só cobria inserções novas e derivava o username dos dez
-- primeiros caracteres hexadecimais do id. Isso deixava duas falhas:
--
-- 1. contas criadas antes do trigger existir ficaram sem profile. Quem está
--    nesse estado autentica-se com sucesso, mas `current_profile_id()` devolve
--    null: o dashboard mostra zero peladas e `create_pelada` recusa com
--    AUTH_REQUIRED, sem que a interface consiga explicar porquê;
-- 2. dois ids com o mesmo prefixo colidiam no índice único de username e o
--    trigger abortava a inserção em `auth.users`, quebrando o registo.
--
-- A criação passa a ser idempotente, com username resistente a colisões, e
-- existe uma RPC para a aplicação se reparar sozinha caso o trigger volte a
-- falhar por algum motivo.

create or replace function public.generate_profile_username(p_auth_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_base text := 'user_' || left(replace(p_auth_user_id::text, '-', ''), 12);
  v_candidate text;
  v_suffix int := 0;
begin
  v_candidate := v_base;
  while exists (select 1 from public.profiles where username = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '_' || v_suffix::text;
  end loop;
  return v_candidate;
end;
$$;

create or replace function public.upsert_profile_for_auth_user(
  p_auth_user_id uuid,
  p_email text,
  p_meta jsonb
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
  v_attempt int := 0;
begin
  select * into v_profile from public.profiles where auth_user_id = p_auth_user_id;
  if found then
    return v_profile;
  end if;

  -- O laço cobre a corrida entre escolher um username livre e inseri-lo: outra
  -- sessão pode ficar com ele no intervalo.
  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.profiles (auth_user_id, username, display_name, locale, timezone)
      values (
        p_auth_user_id,
        public.generate_profile_username(p_auth_user_id),
        coalesce(
          nullif(trim(p_meta->>'full_name'), ''),
          nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
          'Jogador'
        ),
        case when p_meta->>'locale' in ('pt','en','es','fr','de') then p_meta->>'locale' else 'pt' end,
        coalesce(nullif(p_meta->>'timezone', ''), 'Europe/Zurich')
      )
      on conflict (auth_user_id) do nothing
      returning * into v_profile;

      if v_profile.id is not null then
        return v_profile;
      end if;

      -- Sem linha devolvida: outra transação já criou o profile desta conta.
      select * into v_profile from public.profiles where auth_user_id = p_auth_user_id;
      if found then
        return v_profile;
      end if;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.upsert_profile_for_auth_user(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$$;

-- A aplicação chama isto quando encontra uma sessão sem profile, em vez de
-- deixar o utilizador num estado em que nada funciona.
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
begin
  select id, email, raw_user_meta_data into v_user from auth.users where id = auth.uid();
  if not found then
    raise exception 'AUTH_REQUIRED';
  end if;
  return public.upsert_profile_for_auth_user(v_user.id, v_user.email, v_user.raw_user_meta_data);
end;
$$;

-- Recupera as contas que ficaram sem profile.
do $backfill$
declare
  v_user record;
begin
  for v_user in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (select 1 from public.profiles p where p.auth_user_id = u.id)
  loop
    perform public.upsert_profile_for_auth_user(v_user.id, v_user.email, v_user.raw_user_meta_data);
  end loop;
end;
$backfill$;

revoke all on function public.generate_profile_username(uuid) from public, anon, authenticated;
revoke all on function public.upsert_profile_for_auth_user(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ensure_profile() from public, anon;

grant execute on function public.ensure_profile() to authenticated;
