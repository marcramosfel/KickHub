/**
 * Os seis atributos do card, no espírito dos jogos de futebol — mas só com o
 * que a pelada MEDE.
 *
 * A regra que manda aqui: **não inventar**. Um atributo sem dados que o
 * sustentem devolve `null`, e o card mostra "—" em vez de um número bonito e
 * falso. Zero lê-se como "é mau"; ausência lê-se como ausência.
 *
 * Por isso os seis não são os dos jogos comerciais. Velocidade, físico e
 * desarme exigiriam registar sprints, duelos e desarmes — coisas que ninguém
 * apita num sábado de manhã. Ficaram os seis que saem dos números que o grupo
 * produz de facto.
 *
 * Nenhum destes é derivado de outro: cada um vem da sua fonte, senão o card
 * dizia a mesma coisa seis vezes. E nenhum deles é o overall — esse é
 * calculado no `player-overall` e este ficheiro não lhe toca.
 */

export type AttributeId = 'ATA' | 'PAS' | 'DEC' | 'DEF' | 'SEG' | 'SG' | 'REG' | 'VIT' | 'TEC'

export type PlayerAttribute = {
  id: AttributeId
  /** Chave do catálogo i18n. O domínio não escreve português. */
  nameKey: string
  descKey: string
  /** 0–99, ou `null` quando não há dados que o sustentem. */
  value: number | null
}

/** Abaixo disto os rácios por jogo são ruído: dois jogos de sorte davam 99. */
export const MIN_GAMES = 3
/** A média do grupo só conta com votos que cheguem para ela significar algo. */
export const MIN_VOTES = 3

/**
 * O que vale 99 em cada atributo. Números de pelada, não de profissionais.
 *
 * São âncoras explícitas e não a melhor marca do grupo: assim o atributo de um
 * jogador não muda porque OUTRO melhorou.
 */
export const ANCHORS = {
  goalsPerGame: 1.5,
  assistsPerGame: 1,
  starsPerGame: 0.5,
  savesPerGame: 8,
  cleanSheetsPerGame: 0.6,
  rating: 5,
} as const

const FIELD: { id: AttributeId }[] = [
  { id: 'ATA' }, { id: 'PAS' }, { id: 'DEC' }, { id: 'REG' }, { id: 'VIT' }, { id: 'TEC' },
]
const KEEPER: { id: AttributeId }[] = [
  { id: 'DEF' }, { id: 'SEG' }, { id: 'SG' }, { id: 'REG' }, { id: 'VIT' }, { id: 'TEC' },
]

/** Converte um valor bruto numa nota 0–99, com `top` a valer 99. */
export function scale(value: number | null, top: number) {
  if (value === null || !Number.isFinite(value) || top <= 0) return null
  return Math.max(0, Math.min(99, Math.round((value / top) * 99)))
}

export type AttributeInput = {
  playerType: 'FIELD' | 'GOALKEEPER' | 'HYBRID' | null
  primaryPosition: string | null
  gamesPlayed: number
  goals: number
  assists: number
  craques: number
  saves: number
  wins: number | null
  draws: number | null
  losses: number | null
  gkCleanSheets: number
  gkSaves: number
  gkConceded: number
  /** Média que o grupo lhe dá, 0–5. `null` = ninguém avaliou. */
  postRatingAvg: number | null
  postRatingCount: number
}

export const keepsGoal = (row: Pick<AttributeInput, 'playerType' | 'primaryPosition'>) =>
  row.playerType === 'GOALKEEPER' || row.primaryPosition === 'GK'

/**
 * Aproveitamento 0–100 a partir de vitórias, empates e derrotas conhecidas.
 *
 * Quem tem rodadas sem equipa registada — as antigas — não tem aproveitamento,
 * e isso é `null` e não zero.
 */
export function winRatio(row: Pick<AttributeInput, 'wins' | 'draws' | 'losses'>) {
  const wins = row.wins ?? 0
  const draws = row.draws ?? 0
  const losses = row.losses ?? 0
  if (row.wins === null && row.draws === null && row.losses === null) return null
  const decided = wins + draws + losses
  if (!decided) return null
  return Math.round(((wins * 3 + draws) / (decided * 3)) * 100)
}

/**
 * A percentagem de defesas de um guarda-redes.
 *
 * Sem remates à baliza não há percentagem — e um guarda-redes que nunca foi
 * rematado não tem 0% de defesas, tem uma pergunta sem resposta.
 */
export function savePercentage(row: Pick<AttributeInput, 'gkSaves' | 'gkConceded'>) {
  const shots = row.gkSaves + row.gkConceded
  if (shots <= 0) return null
  return Math.round((row.gkSaves / shots) * 100)
}

/**
 * Os seis atributos de um jogador.
 *
 * `totalRounds` é quantas rodadas a pelada já teve — sem isso não há
 * regularidade para calcular, e a regularidade fica `null`.
 */
export function computeAttributes(row: AttributeInput, totalRounds = 0): PlayerAttribute[] {
  const definitions = keepsGoal(row) ? KEEPER : FIELD
  const games = row.gamesPlayed
  const enough = games >= MIN_GAMES

  const perGame = (total: number) => (enough && games > 0 ? total / games : null)

  const values: Record<AttributeId, number | null> = {
    ATA: scale(perGame(row.goals), ANCHORS.goalsPerGame),
    PAS: scale(perGame(row.assists), ANCHORS.assistsPerGame),
    DEC: scale(perGame(row.craques), ANCHORS.starsPerGame),
    DEF: scale(perGame(row.saves), ANCHORS.savesPerGame),
    SEG: savePercentage(row),
    SG: scale(perGame(row.gkCleanSheets), ANCHORS.cleanSheetsPerGame),
    REG: totalRounds > 0 && games > 0 ? Math.min(99, Math.round((games / totalRounds) * 99)) : null,
    VIT: winRatio(row),
    // A média do grupo só entra com votos suficientes: uma estrela solitária
    // não é a opinião do grupo, é a opinião de uma pessoa.
    TEC: row.postRatingCount >= MIN_VOTES && row.postRatingAvg !== null
      ? scale(row.postRatingAvg, ANCHORS.rating)
      : null,
  }

  return definitions.map((definition) => ({
    id: definition.id,
    nameKey: `attr.${definition.id}.name`,
    descKey: `attr.${definition.id}.desc`,
    value: values[definition.id],
  }))
}

/**
 * Quantos atributos têm mesmo dados.
 *
 * A interface usa isto para decidir se mostra a grelha ou uma frase: seis "—"
 * seguidos não são um card, são um erro a fingir que é um card.
 */
export const attributesWithData = (list: readonly PlayerAttribute[]) =>
  list.filter((attribute) => attribute.value !== null).length

/** A faixa de cor de um valor. O número está sempre escrito ao lado. */
export type AttributeBand = 'low' | 'fair' | 'good' | 'great' | 'elite'

export function bandOf(value: number | null): AttributeBand | null {
  if (value === null) return null
  if (value < 50) return 'low'
  if (value < 65) return 'fair'
  if (value < 80) return 'good'
  if (value < 90) return 'great'
  return 'elite'
}
