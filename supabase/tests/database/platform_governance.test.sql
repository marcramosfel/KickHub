begin;

select plan(23);

-- §75: o papel de plataforma vive no perfil e não numa pertença a uma pelada.
-- Ser dono da tua comunidade não pode ser um degrau para administrar as outras.
select has_column('public', 'profiles', 'platform_role', 'o papel de plataforma existe');
select col_default_is('public', 'profiles', 'platform_role', 'member',
  'ninguém nasce administrador da plataforma');
select has_function('public', 'is_platform_admin', 'há como distinguir o staff');
select ok(not has_function_privilege('anon', 'public.is_platform_admin()', 'execute'),
  'anon não pergunta se é staff');

-- §70: flags simples, e uma flag desconhecida não desliga nada.
select has_table('public', 'platform_flags', 'as flags globais existem');
select ok(
  (select count(*) from public.platform_flags where key in ('social_feed','simulator','championship','global_ranking')) = 4,
  'as flags de §70 estão semeadas');
select alike(pg_get_functiondef('public.feature_enabled(uuid,text)'::regprocedure),
  '%coalesce%', 'uma flag ausente não desliga a funcionalidade');

-- §76: reportar existe; decidir é humano.
select has_table('public', 'content_reports', 'as denúncias têm onde viver');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.content_reports'::regclass),
  'as denúncias estão protegidas por RLS');
select ok(not has_table_privilege('anon', 'public.content_reports', 'select'),
  'anon não lê denúncias de ninguém');

-- §77: cada opção nasce fechada.
select is(public.default_privacy() ->> 'profile', 'members', 'o perfil nasce só para quem joga contigo');
select is((public.default_privacy() ->> 'show_city')::boolean, false, 'a cidade nasce escondida');
select alike(pg_get_functiondef('public.update_my_privacy(jsonb)'::regprocedure),
  '%INVALID_PRIVACY%', 'uma visibilidade inventada é recusada');

-- §78: levar os dados é um direito, e apagar não é um delete.
select has_function('public', 'export_my_data', 'exportar os próprios dados existe');
select alike(pg_get_functiondef('public.request_account_deletion()'::regprocedure),
  '%OWNS_ACTIVE_PELADA%', 'não se apaga a conta deixando uma pelada sem dono');
select alike(pg_get_functiondef('public.request_account_deletion()'::regprocedure),
  '%deleted_at = now()%', 'apagar a conta é anonimizar, não é um delete');

-- §85: arquivar em vez de destruir.
select alike(pg_get_functiondef('public.archive_pelada(uuid)'::regprocedure),
  '%status = ''archived''%', 'arquivar uma pelada não a destrói');

-- Arquivar tinha de ter volta: uma decisão sem regresso, tomada num clique,
-- não é uma decisão — é uma armadilha.
select has_function('public', 'restore_pelada', array['uuid']::text[], 'desarquivar existe');
select has_function('public', 'list_my_archived_peladas', array[]::text[], 'ver o que arquivei existe');
select ok(not has_function_privilege('anon', 'public.restore_pelada(uuid)', 'execute'), 'anon não desarquiva');
select ok(not has_function_privilege('anon', 'public.list_my_archived_peladas()', 'execute'), 'anon não vê arquivo alheio');

-- E desarquivar não reabre ao público: reabrir é uma escolha à parte.
select unalike(pg_get_functiondef('public.restore_pelada(uuid)'::regprocedure),
  '%visibility%', 'desarquivar não mexe na visibilidade');

-- §90–91: os limites existem e hoje não limitam nada.
select is(
  (public.pelada_entitlements('00000000-0000-0000-0000-000000000000') ->> 'unlimited_games')::boolean,
  true, 'o plano por omissão não tira nada a ninguém');

select * from finish();
rollback;
