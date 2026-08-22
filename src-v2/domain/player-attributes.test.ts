import { describe, expect, it } from 'vitest'
import {
  attributesWithData, bandOf, computeAttributes, MIN_GAMES, MIN_VOTES,
  savePercentage, winRatio, type AttributeInput,
} from './player-attributes'

function row(overrides: Partial<AttributeInput> = {}): AttributeInput {
  return {
    playerType: 'FIELD', primaryPosition: 'MID',
    gamesPlayed: 20, goals: 10, assists: 6, craques: 4, saves: 0,
    wins: 12, draws: 4, losses: 4,
    gkCleanSheets: 0, gkSaves: 0, gkConceded: 0,
    postRatingAvg: 4, postRatingCount: 10,
    ...overrides,
  }
}

const byId = (list: ReturnType<typeof computeAttributes>) =>
  new Map(list.map((attribute) => [attribute.id, attribute.value]))

describe('computeAttributes', () => {
  it('dá seis atributos de campo a um jogador de campo', () => {
    const list = computeAttributes(row(), 22)
    expect(list.map((attribute) => attribute.id)).toEqual(['ATA', 'PAS', 'DEC', 'REG', 'VIT', 'TEC'])
  })

  it('troca as siglas para um guarda-redes', () => {
    const list = computeAttributes(row({ playerType: 'GOALKEEPER' }), 22)
    expect(list.map((attribute) => attribute.id)).toEqual(['DEF', 'SEG', 'SG', 'REG', 'VIT', 'TEC'])
  })

  it('sem dados é `null`, e nunca zero', () => {
    const values = byId(computeAttributes(row({
      gamesPlayed: 0, goals: 0, assists: 0, craques: 0,
      wins: null, draws: null, losses: null, postRatingCount: 0, postRatingAvg: null,
    }), 0))
    expect(values.get('ATA')).toBeNull()
    expect(values.get('VIT')).toBeNull()
    expect(values.get('REG')).toBeNull()
    expect(values.get('TEC')).toBeNull()
  })

  it('rácios por jogo só contam com jogos que cheguem', () => {
    const few = byId(computeAttributes(row({ gamesPlayed: MIN_GAMES - 1, goals: 6 }), 20))
    // Dois jogos de sorte davam 99 e isso não é um atributo, é ruído.
    expect(few.get('ATA')).toBeNull()
    const enough = byId(computeAttributes(row({ gamesPlayed: MIN_GAMES, goals: 3 }), 20))
    expect(enough.get('ATA')).not.toBeNull()
  })

  it('a opinião do grupo precisa de votos que cheguem', () => {
    const few = byId(computeAttributes(row({ postRatingCount: MIN_VOTES - 1 }), 20))
    expect(few.get('TEC')).toBeNull()
    const enough = byId(computeAttributes(row({ postRatingCount: MIN_VOTES, postRatingAvg: 5 }), 20))
    expect(enough.get('TEC')).toBe(99)
  })

  it('a regularidade precisa de saber quantas rodadas a pelada teve', () => {
    expect(byId(computeAttributes(row({ gamesPlayed: 10 }), 0)).get('REG')).toBeNull()
    expect(byId(computeAttributes(row({ gamesPlayed: 10 }), 10)).get('REG')).toBe(99)
    expect(byId(computeAttributes(row({ gamesPlayed: 5 }), 10)).get('REG')).toBe(50)
  })

  it('nenhum atributo passa dos 99, por muito boa que seja a marca', () => {
    const values = byId(computeAttributes(row({ gamesPlayed: 10, goals: 100, assists: 100, craques: 100 }), 10))
    for (const value of values.values()) {
      if (value !== null) expect(value).toBeLessThanOrEqual(99)
    }
  })

  it('a âncora é fixa: melhorar outro jogador não muda este', () => {
    const solo = byId(computeAttributes(row({ gamesPlayed: 10, goals: 15 }), 10))
    // 1.5 golos por jogo é a âncora, portanto 99 — independentemente do grupo.
    expect(solo.get('ATA')).toBe(99)
  })
})

describe('winRatio', () => {
  it('sem nenhum resultado conhecido não há aproveitamento', () => {
    expect(winRatio({ wins: null, draws: null, losses: null })).toBeNull()
  })

  it('zero jogos decididos não é zero por cento', () => {
    expect(winRatio({ wins: 0, draws: 0, losses: 0 })).toBeNull()
  })

  it('conta três pontos por vitória e um por empate', () => {
    expect(winRatio({ wins: 10, draws: 0, losses: 0 })).toBe(100)
    expect(winRatio({ wins: 0, draws: 10, losses: 0 })).toBe(33)
    expect(winRatio({ wins: 0, draws: 0, losses: 10 })).toBe(0)
  })
})

describe('savePercentage', () => {
  it('sem remates não há percentagem — é uma pergunta sem resposta', () => {
    expect(savePercentage({ gkSaves: 0, gkConceded: 0 })).toBeNull()
  })

  it('conta defesas sobre remates', () => {
    expect(savePercentage({ gkSaves: 9, gkConceded: 1 })).toBe(90)
  })
})

describe('bandOf', () => {
  it('sem valor não há faixa de cor', () => {
    expect(bandOf(null)).toBeNull()
  })

  it('as faixas seguem os limites escritos', () => {
    expect(bandOf(49)).toBe('low')
    expect(bandOf(50)).toBe('fair')
    expect(bandOf(65)).toBe('good')
    expect(bandOf(80)).toBe('great')
    expect(bandOf(90)).toBe('elite')
  })
})

describe('attributesWithData', () => {
  it('conta só os que têm mesmo número', () => {
    const list = computeAttributes(row({
      gamesPlayed: 0, wins: null, draws: null, losses: null,
      postRatingCount: 0, postRatingAvg: null,
    }), 0)
    expect(attributesWithData(list)).toBe(0)
  })
})
