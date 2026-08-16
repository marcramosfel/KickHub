/**
 * Overall calculado a partir do que aconteceu em campo.
 *
 * Função de domínio pura, por pelada. Não existe overall global: o mesmo
 * jogador pode ser decisivo num grupo e mediano noutro, e juntar as duas coisas
 * num número só não significaria nada.
 *
 * O problema difícil não é a fórmula, é a confiança. Quem marcou dois golos no
 * primeiro jogo não é um jogador de 90; quem passou em branco uma vez não é de
 * 20. Por isso o valor é puxado para o neutro enquanto houver poucos jogos, e
 * só ganha peso à medida que a amostra cresce.
 */

export type OverallInput = {
  gamesPlayed: number
  goals: number
  assists: number
  saves: number
  wins: number
  draws: number
  losses: number
}

export const NEUTRAL_OVERALL = 50
export const MIN_OVERALL = 1
export const MAX_OVERALL = 99

/**
 * Jogos "fantasma" que puxam o valor para o neutro. Com cinco, um jogador
 * precisa de cerca de três jornadas para o número começar a dizer algo — que é
 * mais ou menos quando a pelada também já formou uma opinião.
 */
const PRIOR_GAMES = 5

/** Uma assistência vale menos do que um golo, mas não muito menos. */
const ASSIST_WEIGHT = 0.7
/** Defesas acumulam depressa; contam pouco por unidade para não inflacionar guarda-redes. */
const SAVE_WEIGHT = 0.15

/** Pontos de overall por cada golo-equivalente por jogo. */
const CONTRIBUTION_SCALE = 14
/** Pontos de overall entre perder sempre e ganhar sempre. */
const WIN_SCALE = 20

const clamp = (value: number) => Math.min(Math.max(Math.round(value), MIN_OVERALL), MAX_OVERALL)

/** Golos-equivalentes por jogo. Sem jogos, não há contributo a medir. */
export function contributionPerGame(input: OverallInput) {
  if (input.gamesPlayed <= 0) return 0
  const weighted = input.goals + input.assists * ASSIST_WEIGHT + input.saves * SAVE_WEIGHT
  return weighted / input.gamesPlayed
}

/**
 * Percentagem de vitórias sobre jogos decididos, ou null quando não há nenhum.
 * Quem nunca teve um jogo com resultado não é penalizado como se tivesse
 * perdido: entra como 0.5, o mesmo que um equilíbrio perfeito.
 */
export function decidedWinRate(input: OverallInput) {
  const decided = input.wins + input.draws + input.losses
  if (decided === 0) return null
  return (input.wins + input.draws * 0.5) / decided
}

export function computePlayerOverall(input: OverallInput) {
  if (input.gamesPlayed <= 0) return null

  const contribution = contributionPerGame(input) * CONTRIBUTION_SCALE
  const rate = decidedWinRate(input)
  const winBonus = rate === null ? 0 : (rate - 0.5) * WIN_SCALE

  // Encolhimento bayesiano: o desvio face ao neutro vale tanto quanto a amostra
  // o justifica. Sem isto, um único jogo brilhante produzia um 90 permanente.
  const confidence = input.gamesPlayed / (input.gamesPlayed + PRIOR_GAMES)

  return clamp(NEUTRAL_OVERALL + confidence * (contribution + winBonus))
}

/**
 * Quantos jogos faltam para o valor deixar de ser um palpite. Serve para a
 * interface poder dizer que o número ainda é provisório em vez de o apresentar
 * como um facto.
 */
export function isProvisional(input: OverallInput) {
  return input.gamesPlayed > 0 && input.gamesPlayed < PRIOR_GAMES
}
