import { describe, it, expect } from 'vitest'
import {
  historicoDeGol,
  ordemDoRodizio,
  paraLinhasDeEscalacao,
  definirInicioNoGol,
  sortearEquipasRotativo,
  trocarJogadores,
} from './drawEngine.js'
import { criarRandom } from './seed.js'
import { elencoNecessario, formacaoDe, lugaresDe } from './formacoes.js'

// O motor de rodízio tem UMA garantia que vale por todas as outras:
//
//   quem vai ao gol não pode influenciar o equilíbrio das equipas.
//
// É o que estes testes existem para provar. O resto (justiça, ordem
// completa, reprodutibilidade) é consequência.

const POS = ['DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST']

const elenco = (n = 14, extra = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `J${i}`,
    overall: 40 + i * 4,
    primaryPosition: POS[i % POS.length],
    acceptsOther: true,
    ...extra(i),
  }))

describe('formações', () => {
  it('o 7×7 é o que já existia — seis lugares de campo, 2-3-1', () => {
    const f = formacaoDe(7)
    expect(f.nome).toBe('2-3-1')
    expect(f.slots).toEqual(POS)
  })

  it('um tamanho desconhecido cai no formato de sempre em vez de rebentar', () => {
    expect(formacaoDe(99).tamanho).toBe(7)
    expect(formacaoDe(undefined).tamanho).toBe(7)
    expect(lugaresDe(null)).toEqual(POS)
  })

  it('os dois formatos precisam do MESMO número de pessoas', () => {
    // é o ponto que mais confunde: o rodízio não muda quantos jogam, só
    // muda quem conta como goleiro
    const fixo = elencoNecessario(7, 'FIXED')
    const rot = elencoNecessario(7, 'ROTATING')
    expect(fixo.total).toBe(14)
    expect(rot.total).toBe(14)
    expect(fixo.goleiros).toBe(2)
    expect(rot.goleiros).toBe(0)
    expect(rot.campo).toBe(14)
  })
})

describe('ordemDoRodizio — a justiça da escolha', () => {
  const random = () => 0.5 // sem ruído, para o teste ser sobre a regra

  it('quem nunca foi ao gol vai à frente de quem já foi muitas vezes', () => {
    const js = [
      { id: 'a', name: 'A', primaryPosition: 'MID-C' },
      { id: 'b', name: 'B', primaryPosition: 'MID-C' },
    ]
    const ordem = ordemDoRodizio(js, { a: { vezes: 9, dias: 0 }, b: { vezes: 0, dias: 0 } }, random)
    expect(ordem[0].id).toBe('b')
  })

  it('entre dois com as mesmas vezes, vai quem foi há mais tempo', () => {
    const js = [
      { id: 'a', name: 'A', primaryPosition: 'MID-C' },
      { id: 'b', name: 'B', primaryPosition: 'MID-C' },
    ]
    const ordem = ordemDoRodizio(js, { a: { vezes: 2, dias: 3 }, b: { vezes: 2, dias: 60 } }, random)
    expect(ordem[0].id).toBe('b')
  })

  it('quem não aceita ir à baliza fica em ÚLTIMO, custe o que custar', () => {
    // O caso que apanhou o bug: com uma penalização por PESO, um histórico
    // suficientemente favorável (nunca foi, há 120 dias) compensava-a e o
    // que recusa voltava a saltar à frente. A recusa é binária.
    const js = [
      { id: 'recusa', name: 'R', primaryPosition: 'MID-C' },
      { id: 'a', name: 'A', primaryPosition: 'MID-C' },
      { id: 'b', name: 'B', primaryPosition: 'MID-C' },
    ]
    const h = {
      recusa: { vezes: 0, dias: 120, aceita: false },
      a: { vezes: 5, dias: 0 },
      b: { vezes: 5, dias: 0 },
    }
    const ordem = ordemDoRodizio(js, h, random)
    expect(ordem[ordem.length - 1].id).toBe('recusa')
  })

  it('nem um histórico extremo põe quem recusa à frente de quem aceita', () => {
    const js = [
      { id: 'recusa', name: 'R', primaryPosition: 'MID-C' },
      { id: 'a', name: 'A', primaryPosition: 'MID-C' },
    ]
    const h = {
      recusa: { vezes: 0, dias: 100000, aceita: false },
      a: { vezes: 10000, dias: 0, aceita: true },
    }
    expect(ordemDoRodizio(js, h, random)[0].id).toBe('a')
  })

  it('sem histórico nenhum continua a devolver toda a gente, sem rebentar', () => {
    const js = elenco(7)
    const ordem = ordemDoRodizio(js, undefined, random)
    expect(ordem).toHaveLength(7)
    expect(new Set(ordem.map((j) => j.id)).size).toBe(7)
  })

  it('se TODA a gente recusar, ainda assim sai uma ordem completa', () => {
    // não bloquear é intencional: o jogo tem de acontecer na mesma
    const js = elenco(7)
    const h = Object.fromEntries(js.map((j) => [j.id, { vezes: 0, dias: 0, aceita: false }]))
    const ordem = ordemDoRodizio(js, h, criarRandom('x'))
    expect(ordem).toHaveLength(7)
  })
})

describe('historicoDeGol', () => {
  it('lê snake_case (get_players) e camelCase', () => {
    const h = historicoDeGol(
      [
        { id: 'a', gk_starts: 3, last_gk_start: '2026-08-01', gk_rotation_ok: false },
        { id: 'b', gkStarts: 1, lastGkStart: '2026-08-04', gkRotationOk: true },
      ],
      new Date('2026-08-06')
    )
    expect(h.a.vezes).toBe(3)
    expect(h.a.aceita).toBe(false)
    expect(Math.round(h.a.dias)).toBe(5)
    expect(h.b.vezes).toBe(1)
    expect(h.b.aceita).toBe(true)
    expect(Math.round(h.b.dias)).toBe(2)
  })

  it('quem nunca foi ao gol conta como "há muito tempo", não como "hoje"', () => {
    const h = historicoDeGol([{ id: 'a' }], new Date('2026-08-06'))
    expect(h.a.vezes).toBe(0)
    expect(h.a.dias).toBeGreaterThan(100)
  })
})

describe('sortearEquipasRotativo', () => {
  const js = elenco(14)
  const sortear = (extra = {}) =>
    sortearEquipasRotativo({ jogadores: js, seed: 'jogo-1', ...extra })

  it('faz duas equipas de 7, sem ninguém repetido nem esquecido', () => {
    const r = sortear()
    expect(r.teamA.jogadores).toHaveLength(7)
    expect(r.teamB.jogadores).toHaveLength(7)
    const ids = [...r.teamA.jogadores, ...r.teamB.jogadores].map((j) => j.id)
    expect(new Set(ids).size).toBe(14)
  })

  it('marca-se como rodízio e traz a ordem completa das duas equipas', () => {
    const r = sortear()
    expect(r.gkMode).toBe('ROTATING')
    for (const lado of ['A', 'B']) {
      expect(r.rodizio[lado]).toHaveLength(7)
      expect(new Set(r.rodizio[lado]).size).toBe(7)
    }
  })

  it('quem começa no gol é o primeiro da ordem — as duas fontes concordam', () => {
    const r = sortear()
    expect(r.teamA.goalkeeper.id).toBe(r.rodizio.A[0])
    expect(r.teamB.goalkeeper.id).toBe(r.rodizio.B[0])
  })

  it('a mesma semente dá exatamente o mesmo sorteio', () => {
    const a = sortear()
    const b = sortear()
    expect(a.rodizio).toEqual(b.rodizio)
    expect(a.teamA.strength).toBe(b.teamA.strength)
  })

  it('sementes diferentes chegam a equipas diferentes', () => {
    const a = sortearEquipasRotativo({ jogadores: js, seed: 'jogo-1' })
    const b = sortearEquipasRotativo({ jogadores: js, seed: 'jogo-2' })
    const chave = (r) => r.teamA.jogadores.map((j) => j.id).sort().join(',')
    // não é garantido em teoria, mas com 3432 divisões e estes overalls é o
    // que se observa — se falhar, é sinal de que a semente deixou de contar
    expect(chave(a)).not.toBe(chave(b))
  })

  it('equilibra: a diferença fica pequena', () => {
    const r = sortear()
    expect(r.diff).toBeLessThanOrEqual(8)
  })

  it('recusa um elenco com o número errado de jogadores', () => {
    expect(() => sortearEquipasRotativo({ jogadores: elenco(13), seed: 's' })).toThrow('CAMPO')
    expect(() => sortearEquipasRotativo({ jogadores: elenco(15), seed: 's' })).toThrow('CAMPO')
  })

  it('recusa jogadores repetidos e jogadores sem id', () => {
    const repetido = [...elenco(13), { id: 'p0', name: 'J0', overall: 50 }]
    expect(() => sortearEquipasRotativo({ jogadores: repetido, seed: 's' })).toThrow('DUPLICADO')
    const semId = [...elenco(13), { name: 'X', overall: 50 }]
    expect(() => sortearEquipasRotativo({ jogadores: semId, seed: 's' })).toThrow('SEMJOGADOR')
  })

  it('a justiça manda: quem nunca foi ao gol começa lá', () => {
    // p3 nunca foi; todos os outros foram muitas vezes. Independentemente
    // da equipa em que caia, tem de ser ele a começar.
    const historicoGol = Object.fromEntries(
      js.map((j) => [j.id, { vezes: j.id === 'p3' ? 0 : 20, dias: 0, aceita: true }])
    )
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'jogo-1', historicoGol })
    const naA = r.teamA.jogadores.some((j) => j.id === 'p3')
    const inicia = naA ? r.teamA.goalkeeper.id : r.teamB.goalkeeper.id
    expect(inicia).toBe('p3')
  })

  it('quem recusa a baliza nunca começa no gol se houver alternativa', () => {
    const historicoGol = Object.fromEntries(
      js.map((j) => [j.id, { vezes: 0, dias: 120, aceita: false }])
    )
    // só um aceita: tem de ser ele na equipa dele
    historicoGol.p7 = { vezes: 30, dias: 0, aceita: true }
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'jogo-9', historicoGol })
    const naA = r.teamA.jogadores.some((j) => j.id === 'p7')
    const inicia = naA ? r.teamA.goalkeeper.id : r.teamB.goalkeeper.id
    expect(inicia).toBe('p7')
  })

  it('guarda os minutos do rodízio quando lhos dão', () => {
    expect(sortear({ rotacaoMinutos: 10 }).rotacaoMinutos).toBe(10)
    expect(sortear().rotacaoMinutos).toBe(null)
  })
})

describe('o goleiro NÃO influencia o equilíbrio', () => {
  // A garantia central. Se as equipas mudassem com o histórico de baliza,
  // a escolha do goleiro estaria a decidir o equilíbrio — exatamente o que
  // esta funcionalidade existe para impedir.
  it('mudar SÓ o histórico de baliza não mexe nas equipas', () => {
    const js = elenco(14)
    const composicao = (r) =>
      [r.teamA.jogadores.map((j) => j.id).sort().join(','), r.teamA.strength, r.teamB.strength]

    const semHistorico = sortearEquipasRotativo({ jogadores: js, seed: 'fixo' })

    for (const vezes of [0, 1, 5, 40]) {
      const historicoGol = Object.fromEntries(
        js.map((j, i) => [j.id, { vezes: (i * vezes) % 7, dias: (i * 13) % 120, aceita: i !== 2 }])
      )
      const comHistorico = sortearEquipasRotativo({ jogadores: js, seed: 'fixo', historicoGol })
      expect(composicao(comHistorico)).toEqual(composicao(semHistorico))
    }
  })

  it('trocar quem começa no gol à mão não mexe nas forças', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'abc' })
    const outro = r.rodizio.A[4]
    const depois = definirInicioNoGol(r, 'A', outro)

    expect(depois.teamA.strength).toBe(r.teamA.strength)
    expect(depois.teamB.strength).toBe(r.teamB.strength)
    expect(depois.diff).toBe(r.diff)
    expect(depois.teamA.goalkeeper.id).toBe(outro)
    // a equipa é a mesma gente, só noutros lugares
    expect(depois.teamA.jogadores.map((j) => j.id).sort()).toEqual(
      r.teamA.jogadores.map((j) => j.id).sort()
    )
  })

  it('definirInicioNoGol põe o escolhido em primeiro e mantém a ordem completa', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'abc' })
    const antes = [...r.rodizio.A]
    const depois = definirInicioNoGol(r, 'A', antes[3])
    expect(depois.rodizio.A[0]).toBe(antes[3])
    expect(new Set(depois.rodizio.A)).toEqual(new Set(antes))
    expect(depois.rodizio.A).toHaveLength(7)
  })

  it('escolher quem já começa não muda nada', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'abc' })
    expect(definirInicioNoGol(r, 'A', r.rodizio.A[0])).toBe(r)
  })

  it('recusa uma equipa inválida ou um jogador de fora', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'abc' })
    expect(() => definirInicioNoGol(r, 'C', r.rodizio.A[0])).toThrow('EQUIPA')
    expect(() => definirInicioNoGol(r, 'A', r.rodizio.B[1])).toThrow('SEMJOGADOR')
  })

  it('num sorteio de goleiros fixos não há rodízio para mexer', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'abc' })
    expect(() => definirInicioNoGol({ ...r, gkMode: 'FIXED' }, 'A', 'p0')).toThrow('SEMRODIZIO')
  })
})

describe('trocas manuais com rodízio', () => {
  it('quem entra herda a VEZ de quem sai — as duas ordens ficam completas', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'troca' })
    const lugares = r.lugares
    const a = r.teamA.slots[lugares[0]].id
    const b = r.teamB.slots[lugares[2]].id

    const depois = trocarJogadores(r, a, b)

    for (const lado of ['A', 'B']) {
      expect(depois.rodizio[lado]).toHaveLength(7)
      expect(new Set(depois.rodizio[lado]).size).toBe(7)
    }
    // trocaram mesmo de equipa
    expect(depois.rodizio.A).toContain(b)
    expect(depois.rodizio.B).toContain(a)
    expect(depois.rodizio.A).not.toContain(a)
  })

  it('o goleiro só troca com o goleiro, e a mensagem fala em rodízio', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'troca' })
    const gk = r.teamA.goalkeeper.id
    const campo = r.teamB.slots[r.lugares[0]].id
    expect(() => trocarJogadores(r, gk, campo)).toThrow('TROCAGK')
    try {
      trocarJogadores(r, gk, campo)
    } catch (e) {
      expect(e.detalhe).toMatch(/rodízio/i)
    }
  })
})

describe('paraLinhasDeEscalacao com rodízio', () => {
  it('grava a vez de cada um, 1..N por equipa', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'linhas' })
    const linhas = paraLinhasDeEscalacao(r)

    expect(linhas).toHaveLength(14)
    for (const lado of ['A', 'B']) {
      const ordens = linhas
        .filter((l) => l.team === lado)
        .map((l) => l.gk_order)
        .sort((a, b) => a - b)
      expect(ordens).toEqual([1, 2, 3, 4, 5, 6, 7])
    }
  })

  it('só quem tem a vez 1 é que vai marcado como goleiro', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'linhas' })
    const linhas = paraLinhasDeEscalacao(r)
    for (const l of linhas) {
      expect(l.is_goalkeeper).toBe(l.gk_order === 1)
    }
  })

  it('num jogo de goleiros fixos a vez vai a null — não há rodízio a inventar', () => {
    const js = elenco(14)
    const r = sortearEquipasRotativo({ jogadores: js, seed: 'linhas' })
    const linhas = paraLinhasDeEscalacao({ ...r, gkMode: 'FIXED' })
    expect(linhas.every((l) => l.gk_order === null)).toBe(true)
  })
})
