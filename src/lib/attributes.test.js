import { describe, it, expect } from 'vitest'
import {
  ANCORAS,
  atributosComDados,
  calcularAtributos,
  ehGoleiro,
  JOGOS_MINIMOS,
  overallDoCard,
} from './attributes.js'

const campo = (extra = {}) => ({
  playerType: 'FIELD',
  primaryPosition: 'ST',
  matches: 10,
  goals: 5,
  assists: 3,
  craques: 1,
  wins: 6,
  draws: 2,
  losses: 2,
  avg: 3.5,
  votes: 10,
  overall: 72,
  ...extra,
})

const goleiro = (extra = {}) => ({
  playerType: 'GOALKEEPER',
  primaryPosition: 'GK',
  matches: 10,
  saves: 40,
  cleanSheets: 3,
  savePct: 66.7,
  wins: 5,
  draws: 1,
  losses: 4,
  avg: 4,
  votes: 8,
  overall: 70,
  ...extra,
})

const valorDe = (lista, id) => lista.find((a) => a.id === id)?.valor

describe('calcularAtributos — jogador de campo', () => {
  it('dá os seis atributos de campo, pela ordem', () => {
    const a = calcularAtributos(campo(), 12)
    expect(a.map((x) => x.id)).toEqual(['ATA', 'PAS', 'DEC', 'REG', 'VIT', 'TEC'])
  })

  it('ataque sai dos gols por jogo, com a âncora documentada', () => {
    // 15 gols em 10 jogos = 1.5 g/j = a âncora = 99
    expect(valorDe(calcularAtributos(campo({ goals: 15 }), 12), 'ATA')).toBe(99)
    // metade da âncora ≈ metade da nota
    expect(valorDe(calcularAtributos(campo({ goals: 7.5 }), 12), 'ATA')).toBe(50)
  })

  it('nunca passa de 99, por muito bom que seja', () => {
    expect(valorDe(calcularAtributos(campo({ goals: 100 }), 12), 'ATA')).toBe(99)
  })

  it('regularidade é a presença nas rodadas da pelada', () => {
    expect(valorDe(calcularAtributos(campo({ matches: 12 }), 12), 'REG')).toBe(99)
    expect(valorDe(calcularAtributos(campo({ matches: 6 }), 12), 'REG')).toBe(50)
  })

  it('vitórias é o aproveitamento (3 por vitória, 1 por empate)', () => {
    // 6V 2E 2D em 10 = (18+2)/30 = 67%
    expect(valorDe(calcularAtributos(campo(), 12), 'VIT')).toBe(67)
  })

  it('técnica é a média do grupo em escala 0–99', () => {
    expect(valorDe(calcularAtributos(campo({ avg: 5 }), 12), 'TEC')).toBe(99)
    expect(valorDe(calcularAtributos(campo({ avg: 2.5 }), 12), 'TEC')).toBe(50)
  })
})

describe('calcularAtributos — goleiro', () => {
  it('dá os seis atributos de baliza', () => {
    const a = calcularAtributos(goleiro(), 12)
    expect(a.map((x) => x.id)).toEqual(['DEF', 'SEG', 'SG', 'REG', 'VIT', 'TEC'])
  })

  it('defesas por jogo e jogos sem sofrer saem dos números da baliza', () => {
    const a = calcularAtributos(goleiro({ saves: 80, cleanSheets: 6 }), 12)
    expect(valorDe(a, 'DEF')).toBe(99) // 8 por jogo = âncora
    expect(valorDe(a, 'SG')).toBe(99) // 0.6 por jogo = âncora
  })

  it('segurança é a percentagem de defesas, tal como vem', () => {
    expect(valorDe(calcularAtributos(goleiro({ savePct: 72.4 }), 12), 'SEG')).toBe(72)
  })
})

describe('não inventar: sem dados devolve null', () => {
  it('com menos jogos que o mínimo, os rácios por jogo ficam sem dados', () => {
    const a = calcularAtributos(campo({ matches: JOGOS_MINIMOS - 1 }), 12)
    expect(valorDe(a, 'ATA')).toBe(null)
    expect(valorDe(a, 'PAS')).toBe(null)
    expect(valorDe(a, 'DEC')).toBe(null)
  })

  it('com poucos votos, a técnica fica sem dados (não vira 0)', () => {
    expect(valorDe(calcularAtributos(campo({ votes: 1 }), 12), 'TEC')).toBe(null)
    expect(valorDe(calcularAtributos(campo({ avg: null, votes: 10 }), 12), 'TEC')).toBe(null)
  })

  it('sem rodadas na pelada não há regularidade', () => {
    expect(valorDe(calcularAtributos(campo(), 0), 'REG')).toBe(null)
  })

  it('sem resultados conhecidos não há aproveitamento — e não é zero', () => {
    const a = calcularAtributos(campo({ wins: null, draws: null, losses: null }), 12)
    expect(valorDe(a, 'VIT')).toBe(null)
  })

  it('um jogador acabado de entrar tem card, mas quase todo sem dados', () => {
    const novato = { playerType: 'FIELD', matches: 0, votes: 0, avg: null }
    const a = calcularAtributos(novato, 12)
    expect(a).toHaveLength(6)
    expect(atributosComDados(a)).toBe(0)
  })

  it('sem jogador não rebenta', () => {
    expect(calcularAtributos(null)).toEqual([])
  })
})

describe('ehGoleiro e overallDoCard', () => {
  it('reconhece o goleiro pelo tipo ou pela posição', () => {
    expect(ehGoleiro({ playerType: 'GOALKEEPER' })).toBe(true)
    expect(ehGoleiro({ primaryPosition: 'GK' })).toBe(true)
    expect(ehGoleiro({ playerType: 'FIELD', primaryPosition: 'ST' })).toBe(false)
  })

  it('o overall do card é o da app, arredondado — não é recalculado', () => {
    expect(overallDoCard({ overall: 72.6 })).toBe(73)
    expect(overallDoCard({ overall: null })).toBe(null)
    expect(overallDoCard({})).toBe(null)
  })
})

describe('as âncoras estão documentadas e são usadas', () => {
  it('a âncora de gols é a que o teste de ataque assume', () => {
    expect(ANCORAS.golosPorJogo).toBe(1.5)
    expect(ANCORAS.media).toBe(5)
  })
})
