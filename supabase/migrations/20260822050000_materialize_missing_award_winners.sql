-- KickHub V2 — gravar os vencedores que a importação da Browns deixou por gravar.
--
-- O `pelada_award_winners` resolve um prémio por duas vias: o vencedor gravado
-- em `game_awards`, ou, quando a rodada ainda não foi decidida, a contagem ao
-- vivo dos votos. A segunda via é explicitamente travada por
-- `game_award_decisions` — decidida a rodada, o resultado congela, e votos que
-- cheguem depois não reescrevem o passado.
--
-- A importação da Browns escreveu uma decisão para **todas** as rodadas
-- fechadas, mas só escreveu o vencedor em `game_awards` para aquelas onde o
-- legado tinha um `craque_final` explícito. As restantes ficaram no pior dos
-- dois mundos: têm decisão, portanto a contagem ao vivo está travada; e não têm
-- vencedor, portanto a via congelada não devolve ninguém. Sete prémios da Browns
-- desapareceram assim, dois deles craques do mesmo jogador — que é exactamente
-- a diferença entre o overall que a app antiga mostra e o que esta mostrava.
--
-- Isto grava-os, com a mesma regra de desempate que o `pelada_award_winners`
-- usa ao vivo: no craque empatam todos os que lideram, no bagre só conta quando
-- há um líder isolado. Uma regra diferente aqui dava um resultado diferente do
-- que a página do jogo mostra, e o problema mudava de sítio em vez de acabar.

insert into public.game_awards (game_id, award, membership_id, pelada_id)
with contagem as (
  select vote.pelada_id, vote.game_id, vote.award, vote.nominee_membership_id,
         count(*)::int as votos
  from public.game_award_votes vote
  group by vote.pelada_id, vote.game_id, vote.award, vote.nominee_membership_id
),
topo as (
  select contagem.pelada_id, contagem.game_id, contagem.award, max(contagem.votos) as maximo
  from contagem
  group by contagem.pelada_id, contagem.game_id, contagem.award
),
empatados as (
  select contagem.pelada_id, contagem.game_id, contagem.award, count(*)::int as quantos
  from contagem
  join topo on topo.pelada_id = contagem.pelada_id
           and topo.game_id = contagem.game_id
           and topo.award = contagem.award
           and contagem.votos = topo.maximo
  group by contagem.pelada_id, contagem.game_id, contagem.award
)
select contagem.game_id, contagem.award, contagem.nominee_membership_id, contagem.pelada_id
from contagem
join topo on topo.pelada_id = contagem.pelada_id
         and topo.game_id = contagem.game_id
         and topo.award = contagem.award
         and contagem.votos = topo.maximo
join empatados on empatados.pelada_id = contagem.pelada_id
              and empatados.game_id = contagem.game_id
              and empatados.award = contagem.award
where (contagem.award = 'craque' or empatados.quantos = 1)
  -- Só onde a decisão travou a contagem ao vivo: uma rodada por decidir continua
  -- a ser resolvida ao vivo, e gravá-la agora era decidi-la por ela.
  and exists (
    select 1 from public.game_award_decisions decisao
    where decisao.game_id = contagem.game_id and decisao.award = contagem.award
  )
  -- E só onde ninguém ficou gravado: um vencedor já escrito — por votos ou por
  -- um admin — é o que vale, e não se toca.
  and not exists (
    select 1 from public.game_awards existente
    where existente.game_id = contagem.game_id and existente.award = contagem.award
  );
