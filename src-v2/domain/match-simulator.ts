/**
 * O motor de simulação de partidas.
 *
 * É a fundação das Curiosidades: o melhor jogo possível, o duelo dos perebas e
 * o campeonato imaginário chamam todos daqui, para não haver três respostas
 * diferentes à mesma pergunta ("quem ganha este jogo?").
 *
 * Quatro regras que o tornam honesto:
 *
 *   1. O melhor NÃO ganha sempre. O resultado sai de uma distribuição, não de
 *      uma comparação. Quanto maior a diferença entre as equipas, maior a
 *      probabilidade do favorito; quanto mais equilibradas, mais imprevisível.
 *      Um jogo em que o favorito ganha 100% das vezes não é um jogo.
 *   2. O overall manda, o histórico ajusta. Golos, assistências e votos de
 *      craque mexem no máximo ±12% — senão quem marcou três golos num jogo
 *      passava à frente de quem tem 90 de overall.
 *   3. Poucos jogos contam pouco. Quem tem dois jogos e quatro golos não tem
 *      uma média de dois golos por jogo: tem pouca informação. As taxas são
 *      encolhidas para a média do lote em jogo.
 *   4. As probabilidades são EXACTAS, somadas da distribuição de Poisson em
 *      vez de amostradas. Não dependem da semente e não tremem entre
 *      aberturas; só o placar concreto é que é sorteado.
 *
 * Nada aqui escreve nada: é conversa de balneário com números por trás. O
 * sorteio a sério vive no `team-draw` e é esse que decide quem joga.
 *
 * Função de domínio pura, e sem uma única palavra traduzida: a narrativa sai
 * como chave e parâmetros, para a interface a escrever na língua de quem lê.
 */

import { createRandom } from './seeded-random'

export type SimPosition = 'GK' | 'DEF' | 'MID' | 'ATT'

export type SimPlayer = {
  id: string
  name: string
  /** O lugar que ocupa NESTE jogo. É o que decide quanto ataca. */
  slot: SimPosition
  /** O overall calculado. Sem ele entra como médio, como no sorteio. */
  overall: number | null
  gamesPlayed: number
  goals: number
  assists: number
  craques: number
  bagres: number
  /** Golos sofridos por jogo de baliza. Só conta para quem vai à baliza. */
  concededPerMatch: number | null
}

/**
 * Quanto cada lugar contribui para o ataque; a defesa é o que sobra. O
 * guarda-redes entra à parte, que tem escala própria.
 */
export const ATTACK_WEIGHT: Readonly<Record<SimPosition, number>> = {
  GK: 0, DEF: 0.15, MID: 0.52, ATT: 0.9,
}

/** O mesmo neutro do `team-draw`, para as duas coisas falarem a mesma língua. */
export const NEUTRAL_OVERALL = 50

/** O histórico não pode virar o jogo sozinho: no máximo ±12% sobre o overall. */
const MAX_ADJUSTMENT = 0.12

/**
 * Encolhimento: com poucos jogos, a taxa de um jogador vale pouco e é puxada
 * para a média. Com 5 jogos vale metade da dele e metade da média; com 20,
 * vale 80% dele. Sem isto, quem jogou uma vez e marcou dois decidia o jogo.
 */
const SHRINK_GAMES = 5

/** Golos por equipa num jogo típico de pelada. Os reais andam entre 5 e 14. */
const BASE_GOALS = 8

/** Acima de 1 exagerava: uma equipa 20% melhor marcava o dobro. */
const EXPONENT = 0.85

/**
 * Um jogo de pelada tem sempre acidentes. Isto impede que uma equipa muito
 * superior leve a probabilidade a 100% — e é o que dá a zebra.
 */
const MIN_GOALS = 2.5

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const overallOf = (player: SimPlayer) =>
  typeof player.overall === 'number' && Number.isFinite(player.overall)
    ? player.overall
    : NEUTRAL_OVERALL

export type MatchContext = {
  goals: number
  assists: number
  conceded: number
}

/**
 * As médias que servem as DUAS equipas. Calibrar cada uma pelo seu próprio
 * lote dava um ajuste diferente ao mesmo jogador conforme o adversário.
 */
export function matchContext(teamA: readonly SimPlayer[], teamB: readonly SimPlayer[]): MatchContext {
  const all = [...teamA, ...teamB]
  const outfield = all.filter((player) => player.slot !== 'GK')
  const games = outfield.reduce((total, player) => total + player.gamesPlayed, 0)
  const keepers = all.filter((player) => player.slot === 'GK' && player.concededPerMatch !== null)
  return {
    goals: games ? outfield.reduce((total, player) => total + player.goals, 0) / games : 0,
    assists: games ? outfield.reduce((total, player) => total + player.assists, 0) / games : 0,
    conceded: keepers.length
      ? keepers.reduce((total, player) => total + (player.concededPerMatch ?? 0), 0) / keepers.length
      : 0,
  }
}

/** A taxa de um jogador, puxada para a média conforme os jogos que tem. */
function shrink(total: number, games: number, average: number) {
  if (games <= 0) return average
  const own = total / games
  const weight = games / (games + SHRINK_GAMES)
  return own * weight + average * (1 - weight)
}

/** O ajuste de histórico de um jogador, já limitado a ±MAX_ADJUSTMENT. */
function historyAdjustment(player: SimPlayer, context: MatchContext) {
  const games = player.gamesPlayed
  const goals = shrink(player.goals, games, context.goals)
  const assists = shrink(player.assists, games, context.assists)

  // Desvio relativo à média do lote. Sem média — ninguém marcou nunca — não há
  // desvio nenhum, e não se inventa um.
  const relative = (value: number, mean: number) => (mean > 0 ? (value - mean) / mean : 0)

  // Craques e bagres valem pouco mas valem: são a opinião de quem esteve lá, e
  // são o único sinal que apanha quem joga bem sem marcar.
  const votes = games > 0 ? (player.craques - player.bagres) / games : 0

  const raw = relative(goals, context.goals) * 0.5
    + relative(assists, context.assists) * 0.3
    + votes * 0.6
  return clamp(raw, -1, 1) * MAX_ADJUSTMENT
}

/**
 * A qualidade do guarda-redes, na escala dele. Sem guarda-redes a defesa fica
 * exposta — que é o que acontece a sério quando ninguém quer ir à baliza.
 */
function goalOf(keeper: SimPlayer | null, context: MatchContext) {
  if (!keeper) return NEUTRAL_OVERALL * 0.8
  const base = overallOf(keeper)
  const conceded = keeper.concededPerMatch
  if (conceded === null || context.conceded <= 0 || keeper.gamesPlayed < 2) return base
  // Sofrer menos que a média do lote é bom; sofrer mais é mau.
  const adjustment = clamp((context.conceded - conceded) / context.conceded, -1, 1) * 0.6
  return base * (1 + clamp(adjustment, -1, 1) * MAX_ADJUSTMENT)
}

export type TeamStrength = {
  attack: number
  defence: number
  midfield: number
  averageOverall: number
  keeper: number
  players: number
}

/** A força de uma equipa, repartida como a interface a mostra. */
export function teamStrength(lineup: readonly SimPlayer[], context: MatchContext): TeamStrength {
  const outfield = lineup.filter((player) => player.slot !== 'GK')
  const keeper = lineup.find((player) => player.slot === 'GK') ?? null

  let attack = 0
  let defence = 0
  let attackWeight = 0
  let defenceWeight = 0
  let overallSum = 0
  const midfield: number[] = []

  for (const player of outfield) {
    const base = overallOf(player)
    const value = base * (1 + historyAdjustment(player, context))
    const forward = ATTACK_WEIGHT[player.slot]
    const back = 1 - forward
    attack += value * forward
    defence += value * back
    attackWeight += forward
    defenceWeight += back
    overallSum += base
    if (player.slot === 'MID') midfield.push(value)
  }

  const keeperValue = goalOf(keeper, context)
  return {
    // Médias ponderadas: uma equipa de seis não fica mais forte que uma de
    // sete só por somar mais parcelas.
    attack: attackWeight ? attack / attackWeight : NEUTRAL_OVERALL,
    // O guarda-redes vale 35% da defesa. Menos e um guarda-redes enorme não se
    // notava; mais e um jogo de sete passava a ser sobre uma pessoa só.
    defence: (defenceWeight ? defence / defenceWeight : NEUTRAL_OVERALL) * 0.65 + keeperValue * 0.35,
    midfield: midfield.length ? midfield.reduce((sum, value) => sum + value, 0) / midfield.length : NEUTRAL_OVERALL,
    averageOverall: outfield.length ? overallSum / outfield.length : NEUTRAL_OVERALL,
    keeper: keeperValue,
    players: outfield.length,
  }
}

/** Golos esperados de cada lado: o ataque de um contra a defesa do outro. */
export function expectedGoals(a: TeamStrength, b: TeamStrength) {
  const ratio = (attack: number, defence: number) => (attack / Math.max(defence, 1)) ** EXPONENT
  return {
    a: Math.max(MIN_GOALS, BASE_GOALS * ratio(a.attack, b.defence)),
    b: Math.max(MIN_GOALS, BASE_GOALS * ratio(b.attack, a.defence)),
  }
}

/** Poisson: P(X = k) para média lambda. */
function poisson(k: number, lambda: number) {
  if (lambda <= 0) return k === 0 ? 1 : 0
  let probability = Math.exp(-lambda)
  for (let index = 1; index <= k; index += 1) probability = (probability * lambda) / index
  return probability
}

const MAX_GOALS_TAIL = 40

/**
 * Probabilidades exactas, somadas da distribuição em vez de amostradas: assim
 * não dependem da semente e não mudam de uma abertura para a outra.
 */
export function outcomeProbabilities(lambdaA: number, lambdaB: number) {
  const pA: number[] = []
  const pB: number[] = []
  for (let k = 0; k <= MAX_GOALS_TAIL; k += 1) {
    pA.push(poisson(k, lambdaA))
    pB.push(poisson(k, lambdaB))
  }
  let winA = 0
  let draw = 0
  let winB = 0
  for (let a = 0; a <= MAX_GOALS_TAIL; a += 1) {
    for (let b = 0; b <= MAX_GOALS_TAIL; b += 1) {
      const probability = pA[a] * pB[b]
      if (a > b) winA += probability
      else if (a === b) draw += probability
      else winB += probability
    }
  }
  // A cauda cortada tira uma fatia minúscula; normalizar mantém a soma em 1 e
  // evita "51% / 11% / 37% = 99%" no ecrã.
  const total = winA + draw + winB || 1
  return { a: winA / total, draw: draw / total, b: winB / total }
}

/** Amostra de uma Poisson (Knuth). Chega de sobra para lambdas desta ordem. */
function samplePoisson(lambda: number, random: () => number) {
  const limit = Math.exp(-lambda)
  let k = 0
  let product = 1
  do {
    k += 1
    product *= random()
  } while (product > limit && k < 200)
  return k - 1
}

/**
 * Reparte `total` golos pelos jogadores, sorteando por peso. Quem ataca mais e
 * quem marca mais tem mais hipóteses — mas qualquer um pode marcar, que é o
 * que acontece numa pelada.
 */
function share(total: number, players: readonly SimPlayer[], weights: readonly number[], random: () => number) {
  const tally = new Map<string, number>()
  if (total <= 0 || !players.length) return tally
  const sum = weights.reduce((value, weight) => value + weight, 0)
  if (sum <= 0) return tally
  for (let goal = 0; goal < total; goal += 1) {
    let ticket = random() * sum
    let index = players.length - 1
    for (let candidate = 0; candidate < weights.length; candidate += 1) {
      ticket -= weights[candidate]
      if (ticket <= 0) { index = candidate; break }
    }
    const player = players[index]
    tally.set(player.id, (tally.get(player.id) ?? 0) + 1)
  }
  return tally
}

export type Tally = { id: string; name: string; total: number }

export type PlayerRating = {
  id: string
  name: string
  slot: SimPosition
  goals: number
  assists: number
  rating: number
}

/**
 * A nota de cada jogador no jogo simulado — é daqui que saem o craque e o
 * bagre. Não é só quem marcou: quem defendeu e quem deu o passe contam.
 */
function ratingsOf({ lineup, goals, assists, conceded, won, drew, context }: {
  lineup: readonly SimPlayer[]
  goals: Map<string, number>
  assists: Map<string, number>
  conceded: number
  won: boolean
  drew: boolean
  context: MatchContext
}): PlayerRating[] {
  return lineup.map((player) => {
    const scored = goals.get(player.id) ?? 0
    const passed = assists.get(player.id) ?? 0
    const base = overallOf(player) / 100
    // O guarda-redes não marca: a nota dele é o que sofreu contra o que se
    // esperava que sofresse.
    let rating = player.slot === 'GK'
      ? base * 2 + ((context.conceded || conceded) - conceded) * 0.8
      : base * 2 + scored * 3 + passed * 1.8
    if (won) rating += 0.8
    else if (drew) rating += 0.3
    return { id: player.id, name: player.name, slot: player.slot, goals: scored, assists: passed, rating }
  })
}

/**
 * A narrativa do jogo, em chave e parâmetros. O domínio não escreve português:
 * é a mesma regra das notificações, que deixaram de guardar texto traduzido.
 */
export type MatchNarrative = {
  key: 'draw' | 'narrow' | 'rout' | 'open'
  params: { winner: string; loser: string; star: string }
}

function narrate(nameA: string, nameB: string, goalsA: number, goalsB: number, star: string): MatchNarrative {
  const winner = goalsA > goalsB ? nameA : nameB
  const loser = goalsA > goalsB ? nameB : nameA
  const difference = Math.abs(goalsA - goalsB)
  const key: MatchNarrative['key'] = goalsA === goalsB
    ? 'draw'
    : difference === 1 ? 'narrow' : difference >= 5 ? 'rout' : 'open'
  return { key, params: { winner, loser, star } }
}

export type SimulatedMatch = {
  nameA: string
  nameB: string
  goalsA: number
  goalsB: number
  probabilities: { a: number; draw: number; b: number }
  expected: { a: number; b: number }
  strength: { a: TeamStrength; b: TeamStrength }
  possession: { a: number; b: number }
  scorers: { a: Tally[]; b: Tally[] }
  assists: { a: Tally[]; b: Tally[] }
  star: PlayerRating | null
  flop: PlayerRating | null
  narrative: MatchNarrative
  seed: string
}

export type SimulateInput = {
  teamA: readonly SimPlayer[]
  teamB: readonly SimPlayer[]
  seed: string
  nameA: string
  nameB: string
}

export function simulateMatch({ teamA, teamB, seed, nameA, nameB }: SimulateInput): SimulatedMatch {
  const context = matchContext(teamA, teamB)
  const strengthA = teamStrength(teamA, context)
  const strengthB = teamStrength(teamB, context)
  const expected = expectedGoals(strengthA, strengthB)
  const probabilities = outcomeProbabilities(expected.a, expected.b)

  const random = createRandom(seed)
  const goalsA = samplePoisson(expected.a, random)
  const goalsB = samplePoisson(expected.b, random)

  const outfieldA = teamA.filter((player) => player.slot !== 'GK')
  const outfieldB = teamB.filter((player) => player.slot !== 'GK')
  const scoringWeight = (player: SimPlayer) =>
    Math.max(0.05, ATTACK_WEIGHT[player.slot] * (overallOf(player) / 100) ** 1.5)
  // A assistência é de quem não marcou; e nem todo o golo tem assistência.
  const assistWeight = (player: SimPlayer) =>
    Math.max(0.05, (1 - ATTACK_WEIGHT[player.slot] * 0.5) * (overallOf(player) / 100))

  const scorersA = share(goalsA, outfieldA, outfieldA.map(scoringWeight), random)
  const scorersB = share(goalsB, outfieldB, outfieldB.map(scoringWeight), random)
  const assistsA = share(Math.round(goalsA * 0.6), outfieldA, outfieldA.map(assistWeight), random)
  const assistsB = share(Math.round(goalsB * 0.6), outfieldB, outfieldB.map(assistWeight), random)

  const ratings = [
    ...ratingsOf({ lineup: teamA, goals: scorersA, assists: assistsA, conceded: goalsB, won: goalsA > goalsB, drew: goalsA === goalsB, context }),
    ...ratingsOf({ lineup: teamB, goals: scorersB, assists: assistsB, conceded: goalsA, won: goalsB > goalsA, drew: goalsA === goalsB, context }),
  ].sort((left, right) => right.rating - left.rating)

  const star = ratings[0] ?? null
  // O bagre não sai da baliza: levar golos numa pelada é do jogo, e a piada
  // deixava de ter graça para quem se ofereceu para lá ir.
  const flop = [...ratings].reverse().find((entry) => entry.slot !== 'GK') ?? null

  const midfieldSum = strengthA.midfield + strengthB.midfield
  const possessionA = midfieldSum ? Math.round((strengthA.midfield / midfieldSum) * 100) : 50

  const nameOf = (lineup: readonly SimPlayer[], id: string) =>
    lineup.find((player) => player.id === id)?.name ?? '—'
  const list = (tally: Map<string, number>, lineup: readonly SimPlayer[]): Tally[] =>
    [...tally.entries()]
      .map(([id, total]) => ({ id, name: nameOf(lineup, id), total }))
      .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name))

  return {
    nameA, nameB, goalsA, goalsB,
    probabilities,
    expected,
    strength: { a: strengthA, b: strengthB },
    // "Posse" é uma estimativa a partir do meio-campo, e é mostrada como tal.
    possession: { a: possessionA, b: 100 - possessionA },
    scorers: { a: list(scorersA, teamA), b: list(scorersB, teamB) },
    assists: { a: list(assistsA, teamA), b: list(assistsB, teamB) },
    star, flop,
    narrative: narrate(nameA, nameB, goalsA, goalsB, star?.name ?? ''),
    seed,
  }
}
