import { describe, expect, it } from 'vitest'
import { createRandom, shuffle } from './seeded-random'
import {
  DrawError, NEUTRAL_OVERALL, classifyBalance, generateBalancedTeams,
  type DrawPlayer, type DrawPosition, type DrawPlayerType,
} from './team-draw'

function makePlayer(id: string, overall: number | null, extra: Partial<DrawPlayer> = {}): DrawPlayer {
  return {
    id,
    name: `Jogador ${id}`,
    overall,
    playerType: null,
    primaryPosition: null,
    secondaryPosition: null,
    acceptsOtherPositions: true,
    ...extra,
  }
}

const evenSquad = (count: number, overall = 60) =>
  Array.from({ length: count }, (_, index) => makePlayer(`p${index}`, overall))

const allIds = (result: ReturnType<typeof generateBalancedTeams>) => [
  ...result.teams[0].players.map((p) => p.id),
  ...result.teams[1].players.map((p) => p.id),
  ...result.reserves.map((p) => p.id),
].sort()

describe('seeded-random', () => {
  it('produz a mesma sequência para a mesma semente', () => {
    const a = createRandom('jogo-1')
    const b = createRandom('jogo-1')
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('produz sequências diferentes para sementes diferentes', () => {
    const a = createRandom('jogo-1')
    const b = createRandom('jogo-2')
    expect(a()).not.toBe(b())
  })

  it('baralha sem perder nem duplicar elementos', () => {
    const items = Array.from({ length: 20 }, (_, index) => index)
    const result = shuffle(items, createRandom('x'))
    expect([...result].sort((a, b) => a - b)).toEqual(items)
    expect(items).toHaveLength(20)
  })
})

describe('classifyBalance', () => {
  it('classifica a diferença em percentagem da média', () => {
    expect(classifyBalance(100, 100).level).toBe('excelente')
    expect(classifyBalance(100, 104).level).toBe('bom')
    expect(classifyBalance(100, 107).level).toBe('regular')
    expect(classifyBalance(100, 120).level).toBe('desequilibrado')
  })

  it('não divide por zero quando ninguém tem força', () => {
    expect(classifyBalance(0, 0)).toEqual({ difference: 0, percentage: 0, level: 'excelente' })
  })
})

describe('generateBalancedTeams', () => {
  it('recusa um formato impossível', () => {
    expect(() => generateBalancedTeams({ players: evenSquad(10), teamSize: 2, seed: 's' })).toThrow(DrawError)
    expect(() => generateBalancedTeams({ players: evenSquad(10), teamSize: 5.5, seed: 's' })).toThrow(DrawError)
  })

  it('recusa sortear sem jogadores para duas equipas', () => {
    expect(() => generateBalancedTeams({ players: evenSquad(9), teamSize: 5, seed: 's' }))
      .toThrow(new DrawError('NOT_ENOUGH_PLAYERS'))
  })

  it('forma duas equipas do tamanho pedido', () => {
    const result = generateBalancedTeams({ players: evenSquad(10), teamSize: 5, seed: 'jogo-1' })
    expect(result.teams[0].players).toHaveLength(5)
    expect(result.teams[1].players).toHaveLength(5)
    expect(result.reserves).toHaveLength(0)
  })

  it('nunca duplica nem perde um jogador', () => {
    const players = evenSquad(17).map((player, index) => makePlayer(player.id, 40 + index * 3))
    const result = generateBalancedTeams({ players, teamSize: 7, seed: 'jogo-2' })
    const ids = allIds(result)
    expect(ids).toHaveLength(17)
    expect(new Set(ids).size).toBe(17)
  })

  it('manda para suplentes quem sobra do formato', () => {
    const result = generateBalancedTeams({ players: evenSquad(15), teamSize: 6, seed: 'jogo-3' })
    expect(result.teams[0].players).toHaveLength(6)
    expect(result.teams[1].players).toHaveLength(6)
    expect(result.reserves).toHaveLength(3)
  })

  it('equilibra a força mesmo com um plantel muito desigual', () => {
    const players = [
      makePlayer('a', 99), makePlayer('b', 95), makePlayer('c', 90), makePlayer('d', 85),
      makePlayer('e', 40), makePlayer('f', 35), makePlayer('g', 30), makePlayer('h', 25),
      makePlayer('i', 60), makePlayer('j', 55),
    ]
    const result = generateBalancedTeams({ players, teamSize: 5, seed: 'jogo-4' })
    expect(result.balance.difference).toBeLessThanOrEqual(5)
    expect(['excelente', 'bom']).toContain(result.balance.level)
  })

  it('trata quem não tem overall como médio e assinala a estimativa', () => {
    const players = [...evenSquad(9), makePlayer('novo', null)]
    const result = generateBalancedTeams({ players, teamSize: 5, seed: 'jogo-5' })
    const novo = [...result.teams[0].players, ...result.teams[1].players].find((p) => p.id === 'novo')
    expect(novo?.effectiveOverall).toBe(NEUTRAL_OVERALL)
    expect(novo?.estimatedOverall).toBe(true)
    expect(result.teams[0].players.every((p) => p.id === 'novo' || p.estimatedOverall === false)).toBe(true)
  })

  it('é reproduzível a partir da mesma semente', () => {
    const players = evenSquad(14).map((p, index) => makePlayer(p.id, 30 + index * 4))
    const first = generateBalancedTeams({ players, teamSize: 7, seed: 'jogo-6' })
    const second = generateBalancedTeams({ players, teamSize: 7, seed: 'jogo-6' })
    expect(first.teams[0].players.map((p) => p.id)).toEqual(second.teams[0].players.map((p) => p.id))
  })

  it('varia entre jogos diferentes', () => {
    const players = evenSquad(14)
    const a = generateBalancedTeams({ players, teamSize: 7, seed: 'jogo-7' })
    const b = generateBalancedTeams({ players, teamSize: 7, seed: 'jogo-8' })
    expect(a.teams[0].players.map((p) => p.id)).not.toEqual(b.teams[0].players.map((p) => p.id))
  })

  it('dá um guarda-redes a cada equipa quando a pelada joga com fixos', () => {
    const players = [
      makePlayer('gk1', 70, { playerType: 'GOALKEEPER' as DrawPlayerType }),
      makePlayer('gk2', 68, { playerType: 'GOALKEEPER' as DrawPlayerType }),
      ...evenSquad(8),
    ]
    const result = generateBalancedTeams({ players, teamSize: 5, goalkeeperMode: 'fixed', seed: 'jogo-9' })
    expect(result.teams[0].players.filter((p) => p.isGoalkeeper)).toHaveLength(1)
    expect(result.teams[1].players.filter((p) => p.isGoalkeeper)).toHaveLength(1)
  })

  it('prefere o guarda-redes declarado à posição secundária', () => {
    const players = [
      makePlayer('declarado', 50, { playerType: 'GOALKEEPER' as DrawPlayerType }),
      makePlayer('hibrido', 50, { playerType: 'HYBRID' as DrawPlayerType }),
      makePlayer('secundario', 50, { secondaryPosition: 'GK' as DrawPosition }),
      ...evenSquad(7),
    ]
    const result = generateBalancedTeams({ players, teamSize: 5, goalkeeperMode: 'fixed', seed: 'jogo-10' })
    const keepers = [...result.teams[0].players, ...result.teams[1].players]
      .filter((p) => p.isGoalkeeper).map((p) => p.id).sort()
    expect(keepers).toEqual(['declarado', 'hibrido'])
  })

  it('com um só guarda-redes ninguém desaparece: ele joga na linha', () => {
    const players = [
      makePlayer('gk-unico', 70, { playerType: 'GOALKEEPER' as DrawPlayerType }),
      ...evenSquad(9),
    ]
    const result = generateBalancedTeams({ players, teamSize: 5, goalkeeperMode: 'fixed', seed: 'jogo-11' })
    expect(allIds(result)).toHaveLength(10)
    expect([...result.teams[0].players, ...result.teams[1].players].some((p) => p.isGoalkeeper)).toBe(false)
  })

  it('ignora guarda-redes fixos quando a pelada joga com rotação', () => {
    const players = [
      makePlayer('gk1', 70, { playerType: 'GOALKEEPER' as DrawPlayerType }),
      makePlayer('gk2', 68, { playerType: 'GOALKEEPER' as DrawPlayerType }),
      ...evenSquad(8),
    ]
    const result = generateBalancedTeams({ players, teamSize: 5, goalkeeperMode: 'rotating', seed: 'jogo-12' })
    expect([...result.teams[0].players, ...result.teams[1].players].some((p) => p.isGoalkeeper)).toBe(false)
  })

  it('serve qualquer formato entre 5x5 e 11x11', () => {
    for (const teamSize of [5, 6, 7, 8, 11]) {
      const result = generateBalancedTeams({
        players: evenSquad(teamSize * 2).map((p, i) => makePlayer(p.id, 45 + (i % 9) * 5)),
        teamSize,
        seed: `formato-${teamSize}`,
      })
      expect(result.teams[0].players).toHaveLength(teamSize)
      expect(result.teams[1].players).toHaveLength(teamSize)
      expect(result.balance.level).not.toBe('desequilibrado')
    }
  })

  it('não altera a lista de jogadores recebida', () => {
    const players = evenSquad(10)
    const snapshot = players.map((p) => p.id)
    generateBalancedTeams({ players, teamSize: 5, seed: 'jogo-13' })
    expect(players.map((p) => p.id)).toEqual(snapshot)
  })
})
