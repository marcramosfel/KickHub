import { createRandom, shuffle } from './seeded-random'

/**
 * Sorteio equilibrado de equipas.
 *
 * Função de domínio pura: não conhece Supabase, React nem a Pelada Browns.
 * Recebe jogadores e regras, devolve duas equipas. O motor legado resolvia o
 * mesmo problema mas assumia 7x7 com dois guarda-redes fixos; aqui o formato é
 * um parâmetro, porque uma pelada pode jogar de 5x5 a 11x11.
 *
 * O que esta função equilibra: a soma dos overalls das duas equipas. O que
 * ainda não optimiza: a distribuição por posições dentro da equipa. As posições
 * são respeitadas apenas na regra que as peladas realmente exigem — um
 * guarda-redes de cada lado quando se joga com guarda-redes fixos. Dizer que
 * optimiza posições sem o fazer seria pior do que não prometer.
 */

export type DrawPosition = 'GK' | 'DEF' | 'MID' | 'ATT'
export type DrawPlayerType = 'FIELD' | 'GOALKEEPER' | 'HYBRID'
export type GoalkeeperMode = 'fixed' | 'rotating' | 'mixed'

export type DrawPlayer = {
  id: string
  name: string
  overall: number | null
  playerType: DrawPlayerType | null
  primaryPosition: DrawPosition | null
  secondaryPosition: DrawPosition | null
  acceptsOtherPositions: boolean
}

export type DrawnPlayer = DrawPlayer & {
  /** Overall usado no sorteio: o declarado, ou o neutro quando não existe. */
  effectiveOverall: number
  /** O número é um palpite, não uma avaliação. A interface deve avisar. */
  estimatedOverall: boolean
  isGoalkeeper: boolean
}

export type DrawnTeam = {
  key: 'A' | 'B'
  players: DrawnPlayer[]
  strength: number
  average: number
}

export type BalanceLevel = 'excelente' | 'bom' | 'regular' | 'desequilibrado'

export type DrawResult = {
  teams: [DrawnTeam, DrawnTeam]
  reserves: DrawnPlayer[]
  balance: { difference: number; percentage: number; level: BalanceLevel }
  seed: string
}

export type DrawInput = {
  players: readonly DrawPlayer[]
  teamSize: number
  goalkeeperMode?: GoalkeeperMode
  seed: string
}

export class DrawError extends Error {
  constructor(public readonly code: 'NOT_ENOUGH_PLAYERS' | 'INVALID_TEAM_SIZE') {
    super(code)
    this.name = 'DrawError'
  }
}

/**
 * Quem ainda não tem overall entra como médio. Zero fazia dele um peso morto
 * que o equilíbrio tentaria compensar, e isso é pior do que não saber nada.
 */
export const NEUTRAL_OVERALL = 50

const MAX_IMPROVEMENT_PASSES = 40

export function classifyBalance(strengthA: number, strengthB: number) {
  const difference = Math.abs(strengthA - strengthB)
  const average = (strengthA + strengthB) / 2
  const percentage = average > 0 ? (difference / average) * 100 : 0
  const level: BalanceLevel = percentage <= 2
    ? 'excelente'
    : percentage <= 5
      ? 'bom'
      : percentage <= 8
        ? 'regular'
        : 'desequilibrado'
  return { difference, percentage, level }
}

function normalize(player: DrawPlayer): DrawnPlayer {
  const raw = player.overall
  const numeric = typeof raw === 'number' && Number.isFinite(raw)
  return {
    ...player,
    effectiveOverall: numeric ? Math.round(raw) : NEUTRAL_OVERALL,
    estimatedOverall: !numeric,
    isGoalkeeper: false,
  }
}

const strengthOf = (players: readonly DrawnPlayer[]) =>
  players.reduce((total, player) => total + player.effectiveOverall, 0)

/** Prioriza quem é guarda-redes declarado, depois híbrido, depois posição GK. */
function goalkeeperRank(player: DrawnPlayer) {
  if (player.playerType === 'GOALKEEPER') return 0
  if (player.playerType === 'HYBRID') return 1
  if (player.primaryPosition === 'GK') return 2
  if (player.secondaryPosition === 'GK') return 3
  return 4
}

function pickGoalkeepers(players: DrawnPlayer[]) {
  const candidates = [...players]
    .map((player, index) => ({ player, index, rank: goalkeeperRank(player) }))
    .filter((entry) => entry.rank < 4)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, 2)

  // Com menos de dois guarda-redes não se pode dar um a cada equipa. Nesse caso
  // ninguém é retirado do campo: tirar o único guarda-redes da lista fazia-o
  // desaparecer do sorteio em vez de o pôr a jogar na linha.
  if (candidates.length < 2) {
    return { goalkeepers: [] as DrawnPlayer[], outfield: players }
  }

  const chosen = new Set(candidates.map((entry) => entry.player.id))
  return {
    goalkeepers: candidates.map((entry) => ({ ...entry.player, isGoalkeeper: true })),
    outfield: players.filter((player) => !chosen.has(player.id)),
  }
}

/**
 * Distribuição em serpente (A,B,B,A,…) sobre a lista ordenada por força, e
 * depois trocas locais enquanto reduzirem a diferença. A serpente sozinha já
 * dá um resultado razoável; as trocas apanham os casos em que ela falha, como
 * um plantel com um jogador muito acima dos outros.
 */
function partition(players: DrawnPlayer[]): [DrawnPlayer[], DrawnPlayer[]] {
  const ordered = [...players].sort((a, b) => b.effectiveOverall - a.effectiveOverall)
  const teamA: DrawnPlayer[] = []
  const teamB: DrawnPlayer[] = []

  ordered.forEach((player, index) => {
    const round = Math.floor(index / 2)
    const first = index % 2 === 0
    const toA = round % 2 === 0 ? first : !first
    ;(toA ? teamA : teamB).push(player)
  })

  for (let pass = 0; pass < MAX_IMPROVEMENT_PASSES; pass += 1) {
    let improved = false
    let bestDifference = Math.abs(strengthOf(teamA) - strengthOf(teamB))

    for (let a = 0; a < teamA.length; a += 1) {
      for (let b = 0; b < teamB.length; b += 1) {
        const delta = teamA[a].effectiveOverall - teamB[b].effectiveOverall
        const candidate = Math.abs(strengthOf(teamA) - strengthOf(teamB) - 2 * delta)
        if (candidate < bestDifference) {
          const swap = teamA[a]
          teamA[a] = teamB[b]
          teamB[b] = swap
          bestDifference = candidate
          improved = true
        }
      }
    }

    if (!improved) break
  }

  return [teamA, teamB]
}

export function generateBalancedTeams({ players, teamSize, goalkeeperMode = 'rotating', seed }: DrawInput): DrawResult {
  if (!Number.isInteger(teamSize) || teamSize < 3 || teamSize > 15) {
    throw new DrawError('INVALID_TEAM_SIZE')
  }
  if (players.length < teamSize * 2) {
    throw new DrawError('NOT_ENOUGH_PLAYERS')
  }

  const random = createRandom(seed)
  // Baralhar antes de ordenar faz com que jogadores empatados no overall não
  // caiam sempre na mesma equipa: o sorteio varia sem deixar de ser reproduzível.
  const pool = shuffle(players.map(normalize), random)

  const usesFixedGoalkeepers = goalkeeperMode === 'fixed' || goalkeeperMode === 'mixed'
  const { goalkeepers, outfield } = usesFixedGoalkeepers
    ? pickGoalkeepers(pool)
    : { goalkeepers: [] as DrawnPlayer[], outfield: pool }

  const outfieldPerTeam = teamSize - (goalkeepers.length === 2 ? 1 : 0)
  const starters = outfield.slice(0, outfieldPerTeam * 2)
  const reserves = outfield.slice(outfieldPerTeam * 2)

  const [fieldA, fieldB] = partition(starters)

  const playersA = goalkeepers.length === 2 ? [goalkeepers[0], ...fieldA] : fieldA
  const playersB = goalkeepers.length === 2 ? [goalkeepers[1], ...fieldB] : fieldB

  const strengthA = strengthOf(playersA)
  const strengthB = strengthOf(playersB)

  const teams: [DrawnTeam, DrawnTeam] = [
    { key: 'A', players: playersA, strength: strengthA, average: playersA.length ? strengthA / playersA.length : 0 },
    { key: 'B', players: playersB, strength: strengthB, average: playersB.length ? strengthB / playersB.length : 0 },
  ]

  return { teams, reserves, balance: classifyBalance(strengthA, strengthB), seed }
}
