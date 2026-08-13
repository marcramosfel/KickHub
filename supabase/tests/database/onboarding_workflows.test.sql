begin;

select plan(22);

select has_function('public', 'request_pelada_membership', array['uuid','text'], 'pedido de entrada existe');
select has_function('public', 'review_pelada_join_request', array['uuid','text'], 'revisão de pedido existe');
select has_function('public', 'create_pelada_invite', array['uuid','text','integer','integer'], 'criação de convite existe');
select has_function('public', 'accept_pelada_invite', array['text'], 'aceitação de convite existe');
select has_function('public', 'discover_public_peladas', array['text','text','integer','integer'], 'DTO público de descoberta existe');

select ok(has_function_privilege('authenticated', 'public.request_pelada_membership(uuid,text)', 'execute'), 'authenticated pode pedir entrada');
select ok(has_function_privilege('authenticated', 'public.review_pelada_join_request(uuid,text)', 'execute'), 'authenticated pode chamar revisão protegida');
select ok(has_function_privilege('authenticated', 'public.create_pelada_invite(uuid,text,integer,integer)', 'execute'), 'authenticated pode chamar criação protegida');
select ok(has_function_privilege('authenticated', 'public.accept_pelada_invite(text)', 'execute'), 'authenticated pode aceitar convite');

select ok(not has_function_privilege('anon', 'public.request_pelada_membership(uuid,text)', 'execute'), 'anon não pede entrada');
select ok(not has_function_privilege('anon', 'public.accept_pelada_invite(text)', 'execute'), 'anon não consome convite');
select ok(has_function_privilege('anon', 'public.discover_public_peladas(text,text,integer,integer)', 'execute'), 'anon pode usar a descoberta segura');
select ok(not has_table_privilege('anon', 'public.peladas', 'select'), 'anon não recebe a tabela completa com coordenadas');
select ok(not has_table_privilege('authenticated', 'public.pelada_join_requests', 'insert'), 'pedido direto é bloqueado');
select ok(not has_table_privilege('authenticated', 'public.pelada_join_requests', 'update'), 'revisão direta é bloqueada');
select ok(not has_table_privilege('authenticated', 'public.pelada_memberships', 'update'), 'mudança direta de membership é bloqueada');
select ok(not has_table_privilege('authenticated', 'public.pelada_invites', 'insert'), 'convite direto é bloqueado');

select alike(pg_get_functiondef('public.review_pelada_join_request(uuid,text)'::regprocedure), '%tenant_audit_log%', 'revisão produz auditoria');
select alike(pg_get_functiondef('public.accept_pelada_invite(text)'::regprocedure), '%for update%', 'consumo do convite bloqueia a linha');
select alike(pg_get_functiondef('public.create_pelada_invite(uuid,text,integer,integer)'::regprocedure), '%OWNER_REQUIRED%', 'só owner cria convite de admin');
select alike(pg_get_functiondef('public.accept_pelada_invite(text)'::regprocedure), '%already_member%', 'aceitação repetida não consome nova utilização');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'pelada_join_requests_one_pending_per_profile'), 'apenas um pedido pendente por perfil');

select * from finish();
rollback;
