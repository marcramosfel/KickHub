-- KickHub V2 — na fusão, quem sobrevive é o perfil antigo.
--
-- A primeira versão desta função movia a **pertença** para o perfil novo. Isso
-- salvava as estatísticas, que estão presas ao `membership_id`, mas perdia a
-- foto: o avatar vive em `profiles.avatar_path`, e a política de leitura do
-- bucket exige partilhar pelada activa com o dono da pasta. Esvaziado o perfil
-- antigo, ninguém mais partilha pelada com ele, e a foto — que é a cara da
-- pessoa na app — deixava de carregar.
--
-- Portanto inverte-se: sobrevive o perfil que tem o passado, a foto e o nome,
-- e é o perfil novo que se dissolve dentro dele. É a mesma direcção do
-- `claim_legacy_profile`; a diferença é que aqui o perfil novo não é
-- descartável, e por isso tudo o que ele tem — peladas que possui, pertenças
-- noutras peladas, convites que emitiu, notificações — é levado com ele em vez
-- de o impedir de sair.
--
-- As chaves estrangeiras `RESTRICT` de `peladas.owner_profile_id`,
-- `pelada_memberships.profile_id` e `pelada_invites.created_by` são a rede de
-- segurança: se algo ficar por levar, o `delete` final rebenta e a transação
-- inteira desfaz-se. Nada de meio-fundido.

create or replace function public.absorb_legacy_claim(p_code text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_auth uuid := auth.uid();
  v_current public.profiles;
  v_target public.profiles;
  v_claim public.legacy_claims;
  v_limit json;
  v_colapsadas int := 0;
begin
  if v_auth is null then raise exception 'AUTH_REQUIRED'; end if;

  -- O mesmo balde do `claim_legacy_profile`, de propósito: quem experimenta
  -- códigos à sorte não deve ganhar cinco tentativas extra por haver duas portas.
  v_limit := public.consume_api_rate_limit(
    'legacy_claim',
    encode(extensions.digest(v_auth::text, 'sha256'), 'hex'),
    encode(extensions.digest(v_auth::text, 'sha256'), 'hex'),
    5, 900
  );
  if coalesce((v_limit->>'allowed')::boolean, false) is not true then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  select * into v_current from public.profiles where auth_user_id = v_auth for update;
  if not found then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_claim
  from public.legacy_claims
  where code_hash = encode(extensions.digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex')
  for update;

  if not found then raise exception 'INVALID_CLAIM'; end if;
  if v_claim.revoked_at is not null then raise exception 'INVALID_CLAIM'; end if;
  if v_claim.consumed_at is not null then raise exception 'CLAIM_ALREADY_USED'; end if;
  if v_claim.expires_at <= now() then raise exception 'CLAIM_EXPIRED'; end if;
  if v_claim.profile_id = v_current.id then raise exception 'SAME_PROFILE'; end if;

  select * into v_target from public.profiles where id = v_claim.profile_id for update;
  if not found then raise exception 'INVALID_CLAIM'; end if;
  -- Absorver só faz sentido para um perfil sem dono. Se já tem conta, do outro
  -- lado está uma pessoa, e ninguém absorve uma pessoa.
  if v_target.auth_user_id is not null then raise exception 'ALREADY_CLAIMED'; end if;

  if not exists (
    select 1 from public.pelada_memberships
    where pelada_id = v_claim.pelada_id and profile_id = v_target.id
  ) then
    raise exception 'LEGACY_MEMBERSHIP_NOT_FOUND';
  end if;

  -- ------------------------------------------------------------------ pertenças
  -- Onde ambos já estão na mesma pelada, uma das duas tem de sair, e sai a do
  -- perfil novo. Isso só é seguro enquanto ela não tiver jogado nada: duas
  -- carreiras na mesma pelada não se somam — não há resposta para de quem são
  -- os golos, nem para o que fazer com as duas presenças no mesmo jogo. Quando
  -- acontece, esta função recusa em vez de escolher por conta própria.
  if exists (
    select 1
    from public.pelada_memberships nova
    join public.pelada_memberships antiga
      on antiga.pelada_id = nova.pelada_id
     and antiga.profile_id = v_target.id
     and antiga.status <> 'removed'
    where nova.profile_id = v_current.id
      and nova.status <> 'removed'
      and (
        exists (select 1 from public.game_lineups l where l.membership_id = nova.id)
        or exists (select 1 from public.game_player_stats s where s.membership_id = nova.id)
        or exists (select 1 from public.game_attendance a where a.membership_id = nova.id)
      )
  ) then
    raise exception 'MEMBERSHIP_HAS_HISTORY';
  end if;

  -- A pertença antiga fica com o papel mais alto dos dois: quem entrou como dono
  -- não desce a jogador por ter ido buscar o seu passado.
  update public.pelada_memberships antiga
  set role = case
        when 'owner' in (antiga.role, nova.role) then 'owner'
        when 'admin' in (antiga.role, nova.role) then 'admin'
        else antiga.role
      end,
      updated_at = now()
  from public.pelada_memberships nova
  where antiga.profile_id = v_target.id
    and antiga.status <> 'removed'
    and nova.pelada_id = antiga.pelada_id
    and nova.profile_id = v_current.id
    and nova.status <> 'removed';

  -- E a duplicada desaparece. Já se sabe, do teste acima, que não leva nada.
  delete from public.pelada_memberships nova
  where nova.profile_id = v_current.id
    and exists (
      select 1 from public.pelada_memberships antiga
      where antiga.pelada_id = nova.pelada_id
        and antiga.profile_id = v_target.id
        and antiga.status <> 'removed'
    );
  get diagnostics v_colapsadas = row_count;

  -- As restantes mudam de perfil e levam tudo consigo, porque o histórico está
  -- preso ao `membership_id` e não ao perfil.
  update public.pelada_memberships
  set profile_id = v_target.id, updated_at = now()
  where profile_id = v_current.id;

  update public.pelada_memberships set approved_by = v_target.id where approved_by = v_current.id;

  -- ------------------------------------------------------------------ o resto
  update public.peladas set owner_profile_id = v_target.id, updated_at = now()
  where owner_profile_id = v_current.id;

  update public.pelada_invites set created_by = v_target.id where created_by = v_current.id;
  update public.notifications set profile_id = v_target.id where profile_id = v_current.id;
  update public.tenant_audit_log set actor_profile_id = v_target.id where actor_profile_id = v_current.id;
  update public.legacy_claims set issued_by_profile_id = v_target.id where issued_by_profile_id = v_current.id;
  update public.legacy_claims set revoked_by_profile_id = v_target.id where revoked_by_profile_id = v_current.id;
  update public.pelada_join_requests set reviewed_by = v_target.id where reviewed_by = v_current.id;
  update public.content_reports set reviewed_by = v_target.id where reviewed_by = v_current.id;

  -- Estas três têm um índice único por perfil. O que colidir fica de fora e
  -- desaparece com o `delete` em cascata — colidir é, por definição, ser
  -- duplicado do que o perfil antigo já tem.
  update public.pelada_join_requests pedido
  set profile_id = v_target.id
  where pedido.profile_id = v_current.id
    and not (
      pedido.status = 'pending'
      and exists (
        select 1 from public.pelada_join_requests outro
        where outro.pelada_id = pedido.pelada_id
          and outro.profile_id = v_target.id
          and outro.status = 'pending'
      )
    );

  update public.notification_preferences preferencia
  set profile_id = v_target.id
  where preferencia.profile_id = v_current.id
    and not exists (
      select 1 from public.notification_preferences outra
      where outra.profile_id = v_target.id
        and outra.topic = preferencia.topic
        and outra.channel = preferencia.channel
    );

  update public.content_reports denuncia
  set reporter_profile_id = v_target.id
  where denuncia.reporter_profile_id = v_current.id
    and not (
      denuncia.status in ('open', 'reviewing')
      and exists (
        select 1 from public.content_reports outra
        where outra.reporter_profile_id = v_target.id
          and outra.subject_type = denuncia.subject_type
          and outra.subject_id = denuncia.subject_id
          and outra.status in ('open', 'reviewing')
      )
    );

  -- ------------------------------------------------------------------ identidade
  -- Preserva a identidade antiga — nome, alcunha, foto — e só preenche o que lá
  -- falta. As preferências, essas, são de quem está a usar a app agora.
  update public.profiles
  set avatar_path = coalesce(avatar_path, v_current.avatar_path),
      avatar_bucket_id = coalesce(avatar_bucket_id, v_current.avatar_bucket_id),
      avatar_sha256 = coalesce(avatar_sha256, v_current.avatar_sha256),
      avatar_status = coalesce(avatar_status, v_current.avatar_status),
      bio = coalesce(bio, v_current.bio),
      country_code = coalesce(country_code, v_current.country_code),
      city = coalesce(city, v_current.city),
      locale = v_current.locale,
      timezone = v_current.timezone,
      privacy = v_current.privacy,
      -- Sem `greatest`: em texto isso ordena por alfabeto e despromovia um
      -- 'admin' a 'member'. O papel de plataforma é de quem entra, e só sobe.
      platform_role = case
        when v_current.platform_role = 'admin' or platform_role = 'admin' then 'admin'
        when v_current.platform_role = 'staff' or platform_role = 'staff' then 'staff'
        else 'member'
      end,
      updated_at = now()
  where id = v_target.id;

  -- A conta larga o perfil novo antes de pegar no antigo: `auth_user_id` é único.
  update public.profiles set auth_user_id = null where id = v_current.id;
  update public.profiles set auth_user_id = v_auth, updated_at = now() where id = v_target.id;

  delete from public.profiles where id = v_current.id;

  update public.legacy_claims
  set consumed_at = now(), consumed_by_auth_user = v_auth
  where id = v_claim.id;

  insert into public.tenant_audit_log (
    pelada_id, actor_profile_id, action, entity_type, entity_id, metadata
  ) values (
    v_claim.pelada_id, v_target.id, 'legacy_claim.absorbed', 'profile', v_target.id,
    jsonb_build_object(
      'merged_profile_id', v_current.id,
      'collapsed_memberships', v_colapsadas
    )
  );

  return jsonb_build_object(
    'profile_id', v_target.id,
    'pelada_id', v_claim.pelada_id,
    'merged_profile_id', v_current.id,
    'collapsed_memberships', v_colapsadas
  );
end;
$$;

revoke all on function public.absorb_legacy_claim(text) from public, anon;
grant execute on function public.absorb_legacy_claim(text) to authenticated;
