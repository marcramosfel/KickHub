-- KickHub V2 — juntar uma pertença do legado à conta que já existe.
--
-- O `claim_legacy_profile` aponta a conta ao perfil antigo e deita fora o perfil
-- novo. Só o faz quando o perfil novo é descartável — sem peladas, sem pertenças,
-- sem notificações, sem rasto no registo de auditoria — e a exigência é correcta:
-- deitar fora um perfil que possui peladas era deixá-las sem dono.
--
-- Mas há um caso que fica de fora e não é raro: quem se registou, criou peladas,
-- e só depois soube que o seu histórico já lá estava com outro nome. Para essa
-- pessoa o perfil não é descartável, e a única saída que restava era criar uma
-- segunda conta — ou seja, escolher entre o passado e o que entretanto construiu.
--
-- Esta função resolve-o ao contrário: em vez de mudar a conta de perfil, muda a
-- pertença de perfil. E isso não move histórico nenhum, porque o histórico —
-- golos, escalações, avaliações, votos — está preso ao `membership_id` e não ao
-- perfil. Nem uma linha de estatística se mexe, e por isso nem uma se pode perder.

create or replace function public.absorb_legacy_claim(p_code text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_auth uuid := auth.uid();
  v_profile public.profiles;
  v_claim public.legacy_claims;
  v_legacy public.pelada_memberships;
  v_own public.pelada_memberships;
  v_limit json;
  v_role text;
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

  select * into v_profile from public.profiles where auth_user_id = v_auth for update;
  if not found then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_claim
  from public.legacy_claims
  where code_hash = encode(extensions.digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex')
  for update;

  if not found then raise exception 'INVALID_CLAIM'; end if;
  if v_claim.revoked_at is not null then raise exception 'INVALID_CLAIM'; end if;
  if v_claim.consumed_at is not null then raise exception 'CLAIM_ALREADY_USED'; end if;
  if v_claim.expires_at <= now() then raise exception 'CLAIM_EXPIRED'; end if;
  if v_claim.profile_id = v_profile.id then raise exception 'SAME_PROFILE'; end if;

  -- Absorver só faz sentido para um perfil sem dono. Se já tem conta, do outro
  -- lado está uma pessoa, e ninguém absorve uma pessoa.
  if exists (
    select 1 from public.profiles
    where id = v_claim.profile_id and auth_user_id is not null
  ) then
    raise exception 'ALREADY_CLAIMED';
  end if;

  select * into v_legacy
  from public.pelada_memberships
  where pelada_id = v_claim.pelada_id and profile_id = v_claim.profile_id
  for update;
  if not found then raise exception 'LEGACY_MEMBERSHIP_NOT_FOUND'; end if;

  select * into v_own
  from public.pelada_memberships
  where pelada_id = v_claim.pelada_id and profile_id = v_profile.id and status <> 'removed'
  for update;

  -- Fica o papel mais alto dos dois: quem entrou como dono não desce a jogador
  -- por ter ido buscar o seu passado.
  v_role := case
    when 'owner' in (coalesce(v_own.role, ''), v_legacy.role) then 'owner'
    when 'admin' in (coalesce(v_own.role, ''), v_legacy.role) then 'admin'
    else 'player'
  end;

  -- A pertença vazia sai primeiro: o índice único não deixa o mesmo perfil ter
  -- duas activas na mesma pelada. Fica com o perfil apontado, para o registo de
  -- auditoria ter onde encostar — é `status = 'removed'` que liberta o índice.
  if v_own.id is not null then
    update public.pelada_memberships
    set status = 'removed', removed_at = now(), updated_at = now()
    where id = v_own.id;
  end if;

  update public.pelada_memberships
  set profile_id = v_profile.id,
      role = v_role,
      status = 'active',
      removed_at = null,
      updated_at = now()
  where id = v_legacy.id;

  -- Se a pelada era dele enquanto perfil novo, continua a ser dele agora; o
  -- perfil não mudou, só a pertença é que passou a ser a antiga.
  update public.peladas
  set owner_profile_id = v_profile.id, updated_at = now()
  where id = v_claim.pelada_id and owner_profile_id = v_claim.profile_id;

  update public.legacy_claims
  set consumed_at = now(), consumed_by_auth_user = v_auth
  where id = v_claim.id;

  -- O perfil do legado só se retira de circulação se não lhe restar pertença
  -- nenhuma: noutra pelada ele ainda representa alguém, e apagá-lo aqui
  -- apagava-o lá.
  if not exists (
    select 1 from public.pelada_memberships
    where profile_id = v_claim.profile_id and status <> 'removed'
  ) then
    update public.profiles
    set deleted_at = now(), updated_at = now()
    where id = v_claim.profile_id;
  end if;

  insert into public.tenant_audit_log (
    pelada_id, actor_profile_id, action, entity_type, entity_id, metadata
  ) values (
    v_claim.pelada_id, v_profile.id, 'legacy_claim.absorbed',
    'pelada_membership', v_legacy.id,
    jsonb_build_object(
      'legacy_profile_id', v_claim.profile_id,
      'removed_membership_id', v_own.id,
      'role', v_role
    )
  );

  return jsonb_build_object(
    'membership_id', v_legacy.id,
    'pelada_id', v_claim.pelada_id,
    'role', v_role,
    'merged', v_own.id is not null
  );
end;
$$;

revoke all on function public.absorb_legacy_claim(text) from public, anon;
grant execute on function public.absorb_legacy_claim(text) to authenticated;
