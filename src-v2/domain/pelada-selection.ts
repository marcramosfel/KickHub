/**
 * A Seleção da Pelada — e a anti-seleção.
 *
 * Não decide nada e não é o sorteio: o `team-draw` é que monta as equipas que
 * vão a jogo. Isto é a conversa da semana. O ranking já diz quem é o melhor,
 * mas ninguém discute uma tabela; um onze montado põe toda a gente a explicar
 * porque é que devia lá estar.
 *
 * Duas regras herdadas do produto Browns, e é delas que vem a honestidade:
 *
 *   1. É POR POSIÇÃO, não os N melhores overalls. Uma equipa com seis
 *      atacantes não é a melhor equipa possível — e chamar-lhe isso era
 *      mentir com números certos. Cada lugar da formação vai ao melhor de
 *      quem lá joga.
 *   2. Só entra quem tem overall CALCULADO. Quem ainda está a ser avaliado
 *      tem um número que a própria app diz não ser de confiança, e enchia a
 *      anti-seleção de gente que só teve o azar de chegar há duas semanas.
 *
 * Função de domínio pura: recebe o plantel já cruzado com o overall e não
 * conhece Supabase nem React.
 */

export type SelectionPosition = 'GK' | 'DEF' | 'MID' | 'ATT'

export type SelectionPlayer = {
  membershipId: string
  displayName: string
  playerType: 'FIELD' | 'GOALKEEPER' | 'HYBRID' | null
  primaryPosition: SelectionPosition | null
  secondaryPosition: SelectionPosition | null
  acceptsOtherPositions: boolean
  /** O overall calculado do plantel. `null` = ninguém o sabe ainda. */
  overall: number | null
  /** O número é um palpite. Quem o tem não entra em nenhuma das seleções. */
  provisional: boolean
}

export type SelectedPlayer = SelectionPlayer & {
  slot: SelectionPosition
  /** Índice do lugar dentro da linha, da esquerda para a direita. */
  slotIndex: number
  overall: number
}

export type Formation = {
  /** Jogadores por equipa, guarda-redes incluído. */
  teamSize: number
  /** Como se lê em voz alta: 2-3-1, 4-4-2. Nunca inclui o guarda-redes. */
  name: string
  /** Os lugares de campo, por linha. O guarda-redes é tratado à parte. */
  lines: { position: Exclude<SelectionPosition, 'GK'>; count: number }[]
}

export type Selection = {
  formation: Formation
  goalkeeper: SelectedPlayer | null
  outfield: SelectedPlayer[]
  /** Soma dos overalls de campo. O guarda-redes tem escala própria e fica fora. */
  strength: number
  /** Média de campo, arredondada. `null` enquanto não houver ninguém. */
  average: number | null
  /** `false` = não houve gente para todos os lugares. A interface diz isso. */
  complete: boolean
  /** Lugares que ficaram por preencher, pela ordem da formação. */
  missing: Exclude<SelectionPosition, 'GK'>[]
}

/**
 * As formações que a app sabe desenhar, por tamanho de equipa.
 *
 * As posições da V2 são linhas (DEF/MID/ATT) e não lugares nomeados como no
 * produto Browns (DEF-L, MID-C…). É deliberado: o plantel é o que a base
 * guarda, e ela guarda linhas. Uma formação é, portanto, quantos por linha.
 */
const FORMATIONS: Readonly<Record<number, Formation['lines']>> = {
  5: [{ position: 'DEF', count: 1 }, { position: 'MID', count: 2 }, { position: 'ATT', count: 1 }],
  6: [{ position: 'DEF', count: 2 }, { position: 'MID', count: 2 }, { position: 'ATT', count: 1 }],
  7: [{ position: 'DEF', count: 2 }, { position: 'MID', count: 3 }, { position: 'ATT', count: 1 }],
  8: [{ position: 'DEF', count: 2 }, { position: 'MID', count: 3 }, { position: 'ATT', count: 2 }],
  9: [{ position: 'DEF', count: 3 }, { position: 'MID', count: 3 }, { position: 'ATT', count: 2 }],
  10: [{ position: 'DEF', count: 3 }, { position: 'MID', count: 4 }, { position: 'ATT', count: 2 }],
  11: [{ position: 'DEF', count: 4 }, { position: 'MID', count: 4 }, { position: 'ATT', count: 2 }],
}

export const DEFAULT_TEAM_SIZE = 7
const MIN_TEAM_SIZE = 3
const MAX_TEAM_SIZE = 15

/**
 * Fora da tabela a formação é derivada, não recusada: uma pelada de 13 existe
 * e merece um desenho. Um terço para trás, o resto ao meio e dois à frente é a
 * repartição que sai mais parecida com as escritas à mão.
 */
function deriveLines(teamSize: number): Formation['lines'] {
  const outfield = teamSize - 1
  const attackers = Math.min(2, Math.max(1, outfield - 2))
  const defenders = Math.max(1, Math.round((outfield - attackers) / 2))
  const midfielders = outfield - attackers - defenders
  return [
    { position: 'DEF', count: defenders },
    { position: 'MID', count: midfielders },
    { position: 'ATT', count: attackers },
  ].filter((line) => line.count > 0) as Formation['lines']
}

export function formationOf(teamSize: number = DEFAULT_TEAM_SIZE): Formation {
  const size = Number.isInteger(teamSize) && teamSize >= MIN_TEAM_SIZE && teamSize <= MAX_TEAM_SIZE
    ? teamSize
    : DEFAULT_TEAM_SIZE
  const lines = FORMATIONS[size] ?? deriveLines(size)
  return { teamSize: size, name: lines.map((line) => line.count).join('-'), lines }
}

/** Os lugares de campo, um por vaga, pela ordem em que se desenham. */
function slotsOf(formation: Formation) {
  return formation.lines.flatMap((line) =>
    Array.from({ length: line.count }, (_, index) => ({ position: line.position, index })),
  )
}

/** Elegível = tem um overall a sério. Provisório não conta para nenhum lado. */
function eligible(player: SelectionPlayer) {
  return typeof player.overall === 'number' && Number.isFinite(player.overall) && !player.provisional
}

const keepsGoal = (player: SelectionPlayer) =>
  player.playerType === 'GOALKEEPER' || player.primaryPosition === 'GK'

/**
 * Quem pode ocupar um lugar, em três escalões: primeiro quem o tem como
 * posição principal, depois quem o tem como secundária, e por fim quem aceita
 * jogar noutros sítios.
 *
 * Os escalões são mesmo escalões, não uma ordenação: um avançado de 95 não
 * fica a defesa enquanto houver defesas, por muito melhor que seja. Isto é uma
 * seleção por posição — se o melhor de todos ocupasse o primeiro lugar a ser
 * preenchido, a formação passava a ser decoração.
 */
function tiersFor(players: readonly SelectionPlayer[], position: SelectionPosition) {
  return [
    players.filter((player) => player.primaryPosition === position),
    players.filter((player) =>
      player.primaryPosition !== position && player.secondaryPosition === position),
    players.filter((player) =>
      player.primaryPosition !== position
      && player.secondaryPosition !== position
      && player.acceptsOtherPositions),
  ]
}

/**
 * O critério de escolha, num sítio só: `best` a false monta a anti-seleção.
 * Duas funções quase iguais seriam duas para divergir. Empate fica com o
 * primeiro — a lista chega pela ordem do plantel, que é estável.
 */
function pick(list: readonly SelectionPlayer[], best: boolean) {
  return list.reduce((chosen, player) => {
    const current = chosen.overall as number
    const candidate = player.overall as number
    if (candidate === current) return chosen
    return (best ? candidate > current : candidate < current) ? player : chosen
  })
}

/** O melhor (ou o pior) do escalão mais alto que ainda tenha gente. */
function pickFromTiers(tiers: readonly SelectionPlayer[][], best: boolean) {
  for (const tier of tiers) {
    if (tier.length) return pick(tier, best)
  }
  return null
}

/**
 * `eligible` já garantiu que o overall é um número; o `as number` é só a
 * conversão do tipo que o filtro não sabe estreitar.
 */
function toSelected(player: SelectionPlayer, slot: SelectionPosition, slotIndex: number): SelectedPlayer {
  return { ...player, slot, slotIndex, overall: player.overall as number }
}

export type SelectionInput = {
  players: readonly SelectionPlayer[]
  teamSize?: number
  /** `false` monta a anti-seleção: o mesmo cálculo, ao contrário. */
  best?: boolean
}

export function buildSelection({ players, teamSize = DEFAULT_TEAM_SIZE, best = true }: SelectionInput): Selection {
  const formation = formationOf(teamSize)
  const available = players.filter(eligible)

  // O guarda-redes escolhe-se à parte, entre quem é mesmo guarda-redes: a
  // escala dele é própria (`goalkeeperOverall`) e não se compara com a de um
  // atacante. Compará-los era pôr duas medidas diferentes na mesma ordenação.
  const goalkeepers = available.filter(keepsGoal)
  const goalkeeper: SelectedPlayer | null = goalkeepers.length
    ? toSelected(pick(goalkeepers, best), 'GK', 0)
    : null

  // O guarda-redes sai da lista de campo: um goleiro escolhido para a baliza
  // não pode reaparecer na defesa da mesma seleção.
  const outfieldPool = available.filter((player) =>
    !keepsGoal(player) && player.membershipId !== goalkeeper?.membershipId)

  const slots = slotsOf(formation)
  // Os lugares mais difíceis de preencher primeiro. Sem isto, um lugar com dois
  // candidatos ficava vazio porque um deles já tinha sido levado para um lugar
  // com quinze — e a formação aparecia coxa no lado errado.
  const scarcity = new Map(formation.lines.map((line) => [
    line.position,
    outfieldPool.filter((player) => player.primaryPosition === line.position).length / line.count,
  ]))
  const byScarcity = [...slots].sort((left, right) =>
    (scarcity.get(left.position) ?? 0) - (scarcity.get(right.position) ?? 0))

  const used = new Set<string>()
  const chosen = new Map<string, SelectedPlayer>()
  for (const slot of byScarcity) {
    const free = outfieldPool.filter((player) => !used.has(player.membershipId))
    const player = pickFromTiers(tiersFor(free, slot.position), best)
    if (!player) continue
    used.add(player.membershipId)
    chosen.set(`${slot.position}:${slot.index}`, toSelected(player, slot.position, slot.index))
  }

  // Devolvido pela ordem da formação, não pela ordem de escolha: o campo
  // desenha-se de trás para a frente e quem lê espera vê-lo assim.
  const outfield = slots
    .map((slot) => chosen.get(`${slot.position}:${slot.index}`))
    .filter((player): player is SelectedPlayer => Boolean(player))
  const missing = slots
    .filter((slot) => !chosen.has(`${slot.position}:${slot.index}`))
    .map((slot) => slot.position)

  const strength = outfield.reduce((total, player) => total + player.overall, 0)
  return {
    formation,
    goalkeeper,
    outfield,
    strength,
    average: outfield.length ? Math.round(strength / outfield.length) : null,
    complete: outfield.length === slots.length && Boolean(goalkeeper),
    missing,
  }
}

/** As duas de uma vez, que é como se mostram. */
export function buildSelections(input: Omit<SelectionInput, 'best'>) {
  return {
    best: buildSelection({ ...input, best: true }),
    worst: buildSelection({ ...input, best: false }),
  }
}
