-- =====================================================================
--  PELADA BROWNS — Migração 24: formato do jogo e rodízio de goleiro
--
--  Até aqui só havia um formato possível: 2 goleiros fixos + 12 de campo.
--  Quando no dia não havia dois goleiros, o admin tinha de marcar dois
--  jogadores de linha como goleiros — e o overall de baliza deles (outra
--  escala) entrava na força da equipa. A alternativa era o rachão, onde o
--  goleiro saía à sorte.
--
--  Esta migração dá ao jogo um FORMATO explícito:
--
--    FIXED     — o de sempre: 2 goleiros + (2 × tamanho − 2) de campo.
--    ROTATING  — toda a gente joga na linha; um por equipa começa no gol
--                e a baliza roda durante a partida.
--
--  No modo ROTATING o equilíbrio é calculado SEM olhar a quem vai ao gol
--  (é o motor de sorteio que garante isso — src/lib/drawEngine.js) e só
--  depois se escolhe quem começa, por justiça: quem foi menos vezes, há
--  mais tempo, e que aceite ir à baliza.
--
--  `match_lineup.gk_order` guarda essa ordem (1 = começa no gol). Guardá-la
--  é o que torna o rodízio reproduzível: o histórico de quem foi ao gol
--  muda com o tempo, a ordem gravada não.
--
--  Aditiva e idempotente. Nada muda nos jogos existentes: o default de
--  `gk_mode` é 'FIXED' e `gk_order` fica nulo.
--
--  Códigos de erro novos: FORMATOINVALIDO, TAMANHOEQUIPA, ORDEMRODIZIO.
-- =====================================================================

-- ---------- 1. FORMATO DO JOGO ----------

alter table matches add column if not exists gk_mode   text not null default 'FIXED';
alter table matches add column if not exists team_size int  not null default 7;
alter table matches add column if not exists gk_rotation_minutes int;

do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_gk_mode_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_gk_mode_chk
      check (gk_mode in ('FIXED','ROTATING'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_team_size_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_team_size_chk
      check (team_size between 5 and 8);
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_gk_rotation_minutes_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_gk_rotation_minutes_chk
      check (gk_rotation_minutes is null or gk_rotation_minutes between 1 and 120);
  end if;
end
$chk$;

-- ---------- 2. ORDEM DO RODÍZIO ----------
-- 1 = inicia no gol, 2 = entra a seguir, … ; null no formato FIXED.
alter table match_lineup add column if not exists gk_order int;

do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'match_lineup_gk_order_chk' and conrelid = 'public.match_lineup'::regclass) then
    alter table match_lineup add constraint match_lineup_gk_order_chk
      check (gk_order is null or gk_order between 1 and 8);
  end if;
end
$chk$;

-- Duas pessoas na mesma vez do rodízio da mesma equipa é sempre um bug —
-- a rede de segurança fica na base, como já acontece com os lugares.
create unique index if not exists match_lineup_gk_order_uidx
  on match_lineup (match_id, team, gk_order) where gk_order is not null;

-- ---------- 3. QUEM ACEITA IR À BALIZA ----------
-- Diferente de `accepts_other_positions`, que é sobre lugares de CAMPO.
-- Aqui é só: "aceitas ir ao gol quando o rodízio te calhar?"
alter table players add column if not exists gk_rotation_ok boolean not null default true;

-- ---------- 4. HISTÓRICO DE QUEM COMEÇOU NO GOL ----------
-- Não é tabela nova: deriva-se de match_lineup. Só falta o índice que
-- torna a pergunta "quantas vezes o João começou no gol?" barata.
create index if not exists match_lineup_gk_starts_idx
  on match_lineup (player_id) where is_goalkeeper;

-- ---------- 5. AGENDAR COM FORMATO ----------
-- Parâmetros novos, todos com default: as chamadas antigas continuam a
-- funcionar exatamente como antes (e criam jogos FIXED de 7, como hoje).
--
-- O DROP não é decoração: acrescentar parâmetros não substitui a função,
-- cria uma SEGUNDA com outra assinatura. As duas a coexistir tornam
-- ambígua qualquer chamada com os 5 argumentos antigos e o PostgREST
-- devolve PGRST203 — que a app mostraria como "erro de ligação".
drop function if exists admin_save_schedule(text, uuid, timestamptz, text, text);

create or replace function admin_save_schedule(
  p_pw text, p_id uuid, p_kickoff timestamptz, p_location text, p_map_url text,
  p_gk_mode text default null,
  p_team_size int default null,
  p_gk_rotation_minutes int default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_status text; v_mode text; v_size int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_kickoff is null then raise exception 'DATA'; end if;

  v_mode := coalesce(nullif(btrim(p_gk_mode), ''), 'FIXED');
  if v_mode not in ('FIXED','ROTATING') then raise exception 'FORMATOINVALIDO'; end if;
  v_size := coalesce(p_team_size, 7);
  if v_size < 5 or v_size > 8 then raise exception 'TAMANHOEQUIPA'; end if;

  if p_id is null then
    insert into matches(played_at, kickoff_at, location, map_url, status,
                        gk_mode, team_size, gk_rotation_minutes)
    values ((p_kickoff at time zone 'Europe/Lisbon')::date, p_kickoff,
            nullif(btrim(p_location), ''), nullif(btrim(p_map_url), ''), 'DRAFT',
            v_mode, v_size, p_gk_rotation_minutes)
    returning id into v_id;
    return v_id;
  end if;

  select m.status into v_status from matches m where m.id = p_id;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('DRAFT','PUBLISHED') then raise exception 'JOGOFECHADO'; end if;

  -- O formato só se muda enquanto o sorteio não foi publicado: depois disso
  -- as equipas já estão no telemóvel de toda a gente.
  if v_status <> 'DRAFT'
     and exists (select 1 from matches m
                  where m.id = p_id
                    and (m.gk_mode <> v_mode or m.team_size <> v_size)) then
    raise exception 'JAPUBLICADO';
  end if;

  update matches set
    played_at  = (p_kickoff at time zone 'Europe/Lisbon')::date,
    kickoff_at = p_kickoff,
    location   = nullif(btrim(p_location), ''),
    map_url    = nullif(btrim(p_map_url), ''),
    gk_mode    = v_mode,
    team_size  = v_size,
    gk_rotation_minutes = p_gk_rotation_minutes
  where id = p_id;

  return p_id;
end; $$;

-- ---------- 6. GRAVAR A ESCALAÇÃO COM O RODÍZIO ----------
-- A assinatura não muda: `gk_order` vem dentro de cada linha do p_lineup,
-- como as outras chaves. Validações novas:
--   ROTATING → cada equipa tem de trazer a ordem completa 1..team_size,
--              sem buracos e sem repetições (o índice único apanha as
--              repetições; os buracos só se apanham contando).
--   FIXED    → gk_order tem de vir nulo, senão a UI mostrava um rodízio
--              que não existe.
create or replace function admin_save_lineup(
  p_pw text, p_match uuid, p_lineup jsonb,
  p_a_overall int, p_b_overall int, p_balance numeric, p_seed text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text; v_mode text; v_size int;
  r_row record;
  v_player uuid; v_team text; v_pos text; v_overall int;
  v_fora boolean; v_gk boolean; v_ordem int;
  v_lado text; v_n int; v_max int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.gk_mode, m.team_size into v_status, v_mode, v_size
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_status <> 'DRAFT' then raise exception 'JOGOFECHADO'; end if;

  if p_lineup is null or jsonb_typeof(p_lineup) <> 'array' or jsonb_array_length(p_lineup) = 0 then
    raise exception 'SEMESCALACAO';
  end if;

  -- As duas verificações da 0016, mantidas tal e qual: a base também as
  -- garante (índice único e chave primária), mas assim o erro chega ao
  -- admin em português em vez de subir como 23505.
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
    begin
      v_player := nullif(btrim(r_row.value->>'player_id'), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SEMJOGADOR';
    end;

    v_team := nullif(btrim(r_row.value->>'team'), '');
    v_pos  := nullif(btrim(r_row.value->>'assigned_position'), '');

    begin
      v_overall := nullif(btrim(r_row.value->>'overall_at_draw'), '')::int;
      v_ordem   := nullif(btrim(r_row.value->>'gk_order'), '')::int;
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
    if not exists (select 1 from players p where p.id = v_player) then
      raise exception 'SEMJOGADOR';
    end if;
    if v_team is null or v_team not in ('A','B') then raise exception 'INVALIDO'; end if;
    if v_pos is null or v_pos not in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST') then
      raise exception 'POSINVALIDA';
    end if;
    if v_mode = 'FIXED' and v_ordem is not null then raise exception 'ORDEMRODIZIO'; end if;
    if v_mode = 'ROTATING' and v_ordem is null then raise exception 'ORDEMRODIZIO'; end if;

    insert into match_lineup(match_id, player_id, team, assigned_position,
                             preferred_position, was_out_of_position,
                             overall_at_draw, is_goalkeeper, gk_order)
    values (p_match, v_player, v_team, v_pos,
            nullif(btrim(r_row.value->>'preferred_position'), ''),
            v_fora, v_overall, v_gk, v_ordem);
  end loop;

  -- A ordem tem de cobrir 1..N em cada equipa. Contar e comparar com o
  -- máximo apanha buracos ("1,2,4") que o índice único deixa passar.
  if v_mode = 'ROTATING' then
    foreach v_lado in array array['A','B'] loop
      select count(*), coalesce(max(l.gk_order), 0) into v_n, v_max
      from match_lineup l where l.match_id = p_match and l.team = v_lado;
      if v_n <> v_size or v_max <> v_size then raise exception 'ORDEMRODIZIO'; end if;
      if exists (select 1 from match_lineup l
                  where l.match_id = p_match and l.team = v_lado and l.gk_order is null) then
        raise exception 'ORDEMRODIZIO';
      end if;
    end loop;
  end if;

  update matches set
    team_a_overall = p_a_overall,
    team_b_overall = p_b_overall,
    balance_pct    = p_balance,
    draw_seed      = nullif(btrim(p_seed), '')
  where id = p_match;
end; $$;

-- ---------- 7. TROCAS E DESISTÊNCIAS NÃO PODEM PARTIR O RODÍZIO ----------
--
-- `admin_substitute_player` (0018/0021) faz UPDATE da linha: troca o
-- player_id e o `gk_order` fica onde estava — quem entra herda a vez de
-- quem saiu, que é exatamente o que se quer.
--
-- `admin_swap_players` e `admin_undo_swap` (0021), esses, APAGAM as duas
-- linhas e reinserem-nas com as colunas listadas à mão. Como não conhecem
-- esta coluna, o `gk_order` saía nulo e a ordem da equipa ficava com um
-- buraco — a timeline do rodízio perdia uma vez.
--
-- Em vez de reescrever essas duas funções inteiras (e passar a ter duas
-- cópias do mesmo corpo a divergir com o tempo), o preenchimento fica num
-- trigger: qualquer INSERT sem `gk_order` num jogo ROTATING recebe o
-- número livre mais baixo da sua equipa. Numa troca entre equipas, o
-- número livre de cada lado é precisamente o que o jogador que saiu
-- libertou — a ordem fica completa sem ninguém ter de a recalcular.
create or replace function preencher_gk_order()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_mode text; v_livre int;
begin
  if new.gk_order is not null then return new; end if;

  select m.gk_mode into v_mode from matches m where m.id = new.match_id;
  if v_mode is distinct from 'ROTATING' then return new; end if;

  select min(n) into v_livre
  from generate_series(1, 8) n
  where not exists (select 1 from match_lineup l
                     where l.match_id = new.match_id
                       and l.team = new.team
                       and l.gk_order = n);
  new.gk_order := v_livre;
  return new;
end; $$;

drop trigger if exists match_lineup_gk_order_trg on match_lineup;
create trigger match_lineup_gk_order_trg
  before insert on match_lineup
  for each row execute function preencher_gk_order();

-- Reparação manual, para o caso de uma escalação antiga ficar inconsistente.
-- Renumera 1..N por equipa e faz `is_goalkeeper` seguir a vez nº 1.
create or replace function corrigir_ordem_rodizio(p_match uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_mode text; v_lado text;
begin
  select m.gk_mode into v_mode from matches m where m.id = p_match;
  if v_mode is distinct from 'ROTATING' then return; end if;

  foreach v_lado in array array['A','B'] loop
    -- Os números têm de sair todos do caminho antes de voltarem a entrar:
    -- o índice único é verificado linha a linha, e renumerar por cima
    -- colidia a meio (dois jogadores com a vez 2 por um instante).
    update match_lineup set gk_order = null
     where match_id = p_match and team = v_lado;

    with ordenados as (
      select l.player_id,
             row_number() over (order by p.name) as nova
      from match_lineup l join players p on p.id = l.player_id
      where l.match_id = p_match and l.team = v_lado
    )
    update match_lineup l set gk_order = o.nova
    from ordenados o
    where l.match_id = p_match and l.team = v_lado and l.player_id = o.player_id;
  end loop;

  update match_lineup l
     set is_goalkeeper = (l.gk_order = 1)
   where l.match_id = p_match;
end; $$;

-- ---------- 8. AS LEITURAS PASSAM A CONTAR O FORMATO ----------
-- match_public_json (0023) + formato, minutos de rodízio e gk_order em
-- cada linha da escalação. O resto é igual, chave a chave.
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
    'result_status', m.result_status,
    'result_published_at', m.result_published_at,
    'cancelled_at', m.cancelled_at,
    'cancel_reason', m.cancel_reason,
    'team_a_name', m.team_a_name,
    'team_b_name', m.team_b_name,
    'team_a_overall', m.team_a_overall,
    'team_b_overall', m.team_b_overall,
    'balance_pct', m.balance_pct,
    'score_a', m.score_a,
    'score_b', m.score_b,
    'notes', m.notes,
    'craque_override', m.craque_override,
    'bagre_override', m.bagre_override,
    'overall_version', m.overall_version,
    'gk_mode', m.gk_mode,
    'team_size', m.team_size,
    'gk_rotation_minutes', m.gk_rotation_minutes,
    'post_rating_status', m.post_rating_status,
    'post_rating_opened_at', m.post_rating_opened_at,
    'post_rating_closed_at', m.post_rating_closed_at,
    'post_rating_voters', (
      select count(distinct pr.rater_id)::int from post_match_ratings pr where pr.match_id = m.id),
    'post_rating_total', (
      select count(*)::int from post_match_ratings pr where pr.match_id = m.id),
    'lineup', (
      select coalesce(json_agg(json_build_object(
               'player_id', l.player_id, 'name', p.name, 'photo', p.photo_url,
               'team', l.team,
               'assigned_position', l.assigned_position,
               'preferred_position', l.preferred_position,
               'was_out_of_position', l.was_out_of_position,
               'overall_at_draw', l.overall_at_draw,
               'is_goalkeeper', l.is_goalkeeper,
               'gk_order', l.gk_order,
               'substitute_for', sub.out_name,
               'substitute_for_id', sub.out_id)
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
      from match_lineup l
      join players p on p.id = l.player_id
      left join lateral (
        select po.id as out_id, po.name as out_name
        from match_substitutions s
        join players po on po.id = s.out_player_id
        where s.match_id = m.id and s.in_player_id = l.player_id
        order by s.created_at desc
        limit 1
      ) sub on true
      where l.match_id = m.id),
    'substitutions', (
      select coalesce(json_agg(json_build_object(
               'id', s.id,
               'kind', s.kind,
               'out_player_id', s.out_player_id, 'out_name', po.name, 'out_photo', po.photo_url,
               'in_player_id', s.in_player_id, 'in_name', pi.name, 'in_photo', pi.photo_url,
               'team', s.team,
               'assigned_position', s.assigned_position,
               'is_goalkeeper', s.is_goalkeeper,
               'out_overall', s.out_overall,
               'in_overall', s.in_overall,
               'reason', s.reason,
               'created_at', s.created_at)
             order by s.created_at), '[]'::json)
      from match_substitutions s
      join players po on po.id = s.out_player_id
      join players pi on pi.id = s.in_player_id
      where s.match_id = m.id),
    'swaps', (
      select coalesce(json_agg(json_build_object(
               'id', x.id,
               'a_player_id', x.a_player_id, 'a_name', pa.name, 'a_photo', pa.photo_url,
               'b_player_id', x.b_player_id, 'b_name', pb.name, 'b_photo', pb.photo_url,
               'a_team', x.a_team, 'b_team', x.b_team,
               'a_position', x.a_position, 'b_position', x.b_position,
               'is_goalkeeper', x.is_goalkeeper,
               'a_overall', x.a_overall, 'b_overall', x.b_overall,
               'reason', x.reason,
               'created_at', x.created_at)
             order by x.created_at), '[]'::json)
      from match_swaps x
      join players pa on pa.id = x.a_player_id
      join players pb on pb.id = x.b_player_id
      where x.match_id = m.id),
    'media', (
      select coalesce(json_agg(json_build_object(
               'id', md.id, 'data_url', md.data_url, 'kind', md.kind,
               'is_primary', md.is_primary)
             order by md.is_primary desc, md.created_at), '[]'::json)
      from match_media md where md.match_id = m.id),
    'stats', (
      select coalesce(json_agg(json_build_object(
               'player_id', ms.player_id, 'name', p.name,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists)
             order by p.name), '[]'::json)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = m.id),
    'gk_stats', (
      select coalesce(json_agg(json_build_object(
               'goalkeeper_id', g.goalkeeper_id, 'name', p.name,
               'team', g.team, 'saves', g.saves, 'goals_conceded', g.goals_conceded)
             order by p.name), '[]'::json)
      from goalkeeper_match_stats g join players p on p.id = g.goalkeeper_id
      where g.match_id = m.id)
  )
  from matches m where m.id = p_id;
$$;

-- ---------- 9. get_players TRAZ O HISTÓRICO DE BALIZA ----------
-- O assistente do jogo já carrega esta função; pôr aqui as vezes que cada
-- um começou no gol poupa uma chamada e mantém uma fonte só.
-- Muda o `returns table` → tem de ser drop + create.
drop function if exists get_players();
create function get_players()
returns table(
  id uuid, name text, dob date, photo_url text, avg numeric, votes bigint,
  player_type text, primary_position text, secondary_position text,
  accepts_other_positions boolean, position_status text,
  gk_rotation_ok boolean, gk_starts bigint, last_gk_start date)
language sql security definer set search_path = public, extensions as $$
  select p.id, p.name, p.dob, p.photo_url,
         round(avg(r.score)::numeric, 2) as avg,
         count(r.score) as votes,
         p.player_type, p.primary_position, p.secondary_position,
         p.accepts_other_positions, p.position_status,
         p.gk_rotation_ok,
         (select count(*) from match_lineup l
           join matches m on m.id = l.match_id
          where l.player_id = p.id and l.is_goalkeeper
            and m.status <> 'CANCELLED') as gk_starts,
         (select max(m.played_at) from match_lineup l
           join matches m on m.id = l.match_id
          where l.player_id = p.id and l.is_goalkeeper
            and m.status <> 'CANCELLED') as last_gk_start
  from players p
  left join ratings r on r.target_id = p.id
  where p.approved
  group by p.id
  order by avg desc nulls last, p.name;
$$;

-- ---------- 10. O JOGADOR ESCOLHE SE VAI À BALIZA ----------
create or replace function set_my_gk_rotation(p_id uuid, p_pin text, p_ok boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players where id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  update players set gk_rotation_ok = coalesce(p_ok, true) where id = p_id;
end; $$;

create or replace function admin_set_gk_rotation(p_pw text, p_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if not exists (select 1 from players where id = p_id) then raise exception 'SEMJOGADOR'; end if;
  update players set gk_rotation_ok = coalesce(p_ok, true) where id = p_id;
end; $$;

-- ---------- PERMISSÕES ----------
revoke execute on function corrigir_ordem_rodizio(uuid) from public, anon, authenticated;
revoke execute on function preencher_gk_order()         from public, anon, authenticated;
revoke execute on function match_public_json(uuid)      from public, anon, authenticated;
grant  execute on function match_public_json(uuid)      to anon, authenticated;

grant execute on function admin_save_schedule(text, uuid, timestamptz, text, text, text, int, int)
  to anon, authenticated;
grant execute on function admin_save_lineup(text, uuid, jsonb, int, int, numeric, text)
  to anon, authenticated;
grant execute on function get_players()                            to anon, authenticated;
grant execute on function set_my_gk_rotation(uuid, text, boolean)  to anon, authenticated;
grant execute on function admin_set_gk_rotation(text, uuid, boolean) to anon, authenticated;
