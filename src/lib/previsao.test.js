import { describe, it, expect } from 'vitest'
import { compararComResultado, lineupsDoJogo, preverJogo } from './previsao.js'

const SLOTS = ['GK', 'DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST']

const jogoCom = (overallA = 80, overallB = 78) => ({
  id: 'jogo-1',
  team_a_name: 'Pretos',
  team_b_name: 'Brancos',
  lineup: [
    ...SLOTS.map((slot, i) => ({
      player_id: `a-${i}`,
      name: `A ${i}`,
      team: 'A',
      assigned_position: slot,
      overall_at_draw: overallA,
    })),
    ...SLOTS.map((slot, i) => ({
      player_id: `b-${i}`,
      name: `B ${i}`,
      team: 'B',
      assigned_position: slot,
      overall_at_draw: overallB,
    })),
  ],
})

const plantel = () =>
  SLOTS.flatMap((slot, i) =>
    ['a', 'b'].map((t) => ({
      id: `${t}-${i}`,
      name: `${t.toUpperCase()} ${i}`,
      overall: 60, // diferente do overall_at_draw, de propósito
      matches: 10,
      goals: 4,
      assists: 2,
      wins: 5,
      craques: 1,
      bagres: 1,
    }))
  )

describe('previsao — leitura da escalação', () => {
  it('separa os dois lados e leva o lugar de cada um', () => {
    const { a, b } = lineupsDoJogo(jogoCom(), plantel())
    expect(a).toHaveLength(7)
    expect(b).toHaveLength(7)
    expect(a.find((j) => j.slot === 'GK')).toBeTruthy()
  })

  it('junta as estatísticas do plantel', () => {
    const { a } = lineupsDoJogo(jogoCom(), plantel())
    expect(a[0].matches).toBe(10)
    expect(a[0].goals).toBe(4)
  })

  it('o overall do sorteio ganha ao atual', () => {
    // A previsão é sobre o jogo que FOI sorteado, e é esse número que o grupo
    // viu no ecrã.
    const { a } = lineupsDoJogo(jogoCom(88), plantel())
    expect(a[0].overall).toBe(88)
  })

  it('aguenta um jogo sem escalação', () => {
    expect(lineupsDoJogo(null, []).a).toEqual([])
    expect(lineupsDoJogo({ lineup: null }, []).b).toEqual([])
  })
})

describe('previsao — previsão do jogo', () => {
  it('prevê placar, probabilidades e destaques', () => {
    const f = preverJogo({ jogo: jogoCom(), jogadores: plantel() })
    expect(Number.isFinite(f.golosA)).toBe(true)
    expect(f.probabilidades.a + f.probabilidades.empate + f.probabilidades.b).toBeCloseTo(1, 6)
    expect(f.craqueId).toBeTruthy()
    expect(f.narrativa).toBeTruthy()
  })

  it('a semente é o id do jogo, portanto não muda entre chamadas', () => {
    // Sem isto, "gerar a previsão" duas vezes dava dois placares e a primeira
    // pergunta do grupo era qual dos dois vale.
    const a = preverJogo({ jogo: jogoCom(), jogadores: plantel() })
    const b = preverJogo({ jogo: jogoCom(), jogadores: plantel() })
    expect(b.golosA).toBe(a.golosA)
    expect(b.golosB).toBe(a.golosB)
    expect(b.craqueId).toBe(a.craqueId)
    expect(a.seed).toBe('jogo-1')
  })

  it('jogos diferentes dão previsões diferentes', () => {
    const x = preverJogo({ jogo: { ...jogoCom(), id: 'outro' }, jogadores: plantel() })
    const y = preverJogo({ jogo: jogoCom(), jogadores: plantel() })
    expect(`${x.golosA}-${x.golosB}`).not.toBe(`${y.golosA}-${y.golosB}`)
  })

  it('o artilheiro previsto é de uma das equipas do jogo', () => {
    const f = preverJogo({ jogo: jogoCom(), jogadores: plantel() })
    const ids = jogoCom().lineup.map((l) => l.player_id)
    if (f.artilheiroId) expect(ids).toContain(f.artilheiroId)
  })

  it('sem escalação não inventa previsão', () => {
    expect(preverJogo({ jogo: { id: 'x', lineup: [] } })).toBeNull()
    expect(preverJogo({})).toBeNull()
  })
})

describe('previsao — comparação com o resultado', () => {
  const f = { gols_a: 5, gols_b: 4 }

  it('acerta quando acerta o vencedor', () => {
    const r = compararComResultado(f, { score_a: 9, score_b: 7 })
    expect(r.acertou).toBe(true)
    expect(r.placarExato).toBe(false)
    expect(r.previsto).toBe('5–4')
    expect(r.real).toBe('9–7')
  })

  it('falha quando o outro lado ganha', () => {
    expect(compararComResultado(f, { score_a: 4, score_b: 6 }).acertou).toBe(false)
  })

  it('o empate é um resultado como os outros', () => {
    expect(compararComResultado({ gols_a: 3, gols_b: 3 }, { score_a: 8, score_b: 8 }).acertou).toBe(
      true
    )
    expect(compararComResultado(f, { score_a: 7, score_b: 7 }).acertou).toBe(false)
  })

  it('assinala o placar exato', () => {
    const r = compararComResultado(f, { score_a: 5, score_b: 4 })
    expect(r.placarExato).toBe(true)
    expect(r.acertou).toBe(true)
  })

  it('sem resultado ainda não há comparação', () => {
    expect(compararComResultado(f, { score_a: null, score_b: null })).toBeNull()
    expect(compararComResultado(null, { score_a: 1, score_b: 0 })).toBeNull()
  })

  it('aceita as duas formas do campo (base de dados e memória)', () => {
    // Da base vem `gols_a`; do `preverJogo` vem `golosA`.
    const r = compararComResultado({ golosA: 5, golosB: 4 }, { score_a: 9, score_b: 7 })
    expect(r.acertou).toBe(true)
  })
})
