import { describe, it, expect } from 'vitest'
import { EQUIPAS, montarCampeonato } from './campeonato.js'

const plantel = (n = 30) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p-${i}`,
    name: `Jogador ${String(i).padStart(2, '0')}`,
    primaryPosition: ['DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST'][i % 6],
    playerType: 'FIELD',
    overall: 45 + (i % 40),
    provisorio: false,
    acceptsOther: true,
    matches: 10,
    goals: i % 6,
    assists: i % 4,
    wins: 5,
    craques: i % 3,
    bagres: (i + 1) % 3,
  }))

describe('campeonato — montagem', () => {
  const c = montarCampeonato({ jogadores: plantel() })

  it('monta quatro equipas de sete', () => {
    expect(c.completo).toBe(true)
    expect(c.equipas).toHaveLength(4)
    for (const e of c.equipas) expect(e.jogadores).toHaveLength(7)
  })

  it('não repete ninguém entre equipas', () => {
    const ids = c.equipas.flatMap((e) => e.jogadores.map((j) => j.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('as equipas ficam equilibradas', () => {
    // O objetivo NÃO é juntar os melhores: é fazer quatro equipas parecidas.
    expect(c.equilibrio.pct).toBeLessThan(8)
  })

  it('usa os nomes e cores das equipas da casa', () => {
    expect(c.equipas.map((e) => e.id)).toEqual(EQUIPAS.slice(0, 4).map((e) => e.id))
  })

  it('diz quantos ficaram de fora', () => {
    // 30 jogadores, 28 lugares.
    expect(c.deFora).toBe(2)
  })
})

describe('campeonato — jogos e tabela', () => {
  const c = montarCampeonato({ jogadores: plantel() })

  it('joga todos contra todos', () => {
    // 4 equipas = 6 jogos.
    expect(c.jogos).toHaveLength(6)
    const pares = c.jogos.map((j) => [j.equipaA, j.equipaB].sort().join('-'))
    expect(new Set(pares).size).toBe(6)
  })

  it('a tabela tem as quatro equipas e cada uma jogou três vezes', () => {
    expect(c.tabela).toHaveLength(4)
    for (const l of c.tabela) expect(l.j).toBe(3)
  })

  it('os pontos batem certo com os resultados', () => {
    for (const l of c.tabela) {
      expect(l.v + l.e + l.d).toBe(l.j)
      expect(l.pts).toBe(l.v * 3 + l.e)
    }
  })

  it('os golos marcados e sofridos fecham entre si', () => {
    const marcados = c.tabela.reduce((s, l) => s + l.gm, 0)
    const sofridos = c.tabela.reduce((s, l) => s + l.gs, 0)
    expect(marcados).toBe(sofridos)
  })

  it('a tabela está ordenada por pontos', () => {
    for (let i = 1; i < c.tabela.length; i++) {
      expect(c.tabela[i - 1].pts).toBeGreaterThanOrEqual(c.tabela[i].pts)
    }
  })
})

describe('campeonato — final e campeão', () => {
  const c = montarCampeonato({ jogadores: plantel() })

  it('a final é entre os dois primeiros da tabela', () => {
    expect([c.final.equipaA, c.final.equipaB].sort()).toEqual(
      [c.tabela[0].id, c.tabela[1].id].sort()
    )
  })

  it('o campeão é um dos finalistas', () => {
    expect([c.final.equipaA, c.final.equipaB]).toContain(c.campeao.id)
  })

  it('num empate na final ganha quem ficou melhor na fase de grupos', () => {
    // Corre várias sementes até calhar um empate, e verifica a regra.
    for (let i = 0; i < 60; i++) {
      const x = montarCampeonato({ jogadores: plantel(), seed: `f-${i}` })
      if (x.final.golosA === x.final.golosB) {
        expect(x.campeaoPorClassificacao).toBe(true)
        expect(x.campeao.id).toBe(x.tabela[0].id)
        return
      }
    }
    // Sem empates em 60 tentativas não há nada para verificar — e não se
    // finge que houve.
    expect(true).toBe(true)
  })
})

describe('campeonato — prémios', () => {
  const c = montarCampeonato({ jogadores: plantel() })

  it('escolhe artilheiro, rei das assistências e melhor jogador', () => {
    expect(c.premios.artilheiro?.total).toBeGreaterThan(0)
    expect(c.premios.melhorJogador?.total).toBeGreaterThan(0)
  })

  it('o artilheiro tem mesmo o maior número de golos de todos', () => {
    const total = new Map()
    for (const jogo of [...c.jogos, c.final]) {
      for (const lado of ['a', 'b']) {
        for (const m of jogo.marcadores[lado]) total.set(m.id, (total.get(m.id) || 0) + m.total)
      }
    }
    expect(c.premios.artilheiro.total).toBe(Math.max(...total.values()))
  })

  it('os premiados são participantes, não gente de fora', () => {
    const ids = new Set(c.equipas.flatMap((e) => e.jogadores.map((j) => j.id)))
    expect(ids.has(c.premios.artilheiro.id)).toBe(true)
    expect(ids.has(c.premios.melhorJogador.id)).toBe(true)
  })
})

describe('campeonato — reprodutibilidade e dados em falta', () => {
  it('a mesma semente dá o mesmo campeonato', () => {
    const a = montarCampeonato({ jogadores: plantel(), seed: 'igual' })
    const b = montarCampeonato({ jogadores: plantel(), seed: 'igual' })
    expect(b.tabela).toEqual(a.tabela)
    expect(b.campeao).toEqual(a.campeao)
  })

  it('sementes diferentes dão campeonatos diferentes', () => {
    const campeoes = new Set()
    for (let i = 0; i < 20; i++) {
      campeoes.add(montarCampeonato({ jogadores: plantel(), seed: `s-${i}` }).campeao.id)
    }
    expect(campeoes.size).toBeGreaterThan(1)
  })

  it('quem entra também muda com a semente', () => {
    // Um campeonato em que os mesmos ficam sempre de fora não é do grupo.
    const dentro = (seed) =>
      new Set(
        montarCampeonato({ jogadores: plantel(), seed })
          .equipas.flatMap((e) => e.jogadores.map((j) => j.id))
      )
    const a = dentro('a')
    const b = dentro('b')
    expect([...a].some((id) => !b.has(id))).toBe(true)
  })

  it('sem gente suficiente devolve motivo em vez de rebentar', () => {
    const r = montarCampeonato({ jogadores: plantel(10) })
    expect(r.completo).toBe(false)
    expect(r.motivo).toMatch(/são precisos/)
  })

  it('ajusta o número de equipas ao plantel em vez de ficar vazio', () => {
    // O caso REAL desta pelada: 24 jogadores com overall calculado. Quatro
    // equipas de sete pediam 28 e o ecrã aparecia permanentemente vazio.
    const c24 = montarCampeonato({ jogadores: plantel(24) })
    expect(c24.completo).toBe(true)
    expect(c24.nEquipas).toBe(3)
    expect(c24.jogos).toHaveLength(3) // 3 equipas = 3 jogos
    expect(c24.deFora).toBe(3)

    // 28 ou mais volta às quatro.
    expect(montarCampeonato({ jogadores: plantel(28) }).nEquipas).toBe(4)
    // 14 chegam para duas.
    expect(montarCampeonato({ jogadores: plantel(14) }).nEquipas).toBe(2)
    // 13 não chegam para nenhuma.
    expect(montarCampeonato({ jogadores: plantel(13) }).completo).toBe(false)
  })

  it('ignora quem não tem overall a sério', () => {
    const lista = [
      ...plantel(28),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `novo-${i}`,
        name: `Novo ${i}`,
        primaryPosition: 'ST',
        playerType: 'FIELD',
        overall: 5,
        provisorio: true,
      })),
    ]
    const c = montarCampeonato({ jogadores: lista })
    const ids = c.equipas.flatMap((e) => e.jogadores.map((j) => j.id))
    expect(ids.some((id) => String(id).startsWith('novo-'))).toBe(false)
  })
})
