import { describe, it, expect } from 'vitest'
import {
  CARDS,
  CARD_BASE,
  cardPrincipal,
  cardsDoJogador,
  cardsEscolhiveis,
  raridade,
  RARIDADES,
} from './cards.js'
import { TITULOS_POR_ID } from './achievements.js'

const jogador = (extra = {}) => ({
  id: 'p1',
  name: 'Marcos',
  playerType: 'FIELD',
  primaryPosition: 'ST',
  matches: 10,
  goals: 8,
  assists: 4,
  craques: 1,
  bagres: 0,
  wins: 5,
  draws: 2,
  losses: 3,
  overall: 72,
  ...extra,
})

const seqVazia = {
  jogos: 10,
  seqVitorias: 0,
  seqSemPerder: 0,
  seqMarcando: 0,
  melhorSeqVitorias: 0,
}

const ids = (cards) => cards.map((c) => c.id)

describe('catálogo', () => {
  it('cada card tem raridade conhecida, ícone e descrição', () => {
    for (const c of CARDS) {
      expect(RARIDADES[c.raridade], `raridade de ${c.id}`).toBeTruthy()
      expect(c.icon).toBeTruthy()
      expect(c.descricao).toBeTruthy()
      expect(typeof c.regra).toBe('function')
    }
  })

  it('não há ids repetidos', () => {
    const vistos = new Set(CARDS.map((c) => c.id))
    expect(vistos.size).toBe(CARDS.length)
  })

  it('os cards de liderança reaproveitam a moldura de achievements.js', () => {
    const rei = CARDS.find((c) => c.id === 'rei-da-pelada')
    expect(rei.moldura).toEqual(TITULOS_POR_ID['rei-da-pelada'].moldura)
  })
})

describe('cardsDoJogador', () => {
  it('quem não tem nada fica na mesma com o card base', () => {
    const cards = cardsDoJogador({ jogador: jogador({ assists: 0, matches: 1 }), liderancas: {} })
    expect(ids(cards)).toEqual([CARD_BASE.id])
  })

  it('uma liderança desbloqueia o card e diz porquê', () => {
    const cards = cardsDoJogador({
      jogador: jogador(),
      liderancas: { artilheiro: { valor: 8, playerIds: ['p1'] } },
    })
    const art = cards.find((c) => c.id === 'artilheiro')
    expect(art).toBeTruthy()
    expect(art.motivo).toContain('8')
  })

  it('liderança partilhada diz que é a dividir', () => {
    const cards = cardsDoJogador({
      jogador: jogador(),
      liderancas: { artilheiro: { valor: 8, playerIds: ['p1', 'p2'] } },
    })
    expect(cards.find((c) => c.id === 'artilheiro').motivo).toContain('dividir')
  })

  it('marcos pessoais saem das sequências e dos totais', () => {
    const cards = cardsDoJogador({
      jogador: jogador({ assists: 12 }),
      liderancas: {},
      sequencias: { p1: { ...seqVazia, seqSemPerder: 6, seqMarcando: 3, melhorSeqVitorias: 4 } },
    })
    expect(ids(cards)).toContain('invencivel')
    expect(ids(cards)).toContain('homem-gol')
    expect(ids(cards)).toContain('rei-da-sequencia')
    expect(ids(cards)).toContain('garcom')
  })

  it('a muralha é só de goleiros', () => {
    const comoCampo = cardsDoJogador({ jogador: jogador({ cleanSheets: 5 }), liderancas: {} })
    expect(ids(comoCampo)).not.toContain('muralha')
    const comoGk = cardsDoJogador({
      jogador: jogador({ playerType: 'GOALKEEPER', cleanSheets: 5 }),
      liderancas: {},
    })
    expect(ids(comoGk)).toContain('muralha')
  })

  it('motorzinho precisa de presença alta E de jogos que cheguem', () => {
    const poucos = cardsDoJogador({ jogador: jogador({ matches: 4 }), liderancas: {}, totalRodadas: 5 })
    expect(ids(poucos)).not.toContain('motorzinho') // 80% mas só 4 jogos
    const muitos = cardsDoJogador({ jogador: jogador({ matches: 9 }), liderancas: {}, totalRodadas: 10 })
    expect(ids(muitos)).toContain('motorzinho')
  })

  it('a lenda exige as três marcas ao mesmo tempo', () => {
    const quase = cardsDoJogador({
      jogador: jogador({ matches: 30, goals: 15, assists: 5, craques: 2 }),
      liderancas: {},
    })
    expect(ids(quase)).not.toContain('lenda')
    const lenda = cardsDoJogador({
      jogador: jogador({ matches: 30, goals: 15, assists: 5, craques: 3 }),
      liderancas: {},
    })
    expect(ids(lenda)).toContain('lenda')
  })

  it('vêm ordenados do mais raro para o mais comum, com o base no fim', () => {
    const cards = cardsDoJogador({
      jogador: jogador({ matches: 30, goals: 15, assists: 12, craques: 3 }),
      liderancas: { 'rei-assistencias': { valor: 12, playerIds: ['p1'] } },
    })
    const pesos = cards.map((c) => raridade(c.raridade).peso)
    expect(pesos).toEqual([...pesos].sort((a, b) => b - a))
    expect(cards[cards.length - 1].id).toBe(CARD_BASE.id)
  })

  it('uma regra que rebente com dados estranhos não parte o resto', () => {
    const cards = cardsDoJogador({ jogador: jogador({ matches: 'muitos' }), liderancas: {} })
    expect(cards.length).toBeGreaterThan(0)
  })

  it('sem jogador devolve lista vazia', () => {
    expect(cardsDoJogador({})).toEqual([])
    expect(cardsDoJogador({ jogador: { name: 'sem id' } })).toEqual([])
  })
})

describe('cardPrincipal — a escolha do jogador manda, mas não mente', () => {
  const cards = cardsDoJogador({
    jogador: jogador({ assists: 12 }),
    liderancas: { artilheiro: { valor: 8, playerIds: ['p1'] } },
  })

  it('sem escolha, mostra o mais raro que tem', () => {
    expect(cardPrincipal(cards, null).id).toBe('artilheiro') // épico > especial
  })

  it('com escolha válida, mostra a escolha', () => {
    expect(cardPrincipal(cards, 'garcom').id).toBe('garcom')
  })

  it('escolha que já não tem cai para o mais raro (perdeu a artilharia)', () => {
    const semArtilharia = cardsDoJogador({ jogador: jogador({ assists: 12 }), liderancas: {} })
    expect(cardPrincipal(semArtilharia, 'artilheiro').id).toBe('garcom')
  })

  it('sem cards nenhuns não rebenta', () => {
    expect(cardPrincipal([], 'artilheiro')).toBe(null)
    expect(cardPrincipal(null, null)).toBe(null)
  })
})

describe('cardsEscolhiveis', () => {
  it('o card base não é uma escolha — é o que sobra', () => {
    const cards = cardsDoJogador({ jogador: jogador(), liderancas: {} })
    expect(ids(cardsEscolhiveis(cards))).not.toContain(CARD_BASE.id)
  })
})
