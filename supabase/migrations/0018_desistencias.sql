-- =====================================================================
--  PELADA BROWNS — Migração 18: desistências e substituições
--
--  Publicar um sorteio fixa as equipas (0016), e isso continua certo: o
--  grupo já viu quem joga com quem. Só que às vezes alguém desiste em
--  cima da hora, e a alternativa a substituí-lo é jogar 6 contra 7.
--
--  Esta migração abre UMA porta, e só uma: trocar quem desistiu por
--  outro jogador, no mesmo lugar e na mesma equipa. Não re-sorteia, não
--  reequilibra e não esconde nada — o desequilíbrio que a troca causar
--  fica registado e à vista de todos, que é exactamente o ponto: quem
--  entra em campo tem de saber que o time que calhou mais forte ficou
--  mais forte por causa de uma desistência, não do sorteio.
--
--  Códigos de erro novos: SEMLINEUP, JAESCALADO, MESMOJOGADOR, SUBTROCADA.
-- =====================================================================

-- ---------- REGISTO DAS TROCAS ----------
-- Uma linha por desistência. O lugar e a equipa são copiados no momento
-- da troca em vez de lidos de `match_lineup` mais tarde: quem entrou pode
-- ele próprio desistir depois, e o histórico não pode mudar por isso.
create table if not exists match_substitutions (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references matches(id) on delete cascade,
  out_player_id     uuid not null references players(id) on delete cascade,
  in_player_id      uuid not null references players(id) on delete cascade,
  team              text not null check (team in ('A','B')),
  assigned_position text not null check (assigned_position in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST')),
  is_goalkeeper     boolean not null default false,
  out_overall       int,
  in_overall        int,
  reason            text,
  created_at        timestamptz not null default now()
);

alter table match_substitutions enable row level security;

create index if not exists match_substitutions_match_idx
  on match_substitutions (match_id, created_at);

-- ---------- RECALCULAR AS FORÇAS ----------
-- Depois de uma troca, `matches.team_a_overall` / `team_b_overall` /
-- `balance_pct` deixam de bater certo com a escalação. A soma dos
-- `overall_at_draw` é a mesma conta que o motor de sorteio faz no
-- frontend (`strength`), e a percentagem é a de `avaliarEquilibrio`
-- (diferença a dividir pela média das duas forças) — se divergirem, a
-- Home passa a dizer um número e o campo a mostrar outro.
create or replace function recalcular_forcas_do_jogo(p_match uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_a int; v_b int; v_media numeric;
begin
  select coalesce(sum(l.overall_at_draw) filter (where l.team = 'A'), 0),
         coalesce(sum(l.overall_at_draw) filter (where l.team = 'B'), 0)
    into v_a, v_b
  from match_lineup l
  where l.match_id = p_match;

  v_media := (v_a + v_b) / 2.0;

  update matches set
    team_a_overall = v_a,
    team_b_overall = v_b,
    balance_pct    = case when v_media > 0
                          then round(abs(v_a - v_b) / v_media * 100, 2)
                          else 0 end
  where id = p_match;
end; $$;

-- ---------- SUBSTITUIR ----------
-- p_in_overall é o overall de quem entra, calculado no frontend (é lá que
-- vive a fórmula, desde a 0017) e congelado aqui como o do sorteio: a
-- escalação tem de continuar a explicar as forças que mostramos.
--
-- Só de PUBLISHED/IN_PROGRESS: num rascunho não há nada a substituir,
-- volta-se a sortear; num jogo fechado isto seria reescrever história.
create or replace function admin_substitute_player(
  p_pw text, p_match uuid, p_out uuid, p_in uuid, p_in_overall int, p_reason text
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text;
  v_linha match_lineup%rowtype;
  v_primaria text;
  v_fora boolean;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_out is null or p_in is null then raise exception 'SEMJOGADOR'; end if;
  if p_out = p_in then raise exception 'MESMOJOGADOR'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  select * into v_linha from match_lineup l
  where l.match_id = p_match and l.player_id = p_out;
  if not found then raise exception 'SEMLINEUP'; end if;

  -- O mesmo jogador duas vezes em campo é o erro fácil de fazer aqui: a
  -- chave primária (match_id, player_id) também o trava, mas em 23505.
  if exists (select 1 from match_lineup l where l.match_id = p_match and l.player_id = p_in) then
    raise exception 'JAESCALADO';
  end if;

  select p.primary_position into v_primaria from players p where p.id = p_in;
  if not found then raise exception 'SEMJOGADOR'; end if;

  -- Mesma regra do motor de sorteio: quem entra sem posição declarada
  -- conta como fora de posição, e o goleiro nunca conta (foi escolhido
  -- para a baliza, não empurrado para lá).
  v_fora := (not v_linha.is_goalkeeper) and (v_primaria is distinct from v_linha.assigned_position);

  update match_lineup set
    player_id           = p_in,
    preferred_position  = v_primaria,
    was_out_of_position = v_fora,
    overall_at_draw     = p_in_overall
  where match_id = p_match and player_id = p_out;

  insert into match_substitutions(
    match_id, out_player_id, in_player_id, team, assigned_position,
    is_goalkeeper, out_overall, in_overall, reason)
  values (
    p_match, p_out, p_in, v_linha.team, v_linha.assigned_position,
    v_linha.is_goalkeeper, v_linha.overall_at_draw, p_in_overall,
    nullif(btrim(p_reason), ''));

  perform recalcular_forcas_do_jogo(p_match);

  return match_public_json(p_match);
end; $$;

-- ---------- DESFAZER UMA TROCA ----------
-- Para o engano do dedo, não para mudar de ideias: só desfaz se quem
-- entrou ainda estiver no mesmo lugar. Se já houve outra troca por cima,
-- desfazer esta punha dois jogadores no mesmo sítio — recusa-se
-- (SUBTROCADA) em vez de adivinhar.
create or replace function admin_undo_substitution(p_pw text, p_sub uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_sub match_substitutions%rowtype;
  v_status text;
  v_primaria text;
  v_fora boolean;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select * into v_sub from match_substitutions s where s.id = p_sub;
  if not found then raise exception 'INVALIDO'; end if;

  select m.status into v_status from matches m where m.id = v_sub.match_id;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  if not exists (
    select 1 from match_lineup l
    where l.match_id = v_sub.match_id
      and l.player_id = v_sub.in_player_id
      and l.team = v_sub.team
      and l.assigned_position = v_sub.assigned_position
  ) then raise exception 'SUBTROCADA'; end if;

  if exists (
    select 1 from match_lineup l
    where l.match_id = v_sub.match_id and l.player_id = v_sub.out_player_id
  ) then raise exception 'JAESCALADO'; end if;

  select p.primary_position into v_primaria from players p where p.id = v_sub.out_player_id;
  if not found then raise exception 'SEMJOGADOR'; end if;

  v_fora := (not v_sub.is_goalkeeper) and (v_primaria is distinct from v_sub.assigned_position);

  update match_lineup set
    player_id           = v_sub.out_player_id,
    preferred_position  = v_primaria,
    was_out_of_position = v_fora,
    overall_at_draw     = v_sub.out_overall
  where match_id = v_sub.match_id and player_id = v_sub.in_player_id;

  delete from match_substitutions where id = p_sub;

  perform recalcular_forcas_do_jogo(v_sub.match_id);

  return match_public_json(v_sub.match_id);
end; $$;

-- ---------- JSON PÚBLICO, AGORA COM AS DESISTÊNCIAS ----------
-- Corpo igual ao da 0016, mais `substitutions` e duas marcas em cada
-- linha da escalação. Quem entrou tem de se distinguir no campo: sem
-- isso, a única pista de que houve desistências era o desequilíbrio, e
-- ninguém adivinha a causa a olhar para dois números.
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
               'is_goalkeeper', l.is_goalkeeper,
               -- quem entrou no lugar de alguém que desistiu, e por quem
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
      -- a mais recente: quem entrou por A e depois foi trocado e voltou
      -- não pode aparecer ligado à primeira troca
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
      where s.match_id = m.id)
  )
  from matches m where m.id = p_id;
$$;

-- ---------- PERMISSÕES ----------
-- `recalcular_forcas_do_jogo` é interna e não pede senha: o Postgres dá
-- EXECUTE a PUBLIC a toda a função nova, e sem este revoke qualquer
-- visitante reescrevia as forças de um jogo. As funções de admin chamam-na
-- por dentro, onde o revoke não estorva (mesmo dono, SECURITY DEFINER).
revoke execute on function recalcular_forcas_do_jogo(uuid) from public, anon, authenticated;

grant execute on function admin_substitute_player(text, uuid, uuid, uuid, int, text) to anon, authenticated;
grant execute on function admin_undo_substitution(text, uuid)                      to anon, authenticated;
grant execute on function match_public_json(uuid)                                  to anon, authenticated;
