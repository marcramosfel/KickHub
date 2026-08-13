begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

select has_table('public', 'players', 'a tabela principal existe');

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  0,
  'todas as tabelas publicas têm RLS habilitado'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'players', 'ratings', 'draws', 'app_config', 'matches', 'match_stats',
        'award_votes', 'player_position_history', 'match_lineup',
        'goalkeeper_match_stats', 'match_substitutions', 'match_media',
        'match_activity', 'match_publications', 'match_swaps',
        'post_match_ratings', 'player_devices', 'ratings_arquivo',
        'match_predictions', 'draw_disputes', 'match_availability',
        'match_forecasts'
      ]::text[])
  ),
  0,
  'o baseline mantém acesso direto fechado e usa RPCs controladas'
);

select ok(
  not has_function_privilege('anon', 'public.admin_ok(text)', 'execute'),
  'anon não executa admin_ok'
);

select ok(
  not has_function_privilege('authenticated', 'public.admin_ok(text)', 'execute'),
  'authenticated não executa admin_ok'
);

select ok(
  not has_function_privilege('anon', 'public.gen_user_id(text)', 'execute'),
  'anon não executa gen_user_id'
);

select ok(
  not has_function_privilege('anon', 'public.login(text,text)', 'execute'),
  'anon não contorna o gateway de login'
);

select ok(
  has_function_privilege('service_role', 'public.login(text,text)', 'execute'),
  'service_role executa login através da Edge Function'
);

select ok(
  not has_function_privilege('anon', 'public.register(text,date,text,text)', 'execute'),
  'anon não contorna o gateway de cadastro'
);

select ok(
  has_function_privilege('service_role', 'public.register(text,date,text,text)', 'execute'),
  'service_role executa cadastro através da Edge Function'
);

select ok(
  not has_function_privilege('anon', 'public.admin_pending(text)', 'execute'),
  'anon não chama RPC administrativa diretamente'
);

select ok(
  has_function_privilege('service_role', 'public.admin_pending(text)', 'execute'),
  'service_role executa RPC administrativa através da Edge Function'
);

select ok(
  has_function_privilege('anon', 'public.get_players()', 'execute'),
  'anon pode executar get_players'
);

select has_table('public', 'api_rate_limits', 'a tabela de rate limit existe');

select ok(
  not has_function_privilege(
    'anon',
    'public.consume_api_rate_limit(text,text,text,integer,integer)',
    'execute'
  ),
  'anon não consome nem manipula buckets de rate limit'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.consume_api_rate_limit(text,text,text,integer,integer)',
    'execute'
  ),
  'service_role pode consumir buckets de rate limit'
);

select has_column('public', 'player_devices', 'token_hash', 'device token tem coluna de hash');

select is(
  (select count(*)::integer from public.player_devices where token is not null),
  0,
  'nenhum token persistente fica armazenado em claro'
);

select ok(
  not ('dob' = any(coalesce(
    (select p.proallargnames from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'get_players'),
    array[]::text[]
  ))),
  'get_players não devolve data de nascimento'
);

select ok(
  position('token_hash' in pg_get_functiondef('public.login_with_device(uuid)'::regprocedure)) > 0,
  'login por dispositivo compara hash do token'
);

select has_trigger('public', 'players', 'players_validar_foto', 'uploads de perfil têm validação server-side');

select has_trigger('public', 'match_media', 'match_media_validar_foto', 'mídias de jogo têm validação server-side');

select is(
  (public.consume_api_rate_limit('test:bucket', repeat('a', 64), repeat('b', 64), 2, 60)->>'attempts')::integer,
  1,
  'primeira chamada consome uma unidade do bucket'
);

select is(
  (public.consume_api_rate_limit('test:bucket', repeat('a', 64), repeat('b', 64), 2, 60)->>'attempts')::integer,
  2,
  'incremento de rate limit persiste entre chamadas'
);

select is(
  (public.consume_api_rate_limit('test:bucket', repeat('a', 64), repeat('b', 64), 2, 60)->>'allowed')::boolean,
  false,
  'bucket recusa chamadas acima do limite'
);

select * from finish();
rollback;
