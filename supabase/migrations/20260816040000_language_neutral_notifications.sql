-- KickHub V2 — notificações independentes do idioma.
--
-- A revisão de um pedido de entrada gravava o texto já escrito em português
-- (`Pedido aprovado`, `Já podes entrar na pelada.`). Quem tem a conta em
-- francês ou alemão receberia essas frases tal como estão, e mudar o idioma
-- depois não as reescreveria: a linha ficou congelada na língua de quem
-- aprovou.
--
-- O que se guarda passa a ser apenas `kind` e `payload`. O título é o nome da
-- pelada, que não se traduz. A frase é montada na apresentação, no idioma de
-- quem lê — como já acontece com `game.created`.

create or replace function public.review_pelada_join_request(p_request_id uuid, p_decision text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.pelada_join_requests;
  v_actor uuid := public.current_profile_id();
  v_pelada_name text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  select * into v_request from public.pelada_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;
  if not public.has_pelada_role(v_request.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  update public.pelada_join_requests
  set status = p_decision, reviewed_by = v_actor, reviewed_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    insert into public.pelada_memberships (pelada_id, profile_id, role, status, approved_at, approved_by)
    values (v_request.pelada_id, v_request.profile_id, 'player', 'active', now(), v_actor)
    on conflict (pelada_id, profile_id) where profile_id is not null and status <> 'removed'
    do update set status = 'active', role = 'player', approved_at = now(), approved_by = v_actor, removed_at = null;
  end if;

  select name into v_pelada_name from public.peladas where id = v_request.pelada_id;

  insert into public.notifications (profile_id, pelada_id, kind, title, body, payload)
  values (
    v_request.profile_id,
    v_request.pelada_id,
    'join_request_' || p_decision,
    coalesce(v_pelada_name, 'KickHub'),
    null,
    jsonb_build_object('request_id', p_request_id)
  );

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_request.pelada_id, v_actor, 'join_request.' || p_decision, 'join_request', p_request_id, jsonb_build_object('profile_id', v_request.profile_id));

  return jsonb_build_object('request_id', p_request_id, 'status', p_decision);
end;
$$;

-- Cancelar um jogo passa a avisar quem tinha confirmado presença: sem isto, as
-- pessoas apareciam no campo por causa de um jogo que já não existia.
create or replace function public.cancel_game(p_game_id uuid, p_reason text)
returns public.games
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_pelada_name text;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if not public.has_pelada_role(v_game.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  update public.games
  set status = 'cancelled', cancelled_at = now()
  where id = p_game_id
  returning * into v_game;

  select name into v_pelada_name from public.peladas where id = v_game.pelada_id;

  insert into public.notifications (profile_id, pelada_id, kind, title, body, payload)
  select
    member.profile_id,
    v_game.pelada_id,
    'game.cancelled',
    coalesce(v_pelada_name, 'KickHub'),
    null,
    jsonb_build_object('game_id', v_game.id, 'scheduled_at', v_game.scheduled_at)
  from public.game_attendance attendance
  join public.pelada_memberships member on member.id = attendance.membership_id
  where attendance.game_id = p_game_id
    and attendance.status in ('confirmed', 'waitlist')
    and member.profile_id is not null
    and member.profile_id <> public.current_profile_id();

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_game.pelada_id,
    public.current_profile_id(),
    'game.cancelled',
    'games',
    v_game.id,
    jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return v_game;
end;
$$;

-- Marcar tudo como lido numa chamada. A RLS já garante que só afeta as
-- notificações do próprio, mas a RPC evita que o cliente tenha de enumerar ids.
create or replace function public.mark_notifications_read()
returns int
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_count int;
begin
  if v_profile is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  with marked as (
    update public.notifications
    set read_at = now()
    where profile_id = v_profile and read_at is null
    returning 1
  )
  select count(*)::int into v_count from marked;

  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;
