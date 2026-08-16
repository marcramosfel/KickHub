import { describe, expect, it } from 'vitest'
import {
  computePlayerOverall, computeTitles, contributionPerGame, explainOverall,
  explainSquadOverall, isProvisional, MAX_OVERALL, MIN_OVERALL,
  type OverallInput, type TitleInput,
} from './player-overall'

const player = (overrides: Partial<OverallInput> = {}): OverallInput => ({
  gamesPlayed: 10, goals: 0, assists: 0, baseRating: null, postRatingAvg: null,
  craques: 0, bagres: 0, waeSaldo: null, waeMatches: 0, titles: [], ...overrides,
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

  /** Se a decomposição não soma ao total, o painel está errado — ou a conta está. */
  it('as parcelas e os prémios somam ao número que é mostrado', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 8, goals: 12, assists: 4, baseRating: 74, postRatingAvg: 4, craques: 2, bagres: 1,
    }))!
    const soma = breakdown.parts.reduce((sum, part) => sum + part.value * part.weight, 0)
      + breakdown.adjustments.reduce((sum, item) => sum + item.points, 0)
    expect(Math.round(soma)).toBe(breakdown.overall)
    expect(breakdown.adjustments.map((item) => item.key)).toEqual(['craque', 'bagre'])
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

describe('craque e bagre', () => {
  /**
   * Premiar mais do que castigar: o craque vale +9 e o bagre −4. A assimetria
   * é deliberada e é a mesma regra que governa o resto da conta.
   */
  it('premia mais do que castiga', () => {
    const base = explainOverall(player({ gamesPlayed: 10, baseRating: 50 }))!.overall
    const craque = explainOverall(player({ gamesPlayed: 10, baseRating: 50, craques: 10 }))!.overall
    const bagre = explainOverall(player({ gamesPlayed: 10, baseRating: 50, bagres: 10 }))!.overall

    expect(craque - base).toBe(9)
    expect(base - bagre).toBe(4)
  })

  /**
   * Contam pela taxa, não pelo total: senão quem joga há mais tempo acumulava
   * bónus só por ter jogado mais.
   */
  it('conta pela taxa e não pelo total', () => {
    const dezEmDez = explainOverall(player({ gamesPlayed: 10, baseRating: 50, craques: 10 }))!
    const umEmVinte = explainOverall(player({ gamesPlayed: 20, baseRating: 50, craques: 1 }))!

    expect(dezEmDez.adjustments[0].points).toBe(9)
    expect(umEmVinte.adjustments[0].points).toBeCloseTo(0.45, 6)
  })

  it('não deixa a taxa passar de um, nem sem jogos rebentar', () => {
    // Mais prémios do que jogos não deve existir, mas se existir não infla.
    expect(explainOverall(player({ gamesPlayed: 2, baseRating: 50, craques: 5 }))!.adjustments[0].points).toBe(9)
    expect(explainOverall(player({ gamesPlayed: 0, baseRating: 50, craques: 3 }))!.adjustments).toEqual([])
  })

  it('não inventa um ajuste para quem nunca levou prémio', () => {
    expect(explainOverall(player({ gamesPlayed: 10, baseRating: 50 }))!.adjustments).toEqual([])
  })
})

describe('vitórias acima do esperado', () => {
  /**
   * 50 é "exactamente o esperado". Ganhar sendo favorito folgado quase não
   * conta; ganhar sendo azarão conta muito. É o que distingue esta parcela da
   * taxa de vitórias crua, que numa pelada com sorteio equilibrado mede ruído.
   */
  it('põe o esperado no meio da escala', () => {
    const comoEsperado = explainOverall(player({ gamesPlayed: 10, waeSaldo: 0, waeMatches: 10 }))!
    expect(comoEsperado.parts.find((part) => part.key === 'wae')!.value).toBe(50)

    // Favorito a 93% que ganha: saldo +0,07 por rodada.
    const favorito = explainOverall(player({ gamesPlayed: 10, waeSaldo: 0.07 * 10, waeMatches: 10 }))!
    expect(favorito.parts.find((part) => part.key === 'wae')!.value).toBeCloseTo(57, 6)

    // Ligeiro favorito a 74% que ganha: saldo +0,26 por rodada.
    const ligeiro = explainOverall(player({ gamesPlayed: 10, waeSaldo: 0.26 * 10, waeMatches: 10 }))!
    expect(ligeiro.parts.find((part) => part.key === 'wae')!.value).toBeCloseTo(76, 6)

    // Ganhar sempre como azarão a 7% dá 143 e trava no topo da escala: quem o
    // faz esgotou o que esta parcela consegue medir.
    const azarao = explainOverall(player({ gamesPlayed: 10, waeSaldo: 0.93 * 10, waeMatches: 10 }))!
    expect(azarao.parts.find((part) => part.key === 'wae')!.value).toBe(100)
  })

  it('não sai da escala mesmo com saldos extremos', () => {
    const impossivel = explainOverall(player({ gamesPlayed: 3, waeSaldo: 30, waeMatches: 3 }))!
    expect(impossivel.parts.find((part) => part.key === 'wae')!.value).toBe(100)
    const fundo = explainOverall(player({ gamesPlayed: 3, waeSaldo: -30, waeMatches: 3 }))!
    expect(fundo.parts.find((part) => part.key === 'wae')!.value).toBe(0)
  })

  /**
   * O peso desliza em vez de ligar de repente às cinco rodadas: um jogador que
   * rendeu exactamente o esperado não pode perder pontos de um dia para o outro
   * só por cruzar uma fronteira.
   */
  it('faz o peso deslizar até às cinco rodadas', () => {
    const pesoCom = (matches: number) => {
      const parts = explainOverall(player({ gamesPlayed: 10, baseRating: 60, waeSaldo: 0, waeMatches: matches }))!.parts
      return parts.find((part) => part.key === 'wae')?.weight ?? 0
    }
    // Nominal 0,15, mas renormalizado — o que importa é crescer sem saltos.
    expect(pesoCom(0)).toBe(0)
    expect(pesoCom(1)).toBeGreaterThan(0)
    expect(pesoCom(1)).toBeLessThan(pesoCom(3))
    expect(pesoCom(3)).toBeLessThan(pesoCom(5))
    expect(pesoCom(5)).toBeCloseTo(pesoCom(20), 10)
  })

  it('não inventa a parcela sem rodadas medidas', () => {
    const sem = explainOverall(player({ gamesPlayed: 10, baseRating: 60 }))!
    expect(sem.parts.map((part) => part.key)).not.toContain('wae')
  })

  /**
   * Sem esta guarda, um jogador com saldo exactamente zero e nenhuma rodada
   * medida entraria com nota 50 e um peso de zero — inofensivo, mas a parcela
   * apareceria na decomposição a dizer que foi medida quando não foi.
   */
  it('trata saldo nulo como ausência, e não como zero', () => {
    expect(explainOverall(player({ gamesPlayed: 10, baseRating: 60, waeSaldo: null, waeMatches: 3 }))!
      .parts.map((part) => part.key)).not.toContain('wae')
  })
})

const squadRow = (overrides: Partial<TitleInput> = {}): TitleInput => ({
  membershipId: 'm1', gamesPlayed: 0, goals: 0, assists: 0, wins: 0, craques: 0,
  currentWinStreak: 0, ...overrides,
})

describe('títulos', () => {
  it('dá o título a quem lidera cada métrica', () => {
    const titles = computeTitles([
      squadRow({ membershipId: 'a', gamesPlayed: 5, goals: 9, assists: 1, wins: 4, craques: 2 }),
      squadRow({ membershipId: 'b', gamesPlayed: 9, goals: 2, assists: 7, wins: 1, craques: 0 }),
    ])
    expect(titles.get('a')).toEqual(['topScorer', 'mostWins', 'mostCraques'])
    expect(titles.get('b')).toEqual(['topAssists', 'mostGames'])
  })

  /** Empate premeia todos os empatados. */
  it('premeia todos os empatados', () => {
    const titles = computeTitles([
      squadRow({ membershipId: 'a', goals: 5 }),
      squadRow({ membershipId: 'b', goals: 5 }),
      squadRow({ membershipId: 'c', goals: 2 }),
    ])
    expect(titles.get('a')).toContain('topScorer')
    expect(titles.get('b')).toContain('topScorer')
    expect(titles.get('c')).not.toContain('topScorer')
  })

  /** Não há artilheiro numa pelada sem golos. */
  it('não inventa um título quando ninguém marcou', () => {
    const titles = computeTitles([squadRow({ membershipId: 'a' }), squadRow({ membershipId: 'b' })])
    expect(titles.get('a')).toEqual([])
    expect(titles.get('b')).toEqual([])
  })

  /**
   * A sequência não é um lugar único: é uma marca. Quem chegar a três leva, e
   * podem ser vários ao mesmo tempo.
   */
  it('dá a marca de sequência a todos os que chegam a três', () => {
    const titles = computeTitles([
      squadRow({ membershipId: 'a', currentWinStreak: 3 }),
      squadRow({ membershipId: 'b', currentWinStreak: 7 }),
      squadRow({ membershipId: 'c', currentWinStreak: 2 }),
    ])
    expect(titles.get('a')).toEqual(['winStreak'])
    expect(titles.get('b')).toEqual(['winStreak'])
    expect(titles.get('c')).toEqual([])
  })

  it('soma um ponto por título, e nada a quem não tem nenhum', () => {
    const sem = explainOverall(player({ gamesPlayed: 10, baseRating: 50 }))!
    const comDois = explainOverall(player({
      gamesPlayed: 10, baseRating: 50, titles: ['topScorer', 'mostGames'],
    }))!
    expect(comDois.overall - sem.overall).toBe(2)
    expect(comDois.adjustments.find((item) => item.key === 'titles')!.points).toBe(2)
    expect(sem.adjustments).toEqual([])
  })

  /**
   * Nenhum título mede o overall. Se medisse, o número passaria a alimentar-se
   * a si mesmo e o resultado dependeria da ordem por que fossem calculados.
   */
  it('não olha para o overall ao decidir quem lidera', () => {
    const rows = [
      squadRow({ membershipId: 'fraco', gamesPlayed: 3, goals: 9 }),
      squadRow({ membershipId: 'forte', gamesPlayed: 3, goals: 1 }),
    ]
    expect(computeTitles(rows).get('fraco')).toContain('topScorer')
  })
})

describe('o plantel em duas passagens', () => {
  /**
   * Os títulos dependem de comparar todos, portanto o overall de alguém não se
   * pode calcular isoladamente. Esta é a razão arquitetural das duas passagens.
   */
  it('atribui o bónus de título a partir da comparação, não da linha', () => {
    // O primeiro lidera golos e presenças; o segundo não lidera nada.
    const rows = [
      { ...player({ gamesPlayed: 4, goals: 8, baseRating: 50 }), membershipId: 'artilheiro', wins: 0 },
      { ...player({ gamesPlayed: 2, goals: 1, baseRating: 50 }), membershipId: 'outro', wins: 0 },
    ]
    const porMembro = explainSquadOverall(rows)

    const artilheiro = porMembro.get('artilheiro')!
    expect(artilheiro.adjustments.find((item) => item.key === 'titles')!.points).toBe(2)
    expect(porMembro.get('outro')!.adjustments).toEqual([])

    // Calculado sozinho, o mesmo jogador não teria o título — porque não há com
    // quem o comparar.
    expect(explainOverall(rows[0])!.adjustments).toEqual([])
  })

  it('deixa de fora quem não tem número nenhum a mostrar', () => {
    const porMembro = explainSquadOverall([
      { ...player({ gamesPlayed: 0, baseRating: null }), membershipId: 'sem-nada', wins: 0 },
    ])
    expect(porMembro.has('sem-nada')).toBe(false)
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
