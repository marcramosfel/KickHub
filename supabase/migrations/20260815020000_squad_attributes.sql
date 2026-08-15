-- KickHub V2 — atributos desportivos do plantel, por pelada.
--
-- O overall vive na membership e não no profile: a força de um jogador é
-- medida dentro de cada comunidade, porque o mesmo jogador pode ser decisivo
-- num grupo e mediano noutro.
--
-- Enquanto não existir histórico de jogos no modelo multi-tenant, o overall é
-- definido por quem organiza. O sorteio precisa de um número para equilibrar, e
-- é assim que uma pelada nova arranca: quem organiza conhece o plantel. Quando
-- houver estatísticas suficientes, passa a ser derivado.
--
-- As posições são genéricas (GK/DEF/MID/ATT) em vez dos slots lateralizados do
-- legado, que assumiam 7x7. O sorteio tem de servir de 5x5 a 11x11.

alter table public.pelada_memberships
  add column overall int check (overall is null or overall between 1 and 99);

alter table public.pelada_memberships
  add constraint pelada_memberships_positions_valid check (
    (primary_position is null or primary_position in ('GK','DEF','MID','ATT'))
    and (secondary_position is null or secondary_position in ('GK','DEF','MID','ATT'))
  );

create index pelada_memberships_squad_idx
  on public.pelada_memberships (pelada_id, role)
  where status = 'active';

-- Read model do plantel. É `security definer`, portanto a pertença é verificada
-- aqui: sem esta condição a função devolveria o plantel de qualquer pelada.
create or replace function public.list_pelada_members(p_pelada_id uuid)
returns table (
  membership_id uuid,
  display_name text,
  username text,
  role text,
  player_type text,
  primary_position text,
  secondary_position text,
  accepts_other_positions boolean,
  overall int,
  joined_at timestamptz,
  is_me boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    member.id,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    profile.username,
    member.role,
    member.player_type,
    member.primary_position,
    member.secondary_position,
    member.accepts_other_positions,
    member.overall,
    member.joined_at,
    member.profile_id is not null and member.profile_id = public.current_profile_id()
  from public.pelada_memberships member
  left join public.profiles profile on profile.id = member.profile_id
  where member.pelada_id = p_pelada_id
    and member.status = 'active'
    and public.is_active_member(p_pelada_id)
  order by
    case member.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    member.id;
$$;

-- Quem organiza acerta o plantel todo; cada jogador acerta as suas próprias
-- posições. O overall é a avaliação que o grupo faz de alguém, por isso nunca é
-- editável pelo próprio.
create or replace function public.update_pelada_member(
  p_membership_id uuid,
  p_player_type text,
  p_primary_position text,
  p_secondary_position text,
  p_accepts_other boolean,
  p_overall int
)
returns public.pelada_memberships
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.pelada_memberships;
  v_is_admin boolean;
  v_is_self boolean;
begin
  select * into v_member from public.pelada_memberships where id = p_membership_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  v_is_admin := public.has_pelada_role(v_member.pelada_id, array['owner','admin']);
  v_is_self := v_member.profile_id is not null
    and v_member.profile_id = public.current_profile_id();

  if not (v_is_admin or v_is_self) then
    raise exception 'FORBIDDEN';
  end if;
  if p_overall is distinct from v_member.overall and not v_is_admin then
    raise exception 'OVERALL_REQUIRES_ADMIN';
  end if;

  update public.pelada_memberships
  set player_type = p_player_type,
      primary_position = p_primary_position,
      secondary_position = p_secondary_position,
      accepts_other_positions = coalesce(p_accepts_other, true),
      overall = p_overall
  where id = p_membership_id
  returning * into v_member;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_member.pelada_id,
    public.current_profile_id(),
    'member.attributes_changed',
    'pelada_memberships',
    v_member.id,
    jsonb_build_object(
      'player_type', v_member.player_type,
      'primary_position', v_member.primary_position,
      'overall', v_member.overall,
      'by_admin', v_is_admin
    )
  );

  return v_member;
end;
$$;

revoke all on function public.list_pelada_members(uuid) from public, anon;
revoke all on function public.update_pelada_member(uuid, text, text, text, boolean, int) from public, anon;

grant execute on function public.list_pelada_members(uuid) to authenticated;
grant execute on function public.update_pelada_member(uuid, text, text, text, boolean, int) to authenticated;
