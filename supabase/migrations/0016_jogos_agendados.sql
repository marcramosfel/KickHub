-- =====================================================================
--  PELADA BROWNS — Migração 16: jogos agendados, escalação e publicação
--
--  O próximo jogo deixa de ser um recado no grupo: passa a viver na base
--  de dados, com hora, local, escalação sorteada por posição e um botão
--  de publicar. Em vez de uma tabela paralela, ESTENDE `matches` — assim
--  registar o resultado no fim fecha o mesmo jogo que foi agendado, sem
--  duplicar linhas nem ter de ligar duas tabelas.
--
--  Ciclo de vida de uma linha de `matches`:
--    DRAFT → PUBLISHED → IN_PROGRESS → COMPLETED   (ou CANCELLED)
--  As rodadas que já lá estão são jogos passados: ficam COMPLETED pelo
--  default da coluna, sem tocar em nada.
--
--  Como `get_matches()`, `get_latest_match()` e `admin_pending_votes()`
--  liam TODAS as linhas de `matches`, são redefinidas no fim a filtrar
--  COMPLETED — senão o jogo de sábado aparecia no histórico, roubava os
--  "Campeões da semana" e apagava o painel de quem falta votar.
--
--  Mesmo modelo das anteriores: tabelas FECHADAS (RLS on, sem políticas),
--  acesso só por funções SECURITY DEFINER validadas no servidor.
--
--  Códigos de erro novos: JOGOFECHADO, JAPUBLICADO, SEMESCALACAO,
--  POSDUPLICADA, JOGADORDUP.
-- =====================================================================

-- ---------- COLUNAS NOVAS EM matches ----------
-- kickoff_at é a data+hora real do jogo. As rodadas antigas ficam com
-- null e continuam a usar played_at (que é NOT NULL desde a 0002).
alter table matches add column if not exists kickoff_at     timestamptz;
alter table matches add column if not exists location       text;
alter table matches add column if not exists map_url        text;
alter table matches add column if not exists status         text not null default 'COMPLETED';
alter table matches add column if not exists published_at   timestamptz;
alter table matches add column if not exists team_a_overall int;
alter table matches add column if not exists team_b_overall int;
alter table matches add column if not exists balance_pct    numeric;
alter table matches add column if not exists created_by     uuid references players(id) on delete set null;
alter table matches add column if not exists draw_seed      text; -- semente do sorteio, para o repetir tal e qual

-- CHECK idempotente: `add constraint` não tem "if not exists".
do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_status_chk' and conrelid = 'public.matches'::regclass
  ) then
    alter table matches add constraint matches_status_chk
      check (status in ('DRAFT','PUBLISHED','IN_PROGRESS','COMPLETED','CANCELLED'));
  end if;
end
$chk$;

-- ---------- ESCALAÇÃO SORTEADA ----------
-- overall_at_draw congela o overall no momento do sorteio: as estatísticas
-- mudam a cada rodada e o histórico de um jogo não pode mudar com elas.
create table if not exists match_lineup (
  match_id            uuid not null references matches(id) on delete cascade,
  player_id           uuid not null references players(id) on delete cascade,
  team                text not null check (team in ('A','B')),
  assigned_position   text not null check (assigned_position in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST')),
  preferred_position  text,
  was_out_of_position boolean not null default false,
  overall_at_draw     int,
  is_goalkeeper       boolean not null default false,
  created_at          timestamptz not null default now(),
  primary key (match_id, player_id)
);

alter table match_lineup enable row level security;

-- Dois jogadores no mesmo lugar da mesma equipa é sempre um bug: a rede
-- de segurança fica na base de dados, não só na validação da função.
create unique index if not exists match_lineup_slot_uidx
  on match_lineup (match_id, team, assigned_position);

-- O "próximo jogo" é lido em cada visita à Home.
create index if not exists matches_status_kickoff_idx on matches (status, kickoff_at);

-- ---------- AGENDAR / EDITAR O JOGO ----------
-- p_id = null cria um rascunho; senão atualiza. Um jogo já registado
-- (COMPLETED) ou cancelado não se reagenda — abre-se outro.
create or replace function admin_save_schedule(
  p_pw text, p_id uuid, p_kickoff timestamptz, p_location text, p_map_url text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_kickoff is null then raise exception 'DATA'; end if;

  if p_id is null then
    -- played_at é NOT NULL desde a 0002: deriva-se do kickoff no fuso da
    -- pelada, senão um jogo de sexta às 22h caía no dia seguinte em UTC.
    insert into matches(played_at, kickoff_at, location, map_url, status)
    values ((p_kickoff at time zone 'Europe/Lisbon')::date, p_kickoff,
            nullif(btrim(p_location), ''), nullif(btrim(p_map_url), ''), 'DRAFT')
    returning id into v_id;
    return v_id;
  end if;

  select m.status into v_status from matches m where m.id = p_id;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('DRAFT','PUBLISHED') then raise exception 'JOGOFECHADO'; end if;

  -- played_at acompanha sempre o kickoff: é ele que ordena o histórico
  -- quando o jogo for fechado com o resultado.
  update matches set
    kickoff_at = p_kickoff,
    played_at  = (p_kickoff at time zone 'Europe/Lisbon')::date,
    location   = nullif(btrim(p_location), ''),
    map_url    = nullif(btrim(p_map_url), '')
  where id = p_id;

  return p_id;
end; $$;

-- ---------- GRAVAR O SORTEIO ----------
-- p_lineup: [{player_id, team, assigned_position, preferred_position,
--             was_out_of_position, overall_at_draw, is_goalkeeper}]
-- Só em rascunho: um sorteio já publicado não se recalcula por baixo dos
-- jogadores que já o viram.
create or replace function admin_save_lineup(
  p_pw text, p_match uuid, p_lineup jsonb,
  p_a_overall int, p_b_overall int, p_balance numeric, p_seed text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text; r_row record;
  v_team text; v_pos text; v_player uuid;
  v_overall int; v_fora boolean; v_gk boolean;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status <> 'DRAFT' then raise exception 'JOGOFECHADO'; end if;

  if p_lineup is null or jsonb_typeof(p_lineup) <> 'array' or jsonb_array_length(p_lineup) = 0 then
    raise exception 'SEMESCALACAO';
  end if;

  -- Duas verificações antes de escrever: a base de dados também as garante
  -- (índice único e chave primária), mas assim o erro chega ao admin em
  -- português em vez de subir como 23505. O btrim tem de ser o mesmo que o
  -- do insert lá abaixo, senão ' abc' e 'abc' passavam aqui e só rebentavam
  -- no insert, com o erro cru.
  if exists (
    select 1 from jsonb_array_elements(p_lineup) as e(item)
    group by btrim(e.item->>'team'), btrim(e.item->>'assigned_position')
    having count(*) > 1
  ) then raise exception 'POSDUPLICADA'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_lineup) as e(item)
    group by btrim(e.item->>'player_id')
    having count(*) > 1
  ) then raise exception 'JOGADORDUP'; end if;

  delete from match_lineup where match_id = p_match;

  for r_row in select value from jsonb_array_elements(p_lineup) loop
    -- Os casts vão dentro de blocos próprios: sem eles, um id malformado ou
    -- um overall vazio sobem como 22P02 cru do Postgres, que o frontend não
    -- sabe traduzir (só reconhece os códigos em maiúsculas) e o admin via
    -- "invalid input syntax for uuid" em vez de saber o que corrigir.
    begin
      v_player := nullif(btrim(r_row.value->>'player_id'), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SEMJOGADOR';
    end;

    v_team := nullif(btrim(r_row.value->>'team'), '');
    v_pos  := nullif(btrim(r_row.value->>'assigned_position'), '');

    begin
      v_overall := nullif(btrim(r_row.value->>'overall_at_draw'), '')::int;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'STATS';
    end;

    begin
      v_fora := coalesce(nullif(btrim(r_row.value->>'was_out_of_position'), '')::boolean, false);
      v_gk   := coalesce(nullif(btrim(r_row.value->>'is_goalkeeper'), '')::boolean, false);
    exception when invalid_text_representation then
      raise exception 'INVALIDO';
    end;

    if v_player is null then raise exception 'SEMJOGADOR'; end if;
    -- Sem esta verificação a chave estrangeira rebentava com 23503, que chega
    -- ao ecrã como "erro de ligação" e não como "esse jogador já não existe".
    if not exists (select 1 from players p where p.id = v_player) then
      raise exception 'SEMJOGADOR';
    end if;
    if v_team is null or v_team not in ('A','B') then raise exception 'INVALIDO'; end if;
    if v_pos is null or v_pos not in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST') then
      raise exception 'POSINVALIDA';
    end if;

    insert into match_lineup(match_id, player_id, team, assigned_position,
                             preferred_position, was_out_of_position,
                             overall_at_draw, is_goalkeeper)
    values (p_match, v_player, v_team, v_pos,
            nullif(btrim(r_row.value->>'preferred_position'), ''),
            v_fora, v_overall, v_gk);
  end loop;

  update matches set
    team_a_overall = p_a_overall,
    team_b_overall = p_b_overall,
    balance_pct    = p_balance,
    draw_seed      = nullif(btrim(p_seed), '')
  where id = p_match;
end; $$;

-- ---------- JSON PÚBLICO DE UM JOGO ----------
-- Tudo o que a Home precisa de mostrar, incluindo a escalação já ordenada
-- pela formação (GK atrás → ST à frente) para o campo não ter de ordenar.
create or replace function match_public_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', m.id,
    'kickoff_at', m.kickoff_at,
    'played_at', m.played_at,
    'location', m.location,
    'map_url', m.map_url,
    'status', m.status,
    'published_at', m.published_at,
    'team_a_name', m.team_a_name,
    'team_b_name', m.team_b_name,
    'team_a_overall', m.team_a_overall,
    'team_b_overall', m.team_b_overall,
    'balance_pct', m.balance_pct,
    'score_a', m.score_a,
    'score_b', m.score_b,
    'lineup', (
      select coalesce(json_agg(json_build_object(
               'player_id', l.player_id, 'name', p.name, 'photo', p.photo_url,
               'team', l.team,
               'assigned_position', l.assigned_position,
               'preferred_position', l.preferred_position,
               'was_out_of_position', l.was_out_of_position,
               'overall_at_draw', l.overall_at_draw,
               'is_goalkeeper', l.is_goalkeeper)
             order by l.team,
                      case l.assigned_position
                        when 'GK'    then 1
                        when 'DEF-L' then 2
                        when 'DEF-R' then 3
                        when 'MID-L' then 4
                        when 'MID-C' then 5
                        when 'MID-R' then 6
                        when 'ST'    then 7
                        else 8
                      end,
                      p.name), '[]'::json)
      from match_lineup l join players p on p.id = l.player_id
      where l.match_id = m.id)
  )
  from matches m where m.id = p_id;
$$;

-- ---------- PUBLICAR ----------
-- Publicar é irreversível de propósito: a partir daqui os jogadores já
-- viram as equipas. Só de DRAFT e só com escalação gravada.
create or replace function admin_publish_match(p_pw text, p_match uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status <> 'DRAFT' then raise exception 'JAPUBLICADO'; end if;
  if not exists (select 1 from match_lineup l where l.match_id = p_match) then
    raise exception 'SEMESCALACAO';
  end if;

  update matches set status = 'PUBLISHED', published_at = now() where id = p_match;

  return match_public_json(p_match);
end; $$;

-- ---------- O PRÓXIMO JOGO (público) ----------
-- Preferência para o jogo futuro mais próximo. Se já todos passaram,
-- devolve o mais recente: durante e depois da pelada a Home continua a
-- mostrá-lo ("Aguardando resultado") até o admin registar o placar, o
-- que o passa a COMPLETED e o tira daqui.
create or replace function get_next_match()
returns json language sql stable security definer set search_path = public, extensions as $$
  with elegiveis as (
    -- Sem kickoff_at (rodada antiga reaberta) vale a meia-noite de Lisboa:
    -- `played_at::timestamptz` usaria o fuso da sessão, que no Supabase é UTC,
    -- e um jogo mudava de lado do `now()` conforme quem pergunta.
    select m.id,
           coalesce(m.kickoff_at, m.played_at::timestamp at time zone 'Europe/Lisbon') as quando
    from matches m
    where m.status in ('PUBLISHED','IN_PROGRESS')
  )
  select match_public_json(e.id)
  from elegiveis e
  order by (e.quando < now()),                                  -- futuros primeiro
           case when e.quando >= now() then e.quando end asc,   -- o mais próximo
           e.quando desc                                        -- ou o mais recente
  limit 1;
$$;

-- ---------- AGENDA DO ADMIN ----------
create or replace function admin_matches_upcoming(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (
    select coalesce(json_agg(match_public_json(t.id) order by t.quando, t.created_at), '[]'::json)
    from (
      select m.id,
             coalesce(m.kickoff_at, m.played_at::timestamp at time zone 'Europe/Lisbon') as quando,
             m.created_at
      from matches m
      where m.status in ('DRAFT','PUBLISHED','IN_PROGRESS')
    ) t
  );
end; $$;

-- Mudar o estado à mão (ex.: marcar IN_PROGRESS ou CANCELLED).
create or replace function admin_set_match_status(p_pw text, p_match uuid, p_status text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_status is null or p_status not in ('DRAFT','PUBLISHED','IN_PROGRESS','COMPLETED','CANCELLED') then
    raise exception 'INVALIDO';
  end if;

  update matches set
    status = p_status,
    -- publicar por aqui também carimba a hora, mas nunca a reescreve
    published_at = case when p_status = 'PUBLISHED' then coalesce(published_at, now())
                        else published_at end
  where id = p_match;
  if not found then raise exception 'INVALIDO'; end if;
end; $$;

-- Apagar só o que ainda não é história: já se apagou uma rodada real por
-- engano neste projeto e não volta a acontecer por esta porta.
create or replace function admin_delete_schedule(p_pw text, p_match uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('DRAFT','CANCELLED') then raise exception 'JOGOFECHADO'; end if;

  -- Segunda tranca, e é a que interessa: o status sozinho não protege nada,
  -- porque admin_set_match_status deixa marcar QUALQUER jogo como CANCELLED —
  -- duas chamadas e uma rodada real passava por aqui, levando gols,
  -- assistências, votos e defesas atrás por cascade. Se há resultado ou votos
  -- registados, isto é história e não se apaga por esta porta.
  if exists (select 1 from match_stats s where s.match_id = p_match)
     or exists (select 1 from award_votes v where v.match_id = p_match) then
    raise exception 'JOGOFECHADO';
  end if;

  delete from matches where id = p_match;
end; $$;

-- =====================================================================
--  NÃO PARTIR O QUE JÁ EXISTE
--  Tudo o que dizia "a rodada mais recente" contava com que cada linha de
--  `matches` fosse um jogo já jogado. Com jogos agendados na mesma tabela,
--  as funções seguintes levam uma única mudança cada: passam a ver só
--  COMPLETED. E registar o resultado fecha o jogo que estava agendado.
-- =====================================================================

-- Todas as rodadas JOGADAS (recente → antiga), SEM as fotos grandes.
create or replace function get_matches()
returns json language sql security definer set search_path = public, extensions as $$
  select coalesce(json_agg(match_json(m.id, false) order by m.played_at desc, m.created_at desc), '[]'::json)
  from matches m
  where m.status = 'COMPLETED';
$$;

-- A rodada jogada mais recente, COM fotos (destaque "Campeões da semana").
create or replace function get_latest_match()
returns json language sql security definer set search_path = public, extensions as $$
  select match_json(m.id, true)
  from matches m
  where m.status = 'COMPLETED'
  order by m.played_at desc, m.created_at desc limit 1;
$$;

-- Painel "quem falta votar" (0011): a rodada de referência tem de ser a
-- última JOGADA — senão o jogo de sábado que ainda nem começou roubava o
-- lugar e o admin deixava de ver quem falta votar na rodada anterior.
-- Corpo igual ao da 0011, mais o filtro nessa procura.
create or replace function admin_pending_votes(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_match uuid; v_played date; v_total int; v_voted int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  -- rodada jogada mais recente (se houver)
  select m.id, m.played_at into v_match, v_played
  from matches m
  where m.status = 'COMPLETED'
  order by m.played_at desc, m.created_at desc limit 1;

  if v_match is not null then
    select count(*) into v_total from match_stats where match_id = v_match;
    select count(*) into v_voted from award_votes where match_id = v_match;
  end if;

  return json_build_object(
    'match', case when v_match is null then null else json_build_object(
      'id', v_match, 'played_at', v_played, 'total', v_total, 'voted', v_voted
    ) end,

    -- 1) jogaram a última rodada mas ainda não votaram craque/bagre
    'award_pending', (
      select coalesce(json_agg(json_build_object(
               'id', p.id, 'name', p.name, 'user_id', p.user_id) order by p.name), '[]'::json)
      from match_stats ms
      join players p on p.id = ms.player_id
      where ms.match_id = v_match
        and not exists (
          select 1 from award_votes av
          where av.match_id = v_match and av.voter_id = ms.player_id
        )
    ),

    -- 2) ainda têm notas por dar (e quantas faltam)
    'ratings_pending', (
      select coalesce(json_agg(t order by t.faltam desc, t.name), '[]'::json)
      from (
        select me.id, me.name, me.user_id, count(*)::int as faltam
        from players me
        join players outro
          on outro.approved and outro.id <> me.id
         and not exists (
           select 1 from ratings r
           where r.rater_id = me.id and r.target_id = outro.id
         )
        where me.approved
        group by me.id, me.name, me.user_id
      ) t
    )
  );
end; $$;

-- Registar o resultado fecha o jogo: se a linha vinha de um agendamento
-- (DRAFT/PUBLISHED), o status passa a COMPLETED e ela entra no histórico.
-- Corpo igual ao da 0010, mais essa linha no update.
create or replace function admin_save_match(
  p_pw text, p_id uuid, p_played_at date,
  p_team_a_name text, p_team_b_name text,
  p_score_a int, p_score_b int,
  p_winner_photo text, p_location_photo text, p_notes text,
  p_stats jsonb
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_match uuid; r_row record; v_goals int; v_assists int; v_team text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_played_at is null then raise exception 'DATA'; end if;
  if p_stats is null or jsonb_array_length(p_stats) < 3 then raise exception 'JOGADORES'; end if;
  if coalesce(p_score_a,0) < 0 or coalesce(p_score_a,0) > 99
     or coalesce(p_score_b,0) < 0 or coalesce(p_score_b,0) > 99 then raise exception 'PLACAR'; end if;

  if p_id is null then
    insert into matches(played_at, team_a_name, team_b_name, score_a, score_b, winner_photo, location_photo, notes)
    values (p_played_at, coalesce(nullif(btrim(p_team_a_name),''),'Amarelos'),
            coalesce(nullif(btrim(p_team_b_name),''),'Azuis'),
            coalesce(p_score_a,0), coalesce(p_score_b,0),
            nullif(p_winner_photo,''), nullif(p_location_photo,''), nullif(btrim(p_notes),''))
    returning id into v_match;
  else
    v_match := p_id;
    update matches set
      played_at = p_played_at,
      team_a_name = coalesce(nullif(btrim(p_team_a_name),''),'Amarelos'),
      team_b_name = coalesce(nullif(btrim(p_team_b_name),''),'Azuis'),
      score_a = coalesce(p_score_a,0), score_b = coalesce(p_score_b,0),
      winner_photo = nullif(p_winner_photo,''),
      location_photo = nullif(p_location_photo,''),
      notes = nullif(btrim(p_notes),''),
      status = 'COMPLETED'
    where id = v_match;
    if not found then raise exception 'INVALIDO'; end if;
    delete from match_stats where match_id = v_match;
  end if;

  for r_row in select value from jsonb_array_elements(p_stats) loop
    v_goals   := coalesce((r_row.value->>'goals')::int, 0);
    v_assists := coalesce((r_row.value->>'assists')::int, 0);
    v_team    := nullif(r_row.value->>'team', '');
    if v_goals < 0 or v_goals > 99 or v_assists < 0 or v_assists > 99 then raise exception 'STATS'; end if;
    if v_team is not null and v_team not in ('A','B') then raise exception 'STATS'; end if;
    insert into match_stats(match_id, player_id, team, goals, assists)
    values (v_match, (r_row.value->>'player_id')::uuid, v_team, v_goals, v_assists);
  end loop;

  return v_match;
end; $$;

-- ---------- PERMISSÕES ----------
grant execute on function admin_save_schedule(text, uuid, timestamptz, text, text)          to anon, authenticated;
grant execute on function admin_save_lineup(text, uuid, jsonb, int, int, numeric, text)     to anon, authenticated;
grant execute on function admin_publish_match(text, uuid)                                   to anon, authenticated;
grant execute on function match_public_json(uuid)                                           to anon, authenticated;
grant execute on function get_next_match()                                                  to anon, authenticated;
grant execute on function admin_matches_upcoming(text)                                      to anon, authenticated;
grant execute on function admin_set_match_status(text, uuid, text)                          to anon, authenticated;
grant execute on function admin_delete_schedule(text, uuid)                                 to anon, authenticated;
grant execute on function get_matches()                                                     to anon, authenticated;
grant execute on function get_latest_match()                                                to anon, authenticated;
grant execute on function admin_pending_votes(text)                                         to anon, authenticated;
grant execute on function admin_save_match(text, uuid, date, text, text, int, int, text, text, text, jsonb) to anon, authenticated;
