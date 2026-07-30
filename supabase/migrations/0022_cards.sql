-- =====================================================================
--  PELADA BROWNS — Migração 22: card principal e apelido
--
--  Os cards em si NÃO vivem aqui, e é uma decisão, não um esquecimento.
--  Continua a valer o que ficou escrito na 0015 (`src/lib/achievements.js`):
--  títulos derivados dos números do momento nunca se dessincronizam. Quem
--  perde a artilharia perde o card na mesma hora, sem job nem migração —
--  uma tabela de conquistas exigiria recalcular e limpar a cada resultado,
--  e a primeira vez que falhasse ficava a mentir para sempre.
--
--  O que a base guarda é o que o cálculo NÃO consegue adivinhar:
--    - `primary_card`: qual dos cards o jogador quer exibir. É uma escolha
--      dele, não um facto derivável.
--    - `nickname`: o apelido que aparece no card.
--
--  Quem escolhe é o próprio jogador, com o PIN — o admin não escolhe cards
--  por ninguém; só pode LIMPAR uma escolha (foto/apelido impróprios ou um
--  card atribuído por engano), que é a correção prevista no pedido.
--
--  Se o card escolhido deixar de estar desbloqueado, o frontend mostra o
--  mais raro que o jogador tenha (ver `cardPrincipal` em src/lib/cards.js)
--  e a escolha fica guardada: se ele voltar a conquistá-lo, volta sozinho.
--  Por isso NÃO se valida aqui se o código do card existe — a base não
--  conhece o catálogo, e não deve conhecer.
-- =====================================================================

alter table players add column if not exists primary_card text;
alter table players add column if not exists nickname    text;

-- ---------- O JOGADOR ESCOLHE O SEU CARD ----------
-- `p_card` a null limpa a escolha (volta ao automático: o mais raro).
create or replace function set_my_primary_card(p_id uuid, p_pin text, p_card text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players p where p.id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  update players set primary_card = nullif(btrim(p_card), '') where id = p_id;
end; $$;

-- ---------- O JOGADOR ESCOLHE O SEU APELIDO ----------
-- Curto de propósito: é para caber no card, não para escrever uma frase.
create or replace function set_my_nickname(p_id uuid, p_pin text, p_nickname text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players; v text;
begin
  select * into r from players p where p.id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  v := nullif(btrim(p_nickname), '');
  if v is not null and char_length(v) > 18 then raise exception 'APELIDO'; end if;

  update players set nickname = v where id = p_id;
end; $$;

-- ---------- CORREÇÃO DO ADMIN ----------
-- Só limpa. O admin não escolhe o card de ninguém — se um apelido for
-- impróprio ou um card estiver errado, apaga-se e o jogador volta a escolher.
create or replace function admin_clear_card_choices(p_pw text, p_id uuid, p_card boolean, p_nickname boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update players set
    primary_card = case when coalesce(p_card, false)     then null else primary_card end,
    nickname     = case when coalesce(p_nickname, false) then null else nickname end
  where id = p_id;
  if not found then raise exception 'SEMJOGADOR'; end if;
end; $$;

-- ---------- AS COLUNAS NOVAS NAS LEITURAS ----------
-- `get_players` alimenta praticamente todos os ecrãs (via juntarEstatisticas),
-- por isso é por aqui que o apelido e o card escolhido chegam à app. Muda o
-- `returns table`, logo leva drop + create — como na 0015.
-- Corpo da 0015 + `primary_card` e `nickname`. A ordenação (média desc,
-- depois nome) fica como estava: há ecrãs que contam com ela.
drop function if exists get_players();

create function get_players()
returns table(
  id uuid, name text, dob date, photo_url text, avg numeric, votes bigint,
  player_type text, primary_position text, secondary_position text,
  accepts_other_positions boolean, position_status text,
  primary_card text, nickname text)
language sql security definer set search_path = public, extensions as $$
  select p.id, p.name, p.dob, p.photo_url,
         round(avg(r.score)::numeric, 2) as avg,
         count(r.score) as votes,
         p.player_type, p.primary_position, p.secondary_position,
         p.accepts_other_positions, p.position_status,
         p.primary_card, p.nickname
  from players p
  left join ratings r on r.target_id = p.id
  where p.approved
  group by p.id
  order by avg desc nulls last, p.name;
$$;

-- Corpo da 0015 tal e qual + as duas colunas novas no json. O `voted` é
-- "já não tem ninguém por avaliar", NÃO "já votou alguma vez" — trocar isso
-- mandava metade do grupo de volta ao ecrã de avaliações.
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
    'position_notice', r.position_notice,
    'primary_card', r.primary_card,
    'nickname', r.nickname
  );
end; $$;

-- ---------- PERMISSÕES ----------
grant execute on function set_my_primary_card(uuid, text, text)              to anon, authenticated;
grant execute on function set_my_nickname(uuid, text, text)                  to anon, authenticated;
grant execute on function admin_clear_card_choices(text, uuid, boolean, boolean) to anon, authenticated;
grant execute on function get_players()                                      to anon, authenticated;
grant execute on function login(text, text)                                  to anon, authenticated;
