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
import { nomeDaEquipa } from './substitutions.js'

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
// `nomeDaEquipa` traz o simbolo ("⚫ Pretos"), que serve as etiquetas do campo
// mas nao serve uma frase: "mas ⚫ Pretos foi mais eficaz" nao se le.
const semSimbolo = (n) => String(n || '').replace(/^[^\p{L}]+/u, '').trim()

// `tentativa` a 0 usa o ID do jogo como semente — a previsao de um sorteio e
// SEMPRE a mesma, e e isso que permite ao grupo dizer "a IA disse 5x4".
// Acima de 0 sorteia outra: serve o admin, que pode querer ver outra antes de
// a mandar. Depois de gravada, quem ve le a da base e nao recalcula nada,
// portanto isto nunca faz o numero mudar debaixo de ninguem.
export function preverJogo({ jogo, jogadores = [], nomeA, nomeB, tentativa = 0 } = {}) {
  const { a, b } = lineupsDoJogo(jogo, jogadores)
  if (!a.length || !b.length) return null

  const semente = tentativa ? `${jogo?.id || 'previsao'}#${tentativa}` : jogo?.id || 'previsao'

  const s = simularPartida({
    equipaA: a,
    equipaB: b,
    seed: semente,
    // `nomeDaEquipa` e NAO `jogo.team_a_name`: a base guarda "Amarelos"/"Azuis"
    // (o valor por omissao herdado das rodadas antigas) mas todos os ecras ao
    // vivo mostram Pretos/Brancos. A previsao dizia "Amarelos 11 x 8 Azuis"
    // por cima de um campo com Pretos e Brancos escritos.
    nomeA: nomeA || semSimbolo(nomeDaEquipa('A')),
    nomeB: nomeB || semSimbolo(nomeDaEquipa('B')),
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
    seed: semente,
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

  // Um jogo por jogar tem placar 0-0 por OMISSÃO, e não nulo. Sem esta linha,
  // o sorteio da semana aparecia com o selo "Falhou" no instante em que a
  // previsão era gravada — visto a sério, com o jogo ainda por acontecer.
  // `result_status = 'PUBLISHED'` é a mesma régua que o resto do sistema usa
  // para saber se um jogo já conta.
  //
  // O `!= null` é deliberado: um jogo antigo, de antes desta coluna existir,
  // chega sem `result_status` nenhum e não se pode assumir que não jogou.
  if (jogo?.result_status != null && jogo.result_status !== 'PUBLISHED') return null

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
