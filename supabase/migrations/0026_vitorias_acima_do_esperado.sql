-- =====================================================================
--  PELADA BROWNS — Migração 26: vitórias acima do esperado
--
--  O objetivo é premiar quem faz a equipa ganhar. A forma óbvia — a taxa
--  de vitórias — não serve, e não é opinião: correu-se sobre o plantel
--  real e o que ela premiava eram amostras de 1 e 2 jogos. Um jogador com
--  uma vitória em um jogo ficava com 100%; o organizador, com a melhor
--  avaliação do grupo e quatro derrotas, perdia 21 pontos de overall.
--
--  Pior: a taxa bruta luta contra o sorteio. O motor existe para IGUALAR
--  as equipas — se funcionar, as taxas convergem todas para 50% e a
--  parcela mede ruído. E cria realimentação negativa: ganhas, o overall
--  sobe, o motor dá-te companheiros mais fracos, ganhas menos.
--
--  A pergunta certa não é "ganhaste?" — é "ganhaste MAIS DO QUE ERA
--  SUPOSTO?". O sorteio já disse quem era favorito (ficou gravado em
--  `team_a_overall` / `team_b_overall`); aqui mede-se o desvio:
--
--      saldo = resultado_real − resultado_esperado
--
--  Ganhar sendo favorito a 93% vale +0,07. Ganhar sendo favorito a 74%
--  vale +0,26. Perder como azarão a 7% custa 0,07. É isto que separa
--  "fui carregado pela equipa" de "fiz a diferença".
--
--  Só de leitura: não cria colunas nem tabelas, não altera uma linha.
--  São duas views e dois campos novos nas funções de estatísticas.
-- =====================================================================

-- ---------- 1. O RESULTADO ESPERADO DE CADA RODADA ----------
--
-- Curva logística, como no Elo: a diferença de forças vira probabilidade.
-- `ESCALA = 100` foi calibrada para esta pelada — uma diferença de 35
-- pontos (o limiar a partir do qual o sorteio já chama "desequilibrado" a
-- um jogo de ~430 de força) dá ~69% de hipóteses ao favorito. Mais alto
-- achatava tudo para 50%; mais baixo fazia de qualquer desequilíbrio uma
-- certeza, e no futebol 7 não há certezas.
--
-- Rodadas sem forças gravadas (as anteriores à 0016, ou as criadas à mão
-- no painel de rodadas antigas) ficam de FORA: sem sorteio não há
-- expectativa, e inventar uma seria pior do que não ter parcela nenhuma.
create or replace view resultados_esperados as
  select
    m.id                                        as match_id,
    m.played_at,
    m.team_a_overall,
    m.team_b_overall,
    (1.0 / (1.0 + power(10.0, -((m.team_a_overall - m.team_b_overall)::numeric) / 100.0)))
                                                as esperado_a,
    case when m.score_a > m.score_b then 1.0
         when m.score_a < m.score_b then 0.0
         else 0.5
    end                                         as real_a
  from matches_validas m
  where m.team_a_overall is not null
    and m.team_b_overall is not null
    and m.score_a is not null
    and m.score_b is not null;

-- ---------- 2. O SALDO DE CADA JOGADOR ----------
--
-- Para quem jogou na equipa B o saldo é o simétrico:
--   (1 − real_a) − (1 − esperado_a)  =  esperado_a − real_a
--
-- Fica escrito por extenso em vez de simplificado — quem vier a ler isto
-- daqui a um ano tem de conseguir confirmar o sinal sem fazer contas.
--
-- Só entram jogadores com equipa atribuída: sem saber de que lado alguém
-- jogou não há resultado que lhe pertença.
create or replace view saldo_esperado_por_jogador as
  select
    pj.player_id,
    count(*)::int as jogos,
    sum(case when pj.team = 'A' then re.real_a - re.esperado_a
             else (1.0 - re.real_a) - (1.0 - re.esperado_a)
        end)::numeric as saldo
  from participantes_do_jogo pj
  join resultados_esperados re on re.match_id = pj.match_id
  where pj.team in ('A', 'B')
  group by pj.player_id;

-- ---------- 3. AS ESTATÍSTICAS PASSAM A TRAZER O SALDO ----------
--
-- Saem os números CRUS (saldo e jogos), não a nota já calculada. É a
-- mesma regra dos goleiros (0017): o overall vive todo em
-- `src/lib/overall.js`, num sítio só. Duas fórmulas em dois sítios é a
-- forma mais rápida de os números divergirem entre a Home e o perfil.
create or replace function get_player_stats()
returns json language sql security definer set search_path = public, extensions as $$
  with validas as (select id from matches_validas),
  legado as (
    select mv.id as match_id, mv.craque_override, mv.bagre_override
    from matches_validas mv
    where mv.voting_status <> 'CLOSED' or (mv.craque_final is null and mv.bagre_final is null)
  ),
  craque_t as (
    select av.match_id, coalesce(l.craque_override, av.craque_id) as player_id, count(*) as n
    from award_votes av join legado l on l.match_id = av.match_id
    group by av.match_id, coalesce(l.craque_override, av.craque_id)
  ), craque_w as (
    select player_id, count(distinct match_id) as wins from (
      select t.match_id, t.player_id from craque_t t
      where t.n = (select max(n) from craque_t t2 where t2.match_id = t.match_id)
      union
      select l.match_id, l.craque_override from legado l
      where l.craque_override is not null
        and not exists (select 1 from award_votes av where av.match_id = l.match_id)
      union
      select pr.match_id, pr.craque_final from premios_da_rodada pr where pr.craque_final is not null
    ) w group by player_id
  ), bagre_t as (
    select av.match_id, coalesce(l.bagre_override, av.bagre_id) as player_id, count(*) as n
    from award_votes av join legado l on l.match_id = av.match_id
    group by av.match_id, coalesce(l.bagre_override, av.bagre_id)
  ), bagre_w as (
    select player_id, count(distinct match_id) as wins from (
      select t.match_id, t.player_id from bagre_t t
      where t.n = (select max(n) from bagre_t t2 where t2.match_id = t.match_id)
      union
      select l.match_id, l.bagre_override from legado l
      where l.bagre_override is not null
        and not exists (select 1 from award_votes av where av.match_id = l.match_id)
      union
      select pr.match_id, pr.bagre_final from premios_da_rodada pr where pr.bagre_final is not null
    ) w group by player_id
  ), totals as (
    select ms.player_id, count(*) as matches, sum(ms.goals) as goals, sum(ms.assists) as assists
    from match_stats ms
    where ms.match_id in (select id from validas)
    group by ms.player_id
  ), pos as (
    select pr.target_id as player_id,
           round(avg(pr.stars)::numeric, 2) as media,
           count(*)::int                    as n
    from post_ratings_validas pr
    group by pr.target_id
  )
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'name', p.name, 'photo', p.photo_url,
           'matches', coalesce(t.matches, 0),
           'goals',   coalesce(t.goals, 0),
           'assists', coalesce(t.assists, 0),
           'craques', coalesce(cw.wins, 0),
           'bagres',  coalesce(bw.wins, 0),
           'post_rating_avg',   ps.media,
           'post_rating_count', coalesce(ps.n, 0),
           -- null (e não 0) quando não há rodadas com forças gravadas: é o
           -- que diz ao overall para deixar a parcela de fora em vez de a
           -- contar como "exatamente o esperado"
           'wae_saldo',   se.saldo,
           'wae_matches', coalesce(se.jogos, 0))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t    on t.player_id  = p.id
  left join craque_w cw on cw.player_id = p.id
  left join bagre_w bw  on bw.player_id = p.id
  left join pos ps      on ps.player_id = p.id
  left join saldo_esperado_por_jogador se on se.player_id = p.id
  where p.approved;
$$;

-- ---------- 4. O PERFIL TAMBÉM ----------
-- O painel "Como se calcula o overall?" vive no perfil e chama
-- `calcularOverall` com o que esta função devolver. Sem o saldo aqui, a
-- parcela aparecia na Home e desaparecia no perfil — o mesmo jogador com
-- dois overalls diferentes, que é exatamente o que a 0017 evitou.
create or replace function get_player_profile(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  with craque_top as (
    select av.match_id, coalesce(mv.craque_override, av.craque_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join matches_validas mv on mv.id = av.match_id
    group by av.match_id, coalesce(mv.craque_override, av.craque_id)
  ),
  bagre_top as (
    select av.match_id, coalesce(mv.bagre_override, av.bagre_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join matches_validas mv on mv.id = av.match_id
    group by av.match_id, coalesce(mv.bagre_override, av.bagre_id)
  )
  select json_build_object(
    'id', p.id, 'name', p.name, 'user_id', p.user_id, 'photo', p.photo_url,
    'avg',     (select round(avg(r.score)::numeric, 2) from ratings r where r.target_id = p.id),
    'votes',   (select count(*) from ratings r where r.target_id = p.id),
    'matches', (select count(*) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'goals',   (select coalesce(sum(ms.goals), 0) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'assists', (select coalesce(sum(ms.assists), 0) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'craques', (select count(*) from craque_top ct where ct.pid = p.id and ct.n = ct.top)
             + (select count(*) from matches_validas mv
                 where mv.craque_override = p.id
                   and not exists (select 1 from award_votes av where av.match_id = mv.id)),
    'bagres',  (select count(*) from bagre_top  bt where bt.pid = p.id and bt.n = bt.top)
             + (select count(*) from matches_validas mv
                 where mv.bagre_override = p.id
                   and not exists (select 1 from award_votes av where av.match_id = mv.id)),
    'post_rating_avg',   (select round(avg(pr.stars)::numeric, 2) from post_ratings_validas pr
                           where pr.target_id = p.id),
    'post_rating_count', (select count(*)::int from post_ratings_validas pr
                           where pr.target_id = p.id),
    'wae_saldo',   (select se.saldo from saldo_esperado_por_jogador se where se.player_id = p.id),
    'wae_matches', (select coalesce(se.jogos, 0) from saldo_esperado_por_jogador se
                     where se.player_id = p.id),
    'history', (
      select coalesce(json_agg(json_build_object(
               'match_id', m.id, 'played_at', m.played_at,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists,
               'score_a', m.score_a, 'score_b', m.score_b,
               'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
               'post_rating_avg', (select round(avg(pr.stars)::numeric, 2)
                                     from post_ratings_validas pr
                                    where pr.match_id = m.id and pr.target_id = p.id),
               -- quanto é que ESTA rodada valeu acima do esperado
               'wae_saldo', (select case when ms.team = 'A' then re.real_a - re.esperado_a
                                         else (1.0 - re.real_a) - (1.0 - re.esperado_a) end
                               from resultados_esperados re where re.match_id = m.id),
               'craque', exists (select 1 from craque_top c2
                                  where c2.match_id = m.id and c2.pid = p.id and c2.n = c2.top),
               'bagre',  exists (select 1 from bagre_top b2
                                  where b2.match_id = m.id and b2.pid = p.id and b2.n = b2.top))
             order by m.played_at desc, m.created_at desc), '[]'::json)
      from match_stats ms join matches_validas m on m.id = ms.match_id
      where ms.player_id = p.id
    )
  )
  from players p where p.id = p_id;
$$;

-- ---------- PERMISSÕES ----------
-- As views são canalização interna das funções: quem decide o que se vê
-- são elas, não quem souber um id.
revoke select on resultados_esperados          from public, anon, authenticated;
revoke select on saldo_esperado_por_jogador    from public, anon, authenticated;

grant execute on function get_player_stats()   to anon, authenticated;
grant execute on function get_player_profile(uuid) to anon, authenticated;
