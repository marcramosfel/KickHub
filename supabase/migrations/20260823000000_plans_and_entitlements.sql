-- KickHub V2 — o domínio dos planos, sem cobrança nenhuma.
--
-- A intenção é que um dia criar uma pelada exija subscrição. Hoje não exige, e
-- **nada aqui cobra, nada aqui finge cobrar e nada aqui bloqueia**. O que isto
-- faz é dar casa aos conceitos que a cobrança vai precisar, para o dia em que
-- ela existir não obrigar a reescrever quem pode o quê.
--
-- Três decisões que valem a pena explicar.
--
-- 1. **Os limites são dados, não código.** Estavam num `case` dentro da função
--    de direitos: mudar o tecto de um plano obrigava a uma migration, e comparar
--    dois planos obrigava a ler SQL. Passam a linhas de uma tabela.
--
-- 2. **A subscrição é da pelada e não do dono.** É a pelada que tem um tecto de
--    jogadores; um dono com três peladas não paga um plano e usa-o nas três. Se
--    um dia houver contas de organização, é essa a altura de haver uma
--    subscrição por dono — e não antes.
--
-- 3. **A excepção é um estado, e não um nome.** A Pelada Browns tem de
--    continuar a funcionar sem pagar quando o resto passar a pagar. Isso
--    resolve-se com `status = 'complimentary'` e um motivo escrito, atribuído
--    por quem administra a plataforma. Uma condição `where slug = 'browns'`
--    resolvia o mesmo problema hoje e criava um pior amanhã: à segunda excepção
--    já era código, e ninguém saberia porque é que aquela pelada é especial.

create table if not exists public.plans (
  code text primary key,
  -- O nome comercial vive no cliente, traduzido. Aqui fica só o que a base
  -- precisa de saber para decidir: quanto cabe e o que se pode fazer.
  max_members int not null check (max_members > 0),
  can_create_pelada boolean not null default false,
  -- Fora da lista pública ficam os planos que não se escolhem — o de cortesia,
  -- e os que um dia forem descontinuados sem se apagarem de quem os tem.
  is_selectable boolean not null default true,
  sort_order int not null default 0
);

comment on table public.plans is
  'Os planos e os seus limites. Sem preços: a monetização decide-se à parte e '
  'um preço aqui seria uma promessa que a base de dados não pode cumprir.';

insert into public.plans (code, max_members, can_create_pelada, is_selectable, sort_order) values
  ('free',    100, true,  true,  0),
  ('pro_20',   20, true,  true,  1),
  ('pro_30',   30, true,  true,  2),
  ('pro_50',   50, true,  true,  3)
on conflict (code) do nothing;

-- Nota sobre o `free`: hoje tem tecto de 100 e **pode criar peladas**, que é o
-- comportamento actual e o que não se pode partir. Quando a cobrança entrar,
-- muda-se esta linha — uma linha — e não o código que a lê.

create table if not exists public.pelada_subscriptions (
  pelada_id uuid primary key references public.peladas (id) on delete cascade,
  plan_code text not null references public.plans (code),
  status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'complimentary')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  -- Porque é que esta pelada tem este plano sem o ter comprado. Obrigatório no
  -- estado de cortesia: uma excepção sem motivo escrito é uma excepção que
  -- ninguém consegue rever depois.
  granted_reason text,
  granted_by_profile_id uuid references public.profiles (id) on delete set null,
  -- O identificador do fornecedor de pagamentos, para quando existir. Fica
  -- nulo e sem tipo próprio: comprometer-me agora com o formato do Stripe era
  -- decidir por um fornecedor que ainda não foi escolhido.
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pelada_subscriptions_reason_required
    check (status <> 'complimentary' or nullif(btrim(coalesce(granted_reason, '')), '') is not null)
);

alter table public.pelada_subscriptions enable row level security;

-- Quem joga na pelada vê em que plano ela está: é o que explica um limite que
-- lhe apareça pela frente. Escrever é só por RPC.
drop policy if exists pelada_subscriptions_member_read on public.pelada_subscriptions;
create policy pelada_subscriptions_member_read on public.pelada_subscriptions
  for select using (public.is_active_member(pelada_id));

-- --------------------------------------------------------------- direitos
--
-- Passa a ler da tabela. Uma pelada sem subscrição é `free`, e uma subscrição
-- que expirou ou foi cancelada também: só `active`, `trialing` e
-- `complimentary` dão os direitos do plano.
create or replace function public.pelada_entitlements(p_pelada_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  with escolhido as (
    select coalesce(
      (
        select subscription.plan_code
        from public.pelada_subscriptions subscription
        where subscription.pelada_id = p_pelada_id
          and subscription.status in ('active', 'trialing', 'complimentary')
          -- Um período terminado não dá direitos, mesmo que a linha ainda diga
          -- `active`: quem confia no estado sozinho fica a dever o serviço.
          and (subscription.current_period_end is null or subscription.current_period_end > now())
      ),
      'free'
    ) as code
  )
  select jsonb_build_object(
    'plan', plan.code,
    'max_members', plan.max_members,
    'can_create_pelada', plan.can_create_pelada,
    -- Mantidos porque já havia código a lê-los. Hoje toda a gente os tem, e é
    -- de propósito: o produto tem de funcionar exactamente na mesma até alguém
    -- decidir que não funciona.
    'advanced_stats', true,
    'social_cards', true,
    'unlimited_games', true,
    'custom_branding', plan.code <> 'free'
  )
  from escolhido
  join public.plans plan on plan.code = escolhido.code;
$$;

-- ------------------------------------------------------- pode criar pelada?
--
-- O sítio único onde a pergunta se responde. Hoje responde sempre que sim, e é
-- isso que a torna útil: quando a resposta mudar, muda aqui e em mais lado
-- nenhum. Espalhar a verificação pelo cliente era garantir que meia dúzia de
-- ecrãs discordariam entre si no dia em que ela deixasse de ser sempre sim.
create or replace function public.can_create_pelada()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'allowed', true,
    'reason', null::text,
    -- Quantas já tem, para o dia em que houver um tecto por dono.
    'owned', (
      select count(*)::int from public.peladas
      where owner_profile_id = public.current_profile_id() and status = 'active'
    )
  );
$$;

revoke all on function public.can_create_pelada() from public, anon;
grant execute on function public.can_create_pelada() to authenticated;

-- --------------------------------------------------------------- cortesia
--
-- Atribuir cortesia é acto de quem administra a plataforma, e fica no registo.
create or replace function public.grant_complimentary_plan(
  p_pelada_id uuid,
  p_plan_code text,
  p_reason text
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := public.current_profile_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles
    where id = v_actor and platform_role in ('staff', 'admin')
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if v_reason is null or char_length(v_reason) < 8 then raise exception 'INVALID_REASON'; end if;
  if not exists (select 1 from public.plans where code = p_plan_code) then
    raise exception 'UNKNOWN_PLAN';
  end if;

  insert into public.pelada_subscriptions (
    pelada_id, plan_code, status, granted_reason, granted_by_profile_id
  ) values (
    p_pelada_id, p_plan_code, 'complimentary', v_reason, v_actor
  )
  on conflict (pelada_id) do update
  set plan_code = excluded.plan_code,
      status = 'complimentary',
      granted_reason = excluded.granted_reason,
      granted_by_profile_id = excluded.granted_by_profile_id,
      current_period_end = null,
      updated_at = now();

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (p_pelada_id, v_actor, 'plan.complimentary_granted', 'pelada', p_pelada_id,
          jsonb_build_object('plan', p_plan_code, 'reason', v_reason));

  return jsonb_build_object('plan', p_plan_code, 'status', 'complimentary');
end;
$$;

revoke all on function public.grant_complimentary_plan(uuid, text, text) from public, anon;
grant execute on function public.grant_complimentary_plan(uuid, text, text) to authenticated;
