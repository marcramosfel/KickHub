import type { DrawPosition } from './team-draw'

/**
 * Onde cada jogador fica no campo.
 *
 * A regra que manda é: **não se inventa posição a quem tem uma**. O sorteio já
 * decide quem vai à baliza, e o plantel já guarda a posição principal de cada
 * um — este módulo só os arruma em linhas e devolve coordenadas.
 *
 * A quem não tem posição nenhuma declarada é preciso dar um lugar, porque um
 * jogador escalado tem de aparecer no campo. Vai para o meio, que é a linha que
 * menos afirma, e vai marcado como `inferred` para a interface o poder dizer.
 * Um jogador colocado no ataque por omissão parecia uma informação; no meio e
 * assinalado, parece o que é — uma ausência.
 *
 * As coordenadas são relativas ao **próprio meio-campo**, de 0 (baliza própria)
 * a 1 (meio-campo). Quem desenha é que decide se isso é para a esquerda, para a
 * direita ou para baixo — e é por isso que o mesmo cálculo serve o telemóvel
 * ao alto e o ecrã ao comprido sem uma segunda versão.
 */
export type PitchLine = 'GK' | 'DEF' | 'MID' | 'ATT'

export type PitchSpot<T> = {
  player: T
  line: PitchLine
  /** A linha foi escolhida por nós, e não pelo que o jogador declarou. */
  inferred: boolean
  /** Distância à baliza própria, 0–1. */
  depth: number
  /** Posição lateral, 0–1, da esquerda para a direita de quem ataca. */
  lane: number
}

const LINES: readonly PitchLine[] = ['GK', 'DEF', 'MID', 'ATT']

/**
 * A profundidade de cada linha.
 *
 * O guarda-redes quase encostado à linha de golo, e o ataque a não chegar ao
 * meio-campo: um avançado desenhado em cima da linha central lê-se como fora do
 * seu meio-campo, e passa a ideia errada de quem está a atacar quem.
 */
const DEPTH: Record<PitchLine, number> = { GK: 0.07, DEF: 0.34, MID: 0.62, ATT: 0.88 }

type Positioned = {
  isGoalkeeper?: boolean
  primaryPosition?: DrawPosition | null
}

export function lineOf(player: Positioned): { line: PitchLine; inferred: boolean } {
  // O sorteio ganha à ficha: quem foi escalado à baliza hoje está na baliza,
  // mesmo que jogue a defesa no resto da vida.
  if (player.isGoalkeeper) return { line: 'GK', inferred: false }
  const declared = player.primaryPosition
  if (declared && LINES.includes(declared as PitchLine)) {
    return { line: declared as PitchLine, inferred: false }
  }
  return { line: 'MID', inferred: true }
}

/**
 * Espalha `count` jogadores ao longo da largura.
 *
 * Um jogador fica ao centro em vez de encostado à linha lateral, e daí o
 * `(i + 1) / (count + 1)`: com um dá 0.5, com dois dá 0.33 e 0.66, e nunca dá
 * 0 ou 1, que era pôr alguém fora do campo.
 */
export function lanesFor(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) / (count + 1))
}

export function arrangeOnPitch<T extends Positioned>(players: readonly T[]): PitchSpot<T>[] {
  const byLine = new Map<PitchLine, { player: T; inferred: boolean }[]>(
    LINES.map((line) => [line, []]),
  )
  for (const player of players) {
    const { line, inferred } = lineOf(player)
    byLine.get(line)!.push({ player, inferred })
  }

  return LINES.flatMap((line) => {
    const group = byLine.get(line)!
    const lanes = lanesFor(group.length)
    return group.map((item, index) => ({
      player: item.player,
      line,
      inferred: item.inferred,
      depth: DEPTH[line],
      lane: lanes[index],
    }))
  })
}

/** A formação em números, como o futebol a diz: defesas-médios-avançados. */
export function formationOf<T extends Positioned>(players: readonly T[]) {
  const spots = arrangeOnPitch(players)
  const count = (line: PitchLine) => spots.filter((spot) => spot.line === line).length
  return [count('DEF'), count('MID'), count('ATT')].join('-')
}
