begin;

select plan(15);

select has_table('public', 'game_lineups', 'tabela de escalações existe');
select has_column('public', 'game_lineups', 'overall_at_draw', 'o overall é congelado no momento do sorteio');
select has_column('public', 'games', 'draw_seed', 'a semente do sorteio fica registada');
select has_function('public', 'save_game_lineup', array['uuid','text','jsonb'], 'gravação da escalação existe');
select has_function('public', 'get_game_lineup', array['uuid'], 'leitura da escalação existe');

select ok(not has_table_privilege('anon', 'public.game_lineups', 'select'), 'anon não lê escalações');
select ok(not has_table_privilege('authenticated', 'public.game_lineups', 'insert'), 'escalação direta é bloqueada');
select alike(
  pg_get_functiondef('public.save_game_lineup(uuid,text,jsonb)'::regprocedure),
  '%for update%',
  'a gravação bloqueia a linha do jogo'
);

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'organizador@example.test'),
  ('e2000000-0000-4000-8000-000000000002', 'jogador@example.test'),
  ('e4000000-0000-4000-8000-000000000004', 'ausente@example.test'),
  ('e5000000-0000-4000-8000-000000000005', 'forasteiro@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-00000000ea01', 'draw-a', 'Draw A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'e1000000-0000-4000-8000-000000000001';
insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-00000000eb01', 'draw-b', 'Draw B', 'PT', 'Porto', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'e5000000-0000-4000-8000-000000000005';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-00000000fa01', '00000000-0000-4000-8000-00000000ea01', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'e1000000-0000-4000-8000-000000000001';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-00000000fa02', '00000000-0000-4000-8000-00000000ea01', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'e2000000-0000-4000-8000-000000000002';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-00000000fa04', '00000000-0000-4000-8000-00000000ea01', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'e4000000-0000-4000-8000-000000000004';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-00000000fb01', '00000000-0000-4000-8000-00000000eb01', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'e5000000-0000-4000-8000-000000000005';

-- --------------------------------------------------------- comportamento real

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001"}';

do $setup$
declare v_game uuid;
begin
  select (public.create_game('00000000-0000-4000-8000-00000000ea01', now() + interval '2 days', 90, 'Campo', '5x5', 5, null, null)).id into v_game;
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000002"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"e4000000-0000-4000-8000-000000000004"}', true);
  perform public.set_game_attendance(v_game, 'declined', null);
  perform set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001"}', true);
end $setup$;

select is(
  (select count(*)::int from public.save_game_lineup(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000ea01'),
    'semente-1',
    '[{"membership_id":"00000000-0000-4000-8000-00000000fa01","team":"A","overall_at_draw":70},
      {"membership_id":"00000000-0000-4000-8000-00000000fa02","team":"B","overall_at_draw":68}]'::jsonb)),
  2,
  'a escalação sorteada é gravada'
);
select is(
  (select draw_seed from public.games where pelada_id = '00000000-0000-4000-8000-00000000ea01'),
  'semente-1',
  'a semente fica registada para reproduzir o sorteio'
);
select is(
  (select count(*)::int from public.save_game_lineup(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000ea01'),
    'semente-2',
    '[{"membership_id":"00000000-0000-4000-8000-00000000fa01","team":"B","overall_at_draw":70}]'::jsonb)),
  1,
  'sortear outra vez substitui a escalação anterior por inteiro'
);
select throws_ok(
  $$select public.save_game_lineup(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000ea01'), 's',
    '[{"membership_id":"00000000-0000-4000-8000-00000000fa04","team":"A","overall_at_draw":60}]'::jsonb)$$,
  'INVALID_LINEUP',
  'não se escala quem não confirmou presença'
);
select throws_ok(
  $$select public.save_game_lineup(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000ea01'), 's',
    '[{"membership_id":"00000000-0000-4000-8000-00000000fb01","team":"A","overall_at_draw":60}]'::jsonb)$$,
  'INVALID_LINEUP',
  'ACCESS DENIED: não se escala alguém de outra pelada'
);
select throws_ok(
  $$select public.save_game_lineup(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000ea01'), 's', '[]'::jsonb)$$,
  'EMPTY_LINEUP',
  'uma escalação vazia é recusada'
);

set local request.jwt.claims to '{"sub":"e2000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$select public.save_game_lineup(
    (select id from public.games where pelada_id = '00000000-0000-4000-8000-00000000ea01'), 's',
    '[{"membership_id":"00000000-0000-4000-8000-00000000fa02","team":"A","overall_at_draw":60}]'::jsonb)$$,
  'FORBIDDEN',
  'um jogador comum não sorteia as equipas'
);

reset role;

select * from finish();
rollback;
