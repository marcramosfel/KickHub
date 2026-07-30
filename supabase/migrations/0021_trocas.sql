-- =====================================================================
--  PELADA BROWNS — Migração 21: trocas livres na escalação publicada
--
--  A 0018 abriu UMA porta num sorteio publicado: substituir quem desistiu.
--  Esta abre a segunda, e são as duas que existem: TROCAR dois jogadores
--  de equipa (um de cada lado), ou substituir alguém por opção do admin
--  sem o marcar como desistente. Continua sem haver re-sorteio: cada
--  mexida é cirúrgica, fica na auditoria e aparece no feed.
--
--  `match_substitutions.kind` distingue as duas histórias:
--    DESISTENCIA — "não posso ir" e entrou outro no lugar;
--    TROCA       — o admin mexeu por opção (equilíbrio, atraso, etc.).
--  A distinção importa aos jogadores: uma desistência explica o
--  desequilíbrio, uma troca é decisão — e os dois avisos dizem coisas
--  diferentes.
--
--  Código de erro novo: TROCAGK (goleiro só troca com goleiro).
-- =====================================================================

-- ---------- O TIPO DA MEXIDA ----------
alter table match_substitutions
  add column if not exists kind text not null default 'DESISTENCIA';

do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'match_substitutions_kind_chk'
      and conrelid = 'public.match_substitutions'::regclass
  ) then
    alter table match_substitutions add constraint match_substitutions_kind_chk
      check (kind in ('DESISTENCIA','TROCA'));
  end if;
end
$chk$;

-- ---------- SUBSTITUIR, AGORA COM O TIPO (0020 → aqui) ----------
-- Corpo da 0020 + p_kind. A versão de 6 argumentos leva drop, senão o
-- PostgREST ficava com duas assinaturas e recusava a chamada.
drop function if exists admin_substitute_player(text, uuid, uuid, uuid, int, text);

create or replace function admin_substitute_player(
  p_pw text, p_match uuid, p_out uuid, p_in uuid, p_in_overall int, p_reason text,
  p_kind text default 'DESISTENCIA'
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text;
  v_linha match_lineup%rowtype;
  v_primaria text;
  v_fora boolean;
  v_out_nome text; v_in_nome text;
  v_sub_id uuid;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_out is null or p_in is null then raise exception 'SEMJOGADOR'; end if;
  if p_out = p_in then raise exception 'MESMOJOGADOR'; end if;
  if p_kind is null or p_kind not in ('DESISTENCIA','TROCA') then raise exception 'INVALIDO'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  select * into v_linha from match_lineup l
  where l.match_id = p_match and l.player_id = p_out;
  if not found then raise exception 'SEMLINEUP'; end if;

  if exists (select 1 from match_lineup l where l.match_id = p_match and l.player_id = p_in) then
    raise exception 'JAESCALADO';
  end if;

  select p.primary_position into v_primaria from players p where p.id = p_in;
  if not found then raise exception 'SEMJOGADOR'; end if;

  v_fora := (not v_linha.is_goalkeeper) and (v_primaria is distinct from v_linha.assigned_position);

  update match_lineup set
    player_id           = p_in,
    preferred_position  = v_primaria,
    was_out_of_position = v_fora,
    overall_at_draw     = p_in_overall
  where match_id = p_match and player_id = p_out;

  insert into match_substitutions(
    match_id, out_player_id, in_player_id, team, assigned_position,
    is_goalkeeper, out_overall, in_overall, reason, kind)
  values (
    p_match, p_out, p_in, v_linha.team, v_linha.assigned_position,
    v_linha.is_goalkeeper, v_linha.overall_at_draw, p_in_overall,
    nullif(btrim(p_reason), ''), p_kind)
  returning id into v_sub_id;

  perform recalcular_forcas_do_jogo(p_match);
  perform registar_atividade(p_match,
    case when p_kind = 'TROCA' then 'JOGADOR_TROCADO' else 'JOGADOR_SUBSTITUIDO' end,
    jsonb_build_object('saiu', p_out, 'entrou', p_in, 'motivo', nullif(btrim(p_reason), '')));

  select p.name into v_out_nome from players p where p.id = p_out;
  select p.name into v_in_nome  from players p where p.id = p_in;
  perform publicar_no_feed(p_match, 'SUBSTITUICAO', '🔄 Mudança na escalação',
    nullif(btrim(p_reason), ''),
    (select jsonb_build_object(
       'sub_id', v_sub_id,
       'kind', p_kind,
       'out_name', v_out_nome, 'in_name', v_in_nome,
       'team', v_linha.team, 'position', v_linha.assigned_position,
       'is_goalkeeper', v_linha.is_goalkeeper,
       'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall,
       'kickoff_at', m.kickoff_at)
     from matches m where m.id = p_match));

  return match_public_json(p_match);
end; $$;

-- ---------- TROCAR DOIS JOGADORES DE EQUIPA ----------
-- Um de cada lado; cada um assume o LUGAR do outro. Goleiro só troca com
-- goleiro (senão uma equipa ficava sem ninguém na baliza). A justificação
-- é opcional de propósito — trocar é uma decisão do admin, não um evento
-- que precise de desculpa.
--
-- O apagar+inserir em vez de dois updates não é estilo: o índice único
-- (match_id, team, assigned_position) é verificado a cada linha alterada,
-- e o primeiro update punha dois jogadores no mesmo lugar por um instante
-- — rebentava com 23505 antes de o segundo update compor as coisas.
create or replace function admin_swap_players(
  p_pw text, p_match uuid, p_a uuid, p_b uuid, p_reason text default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text;
  la match_lineup%rowtype;
  lb match_lineup%rowtype;
  v_prim_a text; v_prim_b text;
  v_nome_a text; v_nome_b text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_a is null or p_b is null then raise exception 'SEMJOGADOR'; end if;
  if p_a = p_b then raise exception 'MESMOJOGADOR'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  select * into la from match_lineup l where l.match_id = p_match and l.player_id = p_a;
  if not found then raise exception 'SEMLINEUP'; end if;
  select * into lb from match_lineup l where l.match_id = p_match and l.player_id = p_b;
  if not found then raise exception 'SEMLINEUP'; end if;

  if la.team = lb.team then raise exception 'INVALIDO'; end if;
  if la.is_goalkeeper <> lb.is_goalkeeper then raise exception 'TROCAGK'; end if;

  select p.primary_position into v_prim_a from players p where p.id = p_a;
  select p.primary_position into v_prim_b from players p where p.id = p_b;

  delete from match_lineup
  where match_id = p_match and player_id in (p_a, p_b);

  -- cada um herda equipa E lugar do outro; o overall congelado viaja com o
  -- jogador (é dele, não do lugar)
  insert into match_lineup(match_id, player_id, team, assigned_position,
                           preferred_position, was_out_of_position,
                           overall_at_draw, is_goalkeeper)
  values
    (p_match, p_a, lb.team, lb.assigned_position, v_prim_a,
     (not lb.is_goalkeeper) and (v_prim_a is distinct from lb.assigned_position),
     la.overall_at_draw, lb.is_goalkeeper),
    (p_match, p_b, la.team, la.assigned_position, v_prim_b,
     (not la.is_goalkeeper) and (v_prim_b is distinct from la.assigned_position),
     lb.overall_at_draw, la.is_goalkeeper);

  perform recalcular_forcas_do_jogo(p_match);
  perform registar_atividade(p_match, 'JOGADORES_TROCADOS',
    jsonb_build_object('a', p_a, 'b', p_b, 'motivo', nullif(btrim(p_reason), '')));

  select p.name into v_nome_a from players p where p.id = p_a;
  select p.name into v_nome_b from players p where p.id = p_b;
  perform publicar_no_feed(p_match, 'SUBSTITUICAO', '🔁 Troca de equipas',
    nullif(btrim(p_reason), ''),
    (select jsonb_build_object(
       'swap', true,
       'a_name', v_nome_a, 'a_team', la.team,
       'b_name', v_nome_b, 'b_team', lb.team,
       'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall,
       'kickoff_at', m.kickoff_at)
     from matches m where m.id = p_match));

  return match_public_json(p_match);
end; $$;

-- ---------- PERMISSÕES ----------
grant execute on function admin_substitute_player(text, uuid, uuid, uuid, int, text, text) to anon, authenticated;
grant execute on function admin_swap_players(text, uuid, uuid, uuid, text)                 to anon, authenticated;
