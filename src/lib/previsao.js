// A previsão da pelada para um jogo já sorteado.
//
// Traduz uma escalação (as linhas de `match_lineup`) para o formato que o
// motor de simulação come, corre-o, e devolve um objeto pronto a gravar.
//
// A semente é o ID DO JOGO. Não é um detalhe: sem isso, "gerar a previsão"
// duas vezes para o mesmo sorteio dava dois placares diferentes, e a primeira
// pergunta do grupo seria qual dos dois vale.
//
// Puro: não fala com a API. Quem grava é o `api.adminSaveForecast`.

import { simularPartida } from './simulador.js'

// As linhas da escalação trazem `player_id` e `assigned_position`; as
// estatísticas vivem na lista de jogadores que os ecrãs já têm. Isto junta as
// duas coisas — sem elas o motor ficava só com o overall do momento do sorteio.
export function lineupsDoJogo(jogo, jogadores = []) {
  const linhas = Array.isArray(jogo?.lineup) ? jogo.lineup : []
  const porId = new Map((jogadores || []).map((j) => [j.id, j]))

  const lado = (team) =>
    linhas
      .filter((l) => l.team === team)
      .map((l) => ({
        ...(porId.get(l.player_id) || {}),
        id: l.player_id,
        name: l.name ?? porId.get(l.player_id)?.name ?? '—',
        photo: l.photo ?? porId.get(l.player_id)?.photo ?? null,
        slot: l.assigned_position,
        // O overall do momento do sorteio ganha ao atual: a previsão é sobre
        // o jogo que foi sorteado, e é esse número que o grupo viu.
        overall: l.overall_at_draw ?? porId.get(l.player_id)?.overall ?? null,
      }))

  return { a: lado('A'), b: lado('B') }
}

// Prevê um jogo. Devolve `null` quando não há escalação — sem equipas não há
// previsão nenhuma para fazer, e inventar uma seria pior do que não ter.
export function preverJogo({ jogo, jogadores = [], nomeA, nomeB } = {}) {
  const { a, b } = lineupsDoJogo(jogo, jogadores)
  if (!a.length || !b.length) return null

  const s = simularPartida({
    equipaA: a,
    equipaB: b,
    seed: jogo?.id || 'previsao',
    nomeA: nomeA || jogo?.team_a_name || 'Pretos',
    nomeB: nomeB || jogo?.team_b_name || 'Brancos',
  })

  // O artilheiro previsto é quem marcou mais NESTA simulação, dos dois lados.
  const marcadores = [...s.marcadores.a, ...s.marcadores.b]
  const assistentes = [...s.assistencias.a, ...s.assistencias.b]
  const maior = (lista) =>
    lista.reduce((melhor, x) => (!melhor || x.total > melhor.total ? x : melhor), null)

  return {
    golosA: s.golosA,
    golosB: s.golosB,
    probabilidades: s.probabilidades,
    craqueId: s.craque?.id ?? null,
    craque: s.craque?.name ?? null,
    artilheiroId: maior(marcadores)?.id ?? null,
    artilheiro: maior(marcadores)?.name ?? null,
    assistenteId: maior(assistentes)?.id ?? null,
    assistente: maior(assistentes)?.name ?? null,
    bagreId: s.bagre?.id ?? null,
    bagre: s.bagre?.name ?? null,
    narrativa: s.narrativa,
    seed: jogo?.id || 'previsao',
    nomeA: s.nomeA,
    nomeB: s.nomeB,
  }
}

// Comparação entre o que foi previsto e o que saiu.
//
// "Acertar" é acertar no VENCEDOR (ou no empate), não no placar exato: num
// jogo que acaba 14x12, acertar o placar seria sorte e não previsão. É a mesma
// regra da `forecast_accuracy()` na base — as duas têm de dizer o mesmo.
export function compararComResultado(forecast, jogo) {
  const previstoA = forecast?.gols_a ?? forecast?.golosA
  const previstoB = forecast?.gols_b ?? forecast?.golosB
  const realA = jogo?.score_a
  const realB = jogo?.score_b
  if (previstoA == null || realA == null || realB == null) return null

  const vencedor = (x, y) => (x > y ? 'A' : y > x ? 'B' : 'EMPATE')
  const previu = vencedor(previstoA, previstoB)
  const saiu = vencedor(realA, realB)

  return {
    previu,
    saiu,
    acertou: previu === saiu,
    // Acertar o placar exato é outra coisa, e é raro — mostra-se porque quando
    // acontece dá conversa para uma semana.
    placarExato: previstoA === realA && previstoB === realB,
    previsto: `${previstoA}–${previstoB}`,
    real: `${realA}–${realB}`,
  }
}
