-- =====================================================================
--  PELADA EQUILIBRADA — Migração 2: estatísticas, craque & bagre
--  Mesmo modelo da 0001: tabelas FECHADAS (RLS on, sem políticas),
--  acesso apenas via funções SECURITY DEFINER validadas no servidor.
-- =====================================================================

-- ---------- TABELAS ----------

-- Uma rodada (jogo) registada pelo admin depois da pelada
create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  played_at  date not null,
  created_at timestamptz not null default now()
);

-- Quem jogou nessa rodada, com gols e assistências
create table if not exists match_stats (
  match_id   uuid not null references matches(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  goals      int not null default 0 check (goals between 0 and 99),
  assists    int not null default 0 check (assists between 0 and 99),
  primary key (match_id, player_id)
);

-- Voto de craque + bagre da rodada (um voto por jogador por rodada)
create table if not exists award_votes (
  match_id   uuid not null references matches(id) on delete cascade,
  voter_id   uuid not null references players(id) on delete cascade,
  craque_id  uuid not null references players(id) on delete cascade,
  bagre_id   uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, voter_id)
);

-- ---------- FECHAR AS TABELAS ----------
alter table matches     enable row level security;
alter table match_stats enable row level security;
alter table award_votes enable row level security;

-- ---------- FUNÇÕES ----------

-- Admin regista um jogo: data + lista [{player_id, goals, assists}] de quem jogou
create or replace function admin_add_match(p_pw text, p_played_at date, p_stats jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_match uuid; r_row record; v_goals int; v_assists int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_played_at is null then raise exception 'DATA'; end if;
  -- mínimo 3: com 2 jogadores a votação de craque/bagre seria impossível
  -- (não podes votar em ti e o craque tem de ser diferente do bagre)
  if p_stats is null or jsonb_array_length(p_stats) < 3 then raise exception 'JOGADORES'; end if;
  insert into matches(played_at) values (p_played_at) returning id into v_match;
  for r_row in select value from jsonb_array_elements(p_stats) loop
    v_goals   := coalesce((r_row.value->>'goals')::int, 0);
    v_assists := coalesce((r_row.value->>'assists')::int, 0);
    if v_goals < 0 or v_goals > 99 or v_assists < 0 or v_assists > 99 then raise exception 'STATS'; end if;
    insert into match_stats(match_id, player_id, goals, assists)
    values (v_match, (r_row.value->>'player_id')::uuid, v_goals, v_assists);
  end loop;
  return v_match;
end; $$;

-- Admin apaga uma rodada (leva junto stats e votos, por cascade)
create or replace function admin_delete_match(p_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from matches where id = p_id;
end; $$;

-- Voto no craque e no bagre de uma rodada.
-- Regras: só quem jogou pode votar; craque/bagre têm de ter jogado;
-- não podes votar em ti; craque <> bagre; um voto por rodada.
create or replace function vote_award(p_voter uuid, p_pin text, p_match uuid, p_craque uuid, p_bagre uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players where id = p_voter;
  -- p_pin is null: crypt() é STRICT e devolveria NULL, e um IF com condição
  -- NULL não dispara — sem este guard o PIN seria contornável com pin nulo
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  if not exists(select 1 from match_stats where match_id = p_match and player_id = p_voter) then raise exception 'NAOJOGOU'; end if;
  if p_craque = p_voter or p_bagre = p_voter then raise exception 'PROPRIO'; end if;
  if p_craque = p_bagre then raise exception 'IGUAL'; end if;
  if not exists(select 1 from match_stats where match_id = p_match and player_id = p_craque)
     or not exists(select 1 from match_stats where match_id = p_match and player_id = p_bagre) then raise exception 'INVALIDO'; end if;
  if exists(select 1 from award_votes where match_id = p_match and voter_id = p_voter) then raise exception 'VOTOFEITO'; end if;
  insert into award_votes(match_id, voter_id, craque_id, bagre_id) values (p_match, p_voter, p_craque, p_bagre);
end; $$;

-- Rodadas em que este jogador já votou (para a app saber o que falta)
create or replace function get_my_award_votes(p_voter uuid, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v json;
begin
  select * into r from players where id = p_voter;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  select coalesce(json_agg(match_id), '[]'::json) into v from award_votes where voter_id = p_voter;
  return v;
end; $$;

-- Lista de rodadas (mais recente primeiro) com stats e contagens de votos
create or replace function get_matches()
returns json language sql security definer set search_path = public, extensions as $$
  select coalesce(json_agg(row_to_json(m) order by m.played_at desc, m.created_at desc), '[]'::json)
  from (
    select mt.id, mt.played_at, mt.created_at,
      (select coalesce(json_agg(json_build_object(
                'player_id', ms.player_id, 'name', p.name, 'photo', p.photo_url,
                'goals', ms.goals, 'assists', ms.assists)
              order by ms.goals desc, ms.assists desc, p.name), '[]'::json)
         from match_stats ms join players p on p.id = ms.player_id
        where ms.match_id = mt.id) as players,
      (select count(*)::int from award_votes av where av.match_id = mt.id) as votes,
      (select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
                order by t.n desc, t.nome), '[]'::json)
         from (select av.craque_id as pid, p.name as nome, count(*)::int as n
                 from award_votes av join players p on p.id = av.craque_id
                where av.match_id = mt.id group by av.craque_id, p.name) t) as craque,
      (select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
                order by t.n desc, t.nome), '[]'::json)
         from (select av.bagre_id as pid, p.name as nome, count(*)::int as n
                 from award_votes av join players p on p.id = av.bagre_id
                where av.match_id = mt.id group by av.bagre_id, p.name) t) as bagre
    from matches mt
  ) m;
$$;

-- Totais por jogador aprovado: jogos, gols, assistências e títulos de
-- craque/bagre da rodada (empate no topo conta para todos os empatados)
create or replace function get_player_stats()
returns json language sql security definer set search_path = public, extensions as $$
  with craque_t as (
    select match_id, craque_id as player_id, count(*) as n
    from award_votes group by match_id, craque_id
  ), craque_w as (
    select player_id, count(*) as wins from craque_t t
    where t.n = (select max(n) from craque_t t2 where t2.match_id = t.match_id)
    group by player_id
  ), bagre_t as (
    select match_id, bagre_id as player_id, count(*) as n
    from award_votes group by match_id, bagre_id
  ), bagre_w as (
    select player_id, count(*) as wins from bagre_t t
    where t.n = (select max(n) from bagre_t t2 where t2.match_id = t.match_id)
    group by player_id
  ), totals as (
    select player_id, count(*) as matches, sum(goals) as goals, sum(assists) as assists
    from match_stats group by player_id
  )
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'name', p.name, 'photo', p.photo_url,
           'matches', coalesce(t.matches, 0),
           'goals',   coalesce(t.goals, 0),
           'assists', coalesce(t.assists, 0),
           'craques', coalesce(cw.wins, 0),
           'bagres',  coalesce(bw.wins, 0))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t    on t.player_id  = p.id
  left join craque_w cw on cw.player_id = p.id
  left join bagre_w bw  on bw.player_id = p.id
  where p.approved;
$$;

-- ---------- PERMISSÕES ----------
grant execute on function admin_add_match(text,date,jsonb)     to anon, authenticated;
grant execute on function admin_delete_match(text,uuid)        to anon, authenticated;
grant execute on function vote_award(uuid,text,uuid,uuid,uuid) to anon, authenticated;
grant execute on function get_my_award_votes(uuid,text)        to anon, authenticated;
grant execute on function get_matches()                        to anon, authenticated;
grant execute on function get_player_stats()                   to anon, authenticated;
