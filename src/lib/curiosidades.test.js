import { describe, it, expect } from 'vitest'
import {
  destaquesDoDuelo,
  dueloDosPerebas,
  melhorJogoPossivel,
  montarDuelo,
  numerosDoDuelo,
} from './curiosidades.js'

// Plantel com 30 jogadores: 4 goleiros e 26 de campo, overalls de 40 a 92.
const plantel = () => {
  const out = []
  for (let i = 0; i < 4; i++) {
    out.push({
      id: `gk-${i}`,
      name: `GK ${i}`,
      primaryPosition: 'GK',
      playerType: 'GOALKEEPER',
      overall: 50 + i * 10,
      gkOverall: 50 + i * 10,
      provisorio: false,
      matches: 8,
      goals: 0,
      assists: 0,
      wins: 4,
      goalsConcededPerMatch: 8,
      savePct: 50,
    })
  }
  const posicoes = ['DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST']
  for (let i = 0; i < 26; i++) {
    out.push({
      id: `c-${i}`,
      name: `Campo ${i}`,
      primaryPosition: posicoes[i % posicoes.length],
      playerType: 'FIELD',
      overall: 40 + i * 2, // 40 .. 90
      provisorio: false,
      acceptsOther: true,
      matches: 10,
      goals: i % 7,
      assists: i % 4,
      wins: 5,
      craques: i % 3,
      bagres: (i + 1) % 3,
    })
  }
  return out
}

const overalls = (duelo) =>
  [...duelo.lineupA, ...duelo.lineupB].filter((j) => j.slot !== 'GK').map((j) => j.overall)

describe('curiosidades — melhor jogo possível', () => {
  const duelo = melhorJogoPossivel({ jogadores: plantel() })

  it('monta as duas equipas completas', () => {
    expect(duelo.completo).toBe(true)
    expect(duelo.lineupA).toHaveLength(7)
    expect(duelo.lineupB).toHaveLength(7)
  })

  it('usa mesmo os melhores do plantel', () => {
    // Os 12 melhores de campo do plantel são os overalls 68..90.
    expect(Math.min(...overalls(duelo))).toBeGreaterThanOrEqual(68)
  })

  it('não repete jogadores entre as equipas', () => {
    const ids = [...duelo.lineupA, ...duelo.lineupB].map((j) => j.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada equipa tem exatamente um goleiro', () => {
    expect(duelo.lineupA.filter((j) => j.slot === 'GK')).toHaveLength(1)
    expect(duelo.lineupB.filter((j) => j.slot === 'GK')).toHaveLength(1)
  })

  it('as equipas ficam equilibradas — não é os melhores contra os seguintes', () => {
    // O ponto todo da funcionalidade. Sem repartição equilibrada, a diferença
    // de força entre os dois lados seria enorme.
    expect(duelo.equilibrio.pct).toBeLessThan(5)
  })

  it('traz a simulação com placar e probabilidades', () => {
    expect(Number.isFinite(duelo.simulacao.golosA)).toBe(true)
    const p = duelo.simulacao.probabilidades
    expect(p.a + p.empate + p.b).toBeCloseTo(1, 6)
  })
})

describe('curiosidades — duelo dos perebas', () => {
  const duelo = dueloDosPerebas({ jogadores: plantel() })

  it('usa os do outro extremo da tabela', () => {
    // Os 12 piores de campo são os overalls 40..62.
    expect(Math.max(...overalls(duelo))).toBeLessThanOrEqual(62)
  })

  it('também fica equilibrado', () => {
    expect(duelo.equilibrio.pct).toBeLessThan(6)
  })

  it('tem nomes próprios', () => {
    expect(duelo.simulacao.nomeA).toMatch(/Pereba/)
    expect(duelo.simulacao.nomeB).toMatch(/Pereba/)
  })

  it('não partilha jogadores com o melhor jogo possível', () => {
    const melhor = melhorJogoPossivel({ jogadores: plantel() })
    const idsMelhor = new Set([...melhor.lineupA, ...melhor.lineupB].map((j) => j.id))
    const idsPerebas = [...duelo.lineupA, ...duelo.lineupB].map((j) => j.id)
    // Com 26 de campo e 12 por duelo há folga: os extremos não se tocam.
    const campoPerebas = idsPerebas.filter((id) => id.startsWith('c-'))
    expect(campoPerebas.some((id) => idsMelhor.has(id))).toBe(false)
  })
})

describe('curiosidades — elegibilidade', () => {
  it('não põe nos perebas quem ainda não tem overall a sério', () => {
    // Um recém-chegado com overall provisório baixíssimo: se entrasse, era o
    // pior de todos — e é exatamente o que não pode acontecer.
    const lista = [...plantel(), {
      id: 'novo',
      name: 'Recém-chegado',
      primaryPosition: 'ST',
      playerType: 'FIELD',
      overall: 5,
      provisorio: true,
      matches: 1,
      goals: 0,
      assists: 0,
    }]
    const duelo = dueloDosPerebas({ jogadores: lista })
    const ids = [...duelo.lineupA, ...duelo.lineupB].map((j) => j.id)
    expect(ids).not.toContain('novo')
  })

  it('ignora quem não tem overall nenhum', () => {
    const lista = [...plantel(), {
      id: 'sem',
      name: 'Sem overall',
      primaryPosition: 'ST',
      playerType: 'FIELD',
      overall: null,
      provisorio: false,
    }]
    const duelo = dueloDosPerebas({ jogadores: lista })
    expect([...duelo.lineupA, ...duelo.lineupB].map((j) => j.id)).not.toContain('sem')
  })
})

describe('curiosidades — reprodutibilidade e dados em falta', () => {
  it('a mesma semente dá o mesmo duelo', () => {
    const a = montarDuelo({ jogadores: plantel(), seed: 'igual' })
    const b = montarDuelo({ jogadores: plantel(), seed: 'igual' })
    expect(b.lineupA.map((j) => j.id)).toEqual(a.lineupA.map((j) => j.id))
    expect(b.simulacao.golosA).toBe(a.simulacao.golosA)
  })

  it('sem gente suficiente devolve motivo em vez de rebentar', () => {
    const r = melhorJogoPossivel({ jogadores: plantel().slice(0, 6) })
    expect(r.completo).toBe(false)
    expect(r.motivo).toMatch(/Faltam jogadores/)
  })

  it('sem goleiros fixos que cheguem, monta na mesma em rodízio', () => {
    // O caso REAL desta pelada: joga com a baliza a rodar e só tem uma pessoa
    // registada como goleiro. A exigir dois goleiros fixos, as Curiosidades
    // ficavam permanentemente vazias.
    const semGks = plantel().filter((j) => j.primaryPosition !== 'GK')
    expect(semGks.filter((j) => j.primaryPosition === 'GK')).toHaveLength(0)

    const r = melhorJogoPossivel({ jogadores: semGks })
    expect(r.completo).toBe(true)
    expect(r.gkMode).toBe('ROTATING')
    expect(r.lineupA).toHaveLength(7)
    expect(r.lineupB).toHaveLength(7)
    // Mesmo no rodízio, cada lado começa com alguém na baliza.
    expect(r.lineupA.filter((j) => j.slot === 'GK')).toHaveLength(1)
    expect(r.equilibrio.pct).toBeLessThan(6)
  })

  it('com goleiros a mais usa o modo de goleiros fixos', () => {
    expect(melhorJogoPossivel({ jogadores: plantel() }).gkMode).toBe('FIXED')
  })

  it('com plantel vazio devolve motivo', () => {
    expect(melhorJogoPossivel({ jogadores: [] }).completo).toBe(false)
    expect(melhorJogoPossivel({}).completo).toBe(false)
  })

  it('os jogadores mantêm as estatísticas depois do sorteio', () => {
    // O `sortearEquipas` normaliza e deixa cair golos/assistências; sem o
    // remapeamento, o simulador ficava sem dados nenhuns.
    const duelo = melhorJogoPossivel({ jogadores: plantel() })
    const comStats = [...duelo.lineupA, ...duelo.lineupB].filter((j) => j.matches != null)
    expect(comStats).toHaveLength(14)
  })
})

describe('curiosidades — números e destaques', () => {
  const duelo = melhorJogoPossivel({ jogadores: plantel() })

  it('resume os números do duelo', () => {
    const n = numerosDoDuelo(duelo)
    expect(n.find((x) => x.rotulo === 'Overall médio')).toBeTruthy()
    expect(n.find((x) => x.rotulo === 'Gols somados').valor).toBeGreaterThan(0)
  })

  it('não inventa números quando não há duelo', () => {
    expect(numerosDoDuelo(null)).toEqual([])
    expect(numerosDoDuelo({ completo: false })).toEqual([])
    expect(destaquesDoDuelo(null)).toBeNull()
  })

  it('escolhe destaques dentro do duelo', () => {
    const d = destaquesDoDuelo(duelo)
    const ids = [...duelo.lineupA, ...duelo.lineupB].map((j) => j.id)
    expect(ids).toContain(d.maiorOverall.id)
    expect(d.maiorOverall.overall).toBeGreaterThanOrEqual(d.menorOverall.overall)
  })
})
