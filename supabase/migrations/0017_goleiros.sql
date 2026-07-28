-- =====================================================================
--  PELADA BROWNS — Migração 17: estatísticas de goleiro
--
--  Gols e assistências não dizem nada sobre quem está na baliza. Esta
--  migração dá aos goleiros os números que são mesmo deles: defesas,
--  gols sofridos e jogos sem sofrer.
--
--  NÃO há colunas para "remates à baliza" nem para "jogo sem sofrer":
--  são derivados (saves + goals_conceded, e goals_conceded = 0). Guardar
--  derivados só cria linhas que se contradizem umas às outras.
--
--  O OVERALL DE GOLEIRO NÃO É CALCULADO AQUI. Estas funções entregam
--  números crus; a fórmula vive em src/lib/overall.js, ao lado da do
--  jogador de campo, para haver um único sítio a mudar.
--
--  Depende da 0015 (players.player_type) e da 0016 (matches.status) —
--  aplica-as primeiro.
-- =====================================================================

-- ---------- TABELA ----------
-- Uma linha por goleiro por rodada. Sem linha = não foi à baliza nessa rodada.
create table if not exists goalkeeper_match_stats (
  match_id       uuid not null references matches(id) on delete cascade,
  goalkeeper_id  uuid not null references players(id) on delete cascade,
  team           text check (team in ('A','B')),           -- null nas rodadas antigas
  saves          int  not null default 0 check (saves between 0 and 99),
  goals_conceded int  not null default 0 check (goals_conceded between 0 and 99),
  created_at     timestamptz not null default now(),
  primary key (match_id, goalkeeper_id)
);

-- A PK só serve buscas por rodada; o ranking percorre por goleiro.
create index if not exists goalkeeper_match_stats_gk_idx
  on goalkeeper_match_stats (goalkeeper_id);

-- Como no resto do esquema: RLS ligado e zero políticas — só as funções
-- SECURITY DEFINER abaixo é que tocam nesta tabela.
alter table goalkeeper_match_stats enable row level security;

-- ---------- GRAVAR OS GOLEIROS DE UMA RODADA ----------
-- p_stats: [{goalkeeper_id, team, saves, goals_conceded}]
-- Lista vazia (ou null) é válida e significa "esta rodada não tem goleiros
-- registados" — é assim que o admin desfaz um registo errado.
create or replace function admin_save_gk_stats(p_pw text, p_match uuid, p_stats jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  r_row record;
  v_gk uuid; v_team text; v_saves int; v_conceded int;
  v_vistos uuid[] := '{}';  -- ids já inseridos, para o duplicado não rebentar na PK
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_match is null or not exists (select 1 from matches m where m.id = p_match) then
    raise exception 'INVALIDO';
  end if;
  -- O `where` é obrigatório: o Supabase bloqueia delete sem filtro (21000)
  -- mesmo dentro de SECURITY DEFINER.
  delete from goalkeeper_match_stats where match_id = p_match;

  -- SQL NULL e jsonb 'null' querem a mesma coisa: a rodada fica sem goleiros.
  if p_stats is null or jsonb_typeof(p_stats) = 'null' then return; end if;
  if jsonb_typeof(p_stats) <> 'array' then raise exception 'STATS'; end if;
  if jsonb_array_length(p_stats) = 0 then return; end if;

  for r_row in select value from jsonb_array_elements(p_stats) loop
    -- Os casts vão dentro de blocos próprios: sem eles, um id malformado ou
    -- um campo de número apagado no formulário ('') sobem como 22P02/22003
    -- crus do Postgres, que o frontend não sabe traduzir (só reconhece os
    -- códigos em maiúsculas) e o admin via "invalid input syntax for uuid".
    begin
      v_gk := nullif(btrim(r_row.value->>'goalkeeper_id'), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SEMJOGADOR';
    end;

    v_team := nullif(r_row.value->>'team', '');

    begin
      v_saves    := coalesce(nullif(btrim(r_row.value->>'saves'), '')::int, 0);
      v_conceded := coalesce(nullif(btrim(r_row.value->>'goals_conceded'), '')::int, 0);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'STATS';
    end;

    if v_gk is null then raise exception 'SEMJOGADOR'; end if;
    if not exists (select 1 from players p where p.id = v_gk) then raise exception 'SEMJOGADOR'; end if;
    if v_gk = any(v_vistos) then raise exception 'STATS'; end if;
    if v_saves < 0 or v_saves > 99 or v_conceded < 0 or v_conceded > 99 then raise exception 'STATS'; end if;
    if v_team is not null and v_team not in ('A','B') then raise exception 'STATS'; end if;

    insert into goalkeeper_match_stats(match_id, goalkeeper_id, team, saves, goals_conceded)
    values (p_match, v_gk, v_team, v_saves, v_conceded);
    v_vistos := v_vistos || v_gk;
  end loop;
end; $$;

-- ---------- LEITURA: RANKING DOS GOLEIROS ----------
-- `league.avg_goals_conceded` é a régua contra a qual o frontend compara
-- cada goleiro: gols sofridos por jogo em toda a pelada. Sem ela, "sofreu
-- 2 por jogo" não quer dizer nada.
--
-- Entram no array os jogadores aprovados que já foram à baliza pelo menos
-- uma vez OU que se declaram goleiros (senão um goleiro novo desaparecia
-- da lista até jogar).
--
-- A ordenação é por nome de propósito: a ordem que interessa é a do
-- overall, e essa fórmula está no frontend.
create or replace function get_goalkeeper_stats()
returns json language sql stable security definer set search_path = public, extensions as $$
  with agg as (
    select g.goalkeeper_id                                    as pid,
           count(*)::int                                      as matches,
           coalesce(sum(g.saves), 0)::int                     as saves,
           coalesce(sum(g.goals_conceded), 0)::int            as goals_conceded,
           count(*) filter (where g.goals_conceded = 0)::int  as clean_sheets,
           -- vitórias/empates/derrotas só de rodadas fechadas e com time
           -- conhecido: sem isso não dá para saber de que lado ele estava.
           count(*) filter (
             where g.team is not null and m.status = 'COMPLETED'
               and ((g.team = 'A' and m.score_a > m.score_b)
                 or (g.team = 'B' and m.score_b > m.score_a)))::int as wins,
           count(*) filter (
             where g.team is not null and m.status = 'COMPLETED'
               and m.score_a = m.score_b)::int                      as draws,
           count(*) filter (
             where g.team is not null and m.status = 'COMPLETED'
               and ((g.team = 'A' and m.score_a < m.score_b)
                 or (g.team = 'B' and m.score_b < m.score_a)))::int as losses
    from goalkeeper_match_stats g
    join matches m on m.id = g.match_id
    -- Só jogadores aprovados. O array `goalkeepers` já filtrava por aprovado,
    -- por isso deixar a média da pelada contar toda a tabela dava dois números
    -- diferentes para a mesma coisa: o daqui e o que o frontend recalcula a
    -- partir do array (mediaGolsSofridos, em src/lib/ranking.js). O overall de
    -- goleiro compara cada um contra esta média — as duas bases têm de bater.
    join players gp on gp.id = g.goalkeeper_id and gp.approved
    group by g.goalkeeper_id
  )
  select json_build_object(
    'league', json_build_object(
      'avg_goals_conceded',
      coalesce((select round(sum(a.goals_conceded)::numeric / nullif(sum(a.matches), 0), 2)
                from agg a), 0)
    ),
    'goalkeepers', (
      select coalesce(json_agg(json_build_object(
               'id', p.id, 'name', p.name, 'photo', p.photo_url,
               'player_type',    p.player_type,
               'matches',        coalesce(a.matches, 0),
               'saves',          coalesce(a.saves, 0),
               'goals_conceded', coalesce(a.goals_conceded, 0),
               'clean_sheets',   coalesce(a.clean_sheets, 0),
               'wins',           coalesce(a.wins, 0),
               'draws',          coalesce(a.draws, 0),
               'losses',         coalesce(a.losses, 0))
             -- o id desempata: dois jogadores com o mesmo nome trocavam de
             -- lugar entre chamadas e a lista "saltava" a cada refresh
             order by p.name, p.id), '[]'::json)
      from players p
      left join agg a on a.pid = p.id
      where p.approved and (a.pid is not null or p.player_type = 'GOALKEEPER')
    )
  );
$$;

-- ---------- LEITURA: OS GOLEIROS DE UMA RODADA ----------
-- Para o admin reabrir o formulário já preenchido em vez de o reescrever.
create or replace function get_match_gk_stats(p_match uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select coalesce(json_agg(json_build_object(
           'goalkeeper_id', g.goalkeeper_id, 'name', p.name, 'team', g.team,
           'saves', g.saves, 'goals_conceded', g.goals_conceded)
         order by g.team nulls last, p.name, g.goalkeeper_id), '[]'::json)
  from goalkeeper_match_stats g
  join players p on p.id = g.goalkeeper_id
  where g.match_id = p_match;
$$;

-- ---------- PERMISSÕES ----------
grant execute on function admin_save_gk_stats(text, uuid, jsonb) to anon, authenticated;
grant execute on function get_goalkeeper_stats()                 to anon, authenticated;
grant execute on function get_match_gk_stats(uuid)               to anon, authenticated;
