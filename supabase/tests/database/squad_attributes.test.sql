begin;

select plan(14);

select has_column('public', 'pelada_memberships', 'overall', 'o overall vive na membership, não no perfil global');
select has_function('public', 'list_pelada_members', array['uuid'], 'read model do plantel existe');
select has_function('public', 'update_pelada_member', array['uuid','text','text','text','boolean','integer'], 'edição de atributos existe');

select ok(has_function_privilege('authenticated', 'public.list_pelada_members(uuid)', 'execute'), 'authenticated lê o plantel');
select ok(not has_function_privilege('anon', 'public.list_pelada_members(uuid)', 'execute'), 'anon não lê planteis');
select ok(not has_table_privilege('authenticated', 'public.pelada_memberships', 'update'), 'edição direta da membership continua bloqueada');

select alike(
  pg_get_functiondef('public.list_pelada_members(uuid)'::regprocedure),
  '%is_active_member%',
  'o read model verifica a pertença, já que ignora a RLS'
);

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'admin-a@example.test'),
  ('c2000000-0000-4000-8000-000000000002', 'jogador-a@example.test'),
  ('c3000000-0000-4000-8000-000000000003', 'estranho-b@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000000c1', 'squad-a', 'Squad A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'c1000000-0000-4000-8000-000000000001';
insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000000c2', 'squad-b', 'Squad B', 'PT', 'Porto', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'c3000000-0000-4000-8000-000000000003';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'c1000000-0000-4000-8000-000000000001';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'c2000000-0000-4000-8000-000000000002';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000c2', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'c3000000-0000-4000-8000-000000000003';

-- --------------------------------------------------------- comportamento real

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*)::int from public.list_pelada_members('00000000-0000-4000-8000-0000000000c1')),
  2,
  'o plantel devolve os membros ativos da pelada'
);
select is(
  (select role from public.list_pelada_members('00000000-0000-4000-8000-0000000000c1') limit 1),
  'owner',
  'a equipa de organização aparece primeiro'
);
select is(
  (select (public.update_pelada_member('00000000-0000-4000-8000-0000000000d2','FIELD','MID','ATT',true,72)).overall),
  72,
  'quem organiza define o overall de outro jogador'
);

set local request.jwt.claims to '{"sub":"c2000000-0000-4000-8000-000000000002"}';

select is(
  (select (public.update_pelada_member('00000000-0000-4000-8000-0000000000d2','FIELD','DEF',null,false,72)).primary_position),
  'DEF',
  'cada jogador acerta as suas próprias posições'
);
select throws_ok(
  $$select public.update_pelada_member('00000000-0000-4000-8000-0000000000d2','FIELD','DEF',null,false,99)$$,
  'OVERALL_REQUIRES_ADMIN',
  'o overall é a avaliação do grupo: ninguém eleva o seu'
);
select throws_ok(
  $$select public.update_pelada_member('00000000-0000-4000-8000-0000000000d1','FIELD','GK',null,true,50)$$,
  'FORBIDDEN',
  'um jogador não edita outro membro'
);

set local request.jwt.claims to '{"sub":"c3000000-0000-4000-8000-000000000003"}';

select is(
  (select count(*)::int from public.list_pelada_members('00000000-0000-4000-8000-0000000000c1')),
  0,
  'ACCESS DENIED: não se lê o plantel de outra pelada'
);

reset role;

select * from finish();
rollback;
