-- =====================================================================
--  PELADA BROWNS — Migração 15: posições dos jogadores
--
--  Até aqui o sorteio só olhava para a média das notas. Passa a olhar
--  também para ONDE cada um joga (formação 2-3-1 do futebol 7), e para
--  isso a base de dados precisa de guardar a posição de cada jogador.
--
--  Regras que ficam no servidor (não bastam no frontend):
--    · o jogador escolhe a posição UMA vez — depois disso o backend
--      recusa (POSFIXA). Quem quiser mudar fala com o admin. Isto evita
--      que alguém troque de posição na véspera do sorteio para calhar
--      na equipa que quer;
--    · o jogador NUNCA mexe no `player_type` (campo/goleiro). Se pedir
--      'GK' como principal, fica o pedido registado e o admin decide —
--      o sorteio posicional exige exatamente 2 goleiros e não pode ficar
--      refém de quem se auto-promove a goleiro;
--    · toda a alteração fica em `player_position_history`, para depois
--      não haver "eu nunca escolhi isso".
--
--  Quando o admin ajusta a posição de alguém, o jogador leva um aviso
--  (`position_notice`) que vê no próximo login e confirma com
--  `ack_position_notice`. Nada disto toca em rodadas já registadas —
--  `matches`/`match_stats` ficam exatamente como estão.
--
--  Códigos de erro novos: POSFIXA (já escolheu), POSINVALIDA (posição ou
--  tipo fora da lista), POSIGUAL (secundária igual à principal).
--
--  Migração aditiva e idempotente: pode correr duas vezes sem rebentar.
-- =====================================================================

-- ---------- COLUNAS NOVAS EM players ----------
alter table players add column if not exists player_type              text not null default 'FIELD';
alter table players add column if not exists primary_position         text;        -- null = ainda não escolheu
alter table players add column if not exists secondary_position       text;        -- opcional
alter table players add column if not exists accepts_other_positions  boolean not null default true;
alter table players add column if not exists position_status          text not null default 'NOT_SELECTED';
alter table players add column if not exists position_updated_at      timestamptz;
-- Quem fez a última alteração: o id do jogador quando foi ele próprio,
-- NULL quando foi o admin (o admin autentica-se por senha, não por player
-- id, por isso não há uuid para guardar). Quem foi fica sempre no histórico.
alter table players add column if not exists position_updated_by      uuid references players(id) on delete set null;
alter table players add column if not exists position_notice          text;        -- aviso por ler
alter table players add column if not exists position_notice_at       timestamptz;

-- Os CHECK são adicionados à parte: `add constraint` não tem "if not
-- exists", por isso perguntamos ao catálogo antes.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'players_player_type_check'
                    and conrelid = 'public.players'::regclass) then
    alter table players add constraint players_player_type_check
      check (player_type in ('FIELD','GOALKEEPER'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'players_primary_position_check'
                    and conrelid = 'public.players'::regclass) then
    alter table players add constraint players_primary_position_check
      check (primary_position is null or primary_position in
             ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'players_secondary_position_check'
                    and conrelid = 'public.players'::regclass) then
    alter table players add constraint players_secondary_position_check
      check (secondary_position is null or secondary_position in
             ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'players_position_status_check'
                    and conrelid = 'public.players'::regclass) then
    alter table players add constraint players_position_status_check
      check (position_status in
             ('NOT_SELECTED','PENDING_REVIEW','APPROVED','ADJUSTED_BY_ADMIN'));
  end if;
end $$;

-- ---------- AUDITORIA ----------
-- Só cresce: nunca se apaga nem se corrige uma linha daqui.
create table if not exists player_position_history (
  id                         uuid primary key default gen_random_uuid(),
  player_id                  uuid not null references players(id) on delete cascade,
  previous_player_type       text,
  new_player_type            text,
  previous_primary_position  text,
  new_primary_position       text,
  previous_secondary_position text,
  new_secondary_position     text,
  previous_accepts           boolean,
  new_accepts                boolean,
  changed_by                 uuid references players(id) on delete set null,
  changed_by_admin           boolean not null default false,
  change_reason              text,
  changed_at                 timestamptz not null default now()
);

-- Como o resto do esquema: tabela fechada por RLS, sem políticas.
alter table player_position_history enable row level security;

create index if not exists player_position_history_player_idx
  on player_position_history(player_id, changed_at desc);

-- ---------- HELPERS ----------

-- Valida um id de posição. Null-safe de propósito: `x in (...)` com x null
-- devolve NULL e um IF com condição NULL não dispara (a mesma armadilha do
-- crypt()); o coalesce garante um booleano de verdade.
create or replace function position_ok(p text)
returns boolean language sql immutable as $$
  select coalesce(p in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST'), false);
$$;

-- Estado de posição de um jogador em JSON — partilhado por todas as
-- funções que gravam, para o frontend receber sempre a mesma forma.
--
-- ATENÇÃO: é um HELPER INTERNO, não uma função da API. Devolve o `user_id`
-- (que é meia credencial de login) sem pedir PIN nem senha, por isso fica
-- FECHADA a anon/authenticated logo a seguir — quem a chama são as funções
-- SECURITY DEFINER abaixo, que correm como dono e não passam por esse grant.
create or replace function position_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', p.id, 'name', p.name, 'user_id', p.user_id,
    'player_type', p.player_type,
    'primary_position', p.primary_position,
    'secondary_position', p.secondary_position,
    'accepts_other_positions', p.accepts_other_positions,
    'position_status', p.position_status,
    'position_updated_at', p.position_updated_at,
    'position_notice', p.position_notice,
    'position_notice_at', p.position_notice_at
  )
  from players p where p.id = p_id;
$$;

-- ---------- O JOGADOR ESCOLHE (uma única vez) ----------
create or replace function set_my_positions(
  p_id uuid, p_pin text, p_primary text, p_secondary text, p_accepts boolean
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_primary text; v_secondary text; v_accepts boolean;
begin
  -- `for update` porque a regra é "escolhe-se UMA vez": sem o lock, dois
  -- toques seguidos no botão (ou dois separadores abertos) liam ambos
  -- NOT_SELECTED e gravavam os dois, cada um com a sua linha de histórico.
  select * into r from players p where p.id = p_id for update;
  -- crypt() é STRICT: com p_pin null devolve null e o IF não dispararia
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  -- o bloqueio: só há uma escolha por jogador, o resto é com o admin
  if coalesce(r.position_status, 'NOT_SELECTED') <> 'NOT_SELECTED' then
    raise exception 'POSFIXA';
  end if;

  v_primary   := nullif(btrim(coalesce(p_primary, '')), '');
  v_secondary := nullif(btrim(coalesce(p_secondary, '')), '');
  v_accepts   := coalesce(p_accepts, true);

  if not position_ok(v_primary) then raise exception 'POSINVALIDA'; end if;
  if v_secondary is not null and not position_ok(v_secondary) then raise exception 'POSINVALIDA'; end if;
  if v_secondary is not null and v_secondary = v_primary then raise exception 'POSIGUAL'; end if;

  update players set
    primary_position        = v_primary,
    secondary_position      = v_secondary,
    accepts_other_positions = v_accepts,
    position_status         = 'PENDING_REVIEW',
    position_updated_at     = now(),
    position_updated_by     = p_id
  where id = p_id;

  -- player_type não entra aqui: quem decide quem é goleiro é o admin
  insert into player_position_history(
    player_id,
    previous_player_type, new_player_type,
    previous_primary_position, new_primary_position,
    previous_secondary_position, new_secondary_position,
    previous_accepts, new_accepts,
    changed_by, changed_by_admin, change_reason)
  values (
    p_id,
    r.player_type, r.player_type,
    r.primary_position, v_primary,
    r.secondary_position, v_secondary,
    r.accepts_other_positions, v_accepts,
    p_id, false, 'Escolha do jogador');

  return position_json(p_id);
end; $$;

-- ---------- O ADMIN AJUSTA ----------
-- Escreve tudo, incluindo o player_type, e avisa o jogador. Não toca em
-- match_lineup/match_stats: rodadas já jogadas ficam como foram jogadas.
create or replace function admin_set_positions(
  p_pw text, p_id uuid, p_type text, p_primary text, p_secondary text,
  p_accepts boolean, p_reason text
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_type text; v_primary text; v_secondary text;
        v_accepts boolean; v_label text; v_mudou boolean;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select * into r from players p where p.id = p_id;
  if r.id is null then raise exception 'SEMJOGADOR'; end if;

  v_type      := upper(nullif(btrim(coalesce(p_type, '')), ''));
  v_primary   := nullif(btrim(coalesce(p_primary, '')), '');
  v_secondary := nullif(btrim(coalesce(p_secondary, '')), '');
  v_accepts   := coalesce(p_accepts, r.accepts_other_positions, true);

  -- tipo inválido devolve POSINVALIDA (o mesmo código): para quem está no
  -- ecrã é tudo "os dados da posição não servem"
  if v_type is null or v_type not in ('FIELD','GOALKEEPER') then raise exception 'POSINVALIDA'; end if;
  if not position_ok(v_primary) then raise exception 'POSINVALIDA'; end if;
  if v_secondary is not null and not position_ok(v_secondary) then raise exception 'POSINVALIDA'; end if;
  if v_secondary is not null and v_secondary = v_primary then raise exception 'POSIGUAL'; end if;

  v_mudou := v_type is distinct from r.player_type
          or v_primary is distinct from r.primary_position
          or v_secondary is distinct from r.secondary_position;

  v_label := case v_primary
    when 'GK'    then 'Goleiro'
    when 'DEF-L' then 'Defesa esquerdo'
    when 'DEF-R' then 'Defesa direito'
    when 'MID-L' then 'Ala esquerdo'
    when 'MID-C' then 'Meio-campo'
    when 'MID-R' then 'Ala direito'
    when 'ST'    then 'Atacante'
  end;

  update players set
    player_type             = v_type,
    primary_position        = v_primary,
    secondary_position      = v_secondary,
    accepts_other_positions = v_accepts,
    position_status         = 'ADJUSTED_BY_ADMIN',
    position_updated_at     = now(),
    -- o admin não tem player id garantido; quem foi fica no histórico
    position_updated_by     = null,
    -- só avisa se a posição mudou mesmo: gravar duas vezes o mesmo não
    -- é notícia nenhuma para o jogador (r é a linha antes desta gravação).
    -- Passar a goleiro é a mudança que mais lhe muda o jogo, por isso vai
    -- dita por extenso e não só implícita no nome da posição.
    position_notice    = case when v_mudou
                           then 'A tua posição foi atualizada para ' || v_label
                                || ' pelo administrador.'
                                || case when v_type is distinct from r.player_type
                                     then ' Passas a estar registado como '
                                          || case v_type when 'GOALKEEPER' then 'goleiro'
                                                         else 'jogador de campo' end
                                          || '.'
                                     else '' end
                           else r.position_notice end,
    position_notice_at = case when v_mudou then now() else r.position_notice_at end
  where id = p_id;

  insert into player_position_history(
    player_id,
    previous_player_type, new_player_type,
    previous_primary_position, new_primary_position,
    previous_secondary_position, new_secondary_position,
    previous_accepts, new_accepts,
    changed_by, changed_by_admin, change_reason)
  values (
    p_id,
    r.player_type, v_type,
    r.primary_position, v_primary,
    r.secondary_position, v_secondary,
    r.accepts_other_positions, v_accepts,
    null, true, nullif(btrim(coalesce(p_reason, '')), ''));

  return position_json(p_id);
end; $$;

-- ---------- O ADMIN VALIDA A ESCOLHA DO JOGADOR ----------
-- Idempotente: só PENDING_REVIEW → APPROVED. Chamar outra vez (ou sobre
-- quem ainda não escolheu) devolve o estado atual sem escrever nada.
create or replace function admin_approve_positions(p_pw text, p_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select * into r from players p where p.id = p_id;
  if r.id is null then raise exception 'SEMJOGADOR'; end if;

  if r.position_status = 'PENDING_REVIEW' then
    update players set
      position_status     = 'APPROVED',
      position_updated_at = now(),
      position_updated_by = null
    where id = p_id;

    insert into player_position_history(
      player_id,
      previous_player_type, new_player_type,
      previous_primary_position, new_primary_position,
      previous_secondary_position, new_secondary_position,
      previous_accepts, new_accepts,
      changed_by, changed_by_admin, change_reason)
    values (
      p_id,
      r.player_type, r.player_type,
      r.primary_position, r.primary_position,
      r.secondary_position, r.secondary_position,
      r.accepts_other_positions, r.accepts_other_positions,
      null, true, 'Posição validada pelo administrador');
  end if;

  return position_json(p_id);
end; $$;

-- ---------- O JOGADOR CONFIRMA QUE VIU O AVISO ----------
create or replace function ack_position_notice(p_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players p where p.id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  update players set position_notice = null, position_notice_at = null where id = p_id;
end; $$;

-- ---------- PAINÉIS DO ADMIN (só leitura) ----------

-- Quem falta escolher aparece primeiro, depois quem espera validação.
create or replace function admin_positions_overview(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (
    select coalesce(json_agg(json_build_object(
             'id', p.id, 'name', p.name, 'user_id', p.user_id, 'photo', p.photo_url,
             'player_type', p.player_type,
             'primary_position', p.primary_position,
             'secondary_position', p.secondary_position,
             'accepts_other_positions', p.accepts_other_positions,
             'position_status', p.position_status,
             'position_updated_at', p.position_updated_at,
             'changed_by_admin', (
               select h.changed_by_admin from player_position_history h
               where h.player_id = p.id
               order by h.changed_at desc limit 1))
           order by case p.position_status
                      when 'NOT_SELECTED'   then 0
                      when 'PENDING_REVIEW' then 1
                      else 2
                    end, p.name), '[]'::json)
    from players p where p.approved
  );
end; $$;

-- Histórico de um jogador, do mais recente para o mais antigo.
create or replace function admin_position_history(p_pw text, p_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (
    select coalesce(json_agg(json_build_object(
             'id', h.id, 'changed_at', h.changed_at,
             'previous_player_type', h.previous_player_type,
             'new_player_type', h.new_player_type,
             'previous_primary_position', h.previous_primary_position,
             'new_primary_position', h.new_primary_position,
             'previous_secondary_position', h.previous_secondary_position,
             'new_secondary_position', h.new_secondary_position,
             'previous_accepts', h.previous_accepts,
             'new_accepts', h.new_accepts,
             'changed_by', h.changed_by,
             'changed_by_name', a.name,
             'changed_by_admin', h.changed_by_admin,
             'change_reason', h.change_reason)
           order by h.changed_at desc), '[]'::json)
    from player_position_history h
    left join players a on a.id = h.changed_by
    where h.player_id = p_id
  );
end; $$;

-- ---------- FUNÇÕES EXISTENTES: só ganham campos ----------

-- login: igual à 0009 (procura por user_id em minúsculas para o AMBIGUO
-- continuar a funcionar), mais o estado da posição e o aviso pendente —
-- assim a app sabe logo se tem de mandar o jogador escolher a posição.
create or replace function login(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; raw text; norm text; name_ids uuid[]; v_pending int;
begin
  raw := lower(btrim(coalesce(p_name, '')));
  norm := slugify(p_name);
  if norm = '' then raise exception 'CRED'; end if;
  select * into r from players where user_id = raw;
  if r.id is null then
    select array_agg(id) into name_ids from players where slugify(name) = norm;
    if coalesce(array_length(name_ids, 1), 0) >= 2 then raise exception 'AMBIGUO'; end if;
    if array_length(name_ids, 1) = 1 then select * into r from players where id = name_ids[1]; end if;
  end if;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  select count(*) into v_pending
    from players p
    where p.approved and p.id <> r.id
      and not exists (select 1 from ratings rt where rt.rater_id = r.id and rt.target_id = p.id);
  return json_build_object(
    'id', r.id, 'name', r.name, 'user_id', r.user_id,
    'is_admin', r.is_admin, 'voted', v_pending = 0,
    'player_type', r.player_type,
    'primary_position', r.primary_position,
    'secondary_position', r.secondary_position,
    'accepts_other_positions', r.accepts_other_positions,
    'position_status', r.position_status,
    'position_notice', r.position_notice
  );
end; $$;

-- get_players: mesmas linhas e mesma ordenação, mais as colunas de
-- posição (o sorteio e o campo visual leem tudo daqui).
-- Muda o returns table -> tem de ser drop + create.
drop function if exists get_players();
create function get_players()
returns table(
  id uuid, name text, dob date, photo_url text, avg numeric, votes bigint,
  player_type text, primary_position text, secondary_position text,
  accepts_other_positions boolean, position_status text)
language sql security definer set search_path = public, extensions as $$
  select p.id, p.name, p.dob, p.photo_url,
         round(avg(r.score)::numeric, 2) as avg,
         count(r.score) as votes,
         p.player_type, p.primary_position, p.secondary_position,
         p.accepts_other_positions, p.position_status
  from players p
  left join ratings r on r.target_id = p.id
  where p.approved
  group by p.id
  order by avg desc nulls last, p.name;
$$;

-- ---------- PERMISSÕES ----------
grant execute on function position_ok(text)                                              to anon, authenticated;
grant execute on function set_my_positions(uuid, text, text, text, boolean)              to anon, authenticated;
grant execute on function admin_set_positions(text, uuid, text, text, text, boolean, text) to anon, authenticated;
grant execute on function admin_approve_positions(text, uuid)                            to anon, authenticated;
grant execute on function ack_position_notice(uuid, text)                                to anon, authenticated;
grant execute on function admin_positions_overview(text)                                 to anon, authenticated;
grant execute on function admin_position_history(text, uuid)                             to anon, authenticated;
grant execute on function login(text, text)                                              to anon, authenticated;
grant execute on function get_players()                                                  to anon, authenticated;

-- O Postgres dá EXECUTE a PUBLIC a toda a função nova: sem este revoke, o
-- helper interno position_json ficava a ser um RPC aberto que devolve nome e
-- user_id de qualquer jogador (os ids saem no get_players) sem PIN nenhum.
-- Idempotente: revogar o que já não existe não é erro.
revoke execute on function position_json(uuid) from public, anon, authenticated;
