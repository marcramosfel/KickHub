import { describe, it, expect } from 'vitest'
import { TITULOS, badgesDoJogador, calcularLiderancas, molduraPrincipal } from './achievements.js'
import { PLAYER_TYPE } from './positions.js'

const jogador = (extra) => ({
  playerType: PLAYER_TYPE.FIELD,
  overall: 0,
  goals: 0,
  assists: 0,
  craques: 0,
  bagres: 0,
  wins: null,
  ...extra,
})

describe('TITULOS', () => {
  it('tem os sete títulos com prioridades únicas de 1 a 7', () => {
    expect(TITULOS.map((t) => t.id)).toEqual([
      'rei-da-pelada',
      'paredao',
      'artilheiro',
      'rei-assistencias',
      'rei-craques',
      'rei-vitorias',
      'rei-bagres',
    ])
    expect(TITULOS.map((t) => t.prioridade)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('cada título tem ícone e texto — a cor nunca é o único sinal', () => {
    for (const t of TITULOS) {
      expect(t.icon).toBeTruthy()
      expect(t.titulo).toBeTruthy()
      expect(t.descricao).toBeTruthy()
      expect(t.moldura.borda).toMatch(/^#[0-9A-Fa-f]{6,8}$/)
      expect(t.moldura.brilho).toMatch(/^#[0-9A-Fa-f]{6,8}$/)
      expect(t.moldura.fundo).toMatch(/^#[0-9A-Fa-f]{6,8}$/)
      expect(t.moldura.cor).toMatch(/^#[0-9A-Fa-f]{6,8}$/)
      expect(t.moldura.corTexto).toMatch(/^#[0-9A-Fa-f]{6,8}$/)
    }
  })
})

describe('calcularLiderancas', () => {
  it('encontra o líder de cada categoria', () => {
    const jogadores = [
      jogador({ id: 'a', name: 'Ana', overall: 90, goals: 10, assists: 2, craques: 5, wins: 3 }),
      jogador({ id: 'b', name: 'Bruno', overall: 70, goals: 3, assists: 9, craques: 1, wins: 8, bagres: 4 }),
      jogador({ id: 'g', name: 'Gil', playerType: PLAYER_TYPE.GOALKEEPER, gkOverall: 65, overall: 65 }),
    ]
    const l = calcularLiderancas({ jogadores })
    expect(l['rei-da-pelada']).toEqual({ valor: 90, playerIds: ['a'] })
    expect(l.paredao).toEqual({ valor: 65, playerIds: ['g'] })
    expect(l.artilheiro).toEqual({ valor: 10, playerIds: ['a'] })
    expect(l['rei-assistencias']).toEqual({ valor: 9, playerIds: ['b'] })
    expect(l['rei-craques']).toEqual({ valor: 5, playerIds: ['a'] })
    expect(l['rei-vitorias']).toEqual({ valor: 8, playerIds: ['b'] })
    expect(l['rei-bagres']).toEqual({ valor: 4, playerIds: ['b'] })
  })

  it('não cria títulos com valor zero', () => {
    const jogadores = [jogador({ id: 'a', name: 'Ana', overall: 50 })]
    const l = calcularLiderancas({ jogadores })
    expect(l.artilheiro).toBeUndefined()
    expect(l['rei-assistencias']).toBeUndefined()
    expect(l['rei-craques']).toBeUndefined()
    expect(l['rei-bagres']).toBeUndefined()
    expect(l['rei-da-pelada']).toEqual({ valor: 50, playerIds: ['a'] })
  })

  it('sem vitórias conhecidas (null) não há rei das vitórias', () => {
    const jogadores = [jogador({ id: 'a', name: 'Ana', overall: 50, wins: null })]
    expect(calcularLiderancas({ jogadores })['rei-vitorias']).toBeUndefined()
  })

  it('em caso de empate todos os empatados ficam com o título', () => {
    const jogadores = [
      jogador({ id: 'a', name: 'Ana', goals: 7 }),
      jogador({ id: 'b', name: 'Bruno', goals: 7 }),
      jogador({ id: 'c', name: 'Célia', goals: 2 }),
    ]
    const l = calcularLiderancas({ jogadores })
    expect(l.artilheiro.valor).toBe(7)
    expect(l.artilheiro.playerIds.sort()).toEqual(['a', 'b'])
  })

  it('empate no topo dá a coroa (e a moldura) aos dois', () => {
    const jogadores = [
      jogador({ id: 'a', name: 'Ana', overall: 88 }),
      jogador({ id: 'b', name: 'Bruno', overall: 88 }),
      jogador({ id: 'c', name: 'Célia', overall: 87 }),
    ]
    const l = calcularLiderancas({ jogadores })
    expect(l['rei-da-pelada'].playerIds).toEqual(['a', 'b'])
    expect(molduraPrincipal('a', l).id).toBe('rei-da-pelada')
    expect(molduraPrincipal('b', l).id).toBe('rei-da-pelada')
    expect(molduraPrincipal('c', l)).toBeNull()
  })

  it('o overall de campo só conta para rei-da-pelada, e o de baliza só para paredão', () => {
    const jogadores = [
      jogador({ id: 'g', name: 'Gil', playerType: PLAYER_TYPE.GOALKEEPER, overall: 99, gkOverall: 99 }),
      jogador({ id: 'a', name: 'Ana', overall: 60 }),
    ]
    const l = calcularLiderancas({ jogadores })
    expect(l['rei-da-pelada'].playerIds).toEqual(['a']) // o goleiro de 99 não entra
    expect(l.paredao.playerIds).toEqual(['g'])
  })

  it('sem jogadores devolve objeto vazio', () => {
    expect(calcularLiderancas({ jogadores: [] })).toEqual({})
    expect(calcularLiderancas()).toEqual({})
  })
})

describe('badgesDoJogador e molduraPrincipal', () => {
  const jogadores = [
    jogador({ id: 'a', name: 'Ana', overall: 95, goals: 20, assists: 15, craques: 6, wins: 12 }),
    jogador({ id: 'b', name: 'Bruno', overall: 40, goals: 1, bagres: 5 }),
    jogador({ id: 'c', name: 'Célia', overall: 60 }),
  ]
  const liderancas = calcularLiderancas({ jogadores })

  it('devolve todos os títulos do jogador por ordem de prioridade', () => {
    expect(badgesDoJogador('a', liderancas).map((t) => t.id)).toEqual([
      'rei-da-pelada',
      'artilheiro',
      'rei-assistencias',
      'rei-craques',
      'rei-vitorias',
    ])
  })

  it('traz o valor de cada título junto', () => {
    const badges = badgesDoJogador('a', liderancas)
    expect(badges.find((t) => t.id === 'artilheiro').valor).toBe(20)
  })

  it('quem lidera várias categorias usa só a moldura mais forte', () => {
    expect(molduraPrincipal('a', liderancas).id).toBe('rei-da-pelada')
    expect(molduraPrincipal('a', liderancas).moldura.borda).toBe('#FFC531')
  })

  it('quem só lidera os bagres fica com a moldura dos bagres', () => {
    expect(molduraPrincipal('b', liderancas).id).toBe('rei-bagres')
  })

  it('quem não lidera nada não tem moldura nem badges', () => {
    expect(badgesDoJogador('c', liderancas)).toEqual([])
    expect(molduraPrincipal('c', liderancas)).toBeNull()
  })

  it('aguenta ids desconhecidos e lideranças em falta', () => {
    expect(badgesDoJogador('ninguem', liderancas)).toEqual([])
    expect(molduraPrincipal(null, liderancas)).toBeNull()
    expect(molduraPrincipal('a', null)).toBeNull()
  })

  it('o paredão ganha a moldura ao artilheiro quando o mesmo goleiro lidera ambos', () => {
    const lista = [
      jogador({ id: 'g', name: 'Gil', playerType: PLAYER_TYPE.GOALKEEPER, gkOverall: 80, goals: 3 }),
      jogador({ id: 'a', name: 'Ana', overall: 70, goals: 1 }),
    ]
    const l = calcularLiderancas({ jogadores: lista })
    expect(badgesDoJogador('g', l).map((t) => t.id)).toEqual(['paredao', 'artilheiro'])
    expect(molduraPrincipal('g', l).id).toBe('paredao')
  })
})
