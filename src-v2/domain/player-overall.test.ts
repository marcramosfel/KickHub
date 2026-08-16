import { describe, expect, it } from 'vitest'
import {
  computePlayerOverall, contributionPerGame, explainOverall, isProvisional,
  MAX_OVERALL, MIN_OVERALL, type OverallInput,
} from './player-overall'

const player = (overrides: Partial<OverallInput> = {}): OverallInput => ({
  gamesPlayed: 10, goals: 0, assists: 0, baseRating: null, postRatingAvg: null, ...overrides,
})

describe('contributo por jogo', () => {
  it('pesa a assistência abaixo do golo, mas perto', () => {
    expect(contributionPerGame(player({ gamesPlayed: 10, goals: 10 }))).toBe(1)
    expect(contributionPerGame(player({ gamesPlayed: 10, assists: 10 }))).toBe(0.7)
  })

  it('não divide por zero jogos', () => {
    expect(contributionPerGame(player({ gamesPlayed: 0, goals: 4 }))).toBe(0)
  })
})

describe('parcelas', () => {
  it('não devolve nada a quem não tem jogos nem nota', () => {
    expect(computePlayerOverall(player({ gamesPlayed: 0 }))).toBeNull()
    expect(explainOverall(player({ gamesPlayed: 0 }))).toBeNull()
  })

  /**
   * A regra que governa quase tudo: a ausência de um dado nunca vale zero.
   * Quem nunca foi avaliado não pode levar "zero de avaliação".
   */
  it('deixa cair a opinião em falta em vez de a contar como zero', () => {
    const semNota = explainOverall(player({ gamesPlayed: 10, goals: 30 }))!
    expect(semNota.parts.map((part) => part.key)).toEqual(['performance'])
    expect(semNota.parts[0].weight).toBe(1)

    // Três golos por jogo é o desempenho máximo, encolhido pela amostra: 83.
    // Se a ausência de nota valesse zero, ficaria em 2/3 × 0 + 1/3 × 83 = 28 —
    // um castigo por algo que não aconteceu.
    expect(semNota.overall).toBe(83)
  })

  it('deixa cair o desempenho de quem ainda não jogou', () => {
    const soNota = explainOverall(player({ gamesPlayed: 0, baseRating: 80 }))!
    expect(soNota.parts.map((part) => part.key)).toEqual(['opinion'])
    expect(soNota.overall).toBe(80)
  })

  it('renormaliza os pesos para somarem sempre um', () => {
    for (const input of [player({ baseRating: 70, goals: 10 }), player({ goals: 10 }), player({ gamesPlayed: 0, baseRating: 70 })]) {
      const total = explainOverall(input)!.parts.reduce((sum, part) => sum + part.weight, 0)
      expect(total).toBeCloseTo(1, 10)
    }
  })

  /** Se as parcelas não somam ao total, o painel está errado — ou a conta está. */
  it('as parcelas somam ao número que é mostrado', () => {
    const breakdown = explainOverall(player({ gamesPlayed: 8, goals: 12, assists: 4, baseRating: 74 }))!
    const soma = breakdown.parts.reduce((sum, part) => sum + part.value * part.weight, 0)
    expect(Math.round(soma)).toBe(breakdown.overall)
  })
})

describe('confiança', () => {
  it('encolhe o desempenho para o neutro enquanto a amostra é pequena', () => {
    const umJogo = explainOverall(player({ gamesPlayed: 1, goals: 3 }))!
    const vinteJogos = explainOverall(player({ gamesPlayed: 20, goals: 60 }))!

    // O mesmo rendimento por jogo, amostras muito diferentes.
    expect(umJogo.overall).toBeLessThan(vinteJogos.overall)
  })

  /**
   * A opinião do grupo não é uma amostra pequena, é um juízo: não encolhe, e
   * quem a tem deixa de ver o número marcado como provisório.
   */
  it('não encolhe a opinião do grupo', () => {
    expect(explainOverall(player({ gamesPlayed: 1, baseRating: 90 }))!.parts
      .find((part) => part.key === 'opinion')!.value).toBe(90)
    expect(isProvisional(player({ gamesPlayed: 1, baseRating: 90 }))).toBe(false)
    expect(isProvisional(player({ gamesPlayed: 1 }))).toBe(true)
    expect(isProvisional(player({ gamesPlayed: 0 }))).toBe(false)
  })
})

describe('estrelas pós-jogo', () => {
  it('traduz as estrelas para a escala das outras parcelas', () => {
    const cinco = explainOverall(player({ gamesPlayed: 0, baseRating: null, postRatingAvg: 5 }))!
    expect(cinco.parts.map((part) => part.key)).toEqual(['postRating'])
    expect(cinco.overall).toBe(99)

    const tres = explainOverall(player({ gamesPlayed: 0, postRatingAvg: 3 }))!
    expect(tres.overall).toBe(60)
  })

  it('deixa cair as estrelas em falta em vez de as contar como zero', () => {
    const sem = explainOverall(player({ gamesPlayed: 10, baseRating: 80 }))!
    expect(sem.parts.map((part) => part.key)).toEqual(['opinion', 'performance'])

    // Se a ausência valesse zero, esta parcela arrastaria 25% do total para
    // baixo e um jogador por avaliar ficaria abaixo de quem tem duas estrelas.
    const comDuas = explainOverall(player({ gamesPlayed: 10, baseRating: 80, postRatingAvg: 2 }))!
    expect(sem.overall).toBeGreaterThan(comDuas.overall)
  })

  /**
   * Quatro parcelas nominais, três produzidas: o saldo de vitórias acima do
   * esperado ainda não existe e o seu peso reparte-se, em vez de entrar a zero.
   */
  it('reparte o peso da parcela que ainda não é calculada', () => {
    const completo = explainOverall(player({ gamesPlayed: 10, goals: 10, baseRating: 80, postRatingAvg: 4 }))!
    const pesos = Object.fromEntries(completo.parts.map((part) => [part.key, part.weight]))

    // 0,4 / 0,2 / 0,25 renormalizados sobre 0,85.
    expect(pesos.opinion).toBeCloseTo(0.4 / 0.85, 6)
    expect(pesos.performance).toBeCloseTo(0.2 / 0.85, 6)
    expect(pesos.postRating).toBeCloseTo(0.25 / 0.85, 6)
    expect(completo.parts.reduce((sum, part) => sum + part.weight, 0)).toBeCloseTo(1, 10)
  })

  it('deixa de marcar como provisório quem já foi avaliado pelos companheiros', () => {
    expect(isProvisional(player({ gamesPlayed: 1 }))).toBe(true)
    expect(isProvisional(player({ gamesPlayed: 1, postRatingAvg: 4 }))).toBe(false)
  })
})

describe('limites', () => {
  it('nunca sai de 1 a 99', () => {
    const extremo = computePlayerOverall(player({ gamesPlayed: 40, goals: 400, baseRating: 99 }))!
    expect(extremo).toBeLessThanOrEqual(MAX_OVERALL)
    expect(computePlayerOverall(player({ gamesPlayed: 40, baseRating: 1 }))!).toBeGreaterThanOrEqual(MIN_OVERALL)
  })

  it('não deixa a opinião do grupo ser o número inteiro quando há jogos', () => {
    // 2/3 e 1/3: uma nota alta com desempenho fraco desce, mas não desaba.
    const overall = computePlayerOverall(player({ gamesPlayed: 20, goals: 0, baseRating: 90 }))!
    expect(overall).toBeLessThan(90)
    expect(overall).toBeGreaterThan(60)
  })
})
