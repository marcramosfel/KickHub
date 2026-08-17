begin;

select plan(5);

select has_function('public', 'get_pelada_invite', array['text'], 'pré-visualização real do convite existe');
select ok(has_function_privilege('authenticated', 'public.get_pelada_invite(text)', 'execute'), 'authenticated pode validar convite');
select ok(not has_function_privilege('anon', 'public.get_pelada_invite(text)', 'execute'), 'anon não valida convite privado');
select alike(pg_get_functiondef('public.get_pelada_invite(text)'::regprocedure), '%digest(p_token, ''sha256'')%', 'token é comparado pelo hash');
select alike(pg_get_functiondef('public.get_pelada_invite(text)'::regprocedure), '%AUTH_REQUIRED%', 'a função exige sessão real');

select * from finish();
rollback;
