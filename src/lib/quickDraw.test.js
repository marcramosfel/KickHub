import { describe, it, expect } from 'vitest'
import { escalarEquipasFixas, sorteioRapido, trocarNoRapido } from './drawEngine.js'
import { previewReplace, previewSwap } from './substitutions.js'

const jogador = (id, overall) => ({ id, name: `J${id}`, overall })
const lista = (overalls) => overalls.map((o, i) => jogador(`p${i}`, o))

describe('sorteioRapido — validação', () => {
  it('recusa menos de 2 equipas e jogadores a menos', () => {
    expect(() => sorteioRapido({ jogadores: lista([50, 50]), nEquipas: 1 })).toThrow('EQUIPAS')
    expect(() => sorteioRapido({ jogadores: lista([50, 50]), nEquipas: 3 })).toThrow('CAMPO')
  })
  it('recusa duplicados e jogadores sem id', () => {
    const dup = [jogador('x', 50), jogador('x', 60)]
    expect(() => sorteioRapido({ jogadores: dup, nEquipas: 2 })).toThrow('DUPLICADO')
    expect(() => sorteioRapido({ jogadores: [{ name: 'S' }, jogador('y', 50)], nEquipas: 2 })).toThrow('SEMJOGADOR')
  })
})

describe('sorteioRapido — tamanhos e completude', () => {
  it('divide 7 jogadores por 2 equipas em 4+3 (por alguma ordem)', () => {
    const r = sorteioRapido({ jogadores: lista([70, 65, 60, 55, 50, 45, 40]), nEquipas: 2, seed: 's' })
    const tamanhos = r.equipas.map((e) => e.jogadores.length).sort()
    expect(tamanhos).toEqual([3, 4])
  })
  it('todos jogam exatamente uma vez, com 3 equipas', () => {
    const jogadores = lista([70, 65, 60, 55, 50, 45, 40, 35, 30, 25])
    const r = sorteioRapido({ jogadores, nEquipas: 3, seed: 's' })
    const ids = r.equipas.flatMap((e) => e.jogadores.map((j) => j.id)).sort()
    expect(ids).toEqual(jogadores.map((j) => j.id).sort())
    expect(r.equipas.map((e) => e.jogadores.length).sort()).toEqual([3, 3, 4])
  })
  it('o extra não cai sempre na primeira equipa', () => {
    const jogadores = lista([70, 65, 60, 55, 50])
    const primeiras = new Set()
    for (let t = 0; t < 12; t++) {
      const r = sorteioRapido({ jogadores, nEquipas: 2, seed: `s${t}` })
      primeiras.add(r.equipas.findIndex((e) => e.jogadores.length === 3))
    }
    expect(primeiras.size).toBeGreaterThan(1)
  })
})

describe('sorteioRapido — equilíbrio e reprodutibilidade', () => {
  const desnivelados = lista([90, 88, 85, 40, 38, 35, 82, 42, 80, 45])

  it('a mesma semente dá o mesmo sorteio; sementes diferentes podem variar', () => {
    const a = sorteioRapido({ jogadores: desnivelados, nEquipas: 2, seed: 'x' })
    const b = sorteioRapido({ jogadores: desnivelados, nEquipas: 2, seed: 'x' })
    expect(a.equipas.map((e) => e.jogadores.map((j) => j.id))).toEqual(
      b.equipas.map((e) => e.jogadores.map((j) => j.id))
    )
  })

  it('equilibrado atinge o ótimo real (força bruta) neste input torto', () => {
    // o ótimo de uma divisão 5/5 destes valores é 15 — confirmado por força
    // bruta, não por palpite (o primeiro palpite deste teste dizia 5 e estava
    // errado; o motor estava certo)
    const valores = desnivelados.map((j) => j.overall)
    const total = valores.reduce((s, v) => s + v, 0)
    let otimo = Infinity
    for (let mask = 0; mask < 1 << valores.length; mask++) {
      let bits = 0
      let soma = 0
      for (let i = 0; i < valores.length; i++) {
        if (mask & (1 << i)) {
          bits++
          soma += valores[i]
        }
      }
      if (bits === valores.length / 2) otimo = Math.min(otimo, Math.abs(total - 2 * soma))
    }
    for (let t = 0; t < 8; t++) {
      const r = sorteioRapido({ jogadores: desnivelados, nEquipas: 2, seed: `t${t}` })
      expect(r.diff).toBe(otimo)
    }
  })

  it('aleatório respeita tamanhos mas não promete equilíbrio', () => {
    const r = sorteioRapido({ jogadores: desnivelados, nEquipas: 2, modo: 'aleatorio', seed: 'x' })
    expect(r.equipas.map((e) => e.jogadores.length).sort()).toEqual([5, 5])
    expect(r.modo).toBe('aleatorio')
  })

  it('quem não tem overall entra com o neutro e fica assinalado', () => {
    const r = sorteioRapido({
      jogadores: [jogador('a', 70), jogador('b', 60), { id: 'c', name: 'Sem Nota' }, jogador('d', 50)],
      nEquipas: 2,
      seed: 's',
    })
    expect(r.semOverall).toHaveLength(1)
    expect(r.semOverall[0].playerId).toBe('c')
  })
})

describe('trocarNoRapido', () => {
  it('troca dois jogadores de equipas diferentes e recalcula as forças', () => {
    const r = sorteioRapido({ jogadores: lista([70, 60, 50, 40]), nEquipas: 2, seed: 's' })
    const a = r.equipas[0].jogadores[0]
    const b = r.equipas[1].jogadores[0]
    const depois = trocarNoRapido(r, a.id, b.id)
    expect(depois.equipas[0].jogadores.some((j) => j.id === b.id)).toBe(true)
    expect(depois.equipas[1].jogadores.some((j) => j.id === a.id)).toBe(true)
    const soma = (e) => e.jogadores.reduce((s, j) => s + j.overall, 0)
    expect(depois.equipas[0].strength).toBe(soma(depois.equipas[0]))
  })
  it('mesma equipa não faz nada; id desconhecido rebenta com código', () => {
    const r = sorteioRapido({ jogadores: lista([70, 60, 50, 40]), nEquipas: 2, seed: 's' })
    const [j1, j2] = r.equipas[0].jogadores
    expect(trocarNoRapido(r, j1.id, j2?.id ?? j1.id)).toBe(r)
    expect(() => trocarNoRapido(r, j1.id, 'fantasma')).toThrow('SEMJOGADOR')
  })
})

describe('escalarEquipasFixas — o rachão que sobe a jogo oficial', () => {
  // uma equipa de 7 com posições declaradas
  const equipa = (prefixo, posicoes, overalls) =>
    posicoes.map((pos, i) => ({
      id: `${prefixo}${i}`,
      name: `${prefixo.toUpperCase()}${i}`,
      overall: overalls[i],
      primaryPosition: pos,
    }))

  const SEIS = ['DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST']
  const comGk = (p, ov) => equipa(p, ['GK', ...SEIS], ov)

  it('não mexe na composição das equipas — cada jogador fica no seu lado', () => {
    const A = comGk('a', [60, 70, 68, 66, 64, 62, 72])
    const B = comGk('b', [58, 71, 69, 67, 65, 63, 73])
    const r = escalarEquipasFixas({ equipas: [A, B], seed: 's' })
    const idsA = r.teamA.jogadores.map((j) => j.id).sort()
    const idsB = r.teamB.jogadores.map((j) => j.id).sort()
    expect(idsA).toEqual(A.map((j) => j.id).sort())
    expect(idsB).toEqual(B.map((j) => j.id).sort())
  })

  it('quem está registado como goleiro vai à baliza', () => {
    const A = comGk('a', [60, 70, 68, 66, 64, 62, 72])
    const B = comGk('b', [58, 71, 69, 67, 65, 63, 73])
    const r = escalarEquipasFixas({ equipas: [A, B], seed: 's' })
    expect(r.teamA.goalkeeper.id).toBe('a0')
    expect(r.teamB.goalkeeper.id).toBe('b0')
  })

  it('sem goleiro declarado (o caso do rachão) sai um à sorte, e varia com a semente', () => {
    const semGk = (p) => equipa(p, SEIS.concat('ST'), [70, 68, 66, 64, 62, 60, 58])
    const escolhidos = new Set()
    for (let t = 0; t < 10; t++) {
      const r = escalarEquipasFixas({ equipas: [semGk('a'), semGk('b')], seed: `s${t}` })
      expect(r.teamA.goalkeeper.id).toBeTruthy()
      escolhidos.add(r.teamA.goalkeeper.id)
    }
    expect(escolhidos.size).toBeGreaterThan(1)
  })

  it('os melhores ficam na sua posição; quem sobra ocupa o resto', () => {
    // 3 craques com posições distintas + 3 fracos todos atacantes: os craques
    // têm de ficar nas suas, os fracos é que se desenrascam
    const A = [
      { id: 'gk', name: 'Gol', overall: 55, primaryPosition: 'GK' },
      { id: 'craque1', name: 'Craque1', overall: 90, primaryPosition: 'DEF-L' },
      { id: 'craque2', name: 'Craque2', overall: 88, primaryPosition: 'MID-C' },
      { id: 'craque3', name: 'Craque3', overall: 86, primaryPosition: 'ST' },
      { id: 'fraco1', name: 'Fraco1', overall: 40, primaryPosition: 'ST' },
      { id: 'fraco2', name: 'Fraco2', overall: 38, primaryPosition: 'ST' },
      { id: 'fraco3', name: 'Fraco3', overall: 36, primaryPosition: 'ST' },
    ]
    const B = comGk('b', [58, 71, 69, 67, 65, 63, 73])
    const r = escalarEquipasFixas({ equipas: [A, B], seed: 's' })
    const slotDe = (id) =>
      Object.entries(r.teamA.slots).find(([, j]) => j.id === id)?.[0] ?? null
    expect(slotDe('craque1')).toBe('DEF-L')
    expect(slotDe('craque2')).toBe('MID-C')
    expect(slotDe('craque3')).toBe('ST') // o melhor dos atacantes fica com o ST
    // os fracos ficaram algures nos lugares que sobraram
    expect(['DEF-R', 'MID-L', 'MID-R']).toContain(slotDe('fraco1'))
  })

  it('a mesma semente dá a mesma escalação', () => {
    const args = { equipas: [comGk('a', [60, 70, 68, 66, 64, 62, 72]), comGk('b', [58, 71, 69, 67, 65, 63, 73])], seed: 'x' }
    const um = escalarEquipasFixas(args)
    const dois = escalarEquipasFixas(args)
    expect(um.teamA.jogadores.map((j) => `${j.id}:${j.assignedPosition}`)).toEqual(
      dois.teamA.jogadores.map((j) => `${j.id}:${j.assignedPosition}`)
    )
  })

  it('devolve as forças e o equilíbrio, como o sorteio normal', () => {
    const A = comGk('a', [60, 70, 68, 66, 64, 62, 72])
    const B = comGk('b', [58, 71, 69, 67, 65, 63, 73])
    const r = escalarEquipasFixas({ equipas: [A, B], seed: 's' })
    expect(r.teamA.strength).toBe(A.reduce((s, j) => s + j.overall, 0))
    expect(r.diff).toBe(Math.abs(r.teamA.strength - r.teamB.strength))
    expect(r.balanceLevel).toBeTruthy()
  })

  it('recusa equipas com o tamanho errado ou jogadores repetidos', () => {
    const A = comGk('a', [60, 70, 68, 66, 64, 62, 72])
    const B = comGk('b', [58, 71, 69, 67, 65, 63, 73])
    expect(() => escalarEquipasFixas({ equipas: [A] })).toThrow('EQUIPAS')
    expect(() => escalarEquipasFixas({ equipas: [A, B.slice(0, 6)] })).toThrow('CAMPO')
    expect(() => escalarEquipasFixas({ equipas: [A, A] })).toThrow('DUPLICADO')
  })
})

describe('previewSwap / previewReplace', () => {
  const lineup = [
    { player_id: 'gA', name: 'Gol A', team: 'A', assigned_position: 'GK', is_goalkeeper: true, overall_at_draw: 60 },
    { player_id: 'a1', name: 'Forte', team: 'A', assigned_position: 'ST', is_goalkeeper: false, overall_at_draw: 80 },
    { player_id: 'gB', name: 'Gol B', team: 'B', assigned_position: 'GK', is_goalkeeper: true, overall_at_draw: 58 },
    { player_id: 'b1', name: 'Fraco', team: 'B', assigned_position: 'ST', is_goalkeeper: false, overall_at_draw: 40 },
  ]
  const jogo = { lineup, team_a_overall: 140, team_b_overall: 98 }

  it('mostra o antes e o depois de uma troca entre equipas', () => {
    const p = previewSwap(jogo, 'a1', 'b1')
    expect(p.valido).toBe(true)
    expect(p.antes.lado).toBe('A') // 140 vs 98
    expect(p.depois.lado).toBe('B') // 100 vs 138
    expect(p.a.para).toBe('B')
    expect(p.b.posicao).toBe('ST')
  })
  it('recusa mesma equipa e goleiro com jogador de linha', () => {
    expect(previewSwap(jogo, 'gA', 'a1').valido).toBe(false)
    expect(previewSwap(jogo, 'gA', 'b1').valido).toBe(false)
    expect(previewSwap(jogo, 'gA', 'gB').valido).toBe(true)
  })
  it('substituição por alguém de fora mexe só na equipa de quem sai', () => {
    const p = previewReplace(jogo, 'a1', 30) // o 80 vira 30
    expect(p.antes.forcaA).toBe(140)
    expect(p.depois.forcaA).toBe(90)
    expect(p.depois.forcaB).toBe(98)
  })
  it('ids fora da escalação devolvem null', () => {
    expect(previewSwap(jogo, 'zz', 'b1')).toBe(null)
    expect(previewReplace(jogo, 'zz', 50)).toBe(null)
  })
})
