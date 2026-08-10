import { describe, it, expect } from 'vitest'
import {
  contaComoJogadorDeLinha,
  ehGoleiroFixo,
  separarEscalacao,
  temGoleiroFixo,
} from './goleiros.js'

const marcos = { player_id: 'marcos', name: 'Marcos', team: 'A', is_goalkeeper: true, gk_order: 1 }
const felix = { player_id: 'felix', name: 'Félix', team: 'A', is_goalkeeper: false, gk_order: 2 }

describe('temGoleiroFixo', () => {
  it('sem gk_mode assume o formato de sempre (goleiros fixos)', () => {
    expect(temGoleiroFixo({})).toBe(true)
    expect(temGoleiroFixo(null)).toBe(true)
  })

  it('distingue os dois formatos', () => {
    expect(temGoleiroFixo({ gk_mode: 'FIXED' })).toBe(true)
    expect(temGoleiroFixo({ gk_mode: 'ROTATING' })).toBe(false)
  })
})

describe('quem é goleiro para efeitos de estatística', () => {
  it('jogo COM goleiro fixo: quem está na baliza é goleiro', () => {
    const jogo = { gk_mode: 'FIXED' }
    expect(ehGoleiroFixo(jogo, marcos)).toBe(true)
    expect(contaComoJogadorDeLinha(jogo, marcos)).toBe(false)
  })

  // A regressão em pessoa: o Marcos começa no gol, troca ao fim de dez
  // minutos e marca. `is_goalkeeper` continua a true porque é ele o nº 1 do
  // rodízio — e mesmo assim tem de poder levar gols e assistências.
  it('jogo SEM goleiro fixo: começar no gol não faz de ninguém goleiro', () => {
    const jogo = { gk_mode: 'ROTATING' }
    expect(ehGoleiroFixo(jogo, marcos)).toBe(false)
    expect(contaComoJogadorDeLinha(jogo, marcos)).toBe(true)
  })
})

describe('separarEscalacao', () => {
  it('goleiros fixos saem da lista de gols e ficam na de baliza', () => {
    const r = separarEscalacao({ gk_mode: 'FIXED' }, [marcos, felix])
    expect(r.rotativo).toBe(false)
    expect(r.linha.map((l) => l.player_id)).toEqual(['felix'])
    expect(r.baliza.map((l) => l.player_id)).toEqual(['marcos'])
  })

  it('no rodízio toda a gente leva gols e ninguém nasce goleiro', () => {
    const r = separarEscalacao({ gk_mode: 'ROTATING' }, [marcos, felix])
    expect(r.rotativo).toBe(true)
    expect(r.linha.map((l) => l.player_id)).toEqual(['marcos', 'felix'])
    expect(r.baliza).toEqual([])
  })

  it('escalação em falta não rebenta', () => {
    expect(separarEscalacao({}, null)).toEqual({ rotativo: false, linha: [], baliza: [] })
  })
})
