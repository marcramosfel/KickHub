begin;

select plan(38);

select has_function('public', 'backfill_browns_history', array[]::text[], 'backfill Browns existe');
select has_function('public', 'browns_profile_id', array['uuid'], 'id de profile legado é determinístico');
select has_function('public', 'browns_membership_id', array['uuid'], 'id de membership legado é determinístico');
select ok(not has_function_privilege('anon', 'public.backfill_browns_history()', 'execute'), 'anon não importa dados');
select ok(not has_function_privilege('authenticated', 'public.backfill_browns_history()', 'execute'), 'authenticated não importa dados');
select ok(has_function_privilege('service_role', 'public.backfill_browns_history()', 'execute'), 'só a operação server-side executa o backfill');
select has_function('public', 'get_my_player_profile', array[]::text[], 'read model do próprio jogador existe');
select ok(not has_function_privilege('anon', 'public.get_my_player_profile()', 'execute'), 'anon não lê perfil privado');
select ok(has_function_privilege('authenticated', 'public.get_my_player_profile()', 'execute'), 'jogador autenticado lê o próprio perfil');

-- ------------------------------------------------------------- origem legada

insert into public.players (
  id, user_id, name, pin_hash, approved, is_admin, is_member, nickname,
  player_type, primary_position, secondary_position, accepts_other_positions,
  photo_url, created_at
) values
  ('c1000000-0000-4000-8000-000000000001', 'BR001', 'Ana Legado', 'desativado', true, true, true, 'Aninha',
   'FIELD', 'MID-C', 'DEF-L', true, 'data:image/png;base64,AA==', '2025-01-01T10:00:00Z'),
  ('c2000000-0000-4000-8000-000000000002', 'BR002', 'Bia Legado', 'desativado', true, false, false, null,
   'FIELD', 'ST', null, false, null, '2025-01-02T10:00:00Z'),
  ('c3000000-0000-4000-8000-000000000003', 'BR003', 'Caio Legado', 'desativado', true, false, true, null,
   'GOALKEEPER', 'GK', null, true, null, '2025-01-03T10:00:00Z');

insert into public.ratings (rater_id, target_id, score) values
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 4.0),
  ('c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 4.5),
  ('c1000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000003', 5.0);

insert into public.matches (
  id, played_at, kickoff_at, created_at, created_by, location,
  status, result_status, published_at, result_published_at,
  team_size, gk_mode, draw_seed, score_a, score_b, notes,
  voting_status, voting_closed_at, craque_final, bagre_final
) values (
  'c4000000-0000-4000-8000-000000000004', '2026-07-10', '2026-07-10T18:30:00Z',
  '2026-07-09T10:00:00Z', 'c1000000-0000-4000-8000-000000000001', 'Browns Sports Resort',
  'COMPLETED', 'PUBLISHED', '2026-07-10T20:00:00Z', '2026-07-10T20:00:00Z',
  7, 'FIXED', 'browns-seed-1', 3, 2, 'Jogo histórico',
  'CLOSED', '2026-07-10T20:30:00Z',
  'c2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003'
);

insert into public.match_availability (match_id, player_id, available, note, responded_at) values
  ('c4000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', false, 'mudou de ideia', '2026-07-09T12:00:00Z');

insert into public.match_lineup (
  match_id, player_id, team, assigned_position, overall_at_draw, is_goalkeeper, created_at
) values
  ('c4000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'A', 'MID-C', 80, false, '2026-07-09T18:00:00Z'),
  ('c4000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000002', 'A', 'ST', 90, false, '2026-07-09T18:00:00Z'),
  ('c4000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000003', 'B', 'GK', 77, true, '2026-07-09T18:00:00Z');

insert into public.match_stats (match_id, player_id, team, goals, assists, own_goals) values
  ('c4000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'A', 1, 2, 0),
  ('c4000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000002', 'A', 2, 0, 0),
  ('c4000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000003', 'B', 0, 0, 1);

insert into public.goalkeeper_match_stats (match_id, goalkeeper_id, team, saves, goals_conceded) values
  ('c4000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000003', 'B', 6, 3);

insert into public.post_match_ratings (match_id, rater_id, target_id, stars, created_at, updated_at) values
  ('c4000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 5, '2026-07-10T21:00:00Z', '2026-07-10T21:00:00Z'),
  ('c4000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 4, '2026-07-10T21:01:00Z', '2026-07-10T21:01:00Z');

insert into public.award_votes (match_id, voter_id, craque_id, bagre_id, created_at) values
  ('c4000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', '2026-07-10T21:10:00Z'),
  ('c4000000-0000-4000-8000-000000000004', 'c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '2026-07-10T21:11:00Z'),
  ('c4000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000003', null, 'c1000000-0000-4000-8000-000000000001', '2026-07-10T21:12:00Z');

set local role service_role;
select lives_ok(
  $$select public.backfill_browns_history()$$,
  'o backfill completo corre sob a service role'
);
reset role;

-- --------------------------------------------------------------- identidade

select isnt(
  public.browns_profile_id('c1000000-0000-4000-8000-000000000001'),
  public.browns_membership_id('c1000000-0000-4000-8000-000000000001'),
  'profile e membership usam namespaces diferentes'
);
select is(
  (select count(*)::int from public.profiles where id in (
    public.browns_profile_id('c1000000-0000-4000-8000-000000000001'),
    public.browns_profile_id('c2000000-0000-4000-8000-000000000002'),
    public.browns_profile_id('c3000000-0000-4000-8000-000000000003')
  )), 3, 'cada jogador ganhou profile global'
);
select is(
  (select count(*)::int from public.pelada_memberships
   where pelada_id = '00000000-0000-4000-8000-000000000101' and legacy_player_id is not null),
  3, 'cada jogador ganhou membership Browns'
);
select is(
  (select role from public.pelada_memberships where legacy_player_id = 'c1000000-0000-4000-8000-000000000001'),
  'admin', 'admin legado virou papel local da Browns'
);
select is(
  (select primary_position from public.pelada_memberships where legacy_player_id = 'c1000000-0000-4000-8000-000000000001'),
  'MID', 'posição lateralizada foi normalizada sem perder a origem'
);
select is(
  (select overall from public.pelada_memberships where legacy_player_id = 'c1000000-0000-4000-8000-000000000001'),
  80, 'a opinião do grupo virou a nota-base na mesma escala'
);

-- ---------------------------------------------------------- jogo e presença

select is(
  (select count(*)::int from public.games where id = 'c4000000-0000-4000-8000-000000000004'),
  1, 'o jogo preservou o UUID legado'
);
select results_eq(
  $$select status, format, team_size, draw_seed from public.games where id = 'c4000000-0000-4000-8000-000000000004'$$,
  $$values ('played'::text, '7x7'::text, 7, 'browns-seed-1'::text)$$,
  'estado, formato e semente foram preservados'
);
select is(
  (select count(*)::int from public.game_attendance where game_id = 'c4000000-0000-4000-8000-000000000004'),
  3, 'todos os participantes aparecem na presença'
);
select is(
  (select attendance.status from public.game_attendance attendance
   join public.pelada_memberships member on member.id = attendance.membership_id
   where attendance.game_id = 'c4000000-0000-4000-8000-000000000004'
     and member.legacy_player_id = 'c1000000-0000-4000-8000-000000000001'),
  'confirmed', 'participar prevalece sobre uma resposta antiga de ausência'
);
select is(
  (select count(*)::int from public.game_lineups where game_id = 'c4000000-0000-4000-8000-000000000004'),
  3, 'a escalação inteira foi preservada'
);

-- ------------------------------------------------------- resultado e números

select results_eq(
  $$select score_a, score_b from public.game_results where game_id = 'c4000000-0000-4000-8000-000000000004'$$,
  $$values (3, 2)$$,
  'o placar foi preservado'
);
select is(
  (select count(*)::int from public.game_player_stats where game_id = 'c4000000-0000-4000-8000-000000000004'),
  3, 'há uma linha de estatística por jogador'
);
select is(
  (select sum(goals)::int from public.game_player_stats where game_id = 'c4000000-0000-4000-8000-000000000004'),
  3, 'gols reconciliam'
);
select is(
  (select sum(assists)::int from public.game_player_stats where game_id = 'c4000000-0000-4000-8000-000000000004'),
  2, 'assistências reconciliam'
);
select is(
  (select sum(saves)::int from public.game_player_stats where game_id = 'c4000000-0000-4000-8000-000000000004'),
  6, 'defesas do goleiro foram incorporadas'
);
select is(
  (select count(*)::int from public.game_ratings where game_id = 'c4000000-0000-4000-8000-000000000004'),
  2, 'avaliações pós-jogo foram preservadas'
);
select is(
  (select count(*)::int from public.game_award_votes where game_id = 'c4000000-0000-4000-8000-000000000004'),
  5, 'escolhas completas e parciais de prÃªmio foram preservadas'
);
select is(
  (select count(*)::int from public.game_award_decisions where game_id = 'c4000000-0000-4000-8000-000000000004'),
  2, 'o fecho dos dois prémios foi preservado'
);
select is(
  (select count(*)::int from public.game_awards where game_id = 'c4000000-0000-4000-8000-000000000004'),
  2, 'os vencedores finais foram preservados'
);

-- ------------------------------------------------------ origem e repetibilidade

select is((select count(*)::int from public.players where id::text like 'c%'), 3, 'as linhas legadas continuam intactas');

set local role service_role;
select lives_ok(
  $$select public.backfill_browns_history()$$,
  'repetir o backfill não falha'
);
reset role;

select results_eq(
  $$select
      (select count(*)::int from public.games where id = 'c4000000-0000-4000-8000-000000000004'),
      (select count(*)::int from public.game_player_stats where game_id = 'c4000000-0000-4000-8000-000000000004'),
      (select count(*)::int from public.game_ratings where game_id = 'c4000000-0000-4000-8000-000000000004'),
      (select count(*)::int from public.game_award_votes where game_id = 'c4000000-0000-4000-8000-000000000004')$$,
  $$values (1, 3, 2, 5)$$,
  'a segunda execução não duplica jogos, stats, avaliações nem votos'
);

select is(
  (select count(*)::int from public.tenant_audit_log
   where pelada_id = '00000000-0000-4000-8000-000000000101'
     and action = 'browns.history_backfilled'),
  2, 'cada execução material fica auditada'
);

-- ---------------------------------------------------------- perfil autenticado

insert into auth.users (id, email)
values ('c5000000-0000-4000-8000-000000000005', 'ana-legado@example.test');
delete from public.profiles where auth_user_id = 'c5000000-0000-4000-8000-000000000005';
update public.profiles
set auth_user_id = 'c5000000-0000-4000-8000-000000000005'
where id = public.browns_profile_id('c1000000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claims to '{"sub":"c5000000-0000-4000-8000-000000000005"}';

select is(
  public.get_my_player_profile() #>> '{profile,display_name}',
  'Ana Legado', 'o profile global vem da identidade reclamada'
);
select is(
  jsonb_array_length(public.get_my_player_profile()->'peladas'),
  1, 'o read model traz apenas as peladas ativas da própria jogadora'
);
select is(
  (public.get_my_player_profile() #>> '{peladas,0,stats,goals}')::int,
  1, 'os gols históricos aparecem no perfil'
);
select ok(
  (public.get_my_player_profile() #> '{peladas,0,stats,titles}') @> '["topAssists"]'::jsonb,
  'os títulos necessários para o mesmo overall do ranking acompanham os números'
);

reset role;

select * from finish();
rollback;
