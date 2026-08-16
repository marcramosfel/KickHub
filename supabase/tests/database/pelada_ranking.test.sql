begin;

select plan(29);

select has_function('public', 'get_pelada_ranking', array['uuid'], 'ranking da pelada existe');
select has_function('public', 'get_pelada_totals', array['uuid'], 'totais da pelada existem');
select ok(has_function_privilege('authenticated', 'public.get_pelada_ranking(uuid)', 'execute'), 'authenticated lê o ranking');
select ok(not has_function_privilege('anon', 'public.get_pelada_ranking(uuid)', 'execute'), 'anon não lê rankings');
select alike(
  pg_get_functiondef('public.get_pelada_ranking(uuid)'::regprocedure),
  '%is_active_member%',
  'o ranking verifica a pertença, já que ignora a RLS'
);

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('a1100000-0000-4000-8000-000000000001', 'organizador@example.test'),
  ('a2200000-0000-4000-8000-000000000002', 'jogador2@example.test'),
  ('a3300000-0000-4000-8000-000000000003', 'jogador3@example.test'),
  ('a4400000-0000-4000-8000-000000000004', 'forasteiro@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000000c9', 'rk-a', 'RK A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'a1100000-0000-4000-8000-000000000001';
insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000000ca', 'rk-b', 'RK B', 'PT', 'Porto', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'a4400000-0000-4000-8000-000000000004';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c9', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'a1100000-0000-4000-8000-000000000001';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c9', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'a2200000-0000-4000-8000-000000000002';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c9', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'a3300000-0000-4000-8000-000000000003';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000ca', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'a4400000-0000-4000-8000-000000000004';

-- --------------------------------------------------------- comportamento real
-- Um jogo terminado 3-1: dois jogadores escalados, um terceiro apenas confirmou.

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1100000-0000-4000-8000-000000000001"}';

do $setup$
declare v_game uuid;
begin
  select (public.create_game('00000000-0000-4000-8000-0000000000c9', now() + interval '1 day', 90, 'Campo', '5x5', 5, null, null)).id into v_game;
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"a2200000-0000-4000-8000-000000000002"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"a3300000-0000-4000-8000-000000000003"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"a1100000-0000-4000-8000-000000000001"}', true);
  perform public.save_game_lineup(v_game, 'semente',
    '[{"membership_id":"00000000-0000-4000-8000-0000000000e1","team":"A","overall_at_draw":70},
      {"membership_id":"00000000-0000-4000-8000-0000000000e2","team":"B","overall_at_draw":66}]'::jsonb);
  perform public.save_game_result(v_game, 3, 1, null,
    '[{"membership_id":"00000000-0000-4000-8000-0000000000e1","goals":2,"assists":1},
      {"membership_id":"00000000-0000-4000-8000-0000000000e2","goals":1,"saves":5}]'::jsonb);
end $setup$;

select is(
  (select goals from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9') limit 1),
  2,
  'o artilheiro encabeça o ranking'
);
select is(
  (select wins from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e1'),
  1,
  'quem jogou na equipa A soma a vitória por 3-1'
);
select is(
  (select losses from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e2'),
  1,
  'quem jogou na equipa B soma a derrota'
);
select is(
  (select games_played from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e3'),
  1,
  'quem confirmou presença conta o jogo mesmo sem ter sido escalado'
);
select is(
  (select wins + draws + losses from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e3'),
  0,
  'sem escalação não se inventa de que lado a pessoa jogou'
);
select is(
  (select saves from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e2'),
  5,
  'as defesas acumulam no ranking'
);
select is(
  (select games_played from public.get_pelada_totals('00000000-0000-4000-8000-0000000000c9')),
  1,
  'os totais da comunidade contam o jogo terminado'
);

-- ------------------------------------------ quem sai não apaga o que fez

-- A remoção existe desde `20260816050000` e o ranking filtrava por inscrição
-- activa: quem saía levava consigo os golos da tabela por jogador, enquanto
-- `get_pelada_totals` continuava a contá-los. O mesmo ecrã mostrava um total que
-- as suas linhas já não somavam.

set local request.jwt.claims to '{"sub":"a1100000-0000-4000-8000-000000000001"}';

select is(
  (select is_former from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e2'),
  false,
  'quem continua na pelada não vem marcado como antigo'
);

select lives_ok(
  $$select public.remove_pelada_member('00000000-0000-4000-8000-0000000000e2')$$,
  'o dono remove o jogador que marcou'
);

select is(
  (select goals from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e2'),
  1,
  'o golo de quem saiu continua no ranking'
);
select is(
  (select is_former from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e2'),
  true,
  'e vem marcado como antigo membro'
);

-- Quem foi removido sem nunca ter jogado não tem nada para mostrar: o ranking é
-- sobre o que aconteceu em campo, não sobre quem passou pela lista.
select is(
  (select count(*)::int from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e3'),
  1,
  'o terceiro jogador, que apenas confirmou presença, continua a contar'
);

-- A nota escrita pela organização viaja com o ranking para o overall poder ser
-- calculado num sítio só. Nulo aqui quer dizer "ainda ninguém avaliou": quem
-- consome tem de deixar a parcela cair, não de a tratar por zero.
select lives_ok(
  $$select public.update_pelada_member(
      '00000000-0000-4000-8000-0000000000e1', 'FIELD', 'MID', null, true, 77)$$,
  'o dono escreve a nota do grupo pelo mesmo caminho que a aplicação usa'
);
select is(
  (select base_rating from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e1'),
  77,
  'a nota do grupo sai no ranking'
);
select is(
  (select base_rating from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e2'),
  null::int,
  'quem não tem nota vem a nulo, e não a zero'
);

-- O saldo de vitórias acima do esperado. A pergunta não é "ganhaste?" — é
-- "ganhaste mais do que era suposto?". A taxa crua não serve numa pelada com
-- sorteio equilibrado: se o motor funcionar, converge para 50% e mede ruído.
select is(
  (select wae_matches from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e1'),
  1,
  'a rodada com escalação e resultado é medida'
);

-- As duas equipas foram escaladas a 70 e 66 de overall: a de e1 era favorita, e
-- ganhou. Vale menos do que meio ponto, porque já era suposto ganhar.
select ok(
  (select wae_saldo from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e1') between 0 and 0.5,
  'o favorito que ganha soma pouco'
);
select ok(
  (select wae_saldo from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e2') between -0.5 and 0,
  'e quem perdia era esperado perder, portanto desconta pouco'
);

-- Quem só confirmou presença conta como jogo disputado, mas não tem lado: sem
-- escalação não há expectativa a comparar.
select is(
  (select wae_matches from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e3'),
  0,
  'quem não foi escalado não tem rodadas medidas'
);
select is(
  (select wae_saldo from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e3'),
  null::numeric,
  'e o saldo vem a nulo, não a zero — zero seria dizer que rendeu o esperado'
);

-- A sequência de vitórias é o único dado dos títulos que nenhuma soma guarda:
-- precisa da ordem dos jogos. Conta-se do mais recente para trás.
select is(
  (select current_win_streak from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e1'),
  1,
  'quem ganhou o jogo mais recente está em sequência de um'
);
select is(
  (select current_win_streak from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e2'),
  0,
  'quem o perdeu não tem sequência nenhuma'
);
select is(
  (select current_win_streak from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')
   where membership_id = '00000000-0000-4000-8000-0000000000e3'),
  0,
  'e quem nunca foi escalado também não'
);

set local request.jwt.claims to '{"sub":"a4400000-0000-4000-8000-000000000004"}';

select is(
  (select count(*)::int from public.get_pelada_ranking('00000000-0000-4000-8000-0000000000c9')),
  0,
  'ACCESS DENIED: não se lê o ranking de outra pelada'
);

reset role;

select * from finish();
rollback;
