-- KickHub V2 — editar o próprio perfil.
--
-- Faltava a porta. O perfil era criado pelo `upsert_profile_for_auth_user`, que
-- é interno e está revogado a `authenticated` — e depois disso ninguém podia
-- mudar o nome, o `@`, a bio ou a cidade. Uma aplicação onde não se pode
-- corrigir o próprio nome não está terminada.
--
-- Passa tudo pelo servidor e não por um `update` directo à tabela: o `username`
-- é único e tem formato, e a unicidade não se verifica no browser.

create or replace function public.update_my_profile(
  p_display_name text default null,
  p_username text default null,
  p_bio text default null,
  p_country_code text default null,
  p_city text default null,
  p_locale text default null,
  p_timezone text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
  v_username text := lower(nullif(trim(p_username), ''));
  v_display_name text := nullif(trim(p_display_name), '');
  v_country text := upper(nullif(trim(p_country_code), ''));
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if not found then raise exception 'AUTH_REQUIRED'; end if;

  -- As mesmas regras que a tabela impõe, mas verificadas aqui para o erro ser
  -- um nome que a interface saiba traduzir em vez de uma violação de check.
  if v_display_name is not null and char_length(v_display_name) not between 2 and 60 then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;
  if v_username is not null and v_username !~ '^[a-z0-9][a-z0-9_-]{2,29}$' then
    raise exception 'INVALID_USERNAME';
  end if;
  if p_bio is not null and char_length(p_bio) > 500 then raise exception 'BIO_TOO_LONG'; end if;
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then raise exception 'INVALID_COUNTRY'; end if;
  if p_locale is not null and p_locale not in ('pt','en','es','fr','de') then
    raise exception 'INVALID_LOCALE';
  end if;

  -- O `@` é o endereço público de uma pessoa. Quem já o tem fica com ele, e a
  -- recusa é explícita: deixar o constraint falhar dava um erro que a interface
  -- não sabe distinguir de uma avaria.
  if v_username is not null and exists (
    select 1 from public.profiles
    where username = v_username and id <> v_profile.id
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  update public.profiles
  set display_name = coalesce(v_display_name, display_name),
      username = coalesce(v_username, username),
      -- A bio e a cidade distinguem-se do resto: uma string vazia é apagar, e
      -- `null` é não mexer. Sem isto não havia como limpar uma bio.
      bio = case when p_bio is null then bio else nullif(trim(p_bio), '') end,
      city = case when p_city is null then city else nullif(trim(p_city), '') end,
      country_code = coalesce(v_country, country_code),
      locale = coalesce(nullif(trim(p_locale), ''), locale),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      updated_at = now()
  where id = v_profile.id
  returning * into v_profile;

  return jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'bio', v_profile.bio,
    'country_code', v_profile.country_code,
    'city', v_profile.city,
    'locale', v_profile.locale,
    'timezone', v_profile.timezone
  );
end;
$$;

revoke all on function public.update_my_profile(text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_my_profile(text,text,text,text,text,text,text) to authenticated;
