import { describe, expect, it } from 'vitest'
import {
  MAX_OVERALL, MIN_OVERALL, NEUTRAL_OVERALL, computePlayerOverall,
  contributionPerGame, decidedWinRate, isProvisional, type OverallInput,
} from './player-overall'

function makeInput(overrides: Partial<OverallInput> = {}): OverallInput {
  return { gamesPlayed: 0, goals: 0, assists: 0, saves: 0, wins: 0, draws: 0, losses: 0, ...overrides }
}

describe('contributionPerGame', () => {
  it('pesa a assistência abaixo do golo e a defesa bem abaixo', () => {
    expect(contributionPerGame(makeInput({ gamesPlayed: 1, goals: 1 }))).toBe(1)
    expect(contributionPerGame(makeInput({ gamesPlayed: 1, assists: 1 }))).toBeCloseTo(0.7)
    expect(contributionPerGame(makeInput({ gamesPlayed: 1, saves: 1 }))).toBeCloseTo(0.15)
  })

  it('não divide por zero quando ninguém jogou', () => {
    expect(contributionPerGame(makeInput({ goals: 5 }))).toBe(0)
  })
})

describe('decidedWinRate', () => {
  it('conta o empate como meia vitória', () => {
    expect(decidedWinRate(makeInput({ wins: 1, draws: 2, losses: 1 }))).toBe(0.5)
    expect(decidedWinRate(makeInput({ wins: 4 }))).toBe(1)
  })

  it('devolve null quando nenhum jogo foi decidido', () => {
    expect(decidedWinRate(makeInput({ gamesPlayed: 3 }))).toBeNull()
  })
})

describe('computePlayerOverall', () => {
  it('não inventa um número para quem nunca jogou', () => {
    expect(computePlayerOverall(makeInput())).toBeNull()
  })

  it('mantém no neutro quem jogou sem somar nada e sem jogos decididos', () => {
    expect(computePlayerOverall(makeInput({ gamesPlayed: 4 }))).toBe(NEUTRAL_OVERALL)
  })

  it('puxa para o neutro enquanto a amostra é pequena', () => {
    const umJogoBrilhante = computePlayerOverall(makeInput({ gamesPlayed: 1, goals: 3, wins: 1 }))
    const dezJogosIguais = computePlayerOverall(makeInput({ gamesPlayed: 10, goals: 30, wins: 10 }))
    expect(umJogoBrilhante).toBeLessThan(dezJogosIguais!)
    // Um único jogo não pode produzir um craque permanente.
    expect(umJogoBrilhante).toBeLessThan(70)
  })

  it('cresce com a média de contributo, não com o total acumulado', () => {
    const poucoPorJogo = computePlayerOverall(makeInput({ gamesPlayed: 20, goals: 10, wins: 10, losses: 10 }))
    const muitoPorJogo = computePlayerOverall(makeInput({ gamesPlayed: 20, goals: 40, wins: 10, losses: 10 }))
    expect(muitoPorJogo!).toBeGreaterThan(poucoPorJogo!)
  })

  it('distingue quem ganha de quem perde com o mesmo contributo', () => {
    const vencedor = computePlayerOverall(makeInput({ gamesPlayed: 10, goals: 10, wins: 9, losses: 1 }))
    const derrotado = computePlayerOverall(makeInput({ gamesPlayed: 10, goals: 10, wins: 1, losses: 9 }))
    expect(vencedor!).toBeGreaterThan(derrotado!)
  })

  it('não penaliza quem ainda não teve um jogo decidido', () => {
    const semDecididos = computePlayerOverall(makeInput({ gamesPlayed: 10, goals: 10 }))
    const equilibrado = computePlayerOverall(makeInput({ gamesPlayed: 10, goals: 10, wins: 5, losses: 5 }))
    expect(semDecididos).toBe(equilibrado)
  })

  it('mantém o valor dentro dos limites mesmo em extremos absurdos', () => {
    expect(computePlayerOverall(makeInput({ gamesPlayed: 50, goals: 500, wins: 50 }))).toBeLessThanOrEqual(MAX_OVERALL)
    expect(computePlayerOverall(makeInput({ gamesPlayed: 50, losses: 50 }))).toBeGreaterThanOrEqual(MIN_OVERALL)
  })

  it('devolve sempre um inteiro', () => {
    const value = computePlayerOverall(makeInput({ gamesPlayed: 7, goals: 5, assists: 3, wins: 4, losses: 3 }))
    expect(Number.isInteger(value)).toBe(true)
  })

  it('valoriza o guarda-redes pelas defesas sem o inflacionar', () => {
    const guardaRedes = computePlayerOverall(makeInput({ gamesPlayed: 10, saves: 60, wins: 6, losses: 4 }))
    const avancado = computePlayerOverall(makeInput({ gamesPlayed: 10, goals: 12, wins: 6, losses: 4 }))
    expect(guardaRedes!).toBeGreaterThan(NEUTRAL_OVERALL)
    expect(guardaRedes!).toBeLessThan(avancado!)
  })
})

describe('isProvisional', () => {
  it('assinala o valor como provisório enquanto a amostra é curta', () => {
    expect(isProvisional(makeInput({ gamesPlayed: 2 }))).toBe(true)
    expect(isProvisional(makeInput({ gamesPlayed: 9 }))).toBe(false)
    expect(isProvisional(makeInput({ gamesPlayed: 0 }))).toBe(false)
  })
})
