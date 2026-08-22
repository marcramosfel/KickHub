-- KickHub V2 — migrar um plantel inteiro sem entregar códigos um a um.
--
-- Trazer a Browns para cá são trinta conversas: emitir um código, mandá-lo à
-- pessoa, esperar que ela o cole. Com trinta minutos de validade, isso obriga a
-- ter a pessoa do outro lado à espera no momento exacto da emissão. Para uma
-- migração real não serve: emitem-se de manhã e expiram todos antes do almoço.
--
-- Três peças mudam isso.
--
-- 1. O prazo passa a ser escolhido, com sete dias por omissão. Um código de
--    trinta minutos é o certo para quem o dita ao telefone; é o errado para
--    quem o envia por escrito e espera resposta. O código continua de uso
--    único, revogável, e a tentativa continua travada a cinco por quarto de
--    hora — o que muda é o tempo de resposta, não a defesa.
--
-- 2. Emitem-se todos de uma vez, e a lista sai com nome e código para se
--    distribuir. Quem já tem conta fica de fora, porque já não há nada a
--    reclamar.
--
-- 3. Uma espreitadela ao código, que não o gasta. Sem isto, um link de
--    reclamação só podia consumir-se às cegas: quem o abrisse com a sessão
--    errada aberta queimava o código na conta errada, e um código de uso único
--    queimado não volta. Agora o link mostra de quem é o histórico e pergunta
--    antes de ligar.

-- ------------------------------------------------------------------ 1. prazo
--
-- A assinatura muda, portanto a antiga cai primeiro: deixá-la viva ao lado
-- desta tornava a chamada ambígua para o PostgREST.
drop function if exists public.issue_legacy_claim(uuid, text);

create or replace function public.issue_legacy_claim(
  p_membership_id uuid,
  p_reason text,
  p_expires_in_hours int default 168
)
returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_membership public.pelada_memberships;
  v_profile public.profiles;
  v_actor uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  -- Entre uma hora e trinta dias. O tecto não é desconfiança de quem emite: é
  -- que um código sem fim à vista deixa de ser um código e passa a ser uma
  -- palavra-passe partilhada.
  v_hours int := least(greatest(coalesce(p_expires_in_hours, 168), 1), 720);
  v_code text;
begin
  select * into v_membership
  from public.pelada_memberships
  where id = p_membership_id
  for update;

  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
  if not public.has_pelada_role(v_membership.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_membership.profile_id is null then raise exception 'MEMBERSHIP_WITHOUT_PROFILE'; end if;
  if v_membership.legacy_player_id is null then raise exception 'NOT_A_LEGACY_MEMBER'; end if;
  if v_reason is null or char_length(v_reason) < 8 or char_length(v_reason) > 240 then
    raise exception 'INVALID_REASON';
  end if;

  select * into v_profile from public.profiles where id = v_membership.profile_id;
  if v_profile.auth_user_id is not null then raise exception 'ALREADY_CLAIMED'; end if;

  -- Uma reemissão não apaga o rasto da anterior.
  update public.legacy_claims
  set revoked_at = now(),
      revoked_by_profile_id = v_actor,
      revoke_reason = 'Replaced by a new claim'
  where profile_id = v_profile.id
    and consumed_at is null
    and revoked_at is null;

  v_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  v_code := regexp_replace(v_code, '(.{4})(?=.)', '\1-', 'g');

  insert into public.legacy_claims (
    pelada_id, profile_id, code_hash, expires_at, issued_by_profile_id, reason
  ) values (
    v_membership.pelada_id,
    v_profile.id,
    encode(extensions.digest(v_code, 'sha256'), 'hex'),
    now() + make_interval(hours => v_hours),
    v_actor,
    v_reason
  );

  insert into public.tenant_audit_log (
    pelada_id, actor_profile_id, action, entity_type, entity_id, metadata
  ) values (
    v_membership.pelada_id, v_actor, 'legacy_claim.issued',
    'pelada_membership', p_membership_id,
    jsonb_build_object('reason', v_reason, 'expires_in_hours', v_hours)
  );

  return v_code;
end;
$$;

revoke all on function public.issue_legacy_claim(uuid, text, int) from public, anon;
grant execute on function public.issue_legacy_claim(uuid, text, int) to authenticated;

-- ------------------------------------------------------------------ 2. massa
create or replace function public.issue_legacy_claims_for_pelada(
  p_pelada_id uuid,
  p_reason text default 'Migração do plantel para o KickHub',
  p_expires_in_hours int default 168
)
returns table (membership_id uuid, display_name text, code text)
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row record;
begin
  if not public.has_pelada_role(p_pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  -- Um a um pela função de cima, e não em bloco: as defesas dela — o papel, o
  -- perfil já reclamado, a revogação do código anterior, a linha de auditoria —
  -- valem exactamente o mesmo quando se emitem trinta.
  for v_row in
    select membership.id,
           coalesce(nullif(btrim(membership.nickname), ''), profile.display_name) as nome
    from public.pelada_memberships membership
    join public.profiles profile on profile.id = membership.profile_id
    where membership.pelada_id = p_pelada_id
      and membership.legacy_player_id is not null
      and membership.status <> 'removed'
      and profile.auth_user_id is null
    order by lower(coalesce(nullif(btrim(membership.nickname), ''), profile.display_name)), membership.id
  loop
    membership_id := v_row.id;
    display_name := v_row.nome;
    code := public.issue_legacy_claim(v_row.id, p_reason, p_expires_in_hours);
    return next;
  end loop;
end;
$$;

revoke all on function public.issue_legacy_claims_for_pelada(uuid, text, int) from public, anon;
grant execute on function public.issue_legacy_claims_for_pelada(uuid, text, int) to authenticated;

-- ------------------------------------------------------------- 3. espreitar
--
-- Devolve de quem é o histórico sem consumir nada. Não expõe mais do que já
-- está exposto: quem tem o código tem a identidade inteira, e um nome é menos
-- do que isso. O travão é próprio e mais largo do que o de consumir — abrir a
-- página duas vezes não pode gastar as cinco tentativas de quem vai reclamar.
create or replace function public.peek_legacy_claim(p_code text)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_auth uuid := auth.uid();
  v_claim public.legacy_claims;
  v_limit json;
  v_nome text;
begin
  if v_auth is null then raise exception 'AUTH_REQUIRED'; end if;

  v_limit := public.consume_api_rate_limit(
    'legacy_claim_peek',
    encode(extensions.digest(v_auth::text, 'sha256'), 'hex'),
    encode(extensions.digest(v_auth::text, 'sha256'), 'hex'),
    30, 900
  );
  if coalesce((v_limit->>'allowed')::boolean, false) is not true then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  select * into v_claim
  from public.legacy_claims
  where code_hash = encode(extensions.digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex');

  if not found or v_claim.revoked_at is not null then raise exception 'INVALID_CLAIM'; end if;
  if v_claim.consumed_at is not null then raise exception 'CLAIM_ALREADY_USED'; end if;
  if v_claim.expires_at <= now() then raise exception 'CLAIM_EXPIRED'; end if;

  select coalesce(nullif(btrim(membership.nickname), ''), profile.display_name)
    into v_nome
  from public.profiles profile
  left join public.pelada_memberships membership
    on membership.profile_id = profile.id and membership.pelada_id = v_claim.pelada_id
  where profile.id = v_claim.profile_id;

  return jsonb_build_object(
    'player_name', v_nome,
    'pelada_name', (select name from public.peladas where id = v_claim.pelada_id),
    'expires_at', v_claim.expires_at,
    -- Para a página avisar antes de gastar: com um perfil não descartável, o
    -- caminho é a fusão, e é melhor dizê-lo do que deixar rebentar.
    'needs_merge', not public.profile_is_disposable_for_legacy_claim(
      (select id from public.profiles where auth_user_id = v_auth)
    )
  );
end;
$$;

revoke all on function public.peek_legacy_claim(text) from public, anon;
grant execute on function public.peek_legacy_claim(text) to authenticated;
