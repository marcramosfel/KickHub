import { describe, it, expect } from 'vitest'
import { filtrar, normalizar } from './FiltroLista.jsx'

describe('normalizar', () => {
  it('tira acentos e maiúsculas — procurar "savio" tem de achar "Sávio"', () => {
    expect(normalizar('Sávio Costa')).toBe('savio costa')
    expect(normalizar('João Gonçalves')).toBe('joao goncalves')
    expect(normalizar('ÂNGELO')).toBe('angelo')
  })

  it('aguenta null, undefined e números', () => {
    expect(normalizar(null)).toBe('')
    expect(normalizar(undefined)).toBe('')
    expect(normalizar(2026)).toBe('2026')
  })
})

describe('filtrar', () => {
  const jogadores = [
    { name: 'Sávio Costa', nota: 'goleiro' },
    { name: 'João Pereira', nota: null },
    { name: 'Marcos Felipe', nota: 'artilheiro' },
  ]
  const campos = (j) => [j.name, j.nota]

  it('sem termo devolve tudo', () => {
    expect(filtrar(jogadores, '', campos)).toHaveLength(3)
    expect(filtrar(jogadores, '   ', campos)).toHaveLength(3)
  })

  it('encontra sem acentos, em qualquer caixa', () => {
    expect(filtrar(jogadores, 'savio', campos).map((j) => j.name)).toEqual(['Sávio Costa'])
    expect(filtrar(jogadores, 'JOAO', campos).map((j) => j.name)).toEqual(['João Pereira'])
  })

  it('procura em todos os campos, não só no nome', () => {
    expect(filtrar(jogadores, 'artilheiro', campos).map((j) => j.name)).toEqual(['Marcos Felipe'])
  })

  it('campos nulos não rebentam nem dão falsos positivos', () => {
    expect(filtrar(jogadores, 'null', campos)).toEqual([])
  })

  it('sem correspondência devolve lista vazia, não a lista toda', () => {
    expect(filtrar(jogadores, 'zzz', campos)).toEqual([])
  })

  it('aguenta lista em falta', () => {
    expect(filtrar(null, 'x', campos)).toEqual([])
    expect(filtrar(undefined, '', campos)).toEqual([])
  })

  it('não mexe na lista original', () => {
    const original = [...jogadores]
    filtrar(jogadores, 'savio', campos)
    expect(jogadores).toEqual(original)
  })
})
