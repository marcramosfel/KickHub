import { describe, it, expect } from 'vitest'
import {
  ESTADO,
  contarDisponiveis,
  estadoVisivel,
  etiquetaDoEstado,
  indiceDeRespostas,
  separarMensalistas,
} from './plantel.js'

describe('estado do jogador', () => {
  it('estado desconhecido ou em falta lê-se como disponível', () => {
    expect(etiquetaDoEstado(undefined).id).toBe(ESTADO.DISPONIVEL)
    expect(etiquetaDoEstado('QUALQUERCOISA').id).toBe(ESTADO.DISPONIVEL)
  })

  it('só se mostra o chip quando ele diz alguma coisa', () => {
    expect(estadoVisivel(ESTADO.DISPONIVEL)).toBe(false)
    expect(estadoVisivel(null)).toBe(false)
    expect(estadoVisivel(ESTADO.LESIONADO)).toBe(true)
  })
})

describe('mensalistas', () => {
  const plantel = [
    { id: '1', name: 'Zé', isMember: false },
    { id: '2', name: 'Ana', isMember: true },
    { id: '3', name: 'Bruno', isMember: true },
    { id: '4', name: 'Ávila', isMember: false },
  ]

  it('mensalistas primeiro, e por nome dentro de cada grupo', () => {
    const { mensalistas, restantes } = separarMensalistas(plantel)
    expect(mensalistas.map((j) => j.name)).toEqual(['Ana', 'Bruno'])
    // acentos não mandam o Ávila para o fim
    expect(restantes.map((j) => j.name)).toEqual(['Ávila', 'Zé'])
  })

  it('não marca ninguém — só ordena', () => {
    const { mensalistas, restantes } = separarMensalistas(plantel)
    expect(mensalistas.length + restantes.length).toBe(plantel.length)
  })
})

describe('convocatória', () => {
  const convocatoria = {
    answers: [
      { player_id: '2', available: true },
      { player_id: '3', available: false },
    ],
  }

  it('só quem respondeu entra no índice', () => {
    const r = indiceDeRespostas(convocatoria)
    expect(r).toEqual({ 2: true, 3: false })
    expect('1' in r).toBe(false)
  })

  it('sem convocatória o índice fica vazio em vez de rebentar', () => {
    expect(indiceDeRespostas(null)).toEqual({})
  })

  // Silêncio não é falta: quem não respondeu continua a contar como
  // provavelmente disponível, e é isso que o "12/14" diz.
  it('conta como disponível quem não disse que falta', () => {
    const mensalistas = [
      { id: '1', name: 'Zé' },
      { id: '2', name: 'Ana' },
      { id: '3', name: 'Bruno' },
    ]
    const c = contarDisponiveis(mensalistas, indiceDeRespostas(convocatoria))
    expect(c).toEqual({ total: 3, disponiveis: 2, confirmados: 1, ausentes: 1 })
  })
})
