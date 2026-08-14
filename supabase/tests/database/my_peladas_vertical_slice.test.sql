begin;

select plan(10);

select has_function('public', 'list_my_peladas', array[]::text[], 'read model Minhas Peladas existe');
select has_function(
  'public',
  'create_pelada_with_settings',
  array['text','text','text','text','text','text','text','text','text','text'],
  'criação completa de pelada existe'
);

select ok(has_function_privilege('authenticated', 'public.list_my_peladas()', 'execute'), 'authenticated lista apenas as próprias peladas');
select ok(not has_function_privilege('anon', 'public.list_my_peladas()', 'execute'), 'anon não usa Minhas Peladas');
select ok(
  has_function_privilege('authenticated', 'public.create_pelada_with_settings(text,text,text,text,text,text,text,text,text,text)', 'execute'),
  'authenticated cria pelada com settings'
);
select ok(
  not has_function_privilege('anon', 'public.create_pelada_with_settings(text,text,text,text,text,text,text,text,text,text)', 'execute'),
  'anon não cria pelada com settings'
);

select alike(
  pg_get_functiondef('public.list_my_peladas()'::regprocedure),
  '%current_profile_id%',
  'read model deriva a identidade da sessão'
);
select alike(
  pg_get_functiondef('public.list_my_peladas()'::regprocedure),
  '%mine.status = ''active''%',
  'read model devolve apenas memberships ativas'
);
select alike(
  pg_get_functiondef('public.create_pelada_with_settings(text,text,text,text,text,text,text,text,text,text)'::regprocedure),
  '%update public.pelada_settings%',
  'criação persiste a configuração esportiva'
);
select alike(
  pg_get_functiondef('public.create_pelada_with_settings(text,text,text,text,text,text,text,text,text,text)'::regprocedure),
  '%pelada.settings.initialized%',
  'configuração inicial produz auditoria'
);

select * from finish();
rollback;
