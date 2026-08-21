/**
 * Overall do jogador, por pelada.
 *
 * Esta é a especificação da Pelada Browns, escrita pelo dono da pelada e tratada
 * aqui como autoritativa. O que estava antes divergia dela em coisas que mudam o
 * número: a assistência valia menos do que o golo, o desempenho era encolhido por
 * uma amostra pequena, a curva do WAE tinha outra base, e a v1 não existia de
 * todo. Nada disso está aqui agora.
 *
 * Três princípios governam o resto:
 *
 *  1. **Premiar mais do que castigar.** Craque vale +9 e bagre −4. Liderar dá
 *     medalha; não liderar não dá castigo.
 *  2. **A ausência de um dado nunca vale zero.** A parcela sai da conta e os
 *     pesos das restantes renormalizam-se. Um zero seria castigo por algo que
 *     não aconteceu.
 *  3. **O overall nunca se alimenta a si mesmo.** Nenhum título que meça o
 *     próprio overall dá bónus.
 *
 * Duas fórmulas coexistem, por jogador. Um jogador só transita para a v2 quando
 * recebe a **primeira avaliação pós-jogo válida** — o que muda a nota de alguém
 * é ele ser avaliado, não um deploy.
 */

export type OverallPlayerType = 'FIELD' | 'GOALKEEPER' | 'HYBRID'

export type OverallInput = {
  /** Rodadas jogadas. Sem nenhuma, não há desempenho a medir. */
  gamesPlayed: number
  goals: number
  /**
   * Assistências. Valem exactamente o mesmo que um golo no desempenho: a conta
   * é `(golos + assistências) / rodadas`, e não uma média pesada.
   */
  assists: number
  /**
   * A nota do grupo já na escala 0–100 (a média dos votos ×20). `null` quer
   * dizer que ainda ninguém votou — nunca "zero".
   */
  baseRating?: number | null
  /** Média das estrelas dos companheiros, 1 a 5. `null` = nunca foi avaliado. */
  postRatingAvg?: number | null
  /**
   * Quantas avaliações pós-jogo recebeu. É esta contagem, junto com a média,
   * que decide se o jogador está na v1 ou na v2.
   */
  postRatingCount?: number
  craques?: number
  bagres?: number
  /** Saldo acumulado de "real − esperado". `null` = nenhuma rodada medida. */
  waeSaldo?: number | null
  waeMatches?: number
  currentWinStreak?: number
  /** Vêm de `computeTitles`, que compara o plantel inteiro. */
  titles?: TitleKey[]
  /**
   * O que a pelada inscreveu o jogador para ser. Só quem é do **tipo**
   * guarda-redes é julgado pela escala da baliza; um jogador de campo com
   * passagens no gol mantém o overall de campo.
   */
  playerType?: OverallPlayerType | null
  gkMatches?: number
  gkSaves?: number
  gkConceded?: number
  gkCleanSheets?: number
  /** Vitórias com ele na baliza. Conta vitórias, não pontos. */
  gkWins?: number
  gkLeagueConcededPerGame?: number | null
}

export const NEUTRAL_OVERALL = 50
export const MIN_OVERALL = 1
export const MAX_OVERALL = 99

/** Participações por rodada que valem a parcela de desempenho cheia. */
const PARTICIPACOES_TOPO = 3

/** As estrelas vão de 1 a 5; a parcela vive de 0 a 100 como as outras. */
const ESTRELAS_MAX = 5

/** Pesos da v1: a fórmula de quem ainda não foi avaliado pelos companheiros. */
const V1_GRUPO = 0.70
const V1_DESEMPENHO = 0.30

/**
 * Pesos da v2, nos dois extremos da transição. Deslizam com as rodadas medidas
 * em vez de ligarem de uma vez às cinco: senão quem rendeu exactamente o
 * esperado perdia cinco pontos de um dia para o outro só por cruzar a
 * fronteira, e um número que cai sem nada ter acontecido em campo é impossível
 * de explicar a quem o vê.
 */
const V2_GRUPO_INICIO = 0.50
const V2_GRUPO_FIM = 0.40
const V2_VITORIAS_FIM = 0.15
const V2_DESEMPENHO_INICIO = 0.25
const V2_DESEMPENHO_FIM = 0.20
const V2_POS_JOGO = 0.25

/** Rodadas medidas a partir das quais o peso das vitórias é o máximo. */
const WAE_MIN_JOGOS = 5

const CRAQUE_BONUS = 9
const BAGRE_PENALTY = 4
const BONUS_TITULO = 1

/** Vitórias seguidas a partir das quais a marca se ganha. */
const WIN_STREAK_TITLE = 3

/**
 * Escala do guarda-redes. As defesas pesam mais porque são a parte quase
 * inteiramente dele; golos sofridos, jogos sem sofrer e vitórias dependem também
 * da linha à frente.
 */
const GK_SAVE_WEIGHT = 0.60
const GK_CONCEDED_WEIGHT = 0.20
const GK_CLEAN_SHEET_WEIGHT = 0.10
const GK_WIN_WEIGHT = 0.10

/** Quanto vale cada golo por jogo abaixo da média da pelada. */
const GK_CONCEDED_SCALE = 15

/** Rodadas na baliza a partir das quais o número deixa de ser puxado ao neutro. */
const GK_FULL_MATCHES = 5

/** Abaixo disto o número do guarda-redes ainda é um palpite. */
const GK_PROVISIONAL_MATCHES = 3

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

const clampOverall = (value: number) => clamp(Math.round(value), MIN_OVERALL, MAX_OVERALL)

export type OverallPart = {
  key: 'opinion' | 'performance' | 'postRating' | 'wae'
    | 'gkSaves' | 'gkConceded' | 'gkCleanSheets' | 'gkWins'
  /** Valor da parcela na escala 0–100. */
  value: number
  /** Peso já renormalizado. Os pesos efetivos somam 1. */
  weight: number
}

/**
 * Não são parcelas: não têm peso nem entram na média ponderada. Somam-se depois,
 * em pontos, e é por isso que a decomposição os mostra à parte.
 */
export type OverallAdjustment = {
  key: 'craque' | 'bagre' | 'titles'
  points: number
}

export type TitleKey =
  | 'topScorer' | 'topAssists' | 'mostWins' | 'mostCraques' | 'mostGames' | 'winStreak'

export type OverallBreakdown = {
  overall: number
  parts: OverallPart[]
  adjustments: OverallAdjustment[]
  /** Falta informação para o número deixar de ser um palpite. */
  provisional: boolean
  /** 1 enquanto ninguém o avaliou depois de um jogo; 2 a partir daí. */
  version: 1 | 2
}

/** O que cada título mede. Nunca o overall — ver `computeTitles`. */
const TITLE_METRICS: ReadonlyArray<{ key: TitleKey; of: (row: TitleInput) => number }> = [
  { key: 'topScorer', of: (row) => row.goals },
  { key: 'topAssists', of: (row) => row.assists },
  { key: 'mostWins', of: (row) => row.wins },
  { key: 'mostCraques', of: (row) => row.craques ?? 0 },
  { key: 'mostGames', of: (row) => row.gamesPlayed },
]

export type TitleInput = {
  membershipId: string
  gamesPlayed: number
  goals: number
  assists: number
  wins: number
  craques?: number
  currentWinStreak?: number
}

/**
 * Golos e assistências por rodada. Sem rodadas, não há contributo a medir.
 * A assistência vale um golo inteiro: é a conta que a pelada usa.
 */
export function contributionPerGame(input: OverallInput) {
  if (input.gamesPlayed <= 0) return 0
  return (input.goals + input.assists) / input.gamesPlayed
}

/**
 * Desempenho de 0 a 100. Conta desde o primeiro jogo, sem encolhimento: só quem
 * não tem rodada nenhuma fica sem esta parcela, porque um desempenho a zero
 * seria castigo por algo que não aconteceu.
 */
function desempenhoOf(input: OverallInput) {
  if (input.gamesPlayed <= 0) return null
  return Math.min(contributionPerGame(input) / PARTICIPACOES_TOPO, 1) * 100
}

function grupoOf(input: OverallInput) {
  const rating = input.baseRating
  if (rating === null || rating === undefined || !Number.isFinite(rating)) return null
  return rating
}

/**
 * A nota das estrelas dos companheiros. Vale os 25% inteiros à primeira nota — a
 * média é a média de quem votou, e diminuir-lhe o peso seria fingir que ela diz
 * menos do que diz. A UI mostra de quantas avaliações vem, sem lhe mexer.
 */
function posJogoOf(input: OverallInput) {
  const stars = input.postRatingAvg
  const count = input.postRatingCount ?? 0
  if (count <= 0 || stars === null || stars === undefined || !Number.isFinite(stars)) return null
  return (stars / ESTRELAS_MAX) * 100
}

/**
 * Vitórias acima do esperado, com 50 a significar "exactamente o esperado".
 *
 * A pergunta não é "ganhaste?" — é "ganhaste mais do que era suposto?". A taxa
 * de vitórias crua luta contra o próprio sorteio, que existe para igualar as
 * equipas: se ele funcionar, as taxas convergem para 50% e a parcela passa a
 * medir ruído.
 *
 * A nota é crua. Quem trata da falta de dados é o **peso**, não o valor.
 */
function vitoriasOf(input: OverallInput) {
  const matches = input.waeMatches ?? 0
  const saldo = input.waeSaldo
  if (matches <= 0 || saldo === null || saldo === undefined || !Number.isFinite(saldo)) return null
  return clamp(NEUTRAL_OVERALL + (saldo / matches) * 100, 0, 100)
}

/** Os pesos da v2 no ponto da transição em que este jogador está. Somam 1. */
export function pesosDaTransicao(waeMatches: number) {
  const t = Math.min(Math.max(waeMatches, 0) / WAE_MIN_JOGOS, 1)
  return {
    grupo: V2_GRUPO_INICIO + (V2_GRUPO_FIM - V2_GRUPO_INICIO) * t,
    vitorias: V2_VITORIAS_FIM * t,
    desempenho: V2_DESEMPENHO_INICIO + (V2_DESEMPENHO_FIM - V2_DESEMPENHO_INICIO) * t,
    posJogo: V2_POS_JOGO,
  }
}

/** A taxa de um prémio por rodada disputada, travada em 1. */
function awardRate(times: number | undefined, gamesPlayed: number) {
  if (!times || times <= 0 || gamesPlayed <= 0) return 0
  return Math.min(times / gamesPlayed, 1)
}

/**
 * Prémios e títulos, em pontos, somados **depois** da média ponderada.
 *
 * Contam pela taxa e nunca pelo total: craque em todas as rodadas vale o máximo,
 * craque numa de vinte vale quase nada. Assim quem joga há mais tempo não
 * acumula bónus só por ter jogado mais.
 */
function adjustmentsOf(input: OverallInput): OverallAdjustment[] {
  const craque = awardRate(input.craques, input.gamesPlayed) * CRAQUE_BONUS
  const bagre = awardRate(input.bagres, input.gamesPlayed) * BAGRE_PENALTY
  const titles = (input.titles?.length ?? 0) * BONUS_TITULO
  return [
    ...(craque > 0 ? [{ key: 'craque' as const, points: craque }] : []),
    ...(bagre > 0 ? [{ key: 'bagre' as const, points: -bagre }] : []),
    ...(titles > 0 ? [{ key: 'titles' as const, points: titles }] : []),
  ]
}

const sumAdjustments = (adjustments: OverallAdjustment[]) =>
  adjustments.reduce((total, item) => total + item.points, 0)

/**
 * Quem lidera cada título, comparando o plantel inteiro.
 *
 * Empate premeia todos os empatados; um título só existe se o líder tiver mais
 * do que zero — não há artilheiro numa pelada sem golos. A sequência não é um
 * lugar único: é uma marca, e quem chegar a três leva.
 *
 * Nenhum título mede o overall. Se medisse, o número passaria a alimentar-se a
 * si mesmo e o resultado dependeria da ordem por que fossem calculados.
 */
export function computeTitles(rows: readonly TitleInput[]): Map<string, TitleKey[]> {
  const titles = new Map<string, TitleKey[]>(rows.map((row) => [row.membershipId, []]))
  const add = (membershipId: string, key: TitleKey) => titles.get(membershipId)?.push(key)

  for (const metric of TITLE_METRICS) {
    const best = rows.reduce((max, row) => Math.max(max, metric.of(row)), 0)
    if (best <= 0) continue
    for (const row of rows) if (metric.of(row) === best) add(row.membershipId, metric.key)
  }

  for (const row of rows) {
    if ((row.currentWinStreak ?? 0) >= WIN_STREAK_TITLE) add(row.membershipId, 'winStreak')
  }

  return titles
}

/**
 * Golos sofridos por jogo, na média de todas as rodadas de baliza da pelada.
 *
 * É contra isto que os golos sofridos de cada guarda-redes se comparam, e não
 * contra um número absoluto: uma pelada onde se marca muito não deve castigar
 * quem lá guarda a baliza.
 */
export function leagueConcededPerGame(rows: readonly OverallInput[]) {
  const matches = rows.reduce((sum, row) => sum + (row.gkMatches ?? 0), 0)
  if (matches <= 0) return null
  return rows.reduce((sum, row) => sum + (row.gkConceded ?? 0), 0) / matches
}

/**
 * O overall de um plantel inteiro, em duas passagens.
 *
 * Não é conveniência: os títulos dependem de comparar todos os jogadores,
 * portanto **não existe** forma correcta de calcular o overall de alguém
 * isoladamente. Ninguém sabe quem é o artilheiro olhando para uma linha só.
 */
export function explainSquadOverall<T extends OverallInput & TitleInput>(
  rows: readonly T[],
): Map<string, OverallBreakdown> {
  const titles = computeTitles(rows)
  const gkLeagueConcededPerGame = leagueConcededPerGame(rows)
  return new Map(
    rows
      .map((row) => [row.membershipId, explainOverall({
        ...row,
        titles: titles.get(row.membershipId),
        gkLeagueConcededPerGame,
      })] as const)
      .filter((entry): entry is [string, OverallBreakdown] => entry[1] !== null),
  )
}

/** Só quem a pelada inscreveu como guarda-redes é julgado pela escala dele. */
function keepsGoal(input: OverallInput) {
  return input.playerType === 'GOALKEEPER'
}

/**
 * A escala da baliza. Não cabe na fórmula de campo: um guarda-redes não marca e
 * não assiste, e a opinião do grupo sozinha castiga quem passa a rodada a
 * apanhar bolas.
 *
 * A escala é 0–100 e não 1–99, e os títulos entram **depois** da confiança.
 */
function goalkeeperOverall(input: OverallInput): OverallBreakdown | null {
  const matches = input.gkMatches ?? 0
  if (matches <= 0) return null

  const saves = input.gkSaves ?? 0
  const conceded = input.gkConceded ?? 0
  const attempts = saves + conceded
  const saveRate = attempts > 0 ? clamp(saves / attempts, 0, 1) : 0
  const concededPerMatch = conceded / matches
  // Sem média da pelada usa-se a do próprio, que dá exactamente 50: um neutro
  // honesto vale mais do que uma referência inventada.
  const league = input.gkLeagueConcededPerGame ?? concededPerMatch
  const concededScore = clamp(NEUTRAL_OVERALL + GK_CONCEDED_SCALE * (league - concededPerMatch), 0, 100)
  const cleanSheetRate = clamp((input.gkCleanSheets ?? 0) / matches, 0, 1)
  const winRate = clamp((input.gkWins ?? 0) / matches, 0, 1)

  const parts: OverallPart[] = [
    { key: 'gkSaves', value: saveRate * 100, weight: GK_SAVE_WEIGHT },
    { key: 'gkConceded', value: concededScore, weight: GK_CONCEDED_WEIGHT },
    { key: 'gkCleanSheets', value: cleanSheetRate * 100, weight: GK_CLEAN_SHEET_WEIGHT },
    { key: 'gkWins', value: winRate * 100, weight: GK_WIN_WEIGHT },
  ]

  const raw = parts.reduce((sum, part) => sum + part.value * part.weight, 0)
  // A confiança impede que uma rodada de sorte, ou de azar, mande alguém para o
  // topo ou para o fundo.
  const confidence = Math.min(matches / GK_FULL_MATCHES, 1)
  const titles = (input.titles?.length ?? 0) * BONUS_TITULO
  const adjustments: OverallAdjustment[] = titles > 0 ? [{ key: 'titles', points: titles }] : []

  return {
    overall: Math.round(clamp(NEUTRAL_OVERALL + (raw - NEUTRAL_OVERALL) * confidence + titles, 0, 100)),
    // Encolher parcela a parcela é aritmeticamente igual a encolher o total — a
    // média ponderada é linear — e mantém a decomposição a somar ao número.
    parts: parts.map((part) => ({
      ...part,
      value: NEUTRAL_OVERALL + (part.value - NEUTRAL_OVERALL) * confidence,
    })),
    adjustments,
    provisional: matches < GK_PROVISIONAL_MATCHES,
    version: 2,
  }
}

/** A fórmula de quem ainda não recebeu nenhuma avaliação pós-jogo. */
function fieldOverallV1(
  input: OverallInput, grupo: number | null, desempenho: number | null,
): OverallBreakdown | null {
  // Sem nota do grupo e sem rodadas não há nada com que responder, e um número
  // bonito e falso é pior do que a ausência dele.
  if (grupo === null && desempenho === null) return null

  const adjustments = adjustmentsOf(input)

  // Quem não tem notas do grupo — ou não tem rodadas — também não tem prémios
  // que contem: os ramos parciais não levam extras.
  if (grupo === null) {
    return {
      overall: clampOverall(desempenho as number),
      parts: [{ key: 'performance', value: desempenho as number, weight: 1 }],
      adjustments: [],
      provisional: true,
      version: 1,
    }
  }

  if (desempenho === null) {
    return {
      overall: clampOverall(grupo),
      parts: [{ key: 'opinion', value: grupo, weight: 1 }],
      adjustments: [],
      provisional: true,
      version: 1,
    }
  }

  const parts: OverallPart[] = [
    { key: 'opinion', value: grupo, weight: V1_GRUPO },
    { key: 'performance', value: desempenho, weight: V1_DESEMPENHO },
  ]
  const base = parts.reduce((sum, part) => sum + part.value * part.weight, 0)
  return {
    overall: clampOverall(base + sumAdjustments(adjustments)),
    parts,
    adjustments,
    provisional: false,
    version: 1,
  }
}

/**
 * As parcelas que existem, com os pesos renormalizados para somarem 1. Uma
 * parcela em falta não entra a zero: desaparece, e o que resta redistribui-se.
 */
export function explainOverall(input: OverallInput): OverallBreakdown | null {
  if (keepsGoal(input)) return goalkeeperOverall(input)

  const grupo = grupoOf(input)
  const desempenho = desempenhoOf(input)
  const posJogo = posJogoOf(input)

  // A transição é do jogador, não do deploy: só acontece quando ele recebe a
  // primeira avaliação pós-jogo válida.
  if (posJogo === null) return fieldOverallV1(input, grupo, desempenho)

  const vitorias = vitoriasOf(input)
  const waeMatches = vitorias === null ? 0 : (input.waeMatches ?? 0)
  const pesos = pesosDaTransicao(waeMatches)

  const present: OverallPart[] = [{ key: 'postRating', value: posJogo, weight: pesos.posJogo }]
  if (grupo !== null) present.push({ key: 'opinion', value: grupo, weight: pesos.grupo })
  if (vitorias !== null && pesos.vitorias > 0) {
    present.push({ key: 'wae', value: vitorias, weight: pesos.vitorias })
  }
  if (desempenho !== null) present.push({ key: 'performance', value: desempenho, weight: pesos.desempenho })

  const total = present.reduce((sum, part) => sum + part.weight, 0)
  const parts = present.map((part) => ({ ...part, weight: part.weight / total }))
  const base = parts.reduce((sum, part) => sum + part.value * part.weight, 0)
  const adjustments = adjustmentsOf(input)

  return {
    overall: clampOverall(base + sumAdjustments(adjustments)),
    parts,
    adjustments,
    provisional: false,
    version: 2,
  }
}

export function computePlayerOverall(input: OverallInput) {
  return explainOverall(input)?.overall ?? null
}

/**
 * Se o número ainda é um palpite: falta informação que o sustente. Quem já foi
 * avaliado pelos companheiros nunca é provisório — a v2 tem sempre a parcela
 * que a define.
 */
export function isProvisional(input: OverallInput) {
  return explainOverall(input)?.provisional ?? true
}

/**
 * O peso das vitórias ainda vai subir: conta com menos rodadas medidas do que as
 * cinco que dão o peso cheio. A UI diz isto sem sugerir que o valor está errado.
 */
export function isWaeProvisional(input: OverallInput) {
  const matches = input.waeMatches ?? 0
  return matches > 0 && matches < WAE_MIN_JOGOS
}

/** Exactamente uma avaliação pós-jogo. O peso não muda; a confiança é que é pouca. */
export function isPostRatingProvisional(input: OverallInput) {
  return (input.postRatingCount ?? 0) === 1
}
