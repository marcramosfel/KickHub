begin;

select plan(20);

select has_table('public', 'game_ratings', 'tabela de estrelas pós-jogo existe');
select has_function('public', 'rate_game_players', array['uuid','jsonb'], 'gravação das estrelas existe');
select has_function('public', 'get_my_game_ratings', array['uuid'], 'leitura das próprias estrelas existe');
select ok(not has_table_privilege('anon', 'public.game_ratings', 'select'), 'anon não lê estrelas');
select ok(not has_function_privilege('anon', 'public.rate_game_players(uuid,jsonb)', 'execute'), 'anon não avalia');

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'organizador@example.test'),
  ('f2000000-0000-4000-8000-000000000002', 'companheiro@example.test'),
  ('f3000000-0000-4000-8000-000000000003', 'adversario@example.test'),
  ('f4000000-0000-4000-8000-000000000004', 'suplente@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000fa001', 'rate-a', 'Rate A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'f1000000-0000-4000-8000-000000000001';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000fb001', '00000000-0000-4000-8000-0000000fa001', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'f1000000-0000-4000-8000-000000000001';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000fb002', '00000000-0000-4000-8000-0000000fa001', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'f2000000-0000-4000-8000-000000000002';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000fb003', '00000000-0000-4000-8000-0000000fa001', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'f3000000-0000-4000-8000-000000000003';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000fb004', '00000000-0000-4000-8000-0000000fa001', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'f4000000-0000-4000-8000-000000000004';

-- --------------------------------------------------------- comportamento real

set local role authenticated;
set local request.jwt.claims to '{"sub":"f1000000-0000-4000-8000-000000000001"}';

create temporary table jogo (id uuid) on commit drop;
grant select on jogo to authenticated;

do $setup$
declare v_game uuid;
begin
  select (public.create_game('00000000-0000-4000-8000-0000000fa001', now() + interval '2 days', 90, 'Campo', '5x5', 5, null, null)).id into v_game;
  insert into jogo values (v_game);

  -- Três em campo (dois na A, um na B) e um que ficou de fora.
  perform public.save_game_lineup(v_game, 'semente', jsonb_build_array(
    jsonb_build_object('membership_id', '00000000-0000-4000-8000-0000000fb001', 'team', 'A', 'overall_at_draw', 70),
    jsonb_build_object('membership_id', '00000000-0000-4000-8000-0000000fb002', 'team', 'A', 'overall_at_draw', 60),
    jsonb_build_object('membership_id', '00000000-0000-4000-8000-0000000fb003', 'team', 'B', 'overall_at_draw', 65)));
end $setup$;

-- Antes do apito não se avalia.
select throws_ok(
  $$select public.rate_game_players((select id from jogo),
      '[{"membership_id":"00000000-0000-4000-8000-0000000fb002","stars":4}]'::jsonb)$$,
  'GAME_NOT_PLAYED',
  'não se avalia um jogo que ainda não se jogou'
);

do $resultado$
begin
  perform public.save_game_result((select id from jogo), 2, 1, null, '[]'::jsonb);
end $resultado$;

select is(
  public.rate_game_players((select id from jogo),
    '[{"membership_id":"00000000-0000-4000-8000-0000000fb002","stars":4}]'::jsonb),
  1,
  'avalia-se o companheiro de equipa'
);

-- O adversário não se avalia: ninguém viu jogar quem tinha pelas costas, e
-- deixar avaliar quem se defronta transforma a nota numa arma.
select throws_ok(
  $$select public.rate_game_players((select id from jogo),
      '[{"membership_id":"00000000-0000-4000-8000-0000000fb003","stars":1}]'::jsonb)$$,
  'INVALID_RATING_TARGET',
  'não se avalia o adversário'
);
select throws_ok(
  $$select public.rate_game_players((select id from jogo),
      '[{"membership_id":"00000000-0000-4000-8000-0000000fb001","stars":5}]'::jsonb)$$,
  'INVALID_RATING_TARGET',
  'ninguém se avalia a si próprio'
);

-- Meia proposta válida recusa-se inteira: gravar só a parte aceitável deixaria
-- o cliente a pedir o que não devia e a receber metade em silêncio.
select throws_ok(
  $$select public.rate_game_players((select id from jogo),
      '[{"membership_id":"00000000-0000-4000-8000-0000000fb002","stars":5},
        {"membership_id":"00000000-0000-4000-8000-0000000fb003","stars":1}]'::jsonb)$$,
  'INVALID_RATING_TARGET',
  'uma proposta meio válida é recusada por inteiro'
);
select is(
  (select stars from public.game_ratings
   where rated_membership_id = '00000000-0000-4000-8000-0000000fb002'),
  4::smallint,
  'e nada da proposta recusada ficou gravado'
);

select throws_ok(
  $$select public.rate_game_players((select id from jogo),
      '[{"membership_id":"00000000-0000-4000-8000-0000000fb002","stars":9}]'::jsonb)$$,
  '23514',
  null,
  'a nota tem de estar entre 1 e 5'
);

select is(
  public.rate_game_players((select id from jogo),
    '[{"membership_id":"00000000-0000-4000-8000-0000000fb002","stars":2}]'::jsonb),
  1,
  'mudar de ideias substitui a nota em vez de a duplicar'
);
select is(
  (select count(*)::int from public.game_ratings
   where rated_membership_id = '00000000-0000-4000-8000-0000000fb002'),
  1,
  'e continua a haver uma só linha'
);

-- Quem não esteve em campo não avalia.
set local request.jwt.claims to '{"sub":"f4000000-0000-4000-8000-000000000004"}';
select throws_ok(
  $$select public.rate_game_players((select id from jogo),
      '[{"membership_id":"00000000-0000-4000-8000-0000000fb002","stars":5}]'::jsonb)$$,
  'NOT_IN_LINEUP',
  'quem ficou de fora não avalia'
);

-- As estrelas são privadas: cada um vê o que deu, e mais nada. Saber quem deu
-- dois envenena o balneário.
select is(
  (select count(*)::int from public.game_ratings),
  0,
  'ACCESS DENIED: as estrelas de outro não se leem'
);
select is(
  (select count(*)::int from public.get_my_game_ratings((select id from jogo))),
  0,
  'e a leitura das próprias não devolve as alheias'
);

set local request.jwt.claims to '{"sub":"f2000000-0000-4000-8000-000000000002"}';
select is(
  (select count(*)::int from public.game_ratings),
  0,
  'ACCESS DENIED: nem o próprio avaliado vê quem lhe deu a nota'
);

-- A média, essa, é pública para a pelada — é o que o overall usa.
select is(
  (select post_rating_avg from public.get_pelada_ranking('00000000-0000-4000-8000-0000000fa001')
   where membership_id = '00000000-0000-4000-8000-0000000fb002'),
  2::numeric,
  'a média das estrelas sai no ranking, sem revelar os votos'
);
select is(
  (select post_rating_avg from public.get_pelada_ranking('00000000-0000-4000-8000-0000000fa001')
   where membership_id = '00000000-0000-4000-8000-0000000fb003'),
  null::numeric,
  'quem não foi avaliado vem a nulo, e não a zero'
);

reset role;

select * from finish();
rollback;
