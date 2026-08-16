begin;

select plan(10);

select has_function('public', 'mark_notifications_read', array[]::text[], 'marcar como lido existe');
select ok(has_function_privilege('authenticated', 'public.mark_notifications_read()', 'execute'), 'authenticated marca as suas como lidas');
select ok(not has_function_privilege('anon', 'public.mark_notifications_read()', 'execute'), 'anon não marca notificações');
select ok(has_table_privilege('authenticated', 'public.notifications', 'select'), 'a leitura é feita pela tabela, com RLS');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'insert'), 'ninguém escreve notificações a partir do browser');

-- A frase não pode ficar guardada na língua de quem age: quem lê pode ter a
-- conta noutro idioma, e mudar de idioma depois não reescreveria a linha.
select unlike(
  pg_get_functiondef('public.review_pelada_join_request(uuid,text)'::regprocedure),
  '%Já podes entrar na pelada%',
  'a revisão de pedido não guarda texto traduzido'
);

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'organizador@example.test'),
  ('d2000000-0000-4000-8000-000000000002', 'jogador@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000ab001', 'nt-a', 'NT A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'd1000000-0000-4000-8000-000000000001';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000ab011', '00000000-0000-4000-8000-0000000ab001', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'd1000000-0000-4000-8000-000000000001';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000ab012', '00000000-0000-4000-8000-0000000ab001', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'd2000000-0000-4000-8000-000000000002';

-- --------------------------------------------------------- comportamento real

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1000000-0000-4000-8000-000000000001"}';

do $setup$
declare v_game uuid;
begin
  select (public.create_game('00000000-0000-4000-8000-0000000ab001', now() + interval '2 days', 90, 'Campo', '5x5', 5, null, null)).id into v_game;
  perform set_config('request.jwt.claims', '{"sub":"d2000000-0000-4000-8000-000000000002"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001"}', true);
  perform public.cancel_game(v_game, 'campo alagado');
end $setup$;

set local request.jwt.claims to '{"sub":"d2000000-0000-4000-8000-000000000002"}';

select is(
  (select count(*)::int from public.notifications where kind = 'game.created'),
  1,
  'o jogador recebe a convocatória do jogo novo'
);
select is(
  (select count(*)::int from public.notifications where kind = 'game.cancelled'),
  1,
  'quem tinha confirmado é avisado do cancelamento'
);
select is(
  (select body from public.notifications where kind = 'game.cancelled'),
  null::text,
  'a notificação guarda apenas o tipo e o contexto, sem frase traduzida'
);
select is(
  public.mark_notifications_read(),
  2,
  'marcar como lidas devolve quantas foram afetadas'
);

reset role;

select * from finish();
rollback;
