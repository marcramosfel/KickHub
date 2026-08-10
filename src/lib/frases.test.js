import { describe, it, expect } from 'vitest'
import { diaLocal, fraseDoDia, frasesDaPelada } from './frases.js'

const cheio = {
  rodadas: 8,
  equipas: { a: 5, b: 3, empates: 0 },
  notas: { min: 0.1, max: 5, total: 400 },
  dupla: { a: 'Flash', b: 'Wallace', jogos: 5, vitorias: 5, pct: 100 },
  goleada: { score_a: 10, score_b: 2, diferenca: 8 },
  artilheiro: { nome: 'Marcos', gols: 21 },
  autogolos: 2,
}

describe('frasesDaPelada', () => {
  it('escreve o confronto de sempre com o líder certo', () => {
    const t = frasesDaPelada(cheio).find((f) => f.id === 'equipas-lidera').texto
    expect(t).toContain('Pretos')
    expect(t).toContain('5-3')
  })

  it('a dupla invicta é a que jogou junta e ganhou tudo', () => {
    const t = frasesDaPelada(cheio).find((f) => f.id === 'dupla-invicta').texto
    expect(t).toContain('Flash e Wallace')
    expect(t).toContain('5 vezes')
  })

  // A regra que interessa: a nota aparece, os nomes nunca.
  it('a nota mais baixa sai com vírgula decimal e SEM nomes', () => {
    const t = frasesDaPelada(cheio).find((f) => f.id === 'nota-minima').texto
    expect(t).toContain('0,1')
    expect(t).not.toMatch(/Flash|Wallace|Marcos/)
  })

  it('nenhuma frase nomeia quem deu ou recebeu uma nota', () => {
    for (const f of frasesDaPelada(cheio)) {
      if (/nota/i.test(f.id)) expect(f.texto).not.toMatch(/Flash|Wallace|Marcos/)
    }
  })

  it('singular e plural certos', () => {
    const f = frasesDaPelada({ ...cheio, autogolos: 1 }).find((x) => x.id === 'autogolos')
    expect(f.texto).toContain('1 autogolo')
    expect(f.texto).not.toContain('1 autogolos')
  })

  // Nunca inventar um número: sem dados, a frase não existe.
  it('salta as frases sem dados em vez de as inventar', () => {
    const ids = frasesDaPelada({ rodadas: 1, equipas: { a: 1, b: 0, empates: 0 } }).map((f) => f.id)
    expect(ids).not.toContain('dupla-invicta')
    expect(ids).not.toContain('nota-minima')
    expect(ids).not.toContain('artilheiro')
    expect(ids).not.toContain('goleada')
  })

  it('sem curiosidades nenhumas devolve lista vazia', () => {
    expect(frasesDaPelada(null)).toEqual([])
    expect(fraseDoDia(null, 'x', '2026-08-10')).toBeNull()
  })

  it('uma goleada apertada não é goleada', () => {
    const ids = frasesDaPelada({
      ...cheio,
      goleada: { score_a: 3, score_b: 2, diferenca: 1 },
    }).map((f) => f.id)
    expect(ids).not.toContain('goleada')
  })
})

describe('fraseDoDia', () => {
  it('a mesma pessoa no mesmo dia vê sempre a mesma frase', () => {
    const a = fraseDoDia(cheio, 'marcos', '2026-08-10')
    const b = fraseDoDia(cheio, 'marcos', '2026-08-10')
    expect(a.id).toBe(b.id)
  })

  it('dias diferentes dão frases diferentes ao longo da semana', () => {
    const dias = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']
    const vistos = new Set(dias.map((d) => fraseDoDia(cheio, 'marcos', d).id))
    expect(vistos.size).toBeGreaterThan(1)
  })

  it('pessoas diferentes no mesmo dia não veem todas o mesmo', () => {
    const gente = ['marcos', 'wallace', 'flash', 'ana', 'bruno', 'zeca']
    const vistos = new Set(gente.map((p) => fraseDoDia(cheio, p, '2026-08-10').id))
    expect(vistos.size).toBeGreaterThan(1)
  })

  it('devolve sempre uma frase que existe mesmo', () => {
    const ids = frasesDaPelada(cheio).map((f) => f.id)
    expect(ids).toContain(fraseDoDia(cheio, 'seja-quem-for', '2026-01-01').id)
  })
})

describe('diaLocal', () => {
  it('usa a data local, não a UTC', () => {
    // 23:30 de 10/08 em horário local continua a ser dia 10
    expect(diaLocal(new Date(2026, 7, 10, 23, 30))).toBe('2026-08-10')
  })
})
