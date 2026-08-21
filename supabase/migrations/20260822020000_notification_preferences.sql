-- KickHub V2 — canais e preferências de notificação (§55).
--
-- Hoje só existe o canal in-app, e é o único que a aplicação sabe entregar.
-- Email e push são futuros — mas as preferências têm de existir agora, senão
-- o dia em que existirem começa por enviar tudo a toda a gente e pedir desculpa
-- depois.
--
-- A regra que isto codifica: um canal novo nasce DESLIGADO. Quem nunca disse
-- que queria receber emails não os pediu, e um valor por omissão a `true` é uma
-- decisão tomada em nome de outra pessoa.

create table if not exists public.notification_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- O tipo de acontecimento, e não o `kind` exacto da notificação: agrupar
  -- 'game.created' e 'game.cancelled' em "jogos" é o que uma pessoa espera
  -- desligar, e não uma lista de doze interruptores técnicos.
  topic text not null check (topic in (
    'membership','games','call_ups','results','ratings','achievements')),
  channel text not null check (channel in ('in_app','email','push')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, topic, channel)
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_own on public.notification_preferences
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

/**
 * Se um canal entrega este assunto a esta pessoa.
 *
 * O in-app está ligado por omissão porque é o produto a funcionar: uma
 * notificação dentro da app não sai de lado nenhum, e desligá-la é uma escolha
 * e não uma protecção. Os canais que saem para fora — email, push — precisam de
 * uma linha que diga `true` explicitamente.
 */
create or replace function public.notification_enabled(
  p_profile_id uuid,
  p_topic text,
  p_channel text
)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select enabled from public.notification_preferences
     where profile_id = p_profile_id and topic = p_topic and channel = p_channel),
    p_channel = 'in_app'
  )
$$;

create or replace function public.get_my_notification_preferences()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  return coalesce((
    select jsonb_object_agg(topic || '.' || channel, enabled)
    from public.notification_preferences where profile_id = v_profile_id
  ), '{}'::jsonb);
end;
$$;

create or replace function public.set_notification_preference(
  p_topic text,
  p_channel text,
  p_enabled boolean
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_topic not in ('membership','games','call_ups','results','ratings','achievements') then
    raise exception 'INVALID_TOPIC';
  end if;
  if p_channel not in ('in_app','email','push') then raise exception 'INVALID_CHANNEL'; end if;

  insert into public.notification_preferences (profile_id, topic, channel, enabled)
  values (v_profile_id, p_topic, p_channel, coalesce(p_enabled, false))
  on conflict (profile_id, topic, channel)
  do update set enabled = excluded.enabled, updated_at = now();

  return jsonb_build_object('topic', p_topic, 'channel', p_channel, 'enabled', coalesce(p_enabled, false));
end;
$$;

revoke all on function public.notification_enabled(uuid,text,text) from public, anon;
grant execute on function public.notification_enabled(uuid,text,text) to authenticated;

revoke all on function public.get_my_notification_preferences() from public, anon;
grant execute on function public.get_my_notification_preferences() to authenticated;

revoke all on function public.set_notification_preference(text,text,boolean) from public, anon;
grant execute on function public.set_notification_preference(text,text,boolean) to authenticated;

revoke all on public.notification_preferences from anon;
grant select, insert, update, delete on public.notification_preferences to authenticated;

-- §56: os índices que as consultas críticas pedem e ainda não tinham.
create index if not exists notifications_profile_created_idx
  on public.notifications (profile_id, created_at desc);
create index if not exists tenant_audit_log_actor_idx
  on public.tenant_audit_log (actor_profile_id, created_at desc);
