/**
 * As Curiosidades da pelada: jogos que nunca vão acontecer, simulados como se
 * fossem acontecer.
 *
 * Três, e a estrutura fica preparada para mais:
 *
 *   - O melhor jogo possível — os melhores do plantel, repartidos em duas
 *     equipas EQUILIBRADAS.
 *   - O duelo dos perebas — o mesmo, pelo outro lado da tabela.
 *   - O campeonato imaginário — o plantel repartido em equipas, um
 *     todos-contra-todos e uma final.
 *
 * A regra que os três partilham, e que é o ponto todo: não é "os melhores de
 * um lado e os seguintes do outro". Isso dava um jogo morto e uma conversa
 * curta. É pegar nos N melhores (ou nos N piores) e depois REPARTI-LOS de
 * forma equilibrada, para o jogo valer a pena ser imaginado.
 *
 * A elegibilidade é a mesma da Seleção: só entra quem tem overall calculado.
 * Nos perebas isto não é um detalhe — é o que impede a brincadeira de ser
 * injusta, porque sem ela o duelo enchia-se de gente que chegou há duas
 * semanas e ainda não foi avaliada.
 *
 * Nada disto é sorteio a sério nem toca em nada gravado: o `team-draw` é que
 * decide as equipas que vão a jogo, e continua a ser a única autoridade.
 */

import {
  simulateMatch,
  type PlayerRating,
  type SimPlayer,
  type SimPosition,
  type SimulatedMatch,
} from './match-simulator'
import { createRandom, shuffle } from './seeded-random'
import { DEFAULT_TEAM_SIZE, formationOf } from './pelada-selection'

export type CuriosityPlayer = SimPlayer & {
  playerType: 'FIELD' | 'GOALKEEPER' | 'HYBRID' | null
  /** O número ainda é um palpite. Quem o tem fica de fora das curiosidades. */
  provisional: boolean
}

/** As equipas do campeonato. As duas primeiras são as de sempre da pelada. */
export const CHAMPIONSHIP_TEAMS = [
  { id: 'BLACK', accent: '#8a96a0' },
  { id: 'WHITE', accent: '#f2f5f2' },
  { id: 'BLUE', accent: '#35a7ff' },
  { id: 'RED', accent: '#ff5a5a' },
] as const

export type ChampionshipTeamId = typeof CHAMPIONSHIP_TEAMS[number]['id']

const POINTS = { win: 3, draw: 1 }
const MAX_TEAMS = 4

const eligible = (player: CuriosityPlayer) =>
  typeof player.overall === 'number' && Number.isFinite(player.overall) && !player.provisional

const keepsGoal = (player: CuriosityPlayer) =>
  player.playerType === 'GOALKEEPER' || player.slot === 'GK'

const overallOf = (player: CuriosityPlayer) => player.overall ?? 0

/** Os `count` primeiros por overall — do melhor para o pior, ou ao contrário. */
function extremes(players: readonly CuriosityPlayer[], count: number, best: boolean) {
  return [...players]
    .sort((left, right) => best
      ? overallOf(right) - overallOf(left)
      : overallOf(left) - overallOf(right))
    .slice(0, count)
}

/**
 * Reparte em `teamCount` equipas equilibradas, em serpente sobre a lista
 * ordenada por overall.
 *
 * É a mesma ideia do sorteio oficial, generalizada para mais de duas equipas:
 * o `team-draw` é n=2 com trocas locais por cima, e continua a ser ele que
 * decide os jogos a sério. Aqui não há nada a gravar, e a serpente sozinha
 * chega para as equipas ficarem parecidas.
 *
 * Baralhar antes de ordenar faz com que jogadores empatados no overall não
 * caiam sempre na mesma equipa: varia sem deixar de ser reproduzível.
 */
export function splitIntoTeams(players: readonly CuriosityPlayer[], teamCount: number, seed: string) {
  const random = createRandom(seed)
  const ordered = shuffle(players, random)
    .sort((left, right) => overallOf(right) - overallOf(left))
  const teams: CuriosityPlayer[][] = Array.from({ length: teamCount }, () => [])
  ordered.forEach((player, index) => {
    const round = Math.floor(index / teamCount)
    const position = index % teamCount
    // Serpente: a ordem inverte-se a cada volta, senão a primeira equipa
    // levava sempre o melhor de cada patamar.
    teams[round % 2 === 0 ? position : teamCount - 1 - position].push(player)
  })
  return teams
}

/**
 * Dá um lugar a cada jogador da equipa.
 *
 * O guarda-redes é quem a pelada inscreveu como tal — e, se não houver
 * nenhum, ninguém: numa pelada de baliza a rodar não há guarda-redes, e
 * inventar um dava-lhe uma escala que ele não tem. Os restantes jogam onde
 * jogam; quem não tem posição declarada entra ao meio, que é o lugar neutro.
 */
export function assignSlots(team: readonly CuriosityPlayer[]): SimPlayer[] {
  const keeper = team.find(keepsGoal) ?? null
  return team.map((player) => ({
    ...player,
    slot: (player === keeper
      ? 'GK'
      : player.slot === 'GK' ? 'MID' : player.slot) as SimPosition,
  }))
}

export type Duel = {
  best: boolean
  teamA: SimPlayer[]
  teamB: SimPlayer[]
  match: SimulatedMatch
  formation: string
  /** Diferença de força entre as duas equipas, para a interface a mostrar. */
  balance: { difference: number; percentage: number }
}

export type DuelInput = {
  players: readonly CuriosityPlayer[]
  teamSize?: number
  seed: string
  best?: boolean
  nameA: string
  nameB: string
}

/**
 * `null` em vez de excepção quando não há gente suficiente: um grupo pequeno é
 * uma situação normal, não um erro.
 */
export function buildDuel({ players, teamSize = DEFAULT_TEAM_SIZE, seed, best = true, nameA, nameB }: DuelInput): Duel | null {
  const formation = formationOf(teamSize)
  const available = players.filter(eligible)
  const needed = formation.teamSize * 2
  if (available.length < needed) return null

  const chosen = extremes(available, needed, best)
  const [first, second] = splitIntoTeams(chosen, 2, seed)
  const teamA = assignSlots(first)
  const teamB = assignSlots(second)
  const match = simulateMatch({ teamA, teamB, seed, nameA, nameB })

  const strengthA = first.reduce((total, player) => total + overallOf(player), 0)
  const strengthB = second.reduce((total, player) => total + overallOf(player), 0)
  const average = (strengthA + strengthB) / 2
  return {
    best,
    teamA,
    teamB,
    match,
    formation: formation.name,
    balance: {
      difference: Math.abs(strengthA - strengthB),
      percentage: average > 0 ? (Math.abs(strengthA - strengthB) / average) * 100 : 0,
    },
  }
}

export type StandingRow = {
  id: ChampionshipTeamId
  accent: string
  played: number
  won: number
  drawn: number
  lost: number
  scored: number
  conceded: number
  points: number
}

export type ChampionshipMatch = {
  round: number | 'final'
  teamA: ChampionshipTeamId
  teamB: ChampionshipTeamId
  goalsA: number
  goalsB: number
  star: PlayerRating | null
  scorers: SimulatedMatch['scorers']
  assists: SimulatedMatch['assists']
  probabilities: SimulatedMatch['probabilities']
  narrative: SimulatedMatch['narrative']
}

export type Championship = {
  teams: { id: ChampionshipTeamId; accent: string; players: SimPlayer[]; strength: number }[]
  matches: ChampionshipMatch[]
  standings: StandingRow[]
  final: ChampionshipMatch
  champion: ChampionshipTeamId
  /** A final acabou empatada e o título foi decidido pela classificação. */
  decidedOnTable: boolean
  awards: {
    topScorer: { id: string; name: string; total: number } | null
    topAssists: { id: string; name: string; total: number } | null
    mostStars: { id: string; name: string; total: number } | null
  }
  teamCount: number
  /** Quantos ficaram de fora por não caberem nas equipas. */
  leftOut: number
  seed: string
}

/** Todos contra todos, em pares. */
function fixtures(count: number) {
  const pairs: [number, number][] = []
  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) pairs.push([a, b])
  }
  return pairs
}

function tally(matches: readonly ChampionshipMatch[], teams: Championship['teams']): StandingRow[] {
  const rows = new Map<ChampionshipTeamId, StandingRow>(teams.map((team) => [team.id, {
    id: team.id, accent: team.accent, played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0, points: 0,
  }]))

  for (const match of matches) {
    const a = rows.get(match.teamA)
    const b = rows.get(match.teamB)
    if (!a || !b) continue
    a.played += 1; b.played += 1
    a.scored += match.goalsA; a.conceded += match.goalsB
    b.scored += match.goalsB; b.conceded += match.goalsA
    if (match.goalsA > match.goalsB) { a.won += 1; b.lost += 1; a.points += POINTS.win }
    else if (match.goalsB > match.goalsA) { b.won += 1; a.lost += 1; b.points += POINTS.win }
    else { a.drawn += 1; b.drawn += 1; a.points += POINTS.draw; b.points += POINTS.draw }
  }

  // Pontos, depois saldo, depois golos marcados — e por fim o id, para a ordem
  // não depender da ordem de entrada.
  return [...rows.values()].sort((left, right) =>
    right.points - left.points
    || (right.scored - right.conceded) - (left.scored - left.conceded)
    || right.scored - left.scored
    || left.id.localeCompare(right.id))
}

/** Quem se destacou no campeonato inteiro. Uma categoria sem dados não aparece. */
function awardsOf(matches: readonly ChampionshipMatch[]) {
  const goals = new Map<string, { name: string; total: number }>()
  const assists = new Map<string, { name: string; total: number }>()
  const stars = new Map<string, { name: string; total: number }>()

  const add = (into: Map<string, { name: string; total: number }>, id: string, name: string, amount: number) => {
    const current = into.get(id)
    into.set(id, { name, total: (current?.total ?? 0) + amount })
  }

  for (const match of matches) {
    for (const side of ['a', 'b'] as const) {
      for (const entry of match.scorers[side]) add(goals, entry.id, entry.name, entry.total)
      for (const entry of match.assists[side]) add(assists, entry.id, entry.name, entry.total)
    }
    if (match.star) add(stars, match.star.id, match.star.name, 1)
  }

  const top = (from: Map<string, { name: string; total: number }>) => {
    let leader: { id: string; name: string; total: number } | null = null
    for (const [id, entry] of from) {
      if (!leader || entry.total > leader.total) leader = { id, ...entry }
    }
    return leader
  }

  // "Melhor jogador" é quem foi craque em mais jogos, e é diferente do
  // artilheiro de propósito: dá para o melhor não ser o que mais marca, e é
  // exactamente aí que começa a discussão.
  return { topScorer: top(goals), topAssists: top(assists), mostStars: top(stars) }
}

export type ChampionshipInput = {
  players: readonly CuriosityPlayer[]
  teamSize?: number
  seed: string
}

export function buildChampionship({ players, teamSize = DEFAULT_TEAM_SIZE, seed }: ChampionshipInput): Championship | null {
  const formation = formationOf(teamSize)
  const perTeam = formation.teamSize
  const available = players.filter(eligible)

  // Quantas equipas cabem, entre duas e quatro. Reduz-se o NÚMERO de equipas e
  // não o tamanho delas: o tamanho é o formato que a pelada joga, e mexer-lhe
  // era simular outro jogo.
  const teamCount = Math.min(MAX_TEAMS, Math.floor(available.length / perTeam))
  if (teamCount < 2) return null

  // Quem entra sai à sorte e não por overall: um campeonato em que os piores
  // ficam sempre de fora não é um campeonato do grupo.
  const random = createRandom(`${seed}-draw`)
  const entrants = shuffle(available, random).slice(0, teamCount * perTeam)

  const teams = splitIntoTeams(entrants, teamCount, seed).map((squad, index) => ({
    id: CHAMPIONSHIP_TEAMS[index].id,
    accent: CHAMPIONSHIP_TEAMS[index].accent,
    players: assignSlots(squad),
    strength: squad.reduce((total, player) => total + overallOf(player), 0),
  }))

  const play = (a: typeof teams[number], b: typeof teams[number], round: number | 'final', matchSeed: string): ChampionshipMatch => {
    const match = simulateMatch({ teamA: a.players, teamB: b.players, seed: matchSeed, nameA: a.id, nameB: b.id })
    return {
      round, teamA: a.id, teamB: b.id, goalsA: match.goalsA, goalsB: match.goalsB,
      star: match.star, scorers: match.scorers, assists: match.assists,
      probabilities: match.probabilities, narrative: match.narrative,
    }
  }

  const matches = fixtures(teams.length).map(([a, b], index) =>
    play(teams[a], teams[b], index + 1, `${seed}-${index + 1}`))
  const standings = tally(matches, teams)

  // Semente diferente da fase de grupos, senão a final saía igual ao jogo que
  // os dois finalistas já tinham feito.
  const finalistA = teams.find((team) => team.id === standings[0].id)!
  const finalistB = teams.find((team) => team.id === standings[1].id)!
  const final = play(finalistA, finalistB, 'final', `${seed}-final`)

  // Num empate na final não há prolongamento: ganha quem ficou melhor na fase
  // de grupos, que é a regra mais fácil de aceitar sem discussão.
  const decidedOnTable = final.goalsA === final.goalsB
  const champion = final.goalsA >= final.goalsB ? finalistA.id : finalistB.id

  return {
    teams, matches, standings, final, champion, decidedOnTable,
    awards: awardsOf([...matches, final]),
    teamCount,
    leftOut: available.length - entrants.length,
    seed,
  }
}
