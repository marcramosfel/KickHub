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
  PESO_VITORIAS_V2,
  WAE_MIN_JOGOS,
  notaAcimaDoEsperado,
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
    // a v1 é a fórmula congelada: as vitórias acima do esperado só entram na
    // v2, para os números antigos não mexerem sozinhos
    expect(r.pesos).toEqual({
      grupo: PESO_GRUPO,
      vitorias: 0,
      desempenho: PESO_DESEMPENHO,
      posJogo: 0,
    })
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
      // sem rodadas com forças gravadas, a parcela das vitórias nem existe
      vitorias: 0,
      desempenho: PESO_DESEMPENHO_V2,
      posJogo: PESO_POS_JOGO_V2,
    })
    // marcada como provisória, mas isso é só informação — o peso é o cheio
    expect(r.posJogoProvisorio).toBe(true)
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

// Saldo 0 em 5 rodadas = exatamente o esperado = nota 50, com o peso já
// cheio. É o fixture para os testes que querem as QUATRO parcelas presentes
// sem que as vitórias mexam no resultado.
const WAE_NEUTRO = { wae_saldo: 0, wae_matches: 5 }

describe('fórmula v2 — 40% grupo, 15% vitórias, 20% campo, 25% companheiros', () => {
  it('as quatro parcelas entram com os pesos anunciados', () => {
    const r = calcularOverall({
      avg: 4.1, // × 20 = 82
      matches: 10,
      goals: 15,
      assists: 7.8, // (15+7.8)/10 = 2,28 por jogo → 76
      craques: 0,
      bagres: 0,
      post_rating_avg: 4.4, // 4,4/5 = 88
      post_rating_count: 12,
      ...WAE_NEUTRO, // → 50
    })
    expect(r.base).toBeCloseTo(82, 6)
    expect(r.desempenho).toBeCloseTo(76, 6)
    expect(r.posJogo).toBeCloseTo(88, 6)
    expect(r.vitorias).toBeCloseTo(50, 6)
    expect(r.overallBase).toBeCloseTo(82 * 0.4 + 50 * 0.15 + 76 * 0.2 + 88 * 0.25, 6)
  })

  it('a avaliação pós-jogo mexe no overall na proporção certa', () => {
    const perfil = {
      avg: 4, matches: 10, goals: 10, assists: 5, craques: 0, bagres: 0, ...WAE_NEUTRO,
    }
    const cincoEstrelas = calcularOverall({ ...perfil, post_rating_avg: 5, post_rating_count: 6 })
    const zeroEstrelas = calcularOverall({ ...perfil, post_rating_avg: 0, post_rating_count: 6 })
    expect(cincoEstrelas.overall - zeroEstrelas.overall).toBe(25)
  })

  it('o bónus de craque e o desconto de bagre continuam por cima da base', () => {
    const semPremios = calcularOverall({
      avg: 4, matches: 10, goals: 10, assists: 5, craques: 0, bagres: 0,
      post_rating_avg: 4, post_rating_count: 6,
    })
    const comPremios = calcularOverall({
      avg: 4, matches: 10, goals: 10, assists: 5, craques: 10, bagres: 0,
      post_rating_avg: 4, post_rating_count: 6,
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
      post_rating_avg: 4, post_rating_count: 6,
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
      post_rating_avg: 3, post_rating_count: 6,
    })
    // 80 e 60, sem o desempenho nem as vitórias a puxar para baixo — as duas
    // parcelas em falta saem da conta e os pesos renormalizam
    expect(r.overallBase).toBeCloseTo(
      (80 * PESO_GRUPO_V2 + 60 * PESO_POS_JOGO_V2) / (PESO_GRUPO_V2 + PESO_POS_JOGO_V2),
      6
    )
    expect(r.overall).toBeGreaterThan(60)
  })
})

// ------------------------------------------------------- média de quem votou
//
// Decisão do grupo: a parcela dos companheiros vale os 25% a partir da
// PRIMEIRA nota. A média é a média de quem votou — quem não vota dentro do
// prazo não influencia a nota de quem foi avaliado.
//
// Houve uma versão que amortecia a parcela até seis avaliações. Estes testes
// existem para o amortecimento não voltar por acidente.
describe('a avaliação pós-jogo conta pela média de quem votou', () => {
  const perfil = {
    avg: 4, matches: 10, goals: 10, assists: 5, craques: 0, bagres: 0, ...WAE_NEUTRO,
  }

  it('uma avaliação isolada já vale os 25% inteiros', () => {
    const r = calcularOverall({ ...perfil, post_rating_avg: 5, post_rating_count: 1 })
    expect(r.pesos.posJogo).toBeCloseTo(PESO_POS_JOGO_V2, 6)
    expect(r.pesosEfetivos.posJogo).toBeCloseTo(PESO_POS_JOGO_V2, 6)
  })

  it('o peso não depende de QUANTOS votaram — só a média é que muda', () => {
    for (const n of [1, 2, 3, 6, 40]) {
      const r = calcularOverall({ ...perfil, post_rating_avg: 5, post_rating_count: n })
      expect(r.pesos.posJogo).toBeCloseTo(PESO_POS_JOGO_V2, 6)
    }
  })

  it('a mesma média dá o mesmo overall, venha de 1 ou de 20 avaliações', () => {
    const um = calcularOverall({ ...perfil, post_rating_avg: 4.5, post_rating_count: 1 })
    const vinte = calcularOverall({ ...perfil, post_rating_avg: 4.5, post_rating_count: 20 })
    expect(um.overall).toBe(vinte.overall)
  })

  it('cinco estrelas contra zero valem os 25 pontos de diferença', () => {
    const cinco = calcularOverall({ ...perfil, post_rating_avg: 5, post_rating_count: 1 })
    const zero = calcularOverall({ ...perfil, post_rating_avg: 0, post_rating_count: 1 })
    expect(cinco.overall - zero.overall).toBe(25)
  })

  it('uma só avaliação assinala-se como provisória, sem lhe mexer no peso', () => {
    const uma = calcularOverall({ ...perfil, post_rating_avg: 4, post_rating_count: 1 })
    const duas = calcularOverall({ ...perfil, post_rating_avg: 4, post_rating_count: 2 })
    expect(uma.posJogoProvisorio).toBe(true)
    expect(duas.posJogoProvisorio).toBe(false)
    // o aviso é informação, não desconto: o peso é o mesmo nos dois
    expect(uma.pesos.posJogo).toBe(duas.pesos.posJogo)
  })

  it('sem avaliação nenhuma continua na v1, com peso zero', () => {
    const r = calcularOverall(perfil)
    expect(r.versao).toBe(1)
    expect(r.pesos.posJogo).toBe(0)
    expect(r.pesosEfetivos.posJogo).toBe(0)
  })
})

// O painel "Como se calcula o overall?" mostra parcela a parcela. Se as
// parcelas não somarem ao total, o painel mente — e ele existe precisamente
// para o número não parecer arbitrário. Foi o que aconteceu quando a
// confiança entrou: as linhas usavam os pesos nominais e o total usava os
// renormalizados.
describe('pesosEfetivos — as parcelas têm de somar ao overall', () => {
  const soma = (r) =>
    (r.base ?? 0) * r.pesosEfetivos.grupo +
    (r.vitorias ?? 0) * r.pesosEfetivos.vitorias +
    r.desempenho * r.pesosEfetivos.desempenho +
    (r.posJogo ?? 0) * r.pesosEfetivos.posJogo

  it('somam 1 sempre que há alguma parcela', () => {
    const casos = [
      { avg: 4, matches: 10, goals: 10, assists: 5 },
      { avg: 4, matches: 10, goals: 10, assists: 5, post_rating_avg: 5, post_rating_count: 1 },
      { avg: 4, matches: 10, goals: 10, assists: 5, post_rating_avg: 5, post_rating_count: 3 },
      { avg: 4, matches: 10, goals: 10, assists: 5, post_rating_avg: 5, post_rating_count: 20 },
      { avg: null, matches: 10, goals: 10, assists: 5, post_rating_avg: 4, post_rating_count: 9 },
      { avg: 4, matches: 0, goals: 0, assists: 0, post_rating_avg: 4, post_rating_count: 9 },
      { avg: 4, matches: 0, goals: 0, assists: 0 },
      { avg: null, matches: 10, goals: 3, assists: 1 },
      // agora com a parcela das vitorias presente
      { avg: 4, matches: 10, goals: 10, assists: 5, post_rating_avg: 5, post_rating_count: 3,
        wae_saldo: 1.2, wae_matches: 6 },
      { avg: 4, matches: 10, goals: 10, assists: 5, wae_saldo: -0.8, wae_matches: 4 },
      { avg: null, matches: 6, goals: 4, assists: 2, post_rating_avg: 3, post_rating_count: 5,
        wae_saldo: 0.3, wae_matches: 5 },
    ]
    for (const c of casos) {
      const r = calcularOverall(c)
      const total =
        r.pesosEfetivos.grupo +
        r.pesosEfetivos.vitorias +
        r.pesosEfetivos.desempenho +
        r.pesosEfetivos.posJogo
      expect(total).toBeCloseTo(1, 6)
    }
  })

  it('a soma das parcelas dá exatamente o overallBase', () => {
    const casos = [
      { avg: 3.68, matches: 3, goals: 8, assists: 4, post_rating_avg: 5, post_rating_count: 2 },
      { avg: 4, matches: 10, goals: 10, assists: 5, post_rating_avg: 5, post_rating_count: 1 },
      { avg: 4, matches: 10, goals: 10, assists: 5, post_rating_avg: 2, post_rating_count: 12 },
      { avg: null, matches: 4, goals: 4, assists: 2, post_rating_avg: 4, post_rating_count: 4 },
      { avg: 3.68, matches: 3, goals: 8, assists: 4, post_rating_avg: 5, post_rating_count: 2,
        wae_saldo: 0.5, wae_matches: 5 },
      { avg: 4, matches: 10, goals: 10, assists: 5, wae_saldo: -1.1, wae_matches: 7 },
    ]
    for (const c of casos) {
      const r = calcularOverall(c)
      expect(soma(r)).toBeCloseTo(r.overallBase, 6)
    }
  })

  it('o caso do ecrã: 3,68 de média, 4 part./jogo, 5,0 em 2 avaliações', () => {
    // as linhas do painel somavam 70,1 e o total dizia 90 — a diferença era
    // a renormalização, que não aparecia em lado nenhum
    const r = calcularOverall({
      avg: 3.68,
      matches: 3,
      goals: 8,
      assists: 4,
      craques: 2,
      bagres: 0,
      post_rating_avg: 5,
      post_rating_count: 2,
      wae_saldo: 0,
      wae_matches: 5,
    })
    expect(soma(r)).toBeCloseTo(r.overallBase, 6)
    expect(Math.round(r.overallBase + r.bonusCraque - r.penalBagre)).toBe(r.overall)
    // com as quatro parcelas presentes, os efetivos são os nominais
    expect(r.pesosEfetivos.grupo).toBeCloseTo(PESO_GRUPO_V2, 6)
    expect(r.pesosEfetivos.vitorias).toBeCloseTo(PESO_VITORIAS_V2, 6)
    expect(r.pesosEfetivos.posJogo).toBeCloseTo(PESO_POS_JOGO_V2, 6)
  })

  it('os efetivos só divergem dos nominais quando FALTA uma parcela', () => {
    const completo = calcularOverall({
      avg: 4,
      matches: 10,
      goals: 10,
      assists: 5,
      post_rating_avg: 4,
      post_rating_count: 1,
      wae_saldo: 0,
      wae_matches: 5,
    })
    expect(completo.pesosEfetivos.vitorias).toBeCloseTo(PESO_VITORIAS_V2, 6)
    expect(completo.pesosEfetivos.grupo).toBeCloseTo(PESO_GRUPO_V2, 6)
    expect(completo.pesosEfetivos.desempenho).toBeCloseTo(PESO_DESEMPENHO_V2, 6)
    expect(completo.pesosEfetivos.posJogo).toBeCloseTo(PESO_POS_JOGO_V2, 6)

    // sem rodadas de campo, os 25% do desempenho repartem-se pelas outras
    const semCampo = calcularOverall({
      avg: 4,
      matches: 0,
      goals: 0,
      assists: 0,
      post_rating_avg: 4,
      post_rating_count: 3,
    })
    // sem rodadas de campo nao ha desempenho NEM vitorias: as duas saem e o
    // que resta reparte os 100%
    const resto = PESO_GRUPO_V2 + PESO_POS_JOGO_V2
    expect(semCampo.pesosEfetivos.desempenho).toBe(0)
    expect(semCampo.pesosEfetivos.vitorias).toBe(0)
    expect(semCampo.pesosEfetivos.grupo).toBeCloseTo(PESO_GRUPO_V2 / resto, 6)
    expect(semCampo.pesosEfetivos.posJogo).toBeCloseTo(PESO_POS_JOGO_V2 / resto, 6)
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

// --------------------------------------------------- vitórias acima do esperado
//
// A pergunta é "ganhaste mais do que era suposto?", não "ganhaste?".
//
// A taxa de vitórias crua foi medida no plantel real e rejeitada: premiava
// amostras de 1 e 2 jogos e castigava em 21 pontos quem tinha a melhor
// avaliação do grupo e quatro derrotas. Estes testes existem para ela não
// voltar disfarçada.
describe('notaAcimaDoEsperado', () => {
  it('saldo zero é exatamente o esperado — 50', () => {
    expect(notaAcimaDoEsperado(0, WAE_MIN_JOGOS)).toBe(50)
  })

  it('ganhar mais do que o previsto sobe, perder mais desce', () => {
    expect(notaAcimaDoEsperado(1.5, WAE_MIN_JOGOS)).toBeGreaterThan(50)
    expect(notaAcimaDoEsperado(-1.5, WAE_MIN_JOGOS)).toBeLessThan(50)
  })

  it('é simétrica: o mesmo desvio para cima e para baixo afasta-se o mesmo', () => {
    const cima = notaAcimaDoEsperado(1, 5) - 50
    const baixo = 50 - notaAcimaDoEsperado(-1, 5)
    expect(cima).toBeCloseTo(baixo, 6)
  })

  it('a confiança puxa para 50 até WAE_MIN_JOGOS', () => {
    // o mesmo saldo MÉDIO conta menos com menos rodadas
    const uma = notaAcimaDoEsperado(0.4, 1)
    const cinco = notaAcimaDoEsperado(2.0, 5) // mesmo saldo médio: 0,4
    expect(uma).toBeLessThan(cinco)
    expect(uma - 50).toBeCloseTo((cinco - 50) / WAE_MIN_JOGOS, 6)
  })

  it('a partir de WAE_MIN_JOGOS a confiança pára de crescer', () => {
    const cinco = notaAcimaDoEsperado(2.0, 5) // médio 0,4
    const vinte = notaAcimaDoEsperado(8.0, 20) // médio 0,4
    expect(cinco).toBeCloseTo(vinte, 6)
  })

  it('nunca sai de 0–100, por muito extremo que seja o saldo', () => {
    expect(notaAcimaDoEsperado(50, 5)).toBe(100)
    expect(notaAcimaDoEsperado(-50, 5)).toBe(0)
  })

  it('sem rodadas devolve null — a parcela sai da conta em vez de valer 50', () => {
    // esta é a diferença que evita castigar quem nunca jogou: com a taxa
    // crua, 10 jogadores com zero jogos perdiam ~10 pontos por causa de uma
    // parcela que nem se lhes aplicava
    expect(notaAcimaDoEsperado(0, 0)).toBe(null)
    expect(notaAcimaDoEsperado(null, 5)).toBe(null)
    expect(notaAcimaDoEsperado(undefined, undefined)).toBe(null)
  })

  it('aceita numeric em texto, como vem do Postgres', () => {
    expect(notaAcimaDoEsperado('0.5', '5')).toBeCloseTo(notaAcimaDoEsperado(0.5, 5), 6)
  })
})

describe('a parcela das vitórias no overall', () => {
  const perfil = { avg: 4, matches: 10, goals: 10, assists: 5, craques: 0, bagres: 0,
                   post_rating_avg: 4, post_rating_count: 6 }

  it('quem nunca teve rodada com forças gravadas não tem a parcela', () => {
    const r = calcularOverall(perfil)
    expect(r.vitorias).toBe(null)
    expect(r.pesos.vitorias).toBe(0)
    expect(r.pesosEfetivos.vitorias).toBe(0)
  })

  it('a parcela em falta NÃO é castigo: os outros pesos renormalizam', () => {
    const sem = calcularOverall(perfil)
    const neutro = calcularOverall({ ...perfil, wae_saldo: 0, wae_matches: 5 })
    // com saldo exatamente no esperado (50), o overall fica próximo do de
    // quem nem tem a parcela — a diferença é só o 50 puxar a média
    expect(Math.abs(sem.overall - neutro.overall)).toBeLessThanOrEqual(4)
  })

  it('ganhar acima do esperado sobe o overall; abaixo, desce', () => {
    const acima = calcularOverall({ ...perfil, wae_saldo: 1.5, wae_matches: 5 })
    const neutro = calcularOverall({ ...perfil, wae_saldo: 0, wae_matches: 5 })
    const abaixo = calcularOverall({ ...perfil, wae_saldo: -1.5, wae_matches: 5 })
    expect(acima.overall).toBeGreaterThan(neutro.overall)
    expect(abaixo.overall).toBeLessThan(neutro.overall)
  })

  it('uma rodada isolada quase não mexe — é a diferença face à taxa crua', () => {
    const neutro = calcularOverall({ ...perfil, wae_saldo: 0, wae_matches: 5 })
    // ganhou a única rodada que jogou, e bem acima do esperado
    const umaSo = calcularOverall({ ...perfil, wae_saldo: 0.6, wae_matches: 1 })
    expect(Math.abs(umaSo.overall - neutro.overall)).toBeLessThanOrEqual(3)
  })

  it('assinala-se como provisória até WAE_MIN_JOGOS', () => {
    const poucas = calcularOverall({ ...perfil, wae_saldo: 0.5, wae_matches: 2 })
    const bastantes = calcularOverall({ ...perfil, wae_saldo: 0.5, wae_matches: WAE_MIN_JOGOS })
    expect(poucas.vitoriasProvisorio).toBe(true)
    expect(bastantes.vitoriasProvisorio).toBe(false)
  })

  it('não entra na v1 — a fórmula antiga fica congelada', () => {
    const r = calcularOverall({ avg: 4, matches: 10, goals: 10, assists: 5,
                                wae_saldo: 2, wae_matches: 8 })
    expect(r.versao).toBe(1)
    expect(r.pesos.vitorias).toBe(0)
    expect(r.pesosEfetivos.vitorias).toBe(0)
  })
})
