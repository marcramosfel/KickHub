import { describe, expect, it } from 'vitest'
import {
  expectedGoals,
  matchContext,
  outcomeProbabilities,
  simulateMatch,
  teamStrength,
  type SimPlayer,
  type SimPosition,
} from './match-simulator'

function player(id: string, slot: SimPosition, overall: number | null, overrides: Partial<SimPlayer> = {}): SimPlayer {
  return {
    id, name: id, slot, overall,
    gamesPlayed: 20, goals: 10, assists: 6, craques: 2, bagres: 1, concededPerMatch: null,
    ...overrides,
  }
}

/** Uma equipa de 7: guarda-redes, dois defesas, três médios e um avançado. */
function team(prefix: string, overall: number) {
  return [
    player(`${prefix}-gk`, 'GK', overall, { concededPerMatch: 6 }),
    player(`${prefix}-d1`, 'DEF', overall), player(`${prefix}-d2`, 'DEF', overall),
    player(`${prefix}-m1`, 'MID', overall), player(`${prefix}-m2`, 'MID', overall),
    player(`${prefix}-m3`, 'MID', overall), player(`${prefix}-a1`, 'ATT', overall),
  ]
}

describe('outcomeProbabilities', () => {
  it('soma sempre a 1', () => {
    const probability = outcomeProbabilities(8, 6)
    expect(probability.a + probability.draw + probability.b).toBeCloseTo(1, 10)
  })

  it('dá o mesmo a duas equipas iguais', () => {
    const probability = outcomeProbabilities(8, 8)
    expect(probability.a).toBeCloseTo(probability.b, 10)
  })

  it('não deixa o favorito chegar aos 100%', () => {
    const probability = outcomeProbabilities(20, 2.5)
    expect(probability.a).toBeLessThan(1)
    expect(probability.b).toBeGreaterThan(0)
  })

  it('não depende de semente nenhuma', () => {
    expect(outcomeProbabilities(9, 7)).toEqual(outcomeProbabilities(9, 7))
  })
})

describe('teamStrength', () => {
  it('não premeia a equipa com mais gente', () => {
    const seven = team('a', 70)
    const five = seven.slice(0, 5)
    const context = matchContext(seven, five)
    // Médias ponderadas: mais jogadores do mesmo nível não fazem uma equipa
    // mais forte, senão bastava inscrever mais gente.
    expect(teamStrength(seven, context).attack).toBeCloseTo(teamStrength(five, context).attack, 0)
  })

  it('uma defesa sem guarda-redes fica exposta', () => {
    const withKeeper = team('a', 70)
    const withoutKeeper = withKeeper.filter((entry) => entry.slot !== 'GK')
    const context = matchContext(withKeeper, withoutKeeper)
    expect(teamStrength(withoutKeeper, context).defence)
      .toBeLessThan(teamStrength(withKeeper, context).defence)
  })

  it('o histórico ajusta mas não manda', () => {
    const modest = team('a', 60)
    const strong = team('b', 90)
    // O artilheiro da pelada, mas com 60 de overall: continua atrás dos 90.
    modest[6] = player('a-a1', 'ATT', 60, { goals: 200, assists: 100 })
    const context = matchContext(modest, strong)
    expect(teamStrength(modest, context).attack).toBeLessThan(teamStrength(strong, context).attack)
  })
})

describe('expectedGoals', () => {
  it('nunca desce abaixo do mínimo que dá a zebra', () => {
    const weak = teamStrength(team('a', 20), matchContext(team('a', 20), team('b', 99)))
    const strong = teamStrength(team('b', 99), matchContext(team('a', 20), team('b', 99)))
    expect(expectedGoals(weak, strong).a).toBeGreaterThanOrEqual(2.5)
  })
})

describe('simulateMatch', () => {
  const play = (seed: string) => simulateMatch({
    teamA: team('pretos', 75), teamB: team('brancos', 72), seed, nameA: 'Pretos', nameB: 'Brancos',
  })

  it('a mesma semente dá exactamente o mesmo jogo', () => {
    expect(play('sexta')).toEqual(play('sexta'))
  })

  it('sementes diferentes dão jogos diferentes', () => {
    const scorelines = ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => {
      const match = play(seed)
      return `${match.goalsA}-${match.goalsB}`
    })
    expect(new Set(scorelines).size).toBeGreaterThan(1)
  })

  it('os marcadores somam exactamente o placar', () => {
    const match = play('sexta')
    expect(match.scorers.a.reduce((total, entry) => total + entry.total, 0)).toBe(match.goalsA)
    expect(match.scorers.b.reduce((total, entry) => total + entry.total, 0)).toBe(match.goalsB)
  })

  it('o guarda-redes não marca', () => {
    const match = play('sexta')
    const ids = [...match.scorers.a, ...match.scorers.b].map((entry) => entry.id)
    expect(ids).not.toContain('pretos-gk')
    expect(ids).not.toContain('brancos-gk')
  })

  it('o bagre nunca é o guarda-redes', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      expect(play(seed).flop?.slot).not.toBe('GK')
    }
  })

  it('a posse reparte-se pelos dois lados', () => {
    const match = play('sexta')
    expect(match.possession.a + match.possession.b).toBe(100)
  })

  it('conta a história certa para o placar que saiu', () => {
    const match = play('sexta')
    const difference = Math.abs(match.goalsA - match.goalsB)
    const expectedKey = difference === 0 ? 'draw' : difference === 1 ? 'narrow' : difference >= 5 ? 'rout' : 'open'
    expect(match.narrative.key).toBe(expectedKey)
    // O domínio não escreve português: só devolve com quem falar.
    expect(match.narrative.params.winner).toMatch(/Pretos|Brancos/)
  })

  it('aguenta uma equipa sem ninguém na baliza', () => {
    const match = simulateMatch({
      teamA: team('pretos', 75).filter((entry) => entry.slot !== 'GK'),
      teamB: team('brancos', 75),
      seed: 'sem-guarda-redes', nameA: 'Pretos', nameB: 'Brancos',
    })
    expect(match.goalsA).toBeGreaterThanOrEqual(0)
    expect(match.strength.a.keeper).toBeLessThan(match.strength.b.keeper)
  })

  it('trata quem não tem overall como médio em vez de zero', () => {
    const context = matchContext(team('a', 50), team('b', 50))
    const unrated = [player('x', 'ATT', null)]
    expect(teamStrength(unrated, context).averageOverall).toBe(50)
  })
})
