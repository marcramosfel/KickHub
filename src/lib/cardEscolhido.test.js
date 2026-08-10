import { describe, it, expect } from 'vitest'
import { cardDoJogador, molduraDoJogador } from './cards.js'

// O Marcos é Rei da Pelada E Rei dos Craques. Escolheu o segundo.
const marcos = { id: 'marcos', name: 'Marcos', matches: 3, goals: 8, assists: 4, craques: 2 }
const liderancas = {
  'rei-da-pelada': { playerIds: ['marcos'], valor: 95 },
  'rei-craques': { playerIds: ['marcos'], valor: 2 },
}

describe('o card que se mostra é o que o jogador escolheu', () => {
  // A regressão exata do relato: o ranking mostrava "Rei da Pelada" a quem
  // tinha escolhido "Rei dos Craques", porque escolhia por prioridade e
  // nunca lia a escolha.
  it('respeita a escolha em vez de mandar o mais raro', () => {
    const c = cardDoJogador({ jogador: { ...marcos, primaryCard: 'rei-craques' }, liderancas })
    expect(c.id).toBe('rei-craques')
  })

  it('sem escolha, manda o mais raro — o comportamento de sempre', () => {
    expect(cardDoJogador({ jogador: marcos, liderancas }).id).toBe('rei-da-pelada')
  })

  // A escolha fica guardada mesmo quando deixa de ser válida: se ele voltar
  // a ser o rei dos craques, o card volta sozinho.
  it('uma escolha que já não se tem cai para o mais raro', () => {
    const c = cardDoJogador({
      jogador: { ...marcos, primaryCard: 'artilheiro' },
      liderancas, // já não é artilheiro
    })
    expect(c.id).toBe('rei-da-pelada')
  })

  it('quem não tem títulos nenhuns fica com o card base', () => {
    const c = cardDoJogador({ jogador: { id: 'ze', name: 'Zé' }, liderancas: {} })
    expect(c.id).toBe('base')
  })

  // O card base é de toda a gente — emoldurar toda a gente é não emoldurar
  // ninguém.
  it('a moldura ignora o card base', () => {
    expect(molduraDoJogador({ jogador: { id: 'ze' }, liderancas: {} })).toBeNull()
    expect(
      molduraDoJogador({ jogador: { ...marcos, primaryCard: 'rei-craques' }, liderancas }).id
    ).toBe('rei-craques')
  })

  it('sem jogador nenhum não rebenta', () => {
    expect(cardDoJogador()).toBeNull()
    expect(molduraDoJogador({})).toBeNull()
  })
})
