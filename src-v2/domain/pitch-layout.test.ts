import { describe, expect, it } from 'vitest'
import { arrangeOnPitch, formationOf, lanesFor, lineOf } from './pitch-layout'

const player = (over: Partial<Parameters<typeof lineOf>[0]> = {}) => ({
  isGoalkeeper: false, primaryPosition: null, ...over,
})

describe('colocação no campo', () => {
  it('respeita a posição declarada', () => {
    expect(lineOf(player({ primaryPosition: 'DEF' }))).toEqual({ line: 'DEF', inferred: false })
    expect(lineOf(player({ primaryPosition: 'ATT' }))).toEqual({ line: 'ATT', inferred: false })
  })

  /**
   * O sorteio ganha à ficha: quem foi escalado à baliza hoje está na baliza,
   * mesmo que jogue a defesa no resto da vida.
   */
  it('põe na baliza quem o sorteio lá pôs, seja qual for a posição dele', () => {
    expect(lineOf(player({ isGoalkeeper: true, primaryPosition: 'DEF' })))
      .toEqual({ line: 'GK', inferred: false })
  })

  /**
   * Quem não declarou nada tem de aparecer na mesma — mas o lugar é assinalado
   * como escolhido por nós. Pô-lo no ataque em silêncio era inventar dados.
   */
  it('manda para o meio quem não tem posição, e diz que foi inferido', () => {
    expect(lineOf(player())).toEqual({ line: 'MID', inferred: true })
  })

  it('espalha sem encostar às linhas laterais', () => {
    expect(lanesFor(1)).toEqual([0.5])
    expect(lanesFor(3)).toEqual([0.25, 0.5, 0.75])
    expect(lanesFor(2).every((lane) => lane > 0 && lane < 1)).toBe(true)
  })

  it('agrupa por linha e mantém toda a gente no campo', () => {
    const equipa = [
      player({ isGoalkeeper: true }),
      player({ primaryPosition: 'DEF' }), player({ primaryPosition: 'DEF' }),
      player({ primaryPosition: 'MID' }),
      player({ primaryPosition: 'ATT' }),
    ]
    const spots = arrangeOnPitch(equipa)
    expect(spots).toHaveLength(5)
    expect(spots.every((spot) => spot.depth > 0 && spot.depth < 1)).toBe(true)
    expect(spots.filter((spot) => spot.line === 'DEF').map((spot) => spot.lane))
      .toEqual([1 / 3, 2 / 3])
  })

  it('lê a formação como o futebol a diz', () => {
    const equipa = [
      player({ isGoalkeeper: true }),
      player({ primaryPosition: 'DEF' }), player({ primaryPosition: 'DEF' }),
      player({ primaryPosition: 'MID' }), player({ primaryPosition: 'MID' }),
      player({ primaryPosition: 'MID' }),
      player({ primaryPosition: 'ATT' }),
    ]
    expect(formationOf(equipa)).toBe('2-3-1')
  })

  /** Uma equipa sem ninguém não deve rebentar a página de quem a abre. */
  it('aguenta uma equipa vazia', () => {
    expect(arrangeOnPitch([])).toEqual([])
    expect(formationOf([])).toBe('0-0-0')
  })
})
