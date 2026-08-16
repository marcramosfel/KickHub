/**
 * Overall calculado a partir do que aconteceu em campo e do que o grupo acha.
 *
 * Função de domínio pura, por pelada. Não existe overall global: o mesmo
 * jogador pode ser decisivo num grupo e mediano noutro, e juntar as duas coisas
 * num número só não significaria nada.
 *
 * Três regras governam quase tudo o que está aqui:
 *
 *  1. Premiar mais do que castigar.
 *  2. A ausência de um dado nunca vale zero. Quem ainda não foi avaliado não
 *     leva "zero de avaliação": a parcela sai da conta e os pesos das restantes
 *     são renormalizados. Um zero seria um castigo por algo que não aconteceu.
 *  3. O número tem de ser explicável. `explainOverall` decompõe-o parcela a
 *     parcela com os pesos efetivos, e as parcelas somam ao total — se um dia
 *     deixarem de somar, o painel está errado ou a conta está.
 *
 * O que ainda não existe: votação de craque e bagre, estrelas pós-jogo, saldo
 * de vitórias acima do esperado, títulos e escala própria de guarda-redes.
 * Nenhum desses dados é recolhido hoje, por isso a conta vive na versão de
 * duas parcelas — opinião do grupo e desempenho.
 */

export type OverallInput = {
  gamesPlayed: number
  goals: number
  assists: number
  /**
   * A nota que o grupo dá ao jogador, de 1 a 99. `null` quer dizer que ainda
   * ninguém o avaliou — nunca "zero".
   */
  baseRating?: number | null
}

export const NEUTRAL_OVERALL = 50
export const MIN_OVERALL = 1
export const MAX_OVERALL = 99

/**
 * Jogos "fantasma" que puxam o desempenho para o neutro. Com cinco, um jogador
 * precisa de cerca de três jornadas para essa parcela começar a dizer algo.
 * Só o desempenho encolhe: a opinião do grupo é válida desde o primeiro dia,
 * porque não é uma amostra pequena — é um juízo.
 */
const PRIOR_GAMES = 5

/** Participações por jogo que valem uma parcela de desempenho cheia. */
const FULL_CONTRIBUTION_PER_GAME = 3

/** Uma assistência vale menos do que um golo, mas não muito menos. */
const ASSIST_WEIGHT = 0.7

/** Pesos nominais. Renormalizados sempre que uma parcela não existe. */
const OPINION_WEIGHT = 0.7
const PERFORMANCE_WEIGHT = 0.3

const clamp = (value: number) => Math.min(Math.max(Math.round(value), MIN_OVERALL), MAX_OVERALL)

export type OverallPart = {
  key: 'opinion' | 'performance'
  /** Valor da parcela na escala 0–100. */
  value: number
  /** Peso já renormalizado. Os pesos efetivos somam 1. */
  weight: number
}

export type OverallBreakdown = {
  overall: number
  parts: OverallPart[]
  provisional: boolean
}

/** Golos-equivalentes por jogo. Sem jogos, não há contributo a medir. */
export function contributionPerGame(input: OverallInput) {
  if (input.gamesPlayed <= 0) return 0
  return (input.goals + input.assists * ASSIST_WEIGHT) / input.gamesPlayed
}

/**
 * Desempenho na escala 0–100, encolhido para o neutro enquanto a amostra for
 * pequena. Sem isto, um único jogo brilhante produzia um 90 permanente — e uma
 * jornada em branco, um 20.
 */
function performancePart(input: OverallInput): OverallPart | null {
  if (input.gamesPlayed <= 0) return null
  const raw = Math.min(contributionPerGame(input) / FULL_CONTRIBUTION_PER_GAME, 1) * 100
  const confidence = input.gamesPlayed / (input.gamesPlayed + PRIOR_GAMES)
  return { key: 'performance', value: NEUTRAL_OVERALL + confidence * (raw - NEUTRAL_OVERALL), weight: PERFORMANCE_WEIGHT }
}

function opinionPart(input: OverallInput): OverallPart | null {
  const rating = input.baseRating
  if (rating === null || rating === undefined || !Number.isFinite(rating)) return null
  return { key: 'opinion', value: rating, weight: OPINION_WEIGHT }
}

/**
 * As parcelas que existem, com os pesos renormalizados para somarem 1. Uma
 * parcela em falta não entra a zero: desaparece, e o que resta redistribui-se.
 */
export function explainOverall(input: OverallInput): OverallBreakdown | null {
  const present = [opinionPart(input), performancePart(input)].filter((part): part is OverallPart => part !== null)
  if (present.length === 0) return null

  const total = present.reduce((sum, part) => sum + part.weight, 0)
  const parts = present.map((part) => ({ ...part, weight: part.weight / total }))
  const base = parts.reduce((sum, part) => sum + part.value * part.weight, 0)

  return { overall: clamp(base), parts, provisional: isProvisional(input) }
}

export function computePlayerOverall(input: OverallInput) {
  return explainOverall(input)?.overall ?? null
}

/**
 * Se o número ainda é um palpite. Vale para quem jogou pouco e não tem opinião
 * do grupo que sustente o valor — com nota atribuída, o número não é provisório,
 * é a opinião de quem o vê jogar.
 */
export function isProvisional(input: OverallInput) {
  const hasOpinion = opinionPart(input) !== null
  return !hasOpinion && input.gamesPlayed > 0 && input.gamesPlayed < PRIOR_GAMES
}
