import { describe, it, expect } from 'vitest'
import {
  calcularOverall,
  calculateFieldPlayerOverall,
  calculateGoalkeeperOverall,
  RODADAS_CONFIANCA,
} from './overall.js'

describe('calculateFieldPlayerOverall', () => {
  it('é a mesma coisa que calcularOverall (é um alias, não uma cópia)', () => {
    expect(calculateFieldPlayerOverall).toBe(calcularOverall)
  })

  it('mantém a fórmula de campo intacta', () => {
    const perfil = { avg: 4, matches: 10, goals: 10, assists: 5, craques: 2, bagres: 0 }
    expect(calculateFieldPlayerOverall(perfil).overall).toBe(calcularOverall(perfil).overall)
  })
})

describe('calculateGoalkeeperOverall — exemplo do utilizador', () => {
  // 10 defesas e 5 gols sofridos = 15 finalizações à baliza, 66,7% de defesas
  const gk = { matches: 5, saves: 10, goalsConceded: 5, cleanSheets: 1, wins: 3 }

  it('conta as finalizações e a percentagem de defesas', () => {
    const r = calculateGoalkeeperOverall(gk, 1)
    expect(r.shotsOnTarget).toBe(15)
    expect(r.saveRate).toBeCloseTo(10 / 15, 6)
    expect(r.savePct).toBe(66.7)
  })

  it('valoriza as defesas: mais defesas com os mesmos gols sofridos dá overall maior', () => {
    const trabalhador = calculateGoalkeeperOverall(gk, 1)
    const pouco = calculateGoalkeeperOverall({ ...gk, saves: 2 }, 1)
    expect(trabalhador.overall).toBeGreaterThan(pouco.overall)
  })

  it('as defesas pesam 60% do raw', () => {
    const r = calculateGoalkeeperOverall(gk, 1)
    const esperado =
      r.saveRate * 100 * 0.6 +
      r.concededScore * 0.2 +
      r.cleanSheetRate * 100 * 0.1 +
      r.winRate * 100 * 0.1
    expect(r.raw).toBeCloseTo(esperado, 9)
  })

  it('sofrer menos do que a média da pelada sobe a pontuação de gols sofridos', () => {
    const bom = calculateGoalkeeperOverall({ ...gk, goalsConceded: 5 }, 3) // 1/jogo vs média 3
    const mau = calculateGoalkeeperOverall({ ...gk, goalsConceded: 5 }, 0.5)
    expect(bom.concededScore).toBeGreaterThan(mau.concededScore)
    expect(bom.concededScore).toBeLessThanOrEqual(100)
    expect(mau.concededScore).toBeGreaterThanOrEqual(0)
  })

  it('sem média da liga fica neutro (50) em vez de inventar uma referência', () => {
    expect(calculateGoalkeeperOverall(gk).concededScore).toBe(50)
    expect(calculateGoalkeeperOverall(gk, null).concededScore).toBe(50)
  })

  it('aceita as colunas cruas da base de dados (snake_case)', () => {
    const cru = { matches: 5, saves: 10, goals_conceded: 5, clean_sheets: 1, wins: 3 }
    expect(calculateGoalkeeperOverall(cru, 1).overall).toBe(calculateGoalkeeperOverall(gk, 1).overall)
  })
})

describe('calculateGoalkeeperOverall — fator de confiança', () => {
  it('um jogo perfeito não põe o goleiro à frente de quem tem época inteira', () => {
    const sorte = calculateGoalkeeperOverall(
      { matches: 1, saves: 10, goalsConceded: 0, cleanSheets: 1, wins: 1 },
      3,
    )
    const regular = calculateGoalkeeperOverall(
      { matches: 10, saves: 50, goalsConceded: 20, cleanSheets: 3, wins: 6 },
      3,
    )
    expect(sorte.raw).toBeGreaterThan(regular.raw) // o desempenho bruto é melhor
    expect(sorte.overall).toBeLessThan(regular.overall) // mas o overall não
    expect(sorte.confidence).toBeCloseTo(1 / RODADAS_CONFIANCA, 9)
    expect(regular.confidence).toBe(1)
  })

  it('a confiança satura em 1 a partir de 5 rodadas', () => {
    const cinco = calculateGoalkeeperOverall({ matches: 5, saves: 25, goalsConceded: 10 }, 2)
    const vinte = calculateGoalkeeperOverall({ matches: 20, saves: 100, goalsConceded: 40 }, 2)
    expect(cinco.confidence).toBe(1)
    expect(vinte.confidence).toBe(1)
    expect(cinco.overall).toBe(vinte.overall)
  })

  it('marca provisório abaixo de 3 rodadas', () => {
    expect(calculateGoalkeeperOverall({ matches: 2, saves: 4, goalsConceded: 2 }, 1).provisorio).toBe(true)
    expect(calculateGoalkeeperOverall({ matches: 3, saves: 6, goalsConceded: 3 }, 1).provisorio).toBe(false)
  })
})

describe('calculateGoalkeeperOverall — sem dados', () => {
  it('matches = 0 devolve overall null e provisório', () => {
    const r = calculateGoalkeeperOverall({ matches: 0, saves: 0, goalsConceded: 0 }, 2)
    expect(r.overall).toBeNull()
    expect(r.provisorio).toBe(true)
  })

  it('aguenta entradas vazias sem rebentar', () => {
    const r = calculateGoalkeeperOverall(null, null)
    expect(r.overall).toBeNull()
    expect(r.saveRate).toBe(0)
    expect(r.shotsOnTarget).toBe(0)
  })

  it('dados incoerentes não estouram a escala', () => {
    // Acontece a sério: as vitórias vêm do histórico e as rodadas da tabela de
    // baliza, e as duas contagens podem discordar.
    const r = calculateGoalkeeperOverall(
      { matches: 4, saves: 20, goalsConceded: 0, cleanSheets: 9, wins: 12 },
      2,
    )
    expect(r.cleanSheetRate).toBe(1)
    expect(r.winRate).toBe(1)
    expect(r.raw).toBeLessThanOrEqual(100)
    expect(r.overall).toBeLessThanOrEqual(100)
    expect(r.overall).toBeGreaterThanOrEqual(0)
  })

  it('o overall fica sempre entre 0 e 100', () => {
    const pessimo = calculateGoalkeeperOverall(
      { matches: 10, saves: 0, goalsConceded: 40, cleanSheets: 0, wins: 0 },
      1,
    )
    const otimo = calculateGoalkeeperOverall(
      { matches: 10, saves: 60, goalsConceded: 0, cleanSheets: 10, wins: 10 },
      3,
    )
    expect(pessimo.overall).toBeGreaterThanOrEqual(0)
    expect(otimo.overall).toBeLessThanOrEqual(100)
    expect(otimo.overall).toBeGreaterThan(pessimo.overall)
  })
})
