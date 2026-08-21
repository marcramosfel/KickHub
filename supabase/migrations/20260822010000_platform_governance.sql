-- KickHub V2 — governação da plataforma.
--
-- Junta numa migração as peças que o master prompt pede como estrutura e não
-- como ecrã: papéis globais (§75), moderação (§76), privacidade (§77), GDPR
-- (§78), feature flags (§70), arquivo em vez de apagar (§85) e planos (§90–91).
--
-- Todas partilham a mesma disciplina: existir na base agora para não obrigarem
-- a uma reescrita depois, sem inventar o produto que ainda não foi decidido.
-- Nenhuma delas cobra dinheiro, suspende ninguém automaticamente, nem apaga o
-- que quer que seja.

-- ---------------------------------------------------------------- §75 papéis
--
-- O admin de uma pelada e o admin da plataforma são coisas diferentes, e o
-- master prompt é explícito quanto a não os confundir. O papel de plataforma
-- vive no perfil e nunca em `pelada_memberships`: ser dono da tua pelada não
-- pode ser um degrau para administrar as dos outros.
alter table public.profiles
  add column if not exists platform_role text not null default 'member'
    check (platform_role in ('member','staff','admin'));

create index if not exists profiles_platform_role_idx
  on public.profiles (platform_role) where platform_role <> 'member';

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid() and p.platform_role in ('staff','admin')
  )
$$;

-- ---------------------------------------------------------- §70 feature flags
--
-- Uma tabela e um resolvedor, e nada mais: §70 pede explicitamente para não
-- instalar uma plataforma inteira por causa disto.
--
-- Precedência: a pelada decide, e a flag global só tem a última palavra quando
-- está desligada — um interruptor de emergência tem de poder desligar tudo,
-- mas não deve poder ligar o que uma comunidade desligou.
create table if not exists public.platform_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,47}$'),
  enabled boolean not null default true,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.platform_flags (key, enabled, description) values
  ('social_feed', true, 'Atividade e memória da pelada'),
  ('simulator', true, 'Simulador manual de equipas'),
  ('championship', true, 'Campeonato imaginário das curiosidades'),
  ('global_ranking', false, 'Ranking entre peladas — ainda não existe produto para isto')
on conflict (key) do nothing;

alter table public.platform_flags enable row level security;

create policy platform_flags_read on public.platform_flags
  for select to anon, authenticated using (true);

create policy platform_flags_write on public.platform_flags
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.feature_enabled(p_pelada_id uuid, p_key text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select enabled from public.platform_flags where key = p_key), true)
    and coalesce(
      (select (s.features ->> p_key)::boolean
       from public.pelada_settings s where s.pelada_id = p_pelada_id),
      true)
$$;

-- -------------------------------------------------------------- §76 moderação
--
-- Reportar existe; decidir não. O estado é um fluxo e não uma acção
-- automática: suspender uma comunidade por causa de uma denúncia é uma decisão
-- humana, e uma tabela que o fizesse sozinha seria uma arma apontada ao
-- produto.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('profile','pelada')),
  subject_id uuid not null,
  reason text not null check (reason in ('spam','abuse','impersonation','inappropriate','other')),
  detail text check (detail is null or char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists content_reports_open_idx
  on public.content_reports (status, created_at desc) where status in ('open','reviewing');
-- Uma denúncia aberta por pessoa e por alvo. Repetir não aumenta a gravidade,
-- só enche a fila de quem tem de ler.
create unique index if not exists content_reports_one_open_per_reporter
  on public.content_reports (reporter_profile_id, subject_type, subject_id)
  where status in ('open','reviewing');

alter table public.content_reports enable row level security;

create policy content_reports_own_read on public.content_reports
  for select to authenticated
  using (reporter_profile_id = public.current_profile_id() or public.is_platform_admin());

create policy content_reports_staff_write on public.content_reports
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.report_content(
  p_subject_type text,
  p_subject_id uuid,
  p_reason text,
  p_detail text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_id uuid;
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_subject_type not in ('profile','pelada') then raise exception 'INVALID_SUBJECT'; end if;
  if p_reason not in ('spam','abuse','impersonation','inappropriate','other') then
    raise exception 'INVALID_REASON';
  end if;

  insert into public.content_reports (reporter_profile_id, subject_type, subject_id, reason, detail)
  values (v_profile_id, p_subject_type, p_subject_id, p_reason, nullif(trim(p_detail), ''))
  on conflict do nothing
  returning id into v_id;

  -- Sem `id` a denúncia já existia e continua aberta. Dizer isso é melhor do
  -- que estoirar: quem carregou duas vezes não fez nada de errado.
  return jsonb_build_object('id', v_id, 'already_open', v_id is null);
end;
$$;

-- ------------------------------------------------------------ §77 privacidade
--
-- `profiles.privacy` já era um jsonb com dois campos. Passa a ter os cinco de
-- §77, e cada um com o valor mais fechado como omissão: uma definição de
-- privacidade que nasce aberta não é uma definição de privacidade.
create or replace function public.default_privacy()
returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'profile', 'members',
    'stats', 'members',
    'show_city', false,
    'show_peladas', 'members',
    'accept_invites', true
  )
$$;

-- `jsonb_exists_all` e não o operador `?&`: há clientes que tratam o `?` como
-- marcador de parâmetro, e uma migração não pode depender de qual deles a
-- aplica. A função é o mesmo operador com outro nome.
update public.profiles
set privacy = public.default_privacy() || privacy
where not jsonb_exists_all(privacy, array['profile','stats','show_city','show_peladas','accept_invites']);

alter table public.profiles
  alter column privacy set default '{"profile":"members","stats":"members","show_city":false,"show_peladas":"members","accept_invites":true}'::jsonb;

create or replace function public.update_my_privacy(p_privacy jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
  v_merged jsonb;
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_privacy is null or jsonb_typeof(p_privacy) <> 'object' then raise exception 'INVALID_PRIVACY'; end if;

  -- Só as chaves conhecidas sobrevivem. Um jsonb aberto era um sítio para
  -- guardar o que ninguém previu, e a privacidade não é um saco.
  v_merged := public.default_privacy() || (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from jsonb_each(p_privacy)
    where key in ('profile','stats','show_city','show_peladas','accept_invites')
  );

  if not (v_merged ->> 'profile') in ('public','members','private') then raise exception 'INVALID_PRIVACY'; end if;
  if not (v_merged ->> 'stats') in ('public','members','private') then raise exception 'INVALID_PRIVACY'; end if;
  if not (v_merged ->> 'show_peladas') in ('public','members','private') then raise exception 'INVALID_PRIVACY'; end if;

  update public.profiles set privacy = v_merged, updated_at = now() where id = v_profile_id;
  return v_merged;
end;
$$;

-- ------------------------------------------------------------------ §78 GDPR
--
-- Exportar é um direito e não uma funcionalidade avançada: uma pessoa tem de
-- poder levar o que é dela sem pedir a ninguém.
create or replace function public.export_my_data()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if not found then raise exception 'AUTH_REQUIRED'; end if;

  return jsonb_build_object(
    'exported_at', now(),
    'profile', to_jsonb(v_profile) - 'auth_user_id',
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pelada', p.name, 'slug', p.slug, 'role', m.role, 'status', m.status,
        'joined_at', m.joined_at, 'player_type', m.player_type,
        'primary_position', m.primary_position, 'secondary_position', m.secondary_position
      ) order by m.joined_at)
      from public.pelada_memberships m
      join public.peladas p on p.id = m.pelada_id
      where m.profile_id = v_profile.id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('kind', n.kind, 'created_at', n.created_at) order by n.created_at)
      from public.notifications n where n.profile_id = v_profile.id
    ), '[]'::jsonb),
    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object('subject_type', r.subject_type, 'reason', r.reason,
        'status', r.status, 'created_at', r.created_at) order by r.created_at)
      from public.content_reports r where r.reporter_profile_id = v_profile.id
    ), '[]'::jsonb)
  );
end;
$$;

/**
 * Apagar a conta.
 *
 * Não é um `delete`. O que uma pessoa marcou, defendeu ou ganhou continua a
 * pertencer à história das rodadas em que os outros jogaram — apagar a linha
 * reescrevia o passado de terceiros. O que desaparece é a identidade: o perfil
 * fica anónimo e sai de todas as comunidades.
 *
 * `deleted_at` é o que faz a conta deixar de existir para o produto. O apagar
 * definitivo, quando for pedido, é um trabalho do servidor sobre esta marca —
 * e assim tem prazo, registo e forma de ser auditado.
 */
create or replace function public.request_account_deletion()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if not found then raise exception 'AUTH_REQUIRED'; end if;

  -- Quem é dono de uma pelada activa tem de a passar a alguém primeiro. Sair e
  -- deixar uma comunidade sem dono seria apagar a conta às custas dos outros.
  if exists (
    select 1 from public.peladas p
    where p.owner_profile_id = v_profile.id and p.status = 'active'
  ) then
    raise exception 'OWNS_ACTIVE_PELADA';
  end if;

  update public.pelada_memberships
  set status = 'removed', removed_at = now(), updated_at = now()
  where profile_id = v_profile.id and status <> 'removed';

  update public.profiles
  set deleted_at = now(),
      display_name = 'Jogador removido',
      username = null,
      avatar_path = null,
      bio = null,
      city = null,
      country_code = null,
      privacy = public.default_privacy(),
      updated_at = now()
  where id = v_profile.id;

  return jsonb_build_object('deleted_at', now());
end;
$$;

-- ---------------------------------------------------------------- §85 arquivo
--
-- `peladas.status` e `archived_at` já existiam; faltava a porta para lá chegar.
create or replace function public.archive_pelada(p_pelada_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.peladas p
    where p.id = p_pelada_id and p.owner_profile_id = v_profile_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.peladas
  set status = 'archived', archived_at = now(), visibility = 'private', updated_at = now()
  where id = p_pelada_id and status = 'active';

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id)
  values (p_pelada_id, v_profile_id, 'pelada.archived', 'pelada', p_pelada_id);

  return jsonb_build_object('archived', true);
end;
$$;

-- ------------------------------------------------------- §90–91 planos e limites
--
-- Nem Stripe nem paywall: §90 proíbe os dois sem pedido explícito. O que fica é
-- a coluna e a função de limites, para que um dia possam existir planos sem
-- reescrever o que já lê `pelada_entitlements`.
--
-- Hoje todos os limites são generosos ao ponto de não se notarem. É de
-- propósito: o produto tem de funcionar exactamente na mesma até alguém decidir
-- que não funciona.
alter table public.peladas
  add column if not exists plan text not null default 'free'
    check (plan in ('free','pro','club'));

create or replace function public.pelada_entitlements(p_pelada_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case coalesce((select plan from public.peladas where id = p_pelada_id), 'free')
    when 'club' then jsonb_build_object(
      'max_members', 500, 'advanced_stats', true, 'custom_branding', true,
      'social_cards', true, 'unlimited_games', true)
    when 'pro' then jsonb_build_object(
      'max_members', 120, 'advanced_stats', true, 'custom_branding', true,
      'social_cards', true, 'unlimited_games', true)
    else jsonb_build_object(
      'max_members', 100, 'advanced_stats', true, 'custom_branding', false,
      'social_cards', true, 'unlimited_games', true)
  end
$$;

-- ----------------------------------------------------------------- privilégios
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

revoke all on function public.feature_enabled(uuid,text) from public;
grant execute on function public.feature_enabled(uuid,text) to anon, authenticated;

revoke all on function public.report_content(text,uuid,text,text) from public, anon;
grant execute on function public.report_content(text,uuid,text,text) to authenticated;

revoke all on function public.default_privacy() from public;
grant execute on function public.default_privacy() to anon, authenticated;

revoke all on function public.update_my_privacy(jsonb) from public, anon;
grant execute on function public.update_my_privacy(jsonb) to authenticated;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

revoke all on function public.archive_pelada(uuid) from public, anon;
grant execute on function public.archive_pelada(uuid) to authenticated;

revoke all on function public.pelada_entitlements(uuid) from public, anon;
grant execute on function public.pelada_entitlements(uuid) to authenticated;

revoke all on public.platform_flags, public.content_reports from anon;
grant select on public.platform_flags to anon, authenticated;
grant select, insert on public.content_reports to authenticated;
