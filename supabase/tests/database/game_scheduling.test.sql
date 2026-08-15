begin;

select plan(31);

-- ------------------------------------------------------------------ estrutura

select has_table('public', 'games', 'tabela de jogos existe');
select has_table('public', 'game_attendance', 'tabela de presenças existe');
select has_function('public', 'create_game', array['uuid','timestamptz','integer','text','text','integer','integer','text'], 'criação de jogo existe');
select has_function('public', 'cancel_game', array['uuid','text'], 'cancelamento de jogo existe');
select has_function('public', 'set_game_attendance', array['uuid','text','text'], 'confirmação de presença existe');
select has_function('public', 'list_pelada_games', array['uuid','integer','integer'], 'read model do calendário existe');

select ok(not has_table_privilege('anon', 'public.games', 'select'), 'anon não lê jogos');
select ok(not has_table_privilege('authenticated', 'public.games', 'insert'), 'inserção direta de jogo é bloqueada');
select ok(not has_table_privilege('authenticated', 'public.game_attendance', 'insert'), 'presença direta é bloqueada');
select ok(not has_function_privilege('anon', 'public.create_game(uuid,timestamptz,integer,text,text,integer,integer,text)', 'execute'), 'anon não cria jogo');

select alike(pg_get_functiondef('public.set_game_attendance(uuid,text,text)'::regprocedure), '%for update%', 'a vaga é atribuída sob lock da linha do jogo');
select alike(pg_get_functiondef('public.create_game(uuid,timestamptz,integer,text,text,integer,integer,text)'::regprocedure), '%tenant_audit_log%', 'criação de jogo produz auditoria');
select alike(pg_get_functiondef('public.create_game(uuid,timestamptz,integer,text,text,integer,integer,text)'::regprocedure), '%notifications%', 'criação de jogo notifica a comunidade');

-- ------------------------------------------------------------- dados de apoio
--
-- Duas peladas independentes. Cinco membros na pelada A e um jogo com quatro
-- vagas, para que a lista de espera e a promoção sejam exercitadas de verdade.
--
-- Os UUIDs variam no PREFIXO e não no sufixo: `handle_new_auth_user` deriva o
-- username dos primeiros dez caracteres hexadecimais do id, portanto ids que só
-- diferem no fim colidem no índice único de `profiles.username`.

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a1@example.test'),
  ('a2000000-0000-4000-8000-000000000002', 'a2@example.test'),
  ('a3000000-0000-4000-8000-000000000003', 'a3@example.test'),
  ('a4000000-0000-4000-8000-000000000004', 'a4@example.test'),
  ('a5000000-0000-4000-8000-000000000005', 'a5@example.test'),
  ('b1000000-0000-4000-8000-000000000006', 'b1@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-00000000aaaa', 'pelada-a', 'Pelada A', 'PT', 'Lisboa', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'a1000000-0000-4000-8000-000000000001';

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select '00000000-0000-4000-8000-00000000bbbb', 'pelada-b', 'Pelada B', 'PT', 'Porto', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'b1000000-0000-4000-8000-000000000006';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-00000000aaaa', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'a1000000-0000-4000-8000-000000000001';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-00000000aaaa', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'a2000000-0000-4000-8000-000000000002';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-000000000a03', '00000000-0000-4000-8000-00000000aaaa', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'a3000000-0000-4000-8000-000000000003';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-000000000a04', '00000000-0000-4000-8000-00000000aaaa', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'a4000000-0000-4000-8000-000000000004';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-000000000a05', '00000000-0000-4000-8000-00000000aaaa', p.id, 'player', 'active'
from public.profiles p where p.auth_user_id = 'a5000000-0000-4000-8000-000000000005';
insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select '00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-00000000bbbb', p.id, 'owner', 'active'
from public.profiles p where p.auth_user_id = 'b1000000-0000-4000-8000-000000000006';

-- --------------------------------------------------------- comportamento real

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$select public.create_game('00000000-0000-4000-8000-00000000aaaa', now() + interval '2 days', 90, 'Campo Central', '5x5', 5, 4, null)$$,
  'owner cria jogo na sua pelada'
);
select is((select count(*)::int from public.games), 1, 'o jogo pertence à pelada A');

-- A convocatória é contada do lado de quem a recebe. Contá-la do lado do autor
-- passaria pela RLS de `notifications`, que só mostra as do próprio perfil.
select is(
  (select count(*)::int from public.notifications where kind = 'game.created'),
  0,
  'quem cria o jogo não se notifica a si próprio'
);

set local request.jwt.claims to '{"sub":"a2000000-0000-4000-8000-000000000002"}';

select is(
  (select count(*)::int from public.notifications where kind = 'game.created'),
  1,
  'cada membro ativo recebe a convocatória'
);

select throws_ok(
  $$select public.create_game('00000000-0000-4000-8000-00000000aaaa', now() + interval '3 days', 90, null, '5x5', 5, null, null)$$,
  'FORBIDDEN',
  'jogador comum não cria jogo'
);
select lives_ok(
  $$select public.set_game_attendance((select id from public.games limit 1), 'confirmed', null)$$,
  'jogador confirma a própria presença'
);
select is(
  (select status from public.game_attendance where membership_id = '00000000-0000-4000-8000-000000000a02'),
  'confirmed',
  'a presença fica confirmada'
);

-- Enche as quatro vagas: A2 já confirmou, faltam A3, A4 e A1.
do $setup$
begin
  perform set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000003"}', true);
  perform public.set_game_attendance((select id from public.games limit 1), 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"a4000000-0000-4000-8000-000000000004"}', true);
  perform public.set_game_attendance((select id from public.games limit 1), 'confirmed', null);
  perform set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001"}', true);
  perform public.set_game_attendance((select id from public.games limit 1), 'confirmed', null);
end $setup$;

set local request.jwt.claims to '{"sub":"a5000000-0000-4000-8000-000000000005"}';

select is(
  (select (public.set_game_attendance((select id from public.games limit 1), 'confirmed', null)).status),
  'waitlist',
  'com as vagas cheias, o jogador entra na lista de espera'
);

set local request.jwt.claims to '{"sub":"a2000000-0000-4000-8000-000000000002"}';

do $decline$
begin
  perform public.set_game_attendance((select id from public.games limit 1), 'declined', null);
end $decline$;

select is(
  (select status from public.game_attendance where membership_id = '00000000-0000-4000-8000-000000000a05'),
  'confirmed',
  'a desistência promove o primeiro da lista de espera'
);
select is(
  (select count(*)::int from public.game_attendance where status = 'confirmed'),
  4,
  'a promoção não ultrapassa o limite de vagas'
);

set local request.jwt.claims to '{"sub":"a1000000-0000-4000-8000-000000000001"}';

select is(
  (select confirmed_count from public.list_pelada_games('00000000-0000-4000-8000-00000000aaaa', 20, 0)),
  4,
  'o read model agrega os confirmados sem N+1'
);
select is(
  (select my_status from public.list_pelada_games('00000000-0000-4000-8000-00000000aaaa', 20, 0)),
  'confirmed',
  'o read model devolve a resposta do próprio utilizador'
);

-- O identificador do jogo é capturado fora da RLS: sem isto, a pelada B nem
-- sequer conseguiria nomear o jogo e os testes seguintes passariam por não
-- encontrarem nada, em vez de por a autorização os recusar. As RPCs são
-- `security definer` e não veem a RLS, portanto a recusa tem de ser explícita.
reset role;
create temp table game_ref as select id from public.games;
-- A tabela é criada por `postgres`; sem este grant, `authenticated` recebe 42501
-- ao lê-la e os `throws_ok` seguintes apanhariam o erro de permissão em vez da
-- recusa de autorização que se pretende exercitar.
grant select on game_ref to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"b1000000-0000-4000-8000-000000000006"}';

select is((select count(*)::int from public.games), 0, 'ACCESS DENIED: a pelada B não lê os jogos da pelada A');
select is((select count(*)::int from public.game_attendance), 0, 'ACCESS DENIED: a pelada B não lê as presenças da pelada A');
select is(
  (select count(*)::int from public.list_pelada_games('00000000-0000-4000-8000-00000000aaaa', 20, 0)),
  0,
  'ACCESS DENIED: o read model não devolve jogos de outra pelada'
);
select throws_ok(
  $$select public.set_game_attendance((select id from game_ref), 'confirmed', null)$$,
  'FORBIDDEN',
  'ACCESS DENIED: não se confirma presença num jogo de outra pelada'
);
select throws_ok(
  $$select public.cancel_game((select id from game_ref), 'teste')$$,
  'FORBIDDEN',
  'ACCESS DENIED: não se cancela um jogo de outra pelada'
);

reset role;

-- Uma presença nunca pode cruzar tenants, mesmo sem a RLS pelo meio.
select throws_ok(
  $$insert into public.game_attendance (game_id, membership_id, pelada_id, status)
    values (
      (select id from game_ref),
      '00000000-0000-4000-8000-000000000b01',
      '00000000-0000-4000-8000-00000000aaaa',
      'confirmed'
    )$$,
  '23503',
  null,
  'a chave composta impede uma membership de outra pelada'
);

select * from finish();
rollback;
