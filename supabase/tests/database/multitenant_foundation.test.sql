begin;

select plan(30);

select has_table('public', 'profiles', 'profiles existe');
select has_table('public', 'peladas', 'peladas existe');
select has_table('public', 'pelada_memberships', 'memberships existe');
select has_table('public', 'pelada_settings', 'settings existe');
select has_table('public', 'pelada_invites', 'invites existe');
select has_table('public', 'pelada_join_requests', 'join requests existe');
select has_table('public', 'notifications', 'notifications existe');
select has_table('public', 'tenant_audit_log', 'audit log existe');

select has_function('public', 'current_profile_id', array[]::text[], 'helper de profile existe');
select has_function('public', 'is_active_member', array['uuid'], 'helper de membership existe');
select has_function('public', 'has_pelada_role', array['uuid','text[]'], 'helper de role existe');
select has_function('public', 'handle_new_auth_user', array[]::text[], 'provisionamento Auth existe');
select has_function('public', 'create_pelada', array['text','text','text','text','text','text','text','text'], 'RPC de criação existe');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.peladas'::regclass), 'RLS peladas');
select ok((select relrowsecurity from pg_class where oid = 'public.pelada_memberships'::regclass), 'RLS memberships');
select ok((select relrowsecurity from pg_class where oid = 'public.pelada_settings'::regclass), 'RLS settings');
select ok((select relrowsecurity from pg_class where oid = 'public.pelada_invites'::regclass), 'RLS invites');
select ok((select relrowsecurity from pg_class where oid = 'public.pelada_join_requests'::regclass), 'RLS join requests');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'RLS notifications');
select ok((select relrowsecurity from pg_class where oid = 'public.tenant_audit_log'::regclass), 'RLS audit log');

select is(
  (select slug from public.peladas where id = '00000000-0000-4000-8000-000000000101'),
  'browns',
  'Browns é tenant #1 determinístico'
);
select is(
  (select role from public.pelada_memberships where id = '00000000-0000-4000-8000-000000000201'),
  'owner',
  'Browns possui membership owner'
);

select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anon não lê profiles');
select ok(not has_table_privilege('anon', 'public.peladas', 'select'), 'anon não lê peladas diretamente');
select ok(has_function_privilege('authenticated', 'public.create_pelada(text,text,text,text,text,text,text,text)', 'execute'), 'authenticated cria pelada via RPC');
select ok(exists (
  select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
), 'trigger de provisionamento Auth ativo');
select like(
  pg_get_functiondef('public.create_pelada(text,text,text,text,text,text,text,text)'::regprocedure),
  '%tenant_audit_log%',
  'criação de pelada produz auditoria'
);
select ok((select count(*) >= 10 from pg_policies where schemaname = 'public' and tablename in (
  'profiles','peladas','pelada_memberships','pelada_settings','pelada_invites','pelada_join_requests','notifications','tenant_audit_log'
)), 'matriz de policies foi criada');
select ok(not has_table_privilege('authenticated', 'public.peladas', 'insert'), 'insert direto em peladas é bloqueado');

select * from finish();
rollback;
