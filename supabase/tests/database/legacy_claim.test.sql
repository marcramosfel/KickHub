begin;

select plan(22);

select has_table('public', 'legacy_claims', 'tabela de claims existe');
select has_function('public', 'issue_legacy_claim', array['uuid','text'], 'emissão existe');
select has_function('public', 'claim_legacy_profile', array['text'], 'consumo existe');

-- Ninguém lê esta tabela a partir do browser: nem os hashes, nem quem espera
-- dono. Tudo passa pelas duas RPCs.
select ok(not has_table_privilege('anon', 'public.legacy_claims', 'select'), 'anon não lê claims');
select ok(not has_table_privilege('authenticated', 'public.legacy_claims', 'select'), 'nem authenticated');
select ok(not has_function_privilege('anon', 'public.issue_legacy_claim(uuid,text)', 'execute'), 'anon não emite');
select ok(not has_function_privilege('anon', 'public.claim_legacy_profile(text)', 'execute'), 'anon não reclama');

-- O código não pode ser guardado em claro. Se alguém um dia trocar o hash por
-- ele, isto apanha.
select unalike(
  pg_get_functiondef('public.issue_legacy_claim(uuid,text)'::regprocedure),
  '%values (v_membership.pelada_id, v_profile.id, v_code%',
  'a emissão grava o hash e não o código'
);
select alike(
  pg_get_functiondef('public.issue_legacy_claim(uuid,text)'::regprocedure),
  '%sha256%',
  'e o hash é SHA-256'
);

-- A ligação ao registo antigo tem chave estrangeira: é ela que garante que
-- nenhum membro aponta para um jogador que não existe. As linhas da Browns são
-- restauradas para `public.players` antes do backfill.
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'public.pelada_memberships'::regclass and contype = 'f'
     and pg_get_constraintdef(oid) like '%players%'),
  1,
  'legacy_player_id aponta para uma linha real da tabela do legado'
);
select has_column('public', 'pelada_memberships', 'legacy_player_id', 'e a coluna é o vínculo auditável do ADR 0001');

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'dono@example.test'),
  ('b2000000-0000-4000-8000-000000000002', 'novo@example.test'),
  ('b3000000-0000-4000-8000-000000000003', 'outro@example.test'),
  ('b4000000-0000-4000-8000-000000000004', 'estranho@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000dc001', 'claim-a', 'Claim A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'b1000000-0000-4000-8000-000000000001';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000dd001', '00000000-0000-4000-8000-0000000dc001', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'b1000000-0000-4000-8000-000000000001';

-- O jogador legado: profile sem conta, à espera de dono.
insert into public.profiles (id, auth_user_id, display_name, username)
values ('00000000-0000-4000-8000-0000000de001', null, 'Jogador Legado', 'legado-um');
-- Com a chave de volta, o vínculo exige um jogador real no legado.
insert into public.players (id, name, pin_hash)
values ('00000000-0000-4000-8000-0000000df001', 'Jogador Legado', 'nao-e-um-pin');
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status, legacy_player_id)
values ('00000000-0000-4000-8000-0000000dd002', '00000000-0000-4000-8000-0000000dc001',
        '00000000-0000-4000-8000-0000000de001', 'player', 'active',
        '00000000-0000-4000-8000-0000000df001');

-- As contas que vão reclamar entram sem profile, como quem acaba de se
-- registar e ainda nada tem seu.
delete from public.profiles where auth_user_id in (
  'b2000000-0000-4000-8000-000000000002',
  'b3000000-0000-4000-8000-000000000003');

create temporary table codigo (valor text) on commit drop;
grant all on codigo to authenticated;

set local role authenticated;

-- Um estranho não emite claims para uma pelada que não é dele.
set local request.jwt.claims to '{"sub":"b4000000-0000-4000-8000-000000000004"}';
select throws_ok(
  $$select public.issue_legacy_claim('00000000-0000-4000-8000-0000000dd002', 'tentativa')$$,
  'FORBIDDEN',
  'quem não organiza não emite claims'
);

set local request.jwt.claims to '{"sub":"b1000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$insert into codigo select public.issue_legacy_claim('00000000-0000-4000-8000-0000000dd002', 'perdeu o PIN')$$,
  'o dono emite a claim'
);
select matches(
  (select valor from codigo),
  '^[0-9A-F]{4}(-[0-9A-F]{4}){7}$',
  'o código são 128 bits em grupos de quatro, ditáveis ao telefone'
);
-- Um código errado não diz se existe: dizer a diferença seria dizer quais
-- códigos existem.
set local request.jwt.claims to '{"sub":"b2000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.claim_legacy_profile('0000-0000-0000-0000-0000-0000-0000-0000')$$,
  'INVALID_CLAIM',
  'um código que não existe é recusado sem revelar nada'
);

select is(
  (select public.claim_legacy_profile((select valor from codigo))),
  '00000000-0000-4000-8000-0000000de001'::uuid,
  'o código certo liga o histórico à conta'
);
select is(
  (select auth_user_id from public.profiles where id = '00000000-0000-4000-8000-0000000de001'),
  'b2000000-0000-4000-8000-000000000002'::uuid,
  'e o profile passa a ter dono'
);

-- Uso único, sem excepção: outra conta com o mesmo código não entra.
set local request.jwt.claims to '{"sub":"b3000000-0000-4000-8000-000000000003"}';
select throws_ok(
  $$select public.claim_legacy_profile((select valor from codigo))$$,
  'CLAIM_ALREADY_USED',
  'o mesmo código não serve a uma segunda conta'
);

-- Uma conta não assume dois históricos. Fundir exige um fluxo explícito que
-- não existe, e é assim de propósito.
set local request.jwt.claims to '{"sub":"b2000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.claim_legacy_profile((select valor from codigo))$$,
  'ACCOUNT_ALREADY_LINKED',
  'quem já tem histórico ligado não reclama outro'
);

-- Um histórico com dono não volta a estar em jogo: transferi-lo exige o mesmo
-- caminho auditado, e não uma emissão nova.
set local request.jwt.claims to '{"sub":"b1000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.issue_legacy_claim('00000000-0000-4000-8000-0000000dd002', 'outra vez')$$,
  'ALREADY_CLAIMED',
  'não se emite claim para quem já foi reclamado'
);

reset role;

-- As duas asserções seguintes leem tabelas que `authenticated` não alcança — e
-- é isso que as outras afirmam. Correm depois de largar o papel, que é a única
-- forma honesta de as fazer sem contradizer o resto do ficheiro.
select is(
  (select count(*)::int from public.legacy_claims where code_hash = (select valor from codigo)),
  0,
  'o que fica guardado não é o código, é o hash'
);
select is(
  (select count(*)::int from public.tenant_audit_log
   where pelada_id = '00000000-0000-4000-8000-0000000dc001'
     and action in ('legacy_claim.issued', 'legacy_claim.consumed')),
  2,
  'a emissão e o consumo ficam no registo de auditoria'
);

select * from finish();
rollback;
