import { describe, it, expect } from 'vitest'
import {
  contextoDoJogo,
  forcaDaEquipa,
  golosEsperados,
  probabilidades,
  simularPartida,
} from './simulador.js'

const SLOTS = ['GK', 'DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST']

// Uma equipa de sete, toda com o mesmo overall salvo o que se mandar mudar.
const equipa = (prefixo, overall, extra = {}) =>
  SLOTS.map((slot) => ({
    id: `${prefixo}-${slot}`,
    name: `${prefixo} ${slot}`,
    slot,
    overall,
    gkOverall: slot === 'GK' ? overall : null,
    matches: 10,
    goals: slot === 'GK' ? 0 : 5,
    assists: slot === 'GK' ? 0 : 3,
    wins: 5,
    craques: 1,
    bagres: 1,
    goalsConcededPerMatch: slot === 'GK' ? 8 : null,
    savePct: slot === 'GK' ? 50 : null,
    ...(extra[slot] || {}),
  }))

// Corre N sementes e conta quem ganhou.
function correr(a, b, n = 300) {
  let vitA = 0
  let vitB = 0
  let empates = 0
  for (let i = 0; i < n; i++) {
    const r = simularPartida({ equipaA: a, equipaB: b, seed: `t-${i}` })
    if (r.golosA > r.golosB) vitA++
    else if (r.golosB > r.golosA) vitB++
    else empates++
  }
  return { vitA, vitB, empates, n }
}

describe('simulador — reprodutibilidade', () => {
  it('a mesma semente dá exatamente o mesmo jogo', () => {
    const a = equipa('A', 80)
    const b = equipa('B', 75)
    const x = simularPartida({ equipaA: a, equipaB: b, seed: 'jogo-1' })
    const y = simularPartida({ equipaA: a, equipaB: b, seed: 'jogo-1' })
    expect(y.golosA).toBe(x.golosA)
    expect(y.golosB).toBe(x.golosB)
    expect(y.craque?.id).toBe(x.craque?.id)
    expect(y.narrativa).toBe(x.narrativa)
    expect(y.marcadores).toEqual(x.marcadores)
  })

  it('sementes diferentes dão jogos diferentes', () => {
    const a = equipa('A', 80)
    const b = equipa('B', 80)
    const placares = new Set()
    for (let i = 0; i < 40; i++) {
      const r = simularPartida({ equipaA: a, equipaB: b, seed: `s-${i}` })
      placares.add(`${r.golosA}-${r.golosB}`)
    }
    // Se o motor fosse determinístico por equipa, isto era 1.
    expect(placares.size).toBeGreaterThan(5)
  })

  it('as probabilidades não dependem da semente', () => {
    const a = equipa('A', 82)
    const b = equipa('B', 74)
    const p1 = simularPartida({ equipaA: a, equipaB: b, seed: 'x' }).probabilidades
    const p2 = simularPartida({ equipaA: a, equipaB: b, seed: 'y' }).probabilidades
    expect(p2).toEqual(p1)
  })
})

describe('simulador — probabilidades', () => {
  it('somam 1', () => {
    const p = probabilidades(8, 6)
    expect(p.a + p.empate + p.b).toBeCloseTo(1, 6)
  })

  it('equipas iguais dão probabilidades iguais', () => {
    const f = forcaDaEquipa(equipa('A', 80))
    const l = golosEsperados(f, f)
    const p = probabilidades(l.a, l.b)
    expect(p.a).toBeCloseTo(p.b, 10)
  })

  it('a equipa mais forte é favorita', () => {
    const forte = forcaDaEquipa(equipa('A', 90))
    const fraca = forcaDaEquipa(equipa('B', 60))
    const l = golosEsperados(forte, fraca)
    const p = probabilidades(l.a, l.b)
    expect(p.a).toBeGreaterThan(p.b)
  })

  it('quanto maior a diferença, maior a probabilidade do favorito', () => {
    const base = forcaDaEquipa(equipa('A', 85))
    const probs = [80, 70, 60, 50].map((ov) => {
      const l = golosEsperados(base, forcaDaEquipa(equipa('B', ov)))
      return probabilidades(l.a, l.b).a
    })
    // monótona crescente: 85vs80 < 85vs70 < 85vs60 < 85vs50
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeGreaterThan(probs[i - 1])
    }
  })
})

describe('simulador — o melhor não ganha sempre', () => {
  it('em equipas equilibradas os dois lados ganham', () => {
    const { vitA, vitB } = correr(equipa('A', 80), equipa('B', 80))
    expect(vitA).toBeGreaterThan(20)
    expect(vitB).toBeGreaterThan(20)
  })

  it('o favorito claro ganha a maioria — mas não tudo', () => {
    const { vitA, n } = correr(equipa('A', 92), equipa('B', 62))
    expect(vitA / n).toBeGreaterThan(0.6)
    // A zebra tem de existir: um jogo que o favorito ganha 100% das vezes
    // não é um jogo, é uma conta.
    expect(vitA / n).toBeLessThan(0.99)
  })

  it('quanto mais equilibrado, mais imprevisível', () => {
    const equilibrado = correr(equipa('A', 80), equipa('B', 79))
    const desnivelado = correr(equipa('A', 92), equipa('B', 62))
    const dominio = (r) => Math.max(r.vitA, r.vitB) / r.n
    expect(dominio(equilibrado)).toBeLessThan(dominio(desnivelado))
  })
})

describe('simulador — atribuição de golos', () => {
  const r = simularPartida({ equipaA: equipa('A', 80), equipaB: equipa('B', 78), seed: 'g' })

  it('os golos atribuídos somam o placar', () => {
    const soma = (l) => l.reduce((s, x) => s + x.total, 0)
    expect(soma(r.marcadores.a)).toBe(r.golosA)
    expect(soma(r.marcadores.b)).toBe(r.golosB)
  })

  it('o goleiro não marca', () => {
    const ids = [...r.marcadores.a, ...r.marcadores.b].map((x) => x.id)
    expect(ids.some((id) => id.endsWith('-GK'))).toBe(false)
  })

  it('cada equipa só marca com gente dela', () => {
    expect(r.marcadores.a.every((x) => x.id.startsWith('A-'))).toBe(true)
    expect(r.marcadores.b.every((x) => x.id.startsWith('B-'))).toBe(true)
  })

  it('há menos assistências do que golos', () => {
    const soma = (l) => l.reduce((s, x) => s + x.total, 0)
    expect(soma(r.assistencias.a)).toBeLessThanOrEqual(r.golosA)
  })
})

describe('simulador — craque e bagre', () => {
  it('escolhe um craque e um bagre', () => {
    const r = simularPartida({ equipaA: equipa('A', 80), equipaB: equipa('B', 70), seed: 'cb' })
    expect(r.craque).toBeTruthy()
    expect(r.bagre).toBeTruthy()
    expect(r.craque.id).not.toBe(r.bagre.id)
  })

  it('o bagre nunca é o goleiro', () => {
    // Levar golos numa pelada é do jogo; a piada deixava de ter graça para
    // quem se ofereceu para ir para a baliza.
    for (let i = 0; i < 60; i++) {
      const r = simularPartida({
        equipaA: equipa('A', 80),
        equipaB: equipa('B', 55),
        seed: `bg-${i}`,
      })
      expect(r.bagre.slot).not.toBe('GK')
    }
  })
})

describe('simulador — o histórico ajusta, não manda', () => {
  it('poucos jogos com muitos golos não viram o jogo', () => {
    // B é claramente pior de overall, mas tem um jogador com 1 jogo e 5 golos.
    const a = equipa('A', 85)
    const b = equipa('B', 62, { ST: { matches: 1, goals: 5, assists: 3 } })
    const fa = forcaDaEquipa(a, contextoDoJogo(a, b))
    const fb = forcaDaEquipa(b, contextoDoJogo(a, b))
    expect(fa.ataque).toBeGreaterThan(fb.ataque)
  })

  it('o ajuste de histórico não passa de ±12% do overall', () => {
    const semHistorico = equipa('A', 80, {
      ST: { matches: 0, goals: 0, assists: 0, craques: 0, bagres: 0 },
    })
    const monstro = equipa('A', 80, {
      ST: { matches: 50, goals: 200, assists: 100, craques: 50, bagres: 0 },
    })
    const ctx = contextoDoJogo(semHistorico, monstro)
    const f1 = forcaDaEquipa(semHistorico, ctx)
    const f2 = forcaDaEquipa(monstro, ctx)
    // O ataque não pode disparar: mesmo overall, histórico absurdo.
    expect(f2.ataque / f1.ataque).toBeLessThan(1.2)
  })
})

describe('simulador — força das equipas', () => {
  it('o atacante pesa mais no ataque do que o defesa', () => {
    const comAtacante = equipa('A', 60, { ST: { overall: 95 } })
    const comDefesa = equipa('A', 60, { 'DEF-L': { overall: 95 } })
    const ctx = contextoDoJogo(comAtacante, comDefesa)
    expect(forcaDaEquipa(comAtacante, ctx).ataque).toBeGreaterThan(
      forcaDaEquipa(comDefesa, ctx).ataque
    )
  })

  it('um bom goleiro melhora a defesa', () => {
    const bom = equipa('A', 70, { GK: { overall: 95, gkOverall: 95 } })
    const mau = equipa('A', 70, { GK: { overall: 40, gkOverall: 40 } })
    const ctx = contextoDoJogo(bom, mau)
    expect(forcaDaEquipa(bom, ctx).defesa).toBeGreaterThan(forcaDaEquipa(mau, ctx).defesa)
  })
})

describe('simulador — dados em falta', () => {
  it('aguenta uma equipa sem goleiro', () => {
    const semGk = equipa('A', 80).filter((j) => j.slot !== 'GK')
    const r = simularPartida({ equipaA: semGk, equipaB: equipa('B', 80), seed: 'x' })
    expect(Number.isFinite(r.golosA)).toBe(true)
    expect(Number.isFinite(r.golosB)).toBe(true)
  })

  it('aguenta jogadores sem overall nem estatísticas', () => {
    const crus = SLOTS.map((slot) => ({ id: `c-${slot}`, name: slot, slot }))
    const r = simularPartida({ equipaA: crus, equipaB: equipa('B', 80), seed: 'x' })
    expect(Number.isFinite(r.golosA)).toBe(true)
    expect(r.probabilidades.a + r.probabilidades.empate + r.probabilidades.b).toBeCloseTo(1, 6)
  })

  it('aguenta equipas vazias sem rebentar', () => {
    const r = simularPartida({ equipaA: [], equipaB: [], seed: 'x' })
    expect(Number.isFinite(r.golosA)).toBe(true)
    expect(r.craque).toBeNull()
  })
})
