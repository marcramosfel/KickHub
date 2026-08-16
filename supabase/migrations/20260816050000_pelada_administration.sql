-- KickHub V2 — administração da pelada: identidade, definições e papéis.
--
-- Até aqui a pelada ficava congelada no que o assistente de criação escreveu:
-- não havia forma de corrigir o nome, abrir a comunidade ao público, mudar o
-- formato de jogo nem promover alguém a admin. Promover um membro só era
-- possível por SQL, o que na prática significa que quem organiza não consegue
-- delegar.
--
-- Três decisões que ficam gravadas aqui:
--
-- 1. O slug não é editável. É ele que forma o link partilhado; mudá-lo partia
--    em silêncio todos os convites já enviados e todas as mensagens de WhatsApp
--    onde o link já circula. Renomear a pelada muda o nome visível, não o
--    endereço.
--
-- 2. Só o dono muda papéis. Se um admin pudesse promover admins, bastava um
--    convite de admin mal dado para alguém promover aliados e passar a
--    controlar a pelada. Restringir ao dono contém a escalada num único ponto.
--
-- 3. O papel do dono não se altera e o dono não se remove. `peladas` aponta
--    para o perfil dele com `on delete restrict`, portanto despromovê-lo
--    deixaria a pelada a apontar para quem já não manda. Transferir
--    propriedade é uma decisão maior — muda quem controla os dados de um grupo
--    real — e fica deliberadamente de fora desta fatia.

-- ---------------------------------------------------------------- identidade

create or replace function public.update_pelada_identity(
  p_pelada_id uuid,
  p_name text,
  p_description text,
  p_visibility text,
  p_join_mode text
)
returns public.peladas
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_pelada public.peladas;
begin
  if not public.has_pelada_role(p_pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  update public.peladas
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      visibility = p_visibility,
      join_mode = p_join_mode,
      updated_at = now()
  where id = p_pelada_id
  returning * into v_pelada;

  if not found then
    raise exception 'PELADA_NOT_FOUND';
  end if;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    p_pelada_id,
    public.current_profile_id(),
    'pelada.identity_updated',
    'pelada',
    p_pelada_id,
    jsonb_build_object('visibility', v_pelada.visibility, 'join_mode', v_pelada.join_mode)
  );

  return v_pelada;
end;
$$;

revoke all on function public.update_pelada_identity(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_pelada_identity(uuid, text, text, text, text) to authenticated;

-- --------------------------------------------------------------- definições

create or replace function public.update_pelada_settings(
  p_pelada_id uuid,
  p_default_format text,
  p_default_team_size int,
  p_frequency text,
  p_goalkeeper_mode text,
  p_ratings_enabled boolean,
  p_awards_enabled boolean
)
returns public.pelada_settings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.pelada_settings;
begin
  if not public.has_pelada_role(p_pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  -- A linha de definições é criada com a pelada, mas uma pelada anterior a essa
  -- garantia ficaria sem nada que actualizar e a função devolveria null em
  -- silêncio. O insert ... on conflict cobre os dois casos.
  insert into public.pelada_settings as settings (
    pelada_id, default_format, default_team_size, frequency,
    goalkeeper_mode, ratings_enabled, awards_enabled
  )
  values (
    p_pelada_id, p_default_format, p_default_team_size, p_frequency,
    p_goalkeeper_mode, coalesce(p_ratings_enabled, true), coalesce(p_awards_enabled, true)
  )
  on conflict (pelada_id) do update
    set default_format = excluded.default_format,
        default_team_size = excluded.default_team_size,
        frequency = excluded.frequency,
        goalkeeper_mode = excluded.goalkeeper_mode,
        ratings_enabled = excluded.ratings_enabled,
        awards_enabled = excluded.awards_enabled,
        updated_at = now()
  returning settings.* into v_settings;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    p_pelada_id,
    public.current_profile_id(),
    'pelada.settings_updated',
    'pelada_settings',
    p_pelada_id,
    jsonb_build_object('format', v_settings.default_format, 'goalkeeper_mode', v_settings.goalkeeper_mode)
  );

  return v_settings;
end;
$$;

revoke all on function public.update_pelada_settings(uuid, text, int, text, text, boolean, boolean) from public, anon;
grant execute on function public.update_pelada_settings(uuid, text, int, text, text, boolean, boolean) to authenticated;

-- -------------------------------------------------------------------- papéis

create or replace function public.set_pelada_member_role(
  p_membership_id uuid,
  p_role text
)
returns public.pelada_memberships
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.pelada_memberships;
begin
  if p_role not in ('admin', 'player') then
    raise exception 'INVALID_ROLE';
  end if;

  select * into v_member from public.pelada_memberships where id = p_membership_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if not public.has_pelada_role(v_member.pelada_id, array['owner']) then
    raise exception 'OWNER_ONLY';
  end if;
  if v_member.role = 'owner' then
    raise exception 'CANNOT_CHANGE_OWNER';
  end if;
  if v_member.status <> 'active' then
    raise exception 'MEMBER_NOT_ACTIVE';
  end if;

  update public.pelada_memberships
  set role = p_role, updated_at = now()
  where id = p_membership_id
  returning * into v_member;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_member.pelada_id,
    public.current_profile_id(),
    'membership.role_changed',
    'pelada_membership',
    p_membership_id,
    jsonb_build_object('role', p_role)
  );

  if v_member.profile_id is not null then
    insert into public.notifications (profile_id, pelada_id, kind, title, payload)
    values (
      v_member.profile_id,
      v_member.pelada_id,
      case when p_role = 'admin' then 'membership.promoted' else 'membership.demoted' end,
      (select name from public.peladas where id = v_member.pelada_id),
      jsonb_build_object('role', p_role)
    );
  end if;

  return v_member;
end;
$$;

revoke all on function public.set_pelada_member_role(uuid, text) from public, anon;
grant execute on function public.set_pelada_member_role(uuid, text) to authenticated;

-- ------------------------------------------------------------------- remoção

create or replace function public.remove_pelada_member(p_membership_id uuid)
returns public.pelada_memberships
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.pelada_memberships;
  v_game record;
begin
  select * into v_member from public.pelada_memberships where id = p_membership_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if v_member.role = 'owner' then
    raise exception 'CANNOT_REMOVE_OWNER';
  end if;
  -- Remover um admin é despromover quem partilha o comando; fica com o dono,
  -- pela mesma razão que a mudança de papel.
  if v_member.role = 'admin' then
    if not public.has_pelada_role(v_member.pelada_id, array['owner']) then
      raise exception 'OWNER_ONLY';
    end if;
  elsif not public.has_pelada_role(v_member.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_member.status = 'removed' then
    return v_member;
  end if;

  -- Estado, não delete: os jogos, as equipas sorteadas e as estatísticas
  -- apontam para esta inscrição. Apagá-la levaria o histórico atrás ou falharia
  -- na chave estrangeira, e o ranking passado deixaria de bater certo.
  update public.pelada_memberships
  set status = 'removed', removed_at = now(), updated_at = now()
  where id = p_membership_id
  returning * into v_member;

  -- Quem sai não pode continuar a ocupar vaga num jogo que já não vai jogar.
  -- Cada lugar libertado passa a quem estava à espera, pela ordem em que
  -- respondeu — o mesmo critério de set_game_attendance.
  for v_game in
    select attendance.game_id, game.max_players, attendance.status as previous
    from public.game_attendance attendance
    join public.games game on game.id = attendance.game_id
    where attendance.membership_id = p_membership_id
      and game.status = 'scheduled'
      and game.scheduled_at > now()
  loop
    update public.game_attendance
    set status = 'declined', responded_at = now()
    where game_id = v_game.game_id and membership_id = p_membership_id;

    if v_game.previous = 'confirmed' and v_game.max_players is not null then
      update public.game_attendance promoted
      set status = 'confirmed'
      where promoted.game_id = v_game.game_id
        and promoted.membership_id = (
          select membership_id
          from public.game_attendance
          where game_id = v_game.game_id and status = 'waitlist'
          order by responded_at
          limit 1
        )
        and (
          select count(*)
          from public.game_attendance
          where game_id = v_game.game_id and status = 'confirmed'
        ) < v_game.max_players;
    end if;
  end loop;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_member.pelada_id,
    public.current_profile_id(),
    'membership.removed',
    'pelada_membership',
    p_membership_id,
    jsonb_build_object('role', v_member.role)
  );

  return v_member;
end;
$$;

revoke all on function public.remove_pelada_member(uuid) from public, anon;
grant execute on function public.remove_pelada_member(uuid) to authenticated;

-- -------------------------------------------------- leitura para o formulário

-- get_pelada_settings devolve só o que o sorteio precisa. O ecrã de
-- administração precisa também da identidade e da frequência, e alargar aquela
-- função obrigaria a largar e recriar um tipo de retorno lido em todo o
-- produto.
create or replace function public.get_pelada_admin_settings(p_pelada_id uuid)
returns table (
  name text,
  slug text,
  description text,
  visibility text,
  join_mode text,
  default_format text,
  default_team_size int,
  frequency text,
  goalkeeper_mode text,
  ratings_enabled boolean,
  awards_enabled boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    pelada.name,
    pelada.slug,
    pelada.description,
    pelada.visibility,
    pelada.join_mode,
    coalesce(settings.default_format, '7x7'),
    coalesce(settings.default_team_size, 7),
    coalesce(settings.frequency, 'weekly'),
    coalesce(settings.goalkeeper_mode, 'fixed'),
    coalesce(settings.ratings_enabled, true),
    coalesce(settings.awards_enabled, true)
  from public.peladas pelada
  left join public.pelada_settings settings on settings.pelada_id = pelada.id
  where pelada.id = p_pelada_id
    and public.has_pelada_role(p_pelada_id, array['owner','admin']);
$$;

revoke all on function public.get_pelada_admin_settings(uuid) from public, anon;
grant execute on function public.get_pelada_admin_settings(uuid) to authenticated;
