begin;

select plan(24);

select has_function('public', 'get_legacy_claim_candidates', array['uuid'], 'read model de claims existe');
select has_function('public', 'revoke_legacy_claim', array['uuid','text'], 'revogacao existe');
select has_table('public', 'game_media', 'metadados de midia existem');
select has_table('public', 'pelada_feed_events', 'feed multi-tenant existe');
select has_function('public', 'get_pelada_feed', array['uuid','integer','timestamptz'], 'read model do feed existe');
select ok(not has_table_privilege('anon', 'public.game_media', 'select'), 'anon nao le metadados');
select ok(not has_table_privilege('anon', 'public.pelada_feed_events', 'select'), 'anon nao le o feed');
select ok(not has_function_privilege('anon', 'public.get_legacy_claim_candidates(uuid)', 'execute'), 'anon nao enumera claims');
select ok(not has_function_privilege('anon', 'public.revoke_legacy_claim(uuid,text)', 'execute'), 'anon nao revoga claims');
select ok(not has_function_privilege('authenticated', 'public.backfill_browns_content()', 'execute'), 'browser nao executa backfill');
select ok(not has_function_privilege('authenticated', 'public.mark_browns_media_ready(uuid,text,text,bigint)', 'execute'), 'browser nao marca midia pronta');
select is((select public from storage.buckets where id = 'game-media'), false, 'bucket de jogos e privado');

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-000000000001', 'owner-feed@example.test', '{}'::jsonb),
  ('c2000000-0000-4000-8000-000000000002', 'claim-feed@example.test', '{"locale":"de","timezone":"Europe/Zurich"}'::jsonb),
  ('c3000000-0000-4000-8000-000000000003', 'outsider-feed@example.test', '{}'::jsonb);

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000fc001', 'claim-feed', 'Claim Feed', 'PT', 'Lisboa', 'private', 'invite', id
from public.profiles where auth_user_id = 'c1000000-0000-4000-8000-000000000001';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000fd001', '00000000-0000-4000-8000-0000000fc001', id, 'owner', 'active'
from public.profiles where auth_user_id = 'c1000000-0000-4000-8000-000000000001';

insert into public.profiles (id, display_name, username)
values ('00000000-0000-4000-8000-0000000fe001', 'Historico Browns', 'historico-browns');
insert into public.pelada_memberships (id, pelada_id, profile_id, legacy_player_id, role, status)
values (
  '00000000-0000-4000-8000-0000000fd002', '00000000-0000-4000-8000-0000000fc001',
  '00000000-0000-4000-8000-0000000fe001', '00000000-0000-4000-8000-0000000ff001', 'player', 'active'
);

create temporary table issued_code (value text) on commit drop;
grant all on issued_code to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"c3000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.get_legacy_claim_candidates('00000000-0000-4000-8000-0000000fc001')$$,
  'FORBIDDEN', 'nao membro nao enumera jogadores sem conta'
);

set local request.jwt.claims to '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$insert into issued_code select public.issue_legacy_claim('00000000-0000-4000-8000-0000000fd002', 'identidade confirmada')$$,
  'admin emite codigo para membro Browns'
);
select is(
  (select claim_state from public.get_legacy_claim_candidates('00000000-0000-4000-8000-0000000fc001') where membership_id = '00000000-0000-4000-8000-0000000fd002'),
  'active', 'consola mostra claim ativa sem devolver o codigo'
);
select is(
  (select public.revoke_legacy_claim('00000000-0000-4000-8000-0000000fd002', 'jogador pediu revogacao')),
  true, 'admin revoga claim ativa'
);

set local request.jwt.claims to '{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.claim_legacy_profile((select value from issued_code))$$,
  'INVALID_CLAIM', 'claim revogada nao revela se o codigo existiu'
);

set local request.jwt.claims to '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
truncate issued_code;
insert into issued_code select public.issue_legacy_claim('00000000-0000-4000-8000-0000000fd002', 'segunda confirmacao');

set local request.jwt.claims to '{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select public.claim_legacy_profile((select value from issued_code))),
  '00000000-0000-4000-8000-0000000fe001'::uuid,
  'profile automatico vazio e fundido com o historico'
);
select is(
  (select auth_user_id from public.profiles where id = '00000000-0000-4000-8000-0000000fe001'),
  'c2000000-0000-4000-8000-000000000002'::uuid,
  'historico fica ligado a conta autenticada'
);
select is(
  (select locale from public.profiles where id = '00000000-0000-4000-8000-0000000fe001'),
  'de', 'preferencia de idioma do profile automatico e preservada'
);
select is(
  (select count(*)::int from public.profiles where auth_user_id = 'c2000000-0000-4000-8000-000000000002'),
  1, 'a conta termina com exatamente um profile'
);

reset role;

insert into public.games (id, pelada_id, scheduled_at, format, team_size, status)
values (
  '00000000-0000-4000-8000-0000000fa001', '00000000-0000-4000-8000-0000000fc001',
  now() + interval '2 days', '7x7', 7, 'scheduled'
);
insert into public.game_media (id, pelada_id, game_id, kind, object_path, mime_type, byte_size, sha256, status)
values (
  '00000000-0000-4000-8000-0000000fb001', '00000000-0000-4000-8000-0000000fc001',
  '00000000-0000-4000-8000-0000000fa001', 'photo',
  '00000000-0000-4000-8000-0000000fc001/00000000-0000-4000-8000-0000000fa001/photo.jpg',
  'image/jpeg', 3, repeat('a', 64), 'ready'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"c2000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.get_pelada_feed('00000000-0000-4000-8000-0000000fc001', 30, null)),
  1, 'membro ve o evento criado pelo trigger'
);
select is(
  (select jsonb_array_length(media) from public.get_pelada_feed('00000000-0000-4000-8000-0000000fc001', 30, null) limit 1),
  1, 'feed devolve apenas metadados da midia pronta'
);
set local request.jwt.claims to '{"sub":"c3000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.get_pelada_feed('00000000-0000-4000-8000-0000000fc001', 30, null)$$,
  'FORBIDDEN', 'nao membro nao le o feed privado'
);

select * from finish();
rollback;
