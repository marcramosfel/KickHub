-- KickHub V2 — reclamar o histórico da Browns.
--
-- Desenho aprovado em `docs/browns-claim-flow.md` e [ADR 0001]. A ideia central:
-- a pessoa **já sabe** provar que é ela — tem o PIN da Browns. O que não
-- queremos é transportar esse PIN. Usa-se uma última vez, no sítio onde ainda
-- faz sentido, para gerar um código que só serve para ligar aquele registo a
-- uma conta Google.
--
-- ## O que nunca acontece aqui
--
-- O código **nunca é guardado em claro**. Guarda-se apenas o SHA-256, e o texto
-- só existe no instante em que é emitido — devolvido uma vez a quem o emitiu, e
-- mais nunca. Nem o dono da pelada o consegue reler depois.
--
-- Nenhum PIN, hash de PIN ou token da Browns entra nesta base.
--
-- ## Tentativas
--
-- Contam-se por **conta que tenta**, e não por código. Um código errado não
-- identifica claim nenhuma — não há linha onde incrementar. Contar por quem
-- tenta é também o modelo certo: o que se quer travar é alguém a experimentar
-- códigos, e essa pessoa é a mesma independentemente do que escreve.
--
-- Reutiliza-se o balde de rate limit que já existe, com um scope próprio.
--
-- ## Invariantes
--
-- Um profile não pode ser ligado a duas contas Auth, e uma conta Auth não pode
-- assumir dois profiles. Fundir dois exige um fluxo explícito que não existe —
-- e é assim de propósito: fundir por engano é dos erros que não se desfazem.

create table public.legacy_claims (
  id uuid primary key default gen_random_uuid(),
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  -- O profile sem conta, que espera dono.
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Só o hash. O texto vive no ecrã de quem o emitiu e em mais lado nenhum.
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_auth_user uuid,
  issued_by_profile_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

-- Uma claim viva por profile: emitir outra invalida a anterior, e é o que se
-- quer quando alguém perde o código.
create unique index legacy_claims_open_per_profile_idx
  on public.legacy_claims (profile_id) where consumed_at is null;
create unique index legacy_claims_code_idx on public.legacy_claims (code_hash);

alter table public.legacy_claims enable row level security;

-- Sem políticas e sem grants: ninguém lê esta tabela a partir do browser. Tudo
-- passa pelas duas RPCs, que são o único caminho.

/**
 * Emite uma claim para um membro legado e devolve o código **uma vez**.
 *
 * Só quem organiza, e só para um membro que ainda não tem conta. Um membro já
 * reclamado não volta a estar em jogo: transferir um histórico com dono exige
 * passar pelo mesmo caminho auditado, e não por uma emissão nova.
 */
create or replace function public.issue_legacy_claim(
  p_membership_id uuid,
  p_reason text
)
returns text
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_membership public.pelada_memberships;
  v_profile public.profiles;
  v_code text;
begin
  select * into v_membership from public.pelada_memberships where id = p_membership_id;
  if not found then
    raise exception 'MEMBERSHIP_NOT_FOUND';
  end if;
  if not public.has_pelada_role(v_membership.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_membership.profile_id is null then
    raise exception 'MEMBERSHIP_WITHOUT_PROFILE';
  end if;

  select * into v_profile from public.profiles where id = v_membership.profile_id;
  if v_profile.auth_user_id is not null then
    raise exception 'ALREADY_CLAIMED';
  end if;

  -- 128 bits de aleatoriedade. Em grupos de quatro, para ser ditável ao
  -- telefone sem se perder um carácter.
  v_code := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  v_code := regexp_replace(v_code, '(.{4})(?=.)', '\1-', 'g');

  delete from public.legacy_claims
  where profile_id = v_profile.id and consumed_at is null;

  insert into public.legacy_claims (
    pelada_id, profile_id, code_hash, expires_at, issued_by_profile_id, reason
  ) values (
    v_membership.pelada_id,
    v_profile.id,
    encode(extensions.digest(v_code, 'sha256'), 'hex'),
    now() + interval '30 minutes',
    public.current_profile_id(),
    nullif(btrim(coalesce(p_reason, '')), '')
  );

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_membership.pelada_id, public.current_profile_id(), 'legacy_claim.issued',
    'pelada_membership', p_membership_id,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return v_code;
end;
$$;

/**
 * Consome uma claim e liga o histórico à conta que está a pedir.
 *
 * Numa só transação: bloqueia a linha, confere hash, validade e uso, liga
 * `profiles.auth_user_id`, marca como consumida e regista quem fez o quê.
 *
 * As mensagens de erro são deliberadamente iguais para código errado e código
 * inexistente: dizer a diferença seria dizer quais códigos existem.
 */
create or replace function public.claim_legacy_profile(p_code text)
returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_auth uuid := auth.uid();
  v_claim public.legacy_claims;
  v_limit json;
  v_hash text;
begin
  if v_auth is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Cinco tentativas por quarto de hora, contadas por quem tenta. Um código
  -- errado não identifica claim nenhuma, portanto não há onde as contar senão
  -- aqui — e travar quem experimenta é o que interessa.
  v_limit := public.consume_api_rate_limit(
    'legacy_claim',
    encode(extensions.digest(v_auth::text, 'sha256'), 'hex'),
    encode(extensions.digest(v_auth::text, 'sha256'), 'hex'),
    5, 900
  );
  if coalesce((v_limit->>'allowed')::boolean, false) is not true then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  -- Uma conta não assume dois históricos. Fundir exige um fluxo explícito que
  -- não existe, e é assim de propósito.
  if exists (select 1 from public.profiles where auth_user_id = v_auth) then
    raise exception 'ACCOUNT_ALREADY_LINKED';
  end if;

  v_hash := encode(extensions.digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex');

  select * into v_claim from public.legacy_claims
  where code_hash = v_hash for update;

  if not found then
    raise exception 'INVALID_CLAIM';
  end if;
  if v_claim.consumed_at is not null then
    raise exception 'CLAIM_ALREADY_USED';
  end if;
  if v_claim.expires_at <= now() then
    raise exception 'CLAIM_EXPIRED';
  end if;

  -- Entre a emissão e o consumo alguém pode ter reclamado por outra via.
  if exists (select 1 from public.profiles where id = v_claim.profile_id and auth_user_id is not null) then
    raise exception 'ALREADY_CLAIMED';
  end if;

  update public.profiles set auth_user_id = v_auth where id = v_claim.profile_id;

  update public.legacy_claims
  set consumed_at = now(), consumed_by_auth_user = v_auth
  where id = v_claim.id;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_claim.pelada_id, v_claim.profile_id, 'legacy_claim.consumed',
    'profile', v_claim.profile_id, '{}'::jsonb
  );

  return v_claim.profile_id;
end;
$$;

-- ------------------------------------------ o vínculo ao registo da Browns
--
-- `pelada_memberships.legacy_player_id` tinha chave estrangeira para
-- `public.players`, a tabela do legado dentro desta base. Isso pressupunha que
-- as linhas da Browns fossem primeiro restauradas para cá.
--
-- Não vão. O schema real da Browns divergiu muito do que esta base tem — a
-- `matches` de lá tem quarenta colunas, incluindo o placar, e a daqui tem três
-- — e a decisão foi trazer os dados **directamente** para as entidades
-- multi-tenant, deixando as tabelas do legado como estão: vazias e sem uso.
--
-- Com a chave estrangeira, essa decisão era impossível de executar: gravar o id
-- do jogador da Browns exigia inventar uma linha em `players`, que tem
-- `pin_hash not null` — ou seja, fabricar algo com forma de credencial só para
-- satisfazer uma restrição. Isso seria pior do que não ter a restrição.
--
-- A coluna fica, e continua a ser o vínculo único e auditável ao registo antigo
-- que o ADR 0001 exige. O que sai é a garantia ao nível da base, que passa a
-- ser responsabilidade de quem importa — e que o manifesto before/after dos
-- gates verifica de qualquer forma.
alter table public.pelada_memberships
  drop constraint pelada_memberships_legacy_player_id_fkey;

comment on column public.pelada_memberships.legacy_player_id is
  'Id do jogador na base da Pelada Browns. Sem chave estrangeira de propósito: '
  'as tabelas do legado nesta base não são povoadas — ver 20260816130000.';

revoke all on function public.issue_legacy_claim(uuid, text) from public, anon;
revoke all on function public.claim_legacy_profile(text) from public, anon;

grant execute on function public.issue_legacy_claim(uuid, text) to authenticated;
grant execute on function public.claim_legacy_profile(text) to authenticated;
