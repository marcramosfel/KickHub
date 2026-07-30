import { describe, it, expect } from 'vitest'
import { gerarResenhaResultado, gerarResenhaSorteio, juntarResenha } from './resenha.js'

// Escalação mínima: 2 goleiros + 4 de campo chegam para as frases.
const lineup = [
  { player_id: 'gkA', name: 'Sávio Costa', team: 'A', assigned_position: 'GK', is_goalkeeper: true },
  { player_id: 'a1', name: 'Marcos Silva', team: 'A', assigned_position: 'ST', is_goalkeeper: false },
  { player_id: 'a2', name: 'João Pereira', team: 'A', assigned_position: 'MID-C', is_goalkeeper: false },
  { player_id: 'gkB', name: 'Miguel Ramos', team: 'B', assigned_position: 'GK', is_goalkeeper: true },
  { player_id: 'b1', name: 'Daniel Souza', team: 'B', assigned_position: 'ST', is_goalkeeper: false },
  { player_id: 'b2', name: 'Pedro Lima', team: 'B', assigned_position: 'MID-C', is_goalkeeper: false },
]

const jogo = (extra = {}) => ({
  id: 'jogo-teste',
  team_a_overall: 340,
  team_b_overall: 338,
  lineup,
  ...extra,
})

const seqVazia = { jogos: 10, vitorias: 4, empates: 2, derrotas: 4, seqVitorias: 0, seqSemPerder: 0, seqDerrotas: 0, seqMarcando: 0, seqAssistindo: 0, seqSemMarcar: 0, seqSemSofrer: 0 }

describe('gerarResenhaSorteio', () => {
  it('fala sempre do equilíbrio quando há overalls', () => {
    const frases = gerarResenhaSorteio({ jogo: jogo(), sequencias: {}, liderancas: {} })
    expect(frases.length).toBeGreaterThan(0)
    expect(frases.some((f) => f.categoria.startsWith('equilibrio'))).toBe(true)
  })

  it('com o mesmo jogo e tentativa, a resenha é sempre igual (reproduzível)', () => {
    const args = { jogo: jogo(), sequencias: { a1: { ...seqVazia, seqVitorias: 3 } }, liderancas: {} }
    expect(gerarResenhaSorteio(args)).toEqual(gerarResenhaSorteio(args))
  })

  it('tentativas diferentes podem dar frases diferentes', () => {
    const base = { jogo: jogo(), sequencias: {}, liderancas: {} }
    const a = juntarResenha(gerarResenhaSorteio({ ...base, tentativa: 0 }))
    const textos = new Set([a])
    for (let t = 1; t <= 6; t++) textos.add(juntarResenha(gerarResenhaSorteio({ ...base, tentativa: t })))
    expect(textos.size).toBeGreaterThan(1)
  })

  it('duelo artilheiro × paredão só quando estão em lados opostos', () => {
    const liderancas = { artilheiro: { playerIds: ['a1'] }, paredao: { playerIds: ['gkB'] } }
    const frases = gerarResenhaSorteio({ jogo: jogo(), sequencias: {}, liderancas })
    expect(frases.some((f) => f.categoria === 'duelo_artilheiro_paredao')).toBe(true)

    const mesmoLado = { artilheiro: { playerIds: ['a1'] }, paredao: { playerIds: ['gkA'] } }
    const frases2 = gerarResenhaSorteio({ jogo: jogo(), sequencias: {}, liderancas: mesmoLado })
    expect(frases2.some((f) => f.categoria === 'duelo_artilheiro_paredao')).toBe(false)
  })

  it('invencibilidade e goleiro seguro saem das sequências', () => {
    const sequencias = {
      b1: { ...seqVazia, seqSemPerder: 5 },
      gkA: { ...seqVazia, seqSemSofrer: 2 },
    }
    const frases = gerarResenhaSorteio({ jogo: jogo(), sequencias, liderancas: {} })
    const cats = frases.map((f) => f.categoria)
    expect(cats).toContain('invicto_em_risco')
    expect(cats).toContain('goleiro_seguro')
  })

  it('o mesmo jogador nunca protagoniza duas frases', () => {
    // a1 é artilheiro, rei da pelada E está em boa fase — só pode sair uma vez
    const liderancas = {
      artilheiro: { playerIds: ['a1'] },
      paredao: { playerIds: ['gkB'] },
      'rei-da-pelada': { playerIds: ['a1'] },
    }
    const sequencias = { a1: { ...seqVazia, seqVitorias: 4 } }
    const frases = gerarResenhaSorteio({ jogo: jogo(), sequencias, liderancas })
    const comMarcos = frases.filter((f) => f.texto.includes('Marcos'))
    expect(comMarcos.length).toBeLessThanOrEqual(1)
  })

  it('nunca passa de 5 frases e nunca devolve 0 com jogo válido', () => {
    const frases = gerarResenhaSorteio({ jogo: jogo(), sequencias: {}, liderancas: {} })
    expect(frases.length).toBeGreaterThanOrEqual(1)
    expect(frases.length).toBeLessThanOrEqual(5)
  })

  it('sem jogo devolve lista vazia', () => {
    expect(gerarResenhaSorteio({})).toEqual([])
  })

  it('não goza com o goleiro por "não marcar" — não marcar é o emprego dele', () => {
    const sequencias = { gkA: { ...seqVazia, seqSemMarcar: 8 } }
    for (let t = 0; t < 6; t++) {
      const frases = gerarResenhaSorteio({ jogo: jogo(), sequencias, liderancas: {}, tentativa: t })
      expect(frases.some((f) => f.categoria === 'pressionado')).toBe(false)
    }
  })

  it('só chama "goleiro" a quem vai mesmo à baliza neste jogo', () => {
    // a1 fez de goleiro nas últimas rodadas (2 clean sheets) mas hoje joga na linha
    const sequencias = { a1: { ...seqVazia, seqSemSofrer: 2 } }
    for (let t = 0; t < 6; t++) {
      const frases = gerarResenhaSorteio({ jogo: jogo(), sequencias, liderancas: {}, tentativa: t })
      expect(frases.some((f) => f.categoria === 'goleiro_seguro')).toBe(false)
    }
  })
})

describe('gerarResenhaResultado', () => {
  const resultado = (extra = {}) => ({
    scoreA: 3,
    scoreB: 1,
    stats: [
      { player_id: 'a1', goals: 2, assists: 0 },
      { player_id: 'a2', goals: 1, assists: 2 },
      { player_id: 'b1', goals: 1, assists: 0 },
    ],
    gkStats: [{ goalkeeper_id: 'gkB', saves: 6 }],
    ...extra,
  })

  it('fala do placar e dos destaques do jogo', () => {
    const frases = gerarResenhaResultado({ jogo: jogo(), resultado: resultado(), sequencias: {} })
    const cats = frases.map((f) => f.categoria)
    expect(cats).toContain('pos_placar')
    expect(cats).toContain('pos_artilheiro_dia')
    expect(cats).toContain('pos_garcom')
    expect(cats).toContain('pos_paredao')
  })

  it('empate tem frase própria', () => {
    const frases = gerarResenhaResultado({
      jogo: jogo(),
      resultado: resultado({ scoreA: 2, scoreB: 2 }),
      sequencias: {},
    })
    expect(frases.some((f) => f.categoria === 'pos_empate')).toBe(true)
  })

  it('zebra quando o time com menos overall vence com diferença relevante', () => {
    const frases = gerarResenhaResultado({
      jogo: jogo({ team_a_overall: 300, team_b_overall: 360 }), // B muito mais forte
      resultado: resultado({ scoreA: 2, scoreB: 1 }), // ganhou A
      sequencias: {},
    })
    expect(frases.some((f) => f.categoria === 'pos_zebra')).toBe(true)
  })

  it('quebra de invencibilidade sai do lado derrotado', () => {
    const frases = gerarResenhaResultado({
      jogo: jogo(),
      resultado: resultado(), // ganhou A → B perdeu
      sequencias: { b1: { ...seqVazia, seqSemPerder: 6 } },
    })
    expect(frases.some((f) => f.categoria === 'quebra_sequencia')).toBe(true)
  })

  it('sem dados devolve vazio, nunca rebenta', () => {
    expect(gerarResenhaResultado({})).toEqual([])
  })

  it('um destaque de quem já não está na escalação não sai como "alguém"', () => {
    // rascunho gravado antes de uma substituição: o id 'zz' já saiu do jogo
    const frases = gerarResenhaResultado({
      jogo: jogo(),
      resultado: resultado({ stats: [{ player_id: 'zz', goals: 3, assists: 0 }] }),
      sequencias: {},
    })
    expect(frases.some((f) => f.texto.includes('alguém'))).toBe(false)
    expect(frases.some((f) => f.categoria === 'pos_artilheiro_dia')).toBe(false)
  })
})

describe('juntarResenha', () => {
  it('junta os textos escolhidos, uma frase por linha', () => {
    expect(juntarResenha([{ texto: 'a' }, 'b', null, { texto: '' }])).toBe('a\nb')
  })
})
