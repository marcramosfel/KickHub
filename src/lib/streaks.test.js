import { describe, it, expect } from 'vitest'
import { aproveitamento, calcularSequencias, faseDoJogador } from './streaks.js'

// Rodadas na ordem de get_matches: RECENTE PRIMEIRO.
const rodada = (scoreA, scoreB, players, gk = []) => ({
  score_a: scoreA,
  score_b: scoreB,
  players,
  gk_stats: gk,
})
const linha = (id, team, goals = 0, assists = 0) => ({ player_id: id, team, goals, assists })

describe('calcularSequencias', () => {
  it('conta vitórias seguidas a partir da rodada mais recente', () => {
    const seq = calcularSequencias([
      rodada(3, 1, [linha('x', 'A', 1)]), // V (mais recente)
      rodada(2, 0, [linha('x', 'A')]), // V
      rodada(0, 1, [linha('x', 'A')]), // D — quebra
      rodada(4, 0, [linha('x', 'A')]), // V (antiga, não conta para a atual)
    ])
    expect(seq.x.seqVitorias).toBe(2)
    expect(seq.x.seqSemPerder).toBe(2)
    expect(seq.x.jogos).toBe(4)
    expect(seq.x.vitorias).toBe(3)
    expect(seq.x.derrotas).toBe(1)
  })

  it('empate mantém o "sem perder" mas quebra as vitórias', () => {
    const seq = calcularSequencias([
      rodada(1, 1, [linha('x', 'A')]), // E
      rodada(2, 0, [linha('x', 'A')]), // V
    ])
    expect(seq.x.seqVitorias).toBe(0)
    expect(seq.x.seqSemPerder).toBe(2)
  })

  it('sequência de gols e de assistências', () => {
    const seq = calcularSequencias([
      rodada(2, 1, [linha('x', 'A', 1, 1)]),
      rodada(3, 2, [linha('x', 'A', 2, 0)]),
      rodada(1, 0, [linha('x', 'A', 0, 1)]),
    ])
    expect(seq.x.seqMarcando).toBe(2) // o 3º jogo (0 gols) quebra
    expect(seq.x.seqAssistindo).toBe(1) // o 2º (0 assist) quebra
    expect(seq.x.seqSemMarcar).toBe(0)
  })

  it('jogos sem marcar', () => {
    const seq = calcularSequencias([
      rodada(2, 1, [linha('x', 'A', 0)]),
      rodada(3, 2, [linha('x', 'A', 0)]),
      rodada(1, 0, [linha('x', 'A', 2)]),
    ])
    expect(seq.x.seqSemMarcar).toBe(2)
    expect(seq.x.seqMarcando).toBe(0)
  })

  it('rodada sem equipa registada quebra as sequências de resultado', () => {
    const seq = calcularSequencias([
      rodada(3, 1, [linha('x', 'A')]), // V
      rodada(2, 0, [linha('x', null)]), // sem time — não se sabe
      rodada(4, 0, [linha('x', 'A')]), // V
    ])
    expect(seq.x.seqVitorias).toBe(1)
    expect(seq.x.vitorias).toBe(2) // os totais só contam o que se sabe
  })

  it('goleiro: jogos seguidos sem sofrer gol', () => {
    const gk = (id, sofridos) => ({ goalkeeper_id: id, team: 'A', saves: 3, goals_conceded: sofridos })
    const seq = calcularSequencias([
      rodada(2, 0, [], [gk('g', 0)]),
      rodada(1, 0, [], [gk('g', 0)]),
      rodada(2, 3, [], [gk('g', 3)]),
    ])
    expect(seq.g.seqSemSofrer).toBe(2)
  })

  it('o placar manda: registo a dizer 0 sofridos com a equipa a sofrer 4 não é clean sheet', () => {
    // o admin grava 0 por omissão quando não preenche as defesas — o 0 do
    // formulário não pode virar sequência
    const seq = calcularSequencias([
      rodada(0, 4, [], [{ goalkeeper_id: 'g', team: 'A', saves: 0, goals_conceded: 0 }]),
    ])
    expect(seq.g.seqSemSofrer).toBe(0)
  })

  it('jogar uma rodada sem registo de baliza quebra a sequência de clean sheets', () => {
    const gk = (sofridos) => ({ goalkeeper_id: 'g', team: 'A', saves: 3, goals_conceded: sofridos })
    const seq = calcularSequencias([
      rodada(2, 0, [linha('g', 'A')], [gk(0)]), // recente: clean sheet
      rodada(1, 0, [linha('g', 'A')], []), // jogou, mas sem registo — não se sabe
      rodada(3, 0, [linha('g', 'A')], [gk(0)]), // antiga: não pode contar
    ])
    expect(seq.g.seqSemSofrer).toBe(1)
  })

  it('melhores marcas varrem o histórico todo, não só a atual', () => {
    const seq = calcularSequencias([
      rodada(0, 1, [linha('x', 'A')]), // D (recente)
      rodada(2, 0, [linha('x', 'A')]), // V
      rodada(3, 0, [linha('x', 'A')]), // V
      rodada(1, 0, [linha('x', 'A')]), // V
    ])
    expect(seq.x.seqVitorias).toBe(0)
    expect(seq.x.melhorSeqVitorias).toBe(3)
    expect(seq.x.melhorSeqSemPerder).toBe(3)
  })

  it('lista vazia ou nula devolve mapa vazio', () => {
    expect(calcularSequencias([])).toEqual({})
    expect(calcularSequencias(null)).toEqual({})
  })
})

describe('aproveitamento', () => {
  it('3 pontos por vitória, 1 por empate', () => {
    expect(aproveitamento({ jogos: 4, vitorias: 2, empates: 1, derrotas: 1 })).toBe(58)
  })
  it('rodadas de resultado desconhecido ficam fora do denominador', () => {
    // 2 jogos mas só 1 com equipa registada (vitória) → 100%, não 50%
    expect(aproveitamento({ jogos: 2, vitorias: 1, empates: 0, derrotas: 0 })).toBe(100)
  })
  it('sem jogos (ou só desconhecidos) não há aproveitamento', () => {
    expect(aproveitamento({ jogos: 0 })).toBe(null)
    expect(aproveitamento({ jogos: 3, vitorias: 0, empates: 0, derrotas: 0 })).toBe(null)
    expect(aproveitamento(null)).toBe(null)
  })
})

describe('faseDoJogador', () => {
  const base = { jogos: 10, seqVitorias: 0, seqSemPerder: 0, seqDerrotas: 0, seqMarcando: 0, seqAssistindo: 0, seqSemMarcar: 0, seqSemSofrer: 0 }

  it('boa fase por vitórias', () => {
    expect(faseDoJogador({ ...base, seqVitorias: 3 })).toEqual({ tipo: 'boa', texto: '3 vitórias seguidas' })
  })
  it('má fase por seca de gols só com histórico suficiente', () => {
    expect(faseDoJogador({ ...base, seqSemMarcar: 5 })).toEqual({ tipo: 'ma', texto: '5 jogos sem marcar' })
    expect(faseDoJogador({ ...base, jogos: 4, seqSemMarcar: 4 })).toBe(null)
  })
  it('sem nada digno de nota devolve null (a resenha salta)', () => {
    expect(faseDoJogador(base)).toBe(null)
    expect(faseDoJogador(null)).toBe(null)
  })
})
