import { describe, it, expect } from 'vitest'
import {
  FASES,
  acoesDoJogo,
  atividadeLegivel,
  faseDoJogo,
  jogosComResultadoPendente,
} from './lifecycle.js'

// Relógio fixo para os testes não dependerem da hora a que correm.
const AGORA = new Date('2026-07-30T12:00:00Z')
const ONTEM = '2026-07-29T18:00:00Z'
const AMANHA = '2026-07-31T18:00:00Z'

const jogo = (extra = {}) => ({ status: 'DRAFT', result_status: 'NONE', lineup: [], ...extra })

describe('faseDoJogo', () => {
  it('rascunho sem escalação', () => {
    expect(faseDoJogo(jogo(), AGORA)).toBe(FASES.RASCUNHO)
  })

  it('rascunho com escalação gravada = sorteio criado', () => {
    expect(faseDoJogo(jogo({ lineup: [{ player_id: 'x' }] }), AGORA)).toBe(FASES.SORTEIO_CRIADO)
  })

  it('publicado antes da hora = sorteio publicado', () => {
    expect(faseDoJogo(jogo({ status: 'PUBLISHED', kickoff_at: AMANHA }), AGORA)).toBe(
      FASES.SORTEIO_PUBLICADO
    )
  })

  it('publicado com a hora já passada = aguarda resultado', () => {
    expect(faseDoJogo(jogo({ status: 'PUBLISHED', kickoff_at: ONTEM }), AGORA)).toBe(
      FASES.AGUARDA_RESULTADO
    )
  })

  it('IN_PROGRESS aguarda resultado mesmo sem kickoff', () => {
    expect(faseDoJogo(jogo({ status: 'IN_PROGRESS' }), AGORA)).toBe(FASES.AGUARDA_RESULTADO)
  })

  // "não sei a hora" nunca pode virar "já passou"
  it('publicado sem kickoff não conta como atrasado', () => {
    expect(faseDoJogo(jogo({ status: 'PUBLISHED' }), AGORA)).toBe(FASES.SORTEIO_PUBLICADO)
    expect(faseDoJogo(jogo({ status: 'PUBLISHED', kickoff_at: 'data-invalida' }), AGORA)).toBe(
      FASES.SORTEIO_PUBLICADO
    )
  })

  it('o resultado manda sobre o resto', () => {
    expect(faseDoJogo(jogo({ status: 'PUBLISHED', result_status: 'DRAFT' }), AGORA)).toBe(
      FASES.RESULTADO_RASCUNHO
    )
    expect(faseDoJogo(jogo({ status: 'COMPLETED', result_status: 'PUBLISHED' }), AGORA)).toBe(
      FASES.RESULTADO_PUBLICADO
    )
  })

  // rodada de antes da 0019, ainda sem a coluna: história fechada
  it('COMPLETED sem result_status é resultado publicado', () => {
    expect(faseDoJogo({ status: 'COMPLETED', lineup: [] }, AGORA)).toBe(FASES.RESULTADO_PUBLICADO)
  })

  it('COMPLETED com resultado por publicar volta a ser um jogo aberto', () => {
    expect(faseDoJogo(jogo({ status: 'COMPLETED', result_status: 'NONE' }), AGORA)).toBe(
      FASES.AGUARDA_RESULTADO
    )
  })

  it('cancelado ganha a tudo', () => {
    expect(
      faseDoJogo(jogo({ status: 'CANCELLED', result_status: 'DRAFT', kickoff_at: ONTEM }), AGORA)
    ).toBe(FASES.CANCELADO)
  })

  it('sem jogo não há fase', () => {
    expect(faseDoJogo(null, AGORA)).toBe(null)
  })
})

describe('acoesDoJogo', () => {
  it('rascunho: agenda, sorteio e apagar; nada de resultado', () => {
    const a = acoesDoJogo(jogo(), AGORA)
    expect(a.sortear).toBe(true)
    expect(a.apagar).toBe(true)
    expect(a.preencherResultado).toBe(false)
    expect(a.publicarSorteio).toBe(false)
  })

  it('sorteio criado: pode publicar', () => {
    const a = acoesDoJogo(jogo({ lineup: [{ player_id: 'x' }] }), AGORA)
    expect(a.publicarSorteio).toBe(true)
    expect(a.apagar).toBe(true)
  })

  it('sorteio publicado: substituir e preencher, mas não apagar', () => {
    const a = acoesDoJogo(jogo({ status: 'PUBLISHED', kickoff_at: AMANHA }), AGORA)
    expect(a.substituir).toBe(true)
    expect(a.preencherResultado).toBe(true)
    expect(a.apagar).toBe(false)
    expect(a.cancelar).toBe(true)
  })

  it('resultado em rascunho: publicar resultado disponível', () => {
    const a = acoesDoJogo(jogo({ status: 'PUBLISHED', result_status: 'DRAFT' }), AGORA)
    expect(a.publicarResultado).toBe(true)
    expect(a.cancelar).toBe(true)
  })

  it('resultado publicado: editar sim, cancelar não', () => {
    const a = acoesDoJogo(jogo({ status: 'COMPLETED', result_status: 'PUBLISHED' }), AGORA)
    expect(a.preencherResultado).toBe(true) // editar é o mesmo formulário
    expect(a.cancelar).toBe(false)
    expect(a.apagar).toBe(false)
  })

  it('cancelado: só se pode apagar', () => {
    const a = acoesDoJogo(jogo({ status: 'CANCELLED' }), AGORA)
    expect(a.apagar).toBe(true)
    expect(a.cancelar).toBe(false)
    expect(a.preencherResultado).toBe(false)
    expect(a.substituir).toBe(false)
  })
})

describe('jogosComResultadoPendente', () => {
  it('apanha os atrasados e os rascunhos de resultado, mais nada', () => {
    const lista = [
      jogo({ id: 1, status: 'PUBLISHED', kickoff_at: ONTEM }), // atrasado
      jogo({ id: 2, status: 'PUBLISHED', kickoff_at: AMANHA }), // ainda vai acontecer
      jogo({ id: 3, status: 'PUBLISHED', result_status: 'DRAFT' }), // rascunho
      jogo({ id: 4, status: 'COMPLETED', result_status: 'PUBLISHED' }), // fechado
      jogo({ id: 5, status: 'CANCELLED', kickoff_at: ONTEM }), // cancelado
    ]
    expect(jogosComResultadoPendente(lista, AGORA).map((j) => j.id)).toEqual([1, 3])
  })

  it('lista vazia ou nula não rebenta', () => {
    expect(jogosComResultadoPendente(null, AGORA)).toEqual([])
    expect(jogosComResultadoPendente([], AGORA)).toEqual([])
  })
})

describe('atividadeLegivel', () => {
  it('traduz uma ação conhecida', () => {
    const a = atividadeLegivel({ action: 'RESULTADO_PUBLICADO', created_at: ONTEM })
    expect(a.texto).toBe('Resultado publicado')
    expect(a.quando).toBe(ONTEM)
  })

  it('uma ação desconhecida não desaparece — mostra o código cru', () => {
    expect(atividadeLegivel({ action: 'ACAO_NOVA' }).texto).toBe('ACAO_NOVA')
  })
})
