import { describe, expect, it } from 'vitest'
import type { SimPosition } from './match-simulator'
import {
  assignSlots,
  buildChampionship,
  buildDuel,
  splitIntoTeams,
  type CuriosityPlayer,
} from './pelada-curiosities'

function player(id: string, slot: SimPosition, overall: number | null, overrides: Partial<CuriosityPlayer> = {}): CuriosityPlayer {
  return {
    id, name: id, slot, overall,
    gamesPlayed: 20, goals: 8, assists: 4, craques: 1, bagres: 1, concededPerMatch: null,
    playerType: slot === 'GK' ? 'GOALKEEPER' : 'FIELD', provisional: false,
    ...overrides,
  }
}

/**
 * Um plantel de 28 com overalls de 40 a 94, e quatro guarda-redes. Chega para
 * quatro equipas de sete.
 */
function squad(size = 28) {
  return Array.from({ length: size }, (_, index) => {
    const slots: SimPosition[] = ['DEF', 'MID', 'MID', 'ATT']
    const isKeeper = index % 7 === 0
    return player(`p${index}`, isKeeper ? 'GK' : slots[index % slots.length], 40 + index * 2, {
      concededPerMatch: isKeeper ? 6 : null,
      goals: index, assists: Math.floor(index / 2),
    })
  })
}

describe('splitIntoTeams', () => {
  it('reparte todos, sem repetir ninguém', () => {
    const players = squad()
    const teams = splitIntoTeams(players, 4, 'x')
    expect(teams).toHaveLength(4)
    const ids = teams.flat().map((entry) => entry.id)
    expect(ids).toHaveLength(players.length)
    expect(new Set(ids).size).toBe(players.length)
  })

  it('deixa as equipas parecidas em vez de as ordenar por força', () => {
    const strength = splitIntoTeams(squad(), 4, 'x')
      .map((squadOfTeam) => squadOfTeam.reduce((total, entry) => total + (entry.overall ?? 0), 0))
    const spread = Math.max(...strength) - Math.min(...strength)
    // Sem serpente, a diferença entre a melhor e a pior era de centenas.
    expect(spread).toBeLessThan(20)
  })

  it('a mesma semente reparte sempre igual', () => {
    expect(splitIntoTeams(squad(), 4, 'x')).toEqual(splitIntoTeams(squad(), 4, 'x'))
  })
})

describe('assignSlots', () => {
  it('põe na baliza quem a pelada inscreveu como guarda-redes', () => {
    const assigned = assignSlots([player('a', 'MID', 70), player('gk', 'GK', 70)])
    expect(assigned.find((entry) => entry.id === 'gk')?.slot).toBe('GK')
  })

  it('não inventa um guarda-redes numa equipa que não tem nenhum', () => {
    const assigned = assignSlots([player('a', 'MID', 70, { playerType: 'FIELD' }), player('b', 'ATT', 70)])
    expect(assigned.some((entry) => entry.slot === 'GK')).toBe(false)
  })

  it('o segundo guarda-redes joga na linha em vez de desaparecer', () => {
    const assigned = assignSlots([player('gk1', 'GK', 70), player('gk2', 'GK', 68)])
    expect(assigned.filter((entry) => entry.slot === 'GK')).toHaveLength(1)
    expect(assigned.find((entry) => entry.id === 'gk2')?.slot).toBe('MID')
  })
})

describe('buildDuel', () => {
  const names = { nameA: 'Pretos', nameB: 'Brancos' }

  it('leva os melhores ao melhor jogo possível', () => {
    const players = squad()
    const duel = buildDuel({ players, seed: 'melhor', best: true, ...names })!
    const ids = [...duel.teamA, ...duel.teamB].map((entry) => entry.id)
    expect(ids).toHaveLength(14)
    const chosen = players.filter((entry) => ids.includes(entry.id))
    const left = players.filter((entry) => !ids.includes(entry.id))
    expect(Math.min(...chosen.map((entry) => entry.overall!)))
      .toBeGreaterThanOrEqual(Math.max(...left.map((entry) => entry.overall!)))
  })

  it('leva os piores ao duelo dos perebas', () => {
    const players = squad()
    const duel = buildDuel({ players, seed: 'perebas', best: false, ...names })!
    const ids = [...duel.teamA, ...duel.teamB].map((entry) => entry.id)
    const chosen = players.filter((entry) => ids.includes(entry.id))
    const left = players.filter((entry) => !ids.includes(entry.id))
    expect(Math.max(...chosen.map((entry) => entry.overall!)))
      .toBeLessThanOrEqual(Math.min(...left.map((entry) => entry.overall!)))
  })

  it('reparte os escolhidos em equipas equilibradas, não em melhores contra piores', () => {
    const duel = buildDuel({ players: squad(), seed: 'melhor', best: true, ...names })!
    expect(duel.balance.percentage).toBeLessThan(5)
  })

  it('deixa de fora quem ainda não tem overall a sério', () => {
    const players = [
      ...squad(),
      player('novato', 'ATT', 99, { provisional: true }),
      player('sem-nota', 'ATT', null),
    ]
    const duel = buildDuel({ players, seed: 'melhor', best: true, ...names })!
    const ids = [...duel.teamA, ...duel.teamB].map((entry) => entry.id)
    expect(ids).not.toContain('novato')
    expect(ids).not.toContain('sem-nota')
  })

  it('devolve null com um grupo pequeno em vez de rebentar', () => {
    expect(buildDuel({ players: squad(9), seed: 'melhor', ...names })).toBeNull()
  })

  it('a mesma semente dá exactamente o mesmo duelo', () => {
    const first = buildDuel({ players: squad(), seed: 'igual', ...names })
    const second = buildDuel({ players: squad(), seed: 'igual', ...names })
    expect(first).toEqual(second)
  })
})

describe('buildChampionship', () => {
  it('monta quatro equipas quando o plantel dá para quatro', () => {
    const championship = buildChampionship({ players: squad(28), seed: 'copa' })!
    expect(championship.teamCount).toBe(4)
    expect(championship.matches).toHaveLength(6)
    expect(championship.leftOut).toBe(0)
  })

  it('reduz o número de equipas em vez de recusar o campeonato', () => {
    const championship = buildChampionship({ players: squad(16), seed: 'copa' })!
    expect(championship.teamCount).toBe(2)
    expect(championship.matches).toHaveLength(1)
    expect(championship.leftOut).toBe(2)
  })

  it('devolve null quando não chega para duas equipas', () => {
    expect(buildChampionship({ players: squad(13), seed: 'copa' })).toBeNull()
  })

  it('a tabela fecha: jogos, golos e pontos batem certo', () => {
    const championship = buildChampionship({ players: squad(28), seed: 'copa' })!
    const played = championship.standings.reduce((total, row) => total + row.played, 0)
    expect(played).toBe(championship.matches.length * 2)

    const scored = championship.standings.reduce((total, row) => total + row.scored, 0)
    const conceded = championship.standings.reduce((total, row) => total + row.conceded, 0)
    expect(scored).toBe(conceded)

    for (const row of championship.standings) {
      expect(row.won + row.drawn + row.lost).toBe(row.played)
      expect(row.points).toBe(row.won * 3 + row.drawn)
    }
  })

  it('a tabela está mesmo ordenada por pontos', () => {
    const championship = buildChampionship({ players: squad(28), seed: 'copa' })!
    const points = championship.standings.map((row) => row.points)
    expect([...points].sort((left, right) => right - left)).toEqual(points)
  })

  it('a final é entre os dois primeiros e a semente é outra', () => {
    const championship = buildChampionship({ players: squad(28), seed: 'copa' })!
    const finalists = [championship.final.teamA, championship.final.teamB].sort()
    expect(finalists).toEqual([championship.standings[0].id, championship.standings[1].id].sort())
    expect(championship.final.round).toBe('final')
  })

  it('num empate na final o título vai a quem ficou melhor na tabela', () => {
    // Percorre sementes até sair uma final empatada — é o caso que a regra
    // existe para resolver, e sem ele ficava por testar.
    const drawn = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']
      .map((seed) => buildChampionship({ players: squad(28), seed })!)
      .find((entry) => entry.final.goalsA === entry.final.goalsB)
    if (!drawn) return
    expect(drawn.decidedOnTable).toBe(true)
    expect(drawn.champion).toBe(drawn.standings[0].id)
  })

  it('ninguém joga em duas equipas ao mesmo tempo', () => {
    const championship = buildChampionship({ players: squad(28), seed: 'copa' })!
    const ids = championship.teams.flatMap((team) => team.players.map((entry) => entry.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('os prémios saem dos jogos e não de lado nenhum', () => {
    const championship = buildChampionship({ players: squad(28), seed: 'copa' })!
    const goals = [...championship.matches, championship.final]
      .flatMap((match) => [...match.scorers.a, ...match.scorers.b])
      .filter((entry) => entry.id === championship.awards.topScorer?.id)
      .reduce((total, entry) => total + entry.total, 0)
    expect(championship.awards.topScorer?.total).toBe(goals)
  })

  it('a mesma semente dá exactamente o mesmo campeonato', () => {
    expect(buildChampionship({ players: squad(28), seed: 'copa' }))
      .toEqual(buildChampionship({ players: squad(28), seed: 'copa' }))
  })
})
