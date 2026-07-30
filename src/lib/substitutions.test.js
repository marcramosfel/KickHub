import { describe, it, expect } from 'vitest'
import {
  desistenciasDoJogo,
  forcasDaEscalacao,
  impactoDasDesistencias,
  nomeDaEquipa,
  resumoDeDesistencias,
  vantagem,
} from './substitutions.js'
import { avaliarEquilibrio } from './drawEngine.js'

const linha = (team, overall, extra = {}) => ({
  player_id: `${team}-${overall}-${extra.assigned_position || 'x'}`,
  team,
  assigned_position: extra.assigned_position || 'MID-C',
  overall_at_draw: overall,
  ...extra,
})

const troca = (extra = {}) => ({
  id: 's1',
  team: 'A',
  assigned_position: 'ST',
  is_goalkeeper: false,
  out_player_id: 'p1',
  out_name: 'Quem saiu',
  out_overall: 70,
  in_player_id: 'p2',
  in_name: 'Quem entrou',
  in_overall: 55,
  created_at: '2026-07-29T18:00:00Z',
  ...extra,
})

describe('forcasDaEscalacao', () => {
  it('soma os overalls congelados, equipa a equipa', () => {
    const lineup = [linha('A', 70), linha('B', 60), linha('A', 30, { assigned_position: 'ST' })]
    expect(forcasDaEscalacao(lineup)).toEqual({ A: 100, B: 60 })
  })

  it('ignora linhas sem equipa e overalls que não são números', () => {
    const lineup = [
      linha('A', 50),
      { team: 'C', overall_at_draw: 999 },
      linha('B', null),
      linha('B', 'abc', { assigned_position: 'ST' }),
    ]
    expect(forcasDaEscalacao(lineup)).toEqual({ A: 50, B: 0 })
  })

  it('aguenta uma escalação em falta', () => {
    expect(forcasDaEscalacao(null)).toEqual({ A: 0, B: 0 })
    expect(forcasDaEscalacao(undefined)).toEqual({ A: 0, B: 0 })
  })
})

describe('vantagem', () => {
  it('diz qual a equipa mais forte e usa os limiares do sorteio', () => {
    const v = vantagem(340, 300)
    expect(v.lado).toBe('A')
    expect(v.diff).toBe(40)
    expect(v.texto).toBe(`${nomeDaEquipa('A')} mais forte`)
    expect(v.nivel).toBe(avaliarEquilibrio(340, 300).balanceLevel)
    expect(v.equilibrado).toBe(false)
  })

  it('aponta para o outro lado quando é B a mais forte', () => {
    expect(vantagem(300, 340).lado).toBe('B')
  })

  it('sem diferença não há lado nenhum', () => {
    const v = vantagem(320, 320)
    expect(v.lado).toBe(null)
    expect(v.texto).toBe('Times iguais')
    expect(v.equilibrado).toBe(true)
  })

  // `Number(null)` é 0: sem este cuidado, "forças desconhecidas" viravam
  // "0,0% — Excelente", que foi exactamente o bug da 0016.
  it('não inventa equilíbrio quando não há forças', () => {
    for (const v of [vantagem(null, null), vantagem(undefined, 300), vantagem(0, 0)]) {
      expect(v.lado).toBe(null)
      expect(v.nivel).toBe('desconhecido')
      expect(v.rotulo).toBe('Por apurar')
    }
  })
})

describe('desistenciasDoJogo', () => {
  it('traduz as trocas e calcula o que cada uma mudou', () => {
    const [t] = desistenciasDoJogo({ substitutions: [troca()] })
    expect(t.saiNome).toBe('Quem saiu')
    expect(t.entraNome).toBe('Quem entrou')
    expect(t.equipa).toBe(nomeDaEquipa('A'))
    expect(t.delta).toBe(-15)
  })

  it('deixa o delta a null quando falta um overall (0 seria mentira)', () => {
    const [t] = desistenciasDoJogo({ substitutions: [troca({ in_overall: null })] })
    expect(t.delta).toBe(null)
  })

  it('descarta trocas sem equipa e jogos sem trocas nenhumas', () => {
    expect(desistenciasDoJogo({ substitutions: [troca({ team: 'Z' })] })).toEqual([])
    expect(desistenciasDoJogo({})).toEqual([])
    expect(desistenciasDoJogo(null)).toEqual([])
  })
})

describe('impactoDasDesistencias', () => {
  it('acumula o ganho e a perda de cada equipa', () => {
    const trocas = desistenciasDoJogo({
      substitutions: [
        troca({ id: 's1', team: 'A', out_overall: 70, in_overall: 55 }),
        troca({ id: 's2', team: 'B', out_overall: 50, in_overall: 62 }),
      ],
    })
    expect(impactoDasDesistencias(trocas)).toEqual({ A: -15, B: 12, incerto: false, total: 2 })
  })

  it('marca incerto quando alguma troca não tem números', () => {
    const trocas = desistenciasDoJogo({ substitutions: [troca({ out_overall: null })] })
    expect(impactoDasDesistencias(trocas).incerto).toBe(true)
    expect(impactoDasDesistencias(trocas).A).toBe(0)
  })
})

describe('trocas de equipa (swaps) no resumo', () => {
  const swap = (extra = {}) => ({
    id: 'w1',
    a_player_id: 'pa',
    a_name: 'Quem estava nos Pretos',
    a_team: 'A',
    a_position: 'ST',
    a_overall: 70,
    b_player_id: 'pb',
    b_name: 'Quem estava nos Brancos',
    b_team: 'B',
    b_position: 'MID-C',
    b_overall: 55,
    is_goalkeeper: false,
    created_at: '2026-07-30T10:00:00Z',
    ...extra,
  })

  it('entra na mesma lista das substituições, por ordem cronológica', () => {
    const trocas = desistenciasDoJogo({
      substitutions: [troca({ created_at: '2026-07-30T09:00:00Z' })],
      swaps: [swap()],
    })
    expect(trocas.map((t) => t.kind)).toEqual(['DESISTENCIA', 'SWAP'])
  })

  it('o delta de um swap conta nas DUAS equipas — o que uma ganha a outra perde', () => {
    const trocas = desistenciasDoJogo({ swaps: [swap()] })
    // saiu um 70 dos Pretos e entrou um 55: A perde 15, B ganha 15
    expect(trocas[0].delta).toBe(-15)
    expect(impactoDasDesistencias(trocas)).toEqual({ A: -15, B: 15, incerto: false, total: 1 })
  })

  it('sem overalls o delta fica incerto em vez de fingir zero', () => {
    const trocas = desistenciasDoJogo({ swaps: [swap({ b_overall: null })] })
    expect(trocas[0].delta).toBe(null)
    expect(impactoDasDesistencias(trocas).incerto).toBe(true)
  })

  it('um jogo só com swaps continua a ter aviso para os jogadores', () => {
    const r = resumoDeDesistencias({ swaps: [swap()], team_a_overall: 300, team_b_overall: 330 })
    expect(r.houve).toBe(true)
    expect(r.total).toBe(1)
    expect(r.vantagem.lado).toBe('B')
  })

  it('swaps sem equipa válida são descartados', () => {
    expect(desistenciasDoJogo({ swaps: [swap({ a_team: 'Z' })] })).toEqual([])
    expect(desistenciasDoJogo({ swaps: null })).toEqual([])
  })
})

describe('resumoDeDesistencias', () => {
  const jogo = {
    team_a_overall: 340,
    team_b_overall: 300,
    lineup: [linha('A', 340), linha('B', 300)],
    substitutions: [troca()],
  }

  it('junta trocas, impacto e vantagem', () => {
    const r = resumoDeDesistencias(jogo)
    expect(r.houve).toBe(true)
    expect(r.total).toBe(1)
    expect(r.impacto.A).toBe(-15)
    expect(r.vantagem.lado).toBe('A')
  })

  it('sem desistências não há nada a avisar', () => {
    const r = resumoDeDesistencias({ ...jogo, substitutions: [] })
    expect(r.houve).toBe(false)
    expect(r.trocas).toEqual([])
  })

  // Um jogo publicado antes da 0018 não tem forças gravadas; a escalação
  // ainda as tem, e vale mais somá-las do que mostrar dois zeros.
  it('cai na soma da escalação quando as forças não estão gravadas', () => {
    const r = resumoDeDesistencias({ lineup: [linha('A', 300), linha('B', 280)] })
    expect(r.vantagem.forcaA).toBe(300)
    expect(r.vantagem.lado).toBe('A')
  })
})
