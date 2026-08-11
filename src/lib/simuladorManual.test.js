import { describe, it, expect } from 'vitest'
import {
  colocar,
  completo,
  contagem,
  estadoVazio,
  idsEmCampo,
  lineupDe,
  ondeEsta,
  remover,
  slotsDe,
  sugerirEquipas,
  trocar,
} from './simuladorManual.js'

const plantel = (n = 20) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p-${i}`,
    name: `Jogador ${i}`,
    primaryPosition: ['DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST'][i % 6],
    playerType: 'FIELD',
    overall: 50 + (i % 30),
    provisorio: false,
    acceptsOther: true,
    matches: 10,
    goals: i % 5,
    assists: i % 3,
    wins: 4,
  }))

describe('simuladorManual — estado', () => {
  it('o 2-3-1 tem sete lugares, com o goleiro à cabeça', () => {
    expect(slotsDe(7)).toEqual(['GK', 'DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST'])
  })

  it('começa vazio dos dois lados', () => {
    const e = estadoVazio()
    expect(contagem(e)).toEqual({ A: 0, B: 0 })
    expect(idsEmCampo(e)).toEqual([])
    expect(completo(e)).toBe(false)
  })

  it('coloca e encontra', () => {
    const e = colocar(estadoVazio(), { id: 'p-1', team: 'A', slot: 'ST' })
    expect(ondeEsta(e, 'p-1')).toEqual({ team: 'A', slot: 'ST' })
    expect(contagem(e)).toEqual({ A: 1, B: 0 })
  })

  it('não deixa ninguém em dois sítios', () => {
    let e = colocar(estadoVazio(), { id: 'p-1', team: 'A', slot: 'ST' })
    e = colocar(e, { id: 'p-1', team: 'B', slot: 'MID-C' })
    expect(ondeEsta(e, 'p-1')).toEqual({ team: 'B', slot: 'MID-C' })
    expect(contagem(e)).toEqual({ A: 0, B: 1 })
  })

  it('colocar num lugar ocupado TROCA em vez de fazer desaparecer', () => {
    // Fazer desaparecer alguém que já estava escalado é a maneira mais rápida
    // de perder o trabalho de quem estava a montar o jogo.
    let e = colocar(estadoVazio(), { id: 'p-1', team: 'A', slot: 'ST' })
    e = colocar(e, { id: 'p-2', team: 'A', slot: 'MID-C' })
    e = colocar(e, { id: 'p-2', team: 'A', slot: 'ST' })
    expect(ondeEsta(e, 'p-2')).toEqual({ team: 'A', slot: 'ST' })
    expect(ondeEsta(e, 'p-1')).toEqual({ team: 'A', slot: 'MID-C' })
    expect(contagem(e)).toEqual({ A: 2, B: 0 })
  })

  it('quem vem do banco para um lugar ocupado tira o outro', () => {
    // Sem origem para onde trocar, o que lá estava volta para o banco.
    let e = colocar(estadoVazio(), { id: 'p-1', team: 'A', slot: 'ST' })
    e = colocar(e, { id: 'p-9', team: 'A', slot: 'ST' })
    expect(ondeEsta(e, 'p-9')).toEqual({ team: 'A', slot: 'ST' })
    expect(ondeEsta(e, 'p-1')).toBeNull()
  })

  it('remove', () => {
    let e = colocar(estadoVazio(), { id: 'p-1', team: 'A', slot: 'ST' })
    e = remover(e, 'p-1')
    expect(ondeEsta(e, 'p-1')).toBeNull()
    expect(contagem(e)).toEqual({ A: 0, B: 0 })
  })

  it('troca dois, mesmo entre equipas diferentes', () => {
    let e = colocar(estadoVazio(), { id: 'p-1', team: 'A', slot: 'ST' })
    e = colocar(e, { id: 'p-2', team: 'B', slot: 'GK' })
    e = trocar(e, 'p-1', 'p-2')
    expect(ondeEsta(e, 'p-1')).toEqual({ team: 'B', slot: 'GK' })
    expect(ondeEsta(e, 'p-2')).toEqual({ team: 'A', slot: 'ST' })
  })

  it('ignora operações impossíveis sem rebentar', () => {
    const e = estadoVazio()
    expect(colocar(e, { id: null, team: 'A', slot: 'ST' })).toBe(e)
    expect(colocar(e, { id: 'x', team: 'Z', slot: 'ST' })).toBe(e)
    expect(colocar(e, { id: 'x', team: 'A', slot: 'INEXISTENTE' })).toBe(e)
    expect(remover(e, 'nao-esta')).toBe(e)
    expect(trocar(e, 'a', 'b')).toBe(e)
    expect(ondeEsta(e, null)).toBeNull()
  })

  it('não muda o estado anterior (imutável)', () => {
    const antes = estadoVazio()
    const copia = JSON.parse(JSON.stringify(antes))
    colocar(antes, { id: 'p-1', team: 'A', slot: 'ST' })
    expect(antes).toEqual(copia)
  })
})

describe('simuladorManual — prontidão e lineup', () => {
  const cheio = () => {
    let e = estadoVazio()
    slotsDe(7).forEach((slot, i) => {
      e = colocar(e, { id: `p-${i}`, team: 'A', slot })
      e = colocar(e, { id: `p-${i + 7}`, team: 'B', slot })
    })
    return e
  }

  it('só fica completo com os dois lados cheios', () => {
    const e = cheio()
    expect(completo(e)).toBe(true)
    expect(completo(remover(e, 'p-3'))).toBe(false)
  })

  it('devolve o lineup com o lugar de cada um', () => {
    const linha = lineupDe(cheio(), 'A', plantel())
    expect(linha).toHaveLength(7)
    expect(linha.find((j) => j.slot === 'GK')).toBeTruthy()
    // as estatísticas vêm do plantel, não são inventadas aqui
    expect(linha[0].matches).toBe(10)
  })

  it('ignora ids que já não existem no plantel', () => {
    let e = colocar(estadoVazio(), { id: 'fantasma', team: 'A', slot: 'ST' })
    e = colocar(e, { id: 'p-1', team: 'A', slot: 'GK' })
    expect(lineupDe(e, 'A', plantel())).toHaveLength(1)
  })
})

describe('simuladorManual — sugerir equipas', () => {
  it('preenche os dois lados de forma equilibrada', () => {
    const r = sugerirEquipas({ jogadores: plantel(14) })
    expect(r.ok).toBe(true)
    expect(completo(r.estado)).toBe(true)
    // ninguém repetido
    const ids = idsEmCampo(r.estado)
    expect(new Set(ids).size).toBe(14)
  })

  it('usa o rodízio quando não há goleiros fixos', () => {
    // O caso desta pelada. Sem isto o Simulador nascia com o mesmo defeito
    // que as Curiosidades tiveram.
    const r = sugerirEquipas({ jogadores: plantel(14) })
    expect(r.gkMode).toBe('ROTATING')
  })

  it('a mesma semente sugere o mesmo', () => {
    const a = sugerirEquipas({ jogadores: plantel(14), seed: 'x' })
    const b = sugerirEquipas({ jogadores: plantel(14), seed: 'x' })
    expect(b.estado).toEqual(a.estado)
  })

  it('sem gente suficiente devolve motivo', () => {
    const r = sugerirEquipas({ jogadores: plantel(5) })
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/precisos/)
  })
})
