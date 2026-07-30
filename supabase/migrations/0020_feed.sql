-- =====================================================================
--  PELADA BROWNS — Migração 20: o feed da pelada
--
--  Tudo o que o admin publica passa a gerar uma PUBLICAÇÃO, e a página
--  inicial dos jogadores ordena-as pela data de publicação (não pela
--  data do jogo): publicar hoje o sorteio de sábado põe-no no topo hoje;
--  publicar o resultado na segunda põe o resultado no topo na segunda.
--
--  Desenho:
--    - `match_publications` guarda um SNAPSHOT (`payload`) do que se
--      publicou: o feed é um registo histórico e não muda quando os
--      dados mudam depois.
--    - A exceção é o craque/bagre do post de resultado: a votação
--      acontece nos DIAS SEGUINTES à publicação, por isso o `get_feed`
--      lê os vencedores atuais da votação (com o override do admin da
--      0019 a mandar) em vez de os congelar num payload que nasceria
--      sempre vazio.
--    - A resenha (`body`) é gerada e editada no frontend (é lá que vivem
--      overall, sequências e lideranças) e entra como parâmetro novo de
--      admin_publish_match / admin_publish_result. As versões antigas
--      dessas funções são REMOVIDAS (drop) para o PostgREST não ficar
--      com duas assinaturas e recusar a chamada por ambiguidade.
--    - Cancelamentos e substituições publicam automaticamente, sem
--      resenha; o admin pode apagar ou editar qualquer publicação.
--
--  Tipos de publicação: SORTEIO, RESULTADO, CANCELAMENTO, SUBSTITUICAO.
-- =====================================================================

-- ---------- A TABELA ----------
create table if not exists match_publications (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  type         text not null check (type in ('SORTEIO','RESULTADO','CANCELAMENTO','SUBSTITUICAO')),
  title        text not null,
  body         text,            -- a resenha (pode ser editada depois)
  payload      jsonb,           -- snapshot do que se publicou
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table match_publications enable row level security;

create index if not exists match_publications_feed_idx
  on match_publications (published_at desc);
create index if not exists match_publications_match_idx
  on match_publications (match_id);

-- ---------- REGISTO INTERNO ----------
create or replace function publicar_no_feed(
  p_match uuid, p_type text, p_title text, p_body text, p_payload jsonb
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  insert into match_publications(match_id, type, title, body, payload)
  values (p_match, p_type, p_title, p_body, p_payload)
  returning id into v_id;
  return v_id;
end; $$;

-- ---------- PUBLICAR O SORTEIO (0016 → 0019 → aqui) ----------
-- Corpo da 0019 + resenha + publicação no feed. A versão de 2 argumentos
-- desaparece: com as duas vivas, o PostgREST não sabia qual chamar.
drop function if exists admin_publish_match(text, uuid);

create or replace function admin_publish_match(p_pw text, p_match uuid, p_resenha text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_payload jsonb;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status <> 'DRAFT' then raise exception 'JAPUBLICADO'; end if;
  if not exists (select 1 from match_lineup l where l.match_id = p_match) then
    raise exception 'SEMESCALACAO';
  end if;

  update matches set status = 'PUBLISHED', published_at = now() where id = p_match;
  perform registar_atividade(p_match, 'SORTEIO_PUBLICADO', null);

  -- snapshot das equipas para o feed (nome + overall por lado chega para
  -- desenhar o post e o card de partilha sem ir à escalação viva)
  select jsonb_build_object(
    'kickoff_at', m.kickoff_at,
    'location', m.location,
    'team_a_overall', m.team_a_overall,
    'team_b_overall', m.team_b_overall,
    'balance_pct', m.balance_pct,
    'teams', (
      select jsonb_object_agg(t.team, t.nomes) from (
        select l.team,
               jsonb_agg(jsonb_build_object(
                 'name', p.name, 'overall', l.overall_at_draw,
                 'position', l.assigned_position, 'gk', l.is_goalkeeper)
                 order by l.is_goalkeeper desc, l.assigned_position, p.name) as nomes
        from match_lineup l join players p on p.id = l.player_id
        where l.match_id = p_match
        group by l.team
      ) t
    )
  ) into v_payload
  from matches m where m.id = p_match;

  perform publicar_no_feed(p_match, 'SORTEIO', '🎲 Sorteio publicado',
                           nullif(btrim(p_resenha), ''), v_payload);

  return match_public_json(p_match);
end; $$;

-- ---------- PUBLICAR O RESULTADO (0019 → aqui) ----------
-- O payload vive numa função própria porque é preciso em DOIS sítios: ao
-- publicar e ao EDITAR um resultado já publicado (admin_save_result, mais
-- abaixo) — senão o admin corrigia o placar e o post do feed ficava com o
-- placar antigo para sempre, em contradição com o próprio jogo ao lado.
create or replace function payload_resultado(p_match uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  -- placar, gols e assistências do momento; craque/bagre ficam de fora DE
  -- PROPÓSITO (a votação acontece depois — o get_feed lê os vencedores
  -- atuais quando o post é mostrado)
  select jsonb_build_object(
    'played_at', m.played_at,
    'location', m.location,
    'score_a', m.score_a,
    'score_b', m.score_b,
    'team_a_overall', m.team_a_overall,
    'team_b_overall', m.team_b_overall,
    'goals', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'n', ms.goals)
               order by ms.goals desc, p.name), '[]'::jsonb)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = p_match and ms.goals > 0),
    'assists', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'n', ms.assists)
               order by ms.assists desc, p.name), '[]'::jsonb)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = p_match and ms.assists > 0),
    -- só quem defendeu de facto: um goleiro com 0 defesas nesta lista
    -- lia-se como elogio a quem levou 3 sem tocar na bola
    'saves', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'n', g.saves)
               order by g.saves desc, p.name), '[]'::jsonb)
      from goalkeeper_match_stats g join players p on p.id = g.goalkeeper_id
      where g.match_id = p_match and g.saves > 0)
  )
  from matches m where m.id = p_match;
$$;

drop function if exists admin_publish_result(text, uuid);

create or replace function admin_publish_result(p_pw text, p_match uuid, p_resenha text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_result text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status into v_status, v_result
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_result = 'NONE' then raise exception 'SEMRESULTADO'; end if;
  if v_result = 'PUBLISHED' then raise exception 'RESPUBLICADO'; end if;

  update matches set
    result_status = 'PUBLISHED',
    result_published_at = now(),
    status = 'COMPLETED'
  where id = p_match;

  perform registar_atividade(p_match, 'RESULTADO_PUBLICADO', null);

  perform publicar_no_feed(p_match, 'RESULTADO', '🏆 Resultado publicado',
                           nullif(btrim(p_resenha), ''), payload_resultado(p_match));

  return match_public_json(p_match);
end; $$;

-- ---------- EDITAR UM RESULTADO PUBLICADO ATUALIZA O POST ----------
-- Corpo da 0019 + uma linha no fim: se o resultado já estava publicado, o
-- payload do post RESULTADO é refrescado (o `body`, a resenha, fica como o
-- admin o deixou — números são factos, texto é curadoria).
create or replace function admin_save_result(
  p_pw text, p_match uuid,
  p_score_a int, p_score_b int,
  p_stats jsonb, p_gk_stats jsonb,
  p_notes text,
  p_craque uuid, p_bagre uuid
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text; v_result text;
  r_row record; v_goals int; v_assists int; v_team text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status into v_status, v_result
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_status = 'DRAFT' then raise exception 'SEMESCALACAO'; end if;

  if coalesce(p_score_a,0) < 0 or coalesce(p_score_a,0) > 99
     or coalesce(p_score_b,0) < 0 or coalesce(p_score_b,0) > 99 then raise exception 'PLACAR'; end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) < 3 then
    raise exception 'JOGADORES';
  end if;
  if p_craque is not null and p_craque = p_bagre then raise exception 'IGUAL'; end if;

  delete from match_stats where match_id = p_match;
  for r_row in select value from jsonb_array_elements(p_stats) loop
    v_goals   := coalesce((r_row.value->>'goals')::int, 0);
    v_assists := coalesce((r_row.value->>'assists')::int, 0);
    v_team    := nullif(r_row.value->>'team', '');
    if v_goals < 0 or v_goals > 99 or v_assists < 0 or v_assists > 99 then raise exception 'STATS'; end if;
    if v_team is not null and v_team not in ('A','B') then raise exception 'STATS'; end if;
    insert into match_stats(match_id, player_id, team, goals, assists)
    values (p_match, (r_row.value->>'player_id')::uuid, v_team, v_goals, v_assists);
  end loop;

  delete from goalkeeper_match_stats where match_id = p_match;
  if p_gk_stats is not null and jsonb_typeof(p_gk_stats) = 'array' then
    for r_row in select value from jsonb_array_elements(p_gk_stats) loop
      insert into goalkeeper_match_stats(match_id, goalkeeper_id, team, saves, goals_conceded)
      values (p_match,
              (r_row.value->>'goalkeeper_id')::uuid,
              nullif(r_row.value->>'team',''),
              coalesce((r_row.value->>'saves')::int, 0),
              coalesce((r_row.value->>'goals_conceded')::int, 0));
    end loop;
  end if;

  update matches set
    score_a = coalesce(p_score_a, 0),
    score_b = coalesce(p_score_b, 0),
    notes   = nullif(btrim(p_notes), ''),
    craque_override = p_craque,
    bagre_override  = p_bagre,
    result_status = case when result_status = 'PUBLISHED' then 'PUBLISHED' else 'DRAFT' end
  where id = p_match;

  perform registar_atividade(p_match,
    case when v_result = 'PUBLISHED' then 'RESULTADO_EDITADO' else 'RESULTADO_GRAVADO' end,
    jsonb_build_object('score_a', p_score_a, 'score_b', p_score_b,
                       'jogadores', jsonb_array_length(p_stats)));

  if v_result = 'PUBLISHED' then
    update match_publications set payload = payload_resultado(p_match)
    where match_id = p_match and type = 'RESULTADO';
  end if;

  return match_public_json(p_match);
end; $$;

-- ---------- CANCELAR (0019 → aqui): ganha o post no feed ----------
create or replace function admin_cancel_match(p_pw text, p_match uuid, p_reason text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_result text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status into v_status, v_result
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then return match_public_json(p_match); end if; -- idempotente
  if v_result = 'PUBLISHED' then raise exception 'RESPUBLICADO'; end if;

  update matches set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = nullif(btrim(p_reason), '')
  where id = p_match;

  perform registar_atividade(p_match, 'JOGO_CANCELADO',
    jsonb_build_object('motivo', nullif(btrim(p_reason), '')));

  -- só publica se o grupo chegou a saber do jogo: cancelar um rascunho
  -- que ninguém viu não é notícia
  if v_status in ('PUBLISHED','IN_PROGRESS') then
    perform publicar_no_feed(p_match, 'CANCELAMENTO', '🚫 Jogo cancelado',
      nullif(btrim(p_reason), ''),
      (select jsonb_build_object('kickoff_at', m.kickoff_at, 'location', m.location)
       from matches m where m.id = p_match));
  end if;

  return match_public_json(p_match);
end; $$;

-- ---------- SUBSTITUIR (0019 → aqui): ganha o post no feed ----------
create or replace function admin_substitute_player(
  p_pw text, p_match uuid, p_out uuid, p_in uuid, p_in_overall int, p_reason text
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
    is_goalkeeper, out_overall, in_overall, reason)
  values (
    p_match, p_out, p_in, v_linha.team, v_linha.assigned_position,
    v_linha.is_goalkeeper, v_linha.overall_at_draw, p_in_overall,
    nullif(btrim(p_reason), ''))
  returning id into v_sub_id;

  perform recalcular_forcas_do_jogo(p_match);
  perform registar_atividade(p_match, 'JOGADOR_SUBSTITUIDO',
    jsonb_build_object('saiu', p_out, 'entrou', p_in, 'motivo', nullif(btrim(p_reason), '')));

  select p.name into v_out_nome from players p where p.id = p_out;
  select p.name into v_in_nome  from players p where p.id = p_in;
  -- sub_id fica no payload para o desfazer conseguir apagar o post certo
  perform publicar_no_feed(p_match, 'SUBSTITUICAO', '🔄 Mudança na escalação',
    nullif(btrim(p_reason), ''),
    (select jsonb_build_object(
       'sub_id', v_sub_id,
       'out_name', v_out_nome, 'in_name', v_in_nome,
       'team', v_linha.team, 'position', v_linha.assigned_position,
       'is_goalkeeper', v_linha.is_goalkeeper,
       'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall,
       'kickoff_at', m.kickoff_at)
     from matches m where m.id = p_match));

  return match_public_json(p_match);
end; $$;

-- ---------- DESFAZER UMA TROCA LIMPA O POST (0018 → aqui) ----------
-- Corpo da 0018 + apagar o post de SUBSTITUICAO correspondente: o desfazer
-- existe para o engano do dedo, e sem isto o feed continuava a anunciar ao
-- grupo uma troca que já não aconteceu.
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

  delete from match_publications
  where match_id = v_sub.match_id
    and type = 'SUBSTITUICAO'
    and payload->>'sub_id' = p_sub::text;

  perform recalcular_forcas_do_jogo(v_sub.match_id);

  return match_public_json(v_sub.match_id);
end; $$;

-- ---------- FECHAR A PORTA LATERAL DO ESTADO ----------
-- admin_set_match_status deixava publicar (sem post, sem SEMESCALACAO) e
-- despublicar-e-republicar (post de sorteio DUPLICADO). Nenhum ecrã a usa
-- para isso; fica só a transição que os fluxos novos não cobrem.
create or replace function admin_set_match_status(p_pw text, p_match uuid, p_status text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_atual text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_atual from matches m where m.id = p_match;
  if v_atual is null then raise exception 'INVALIDO'; end if;

  -- publicar é em admin_publish_match; fechar é em admin_save_result /
  -- admin_publish_result; cancelar é em admin_cancel_match. Por aqui só
  -- marcar o jogo a decorrer (e voltar atrás).
  if not ( (v_atual = 'PUBLISHED' and p_status = 'IN_PROGRESS')
        or (v_atual = 'IN_PROGRESS' and p_status = 'PUBLISHED') ) then
    raise exception 'INVALIDO';
  end if;

  update matches set status = p_status where id = p_match;
end; $$;

-- ---------- O FEED (público) ----------
-- Mais recente primeiro, paginado por published_at (keyset). Junta um
-- resumo do jogo e a foto principal; no post de RESULTADO, o craque e o
-- bagre são os vencedores ATUAIS da votação (override do admin manda),
-- porque a votação decorre depois da publicação.
-- (drop da forma de 2 argumentos: se uma versão anterior desta migração
-- chegou a ser aplicada, ficariam duas assinaturas e o PostgREST recusava)
drop function if exists get_feed(int, timestamptz);

create or replace function get_feed(p_limit int default 20, p_before timestamptz default null, p_match uuid default null)
returns json language sql stable security definer set search_path = public, extensions as $$
  select coalesce(json_agg(post order by pub_at desc, pub_id desc), '[]'::json)
  from (
    select pub.published_at as pub_at,
           pub.id as pub_id,
           json_build_object(
             'id', pub.id,
             'type', pub.type,
             'title', pub.title,
             'body', pub.body,
             'payload', pub.payload,
             'published_at', pub.published_at,
             'match', json_build_object(
               'id', m.id, 'status', m.status, 'result_status', m.result_status,
               'kickoff_at', m.kickoff_at, 'played_at', m.played_at,
               'location', m.location,
               'score_a', m.score_a, 'score_b', m.score_b,
               'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall),
             'photo', coalesce(
               (select md.data_url from match_media md
                 where md.match_id = m.id and md.is_primary limit 1),
               m.winner_photo),
             -- empates desempatam por NOME, a mesma ordem que match_json
             -- mostra no detalhe da rodada — o feed e o histórico têm de
             -- apontar para a mesma cara
             'craque', case when pub.type = 'RESULTADO' then (
               select json_build_object('player_id', p.id, 'name', p.name, 'photo', p.photo_url)
               from players p
               where p.id = coalesce(
                 m.craque_override,
                 (select t.pid from (
                    select av.craque_id as pid, count(*) as n, pv.name as nome
                    from award_votes av join players pv on pv.id = av.craque_id
                    where av.match_id = m.id
                    group by av.craque_id, pv.name
                    order by n desc, nome
                    limit 1) t)
               )
             ) end,
             'bagre', case when pub.type = 'RESULTADO' then (
               select json_build_object('player_id', p.id, 'name', p.name, 'photo', p.photo_url)
               from players p
               where p.id = coalesce(
                 m.bagre_override,
                 (select t.pid from (
                    select av.bagre_id as pid, count(*) as n, pv.name as nome
                    from award_votes av join players pv on pv.id = av.bagre_id
                    where av.match_id = m.id
                    group by av.bagre_id, pv.name
                    order by n desc, nome
                    limit 1) t)
               )
             ) end
           ) as post
    from match_publications pub
    join matches m on m.id = pub.match_id
    where (p_before is null or pub.published_at < p_before)
      and (p_match is null or pub.match_id = p_match)
    order by pub.published_at desc, pub.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) fila;
$$;

-- ---------- GERIR PUBLICAÇÕES ----------
create or replace function admin_update_post(p_pw text, p_post uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update match_publications set
    title = coalesce(nullif(btrim(p_title), ''), title),
    body  = nullif(btrim(p_body), '')
  where id = p_post;
  if not found then raise exception 'INVALIDO'; end if;
end; $$;

create or replace function admin_delete_post(p_pw text, p_post uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from match_publications where id = p_post;
  if not found then raise exception 'INVALIDO'; end if;
end; $$;

-- ---------- match_json GANHA OS GOLEIROS ----------
-- As sequências de goleiro ("dois jogos sem sofrer") precisam das defesas
-- rodada a rodada; o histórico só trazia gols e assistências. Corpo da
-- 0010 + o bloco gk_stats.
create or replace function match_json(p_id uuid, p_photos boolean)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', m.id, 'played_at', m.played_at, 'created_at', m.created_at,
    'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
    'score_a', m.score_a, 'score_b', m.score_b,
    'notes', m.notes,
    'has_winner_photo', m.winner_photo is not null,
    'has_location_photo', m.location_photo is not null,
    'winner_photo',   case when p_photos then m.winner_photo   else null end,
    'location_photo', case when p_photos then m.location_photo else null end,
    'players', (
      select coalesce(json_agg(json_build_object(
               'player_id', ms.player_id, 'name', p.name, 'photo', p.photo_url,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists)
             order by ms.goals desc, ms.assists desc, p.name), '[]'::json)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = m.id),
    'gk_stats', (
      select coalesce(json_agg(json_build_object(
               'goalkeeper_id', g.goalkeeper_id, 'name', p.name,
               'team', g.team, 'saves', g.saves, 'goals_conceded', g.goals_conceded)
             order by p.name), '[]'::json)
      from goalkeeper_match_stats g join players p on p.id = g.goalkeeper_id
      where g.match_id = m.id),
    'votes', (select count(*)::int from award_votes av where av.match_id = m.id),
    -- o override do admin (0019) MANDA: quando existe, o vencedor é ele,
    -- com os votos reais que teve (pode ser 0 — foi decisão do admin).
    -- Sem isto o feed dizia um craque e o histórico dizia outro.
    'craque', case when m.craque_override is not null then (
      select json_agg(json_build_object('player_id', p.id, 'name', p.name,
               'votes', (select count(*)::int from award_votes av
                          where av.match_id = m.id and av.craque_id = p.id)))
      from players p where p.id = m.craque_override
    ) else (
      select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
               order by t.n desc, t.nome), '[]'::json)
      from (select av.craque_id as pid, p.name as nome, count(*)::int as n
              from award_votes av join players p on p.id = av.craque_id
             where av.match_id = m.id group by av.craque_id, p.name) t
    ) end,
    'bagre', case when m.bagre_override is not null then (
      select json_agg(json_build_object('player_id', p.id, 'name', p.name,
               'votes', (select count(*)::int from award_votes av
                          where av.match_id = m.id and av.bagre_id = p.id)))
      from players p where p.id = m.bagre_override
    ) else (
      select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
               order by t.n desc, t.nome), '[]'::json)
      from (select av.bagre_id as pid, p.name as nome, count(*)::int as n
              from award_votes av join players p on p.id = av.bagre_id
             where av.match_id = m.id group by av.bagre_id, p.name) t
    ) end
  )
  from matches m where m.id = p_id;
$$;

-- ---------- PERMISSÕES ----------
revoke execute on function publicar_no_feed(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function payload_resultado(uuid) from public, anon, authenticated;

-- match_json é interna: os wrappers (get_matches/get_match/…) filtram o que
-- pode ser visto. Com EXECUTE público (o default do Postgres desde a 0010),
-- qualquer visitante com o id de um jogo lia o placar de um resultado em
-- RASCUNHO e as fotos antes da publicação — fecha-se aqui.
revoke execute on function match_json(uuid, boolean) from public, anon, authenticated;

grant execute on function admin_publish_match(text, uuid, text)   to anon, authenticated;
grant execute on function admin_publish_result(text, uuid, text)  to anon, authenticated;
grant execute on function admin_save_result(text, uuid, int, int, jsonb, jsonb, text, uuid, uuid) to anon, authenticated;
grant execute on function admin_cancel_match(text, uuid, text)    to anon, authenticated;
grant execute on function admin_substitute_player(text, uuid, uuid, uuid, int, text) to anon, authenticated;
grant execute on function admin_undo_substitution(text, uuid)     to anon, authenticated;
grant execute on function admin_set_match_status(text, uuid, text) to anon, authenticated;
grant execute on function get_feed(int, timestamptz, uuid)        to anon, authenticated;
grant execute on function admin_update_post(text, uuid, text, text) to anon, authenticated;
grant execute on function admin_delete_post(text, uuid)           to anon, authenticated;
