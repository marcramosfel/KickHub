import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DIAS_ATE_FECHAR,
  VOTACAO,
  estadoDaVotacao,
  faltaVotarTexto,
  pendenciasReais,
  prazoLegivel,
  prazoParaInput,
  prazoPorOmissao,
  temPendencia,
  tempoAteFechar,
} from './voting.js'
import {
  ROTAS,
  escreverHash,
  esquecerToken,
  guardarToken,
  lerHash,
  lerToken,
  urlDaVotacao,
} from './router.js'

describe('prazoPorOmissao', () => {
  it('um jogo à sexta fecha na terça às 23:59 — a regra que o grupo pediu', () => {
    const sexta = new Date('2026-08-07T21:00:00')
    const p = prazoPorOmissao(sexta.toISOString())
    expect(p.getDay()).toBe(2) // terça
    expect(p.getDate()).toBe(11)
    expect(p.getHours()).toBe(23)
    expect(p.getMinutes()).toBe(59)
  })

  it('generaliza para jogos a meio da semana (é +4 dias, não "terça")', () => {
    // ler "até terça" à letra dava prazos absurdos a um jogo de quarta
    const quarta = new Date('2026-08-05T20:00:00')
    const p = prazoPorOmissao(quarta.toISOString())
    expect(p.getDay()).toBe(0) // domingo
    expect(p.getHours()).toBe(23)
  })

  it('sem data de jogo conta a partir de agora, em vez de rebentar', () => {
    const p = prazoPorOmissao(null)
    expect(p).toBeInstanceOf(Date)
    expect(p.getTime()).toBeGreaterThan(Date.now())
  })

  it('uma data inválida devolve null em vez de "Invalid Date"', () => {
    expect(prazoPorOmissao('não é data')).toBe(null)
  })

  it('o número de dias é o mesmo que o servidor usa', () => {
    expect(DIAS_ATE_FECHAR).toBe(4)
  })
})

describe('tempoAteFechar', () => {
  const agora = new Date('2026-08-10T12:00:00Z')

  it('conta dias e horas quando falta mais de um dia', () => {
    const t = tempoAteFechar('2026-08-12T14:00:00Z', agora)
    expect(t.expirado).toBe(false)
    expect(t.texto).toBe('2d 2h')
    expect(t.urgente).toBe(false)
  })

  it('marca como urgente quando falta menos de 6 horas', () => {
    const t = tempoAteFechar('2026-08-10T15:00:00Z', agora)
    expect(t.urgente).toBe(true)
    expect(t.texto).toBe('3h 0min')
  })

  it('nunca mostra "0min": o último minuto ainda conta', () => {
    const t = tempoAteFechar('2026-08-10T12:00:20Z', agora)
    expect(t.expirado).toBe(false)
    expect(t.texto).toBe('1min')
  })

  it('um prazo passado é expirado', () => {
    const t = tempoAteFechar('2026-08-09T12:00:00Z', agora)
    expect(t.expirado).toBe(true)
    expect(t.ms).toBe(0)
  })

  it('sem prazo, "não sei" nunca vira "expirado"', () => {
    // a mesma regra do lifecycle: não saber não pode virar uma afirmação
    const t = tempoAteFechar(null, agora)
    expect(t.conhecido).toBe(false)
    expect(t.expirado).toBe(false)
  })
})

describe('estadoDaVotacao', () => {
  const agora = new Date('2026-08-10T12:00:00Z')

  it('aberta com prazo no futuro fica aberta', () => {
    const v = estadoDaVotacao(
      { voting_status: 'OPEN', voting_deadline: '2026-08-12T00:00:00Z' },
      agora
    )
    expect(v.aberta).toBe(true)
    expect(v.estado).toBe(VOTACAO.OPEN)
  })

  it('aberta com o prazo já passado lê-se como revisão, não como aberta', () => {
    // o servidor fecha-a na primeira leitura, mas entre a expiração e o
    // próximo carregamento o ecrã não pode continuar a convidar a votar
    const v = estadoDaVotacao(
      { voting_status: 'OPEN', voting_deadline: '2026-08-09T00:00:00Z' },
      agora
    )
    expect(v.aberta).toBe(false)
    expect(v.emRevisao).toBe(true)
  })

  it('sem prazo definido, uma votação aberta continua aberta', () => {
    const v = estadoDaVotacao({ voting_status: 'OPEN' }, agora)
    expect(v.aberta).toBe(true)
  })

  it('um jogo sem votação nenhuma não está aberto nem em revisão', () => {
    const v = estadoDaVotacao({}, agora)
    expect(v.estado).toBe(VOTACAO.NONE)
    expect(v.aberta).toBe(false)
    expect(v.emRevisao).toBe(false)
  })

  it('traz a participação já em números', () => {
    const v = estadoDaVotacao(
      { voting_status: 'CLOSED', voting_voters: 9, voting_total: 14, voting_pct: 64 },
      agora
    )
    expect(v.fechada).toBe(true)
    expect(v.votantes).toBe(9)
    expect(v.total).toBe(14)
  })
})

describe('pendências', () => {
  it('só conta como pendência o que tem mesmo algo por fazer', () => {
    expect(temPendencia({ falta_premio: true, falta_estrelas: 0 })).toBe(true)
    expect(temPendencia({ falta_premio: false, falta_estrelas: 3 })).toBe(true)
    // a rodada continuar aberta não é razão para avisar quem já votou
    expect(temPendencia({ falta_premio: false, falta_estrelas: 0 })).toBe(false)
    expect(temPendencia(null)).toBe(false)
  })

  it('filtra a lista toda de uma vez', () => {
    const lista = [
      { match_id: 'a', falta_premio: true, falta_estrelas: 0 },
      { match_id: 'b', falta_premio: false, falta_estrelas: 0 },
      { match_id: 'c', falta_premio: false, falta_estrelas: 2 },
    ]
    expect(pendenciasReais(lista).map((p) => p.match_id)).toEqual(['a', 'c'])
    expect(pendenciasReais(null)).toEqual([])
  })

  it('descreve o que falta em texto curto', () => {
    expect(faltaVotarTexto({ falta_premio: true, falta_estrelas: 3 })).toBe(
      'craque e bagre · 3 avaliações'
    )
    expect(faltaVotarTexto({ falta_premio: false, falta_estrelas: 1 })).toBe('1 avaliação')
    expect(faltaVotarTexto({ falta_premio: false, falta_estrelas: 0 })).toBe('')
  })
})

describe('formatação do prazo', () => {
  it('prazoLegivel diz o dia da semana e a hora', () => {
    const texto = prazoLegivel('2026-08-11T22:59:00Z')
    expect(texto).toMatch(/terça/i)
    expect(texto).toMatch(/23:59/)
  })

  it('prazoParaInput dá o formato do datetime-local', () => {
    expect(prazoParaInput('2026-08-11T22:59:00Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('nada entra, nada sai — sem "Invalid Date" no ecrã', () => {
    expect(prazoLegivel(null)).toBe('')
    expect(prazoLegivel('xpto')).toBe('')
    expect(prazoParaInput(null)).toBe('')
    expect(prazoParaInput('xpto')).toBe('')
  })
})

describe('router por hash', () => {
  it('lê a rota da votação', () => {
    expect(lerHash('#/votar/abc-123')).toEqual({ rota: 'votar', id: 'abc-123' })
    expect(lerHash('#/jogo/xyz')).toEqual({ rota: 'jogo', id: 'xyz' })
  })

  it('ignora rotas que não conhece — um hash estranho não parte a app', () => {
    expect(lerHash('#/admin')).toEqual({ rota: null, id: null })
    expect(lerHash('#qualquer-coisa')).toEqual({ rota: null, id: null })
    expect(lerHash('')).toEqual({ rota: null, id: null })
    expect(lerHash('#/')).toEqual({ rota: null, id: null })
  })

  it('aceita a rota sem id', () => {
    expect(lerHash('#/votar')).toEqual({ rota: 'votar', id: null })
  })

  it('escreve e volta a ler o mesmo (ida e volta)', () => {
    const h = escreverHash(ROTAS.VOTAR, 'id com espaço')
    expect(lerHash(h)).toEqual({ rota: 'votar', id: 'id com espaço' })
  })

  it('o link da votação aponta para a cédula daquele jogo', () => {
    expect(urlDaVotacao('m1', 'https://pelada.app/')).toBe('https://pelada.app/#/votar/m1')
  })
})

describe('token do dispositivo', () => {
  beforeEach(() => esquecerToken())
  afterEach(() => esquecerToken())

  it('guarda e lê o token', () => {
    expect(lerToken()).toBe(null)
    expect(guardarToken('tok-1')).toBe(true)
    expect(lerToken()).toBe('tok-1')
  })

  it('esquecer apaga mesmo — é o que faz o "sair" querer dizer alguma coisa', () => {
    guardarToken('tok-1')
    esquecerToken()
    expect(lerToken()).toBe(null)
  })

  it('guardar nada não guarda nada', () => {
    expect(guardarToken(null)).toBe(false)
    expect(lerToken()).toBe(null)
  })
})
