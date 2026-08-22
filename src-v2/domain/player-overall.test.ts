import { describe, expect, it } from 'vitest'
import {
  computePlayerOverall, computeTitles, contributionPerGame, explainOverall,
  explainSquadOverall, isPostRatingProvisional, isProvisional, isWaeProvisional,
  leagueConcededPerGame, pesosDaTransicao, titleBonus, MAX_OVERALL, MIN_OVERALL,
  distanceToTitle, titleStandings,
  type OverallInput, type TitleInput,
} from './player-overall'

/** Jogador de campo sem nada preenchido: cada teste acrescenta o que precisa. */
const player = (overrides: Partial<OverallInput> = {}): OverallInput => ({
  gamesPlayed: 0, goals: 0, assists: 0, baseRating: null,
  postRatingAvg: null, postRatingCount: 0,
  craques: 0, bagres: 0, waeSaldo: null, waeMatches: 0, titles: [],
  playerType: 'FIELD',
  gkMatches: 0, gkSaves: 0, gkConceded: 0, gkCleanSheets: 0, gkWins: 0,
  gkLeagueConcededPerGame: null, ...overrides,
})

const keeper = (overrides: Partial<OverallInput> = {}): OverallInput => player({
  playerType: 'GOALKEEPER',
  gkMatches: 5, gkSaves: 30, gkConceded: 10, gkCleanSheets: 3, gkWins: 3,
  gkLeagueConcededPerGame: 2, baseRating: 90, ...overrides,
})

describe('contributo por jogo', () => {
  /**
   * A assistência vale um golo inteiro. A fórmula da pelada é
   * `(golos + assistências) / rodadas` — não uma média pesada.
   */
  it('conta a assistência como conta o golo', () => {
    expect(contributionPerGame(player({ gamesPlayed: 10, goals: 10 }))).toBe(1)
    expect(contributionPerGame(player({ gamesPlayed: 10, assists: 10 }))).toBe(1)
    expect(contributionPerGame(player({ gamesPlayed: 4, goals: 6, assists: 6 }))).toBe(3)
  })

  it('não mede contributo a quem não jogou', () => {
    expect(contributionPerGame(player({ gamesPlayed: 0, goals: 5 }))).toBe(0)
  })
})

describe('v1 — antes da primeira avaliação pós-jogo', () => {
  /** 0,70 × grupo + 0,30 × desempenho. */
  it('mistura a nota do grupo com o desempenho a 70/30', () => {
    // desempenho: (6+6)/4 = 3 participações por jogo, o topo → 100
    const breakdown = explainOverall(player({
      gamesPlayed: 4, goals: 6, assists: 6, baseRating: 80,
    }))!
    expect(breakdown.version).toBe(1)
    expect(breakdown.overall).toBe(0.70 * 80 + 0.30 * 100)
    expect(breakdown.parts.map((part) => [part.key, part.weight]))
      .toEqual([['opinion', 0.70], ['performance', 0.30]])
  })

  /**
   * Os ramos parciais não levam extras: quem não tem nota do grupo — ou não tem
   * rodadas — também não tem prémios que contem.
   */
  it('sem nota do grupo devolve o desempenho puro, sem prémios', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 2, goals: 3, baseRating: null, craques: 2, titles: ['topScorer'],
    }))!
    expect(breakdown.overall).toBe(50) // (3/2)/3 = 0,5
    expect(breakdown.adjustments).toEqual([])
    expect(breakdown.provisional).toBe(true)
  })

  it('sem rodadas devolve a nota do grupo pura, sem prémios', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 0, baseRating: 70, craques: 3, titles: ['mostWins'],
    }))!
    expect(breakdown.overall).toBe(70)
    expect(breakdown.adjustments).toEqual([])
    expect(breakdown.provisional).toBe(true)
  })

  /** Nada de números bonitos e falsos: sem dados nenhuns, não há resposta. */
  it('sem nota do grupo e sem rodadas não devolve número nenhum', () => {
    expect(explainOverall(player())).toBeNull()
    expect(computePlayerOverall(player())).toBeNull()
    expect(isProvisional(player())).toBe(true)
  })
})

describe('v2 — a partir da primeira avaliação pós-jogo', () => {
  /**
   * A transição é do jogador e não do deploy: acontece quando ele recebe a
   * primeira avaliação válida dos companheiros.
   */
  it('só transita quando existe avaliação pós-jogo', () => {
    const semAvaliacao = explainOverall(player({ gamesPlayed: 3, goals: 3, baseRating: 70 }))!
    expect(semAvaliacao.version).toBe(1)

    const comAvaliacao = explainOverall(player({
      gamesPlayed: 3, goals: 3, baseRating: 70, postRatingAvg: 4, postRatingCount: 1,
    }))!
    expect(comAvaliacao.version).toBe(2)
  })

  /** Uma média sem votos não é média nenhuma. */
  it('ignora uma média pós-jogo que não veio de voto nenhum', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 3, goals: 3, baseRating: 70, postRatingAvg: 4, postRatingCount: 0,
    }))!
    expect(breakdown.version).toBe(1)
  })

  /**
   * Sem rodadas medidas o peso das vitórias é zero, e os 15% dele estão
   * distribuídos pelo grupo e pelo desempenho: 50/0/25/25.
   */
  it('sem saldo medido reparte os pesos por 50/0/25/25', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 4, goals: 3, assists: 3, baseRating: 80,
      postRatingAvg: 4, postRatingCount: 3, waeMatches: 0,
    }))!
    expect(breakdown.parts.map((part) => [part.key, part.weight])).toEqual([
      ['postRating', 0.25], ['opinion', 0.50], ['performance', 0.25],
    ])
    // 80×0,25 + 80×0,50 + 50×0,25 = 72,5
    expect(breakdown.overall).toBe(73)
  })

  /** Com cinco rodadas medidas os pesos são os do regime: 40/15/20/25. */
  it('com cinco rodadas medidas usa 40/15/20/25', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 5, goals: 5, assists: 10, baseRating: 60,
      postRatingAvg: 3, postRatingCount: 5, waeSaldo: 1, waeMatches: 5,
    }))!
    expect(breakdown.parts.map((part) => [part.key, part.weight])).toEqual([
      ['postRating', 0.25], ['opinion', 0.40], ['wae', 0.15], ['performance', 0.20],
    ])
    // 60×0,25 + 60×0,40 + 70×0,15 + 100×0,20 = 69,5
    expect(breakdown.overall).toBe(70)
  })

  /**
   * Os pesos deslizam em vez de ligarem de uma vez às cinco rodadas. Ligar de
   * repente fazia quem rendeu exactamente o esperado perder cinco pontos de um
   * dia para o outro, sem nada ter acontecido em campo.
   */
  it('desliza os pesos entre zero e cinco rodadas', () => {
    expect(pesosDaTransicao(0)).toEqual({ grupo: 0.50, vitorias: 0, desempenho: 0.25, posJogo: 0.25 })
    expect(pesosDaTransicao(5)).toEqual({ grupo: 0.40, vitorias: 0.15, desempenho: 0.20, posJogo: 0.25 })

    const meio = pesosDaTransicao(2)
    expect(meio.grupo).toBeCloseTo(0.46, 10)
    expect(meio.vitorias).toBeCloseTo(0.06, 10)
    expect(meio.desempenho).toBeCloseTo(0.23, 10)
    expect(meio.posJogo).toBe(0.25)
  })

  it('os pesos somam sempre um, em qualquer ponto da transição', () => {
    for (const rodadas of [0, 1, 2, 3, 4, 5, 9]) {
      const pesos = pesosDaTransicao(rodadas)
      const soma = pesos.grupo + pesos.vitorias + pesos.desempenho + pesos.posJogo
      expect(soma).toBeCloseTo(1, 10)
    }
  })

  /** A parcela que falta sai da conta; o que resta renormaliza-se. */
  it('deixa cair a nota do grupo de quem ninguém votou', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 2, goals: 3, baseRating: null, postRatingAvg: 4, postRatingCount: 2,
    }))!
    expect(breakdown.parts.map((part) => part.key)).not.toContain('opinion')
    expect(breakdown.parts.reduce((sum, part) => sum + part.weight, 0)).toBeCloseTo(1, 10)
  })

  /** 50 é exactamente o esperado: a nota é crua, quem trata da amostra é o peso. */
  it('põe o esperado no meio da escala e não sai dela', () => {
    const exacto = explainOverall(player({
      gamesPlayed: 5, baseRating: 50, postRatingAvg: 2.5, postRatingCount: 5,
      waeSaldo: 0, waeMatches: 5,
    }))!
    expect(exacto.parts.find((part) => part.key === 'wae')!.value).toBe(50)

    const extremo = explainOverall(player({
      gamesPlayed: 5, baseRating: 50, postRatingAvg: 2.5, postRatingCount: 5,
      waeSaldo: 5, waeMatches: 5,
    }))!
    expect(extremo.parts.find((part) => part.key === 'wae')!.value).toBe(100)
  })
})

describe('prémios e títulos', () => {
  /**
   * Contam pela taxa e nunca pelo total: craque em todas as rodadas vale o
   * máximo, craque numa de vinte vale quase nada.
   */
  it('conta craque e bagre pela taxa, não pelo total', () => {
    const metade = explainOverall(player({
      gamesPlayed: 4, goals: 6, baseRating: 50, craques: 2,
    }))!
    expect(metade.adjustments).toEqual([{ key: 'craque', points: 4.5 }])

    const raro = explainOverall(player({
      gamesPlayed: 20, goals: 30, baseRating: 50, craques: 1,
    }))!
    expect(raro.adjustments[0].points).toBeCloseTo(0.45, 10)
  })

  /** Premiar mais do que castigar: +9 contra −4. */
  it('premeia o craque mais do que castiga o bagre', () => {
    const craque = explainOverall(player({ gamesPlayed: 2, goals: 2, baseRating: 50, craques: 2 }))!
    const bagre = explainOverall(player({ gamesPlayed: 2, goals: 2, baseRating: 50, bagres: 2 }))!
    expect(craque.adjustments[0].points).toBe(9)
    expect(bagre.adjustments[0].points).toBe(-4)
  })

  /** Dois títulos de ouro são +3 cada; os escalões estão em `TITLE_TIER`. */
  it('paga cada título pelo escalão, e não um ponto por cabeça', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 2, goals: 2, baseRating: 50, titles: ['topScorer', 'mostWins'],
    }))!
    expect(breakdown.adjustments).toEqual([{ key: 'titles', points: 6 }])
  })

  /** Se as parcelas e os extras não somam ao total, o painel está errado. */
  it('a decomposição soma ao número mostrado', () => {
    const breakdown = explainOverall(player({
      gamesPlayed: 5, goals: 4, assists: 3, baseRating: 72,
      postRatingAvg: 3.4, postRatingCount: 6, waeSaldo: 0.6, waeMatches: 4,
      craques: 1, bagres: 1, titles: ['mostGames'],
    }))!
    const soma = breakdown.parts.reduce((sum, part) => sum + part.value * part.weight, 0)
      + breakdown.adjustments.reduce((sum, item) => sum + item.points, 0)
    expect(Math.round(soma)).toBe(breakdown.overall)
  })
})

describe('títulos do plantel', () => {
  const row = (overrides: Partial<TitleInput> & { membershipId: string }): TitleInput => ({
    gamesPlayed: 1, goals: 0, assists: 0, wins: 0, craques: 0, currentWinStreak: 0, ...overrides,
  })

  /**
   * A classificação é o que torna um título uma corrida em vez de um
   * autocolante: sem ela ninguém sabe o que lhe falta para o tomar.
   */
  it('diz quem lidera cada título e com que valor', () => {
    const standings = titleStandings([
      row({ membershipId: 'a', goals: 9 }),
      row({ membershipId: 'b', goals: 6 }),
    ])
    const artilheiro = standings.find((s) => s.key === 'topScorer')!
    expect(artilheiro.holders).toEqual(['a'])
    expect(artilheiro.leadingValue).toBe(9)
    expect(artilheiro.tier).toBe('ouro')
  })

  it('mede a distância a quem lidera', () => {
    const standings = titleStandings([
      row({ membershipId: 'a', goals: 9 }),
      row({ membershipId: 'b', goals: 6 }),
    ])
    const artilheiro = standings.find((s) => s.key === 'topScorer')!
    expect(distanceToTitle(artilheiro, 'b')).toEqual({ mine: 6, leading: 9, behind: 3, holding: false })
    expect(distanceToTitle(artilheiro, 'a')).toEqual({ mine: 9, leading: 9, behind: 0, holding: true })
  })

  /**
   * Quem não é candidato não está "três atrás": está fora da corrida. Dar-lhe
   * um número era mentir-lhe sobre a distância — e é por isso que se devolve
   * nada em vez de zero.
   */
  it('não inventa distância a quem não é sequer candidato', () => {
    const standings = titleStandings([
      row({ membershipId: 'a', gamesPlayed: 10, wins: 8 }),
      row({ membershipId: 'b', gamesPlayed: 1, wins: 1 }),
    ])
    const aproveitamento = standings.find((s) => s.key === 'accuracy')!
    expect(aproveitamento.values.has('b')).toBe(false)
    expect(distanceToTitle(aproveitamento, 'b')).toBeNull()
  })

  it('não dá título nenhum quando ninguém marcou', () => {
    const standings = titleStandings([row({ membershipId: 'a' }), row({ membershipId: 'b' })])
    const artilheiro = standings.find((s) => s.key === 'topScorer')!
    expect(artilheiro.holders).toEqual([])
    expect(artilheiro.leadingValue).toBeNull()
  })

  it('premeia todos os empatados', () => {
    const titles = computeTitles([
      row({ membershipId: 'a', goals: 5 }),
      row({ membershipId: 'b', goals: 5 }),
      row({ membershipId: 'c', goals: 1 }),
    ])
    expect(titles.get('a')).toContain('topScorer')
    expect(titles.get('b')).toContain('topScorer')
    expect(titles.get('c')).not.toContain('topScorer')
  })

  it('não inventa artilheiro numa pelada sem golos', () => {
    const titles = computeTitles([row({ membershipId: 'a' }), row({ membershipId: 'b' })])
    // Ambos têm uma rodada, portanto empatam em "mais jogos" e levam essa. O que
    // não pode existir é artilheiro, porque ninguém marcou.
    expect(titles.get('a')).not.toContain('topScorer')
    expect(titles.get('b')).not.toContain('topScorer')
    expect(titles.get('a')).toContain('mostGames')
  })

  /** A sequência não é um lugar único: é uma marca, e podem tê-la vários. */
  it('dá a sequência a quem chegar a três, mesmo que sejam vários', () => {
    const titles = computeTitles([
      row({ membershipId: 'a', currentWinStreak: 3 }),
      row({ membershipId: 'b', currentWinStreak: 4 }),
      row({ membershipId: 'c', currentWinStreak: 2 }),
    ])
    expect(titles.get('a')).toContain('winStreak')
    expect(titles.get('b')).toContain('winStreak')
    expect(titles.get('c')).not.toContain('winStreak')
  })
})

describe('escala do guarda-redes', () => {
  /**
   * Só quem é do **tipo** guarda-redes. Um jogador de campo com passagens na
   * baliza mantém o overall de campo — foi o que a rotação da Browns produziu.
   */
  it('julga pela baliza apenas quem está inscrito como guarda-redes', () => {
    const inscrito = explainOverall(keeper())!
    expect(inscrito.parts.map((part) => part.key))
      .toEqual(['gkSaves', 'gkConceded', 'gkCleanSheets', 'gkWins'])

    const rodou = explainOverall(player({
      playerType: 'FIELD', gamesPlayed: 3, goals: 3, baseRating: 70,
      gkMatches: 3, gkSaves: 10, gkConceded: 5,
    }))!
    expect(rodou.parts.map((part) => part.key)).toContain('opinion')
    expect(rodou.parts.map((part) => part.key)).not.toContain('gkSaves')
  })

  /** 60% defesas + 20% golos sofridos + 10% sem sofrer + 10% vitórias. */
  it('pesa as defesas mais do que tudo o resto junto', () => {
    // defesas 30/40 = 75 ; sofridos 10/5 = 2 = média → 50 ; sem sofrer 3/5 = 60
    // vitórias 3/5 = 60 → 75×0,6 + 50×0,2 + 60×0,1 + 60×0,1 = 67
    expect(explainOverall(keeper())!.overall).toBe(67)
  })

  /** Um empate não é meia vitória para quem esteve lá atrás. */
  it('conta vitórias na baliza, não pontos', () => {
    const semVitorias = explainOverall(keeper({ gkWins: 0 }))!
    const comTodas = explainOverall(keeper({ gkWins: 5 }))!
    expect(comTodas.overall - semVitorias.overall).toBe(10)
  })

  /** Comparam-se com a média da pelada, não com um número absoluto. */
  it('compara os golos sofridos com a média da pelada', () => {
    const naMedia = explainOverall(keeper({ gkConceded: 10, gkLeagueConcededPerGame: 2 }))!
    expect(naMedia.parts.find((part) => part.key === 'gkConceded')!.value).toBe(50)

    const melhor = explainOverall(keeper({ gkConceded: 5, gkLeagueConcededPerGame: 2 }))!
    expect(melhor.parts.find((part) => part.key === 'gkConceded')!.value).toBe(65)
  })

  /**
   * Sem média da pelada usa-se a do próprio, que dá exactamente 50. Um neutro
   * honesto vale mais do que uma referência inventada.
   */
  it('cai no neutro quando não há média da pelada', () => {
    const sozinho = explainOverall(keeper({ gkLeagueConcededPerGame: null }))!
    expect(sozinho.parts.find((part) => part.key === 'gkConceded')!.value).toBe(50)
  })

  /** A confiança impede que uma rodada de sorte mande alguém para o topo. */
  it('puxa o número ao neutro enquanto há poucas rodadas na baliza', () => {
    const uma = explainOverall(keeper({
      gkMatches: 1, gkSaves: 10, gkConceded: 0, gkCleanSheets: 1, gkWins: 1,
    }))!
    // defesas 100 ; sofridos 50+15×2 = 80 ; sem sofrer 100 ; vitórias 100 → 96
    // confiança 1/5 → 50 + (96−50)×0,2 = 59,2
    expect(uma.overall).toBe(59)
    expect(uma.provisional).toBe(true)

    const cinco = explainOverall(keeper({
      gkMatches: 5, gkSaves: 50, gkConceded: 0, gkCleanSheets: 5, gkWins: 5,
    }))!
    expect(cinco.overall).toBe(96)
    expect(cinco.provisional).toBe(false)
  })

  it('não devolve número a quem nunca guardou a baliza', () => {
    expect(explainOverall(keeper({ gkMatches: 0 }))).toBeNull()
  })

  /** A escala é 0–100, e não 1–99 como a de campo. */
  it('deixa o guarda-redes chegar a zero e a cem', () => {
    const pessimo = explainOverall(keeper({
      gkMatches: 5, gkSaves: 0, gkConceded: 50, gkCleanSheets: 0, gkWins: 0,
      gkLeagueConcededPerGame: 1,
    }))!
    expect(pessimo.overall).toBe(0)
  })

  it('a decomposição do guarda-redes soma ao número mostrado', () => {
    const breakdown = explainOverall(keeper({ titles: ['mostWins'] }))!
    const soma = breakdown.parts.reduce((sum, part) => sum + part.value * part.weight, 0)
      + breakdown.adjustments.reduce((sum, item) => sum + item.points, 0)
    expect(Math.round(soma)).toBe(breakdown.overall)
  })

  it('calcula a média de golos sofridos da pelada', () => {
    expect(leagueConcededPerGame([
      keeper({ gkMatches: 4, gkConceded: 4 }),
      keeper({ gkMatches: 6, gkConceded: 16 }),
    ])).toBe(2)
    expect(leagueConcededPerGame([player({ gkMatches: 0 })])).toBeNull()
  })
})

describe('plantel inteiro', () => {
  /**
   * Os títulos dependem de comparar todos, portanto não existe forma correcta de
   * calcular o overall de alguém isoladamente.
   */
  it('atribui os títulos antes de calcular, numa segunda passagem', () => {
    // 'b' joga menos rodadas de propósito: senão empatava em "mais jogos" e
    // levava um título, e o teste deixava de distinguir quem lidera de quem não.
    const rows = [
      { membershipId: 'a', ...player({ gamesPlayed: 3, goals: 9, baseRating: 50 }), wins: 3 },
      { membershipId: 'b', ...player({ gamesPlayed: 1, goals: 1, baseRating: 50 }), wins: 0 },
    ]
    const overalls = explainSquadOverall(rows)
    const artilheiro = overalls.get('a')!
    expect(artilheiro.adjustments.some((item) => item.key === 'titles')).toBe(true)
    expect(overalls.get('b')!.adjustments.some((item) => item.key === 'titles')).toBe(false)
  })

  it('deixa de fora quem não tem número nenhum', () => {
    const overalls = explainSquadOverall([
      { membershipId: 'vazio', ...player(), wins: 0 },
    ])
    expect(overalls.has('vazio')).toBe(false)
  })
})

describe('limites e sinalização', () => {
  it('nunca sai da escala de campo', () => {
    const altissimo = explainOverall(player({
      gamesPlayed: 5, goals: 50, baseRating: 99, postRatingAvg: 5, postRatingCount: 5,
      waeSaldo: 5, waeMatches: 5, craques: 5, titles: ['topScorer', 'mostWins', 'mostGames'],
    }))!
    expect(altissimo.overall).toBeLessThanOrEqual(MAX_OVERALL)

    const baixissimo = explainOverall(player({
      gamesPlayed: 5, baseRating: 1, postRatingAvg: 1, postRatingCount: 5,
      waeSaldo: -5, waeMatches: 5, bagres: 5,
    }))!
    expect(baixissimo.overall).toBeGreaterThanOrEqual(MIN_OVERALL)
  })

  /** O peso das vitórias ainda sobe; o valor não está errado por isso. */
  it('assinala que o peso das vitórias ainda não é o cheio', () => {
    expect(isWaeProvisional(player({ waeMatches: 3 }))).toBe(true)
    expect(isWaeProvisional(player({ waeMatches: 5 }))).toBe(false)
    expect(isWaeProvisional(player({ waeMatches: 0 }))).toBe(false)
  })

  /** Uma única avaliação é pouca confiança — mas o peso dela não muda. */
  it('assinala a avaliação pós-jogo que vem de um voto só', () => {
    expect(isPostRatingProvisional(player({ postRatingCount: 1 }))).toBe(true)
    expect(isPostRatingProvisional(player({ postRatingCount: 2 }))).toBe(false)
  })

  it('quem já foi avaliado pelos companheiros não é provisório', () => {
    expect(isProvisional(player({
      gamesPlayed: 1, goals: 1, baseRating: 60, postRatingAvg: 4, postRatingCount: 1,
    }))).toBe(false)
  })
})

describe('escalões dos títulos', () => {
  const squad = (overrides: Array<Partial<TitleInput> & { membershipId: string }>) =>
    overrides.map((row) => ({
      gamesPlayed: 3, goals: 0, assists: 0, wins: 0, draws: 0, craques: 0,
      currentWinStreak: 0, bestUnbeatenStreak: 0, gkCleanSheets: 0, saves: 0, ...row,
    }))

  /** Ouro +3, prata +2, bronze +1. */
  it('paga cada título pelo escalão dele', () => {
    const ouro = explainOverall(player({
      gamesPlayed: 2, goals: 2, baseRating: 50, titles: ['topScorer'],
    }))!
    expect(ouro.adjustments).toEqual([{ key: 'titles', points: 3 }])

    const prata = explainOverall(player({
      gamesPlayed: 2, goals: 2, baseRating: 50, titles: ['unbeaten'],
    }))!
    expect(prata.adjustments).toEqual([{ key: 'titles', points: 2 }])

    const bronze = explainOverall(player({
      gamesPlayed: 2, goals: 2, baseRating: 50, titles: ['saves'],
    }))!
    expect(bronze.adjustments).toEqual([{ key: 'titles', points: 1 }])
  })

  /**
   * Sem tecto, os dez títulos somariam mais do que o dobro do bónus de craque, e
   * o overall passava a dizer "quantas listas lideras" em vez de "quanto vales".
   */
  it('trava o total dos títulos no mesmo tecto do craque', () => {
    expect(titleBonus(['topScorer', 'topAssists', 'mostWins'])).toBe(9)
    expect(titleBonus([
      'topScorer', 'topAssists', 'mostWins', 'mostCraques', 'mostGames',
      'winStreak', 'accuracy', 'unbeaten', 'wall', 'saves',
    ])).toBe(9)
    expect(titleBonus(['topScorer', 'saves'])).toBe(4)
    expect(titleBonus([])).toBe(0)
    expect(titleBonus(undefined)).toBe(0)
  })

  /** O empate premeia todos: não se inventa desempate para escolher um só. */
  it('dá o título a todos os empatados, sem desempate inventado', () => {
    const titles = computeTitles(squad([
      { membershipId: 'a', goals: 7 },
      { membershipId: 'b', goals: 7 },
      { membershipId: 'c', goals: 6 },
    ]))
    expect(titles.get('a')).toContain('topScorer')
    expect(titles.get('b')).toContain('topScorer')
    expect(titles.get('c')).not.toContain('topScorer')
  })

  /** Aproveitamento: 3 por vitória, 1 por empate, sobre o total possível. */
  it('mede o aproveitamento e ignora quem não tem rodadas que cheguem', () => {
    const titles = computeTitles(squad([
      // 2V+1E em 3 jogos = 7/9
      { membershipId: 'regular', gamesPlayed: 3, wins: 2, draws: 1 },
      // ganhou os dois que fez, mas duas rodadas não chegam para ser candidato
      { membershipId: 'estreante', gamesPlayed: 2, wins: 2 },
    ]))
    expect(titles.get('regular')).toContain('accuracy')
    expect(titles.get('estreante')).not.toContain('accuracy')
  })

  /** Duas taxas idênticas não podem divergir por um bit. */
  it('reconhece o empate entre dois aproveitamentos iguais', () => {
    const titles = computeTitles(squad([
      { membershipId: 'a', gamesPlayed: 3, wins: 2, draws: 1 },
      { membershipId: 'b', gamesPlayed: 6, wins: 4, draws: 2 },
    ]))
    expect(titles.get('a')).toContain('accuracy')
    expect(titles.get('b')).toContain('accuracy')
  })

  it('premeia a maior sequência sem perder, as defesas e os jogos sem sofrer', () => {
    const titles = computeTitles(squad([
      { membershipId: 'invicto', bestUnbeatenStreak: 5 },
      { membershipId: 'guardiao', gkCleanSheets: 3, saves: 40 },
      { membershipId: 'comum', bestUnbeatenStreak: 2, saves: 1 },
    ]))
    expect(titles.get('invicto')).toContain('unbeaten')
    expect(titles.get('guardiao')).toContain('wall')
    expect(titles.get('guardiao')).toContain('saves')
    expect(titles.get('comum')).not.toContain('unbeaten')
  })

  /** Não há Muralha numa pelada onde ninguém deixou de sofrer. */
  it('não atribui título nenhum quando ninguém tem mais do que zero', () => {
    const titles = computeTitles(squad([
      { membershipId: 'a', gamesPlayed: 3 },
      { membershipId: 'b', gamesPlayed: 3 },
    ]))
    expect(titles.get('a')).not.toContain('wall')
    expect(titles.get('a')).not.toContain('saves')
    expect(titles.get('a')).not.toContain('unbeaten')
  })

  /** O guarda-redes leva a medalha como toda a gente. */
  it('paga os títulos ao guarda-redes, depois da confiança', () => {
    const semTitulo = explainOverall(keeper())!
    const comTitulo = explainOverall(keeper({ titles: ['mostGames'] }))!
    expect(comTitulo.overall - semTitulo.overall).toBe(3)
  })
})
