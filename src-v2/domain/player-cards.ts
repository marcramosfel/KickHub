/**
 * Os cards da pelada — as conquistas de cada jogador, com raridade.
 *
 * Nada disto vive na base de dados, e é de propósito: os cards são derivados
 * dos números do momento, por isso é impossível ficarem dessincronizados. Quem
 * perde a artilharia perde o card na mesma hora, sem job nem migração. O preço
 * é recalcular a cada ecrã, o que é barato para um plantel.
 *
 * Duas famílias, e a diferença entre elas é o que as torna interessantes:
 *
 *   - **Lideranças** — ser o melhor do grupo AGORA. Saem dos títulos que o
 *     `player-overall` já calcula, e não de uma segunda tabela de conquistas:
 *     duas listas de "quem é o artilheiro" eram duas listas para discordarem.
 *   - **Marcos** — ter lá chegado. Não dependem de mais ninguém, e por isso
 *     não se perdem quando alguém novo entra a marcar.
 *
 * Há dois cards que medem o overall (o Rei da Pelada e o Paredão) e os títulos
 * não podem fazê-lo. Não é incoerência: um título ENTRA no overall, e medir o
 * overall faria o número alimentar-se a si mesmo. Um card não entra em nada —
 * só mostra.
 *
 * Sem uma palavra traduzida: cada card devolve a sua chave e os números, e é a
 * interface que escreve a frase.
 */

import { TITLE_TIER, type TitleKey } from './player-overall'

export type Rarity = 'common' | 'special' | 'rare' | 'epic' | 'legendary'

/** Ordena a colecção e decide qual é o card principal de um jogador. */
export const RARITY_WEIGHT: Readonly<Record<Rarity, number>> = {
  common: 1, special: 2, rare: 3, epic: 4, legendary: 5,
}

/**
 * A cor é sempre acompanhada de ícone e de texto. Sozinha não distingue nada
 * para quem não separa cores.
 */
export const RARITY_ACCENT: Readonly<Record<Rarity, string>> = {
  common: '#7fa090', special: '#5cd1f5', rare: '#c99bff', epic: '#ff9e3d', legendary: '#ffc531',
}

export type CardKey =
  // lideranças fora dos títulos, porque medem o overall
  | 'kingOfPelada' | 'keeperKing'
  // lideranças vindas dos títulos do overall
  | TitleKey
  // marcos pessoais
  | 'unbeaten5' | 'winStreak4' | 'playmaker10' | 'cleanSheets3' | 'everPresent' | 'joker' | 'legend'
  // o card que toda a gente tem
  | 'base'

export type PlayerCard = {
  key: CardKey
  rarity: Rarity
  accent: string
  /** Quanto vale este card no desempate do card principal. Menor = mais forte. */
  priority: number
  /** Os números que explicam porque foi desbloqueado. A frase é da interface. */
  params: Record<string, number>
  /** Quantos outros partilham a liderança. Zero quando é só dele. */
  sharedWith: number
}

/** O tier de um título já diz o quanto é raro; não há uma segunda escala. */
const TIER_RARITY: Readonly<Record<'ouro' | 'prata' | 'bronze', Rarity>> = {
  ouro: 'epic', prata: 'rare', bronze: 'special',
}

const PRIORITY: Readonly<Record<CardKey, number>> = {
  kingOfPelada: 1, legend: 2, keeperKing: 3,
  topScorer: 10, topAssists: 11, mostWins: 12, mostCraques: 13, mostGames: 14,
  winStreak: 20, accuracy: 21, unbeaten: 22,
  wall: 30, saves: 31,
  unbeaten5: 40, winStreak4: 41, cleanSheets3: 42, playmaker10: 43, everPresent: 44, joker: 45,
  base: 999,
}

export type CardInput = {
  membershipId: string
  displayName: string
  playerType: 'FIELD' | 'GOALKEEPER' | 'HYBRID' | null
  primaryPosition: string | null
  secondaryPosition: string | null
  acceptsOtherPositions: boolean
  /** O overall calculado. `null` = ainda não há. */
  overall: number | null
  /** Provisório não conta para as lideranças: o número não é de confiança. */
  provisional: boolean
  titles: readonly TitleKey[]
  gamesPlayed: number
  goals: number
  assists: number
  wins: number
  saves: number
  craques: number
  currentWinStreak: number
  bestUnbeatenStreak: number
  gkCleanSheets: number
}

const UNBEATEN_CARD = 5
const WIN_STREAK_CARD = 4
const PLAYMAKER_ASSISTS = 10
const CLEAN_SHEETS_CARD = 3
const PRESENCE_MIN_GAMES = 8
const PRESENCE_RATE = 0.8
const LEGEND_GAMES = 30
const LEGEND_CONTRIBUTIONS = 20
const LEGEND_STARS = 3

const keepsGoal = (row: CardInput) => row.playerType === 'GOALKEEPER'

/** Elegível para liderança = tem um overall que a app assume como seu. */
const settled = (row: CardInput) =>
  typeof row.overall === 'number' && Number.isFinite(row.overall) && !row.provisional

/**
 * Quem lidera o overall, entre os elegíveis que a função escolher.
 *
 * Empate premeia todos os empatados: separá-los por um critério inventado era
 * pior do que assumir que empataram.
 */
function leadersByOverall(rows: readonly CardInput[], only: (row: CardInput) => boolean) {
  const candidates = rows.filter((row) => settled(row) && only(row))
  if (!candidates.length) return { value: 0, ids: [] as string[] }
  const value = candidates.reduce((best, row) => Math.max(best, row.overall as number), 0)
  if (value <= 0) return { value: 0, ids: [] as string[] }
  return { value, ids: candidates.filter((row) => row.overall === value).map((row) => row.membershipId) }
}

const card = (key: CardKey, rarity: Rarity, params: Record<string, number>, sharedWith = 0): PlayerCard => ({
  key, rarity, accent: RARITY_ACCENT[rarity], priority: PRIORITY[key] ?? 500, params, sharedWith,
})

export type CardsInput = {
  rows: readonly CardInput[]
  /** Rodadas que a pelada já jogou. Sem elas não há card de presença. */
  totalRounds?: number
}

/**
 * A colecção de cada jogador, do mais raro para o mais fraco.
 *
 * Precisa do plantel inteiro porque metade dos cards são lideranças, e ninguém
 * sabe quem é o artilheiro olhando para uma linha só — a mesma razão pela qual
 * o overall se calcula em plantel.
 */
export function computeCards({ rows, totalRounds = 0 }: CardsInput): Map<string, PlayerCard[]> {
  const king = leadersByOverall(rows, (row) => !keepsGoal(row))
  const keeper = leadersByOverall(rows, keepsGoal)

  return new Map(rows.map((row) => {
    const cards: PlayerCard[] = []
    if (king.ids.includes(row.membershipId)) {
      cards.push(card('kingOfPelada', 'legendary', { overall: king.value }, king.ids.length - 1))
    }
    if (keeper.ids.includes(row.membershipId)) {
      cards.push(card('keeperKing', 'epic', { overall: keeper.value }, keeper.ids.length - 1))
    }
    cards.push(...ownCards(row, totalRounds))
    return [row.membershipId, cards.sort(byImportance)] as const
  }))
}

/**
 * A colecção de um jogador quando só se tem a linha dele — o perfil global, por
 * exemplo, que traz uma linha por pelada e não o plantel de cada uma.
 *
 * Fica sem o Rei da Pelada e sem o Paredão, e é de propósito: essas duas são
 * comparações contra o grupo, e com uma linha só toda a gente seria o melhor de
 * si mesma. Os títulos e os marcos, esses, não precisam de vizinhos — os
 * títulos já vêm calculados contra o plantel pelo servidor.
 */
export function computePlayerCards(row: CardInput, totalRounds = 0): PlayerCard[] {
  return ownCards(row, totalRounds).sort(byImportance)
}

/** O que um jogador ganha por si — títulos já atribuídos, e marcos pessoais. */
function ownCards(row: CardInput, totalRounds: number): PlayerCard[] {
  const cards: PlayerCard[] = []

  // Um título só vira card se o jogador tiver overall assumido. Sem isso, o
  // card dizia "és o artilheiro" a quem a app ainda nem sabe avaliar.
  if (settled(row)) {
    for (const title of row.titles) {
      cards.push(card(title, TIER_RARITY[TITLE_TIER[title]], { value: valueOfTitle(title, row) }))
    }
  }

  if (row.bestUnbeatenStreak >= UNBEATEN_CARD) {
    cards.push(card('unbeaten5', 'epic', { count: row.bestUnbeatenStreak }))
  }
  if (row.currentWinStreak >= WIN_STREAK_CARD) {
    cards.push(card('winStreak4', 'rare', { count: row.currentWinStreak }))
  }
  if (row.assists >= PLAYMAKER_ASSISTS) {
    cards.push(card('playmaker10', 'special', { count: row.assists }))
  }
  if (keepsGoal(row) && row.gkCleanSheets >= CLEAN_SHEETS_CARD) {
    cards.push(card('cleanSheets3', 'epic', { count: row.gkCleanSheets }))
  }
  if (totalRounds > 0 && row.gamesPlayed >= PRESENCE_MIN_GAMES && row.gamesPlayed >= totalRounds * PRESENCE_RATE) {
    cards.push(card('everPresent', 'special', {
      played: row.gamesPlayed, rounds: totalRounds,
      percent: Math.round((row.gamesPlayed / totalRounds) * 100),
    }))
  }
  if (row.primaryPosition && row.secondaryPosition && row.acceptsOtherPositions) {
    cards.push(card('joker', 'special', {}))
  }
  if (row.gamesPlayed >= LEGEND_GAMES
    && row.goals + row.assists >= LEGEND_CONTRIBUTIONS
    && row.craques >= LEGEND_STARS) {
    cards.push(card('legend', 'legendary', {
      games: row.gamesPlayed, contributions: row.goals + row.assists, stars: row.craques,
    }))
  }

  // Sem conquista nenhuma o jogador continua a ter um card. Nunca aparece a
  // par dos outros: é o fundo da colecção, não uma linha dela.
  cards.push(card('base', 'common', {}))
  return cards
}

/** Mais raro primeiro; entre iguais, a prioridade do catálogo desempata. */
function byImportance(left: PlayerCard, right: PlayerCard) {
  return RARITY_WEIGHT[right.rarity] - RARITY_WEIGHT[left.rarity] || left.priority - right.priority
}

/** O número que o título mede, para o card o poder mostrar. */
function valueOfTitle(title: TitleKey, row: CardInput) {
  switch (title) {
    case 'topScorer': return row.goals
    case 'topAssists': return row.assists
    case 'mostWins': return row.wins
    case 'mostCraques': return row.craques
    case 'mostGames': return row.gamesPlayed
    case 'winStreak': return row.currentWinStreak
    case 'unbeaten': return row.bestUnbeatenStreak
    case 'wall': return row.gkCleanSheets
    case 'saves': return row.saves
    // O aproveitamento é uma taxa e não um total; o card mostra os jogos, que
    // é o número que lhe dá contexto.
    case 'accuracy': return row.gamesPlayed
  }
}

/**
 * O card que representa o jogador. Um jogador pode acumular conquistas mas só
 * usa uma moldura: duas ao mesmo tempo tornavam o card ilegível.
 */
export function mainCard(cards: readonly PlayerCard[] | undefined) {
  return cards?.[0] ?? null
}

/** A colecção sem o card de toda a gente, que é o fundo e não uma conquista. */
export function unlockedCards(cards: readonly PlayerCard[] | undefined) {
  return (cards ?? []).filter((entry) => entry.key !== 'base')
}
