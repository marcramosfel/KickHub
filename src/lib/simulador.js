// O motor de simulação de partidas.
//
// É a fundação das Curiosidades, do Simulador manual e da previsão semanal:
// todos chamam daqui, para não haver três respostas diferentes à mesma
// pergunta ("quem ganha este jogo?").
//
// Regras que o tornam honesto:
//
//   1. O melhor NÃO ganha sempre. O resultado sai de uma distribuição, não de
//      uma comparação. Quanto maior a diferença entre as equipas, maior a
//      probabilidade do favorito; quanto mais equilibradas, mais imprevisível.
//      Um jogo em que o favorito ganha 100% das vezes não é um jogo.
//   2. O overall manda, o histórico ajusta. Golos, assistências, vitórias e
//      votos de craque mexem no máximo ±12% — senão quem marcou três golos
//      num jogo passava à frente de quem tem 90 de overall.
//   3. Poucos jogos contam pouco. Um jogador com dois jogos e quatro golos não
//      tem uma média de dois golos por jogo: tem pouca informação. Por isso as
//      taxas são encolhidas para a média do plantel em jogo (`encolher`).
//   4. Reproduzível: a mesma semente dá exatamente o mesmo jogo. É o que
//      permite guardar a previsão da semana e ela não mudar quando alguém
//      volta a abrir o ecrã — e é o que permite testar isto.
//   5. As probabilidades são EXATAS, não amostradas. Saem da distribuição de
//      Poisson diretamente, portanto não dependem da semente nem tremem entre
//      aberturas.
//
// Puro: recebe as equipas já montadas e não chama nada.

import { criarRandom } from './seed.js'

// Quanto cada lugar contribui para o ataque; a defesa é o que sobra. O goleiro
// entra à parte, que tem escala própria.
export const PESO_ATAQUE = {
  GK: 0,
  'DEF-C': 0.15,
  'DEF-L': 0.15,
  'DEF-R': 0.15,
  'MID-L': 0.5,
  'MID-C': 0.55,
  'MID-R': 0.5,
  ST: 0.9,
  'ST-L': 0.9,
}

// Overall de quem ainda não tem um calculado. O mesmo valor que o drawEngine
// usa, para as duas coisas falarem a mesma língua.
export const OVERALL_NEUTRO = 50

// O histórico não pode virar o jogo sozinho: no máximo ±12% sobre o overall.
const AJUSTE_MAX = 0.12

// Encolhimento: com poucos jogos, a taxa de um jogador vale pouco e é puxada
// para a média. Com 5 jogos vale metade da dele e metade da média; com 20,
// vale 80% dele. Sem isto, quem jogou uma vez e marcou dois decidia o jogo.
const K_JOGOS = 5

// Golos por equipa num jogo típico desta pelada. Não é um palpite: os
// resultados reais andam entre 5 e 14 por lado.
const GOLOS_BASE = 8

// Quanto o desequilíbrio ataque/defesa estica o número de golos. Acima de 1
// exagerava: uma equipa 20% melhor marcava o dobro.
const EXPOENTE = 0.85

// Um jogo de pelada tem sempre acidentes. Isto impede que uma equipa muito
// superior leve a probabilidade a 100% — e é o que dá a zebra.
const GOLOS_MIN = 2.5

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const numOuNulo = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v))

const pesoAtaque = (slot) => PESO_ATAQUE[slot] ?? 0.4

const overallDe = (j) =>
  numOuNulo(j.slot === 'GK' ? (j.gkOverall ?? j.overall) : (j.overall ?? j.fieldOverall)) ??
  OVERALL_NEUTRO

// A taxa de um jogador, puxada para a média conforme os jogos que tem.
function encolher(total, jogos, media) {
  const n = num(jogos)
  if (n <= 0) return media
  const propria = num(total) / n
  const peso = n / (n + K_JOGOS)
  return propria * peso + media * (1 - peso)
}

// A média do conjunto em jogo. Calibrar pelos próprios jogadores em vez de
// constantes evita ter números mágicos que envelhecem quando a pelada muda.
function mediasDoLote(jogadores) {
  const campo = jogadores.filter((j) => j.slot !== 'GK')
  const somaJogos = campo.reduce((s, j) => s + num(j.matches), 0)
  return {
    gols: somaJogos ? campo.reduce((s, j) => s + num(j.goals), 0) / somaJogos : 0,
    assists: somaJogos ? campo.reduce((s, j) => s + num(j.assists), 0) / somaJogos : 0,
  }
}

// O ajuste de histórico de um jogador, já limitado a ±AJUSTE_MAX.
function ajusteDeHistorico(j, medias) {
  const jogos = num(j.matches)
  const gols = encolher(j.goals, jogos, medias.gols)
  const assists = encolher(j.assists, jogos, medias.assists)

  // Desvio relativo à média do lote. Sem média (ninguém marcou nunca) não há
  // desvio nenhum — e não se inventa um.
  const rel = (v, m) => (m > 0 ? (v - m) / m : 0)

  // Votos de craque e de bagre valem pouco mas valem: são a opinião de quem
  // esteve lá, e é o único sinal que apanha quem joga bem sem marcar.
  const votos = jogos > 0 ? (num(j.craques) - num(j.bagres)) / jogos : 0

  const bruto = rel(gols, medias.gols) * 0.5 + rel(assists, medias.assists) * 0.3 + votos * 0.6

  return limitar(bruto, -1, 1) * AJUSTE_MAX
}

// A qualidade do goleiro, na escala dele. Sem goleiro a defesa fica exposta —
// e é o que acontece a sério quando ninguém quer ir à baliza.
function forcaDoGoleiro(gk, medias) {
  if (!gk) return { valor: OVERALL_NEUTRO * 0.8, jogador: null }
  const base = overallDe(gk)
  const sofridos = numOuNulo(gk.goalsConcededPerMatch)
  const defesas = numOuNulo(gk.savePct)

  let ajuste = 0
  // Sofrer menos que a média do lote é bom; sofrer mais é mau. Só conta com
  // jogos suficientes para o número querer dizer alguma coisa.
  if (sofridos != null && medias.golsSofridos > 0 && num(gk.matches) >= 2) {
    ajuste += limitar((medias.golsSofridos - sofridos) / medias.golsSofridos, -1, 1) * 0.6
  }
  if (defesas != null) ajuste += limitar((defesas - 50) / 50, -1, 1) * 0.4

  return { valor: base * (1 + limitar(ajuste, -1, 1) * AJUSTE_MAX), jogador: gk }
}

// A força de uma equipa, repartida como a UI a mostra.
export function forcaDaEquipa(lineup = [], contexto = null) {
  const lista = Array.isArray(lineup) ? lineup : []
  const campo = lista.filter((j) => j.slot !== 'GK')
  const gk = lista.find((j) => j.slot === 'GK') || null

  const medias = contexto || mediasDoLote(lista)

  let ataque = 0
  let defesa = 0
  let pesoAt = 0
  let pesoDef = 0
  let somaOverall = 0
  const meios = []

  for (const j of campo) {
    const base = overallDe(j)
    const valor = base * (1 + ajusteDeHistorico(j, medias))
    const wa = pesoAtaque(j.slot)
    const wd = 1 - wa
    ataque += valor * wa
    defesa += valor * wd
    pesoAt += wa
    pesoDef += wd
    somaOverall += base
    if (String(j.slot).startsWith('MID')) meios.push(valor)
  }

  const baliza = forcaDoGoleiro(gk, medias)

  return {
    // médias ponderadas: uma equipa de seis não fica "mais forte" que uma de
    // sete só por somar mais parcelas
    ataque: pesoAt ? ataque / pesoAt : OVERALL_NEUTRO,
    // O goleiro vale 35% da defesa. Menos do que isso e um goleirão não se
    // notava; mais e um jogo de sete passava a ser sobre uma pessoa só.
    defesa: (pesoDef ? defesa / pesoDef : OVERALL_NEUTRO) * 0.65 + baliza.valor * 0.35,
    meio: meios.length ? meios.reduce((s, v) => s + v, 0) / meios.length : OVERALL_NEUTRO,
    overallMedio: campo.length ? somaOverall / campo.length : OVERALL_NEUTRO,
    guardaRedes: baliza.valor,
    goleiro: baliza.jogador,
    jogadores: campo.length,
  }
}

// As médias que servem as DUAS equipas. Cada uma calibrada pelo seu próprio
// lote dava um ajuste diferente ao mesmo jogador conforme o adversário.
export function contextoDoJogo(lineupA = [], lineupB = []) {
  const todos = [...lineupA, ...lineupB]
  const gks = todos.filter((j) => j.slot === 'GK' && numOuNulo(j.goalsConcededPerMatch) != null)
  return {
    ...mediasDoLote(todos),
    golsSofridos: gks.length
      ? gks.reduce((s, j) => s + num(j.goalsConcededPerMatch), 0) / gks.length
      : 0,
  }
}

// Golos esperados de cada lado: o ataque de um contra a defesa do outro.
export function golosEsperados(fA, fB) {
  const razao = (at, def) => Math.pow(at / Math.max(def, 1), EXPOENTE)
  return {
    a: Math.max(GOLOS_MIN, GOLOS_BASE * razao(fA.ataque, fB.defesa)),
    b: Math.max(GOLOS_MIN, GOLOS_BASE * razao(fB.ataque, fA.defesa)),
  }
}

// Poisson: P(X = k) para média lambda.
function poisson(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0
  let p = Math.exp(-lambda)
  for (let i = 1; i <= k; i++) p = (p * lambda) / i
  return p
}

// Probabilidades EXATAS, somadas da distribuição em vez de amostradas: assim
// não dependem da semente e não mudam de uma abertura para a outra.
export function probabilidades(lambdaA, lambdaB, maxGolos = 40) {
  const pA = []
  const pB = []
  for (let k = 0; k <= maxGolos; k++) {
    pA.push(poisson(k, lambdaA))
    pB.push(poisson(k, lambdaB))
  }
  let vitA = 0
  let empate = 0
  let vitB = 0
  for (let a = 0; a <= maxGolos; a++) {
    for (let b = 0; b <= maxGolos; b++) {
      const p = pA[a] * pB[b]
      if (a > b) vitA += p
      else if (a === b) empate += p
      else vitB += p
    }
  }
  // A cauda cortada em maxGolos tira uma fatia minúscula; normalizar mantém a
  // soma em 1 e evita "51% / 11% / 37% = 99%" no ecrã.
  const total = vitA + empate + vitB || 1
  return { a: vitA / total, empate: empate / total, b: vitB / total }
}

// Amostra de uma Poisson (Knuth). Chega de sobra para lambdas desta ordem.
function amostrarPoisson(lambda, random) {
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= random()
  } while (p > L && k < 200)
  return k - 1
}

// Reparte `total` golos pelos jogadores, sorteando por peso. Quem ataca mais e
// quem marca mais tem mais hipóteses — mas qualquer um pode marcar, que é o
// que acontece numa pelada.
function repartir(total, jogadores, pesos, random) {
  const out = new Map()
  if (total <= 0 || !jogadores.length) return out
  const soma = pesos.reduce((s, v) => s + v, 0)
  if (soma <= 0) return out
  for (let i = 0; i < total; i++) {
    let r = random() * soma
    let idx = jogadores.length - 1
    for (let k = 0; k < pesos.length; k++) {
      r -= pesos[k]
      if (r <= 0) {
        idx = k
        break
      }
    }
    const j = jogadores[idx]
    out.set(j.id, (out.get(j.id) || 0) + 1)
  }
  return out
}

const nomeDe = (lista, id) => lista.find((j) => j.id === id)?.name ?? '—'

// A nota de cada jogador no jogo simulado — é daqui que saem o craque e o
// bagre. Não é só quem marcou: quem defendeu e quem deu o passe contam.
function notasDoJogo({ lineup, golos, assists, sofridos, venceu, empatou, medias }) {
  return lineup.map((j) => {
    const g = golos.get(j.id) || 0
    const a = assists.get(j.id) || 0
    const base = overallDe(j) / 100
    let nota = base * 2 + g * 3 + a * 1.8
    if (j.slot === 'GK') {
      // O goleiro não marca: a nota dele é o que sofreu contra o que se
      // esperava que sofresse.
      const esperado = medias.golsSofridos || sofridos
      nota = base * 2 + (esperado - sofridos) * 0.8
    }
    if (venceu) nota += 0.8
    else if (empatou) nota += 0.3
    return { id: j.id, name: j.name, slot: j.slot, gols: g, assists: a, nota }
  })
}

// Uma descrição curta do jogo, com as regras da casa do `resenha.js`: nada se
// inventa, e a provocação é sobre o jogo e não sobre a pessoa.
function narrar({ nomeA, nomeB, golosA, golosB, craque, random }) {
  const dif = Math.abs(golosA - golosB)
  const vencedor = golosA > golosB ? nomeA : nomeB
  const perdedor = golosA > golosB ? nomeB : nomeA

  if (golosA === golosB) {
    const empates = [
      `Jogo parelho do princípio ao fim: ${nomeA} e ${nomeB} dividiram tudo e não se separaram no placar.`,
      `Ninguém cedeu. ${nomeA} e ${nomeB} trocaram golos até ao apito e o empate ficou justo.`,
    ]
    return empates[Math.floor(random() * empates.length)]
  }
  // Sem artigo antes do nome da equipa: os nomes chegam como "Pretos",
  // "Brancos" ou o que o utilizador escrever no simulador, e "o Brancos" fica
  // errado. Assim serve qualquer nome.
  if (dif === 1) {
    return `Decidido no detalhe: ${vencedor} levou por um golo, e ${perdedor} ainda teve o empate na mão.${
      craque ? ` ${craque} foi quem desequilibrou.` : ''
    }`
  }
  if (dif >= 5) {
    return `Dia inspirado: ${vencedor} abriu cedo e não deu hipótese.${
      craque ? ` ${craque} esteve em todas.` : ''
    }`
  }
  return `Jogo aberto dos dois lados, mas ${vencedor} foi mais eficaz nos momentos que contaram.${
    craque ? ` ${craque} fez a diferença.` : ''
  }`
}

// Simula uma partida. Devolve tudo o que os ecrãs precisam de mostrar.
export function simularPartida({
  equipaA,
  equipaB,
  seed = '',
  nomeA = 'Pretos',
  nomeB = 'Brancos',
} = {}) {
  const lineupA = equipaA?.lineup || equipaA || []
  const lineupB = equipaB?.lineup || equipaB || []
  const medias = contextoDoJogo(lineupA, lineupB)

  const fA = forcaDaEquipa(lineupA, medias)
  const fB = forcaDaEquipa(lineupB, medias)
  const lambda = golosEsperados(fA, fB)
  const prob = probabilidades(lambda.a, lambda.b)

  const random = criarRandom(seed)
  const golosA = amostrarPoisson(lambda.a, random)
  const golosB = amostrarPoisson(lambda.b, random)

  const campoA = lineupA.filter((j) => j.slot !== 'GK')
  const campoB = lineupB.filter((j) => j.slot !== 'GK')
  const peso = (j) => Math.max(0.05, pesoAtaque(j.slot) * (overallDe(j) / 100) ** 1.5)
  // A assistência é de quem não marcou; e nem todo o golo tem assistência.
  const pesoAssist = (j) => Math.max(0.05, (1 - pesoAtaque(j.slot) * 0.5) * (overallDe(j) / 100))

  const marcadoresA = repartir(golosA, campoA, campoA.map(peso), random)
  const marcadoresB = repartir(golosB, campoB, campoB.map(peso), random)
  const assistsA = repartir(Math.round(golosA * 0.6), campoA, campoA.map(pesoAssist), random)
  const assistsB = repartir(Math.round(golosB * 0.6), campoB, campoB.map(pesoAssist), random)

  const notas = [
    ...notasDoJogo({
      lineup: lineupA,
      golos: marcadoresA,
      assists: assistsA,
      sofridos: golosB,
      venceu: golosA > golosB,
      empatou: golosA === golosB,
      medias,
    }),
    ...notasDoJogo({
      lineup: lineupB,
      golos: marcadoresB,
      assists: assistsB,
      sofridos: golosA,
      venceu: golosB > golosA,
      empatou: golosA === golosB,
      medias,
    }),
  ]

  const porNota = [...notas].sort((x, y) => y.nota - x.nota)
  const craque = porNota[0] || null
  // O bagre não sai da baliza: levar golos numa pelada é do jogo, e a piada
  // deixava de ter graça para quem se ofereceu para ir para lá.
  const bagre = [...porNota].reverse().find((n) => n.slot !== 'GK') || null

  const gkA = lineupA.find((j) => j.slot === 'GK') || null
  const gkB = lineupB.find((j) => j.slot === 'GK') || null
  const melhorGoleiro =
    gkA && gkB ? (golosB <= golosA ? gkA : gkB) : gkA || gkB || null

  // "Posse" é uma estimativa a partir do meio-campo, e é mostrada como tal.
  const somaMeio = fA.meio + fB.meio
  const posseA = somaMeio ? Math.round((fA.meio / somaMeio) * 100) : 50

  const lista = (mapa, lineup) =>
    [...mapa.entries()]
      .map(([id, n]) => ({ id, name: nomeDe(lineup, id), total: n }))
      .sort((x, y) => y.total - x.total)

  return {
    nomeA,
    nomeB,
    golosA,
    golosB,
    probabilidades: prob,
    esperados: lambda,
    forcas: { a: fA, b: fB },
    posse: { a: posseA, b: 100 - posseA },
    marcadores: { a: lista(marcadoresA, lineupA), b: lista(marcadoresB, lineupB) },
    assistencias: { a: lista(assistsA, lineupA), b: lista(assistsB, lineupB) },
    craque,
    bagre,
    melhorGoleiro: melhorGoleiro ? { id: melhorGoleiro.id, name: melhorGoleiro.name } : null,
    narrativa: narrar({
      nomeA,
      nomeB,
      golosA,
      golosB,
      craque: craque?.name,
      random,
    }),
    seed,
  }
}
