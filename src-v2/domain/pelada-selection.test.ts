import { describe, expect, it } from 'vitest'
import {
  buildSelection,
  buildSelections,
  formationOf,
  type SelectionPlayer,
  type SelectionPosition,
} from './pelada-selection'

function player(id: string, overall: number | null, overrides: Partial<SelectionPlayer> = {}): SelectionPlayer {
  return {
    membershipId: id,
    displayName: id,
    playerType: 'FIELD',
    primaryPosition: 'MID',
    secondaryPosition: null,
    acceptsOtherPositions: true,
    overall,
    provisional: false,
    ...overrides,
  }
}

/** Um plantel com gente a mais em cada linha, para haver escolha a sério. */
function squad() {
  const rows: SelectionPlayer[] = [
    player('gk-bom', 88, { playerType: 'GOALKEEPER', primaryPosition: 'GK' }),
    player('gk-mau', 41, { playerType: 'GOALKEEPER', primaryPosition: 'GK' }),
  ]
  const lines: [SelectionPosition, number][] = [['DEF', 3], ['MID', 4], ['ATT', 2]]
  for (const [position, count] of lines) {
    for (let index = 0; index < count; index += 1) {
      rows.push(player(`${position}-${index}`, 50 + index * 5, { primaryPosition: position }))
    }
  }
  return rows
}

describe('formationOf', () => {
  it('desenha o 2-3-1 quando a pelada joga 7x7', () => {
    const formation = formationOf(7)
    expect(formation.name).toBe('2-3-1')
    expect(formation.lines).toEqual([
      { position: 'DEF', count: 2 }, { position: 'MID', count: 3 }, { position: 'ATT', count: 1 },
    ])
  })

  it('deriva uma formação para tamanhos fora da tabela em vez de recusar', () => {
    const formation = formationOf(13)
    expect(formation.teamSize).toBe(13)
    const outfield = formation.lines.reduce((total, line) => total + line.count, 0)
    expect(outfield).toBe(12)
  })

  it('cai no formato por omissão quando o tamanho não faz sentido', () => {
    expect(formationOf(0).teamSize).toBe(7)
    expect(formationOf(99).teamSize).toBe(7)
    expect(formationOf(Number.NaN).teamSize).toBe(7)
  })
})

describe('buildSelection', () => {
  it('põe um jogador em cada lugar da formação, e não os melhores overalls', () => {
    const rows = [
      ...squad(),
      // Três atacantes esmagadores. Se a seleção fosse "os N melhores",
      // entravam todos e ficava uma equipa sem defesas.
      player('craque-1', 99, { primaryPosition: 'ATT', acceptsOtherPositions: false }),
      player('craque-2', 98, { primaryPosition: 'ATT', acceptsOtherPositions: false }),
      player('craque-3', 97, { primaryPosition: 'ATT', acceptsOtherPositions: false }),
    ]
    const selection = buildSelection({ players: rows, teamSize: 7 })

    expect(selection.complete).toBe(true)
    expect(selection.outfield.map((entry) => entry.slot)).toEqual(['DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT'])
    expect(selection.outfield.filter((entry) => entry.slot === 'ATT')).toHaveLength(1)
    expect(selection.outfield.find((entry) => entry.slot === 'ATT')?.membershipId).toBe('craque-1')
  })

  it('escolhe o melhor de cada linha', () => {
    const selection = buildSelection({ players: squad(), teamSize: 7 })
    const defenders = selection.outfield.filter((entry) => entry.slot === 'DEF')
    expect(defenders.map((entry) => entry.membershipId).sort()).toEqual(['DEF-1', 'DEF-2'])
    expect(selection.goalkeeper?.membershipId).toBe('gk-bom')
  })

  it('a anti-seleção é o mesmo cálculo ao contrário', () => {
    const { best, worst } = buildSelections({ players: squad(), teamSize: 7 })
    expect(best.goalkeeper?.membershipId).toBe('gk-bom')
    expect(worst.goalkeeper?.membershipId).toBe('gk-mau')
    expect(worst.outfield.filter((entry) => entry.slot === 'DEF').map((entry) => entry.membershipId).sort())
      .toEqual(['DEF-0', 'DEF-1'])
    expect(worst.strength).toBeLessThan(best.strength)
  })

  it('deixa de fora quem ainda não tem overall a sério', () => {
    const rows = [
      ...squad(),
      player('novato', 12, { primaryPosition: 'DEF', provisional: true }),
      player('sem-nota', null, { primaryPosition: 'DEF' }),
    ]
    const { best, worst } = buildSelections({ players: rows, teamSize: 7 })
    const ids = [...best.outfield, ...worst.outfield].map((entry) => entry.membershipId)
    expect(ids).not.toContain('novato')
    expect(ids).not.toContain('sem-nota')
  })

  it('não usa o mesmo jogador em dois lugares', () => {
    const selection = buildSelection({ players: squad(), teamSize: 7 })
    const ids = selection.outfield.map((entry) => entry.membershipId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(selection.goalkeeper?.membershipId)
  })

  it('preenche os lugares escassos antes dos disputados', () => {
    // Um único atacante, que também serve ao meio. Se o meio-campo fosse
    // servido primeiro, ele era levado para lá e o ataque ficava vazio.
    const rows = [
      player('gk', 70, { playerType: 'GOALKEEPER', primaryPosition: 'GK' }),
      player('def-1', 70, { primaryPosition: 'DEF' }),
      player('def-2', 69, { primaryPosition: 'DEF' }),
      player('mid-1', 60, { primaryPosition: 'MID' }),
      player('mid-2', 59, { primaryPosition: 'MID' }),
      player('mid-3', 58, { primaryPosition: 'MID' }),
      player('att-unico', 95, { primaryPosition: 'ATT', secondaryPosition: 'MID' }),
    ]
    const selection = buildSelection({ players: rows, teamSize: 7 })
    expect(selection.complete).toBe(true)
    expect(selection.outfield.find((entry) => entry.slot === 'ATT')?.membershipId).toBe('att-unico')
  })

  it('respeita quem não aceita jogar fora das suas posições', () => {
    const rows = [
      player('gk', 70, { playerType: 'GOALKEEPER', primaryPosition: 'GK' }),
      player('so-defesa', 90, { primaryPosition: 'DEF', acceptsOtherPositions: false }),
      player('polivalente', 40, { primaryPosition: 'MID' }),
    ]
    const selection = buildSelection({ players: rows, teamSize: 7 })
    const attack = selection.outfield.find((entry) => entry.slot === 'ATT')
    expect(attack?.membershipId).toBe('polivalente')
    expect(selection.outfield.filter((entry) => entry.membershipId === 'so-defesa')
      .every((entry) => entry.slot === 'DEF')).toBe(true)
  })

  it('assume o lugar vazio em vez de fingir um onze a meio', () => {
    const rows = [player('unico', 70, { primaryPosition: 'MID', acceptsOtherPositions: false })]
    const selection = buildSelection({ players: rows, teamSize: 7 })
    expect(selection.complete).toBe(false)
    expect(selection.goalkeeper).toBeNull()
    expect(selection.outfield).toHaveLength(1)
    expect(selection.missing).toEqual(['DEF', 'DEF', 'MID', 'MID', 'ATT'])
  })

  it('não tem média sem ninguém no campo', () => {
    const selection = buildSelection({ players: [], teamSize: 7 })
    expect(selection.average).toBeNull()
    expect(selection.strength).toBe(0)
    expect(selection.complete).toBe(false)
  })

  it('o guarda-redes não entra na força de campo', () => {
    const rows = [
      player('gk', 99, { playerType: 'GOALKEEPER', primaryPosition: 'GK' }),
      player('mid', 60, { primaryPosition: 'MID' }),
    ]
    const selection = buildSelection({ players: rows, teamSize: 7 })
    expect(selection.strength).toBe(60)
    expect(selection.average).toBe(60)
  })

  it('um guarda-redes só nunca aparece também na linha', () => {
    const rows = [
      player('gk', 80, { playerType: 'GOALKEEPER', primaryPosition: 'GK' }),
      player('mid', 60, { primaryPosition: 'MID' }),
    ]
    const selection = buildSelection({ players: rows, teamSize: 7 })
    expect(selection.outfield.map((entry) => entry.membershipId)).not.toContain('gk')
  })
})
