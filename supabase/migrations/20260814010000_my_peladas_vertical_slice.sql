-- KickHub V2 — authoritative "Minhas Peladas" read model and complete creation RPC.
-- Append-only: the original create_pelada RPC remains available for compatibility.

create or replace function public.list_my_peladas()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  city text,
  country_code text,
  timezone text,
  visibility text,
  join_mode text,
  role text,
  member_count integer,
  created_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    pelada.id,
    pelada.slug,
    pelada.name,
    pelada.description,
    pelada.city,
    pelada.country_code,
    pelada.timezone,
    pelada.visibility,
    pelada.join_mode,
    mine.role,
    (
      select count(*)::integer
      from public.pelada_memberships member
      where member.pelada_id = pelada.id
        and member.status = 'active'
    ) as member_count,
    pelada.created_at
  from public.pelada_memberships mine
  join public.peladas pelada on pelada.id = mine.pelada_id
  where mine.profile_id = public.current_profile_id()
    and mine.status = 'active'
    and pelada.status = 'active'
  order by pelada.created_at desc, pelada.id;
$$;

create or replace function public.create_pelada_with_settings(
  p_name text,
  p_slug text,
  p_description text,
  p_country_code text,
  p_city text,
  p_timezone text,
  p_visibility text,
  p_join_mode text,
  p_default_format text,
  p_frequency text
)
returns public.peladas
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_pelada public.peladas;
  v_team_size integer;
begin
  if p_default_format not in ('5x5', '6x6', '7x7', '8x8', '11x11', 'custom') then
    raise exception 'INVALID_DEFAULT_FORMAT';
  end if;
  if p_frequency not in ('weekly', 'fortnightly', 'monthly', 'irregular') then
    raise exception 'INVALID_FREQUENCY';
  end if;

  v_team_size := case p_default_format
    when '5x5' then 5
    when '6x6' then 6
    when '7x7' then 7
    when '8x8' then 8
    when '11x11' then 11
    else 7
  end;

  v_pelada := public.create_pelada(
    p_name,
    p_slug,
    p_description,
    p_country_code,
    p_city,
    p_timezone,
    p_visibility,
    p_join_mode
  );

  update public.pelada_settings
  set default_format = p_default_format,
      default_team_size = v_team_size,
      frequency = p_frequency
  where pelada_id = v_pelada.id;

  insert into public.tenant_audit_log (
    pelada_id,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_pelada.id,
    public.current_profile_id(),
    'pelada.settings.initialized',
    'pelada_settings',
    v_pelada.id,
    jsonb_build_object('default_format', p_default_format, 'frequency', p_frequency)
  );

  return v_pelada;
end;
$$;

revoke all on function public.list_my_peladas() from public, anon;
revoke all on function public.create_pelada_with_settings(text,text,text,text,text,text,text,text,text,text) from public, anon;

grant execute on function public.list_my_peladas() to authenticated;
grant execute on function public.create_pelada_with_settings(text,text,text,text,text,text,text,text,text,text) to authenticated;
