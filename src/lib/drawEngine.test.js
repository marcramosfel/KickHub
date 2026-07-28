import { describe, it, expect } from 'vitest'
import { FIELD_SLOTS, POSITION_IDS, PENALIZACAO, penalizacaoDe } from './positions.js'
import { criarRandom } from './seed.js'
import {
  sortearEquipas,
  trocarJogadores,
  moverParaSlot,
  avaliarEquilibrio,
  paraLinhasDeEscalacao,
  OVERALL_NEUTRO,
} from './drawEngine.js'

// ---------------------------------------------------------------- ajudas

const jogador = (id, overall, primary = null, extra = {}) => ({
  id,
  name: `Jogador ${id}`,
  photo: null,
  overall,
  primaryPosition: primary,
  secondaryPosition: null,
  acceptsOther: true,
  ...extra,
})

const goleiros = (o1 = 70, o2 = 70) => [jogador('gk1', o1, 'GK'), jogador('gk2', o2, 'GK')]

// 12 jogadores cujas posições principais cobrem exactamente os 6 lugares × 2
const campoCoberto = (overallDe = () => 70) =>
  Array.from({ length: 12 }, (_, i) => jogador(`p${i}`, overallDe(i), FIELD_SLOTS[i % 6]))

const equipas = (r) => [r.teamA, r.teamB]

const todosOsIds = (r) => equipas(r).flatMap((e) => e.jogadores.map((j) => j.id))

const assinatura = (r) =>
  equipas(r)
    .map((e) => `${e.goalkeeper.id}|${FIELD_SLOTS.map((s) => `${s}=${e.slots[s].id}`).join(',')}`)
    .join(' || ')

const penalizacaoDaEquipa = (equipa) =>
  FIELD_SLOTS.reduce((s, slot) => s + penalizacaoDe(equipa.slots[slot], slot), 0)

// todas as permutações de uma lista (usado para confirmar a atribuição óptima)
function permutacoes(lista) {
  if (lista.length <= 1) return [lista]
  const out = []
  for (let i = 0; i < lista.length; i++) {
    const resto = [...lista.slice(0, i), ...lista.slice(i + 1)]
    for (const p of permutacoes(resto)) out.push([lista[i], ...p])
  }
  return out
}

const apanhar = (fn) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  return null
}

// ---------------------------------------------------------------- estrutura

describe('sortearEquipas — estrutura', () => {
  const resultado = sortearEquipas({
    goalkeepers: goleiros(72, 68),
    fieldPlayers: campoCoberto((i) => 60 + i),
    seed: 'jogo-1',
  })

  it('põe 7 jogadores em cada equipa, um deles goleiro', () => {
    for (const equipa of equipas(resultado)) {
      expect(equipa.jogadores).toHaveLength(7)
      expect(equipa.goalkeeper.isGoalkeeper).toBe(true)
      expect(equipa.jogadores.filter((j) => j.isGoalkeeper)).toHaveLength(1)
    }
    expect([resultado.teamA.goalkeeper.id, resultado.teamB.goalkeeper.id].sort()).toEqual([
      'gk1',
      'gk2',
    ])
  })

  it('preenche os 6 lugares de cada equipa sem repetir jogadores', () => {
    for (const equipa of equipas(resultado)) {
      expect(Object.keys(equipa.slots).sort()).toEqual([...FIELD_SLOTS].sort())
      const ids = FIELD_SLOTS.map((slot) => equipa.slots[slot].id)
      expect(new Set(ids).size).toBe(6)
      for (const slot of FIELD_SLOTS) expect(equipa.slots[slot].assignedPosition).toBe(slot)
    }
  })

  it('usa os 14 jogadores exactamente uma vez', () => {
    const ids = todosOsIds(resultado)
    expect(ids).toHaveLength(14)
    expect(new Set(ids).size).toBe(14)
    const esperados = ['gk1', 'gk2', ...Array.from({ length: 12 }, (_, i) => `p${i}`)]
    expect([...ids].sort()).toEqual(esperados.sort())
  })

  it('calcula força e média como soma dos 7 overalls', () => {
    for (const equipa of equipas(resultado)) {
      const soma = equipa.jogadores.reduce((s, j) => s + j.overall, 0)
      expect(equipa.strength).toBe(soma)
      expect(equipa.avg).toBeCloseTo(soma / 7, 10)
    }
    expect(resultado.diff).toBe(Math.abs(resultado.teamA.strength - resultado.teamB.strength))
  })

  it('distribui cada equipa pelos lugares de forma óptima', () => {
    for (const equipa of equipas(resultado)) {
      const jogadores = FIELD_SLOTS.map((slot) => equipa.slots[slot])
      const melhor = Math.min(
        ...permutacoes(jogadores).map((ordem) =>
          ordem.reduce((s, j, i) => s + penalizacaoDe(j, FIELD_SLOTS[i]), 0),
        ),
      )
      expect(penalizacaoDaEquipa(equipa)).toBe(melhor)
    }
  })
})

// ---------------------------------------------------------------- validação

describe('sortearEquipas — validação', () => {
  it("atira 'GOLEIROS' quando não são 2 goleiros", () => {
    const e = apanhar(() =>
      sortearEquipas({
        goalkeepers: [jogador('gk1', 70, 'GK')],
        fieldPlayers: campoCoberto(),
        seed: 's',
      }),
    )
    expect(e.message).toBe('GOLEIROS')
    expect(e.detalhe).toContain('1')
    expect(e.tem).toBe(1)
    expect(e.faltam).toBe(1)
  })

  it("atira 'GOLEIROS' também quando há goleiros a mais", () => {
    const e = apanhar(() =>
      sortearEquipas({
        goalkeepers: [...goleiros(), jogador('gk3', 70, 'GK')],
        fieldPlayers: campoCoberto(),
        seed: 's',
      }),
    )
    expect(e.message).toBe('GOLEIROS')
    expect(e.faltam).toBe(-1)
    expect(e.detalhe).toContain('sobra 1')
  })

  it("atira 'CAMPO' quando não são 12 jogadores de campo", () => {
    const e = apanhar(() =>
      sortearEquipas({
        goalkeepers: goleiros(),
        fieldPlayers: campoCoberto().slice(0, 10),
        seed: 's',
      }),
    )
    expect(e.message).toBe('CAMPO')
    expect(e.tem).toBe(10)
    expect(e.faltam).toBe(2)
    expect(e.detalhe).toContain('faltam 2')
  })

  it("atira 'DUPLICADO' quando o mesmo jogador aparece duas vezes", () => {
    const campo = campoCoberto()
    campo[11] = { ...campo[0] }
    const e = apanhar(() => sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campo, seed: 's' }))
    expect(e.message).toBe('DUPLICADO')
  })

  it('trata overall em falta como neutro e regista quem foi', () => {
    const campo = campoCoberto()
    campo[3] = { ...campo[3], overall: null }
    const r = sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campo, seed: 's' })
    expect(r.semOverall.map((x) => x.playerId)).toEqual(['p3'])
    const p3 = equipas(r)
      .flatMap((e) => e.jogadores)
      .find((j) => j.id === 'p3')
    expect(p3.overall).toBe(OVERALL_NEUTRO)
    expect(p3.overallEstimado).toBe(true)
  })
})

// ---------------------------------------------------------------- semente

describe('sortearEquipas — reprodutibilidade', () => {
  const entrada = () => ({ goalkeepers: goleiros(), fieldPlayers: campoCoberto(), seed: 'rodada-42' })

  it('a mesma semente dá exactamente o mesmo sorteio', () => {
    const a = sortearEquipas(entrada())
    const b = sortearEquipas(entrada())
    expect(assinatura(a)).toBe(assinatura(b))
    expect(a.custo).toBe(b.custo)
    expect(a.diff).toBe(b.diff)
  })

  it('sementes diferentes dão sorteios diferentes', () => {
    const vistas = new Set()
    for (let i = 0; i < 10; i++) {
      vistas.add(
        assinatura(
          sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campoCoberto(), seed: `jogo-${i}` }),
        ),
      )
    }
    expect(vistas.size).toBeGreaterThan(1)
  })

  it('guarda a semente usada no resultado', () => {
    expect(sortearEquipas(entrada()).seed).toBe('rodada-42')
  })
})

// ---------------------------------------------------------------- posições

describe('sortearEquipas — posições', () => {
  it('com cobertura exacta dos 6 lugares × 2, ninguém sai da principal', () => {
    const r = sortearEquipas({
      goalkeepers: goleiros(),
      fieldPlayers: campoCoberto(),
      seed: 'cobertura',
    })
    expect(r.outOfPosition).toEqual([])
    expect(r.penalidadeTotal).toBe(0)
    for (const equipa of equipas(r)) {
      for (const slot of FIELD_SLOTS) expect(equipa.slots[slot].primaryPosition).toBe(slot)
    }
  })

  it('quem não aceita outras posições não é o sacrificado', () => {
    // 8 defesas esquerdos para 3 lugares aceitáveis (DEF-L, DEF-R, MID-L) por
    // equipa: alguém tem de sair da zona. Nunca o que recusou.
    const campo = [
      ...Array.from({ length: 8 }, (_, i) =>
        jogador(`d${i}`, 70, 'DEF-L', i === 2 ? { acceptsOther: false } : {}),
      ),
      jogador('a1', 70, 'ST'),
      jogador('a2', 70, 'ST'),
      jogador('m1', 70, 'MID-C'),
      jogador('m2', 70, 'MID-C'),
    ]
    const r = sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campo, seed: 'recusa' })
    const recusa = equipas(r)
      .flatMap((e) => e.jogadores)
      .find((j) => j.id === 'd2')
    expect(penalizacaoDe(recusa, recusa.assignedPosition)).toBeLessThan(PENALIZACAO.FORA)
    // e o sorteio de facto teve de pôr alguém fora — senão o teste não prova nada
    expect(r.outOfPosition.some((o) => o.nivel === 'fora')).toBe(true)
    expect(r.outOfPosition.some((o) => o.nivel === 'recusada')).toBe(false)
  })

  it('explica o motivo de cada jogador fora da principal', () => {
    const campo = [
      ...Array.from({ length: 4 }, (_, i) => jogador(`d${i}`, 70, 'DEF-L')),
      ...Array.from({ length: 4 }, (_, i) => jogador(`e${i}`, 70, 'DEF-R')),
      jogador('s1', 70, 'ST'),
      jogador('s2', 70, 'ST'),
      jogador('x1', 70, null),
      jogador('x2', 70, null),
    ]
    const r = sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campo, seed: 'motivos' })
    const motivos = new Set(r.outOfPosition.map((o) => o.motivo))
    for (const m of motivos) {
      expect(['Posição secundária', 'Posição compatível', 'Fora de posição', 'Sem posição definida']).toContain(m)
    }
    for (const o of r.outOfPosition) {
      expect(['A', 'B']).toContain(o.team)
      expect(FIELD_SLOTS).toContain(o.assigned)
      expect(o.assigned).not.toBe(o.preferred)
      expect(o.name).toBeTruthy()
    }
    // os sem posição definida aparecem sempre, com o motivo próprio
    const semPosicao = r.outOfPosition.filter((o) => o.nivel === 'indefinida')
    expect(semPosicao.map((o) => o.playerId).sort()).toEqual(['x1', 'x2'])
  })

  it('a posição secundária é preferida a uma compatível', () => {
    // p0 é o único capaz de ocupar ST sem ser por compatibilidade
    const campo = [
      jogador('p0', 70, 'DEF-L', { secondaryPosition: 'ST' }),
      jogador('p1', 70, 'DEF-L'),
      jogador('p2', 70, 'DEF-R'),
      jogador('p3', 70, 'MID-L'),
      jogador('p4', 70, 'MID-C'),
      jogador('p5', 70, 'MID-R'),
      jogador('p6', 70, 'DEF-L'),
      jogador('p7', 70, 'DEF-R'),
      jogador('p8', 70, 'MID-L'),
      jogador('p9', 70, 'MID-C'),
      jogador('p10', 70, 'MID-R'),
      jogador('p11', 70, 'ST'),
    ]
    const r = sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campo, seed: 'secundaria' })
    const p0 = equipas(r)
      .flatMap((e) => e.jogadores)
      .find((j) => j.id === 'p0')
    expect(['DEF-L', 'ST']).toContain(p0.assignedPosition)
  })
})

// ---------------------------------------------------------------- equilíbrio

describe('sortearEquipas — equilíbrio', () => {
  it('aproxima as forças mesmo com overalls muito desiguais', () => {
    const r = sortearEquipas({
      goalkeepers: goleiros(),
      fieldPlayers: campoCoberto((i) => 90 - i),
      seed: 'desiguais',
    })
    expect(r.diff).toBeLessThanOrEqual(1)
    expect(r.balanceLevel).toBe('excelente')
    expect(r.balanceLabel).toBe('Excelente')
    expect(r.penalidadeTotal).toBe(0)
  })

  it('não deixa um goleiro muito melhor ficar do lado mais forte', () => {
    const r = sortearEquipas({
      goalkeepers: goleiros(90, 50),
      fieldPlayers: campoCoberto((i) => (i < 6 ? 80 : 60)),
      seed: 'goleiros',
    })
    const campoDe = (e) => FIELD_SLOTS.reduce((s, slot) => s + e.slots[slot].overall, 0)
    const campoA = campoDe(r.teamA)
    const campoB = campoDe(r.teamB)
    // o melhor goleiro serve para compensar o conjunto de campo mais fraco
    if (campoA !== campoB) {
      const comMelhorCampo = campoA > campoB ? r.teamA : r.teamB
      const comPiorCampo = campoA > campoB ? r.teamB : r.teamA
      expect(comMelhorCampo.goalkeeper.overall).toBeLessThan(comPiorCampo.goalkeeper.overall)
    }
    expect(r.diff).toBeLessThanOrEqual(2)
  })

  it('classifica o equilíbrio por percentagem', () => {
    expect(avaliarEquilibrio(500, 500)).toMatchObject({
      diff: 0,
      balancePct: 0,
      balanceLevel: 'excelente',
      balanceLabel: 'Excelente',
    })
    expect(avaliarEquilibrio(505, 495).balanceLevel).toBe('excelente') // 2%
    expect(avaliarEquilibrio(510, 490).balanceLevel).toBe('bom') // 4%
    expect(avaliarEquilibrio(512.5, 487.5).balanceLevel).toBe('bom') // 5%
    expect(avaliarEquilibrio(515, 485).balanceLevel).toBe('regular') // 6%
    expect(avaliarEquilibrio(520, 480).balanceLevel).toBe('regular') // 8%
    expect(avaliarEquilibrio(521, 479).balanceLevel).toBe('desequilibrado') // 8,4%
    expect(avaliarEquilibrio(550, 450).balanceLevel).toBe('desequilibrado') // 20%
    expect(avaliarEquilibrio(490, 510).diff).toBe(20) // a ordem não conta
    expect(avaliarEquilibrio(0, 0).balancePct).toBe(0)
  })
})

// ---------------------------------------------------------------- ajustes

describe('trocarJogadores', () => {
  const base = () =>
    sortearEquipas({
      goalkeepers: goleiros(72, 68),
      fieldPlayers: campoCoberto((i) => 60 + i),
      seed: 'trocas',
    })

  it('troca dois jogadores de campo entre equipas e recalcula a força', () => {
    const r = base()
    const a = r.teamA.slots['MID-C']
    const b = r.teamB.slots.ST
    const novo = trocarJogadores(r, a.id, b.id)

    expect(novo.teamA.slots['MID-C'].id).toBe(b.id)
    expect(novo.teamB.slots.ST.id).toBe(a.id)
    expect(novo.teamA.strength).toBe(r.teamA.strength - a.overall + b.overall)
    expect(novo.teamB.strength).toBe(r.teamB.strength - b.overall + a.overall)
    expect(novo.diff).toBe(Math.abs(novo.teamA.strength - novo.teamB.strength))
    expect(novo.balanceLevel).toBe(avaliarEquilibrio(novo.teamA.strength, novo.teamB.strength).balanceLevel)

    const ids = todosOsIds(novo)
    expect(ids).toHaveLength(14)
    expect(new Set(ids).size).toBe(14)
    // ninguém mais mudou de lugar
    for (const slot of FIELD_SLOTS) {
      if (slot !== 'MID-C') expect(novo.teamA.slots[slot].id).toBe(r.teamA.slots[slot].id)
      if (slot !== 'ST') expect(novo.teamB.slots[slot].id).toBe(r.teamB.slots[slot].id)
    }
  })

  it('não mexe no resultado original', () => {
    const r = base()
    const antes = assinatura(r)
    trocarJogadores(r, r.teamA.slots['MID-C'].id, r.teamB.slots.ST.id)
    expect(assinatura(r)).toBe(antes)
  })

  it('troca dois jogadores da mesma equipa sem mudar as forças', () => {
    const r = base()
    const a = r.teamA.slots['DEF-L']
    const b = r.teamA.slots.ST
    const novo = trocarJogadores(r, a.id, b.id)
    expect(novo.teamA.slots['DEF-L'].id).toBe(b.id)
    expect(novo.teamA.slots.ST.id).toBe(a.id)
    expect(novo.teamA.strength).toBe(r.teamA.strength)
    expect(novo.teamB.strength).toBe(r.teamB.strength)
  })

  it('troca os dois goleiros', () => {
    const r = base()
    const novo = trocarJogadores(r, r.teamA.goalkeeper.id, r.teamB.goalkeeper.id)
    expect(novo.teamA.goalkeeper.id).toBe(r.teamB.goalkeeper.id)
    expect(novo.teamB.goalkeeper.id).toBe(r.teamA.goalkeeper.id)
    expect(novo.teamA.strength).toBe(r.teamA.strength - r.teamA.goalkeeper.overall + r.teamB.goalkeeper.overall)
  })

  it('recusa trocar um goleiro por um jogador de campo', () => {
    const r = base()
    const e = apanhar(() => trocarJogadores(r, r.teamA.goalkeeper.id, r.teamB.slots.ST.id))
    expect(e.message).toBe('TROCAGK')
    expect(e.detalhe).toBeTruthy()
  })

  it("atira 'SEMJOGADOR' para ids que não estão no sorteio", () => {
    const r = base()
    expect(apanhar(() => trocarJogadores(r, 'ninguem', r.teamB.slots.ST.id)).message).toBe('SEMJOGADOR')
    expect(apanhar(() => trocarJogadores(r, r.teamB.slots.ST.id, 'ninguem')).message).toBe('SEMJOGADOR')
  })

  it('trocar um jogador consigo próprio não muda nada', () => {
    const r = base()
    const id = r.teamA.slots.ST.id
    expect(assinatura(trocarJogadores(r, id, id))).toBe(assinatura(r))
  })
})

describe('moverParaSlot', () => {
  const base = () =>
    sortearEquipas({
      goalkeepers: goleiros(),
      fieldPlayers: campoCoberto((i) => 60 + i),
      seed: 'mover',
    })

  it('troca de lugar com quem estava lá, dentro da equipa', () => {
    const r = base()
    const alvo = r.teamA.slots['DEF-R']
    const movido = r.teamA.slots['MID-L']
    const novo = moverParaSlot(r, movido.id, 'A', 'DEF-R')
    expect(novo.teamA.slots['DEF-R'].id).toBe(movido.id)
    expect(novo.teamA.slots['MID-L'].id).toBe(alvo.id)
    expect(novo.teamA.strength).toBe(r.teamA.strength)
    expect(novo.teamB.slots).toEqual(r.teamB.slots)
    expect(new Set(todosOsIds(novo)).size).toBe(14)
  })

  it('recalcula quem está fora de posição', () => {
    const r = sortearEquipas({
      goalkeepers: goleiros(),
      fieldPlayers: campoCoberto(),
      seed: 'fora-depois',
    })
    expect(r.outOfPosition).toEqual([])
    const novo = moverParaSlot(r, r.teamA.slots['DEF-L'].id, 'A', 'ST')
    expect(novo.outOfPosition.length).toBe(2)
    expect(novo.outOfPosition.every((o) => o.team === 'A')).toBe(true)
    expect(novo.penalidadeTotal).toBeGreaterThan(0)
  })

  it('rejeita lugares, equipas e jogadores inválidos', () => {
    const r = base()
    const id = r.teamA.slots.ST.id
    expect(apanhar(() => moverParaSlot(r, id, 'A', 'GK')).message).toBe('SLOT')
    expect(apanhar(() => moverParaSlot(r, id, 'C', 'ST')).message).toBe('EQUIPA')
    expect(apanhar(() => moverParaSlot(r, id, 'B', 'ST')).message).toBe('EQUIPA')
    expect(apanhar(() => moverParaSlot(r, 'ninguem', 'A', 'ST')).message).toBe('SEMJOGADOR')
    expect(apanhar(() => moverParaSlot(r, r.teamA.goalkeeper.id, 'A', 'ST')).message).toBe('TROCAGK')
  })

  it('mover para o lugar onde já está não muda nada', () => {
    const r = base()
    expect(assinatura(moverParaSlot(r, r.teamA.slots.ST.id, 'A', 'ST'))).toBe(assinatura(r))
  })
})

// ---------------------------------------------------------------- escalação

describe('paraLinhasDeEscalacao', () => {
  const r = sortearEquipas({
    goalkeepers: goleiros(72, 68),
    fieldPlayers: campoCoberto((i) => 60 + i),
    seed: 'escalacao',
  })
  const linhas = paraLinhasDeEscalacao(r)

  it('devolve 14 linhas com exactamente 2 goleiros', () => {
    expect(linhas).toHaveLength(14)
    expect(linhas.filter((l) => l.is_goalkeeper)).toHaveLength(2)
    expect(new Set(linhas.map((l) => l.player_id)).size).toBe(14)
  })

  it('preenche cada linha com o que a base de dados espera', () => {
    for (const linha of linhas) {
      expect(['A', 'B']).toContain(linha.team)
      expect(typeof linha.overall_at_draw).toBe('number')
      expect(typeof linha.was_out_of_position).toBe('boolean')
      if (linha.is_goalkeeper) {
        expect(linha.assigned_position).toBe('GK')
        expect(linha.was_out_of_position).toBe(false)
      } else {
        expect(FIELD_SLOTS).toContain(linha.assigned_position)
      }
    }
    expect(linhas.filter((l) => l.team === 'A')).toHaveLength(7)
  })

  it('marca was_out_of_position de acordo com outOfPosition', () => {
    const fora = new Set(r.outOfPosition.map((o) => o.playerId))
    for (const linha of linhas) {
      if (linha.is_goalkeeper) continue
      expect(linha.was_out_of_position).toBe(fora.has(linha.player_id))
    }
  })

  // `match_lineup.overall_at_draw` e `matches.team_a_overall` são colunas `int`
  // e o `admin_save_lineup` faz `->>'overall_at_draw'::int`: um decimal sobe
  // como 22P02 e chega ao admin como o código STATS, que fala de gols.
  it('devolve overall_at_draw inteiro, mesmo com overalls decimais à entrada', () => {
    const decimais = sortearEquipas({
      goalkeepers: [jogador('gk1', 71.4, 'GK'), jogador('gk2', 68.6, 'GK')],
      fieldPlayers: campoCoberto((i) => 60 + i * 1.37),
      seed: 'decimais',
    })
    for (const linha of paraLinhasDeEscalacao(decimais)) {
      expect(Number.isInteger(linha.overall_at_draw)).toBe(true)
    }
    // e as forças (que vão para as colunas int das equipas) também
    expect(Number.isInteger(decimais.teamA.strength)).toBe(true)
    expect(Number.isInteger(decimais.teamB.strength)).toBe(true)
  })

  it("atira 'SEMESCALACAO' em vez de rebentar quando ainda não há sorteio", () => {
    for (const vazio of [null, undefined, {}, { teamA: r.teamA }]) {
      expect(apanhar(() => paraLinhasDeEscalacao(vazio)).message).toBe('SEMESCALACAO')
    }
  })

  it('cabe nas restrições de match_lineup (par equipa+lugar único)', () => {
    const chaves = linhas.map((l) => `${l.team}/${l.assigned_position}`)
    expect(new Set(chaves).size).toBe(14)
    for (const linha of linhas) {
      expect(['GK', ...FIELD_SLOTS]).toContain(linha.assigned_position)
      expect(linha.preferred_position === null || typeof linha.preferred_position === 'string').toBe(
        true,
      )
    }
  })
})

// ---------------------------------------------------------------- óptimo global
//
// A especificação exige uma busca exacta. O teste de cima já confirma que a
// atribuição húngara dentro de uma equipa é óptima, mas isso não diz nada
// sobre a divisão 6+6 nem sobre a atribuição dos goleiros. Aqui percorrem-se
// as 924 divisões (sem o corte de simetria, de propósito — se o corte estiver
// errado é aqui que se vê) × 2 goleiros, com as 720 permutações por equipa.

const combinacoes = (n, k) => {
  const out = []
  const acc = []
  const passo = (inicio) => {
    if (acc.length === k) {
      out.push([...acc])
      return
    }
    for (let i = inicio; i <= n - (k - acc.length); i++) {
      acc.push(i)
      passo(i + 1)
      acc.pop()
    }
  }
  passo(0)
  return out
}

const ORDENS = permutacoes([0, 1, 2, 3, 4, 5])

function melhorAtribuicao(js) {
  let melhor = Infinity
  for (const ordem of ORDENS) {
    let soma = 0
    for (let i = 0; i < 6; i++) {
      soma += penalizacaoDe(js[ordem[i]], FIELD_SLOTS[i])
      if (soma >= melhor) break
    }
    if (soma < melhor) melhor = soma
  }
  return melhor
}

const formulaDoCusto = (sA, sB, pen) =>
  Math.abs(sA - sB) * 10 + pen * 3 + Math.abs(sA / 7 - sB / 7) * 5

function custoOptimo(gks, campo) {
  let melhor = Infinity
  for (const idxA of combinacoes(12, 6)) {
    const naA = new Set(idxA)
    const A = idxA.map((i) => campo[i])
    const B = campo.filter((_, i) => !naA.has(i))
    const pen = melhorAtribuicao(A) + melhorAtribuicao(B)
    const sA = A.reduce((s, j) => s + j.overall, 0)
    const sB = B.reduce((s, j) => s + j.overall, 0)
    for (let g = 0; g < 2; g++) {
      const c = formulaDoCusto(sA + gks[g].overall, sB + gks[1 - g].overall, pen)
      if (c < melhor) melhor = c
    }
  }
  return melhor
}

describe('sortearEquipas — a busca é mesmo exacta', () => {
  const cenarios = {
    'posições em excesso de um lado': {
      gks: goleiros(74, 66),
      campo: [
        jogador('d0', 88, 'DEF-L'),
        jogador('d1', 61, 'DEF-L'),
        jogador('d2', 55, 'DEF-L', { secondaryPosition: 'MID-C' }),
        jogador('d3', 79, 'DEF-R'),
        jogador('m0', 92, 'MID-C'),
        jogador('m1', 47, 'MID-C'),
        jogador('m2', 70, 'MID-L'),
        jogador('m3', 64, 'MID-R', { acceptsOther: false }),
        jogador('s0', 83, 'ST'),
        jogador('s1', 58, 'ST'),
        jogador('x0', 66, null),
        jogador('x1', 51, 'DEF-R', { secondaryPosition: 'ST' }),
      ],
    },
    'overalls muito espalhados': {
      gks: goleiros(90, 40),
      campo: Array.from({ length: 12 }, (_, i) =>
        jogador(`p${i}`, [99, 12, 77, 34, 61, 88, 25, 53, 70, 41, 95, 18][i], FIELD_SLOTS[i % 6]),
      ),
    },
  }

  for (const [nome, { gks, campo }] of Object.entries(cenarios)) {
    it(`não fica pior do que a margem de empate permite (${nome})`, () => {
      const optimo = custoOptimo(gks, campo)
      // a margem é a que o motor documenta: 1% do melhor, ou 1 ponto absoluto
      const margem = Math.max(optimo * 0.01, 1) + 1e-9
      for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        const r = sortearEquipas({ goalkeepers: gks, fieldPlayers: campo, seed })
        expect(r.custo).toBeGreaterThanOrEqual(optimo - 1e-9)
        expect(r.custo).toBeLessThanOrEqual(optimo + margem)
        // o custo devolvido é mesmo a fórmula da especificação
        expect(r.custo).toBeCloseTo(
          formulaDoCusto(r.teamA.strength, r.teamB.strength, r.penalidadeTotal),
          9,
        )
      }
    })
  }

  it('encontra o óptimo exacto quando ele é único', () => {
    // 12 jogadores com posições que cobrem os 6 lugares × 2 e overalls que só
    // fecham a zero de uma maneira: 1+2+4+8+16+32 = 63 contra os pares
    const campo = [
      jogador('a0', 1, 'DEF-L'),
      jogador('a1', 2, 'DEF-R'),
      jogador('a2', 4, 'MID-L'),
      jogador('a3', 8, 'MID-C'),
      jogador('a4', 16, 'MID-R'),
      jogador('a5', 32, 'ST'),
      jogador('b0', 1, 'DEF-L'),
      jogador('b1', 2, 'DEF-R'),
      jogador('b2', 4, 'MID-L'),
      jogador('b3', 8, 'MID-C'),
      jogador('b4', 16, 'MID-R'),
      jogador('b5', 32, 'ST'),
    ]
    const gks = goleiros(50, 50)
    const r = sortearEquipas({ goalkeepers: gks, fieldPlayers: campo, seed: 'unico' })
    expect(r.custo).toBe(0)
    expect(r.penalidadeTotal).toBe(0)
    expect(r.diff).toBe(0)
    expect(custoOptimo(gks, campo)).toBe(0)
  })
})

// ---------------------------------------------------------------- entradas hostis

describe('sortearEquipas — entradas degeneradas', () => {
  const casos = [
    ['sem argumentos', () => sortearEquipas()],
    ['listas em falta', () => sortearEquipas({ seed: 'x' })],
    ['listas vazias', () => sortearEquipas({ goalkeepers: [], fieldPlayers: [], seed: 'x' })],
    ['nem sequer arrays', () => sortearEquipas({ goalkeepers: 'ab', fieldPlayers: 12, seed: 'x' })],
    [
      'só nulls',
      () =>
        sortearEquipas({ goalkeepers: [null, null], fieldPlayers: Array(12).fill(null), seed: 'x' }),
    ],
  ]
  for (const [nome, fn] of casos) {
    it(`${nome} → erro claro, nunca um TypeError`, () => {
      const e = apanhar(fn)
      expect(e).toBeTruthy()
      expect(e).not.toBeInstanceOf(TypeError)
      expect(e.message).toBe('GOLEIROS')
      expect(e.detalhe).toBeTruthy()
    })
  }

  it('ignora entradas nulas dentro da lista antes de contar', () => {
    const campo = [...campoCoberto(), null, undefined]
    const r = sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campo, seed: 'nulls' })
    expect(r.teamA.jogadores).toHaveLength(7)
  })

  it("atira 'SEMJOGADOR' quando há jogadores sem id, não 'DUPLICADO'", () => {
    const campo = campoCoberto().map((j, i) => (i > 9 ? { ...j, id: undefined } : j))
    const e = apanhar(() => sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campo, seed: 's' }))
    expect(e.message).toBe('SEMJOGADOR')
  })

  it('sobrevive a overalls absurdos e mantém tudo finito', () => {
    const lixo = [null, undefined, '', 'abc', NaN, Infinity, -Infinity, {}, [], true, '70', 62.5]
    const campo = campoCoberto().map((j, i) => ({ ...j, overall: lixo[i] }))
    const r = sortearEquipas({
      goalkeepers: [
        { ...jogador('gk1', NaN, 'GK') },
        { ...jogador('gk2', 'não é um número', 'GK') },
      ],
      fieldPlayers: campo,
      seed: 'lixo',
    })
    for (const equipa of equipas(r)) {
      expect(Number.isInteger(equipa.strength)).toBe(true)
      expect(Number.isFinite(equipa.avg)).toBe(true)
      for (const j of equipa.jogadores) expect(Number.isInteger(j.overall)).toBe(true)
    }
    expect(Number.isFinite(r.custo)).toBe(true)
    expect(Number.isFinite(r.balancePct)).toBe(true)
    // 62,5 é um número válido: arredonda, não vira neutro
    const arredondado = equipas(r)
      .flatMap((e) => e.jogadores)
      .find((j) => j.id === 'p11')
    expect(arredondado.overall).toBe(63)
    expect(arredondado.overallEstimado).toBe(false)
    // '70' também é um número válido
    const texto = equipas(r)
      .flatMap((e) => e.jogadores)
      .find((j) => j.id === 'p10')
    expect(texto.overall).toBe(70)
    // todos os outros (10 de campo + os 2 goleiros) entraram com o neutro.
    // `[]` e `true` contam aqui: Number() dava-lhes 0 e 1, e um overall 0
    // vindo de lixo desequilibra o sorteio muito mais do que o neutro.
    expect(r.semOverall.map((x) => x.playerId).sort()).toEqual(
      ['gk1', 'gk2', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].sort(),
    )
  })

  it('aceita nomes enormes e vazios sem os alterar', () => {
    const comprido = 'Cristiano'.repeat(30)
    const campo = campoCoberto().map((j, i) => ({ ...j, name: i === 0 ? comprido : i === 1 ? '' : j.name }))
    const r = sortearEquipas({ goalkeepers: goleiros(), fieldPlayers: campo, seed: 'nomes' })
    const nomes = equipas(r).flatMap((e) => e.jogadores.map((j) => j.name))
    expect(nomes).toContain(comprido)
    expect(nomes.filter((n) => n === '')).toHaveLength(1)
  })

  it('trata um jogador que aparece como goleiro e como jogador de campo', () => {
    const campo = campoCoberto()
    const e = apanhar(() =>
      sortearEquipas({
        goalkeepers: [campo[0], jogador('gk2', 70, 'GK')],
        fieldPlayers: campo,
        seed: 's',
      }),
    )
    expect(e.message).toBe('DUPLICADO')
    expect(e.playerId).toBe('p0')
  })
})

// ---------------------------------------------------------------- propriedades

describe('sortearEquipas — invariantes com listas aleatórias', () => {
  // Semente fixa: nada aqui depende do relógio nem da ordem de um Object.keys,
  // por isso uma falha é sempre reproduzível com o mesmo `it`.
  const posicoes = [...POSITION_IDS, null, '', 'POSICAO-QUE-NAO-EXISTE']
  const overalls = [null, undefined, 0, 1, 45, 50, 99, '70', 'x', NaN, 62.5]

  it('mantém as invariantes em 60 sorteios aleatórios', () => {
    for (let n = 0; n < 60; n++) {
      const rnd = criarRandom(`prop-${n}`)
      const pick = (l) => l[Math.floor(rnd() * l.length)]
      const mk = (id) =>
        jogador(id, pick(overalls), pick(posicoes), {
          secondaryPosition: pick(posicoes),
          acceptsOther: rnd() < 0.3 ? false : true,
        })
      const gks = [mk('g0'), mk('g1')]
      const campo = Array.from({ length: 12 }, (_, i) => mk(`c${i}`))
      const r = sortearEquipas({ goalkeepers: gks, fieldPlayers: campo, seed: `prop-${n}` })

      const ids = todosOsIds(r)
      expect(new Set(ids).size, `sorteio prop-${n}`).toBe(14)
      let penalidade = 0
      for (const [nome, equipa] of [
        ['A', r.teamA],
        ['B', r.teamB],
      ]) {
        const slotIds = FIELD_SLOTS.map((s) => equipa.slots[s]?.id)
        expect(new Set(slotIds).size, `${nome} em prop-${n}`).toBe(6)
        expect(slotIds.every((x) => x != null)).toBe(true)
        expect(equipa.penalidade).toBe(penalizacaoDaEquipa(equipa))
        expect(equipa.strength).toBe(equipa.jogadores.reduce((s, j) => s + j.overall, 0))
        penalidade += equipa.penalidade
      }
      expect(r.penalidadeTotal).toBe(penalidade)
      expect(r.custo).toBeCloseTo(
        formulaDoCusto(r.teamA.strength, r.teamB.strength, r.penalidadeTotal),
        9,
      )
      // outOfPosition lista exactamente quem não está na principal
      const esperado = equipas(r)
        .flatMap((e) => e.jogadores)
        .filter((j) => !j.isGoalkeeper && j.primaryPosition !== j.assignedPosition)
        .map((j) => j.id)
      expect([...r.outOfPosition.map((o) => o.playerId)].sort()).toEqual([...esperado].sort())
    }
  })

  it('aguenta ajustes manuais encadeados sem perder nem duplicar jogadores', () => {
    const rnd = criarRandom('ajustes')
    let cur = sortearEquipas({
      goalkeepers: goleiros(72, 68),
      fieldPlayers: campoCoberto((i) => 55 + i * 2),
      seed: 'ajustes',
    })
    const inicial = new Set(todosOsIds(cur))
    for (let k = 0; k < 25; k++) {
      const campo = equipas(cur)
        .flatMap((e) => e.jogadores)
        .filter((j) => !j.isGoalkeeper)
      const a = campo[Math.floor(rnd() * campo.length)]
      const b = campo[Math.floor(rnd() * campo.length)]
      cur = trocarJogadores(cur, a.id, b.id)
      const team = rnd() < 0.5 ? 'A' : 'B'
      const equipa = team === 'A' ? cur.teamA : cur.teamB
      const origem = equipa.slots[FIELD_SLOTS[Math.floor(rnd() * 6)]]
      cur = moverParaSlot(cur, origem.id, team, FIELD_SLOTS[Math.floor(rnd() * 6)])

      expect(new Set(todosOsIds(cur))).toEqual(inicial)
      expect(cur.penalidadeTotal).toBe(
        penalizacaoDaEquipa(cur.teamA) + penalizacaoDaEquipa(cur.teamB),
      )
      expect(cur.diff).toBe(Math.abs(cur.teamA.strength - cur.teamB.strength))
      expect(cur.seed).toBe('ajustes')
    }
  })
})

describe('ajustes manuais — imutabilidade', () => {
  const base = () =>
    sortearEquipas({
      goalkeepers: goleiros(72, 68),
      fieldPlayers: campoCoberto((i) => 60 + i),
      seed: 'imutavel',
    })

  it('moverParaSlot não toca no resultado original', () => {
    const r = base()
    const antes = JSON.stringify(paraLinhasDeEscalacao(r))
    moverParaSlot(r, r.teamA.slots['DEF-L'].id, 'A', 'ST')
    expect(JSON.stringify(paraLinhasDeEscalacao(r))).toBe(antes)
  })

  it('trocarJogadores devolve objectos novos, não os do sorteio original', () => {
    const r = base()
    const novo = trocarJogadores(r, r.teamA.slots['MID-C'].id, r.teamB.slots.ST.id)
    expect(novo).not.toBe(r)
    expect(novo.teamA).not.toBe(r.teamA)
    expect(novo.teamA.slots).not.toBe(r.teamA.slots)
    for (const slot of FIELD_SLOTS) {
      expect(novo.teamA.slots[slot]).not.toBe(r.teamA.slots[slot])
    }
  })

  it('um ajuste pode piorar o equilíbrio — e isso tem de aparecer', () => {
    const r = sortearEquipas({
      goalkeepers: goleiros(70, 70),
      fieldPlayers: campoCoberto((i) => (i < 6 ? 90 : 50)),
      seed: 'piorar',
    })
    const forte = r.teamA.slots['ST'].overall >= r.teamB.slots['ST'].overall ? r.teamA : r.teamB
    const fraco = forte === r.teamA ? r.teamB : r.teamA
    const alto = FIELD_SLOTS.map((s) => forte.slots[s]).sort((x, y) => y.overall - x.overall)[0]
    const baixo = FIELD_SLOTS.map((s) => fraco.slots[s]).sort((x, y) => x.overall - y.overall)[0]
    if (alto.overall === baixo.overall) return // sorteio já perfeito, nada a provar
    const novo = trocarJogadores(r, alto.id, baixo.id)
    expect(novo.diff).toBeGreaterThan(r.diff)
    expect(novo.custo).toBeGreaterThan(r.custo)
  })
})

describe('avaliarEquilibrio — entradas fora do normal', () => {
  it('não devolve NaN nem Infinity', () => {
    for (const [a, b] of [
      [null, null],
      [undefined, 500],
      ['500', '480'],
      ['abc', 'def'],
      [0, 0],
      [0, 100],
    ]) {
      const r = avaliarEquilibrio(a, b)
      expect(Number.isFinite(r.diff)).toBe(true)
      expect(Number.isFinite(r.balancePct)).toBe(true)
      expect(['excelente', 'bom', 'regular', 'desequilibrado']).toContain(r.balanceLevel)
      expect(r.balanceLabel).toBeTruthy()
    }
  })

  it('lê números em texto como números', () => {
    expect(avaliarEquilibrio('510', '490')).toMatchObject({ diff: 20, balanceLevel: 'bom' })
  })
})
