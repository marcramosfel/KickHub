begin;

select plan(9);

select has_function('public', 'ensure_profile', array[]::text[], 'reparação de perfil existe');
select has_function('public', 'upsert_profile_for_auth_user', array['uuid','text','jsonb'], 'criação idempotente de perfil existe');
select has_function('public', 'generate_profile_username', array['uuid'], 'gerador de username existe');

select ok(has_function_privilege('authenticated', 'public.ensure_profile()', 'execute'), 'authenticated repara a própria sessão');
select ok(not has_function_privilege('anon', 'public.ensure_profile()', 'execute'), 'anon não cria perfis');
select ok(
  not has_function_privilege('authenticated', 'public.upsert_profile_for_auth_user(uuid,text,jsonb)', 'execute'),
  'ninguém cria um perfil para outra conta'
);

-- Dois ids que partilham o prefixo: o gerador antigo derivava o username dos
-- dez primeiros caracteres hexadecimais e abortava a inserção em auth.users.
insert into auth.users (id, email) values
  ('ffffffff-ffff-4fff-8fff-000000000001', 'colide-a@example.test'),
  ('ffffffff-ffff-4fff-8fff-000000000002', 'colide-b@example.test');

select is(
  (select count(distinct username)::int from public.profiles
   where auth_user_id in ('ffffffff-ffff-4fff-8fff-000000000001','ffffffff-ffff-4fff-8fff-000000000002')),
  2,
  'ids com o mesmo prefixo recebem usernames distintos'
);

-- Uma conta sem perfil, como as anteriores ao trigger.
insert into auth.users (id, email, raw_user_meta_data)
values ('eeeeeeee-0000-4000-8000-000000000009', 'orfao@example.test', '{"full_name":"Conta Órfã"}'::jsonb);
delete from public.profiles where auth_user_id = 'eeeeeeee-0000-4000-8000-000000000009';

set local role authenticated;
set local request.jwt.claims to '{"sub":"eeeeeeee-0000-4000-8000-000000000009"}';

select is(public.current_profile_id(), null::uuid, 'sem perfil, a identidade da sessão não resolve');

select is(
  (select (public.ensure_profile()).display_name),
  'Conta Órfã',
  'a reparação cria o perfil a partir dos metadados da conta'
);

reset role;

select * from finish();
rollback;
