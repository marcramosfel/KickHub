begin;

select plan(8);

select has_table('public', 'notification_preferences', 'as preferências de notificação existem');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.notification_preferences'::regclass),
  'cada pessoa só vê as suas preferências');
select ok(not has_table_privilege('anon', 'public.notification_preferences', 'select'),
  'anon não lê preferências de ninguém');

-- A regra que dá sentido a isto: um canal que sai para fora nasce desligado.
select is(
  public.notification_enabled('00000000-0000-0000-0000-000000000000', 'games', 'email'),
  false, 'o email nasce desligado');
select is(
  public.notification_enabled('00000000-0000-0000-0000-000000000000', 'games', 'push'),
  false, 'o push nasce desligado');
select is(
  public.notification_enabled('00000000-0000-0000-0000-000000000000', 'games', 'in_app'),
  true, 'o in-app é o produto a funcionar e nasce ligado');

select alike(pg_get_functiondef('public.set_notification_preference(text,text,boolean)'::regprocedure),
  '%INVALID_CHANNEL%', 'um canal inventado é recusado');
select ok(
  has_function_privilege('authenticated', 'public.get_my_notification_preferences()', 'execute'),
  'quem tem sessão lê as suas preferências');

select * from finish();
rollback;
