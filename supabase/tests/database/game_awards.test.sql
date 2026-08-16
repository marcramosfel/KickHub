begin;

select plan(37);

select has_table('public', 'game_award_votes', 'tabela de votos existe');
select has_table('public', 'game_award_decisions', 'a decisão de cada prémio é um facto próprio');
select has_table('public', 'game_awards', 'tabela de quem levou o prémio existe');
select has_function('public', 'vote_game_awards', array['uuid','uuid','uuid'], 'votação existe');
select has_function('public', 'close_game_awards', array['uuid'], 'fecho da votação existe');
select has_function('public', 'set_game_award_override', array['uuid','text','uuid[]'], 'correção do admin existe');
select ok(not has_table_privilege('anon', 'public.game_award_votes', 'select'), 'anon não lê votos');
select ok(has_table_privilege('authenticated', 'public.game_award_votes', 'select'), 'authenticated lê a tabela, com RLS a reduzi-la ao próprio');
select ok(not has_table_privilege('authenticated', 'public.game_award_votes', 'insert'), 'a escrita direta não é concedida');

-- Contam os votos de toda a gente. Ao alcance do cliente devolveriam contagens
-- erradas em silêncio, porque a RLS só lhe mostra os votos próprios.
select ok(not has_function_privilege('authenticated', 'public.tally_game_awards(uuid)', 'execute'),
  'o apuramento não é chamável a partir do browser');
select ok(not has_function_privilege('authenticated', 'public.pelada_award_winners(uuid)', 'execute'),
  'nem o apuramento da pelada inteira');
select ok(not has_function_privilege('authenticated', 'public.game_team_outcome(uuid,text)', 'execute'),
  'nem a leitura de que lado cada equipa ficou');

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'dono@example.test'),
  ('c2000000-0000-4000-8000-000000000002', 'ganhador2@example.test'),
  ('c3000000-0000-4000-8000-000000000003', 'ganhador3@example.test'),
  ('c4000000-0000-4000-8000-000000000004', 'perdedor1@example.test'),
  ('c5000000-0000-4000-8000-000000000005', 'perdedor2@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-0000000ca001', 'award-a', 'Award A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'c1000000-0000-4000-8000-000000000001';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000cb001', '00000000-0000-4000-8000-0000000ca001', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'c1000000-0000-4000-8000-000000000001';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000cb002', '00000000-0000-4000-8000-0000000ca001', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'c2000000-0000-4000-8000-000000000002';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000cb003', '00000000-0000-4000-8000-0000000ca001', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'c3000000-0000-4000-8000-000000000003';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000cb004', '00000000-0000-4000-8000-0000000ca001', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'c4000000-0000-4000-8000-000000000004';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-0000000cb005', '00000000-0000-4000-8000-0000000ca001', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'c5000000-0000-4000-8000-000000000005';

-- --------------------------------------------------------- comportamento real

create temporary table jogo (id uuid) on commit drop;
grant all on jogo to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1000000-0000-4000-8000-000000000001"}';

do $setup$
declare v_game uuid;
begin
  select (public.create_game('00000000-0000-4000-8000-0000000ca001', now() + interval '2 days', 90, 'Campo', '5x5', 5, null, null)).id into v_game;
  insert into jogo values (v_game);

  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"c2000000-0000-4000-8000-000000000002"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"c3000000-0000-4000-8000-000000000003"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"c4000000-0000-4000-8000-000000000004"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"c5000000-0000-4000-8000-000000000005"}', true);
  perform public.set_game_attendance(v_game, 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001"}', true);

  -- Equipa A vence por 3-1: cb001, cb002 e cb003 ganham; cb004 e cb005 perdem.
  perform public.save_game_lineup(v_game, 'semente', jsonb_build_array(
    jsonb_build_object('membership_id', '00000000-0000-4000-8000-0000000cb001', 'team', 'A', 'overall_at_draw', 70),
    jsonb_build_object('membership_id', '00000000-0000-4000-8000-0000000cb002', 'team', 'A', 'overall_at_draw', 65),
    jsonb_build_object('membership_id', '00000000-0000-4000-8000-0000000cb003', 'team', 'A', 'overall_at_draw', 60),
    jsonb_build_object('membership_id', '00000000-0000-4000-8000-0000000cb004', 'team', 'B', 'overall_at_draw', 68),
    jsonb_build_object('membership_id', '00000000-0000-4000-8000-0000000cb005', 'team', 'B', 'overall_at_draw', 62)));
  perform public.save_game_result(v_game, 3, 1, null, '[]'::jsonb);
end $setup$;

-- De que lado cada equipa ficou não se afirma lendo a função interna: prova-se
-- pelo que ela faz acontecer — quem ganhou não elege bagre, e quem perdeu não
-- elege craque, ambos verificados a seguir.

-- Quem ganhou elege o craque entre os seus.
select is(
  public.vote_game_awards((select id from jogo), '00000000-0000-4000-8000-0000000cb002', null),
  1,
  'o vencedor vota craque no seu companheiro'
);

-- Não se vota no adversário: seria transformar a nota em ajuste de contas.
select throws_ok(
  $$select public.vote_game_awards((select id from jogo), '00000000-0000-4000-8000-0000000cb004', null)$$,
  'INVALID_AWARD_TARGET',
  'não se vota craque no adversário'
);
select throws_ok(
  $$select public.vote_game_awards((select id from jogo), '00000000-0000-4000-8000-0000000cb001', null)$$,
  'INVALID_AWARD_TARGET',
  'ninguém vota em si próprio'
);
select throws_ok(
  $$select public.vote_game_awards((select id from jogo), null, '00000000-0000-4000-8000-0000000cb002')$$,
  'BAGRE_IS_FOR_LOSERS',
  'quem ganhou não elege bagre'
);

set local request.jwt.claims to '{"sub":"c4000000-0000-4000-8000-000000000004"}';
select throws_ok(
  $$select public.vote_game_awards((select id from jogo), '00000000-0000-4000-8000-0000000cb005', null)$$,
  'CRAQUE_IS_FOR_WINNERS',
  'quem perdeu não elege craque'
);
select is(
  public.vote_game_awards((select id from jogo), null, '00000000-0000-4000-8000-0000000cb005'),
  1,
  'o perdedor vota bagre no seu companheiro'
);

-- Empate no craque premeia todos os empatados: 1-1 entre cb002 e cb003.
set local request.jwt.claims to '{"sub":"c2000000-0000-4000-8000-000000000002"}';
select is(
  public.vote_game_awards((select id from jogo), '00000000-0000-4000-8000-0000000cb003', null),
  1,
  'outro vencedor vota noutro companheiro'
);
select is(
  (select count(*)::int from public.get_game_awards((select id from jogo)) where award = 'craque'),
  2,
  'craque empatado premeia os dois'
);

-- Empate no bagre não castiga ninguém: 1-1 entre cb005 e cb004.
set local request.jwt.claims to '{"sub":"c5000000-0000-4000-8000-000000000005"}';
select is(
  public.vote_game_awards((select id from jogo), null, '00000000-0000-4000-8000-0000000cb004'),
  1,
  'o outro perdedor vota no primeiro'
);
select is(
  (select count(*)::int from public.get_game_awards((select id from jogo)) where award = 'bagre'),
  0,
  'bagre empatado não castiga ninguém'
);

-- Desempata: cb004 leva dois votos, cb005 um.
set local request.jwt.claims to '{"sub":"c4000000-0000-4000-8000-000000000004"}';
select is(
  public.vote_game_awards((select id from jogo), null, '00000000-0000-4000-8000-0000000cb004'),
  1,
  'mudar de ideias substitui o voto'
);
select is(
  (select membership_id from public.get_game_awards((select id from jogo)) where award = 'bagre'),
  '00000000-0000-4000-8000-0000000cb004'::uuid,
  'com dois votos contra um, há bagre'
);

-- Cada um vê o que votou, e mais nada.
select is(
  (select count(*)::int from public.game_award_votes),
  1,
  'ACCESS DENIED: os votos dos outros não se leem'
);
select is(
  (select count(*)::int from public.get_my_game_award_votes((select id from jogo))),
  1,
  'e a leitura das próprias devolve só as próprias'
);

-- Fechar é de quem organiza.
select throws_ok(
  $$select public.close_game_awards((select id from jogo))$$,
  'FORBIDDEN',
  'um jogador comum não fecha a votação'
);

set local request.jwt.claims to '{"sub":"c1000000-0000-4000-8000-000000000001"}';
select is(
  public.close_game_awards((select id from jogo)),
  3,
  'o dono fecha e congela os dois craques e o bagre'
);

-- Uma rodada fechada não se reabre: um voto atrasado mudaria retroativamente o
-- overall de duas pessoas.
set local request.jwt.claims to '{"sub":"c2000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.vote_game_awards((select id from jogo), '00000000-0000-4000-8000-0000000cb001', null)$$,
  'AWARDS_CLOSED',
  'depois de fechada, não se vota mais'
);

set local request.jwt.claims to '{"sub":"c1000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.close_game_awards((select id from jogo))$$,
  'AWARDS_ALREADY_CLOSED',
  'nem se fecha duas vezes'
);
select is(
  (select source from public.get_game_awards((select id from jogo)) where award = 'bagre'),
  'votes',
  'o vencedor congelado vem marcado como vindo dos votos'
);

-- O admin corrige, e a correção ganha ao que estava congelado.
select is(
  public.set_game_award_override((select id from jogo), 'craque', array['00000000-0000-4000-8000-0000000cb001'::uuid]),
  1,
  'o dono corrige o craque'
);
select is(
  (select membership_id from public.get_game_awards((select id from jogo)) where award = 'craque'),
  '00000000-0000-4000-8000-0000000cb001'::uuid,
  'a correção do admin ganha ao apuramento'
);

-- Premiar quem não jogou seria premiar alguém que não esteve lá — ou de outra pelada.
select throws_ok(
  $$select public.set_game_award_override((select id from jogo), 'craque', array['00000000-0000-4000-8000-0000000cb001'::uuid, gen_random_uuid()])$$,
  'INVALID_AWARD_TARGET',
  'não se premeia quem não esteve em campo'
);

-- Uma lista vazia diz "ninguém levou", que é uma decisão legítima — e foi onde
-- o modelo falhou primeiro: guardar só os vencedores tornava "decidido que
-- ninguém levou" indistinguível de "ainda não decidido", e a contagem ao vivo
-- ressuscitava o bagre que o admin tinha acabado de retirar.
select is(
  public.set_game_award_override((select id from jogo), 'bagre', array[]::uuid[]),
  0,
  'o dono pode decidir que ninguém foi bagre'
);
select is(
  (select count(*)::int from public.get_game_awards((select id from jogo)) where award = 'bagre'),
  0,
  'e o bagre fica mesmo sem ninguém, em vez de voltar pela contagem'
);
select is(
  (select count(*)::int from public.get_game_awards((select id from jogo)) where award = 'craque'),
  1,
  'sem mexer no craque, que foi decidido à parte'
);

reset role;

select * from finish();
rollback;
