import { describe, it, expect } from 'vitest'
import { selecaoDaPelada, selecoesDaPelada } from './selecao.js'

const j = (id, pos, overall, extra = {}) => ({
  id,
  name: id,
  primaryPosition: pos,
  playerType: pos === 'GK' ? 'GOALKEEPER' : 'FIELD',
  overall,
  gkOverall: pos === 'GK' ? overall : null,
  provisorio: false,
  acceptsOther: true,
  ...extra,
})

// Dois candidatos por lugar do 2-3-1, mais dois goleiros.
const plantel = [
  j('gk-bom', 'GK', 90),
  j('gk-mau', 'GK', 40),
  j('def-l-bom', 'DEF-L', 88),
  j('def-l-mau', 'DEF-L', 41),
  j('def-r-bom', 'DEF-R', 87),
  j('def-r-mau', 'DEF-R', 42),
  j('mid-l-bom', 'MID-L', 86),
  j('mid-l-mau', 'MID-L', 43),
  j('mid-c-bom', 'MID-C', 85),
  j('mid-c-mau', 'MID-C', 44),
  j('mid-r-bom', 'MID-R', 84),
  j('mid-r-mau', 'MID-R', 45),
  j('st-bom', 'ST', 83),
  j('st-mau', 'ST', 46),
]

describe('selecaoDaPelada', () => {
  it('monta um onze completo, um por lugar', () => {
    const s = selecaoDaPelada({ jogadores: plantel })
    expect(s.completa).toBe(true)
    expect(s.lineup).toHaveLength(7)
    expect(new Set(s.lineup.map((x) => x.slot)).size).toBe(7)
  })

  it('a melhor seleção leva o melhor de cada posição', () => {
    const s = selecaoDaPelada({ jogadores: plantel, melhor: true })
    expect(s.lineup.every((x) => x.id.endsWith('-bom'))).toBe(true)
  })

  it('a anti-seleção leva o pior de cada posição', () => {
    const s = selecaoDaPelada({ jogadores: plantel, melhor: false })
    expect(s.lineup.every((x) => x.id.endsWith('-mau'))).toBe(true)
  })

  it('ninguém joga em dois lugares ao mesmo tempo', () => {
    const s = selecaoDaPelada({ jogadores: plantel })
    const ids = s.lineup.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // A regra que impede "o melhor time" de ser seis atacantes.
  it('é por posição e não os sete melhores overalls', () => {
    const enviesado = [
      j('gk', 'GK', 50),
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((x, i) => j(`ata-${x}`, 'ST', 99 - i)),
      j('zag', 'DEF-L', 30),
      j('zag2', 'DEF-R', 30),
      j('m1', 'MID-L', 30),
      j('m2', 'MID-C', 30),
      j('m3', 'MID-R', 30),
    ]
    const s = selecaoDaPelada({ jogadores: enviesado, melhor: true })
    // um só atacante, apesar de os seis melhores overalls serem todos ATA
    expect(s.lineup.filter((x) => x.slot === 'ST')).toHaveLength(1)
    expect(s.completa).toBe(true)
  })

  // Castigar um jogador novo por ter overall provisório não tem piada.
  it('quem tem overall provisório fica de fora das duas', () => {
    const comNovato = [...plantel, j('novato', 'ST', 5, { provisorio: true })]
    const { melhor, pior } = selecoesDaPelada({ jogadores: comNovato })
    expect(melhor.lineup.some((x) => x.id === 'novato')).toBe(false)
    expect(pior.lineup.some((x) => x.id === 'novato')).toBe(false)
  })

  it('quem não tem overall nenhum também fica de fora', () => {
    const s = selecaoDaPelada({ jogadores: [...plantel, j('sem', 'ST', null)], melhor: false })
    expect(s.lineup.some((x) => x.id === 'sem')).toBe(false)
  })

  it('sem gente que chegue, diz que está incompleta em vez de inventar', () => {
    const s = selecaoDaPelada({ jogadores: [j('gk', 'GK', 70), j('a', 'ST', 60)] })
    expect(s.completa).toBe(false)
    expect(s.lineup.length).toBeLessThan(7)
  })

  it('plantel vazio não rebenta', () => {
    const s = selecaoDaPelada({ jogadores: [] })
    expect(s.lineup).toEqual([])
    expect(s.completa).toBe(false)
    expect(s.media).toBeNull()
  })

  it('a melhor seleção é mais forte do que a pior', () => {
    const { melhor, pior } = selecoesDaPelada({ jogadores: plantel })
    expect(melhor.forca).toBeGreaterThan(pior.forca)
  })

  it('o goleiro escolhe-se pela escala dele, não pela dos jogadores de campo', () => {
    const { melhor, pior } = selecoesDaPelada({ jogadores: plantel })
    expect(melhor.lineup.find((x) => x.slot === 'GK').id).toBe('gk-bom')
    expect(pior.lineup.find((x) => x.slot === 'GK').id).toBe('gk-mau')
  })
})
