begin;

select plan(32);

-- ------------------------------------------------------------------ contrato

select has_function('public', 'update_pelada_identity', 'actualizar identidade existe');
select has_function('public', 'update_pelada_settings', 'actualizar definições existe');
select has_function('public', 'set_pelada_member_role', 'mudar papel existe');
select has_function('public', 'remove_pelada_member', 'remover membro existe');
select has_function('public', 'get_pelada_admin_settings', 'leitura de administração existe');

select ok(
  has_function_privilege('authenticated', 'public.set_pelada_member_role(uuid,text)', 'execute'),
  'authenticated pode mudar papéis, sujeito às guardas da função'
);
select ok(
  not has_function_privilege('anon', 'public.set_pelada_member_role(uuid,text)', 'execute'),
  'anon não mexe em papéis'
);
select ok(
  not has_function_privilege('anon', 'public.remove_pelada_member(uuid)', 'execute'),
  'anon não remove ninguém'
);

-- A imutabilidade do slug é estrutural, não uma regra dentro do corpo: a função
-- não recebe slug nenhum, portanto não há caminho por onde o link parta.
select is(
  (select count(*)::int from information_schema.parameters
   where specific_schema = 'public'
     and specific_name in (
       select specific_name from information_schema.routines
       where routine_schema = 'public' and routine_name = 'update_pelada_identity')
     and parameter_name = 'p_slug'),
  0,
  'renomear a pelada não permite mudar o slug'
);

-- ------------------------------------------------------------- dados de apoio

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'dono@example.test'),
  ('e1000000-0000-4000-8000-000000000002', 'admin@example.test'),
  ('e1000000-0000-4000-8000-000000000003', 'sai@example.test'),
  ('e1000000-0000-4000-8000-000000000004', 'espera@example.test'),
  ('e1000000-0000-4000-8000-000000000005', 'sobe@example.test');

insert into public.peladas (id, slug, name, country_code, city, visibility, join_mode, owner_profile_id)
select 'e0000000-0000-4000-8000-0000000ac001', 'adm-a', 'Nome Antigo', 'PT', 'Porto', 'private', 'invite', p.id
from public.profiles p where p.auth_user_id = 'e1000000-0000-4000-8000-000000000001';

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status)
select m.id, 'e0000000-0000-4000-8000-0000000ac001', p.id, m.role, 'active'
from (values
  ('e0000000-0000-4000-8000-0000000ac011'::uuid, 'e1000000-0000-4000-8000-000000000001'::uuid, 'owner'),
  ('e0000000-0000-4000-8000-0000000ac012'::uuid, 'e1000000-0000-4000-8000-000000000002'::uuid, 'admin'),
  ('e0000000-0000-4000-8000-0000000ac013'::uuid, 'e1000000-0000-4000-8000-000000000003'::uuid, 'player'),
  ('e0000000-0000-4000-8000-0000000ac014'::uuid, 'e1000000-0000-4000-8000-000000000004'::uuid, 'player'),
  ('e0000000-0000-4000-8000-0000000ac015'::uuid, 'e1000000-0000-4000-8000-000000000005'::uuid, 'player')
) as m(id, auth_user_id, role)
join public.profiles p on p.auth_user_id = m.auth_user_id;

-- Um jogo cheio: o titular sai e o suplente tem de entrar. O mínimo aceite em
-- `games.max_players` é 4, por isso as quatro vagas ficam ocupadas e o quinto
-- a responder é que fica à espera.
create temporary table admin_ref (game_id uuid);
grant select, insert on admin_ref to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001"}';

do $setup$
declare
  v_game uuid;
  v_sub text;
begin
  select (public.create_game('e0000000-0000-4000-8000-0000000ac001', now() + interval '3 days', 90, 'Campo', '5x5', 5, 4, null)).id into v_game;
  insert into admin_ref values (v_game);
  -- Os quatro primeiros ficam com as vagas; o último responde tarde de mais.
  foreach v_sub in array array[
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000003',
    'e1000000-0000-4000-8000-000000000005',
    'e1000000-0000-4000-8000-000000000004'
  ] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_sub)::text, true);
    perform public.set_game_attendance(v_game, 'confirmed', null);
  end loop;
end $setup$;

select is(
  (select status from public.game_attendance
   where game_id = (select game_id from admin_ref)
     and membership_id = 'e0000000-0000-4000-8000-0000000ac014'),
  'waitlist',
  'com a vaga ocupada, o segundo fica em lista de espera'
);

-- ------------------------------------------------------------ como jogador

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000003"}';

select throws_ok(
  $$select public.update_pelada_identity('e0000000-0000-4000-8000-0000000ac001', 'Roubada', null, 'public', 'open')$$,
  'P0001', 'FORBIDDEN',
  'um jogador não renomeia nem abre a pelada'
);
select is(
  (select count(*)::int from public.get_pelada_admin_settings('e0000000-0000-4000-8000-0000000ac001')),
  0,
  'um jogador não lê o painel de administração'
);

-- --------------------------------------------------------------- como admin

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000002"}';

select is(
  (public.update_pelada_identity('e0000000-0000-4000-8000-0000000ac001', '  Nome Novo  ', '  ', 'public', 'approval')).name,
  'Nome Novo',
  'o admin corrige o nome e o espaço em excesso cai'
);
select is(
  (select slug from public.peladas where id = 'e0000000-0000-4000-8000-0000000ac001'),
  'adm-a',
  'o link partilhado sobrevive à mudança de nome'
);
select is(
  (select description from public.peladas where id = 'e0000000-0000-4000-8000-0000000ac001'),
  null::text,
  'uma descrição só com espaços fica nula, não em branco'
);

-- A pelada foi criada sem linha de definições: guardar tem de a criar.
select is(
  (public.update_pelada_settings('e0000000-0000-4000-8000-0000000ac001', '5x5', 5, 'weekly', 'rotating', true, false)).goalkeeper_mode,
  'rotating',
  'guardar definições cria a linha quando ela não existe'
);
select is(
  (public.update_pelada_settings('e0000000-0000-4000-8000-0000000ac001', '5x5', 5, 'monthly', 'fixed', true, false)).goalkeeper_mode,
  'fixed',
  'guardar outra vez actualiza em vez de rebentar na chave'
);
select is(
  (select goalkeeper_mode from public.get_pelada_settings('e0000000-0000-4000-8000-0000000ac001')),
  'fixed',
  'o sorteio passa a ler o que a administração gravou'
);

select throws_ok(
  $$select public.set_pelada_member_role('e0000000-0000-4000-8000-0000000ac015', 'admin')$$,
  'P0001', 'OWNER_ONLY',
  'um admin não promove outro admin'
);
select throws_ok(
  $$select public.remove_pelada_member('e0000000-0000-4000-8000-0000000ac012')$$,
  'P0001', 'OWNER_ONLY',
  'um admin não remove quem partilha o comando com ele'
);

-- Remover o titular liberta a vaga e o suplente sobe.
select is(
  (public.remove_pelada_member('e0000000-0000-4000-8000-0000000ac013')).status,
  'removed',
  'o admin remove um jogador'
);
select is(
  (select status from public.game_attendance
   where game_id = (select game_id from admin_ref)
     and membership_id = 'e0000000-0000-4000-8000-0000000ac013'),
  'declined',
  'quem sai deixa de estar confirmado no jogo que aí vem'
);
select is(
  (select status from public.game_attendance
   where game_id = (select game_id from admin_ref)
     and membership_id = 'e0000000-0000-4000-8000-0000000ac014'),
  'confirmed',
  'a vaga libertada passa a quem estava à espera'
);
select is(
  (select count(*)::int from public.pelada_memberships
   where id = 'e0000000-0000-4000-8000-0000000ac013' and removed_at is not null),
  1,
  'a inscrição fica marcada, não apagada, para o histórico continuar a bater certo'
);

-- ---------------------------------------------------------------- como dono

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$select public.set_pelada_member_role('e0000000-0000-4000-8000-0000000ac011', 'player')$$,
  'P0001', 'CANNOT_CHANGE_OWNER',
  'nem o próprio dono se despromove por aqui'
);
select throws_ok(
  $$select public.remove_pelada_member('e0000000-0000-4000-8000-0000000ac011')$$,
  'P0001', 'CANNOT_REMOVE_OWNER',
  'a pelada não pode ficar sem dono'
);
select throws_ok(
  $$select public.set_pelada_member_role('e0000000-0000-4000-8000-0000000ac015', 'owner')$$,
  'P0001', 'INVALID_ROLE',
  'não se cria um segundo dono por esta porta'
);
select is(
  (public.set_pelada_member_role('e0000000-0000-4000-8000-0000000ac015', 'admin')).role,
  'admin',
  'o dono promove um jogador a admin'
);
select is(
  (public.remove_pelada_member('e0000000-0000-4000-8000-0000000ac012')).status,
  'removed',
  'o dono remove um admin'
);
select throws_ok(
  $$select public.set_pelada_member_role('e0000000-0000-4000-8000-0000000ac012', 'player')$$,
  'P0001', 'MEMBER_NOT_ACTIVE',
  'quem já saiu não volta a ter papel atribuído'
);

-- --------------------------------------------------- quem foi promovido soube

set local request.jwt.claims to '{"sub":"e1000000-0000-4000-8000-000000000005"}';

select is(
  (select count(*)::int from public.notifications where kind = 'membership.promoted'),
  1,
  'quem é promovido recebe o aviso'
);
select is(
  (select body from public.notifications where kind = 'membership.promoted'),
  null::text,
  'o aviso guarda o tipo, não a frase escrita na língua de quem promoveu'
);

reset role;

select * from finish();
rollback;
