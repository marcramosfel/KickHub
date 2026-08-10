import { describe, it, expect } from 'vitest'
import { ESTADO_PELADA, estadoDaPelada } from './estadoDaPelada.js'

const comEquipas = { id: 'j1', lineup: [{ player_id: 'a' }, { player_id: 'b' }] }
const semEquipas = { id: 'j1', lineup: [] }
const resultado = { id: 'r1', score_a: 10, score_b: 9 }

describe('estadoDaPelada', () => {
  it('a votação ganha a tudo — é a única coisa com prazo', () => {
    const e = estadoDaPelada({
      proximoJogo: comEquipas,
      latestMatch: resultado,
      porVotar: [{ match_id: 'r1', deadline: '2026-08-12T00:00:00Z' }],
      faltamAvaliar: 3,
    })
    expect(e.tipo).toBe(ESTADO_PELADA.VOTAR)
    expect(e.matchId).toBe('r1')
    expect(e.urgente).toBe(true)
  })

  it('sem votação aberta, as avaliações em falta vêm a seguir', () => {
    const e = estadoDaPelada({ proximoJogo: comEquipas, porVotar: [], faltamAvaliar: 2 })
    expect(e.tipo).toBe(ESTADO_PELADA.AVALIAR)
    expect(e.titulo).toContain('2 jogadores')
  })

  it('um jogador só não leva plural', () => {
    const e = estadoDaPelada({ faltamAvaliar: 1 })
    expect(e.titulo).toContain('1 jogador')
    expect(e.titulo).not.toContain('jogadores')
  })

  it('jogo com equipas publicadas é sorteio; sem equipas é só jogo marcado', () => {
    expect(estadoDaPelada({ proximoJogo: comEquipas }).tipo).toBe(ESTADO_PELADA.SORTEIO)
    expect(estadoDaPelada({ proximoJogo: semEquipas }).tipo).toBe(ESTADO_PELADA.AGENDADO)
  })

  it('sem nada por fazer nem jogo à frente, mostra o último resultado', () => {
    const e = estadoDaPelada({ latestMatch: resultado })
    expect(e.tipo).toBe(ESTADO_PELADA.RESULTADO)
    expect(e.matchId).toBe('r1')
  })

  // Uma rodada sem placar gravado não é notícia nenhuma.
  it('rodada sem placar não conta como resultado publicado', () => {
    expect(estadoDaPelada({ latestMatch: { id: 'x', score_a: null } }).tipo).toBe(
      ESTADO_PELADA.NADA
    )
  })

  it('pelada parada tem um estado próprio em vez de um ecrã vazio', () => {
    const e = estadoDaPelada({})
    expect(e.tipo).toBe(ESTADO_PELADA.NADA)
    expect(e.acao).toBeNull()
  })
})
