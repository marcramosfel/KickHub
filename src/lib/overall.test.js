import { describe, it, expect } from 'vitest'
import {
  BONUS_CRAQUE_MAX,
  OVERALL_VERSION,
  PENAL_BAGRE_MAX,
  PESO_DESEMPENHO,
  PESO_DESEMPENHO_V2,
  PESO_GRUPO,
  PESO_GRUPO_V2,
  PESO_POS_JOGO_V2,
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

// ---------------------------------------------------------------------
// A regra que dá origem a tudo isto: mudar os pesos NÃO pode mexer no
// overall de ninguém. Quem ainda não foi avaliado pelos companheiros
// continua na fórmula de sempre.
// ---------------------------------------------------------------------
describe('versão da fórmula', () => {
  const v1 = (overrides) => ({
    avg: 4.1,
    matches: 10,
    goals: 12,
    assists: 6,
    craques: 2,
    bagres: 1,
    ...overrides,
  })

  it('sem avaliação pós-jogo fica na v1, com 70/30', () => {
    const r = calcularOverall(v1())
    expect(r.versao).toBe(1)
    expect(r.pesos).toEqual({ grupo: PESO_GRUPO, desempenho: PESO_DESEMPENHO, posJogo: 0 })
    const base = 4.1 * 20
    const desempenho = Math.min(18 / 10 / 3, 1) * 100
    const esperado =
      PESO_GRUPO * base +
      PESO_DESEMPENHO * desempenho +
      (2 / 10) * BONUS_CRAQUE_MAX -
      (1 / 10) * PENAL_BAGRE_MAX
    expect(r.overall).toBe(Math.round(esperado))
  })

  it('contador a zero, média nula ou ausente: nada muda no número', () => {
    const referencia = calcularOverall(v1()).overall
    for (const extra of [
      {},
      { post_rating_count: 0 },
      { post_rating_avg: null, post_rating_count: 0 },
      { post_rating_avg: 4.5, post_rating_count: 0 }, // dados a meio
      { post_rating_avg: null, post_rating_count: 3 }, // idem, ao contrário
    ]) {
      const r = calcularOverall(v1(extra))
      expect(r.versao).toBe(1)
      expect(r.overall).toBe(referencia)
    }
  })

  it('a primeira avaliação passa o jogador para a v2', () => {
    const r = calcularOverall(v1({ post_rating_avg: 4, post_rating_count: 1 }))
    expect(r.versao).toBe(2)
    expect(r.versao).toBe(OVERALL_VERSION)
    expect(r.pesos).toEqual({
      grupo: PESO_GRUPO_V2,
      desempenho: PESO_DESEMPENHO_V2,
      posJogo: PESO_POS_JOGO_V2,
    })
    expect(r.posJogoProvisorio).toBe(true) // uma só avaliação ainda não é média
  })

  it('aceita snake_case e camelCase (perfil ou linha de rankings)', () => {
    const a = calcularOverall(v1({ post_rating_avg: 4, post_rating_count: 8 }))
    const b = calcularOverall(v1({ postRatingAvg: 4, postRatingCount: 8 }))
    expect(a.overall).toBe(b.overall)
  })

  it('a média em texto (numeric do Postgres) conta na mesma', () => {
    const a = calcularOverall(v1({ post_rating_avg: '4.00', post_rating_count: 8 }))
    const b = calcularOverall(v1({ post_rating_avg: 4, post_rating_count: 8 }))
    expect(a.overall).toBe(b.overall)
  })
})

describe('fórmula v2 — 50% grupo, 25% campo, 25% companheiros', () => {
  // O exemplo do pedido: grupo 82, campo 76, pós-jogo 88.
  it('o exemplo do pedido dá as parcelas anunciadas', () => {
    const r = calcularOverall({
      avg: 4.1, // × 20 = 82
      matches: 10,
      goals: 15,
      assists: 7.8, // (15+7.8)/10 = 2,28 por jogo → 76
      craques: 0,
      bagres: 0,
      post_rating_avg: 4.4, // 4,4/5 = 88
      post_rating_count: 12,
    })
    expect(r.base).toBeCloseTo(82, 6)
    expect(r.desempenho).toBeCloseTo(76, 6)
    expect(r.posJogo).toBeCloseTo(88, 6)
    expect(r.overallBase).toBeCloseTo(82 * 0.5 + 76 * 0.25 + 88 * 0.25, 6)
    expect(r.overall).toBe(82)
  })

  it('a avaliação pós-jogo mexe no overall na proporção certa', () => {
    const perfil = { avg: 4, matches: 10, goals: 10, assists: 5, craques: 0, bagres: 0 }
    const cincoEstrelas = calcularOverall({ ...perfil, post_rating_avg: 5, post_rating_count: 6 })
    const zeroEstrelas = calcularOverall({ ...perfil, post_rating_avg: 0, post_rating_count: 6 })
    expect(cincoEstrelas.overall - zeroEstrelas.overall).toBe(25)
  })

  it('o bónus de craque e o desconto de bagre continuam por cima da base', () => {
    const semPremios = calcularOverall({
      avg: 4, matches: 10, goals: 10, assists: 5, craques: 0, bagres: 0,
      post_rating_avg: 4, post_rating_count: 5,
    })
    const comPremios = calcularOverall({
      avg: 4, matches: 10, goals: 10, assists: 5, craques: 10, bagres: 0,
      post_rating_avg: 4, post_rating_count: 5,
    })
    expect(comPremios.overall - semPremios.overall).toBe(BONUS_CRAQUE_MAX)
    expect(comPremios.bonusCraque).toBe(BONUS_CRAQUE_MAX)
  })

  it('continua limitado a 1–99 e arredondado', () => {
    const teto = calcularOverall({
      avg: 5, matches: 10, goals: 40, assists: 20, craques: 10, bagres: 0,
      post_rating_avg: 5, post_rating_count: 10,
    })
    const chao = calcularOverall({
      avg: 0, matches: 10, goals: 0, assists: 0, craques: 0, bagres: 10,
      post_rating_avg: 0, post_rating_count: 10,
    })
    expect(teto.overall).toBe(99)
    expect(chao.overall).toBe(1)
    expect(Number.isInteger(teto.overall)).toBe(true)
  })

  it('sem notas do grupo, a parcela em falta NÃO vale zero — os pesos renormalizam', () => {
    const r = calcularOverall({
      avg: null, matches: 4, goals: 4, assists: 2, craques: 0, bagres: 0,
      post_rating_avg: 4, post_rating_count: 4,
    })
    const desempenho = Math.min(6 / 4 / 3, 1) * 100
    const posJogo = 80
    const esperado =
      (desempenho * PESO_DESEMPENHO_V2 + posJogo * PESO_POS_JOGO_V2) /
      (PESO_DESEMPENHO_V2 + PESO_POS_JOGO_V2)
    expect(r.overallBase).toBeCloseTo(esperado, 6)
    expect(r.provisorio).toBe(true)
  })

  it('avaliado sem nenhuma rodada de campo vale pelo grupo e pelos companheiros', () => {
    const r = calcularOverall({
      avg: 4, matches: 0, goals: 0, assists: 0, craques: 0, bagres: 0,
      post_rating_avg: 3, post_rating_count: 2,
    })
    // 80 e 60, sem a parcela de desempenho a puxar para baixo
    expect(r.overallBase).toBeCloseTo((80 * 0.5 + 60 * 0.25) / 0.75, 6)
    expect(r.overall).toBeGreaterThan(60)
  })

  it('uma avaliação é provisória, duas já não', () => {
    const uma = calcularOverall({ avg: 4, matches: 3, goals: 1, assists: 1, post_rating_avg: 4, post_rating_count: 1 })
    const duas = calcularOverall({ avg: 4, matches: 3, goals: 1, assists: 1, post_rating_avg: 4, post_rating_count: 2 })
    expect(uma.posJogoProvisorio).toBe(true)
    expect(duas.posJogoProvisorio).toBe(false)
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
