-- Um convite autenticado mostra apenas os dados necessários para o utilizador
-- decidir se o aceita. O token continua armazenado apenas como hash e nenhuma
-- leitura direta da pelada privada é aberta pela RLS.
create or replace function public.get_pelada_invite(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_invite public.pelada_invites;
  v_result jsonb;
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_token is null or char_length(p_token) <> 48 then raise exception 'INVALID_INVITE'; end if;

  select * into v_invite
  from public.pelada_invites
  where token_hash = digest(p_token, 'sha256');

  if not found or v_invite.revoked_at is not null then raise exception 'INVALID_INVITE'; end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then raise exception 'INVITE_EXPIRED'; end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then raise exception 'INVITE_EXHAUSTED'; end if;

  select jsonb_build_object(
    'slug', pelada.slug,
    'name', pelada.name,
    'description', coalesce(pelada.description, ''),
    'city', pelada.city,
    'country_code', pelada.country_code,
    'member_count', (
      select count(*) from public.pelada_memberships membership
      where membership.pelada_id = pelada.id and membership.status = 'active'
    ),
    'next_match_at', (
      select min(game.scheduled_at) from public.games game
      where game.pelada_id = pelada.id and game.status = 'scheduled' and game.scheduled_at >= now()
    ),
    'expires_at', v_invite.expires_at
  ) into v_result
  from public.peladas pelada
  where pelada.id = v_invite.pelada_id and pelada.status = 'active';

  if v_result is null then raise exception 'INVALID_INVITE'; end if;
  return v_result;
end;
$$;

revoke all on function public.get_pelada_invite(text) from public, anon;
grant execute on function public.get_pelada_invite(text) to authenticated;
