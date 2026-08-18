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
 * O que ainda não existe: a escala própria de guarda-redes. As parcelas em
 * falta não entram a zero — não são produzidas, e o peso reparte-se pelas que
 * existem.
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
  /**
   * Média das estrelas que os companheiros de equipa lhe deram depois dos
   * jogos, de 1 a 5. `null` = nunca foi avaliado assim.
   */
  postRatingAvg?: number | null
  /** Quantas vezes foi eleito craque e bagre da rodada. Zero é um facto. */
  craques?: number
  bagres?: number
  /**
   * Saldo de vitórias acima do esperado: por cada rodada, o resultado real
   * menos o que a diferença de forças previa. `null` = nenhuma rodada medida.
   */
  waeSaldo?: number | null
  waeMatches?: number
  /** Vitórias seguidas até agora. Alimenta o título de sequência. */
  currentWinStreak?: number
  /**
   * Títulos que este jogador lidera hoje. Não se calculam a partir do próprio
   * jogador: vêm de `computeTitles`, que compara o plantel inteiro.
   */
  titles?: TitleKey[]
  /** Rodadas em que foi escalado como guarda-redes, e o que fez nelas. */
  gkMatches?: number
  gkSaves?: number
  gkConceded?: number
  gkCleanSheets?: number
  /** Pontos de vitória na baliza: 1 por vitória, 0,5 por empate. */
  gkWinPoints?: number
  /**
   * Golos sofridos por jogo, na média da pelada. Como os títulos, vem de olhar
   * para o plantel inteiro — não do próprio jogador.
   */
  gkLeagueConcededPerGame?: number | null
  /**
   * O que a pelada inscreveu este jogador para ser. É o que separa um
   * guarda-redes de alguém a quem calhou a baliza numa rodada de rotação —
   * `gkMatches` sozinho não sabe distinguir os dois.
   */
  playerType?: OverallPlayerType | null
}

/**
 * Redeclarado aqui em vez de importado da camada de dados: o domínio não deve
 * depender do formato das linhas que a interface lhe entrega.
 */
export type OverallPlayerType = 'FIELD' | 'GOALKEEPER' | 'HYBRID'

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

/**
 * Pesos nominais, renormalizados sempre que uma parcela não existe ou pesa
 * menos do que o seu máximo. As quatro do modelo estão aqui.
 */
const OPINION_WEIGHT = 0.4
const PERFORMANCE_WEIGHT = 0.2
const POST_RATING_WEIGHT = 0.25
const WAE_WEIGHT = 0.15

/**
 * Rodadas medidas a partir das quais o saldo pesa o máximo. Abaixo disso o peso
 * **desliza** proporcionalmente, de zero até 15%.
 *
 * A alternativa — ligar a parcela de uma vez às cinco rodadas — fazia um jogador
 * que rendeu exactamente o esperado perder cinco pontos de um dia para o outro,
 * só por cruzar a fronteira. Um número que cai sem nada ter acontecido em campo
 * é impossível de explicar a quem o vê.
 */
const WAE_FULL_MATCHES = 5

/** As estrelas vão de 1 a 5; a parcela vive na escala de 0 a 100 como as outras. */
const MAX_STARS = 5

/**
 * Prémio de craque e castigo de bagre, em pontos somados depois da média.
 *
 * São deliberadamente assimétricos — premiar mais do que castigar é a regra
 * que governa o resto da conta.
 *
 * E contam pela **taxa**, não pelo total: craque em todas as rodadas vale o
 * máximo, craque numa de vinte vale quase nada. Assim quem joga há mais tempo
 * não acumula bónus só por ter jogado mais.
 */
const CRAQUE_BONUS = 9
const BAGRE_PENALTY = 4

/**
 * Cada título vale um ponto. Fixo e pequeno de propósito: os golos já contam no
 * desempenho, e o título é uma medalha, não uma segunda dose da mesma coisa.
 * Proporcional aos golos seria contar os golos duas vezes.
 */
const TITLE_BONUS = 1

/** Vitórias seguidas a partir das quais a marca se ganha. */
const WIN_STREAK_TITLE = 3

/**
 * Escala do guarda-redes.
 *
 * As defesas pesam mais porque são a parte quase inteiramente dele. Golos
 * sofridos, jogos sem sofrer e vitórias dependem também da linha à frente, e
 * por isso valem menos.
 */
const GK_SAVE_WEIGHT = 0.6
const GK_CONCEDED_WEIGHT = 0.2
const GK_CLEAN_SHEET_WEIGHT = 0.1
const GK_WIN_WEIGHT = 0.1

/**
 * Quanto vale cada golo por jogo abaixo da média da pelada. Sofrer um golo a
 * menos do que a média vale 15 pontos de nota.
 */
const GK_CONCEDED_SCALE = 15

/** Rodadas na baliza a partir das quais o número deixa de ser puxado ao neutro. */
const GK_FULL_MATCHES = 5

/**
 * Rodadas na baliza a partir das quais alguém que não está inscrito como
 * guarda-redes passa a ser julgado como um.
 *
 * Numa pelada de goleiros rotativos, `is_goalkeeper` na escalação quer dizer
 * "começou na baliza", não "é guarda-redes". Sem este mínimo, quem jogou uma
 * única rodada e calhou começar lá passava o teste da metade das rodadas e era
 * avaliado pela escala da baliza: a nota do grupo e os golos que marcou nessa
 * mesma rodada caíam da conta. O master prompt diz o contrário — quem começa no
 * gol e roda continua a marcar, a assistir e a ser avaliado.
 */
const GK_MIN_MATCHES = 3

const clamp = (value: number) => Math.min(Math.max(Math.round(value), MIN_OVERALL), MAX_OVERALL)

export type OverallPart = {
  key: 'opinion' | 'performance' | 'postRating' | 'wae'
    | 'gkSaves' | 'gkConceded' | 'gkCleanSheets' | 'gkWins'
  /** Valor da parcela na escala 0–100. */
  value: number
  /** Peso já renormalizado. Os pesos efetivos somam 1. */
  weight: number
}

/**
 * Não são parcelas: não têm peso nem entram na média. Somam-se depois, em
 * pontos, e é por isso que a decomposição os mostra à parte.
 */
export type OverallAdjustment = {
  key: 'craque' | 'bagre' | 'titles'
  points: number
}

export type TitleKey =
  | 'topScorer' | 'topAssists' | 'mostWins' | 'mostCraques' | 'mostGames' | 'winStreak'

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

export type OverallBreakdown = {
  overall: number
  parts: OverallPart[]
  adjustments: OverallAdjustment[]
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

function postRatingPart(input: OverallInput): OverallPart | null {
  const stars = input.postRatingAvg
  if (stars === null || stars === undefined || !Number.isFinite(stars)) return null
  return { key: 'postRating', value: (stars / MAX_STARS) * 100, weight: POST_RATING_WEIGHT }
}

/**
 * A nota do saldo, com 50 a significar "exactamente o esperado".
 *
 * Ganhar sendo favorito a 93% vale +0,07 de saldo; ganhar sendo favorito a 74%
 * vale +0,26. É a pergunta certa numa pelada com sorteio equilibrado: a taxa de
 * vitórias crua luta contra o próprio motor, porque se ele funcionar as taxas
 * convergem para 50% e a parcela passa a medir ruído.
 */
function waePart(input: OverallInput): OverallPart | null {
  const matches = input.waeMatches ?? 0
  const saldo = input.waeSaldo
  if (matches <= 0 || saldo === null || saldo === undefined || !Number.isFinite(saldo)) return null

  const value = Math.min(Math.max(NEUTRAL_OVERALL + (saldo / matches) * 100, 0), 100)
  return { key: 'wae', value, weight: WAE_WEIGHT * Math.min(matches / WAE_FULL_MATCHES, 1) }
}

function opinionPart(input: OverallInput): OverallPart | null {
  const rating = input.baseRating
  if (rating === null || rating === undefined || !Number.isFinite(rating)) return null
  return { key: 'opinion', value: rating, weight: OPINION_WEIGHT }
}

/** A taxa de um prémio por jogo disputado, travada em 1. */
function awardRate(times: number | undefined, gamesPlayed: number) {
  if (!times || times <= 0 || gamesPlayed <= 0) return 0
  return Math.min(times / gamesPlayed, 1)
}

function adjustmentsOf(input: OverallInput): OverallAdjustment[] {
  const craque = awardRate(input.craques, input.gamesPlayed) * CRAQUE_BONUS
  const bagre = awardRate(input.bagres, input.gamesPlayed) * BAGRE_PENALTY
  const titles = (input.titles?.length ?? 0) * TITLE_BONUS
  return [
    ...(craque > 0 ? [{ key: 'craque' as const, points: craque }] : []),
    ...(bagre > 0 ? [{ key: 'bagre' as const, points: -bagre }] : []),
    ...(titles > 0 ? [{ key: 'titles' as const, points: titles }] : []),
  ]
}

/**
 * Quem lidera cada título, comparando o plantel inteiro.
 *
 * Três regras:
 *
 *  - **empate premeia todos** os empatados;
 *  - um título **só existe se o líder tiver mais do que zero** — não há
 *    artilheiro numa pelada sem golos;
 *  - a sequência **não é um lugar único**: é uma marca. Quem chegar a três
 *    leva, e podem ser vários ao mesmo tempo.
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
 * O overall de um plantel inteiro, em duas passagens.
 *
 * Não é uma conveniência: os títulos dependem de comparar todos os jogadores,
 * portanto **não existe** forma correcta de calcular o overall de alguém
 * isoladamente. Esta é a função que a interface usa; `explainOverall` continua
 * a existir para quem já sabe que títulos aquele jogador tem.
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

/**
 * Golos sofridos por jogo, na média de todas as rodadas guardadas da pelada.
 *
 * É contra isto que os golos sofridos de cada guarda-redes se comparam, e não
 * contra um número absoluto: uma pelada onde se marca muito não deve castigar
 * quem lá guarda a baliza. Sem rodadas guardadas não há média — devolve `null`,
 * e a parcela sai da conta.
 */
export function leagueConcededPerGame(rows: readonly OverallInput[]) {
  const matches = rows.reduce((sum, row) => sum + (row.gkMatches ?? 0), 0)
  if (matches <= 0) return null
  return rows.reduce((sum, row) => sum + (row.gkConceded ?? 0), 0) / matches
}

/** Quantas rodadas na baliza justificam julgar alguém como guarda-redes. */
function keepsGoal(input: OverallInput) {
  const gkMatches = input.gkMatches ?? 0
  // Metade ou mais das rodadas na baliza. Um híbrido que lá esteve uma jornada
  // em dez não é um guarda-redes por causa dessa uma.
  if (gkMatches <= 0 || gkMatches * 2 < input.gamesPlayed) return false
  // Quem a pelada inscreveu como guarda-redes é julgado como tal desde a
  // primeira rodada — é para isso que serve a inscrição. Para os restantes a
  // baliza tem de ser hábito e não acaso, senão uma rotação transforma um
  // avançado em guarda-redes por uma jornada.
  return input.playerType === 'GOALKEEPER' || gkMatches >= GK_MIN_MATCHES
}

/**
 * As parcelas de quem guarda a baliza, já encolhidas pela confiança.
 *
 * Encolher parcela a parcela é aritmeticamente igual a encolher o total — a
 * média ponderada é linear — e tem a vantagem de a decomposição continuar a
 * somar ao número mostrado. Um guarda-redes precisa da explicação dele: mostrar
 * o painel da fórmula de campo seria pior do que não ter painel.
 */
function goalkeeperParts(input: OverallInput): OverallPart[] {
  const matches = input.gkMatches ?? 0
  const saves = input.gkSaves ?? 0
  const conceded = input.gkConceded ?? 0
  const confidence = Math.min(matches / GK_FULL_MATCHES, 1)
  const shrink = (value: number) => NEUTRAL_OVERALL + (value - NEUTRAL_OVERALL) * confidence

  const parts: OverallPart[] = []

  // Sem uma bola a caminho da baliza não há defesas a avaliar: a parcela sai da
  // conta em vez de valer zero.
  const attempts = saves + conceded
  if (attempts > 0) {
    parts.push({ key: 'gkSaves', value: shrink((saves / attempts) * 100), weight: GK_SAVE_WEIGHT })
  }

  // Comparam-se com a média da pelada, e não com um número absoluto: é o que
  // torna o valor justo para quem joga atrás de uma defesa que sofre muito.
  const league = input.gkLeagueConcededPerGame
  if (league !== null && league !== undefined && Number.isFinite(league)) {
    const perGame = conceded / matches
    const raw = Math.min(Math.max(NEUTRAL_OVERALL + GK_CONCEDED_SCALE * (league - perGame), 0), 100)
    parts.push({ key: 'gkConceded', value: shrink(raw), weight: GK_CONCEDED_WEIGHT })
  }

  parts.push({
    key: 'gkCleanSheets',
    value: shrink(((input.gkCleanSheets ?? 0) / matches) * 100),
    weight: GK_CLEAN_SHEET_WEIGHT,
  })
  parts.push({
    key: 'gkWins',
    value: shrink(((input.gkWinPoints ?? 0) / matches) * 100),
    weight: GK_WIN_WEIGHT,
  })

  return parts
}

/**
 * As parcelas que existem, com os pesos renormalizados para somarem 1. Uma
 * parcela em falta não entra a zero: desaparece, e o que resta redistribui-se.
 * Os prémios somam-se depois, em pontos.
 */
export function explainOverall(input: OverallInput): OverallBreakdown | null {
  const present = keepsGoal(input)
    ? goalkeeperParts(input)
    : [opinionPart(input), performancePart(input), postRatingPart(input), waePart(input)]
      .filter((part): part is OverallPart => part !== null)
  if (present.length === 0) return null

  const total = present.reduce((sum, part) => sum + part.weight, 0)
  const parts = present.map((part) => ({ ...part, weight: part.weight / total }))
  const base = parts.reduce((sum, part) => sum + part.value * part.weight, 0)
  const adjustments = adjustmentsOf(input)
  const points = adjustments.reduce((sum, item) => sum + item.points, 0)

  return { overall: clamp(base + points), parts, adjustments, provisional: isProvisional(input) }
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
  const judged = opinionPart(input) !== null || postRatingPart(input) !== null
  return !judged && input.gamesPlayed > 0 && input.gamesPlayed < PRIOR_GAMES
}
