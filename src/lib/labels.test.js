import { describe, it, expect } from 'vitest'
import {
  FAIXAS_DA_NOTA,
  RATING_LABELS,
  STAR_LABELS,
  corDaNota,
  faixaDaNota,
  formatarNota,
  legendaDaEstrela,
} from './labels.js'

// A barra de avaliação vive destas faixas: cada décima tem de cair numa, e
// só numa. Uma nota sem reação era uma barra que "encravava" a meio.
describe('faixaDaNota', () => {
  it('toda a escala 0–5, décima a décima, tem faixa', () => {
    for (let i = 0; i <= 50; i++) {
      const n = i / 10
      const f = faixaDaNota(n)
      expect(f, `nota ${n}`).toBeTruthy()
      expect(f.emoji).toBeTruthy()
      expect(f.titulo).toBeTruthy()
      expect(f.frase).toBeTruthy()
    }
  })

  it('os extremos dizem o que se espera', () => {
    expect(faixaDaNota(0).titulo).toBe('Tronco')
    expect(faixaDaNota(5).titulo).toBe('Craque absoluto')
    expect(faixaDaNota(0.8).titulo).toBe('Bagre autêntico')
  })

  it('é monótona: a nota nunca desce de faixa ao subir', () => {
    let anterior = -1
    for (let i = 0; i <= 50; i++) {
      const idx = FAIXAS_DA_NOTA.indexOf(faixaDaNota(i / 10))
      expect(idx).toBeGreaterThanOrEqual(anterior)
      anterior = idx
    }
  })

  it('fora da escala não inventa reação', () => {
    for (const v of [-0.1, 5.1, null, undefined, NaN, 'abc']) {
      expect(faixaDaNota(v)).toBe(null)
    }
  })

  it('as faixas estão ordenadas e cobrem até 5', () => {
    const limites = FAIXAS_DA_NOTA.map((f) => f.ate)
    expect([...limites].sort((a, b) => a - b)).toEqual(limites)
    expect(limites[limites.length - 1]).toBe(5)
  })
})

describe('corDaNota', () => {
  it('devolve sempre uma cor válida dentro e fora da escala', () => {
    for (const v of [0, 2.5, 5, -3, 9, null, undefined]) {
      expect(corDaNota(v)).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
    }
  })

  it('sobe de vermelho para verde', () => {
    const matiz = (v) => Number(corDaNota(v).match(/hsl\((\d+)/)[1])
    expect(matiz(0)).toBeLessThan(matiz(2.5))
    expect(matiz(2.5)).toBeLessThan(matiz(5))
  })
})

describe('formatarNota', () => {
  it('usa vírgula e uma casa decimal', () => {
    expect(formatarNota(3.7)).toBe('3,7')
    expect(formatarNota(4)).toBe('4,0')
    expect(formatarNota(0)).toBe('0,0')
  })

  it('sem nota não escreve "NaN"', () => {
    expect(formatarNota(null)).toBe('—')
    expect(formatarNota(undefined)).toBe('—')
    expect(formatarNota('abc')).toBe('—')
  })

  it('aceita numeric em texto, como vem do Postgres', () => {
    expect(formatarNota('3.7')).toBe('3,7')
  })
})

describe('as legendas antigas continuam intactas', () => {
  it('as estrelas 0–5 da avaliação pós-jogo', () => {
    expect(STAR_LABELS).toHaveLength(6)
    expect(legendaDaEstrela(0)).toBeTruthy()
    expect(legendaDaEstrela(5)).toBeTruthy()
    expect(legendaDaEstrela(6)).toBe('')
    expect(legendaDaEstrela(2.5)).toBe('') // só inteiros
  })

  it('o guia de calibração cobre 0 a 5', () => {
    expect(RATING_LABELS.map((r) => r.nota)).toEqual([0, 1, 2, 3, 4, 5])
  })
})
