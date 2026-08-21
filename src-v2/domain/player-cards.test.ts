import { describe, expect, it } from 'vitest'
import { computeCards, mainCard, unlockedCards, type CardInput } from './player-cards'

function row(id: string, overrides: Partial<CardInput> = {}): CardInput {
  return {
    membershipId: id, displayName: id, playerType: 'FIELD',
    primaryPosition: 'MID', secondaryPosition: null, acceptsOtherPositions: true,
    overall: 70, provisional: false, titles: [],
    gamesPlayed: 10, goals: 4, assists: 3, wins: 5, saves: 0, craques: 1,
    currentWinStreak: 0, bestUnbeatenStreak: 0, gkCleanSheets: 0,
    ...overrides,
  }
}

describe('computeCards', () => {
  it('dá a toda a gente um card, mesmo sem conquista nenhuma', () => {
    const cards = computeCards({ rows: [row('a', { overall: null, provisional: true })] })
    expect(cards.get('a')?.map((entry) => entry.key)).toEqual(['base'])
    expect(unlockedCards(cards.get('a'))).toEqual([])
  })

  it('coroa quem tem o maior overall de campo', () => {
    const cards = computeCards({ rows: [row('a', { overall: 90 }), row('b', { overall: 70 })] })
    expect(cards.get('a')?.some((entry) => entry.key === 'kingOfPelada')).toBe(true)
    expect(cards.get('b')?.some((entry) => entry.key === 'kingOfPelada')).toBe(false)
  })

  it('o guarda-redes não disputa a coroa de campo, tem a dele', () => {
    const cards = computeCards({ rows: [
      row('gk', { overall: 95, playerType: 'GOALKEEPER' }),
      row('campo', { overall: 80 }),
    ] })
    expect(cards.get('gk')?.some((entry) => entry.key === 'kingOfPelada')).toBe(false)
    expect(cards.get('gk')?.some((entry) => entry.key === 'keeperKing')).toBe(true)
    expect(cards.get('campo')?.some((entry) => entry.key === 'kingOfPelada')).toBe(true)
  })

  it('um empate premeia todos, e o card diz com quantos', () => {
    const cards = computeCards({ rows: [row('a', { overall: 88 }), row('b', { overall: 88 })] })
    const king = cards.get('a')?.find((entry) => entry.key === 'kingOfPelada')
    expect(king?.sharedWith).toBe(1)
    expect(cards.get('b')?.some((entry) => entry.key === 'kingOfPelada')).toBe(true)
  })

  it('não coroa ninguém com um overall que a app não assume', () => {
    const cards = computeCards({ rows: [
      row('novato', { overall: 99, provisional: true }),
      row('sem-nota', { overall: null }),
    ] })
    const keys = [...cards.values()].flat().map((entry) => entry.key)
    expect(keys).not.toContain('kingOfPelada')
  })

  it('os títulos do overall viram cards com a raridade do seu tier', () => {
    const cards = computeCards({ rows: [row('a', { titles: ['topScorer', 'unbeaten', 'saves'], goals: 30 }) ] })
    const byKey = new Map(cards.get('a')!.map((entry) => [entry.key, entry]))
    // ouro → épico, prata → raro, bronze → especial
    expect(byKey.get('topScorer')?.rarity).toBe('epic')
    expect(byKey.get('unbeaten')?.rarity).toBe('rare')
    expect(byKey.get('saves')?.rarity).toBe('special')
    expect(byKey.get('topScorer')?.params.value).toBe(30)
  })

  it('não transforma títulos em cards para quem ainda é provisório', () => {
    const cards = computeCards({ rows: [row('a', { provisional: true, titles: ['topScorer'] })] })
    expect(cards.get('a')?.map((entry) => entry.key)).toEqual(['base'])
  })

  it('dá os marcos a quem lá chegou, sem depender de mais ninguém', () => {
    const cards = computeCards({
      rows: [row('a', {
        bestUnbeatenStreak: 6, currentWinStreak: 4, assists: 12,
        gamesPlayed: 30, goals: 15, craques: 3,
        secondaryPosition: 'ATT', acceptsOtherPositions: true,
      })],
      totalRounds: 32,
    })
    const keys = cards.get('a')!.map((entry) => entry.key)
    expect(keys).toEqual(expect.arrayContaining(['unbeaten5', 'winStreak4', 'playmaker10', 'everPresent', 'joker', 'legend']))
  })

  it('o card de presença precisa das rodadas da pelada para existir', () => {
    const input = row('a', { gamesPlayed: 20 })
    expect(computeCards({ rows: [input] }).get('a')?.some((entry) => entry.key === 'everPresent')).toBe(false)
    expect(computeCards({ rows: [input], totalRounds: 22 }).get('a')?.some((entry) => entry.key === 'everPresent')).toBe(true)
    // 20 em 40 é metade das rodadas: não é presença.
    expect(computeCards({ rows: [input], totalRounds: 40 }).get('a')?.some((entry) => entry.key === 'everPresent')).toBe(false)
  })

  it('só um guarda-redes leva a muralha', () => {
    const cards = computeCards({ rows: [
      row('gk', { playerType: 'GOALKEEPER', gkCleanSheets: 4 }),
      row('campo', { gkCleanSheets: 4 }),
    ] })
    expect(cards.get('gk')?.some((entry) => entry.key === 'cleanSheets3')).toBe(true)
    expect(cards.get('campo')?.some((entry) => entry.key === 'cleanSheets3')).toBe(false)
  })

  it('o coringa precisa mesmo das duas posições e da abertura', () => {
    const has = (input: Partial<CardInput>) =>
      computeCards({ rows: [row('a', input)] }).get('a')?.some((entry) => entry.key === 'joker')
    expect(has({ secondaryPosition: 'ATT' })).toBe(true)
    expect(has({ secondaryPosition: null })).toBe(false)
    expect(has({ secondaryPosition: 'ATT', acceptsOtherPositions: false })).toBe(false)
  })

  it('ordena do mais raro para o mais fraco, e o base fica sempre no fim', () => {
    const cards = computeCards({
      rows: [row('a', { overall: 90, titles: ['saves', 'topScorer'], assists: 12 })],
    })!.get('a')!
    const weights = cards.map((entry) => entry.rarity)
    expect(weights[0]).toBe('legendary')
    expect(weights[weights.length - 1]).toBe('common')
    expect(mainCard(cards)?.key).toBe('kingOfPelada')
  })

  it('o card principal é o mais raro, e nunca o base quando há outro', () => {
    // Dois jogadores: o 'a' não é o melhor de campo, portanto a única conquista
    // dele é mesmo o título. Com um só, ele era trivialmente o rei da pelada.
    const cards = computeCards({
      rows: [row('a', { overall: 60, titles: ['saves'] }), row('rei', { overall: 90 })],
    }).get('a')!
    expect(mainCard(cards)?.key).toBe('saves')
    expect(unlockedCards(cards).map((entry) => entry.key)).toEqual(['saves'])
  })
})
