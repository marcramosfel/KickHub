begin;

select plan(14);

select has_table('public', 'game_results', 'tabela de resultados existe');
select has_table('public', 'game_player_stats', 'estatísticas por jogador existem');
select has_function('public', 'save_game_result', array['uuid','integer','integer','text','jsonb'], 'gravação do resultado existe');
select has_function('public', 'get_game_result', array['uuid'], 'leitura do resultado existe');

select ok(not has_table_privilege('anon', 'public.game_results', 'select'), 'anon não lê resultados');
select ok(not has_table_privilege('authenticated', 'public.game_player_stats', 'insert'), 'estatística direta é bloqueada');
select alike(
  pg_get_functiondef('public.save_game_result(uuid,integer,integer,text,jsonb)'::regprocedure),
  '%for update%',
  'a gravação bloqueia a linha do jogo'
);

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'organizador@example.test'),
  ('92000000-0000-4000-8000-000000000002', 'jogador@example.test'),
  ('93000000-0000-4000-8000-000000000003', 'ausente@example.test'),
  ('94000000-0000-4000-8000-000000000004', 'forasteiro@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-00000000aa01', 'res-a', 'Res A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = '91000000-0000-4000-8000-000000000001';
insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-00000000bb01', 'res-b', 'Res B', 'PT', 'Porto', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = '94000000-0000-4000-8000-000000000004';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-00000000da01', '00000000-0000-4000-8000-00000000aa01', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = '91000000-0000-4000-8000-000000000001';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-00000000da02', '00000000-0000-4000-8000-00000000aa01', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = '92000000-0000-4000-8000-000000000002';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-00000000da03', '00000000-0000-4000-8000-00000000aa01', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = '93000000-0000-4000-8000-000000000003';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-00000000db01', '00000000-0000-4000-8000-00000000bb01', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = '94000000-0000-4000-8000-000000000004';

-- --------------------------------------------------------- comportamento real

set local role authenticated;
set local request.jwt.claims to '{"sub":"91000000-0000-4000-8000-000000000001"}';

do $setup$
declare v_game uuid;
begin
  select (public.create_game('00000000-0000-4000-8000-00000000aa01', now() + interval '1 day', 90, 'Campo', '5x5', 5, null, null)).id into v_game;
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"92000000-0000-4000-8000-000000000002"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"93000000-0000-4000-8000-000000000003"}', true);
  perform public.set_game_attendance(v_game, 'declined', null);
  perform set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001"}', true);
end $setup$;

select is(
  (select (public.save_game_result(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000aa01'), 5, 3, 'Bom jogo',
    '[{"membership_id":"00000000-0000-4000-8000-00000000da01","goals":2,"assists":1},
      {"membership_id":"00000000-0000-4000-8000-00000000da02","goals":3,"saves":4}]'::jsonb)).score_a),
  5,
  'o resultado é gravado'
);
select is(
  (select status from public.games where pelada_id = '00000000-0000-4000-8000-00000000aa01'),
  'played',
  'guardar o resultado fecha o jogo'
);
select is(
  (select sum(goals)::int from public.game_player_stats),
  5,
  'os golos ficam registados por jogador'
);
select is(
  (select (public.save_game_result(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000aa01'), 4, 3, null,
    '[{"membership_id":"00000000-0000-4000-8000-00000000da01","goals":4}]'::jsonb)).score_a),
  4,
  'corrigir um placar mal registado substitui o anterior'
);
select is(
  (select count(*)::int from public.game_player_stats),
  1,
  'a correção substitui as estatísticas em vez de as somar'
);
select throws_ok(
  $$select public.save_game_result(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000aa01'), 1, 1, null,
    '[{"membership_id":"00000000-0000-4000-8000-00000000da03","goals":1}]'::jsonb)$$,
  'INVALID_STATS',
  'não se creditam golos a quem faltou ao jogo'
);
select throws_ok(
  $$select public.save_game_result(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000aa01'), 1, 1, null,
    '[{"membership_id":"00000000-0000-4000-8000-00000000db01","goals":1}]'::jsonb)$$,
  'INVALID_STATS',
  'ACCESS DENIED: não se creditam golos a alguém de outra pelada'
);

reset role;

select * from finish();
rollback;
