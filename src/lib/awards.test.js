import { describe, it, expect } from 'vitest'
import {
  BAGRE,
  CRAQUE,
  candidatos,
  candidatosBagre,
  candidatosCraque,
  ladoDerrotado,
  ladoVencedor,
  podeVotar,
  semLadosDefinidos,
} from './awards.js'

// Brancos 7 × 4 Pretos — o exemplo do pedido.
const jogo = {
  score_a: 7,
  score_b: 4,
  team_a_name: 'Brancos',
  team_b_name: 'Pretos',
  players: [
    { player_id: 'b1', name: 'Branco 1', team: 'A' },
    { player_id: 'b2', name: 'Branco 2', team: 'A' },
    { player_id: 'p1', name: 'Preto 1', team: 'B' },
    { player_id: 'p2', name: 'Preto 2', team: 'B' },
  ],
}

const ids = (lista) => lista.map((p) => p.player_id)

describe('lado vencedor e derrotado', () => {
  it('lê o placar', () => {
    expect(ladoVencedor(jogo)).toBe('A')
    expect(ladoDerrotado(jogo)).toBe('B')
  })

  it('empate não tem lados', () => {
    const empate = { ...jogo, score_a: 3, score_b: 3 }
    expect(ladoVencedor(empate)).toBeNull()
    expect(ladoDerrotado(empate)).toBeNull()
    expect(semLadosDefinidos(empate)).toBe(true)
  })

  it('jogo sem placar não tem lados (não é um empate a fingir)', () => {
    expect(ladoVencedor({ ...jogo, score_a: null, score_b: null })).toBeNull()
    expect(semLadosDefinidos({ ...jogo, score_a: null, score_b: null })).toBe(true)
  })
})

describe('candidatos a craque e a bagre', () => {
  it('craque só entre os vencedores', () => {
    expect(ids(candidatosCraque(jogo))).toEqual(['b1', 'b2'])
  })

  it('bagre só entre os derrotados', () => {
    expect(ids(candidatosBagre(jogo))).toEqual(['p1', 'p2'])
  })

  it('quem está a votar nunca aparece na sua própria lista', () => {
    expect(ids(candidatosCraque(jogo, 'b1'))).toEqual(['b2'])
    expect(ids(candidatosBagre(jogo, 'p2'))).toEqual(['p1'])
    // e não desaparece do lado onde não podia estar
    expect(ids(candidatosBagre(jogo, 'b1'))).toEqual(['p1', 'p2'])
  })

  it('num empate concorre toda a gente que jogou', () => {
    const empate = { ...jogo, score_a: 5, score_b: 5 }
    expect(ids(candidatosCraque(empate))).toEqual(['b1', 'b2', 'p1', 'p2'])
    expect(ids(candidatosBagre(empate, 'p1'))).toEqual(['b1', 'b2', 'p2'])
  })

  it('rodada antiga sem equipas: toda a gente concorre', () => {
    const antiga = {
      score_a: 3,
      score_b: 1,
      players: [
        { player_id: 'x', name: 'X', team: null },
        { player_id: 'y', name: 'Y', team: null },
        { player_id: 'z', name: 'Z' },
      ],
    }
    expect(semLadosDefinidos(antiga)).toBe(true)
    expect(ids(candidatosCraque(antiga))).toEqual(['x', 'y', 'z'])
    expect(ids(candidatosBagre(antiga))).toEqual(['x', 'y', 'z'])
  })

  it('aceita o formato `stats` do jogo do admin', () => {
    const doAdmin = { score_a: 2, score_b: 0, stats: jogo.players }
    expect(ids(candidatos(doAdmin, CRAQUE))).toEqual(['b1', 'b2'])
    expect(ids(candidatos(doAdmin, BAGRE))).toEqual(['p1', 'p2'])
  })

  it('jogo vazio não rebenta', () => {
    expect(candidatosCraque(null)).toEqual([])
    expect(candidatosBagre({})).toEqual([])
  })
})

describe('podeVotar', () => {
  it('há candidatos dos dois lados', () => {
    expect(podeVotar(jogo, 'b1')).toBe(true)
    expect(podeVotar(jogo, 'p1')).toBe(true)
  })

  it('o único derrotado não tem em quem votar para bagre', () => {
    const solitario = {
      score_a: 5,
      score_b: 0,
      players: [
        { player_id: 'b1', team: 'A' },
        { player_id: 'b2', team: 'A' },
        { player_id: 'p1', team: 'B' },
      ],
    }
    expect(podeVotar(solitario, 'p1')).toBe(false)
    expect(podeVotar(solitario, 'b1')).toBe(true)
  })
})
