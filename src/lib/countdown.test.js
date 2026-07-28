import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// Sem JSX: este ficheiro é .js e o Vite só transforma JSX em .jsx.
import { createElement as h, useEffect } from 'react'
import { act, render, screen } from '@testing-library/react'
import Countdown from '../components/Countdown'
import {
  TIMEZONE,
  DURACAO_JOGO_MS,
  JANELA_IMINENTE_MS,
  estadoDoJogo,
  formatarDataDoJogo,
  partesDoTempo,
} from './countdown'

// Datas fixas em tudo: o teste nunca pode depender do relógio nem do fuso da
// máquina que o corre.
const KICKOFF = '2026-07-29T18:00:00Z' // quarta, 19:00 em Lisboa (horário de verão)
const minutos = (n) => n * 60 * 1000
const horas = (n) => minutos(60 * n)
const dias = (n) => horas(24 * n)
const antes = (ms) => new Date(new Date(KICKOFF).getTime() - ms)
const depois = (ms) => new Date(new Date(KICKOFF).getTime() + ms)

describe('estadoDoJogo', () => {
  it('as janelas são as combinadas: 1h para "iminente", 2h de jogo', () => {
    expect(JANELA_IMINENTE_MS).toBe(horas(1))
    expect(DURACAO_JOGO_MS).toBe(horas(2))
  })

  it('conta os dias que faltam quando o jogo está longe', () => {
    const r = estadoDoJogo(KICKOFF, antes(dias(2) + horas(3) + minutos(4) + 5000))
    expect(r.estado).toBe('a-contar')
    expect(r.dias).toBe(2)
    expect(r.horas).toBe(3)
    expect(r.minutos).toBe(4)
    expect(r.segundos).toBe(5)
    expect(r.ms).toBe(dias(2) + horas(3) + minutos(4) + 5000)
    expect(r.texto).toContain('2 dias')
  })

  it('fica iminente na última hora', () => {
    const r = estadoDoJogo(KICKOFF, antes(minutos(30)))
    expect(r.estado).toBe('iminente')
    expect(r.texto).toBe('O jogo começa em breve')
    expect(r.minutos).toBe(30)
  })

  it('a fronteira de 1 hora ainda é contagem normal', () => {
    expect(estadoDoJogo(KICKOFF, antes(horas(1))).estado).toBe('a-contar')
    expect(estadoDoJogo(KICKOFF, antes(horas(1) - 1000)).estado).toBe('iminente')
  })

  it('passa a "a decorrer" logo depois da hora marcada', () => {
    const r = estadoDoJogo(KICKOFF, depois(minutos(10)))
    expect(r.estado).toBe('a-decorrer')
    expect(r.texto).toBe('Jogo em andamento')
    expect(r.ms).toBe(0)
    expect(r.msDecorridos).toBe(minutos(10))
  })

  it('a hora exata do apito já é "a decorrer"', () => {
    expect(estadoDoJogo(KICKOFF, new Date(KICKOFF)).estado).toBe('a-decorrer')
  })

  it('pede o resultado passadas mais de 2 horas', () => {
    const r = estadoDoJogo(KICKOFF, depois(horas(5)))
    expect(r.estado).toBe('aguarda-resultado')
    expect(r.texto).toBe('Aguardando resultado')
  })

  it('a fronteira exata das 2 horas já pede o resultado', () => {
    expect(estadoDoJogo(KICKOFF, depois(horas(2) - 1000)).estado).toBe('a-decorrer')
    expect(estadoDoJogo(KICKOFF, depois(horas(2))).estado).toBe('aguarda-resultado')
  })

  it('IN_PROGRESS mantém "a decorrer" mesmo passadas as 2 horas', () => {
    expect(estadoDoJogo(KICKOFF, depois(horas(5)), 'IN_PROGRESS').estado).toBe('a-decorrer')
  })

  it('CANCELLED manda sobre o relógio', () => {
    for (const agora of [antes(dias(2)), antes(minutos(30)), depois(horas(5))]) {
      const r = estadoDoJogo(KICKOFF, agora, 'CANCELLED')
      expect(r.estado).toBe('cancelado')
      expect(r.texto).toBe('Jogo cancelado')
    }
  })

  it('COMPLETED manda sobre o relógio', () => {
    for (const agora of [antes(dias(2)), depois(minutos(10))]) {
      const r = estadoDoJogo(KICKOFF, agora, 'COMPLETED')
      expect(r.estado).toBe('concluido')
      expect(r.texto).toBe('Jogo concluído')
    }
  })

  it('os estados do agendamento (DRAFT/PUBLISHED) não desviam a contagem', () => {
    // A migração 0016 guarda estes literais; só CANCELLED/COMPLETED/IN_PROGRESS
    // têm significado aqui — os outros deixam o relógio decidir.
    expect(estadoDoJogo(KICKOFF, antes(dias(2)), 'PUBLISHED').estado).toBe('a-contar')
    expect(estadoDoJogo(KICKOFF, antes(dias(2)), 'DRAFT').estado).toBe('a-contar')
  })

  it('sem kickoff (ou com data inválida) devolve sem-jogo', () => {
    expect(estadoDoJogo(null, antes(dias(1))).estado).toBe('sem-jogo')
    expect(estadoDoJogo(undefined).estado).toBe('sem-jogo')
    expect(estadoDoJogo('', antes(dias(1))).estado).toBe('sem-jogo')
    expect(estadoDoJogo('nao-e-uma-data', antes(dias(1))).estado).toBe('sem-jogo')
  })

  it('aceita o "agora" como timestamp em ms (é o que o componente passa)', () => {
    const agora = antes(dias(2) + horas(3))
    expect(estadoDoJogo(KICKOFF, agora.getTime())).toEqual(estadoDoJogo(KICKOFF, agora))
  })

  it('nunca lê o relógio real quando lhe dão o instante', () => {
    // Relógio do sistema depois do jogo; o resultado tem de sair do parâmetro.
    vi.useFakeTimers()
    vi.setSystemTime(depois(dias(30)))
    try {
      expect(estadoDoJogo(KICKOFF, antes(dias(2))).estado).toBe('a-contar')
      expect(estadoDoJogo(KICKOFF, 0).estado).toBe('a-contar') // 1970 é antes do jogo
    } finally {
      vi.useRealTimers()
    }
  })

  it('é estável: o mesmo instante dá sempre o mesmo resultado (recarregar não perde nada)', () => {
    const agora = antes(dias(1) + horas(2))
    expect(estadoDoJogo(KICKOFF, agora)).toEqual(estadoDoJogo(KICKOFF, agora))
  })
})

describe('partesDoTempo', () => {
  it('parte a duração e devolve strings de 2 dígitos', () => {
    const p = partesDoTempo(dias(1) + horas(2) + minutos(3) + 4000)
    expect(p).toMatchObject({ dias: 1, horas: 2, minutos: 3, segundos: 4 })
    expect([p.ddStr, p.hhStr, p.mmStr, p.ssStr]).toEqual(['01', '02', '03', '04'])
  })

  it('nunca devolve negativos', () => {
    expect(partesDoTempo(-5000)).toMatchObject({ dias: 0, horas: 0, minutos: 0, segundos: 0 })
  })

  it('aguenta lixo (undefined/NaN) sem rebentar', () => {
    for (const lixo of [undefined, null, NaN, 'abc']) {
      expect(partesDoTempo(lixo)).toMatchObject({ dias: 0, horas: 0, minutos: 0, segundos: 0 })
    }
  })

  it('não estoura o campo dos dias numa contagem longa', () => {
    expect(partesDoTempo(dias(120)).ddStr).toBe('120')
  })
})

describe('formatarDataDoJogo', () => {
  it('formata em pt-PT no fuso de Lisboa (horário de verão: UTC+1)', () => {
    const d = formatarDataDoJogo(KICKOFF)
    expect(d.diaDaSemana).toBe('Quarta-feira')
    expect(d.data).toBe('29 de julho')
    expect(d.hora).toBe('19:00')
    expect(d.completo).toBe('Quarta-feira, 29 de julho às 19:00')
  })

  it('no inverno Lisboa está em UTC+0', () => {
    // 19:00Z em janeiro são 19:00 em Lisboa; em julho seriam 20:00.
    expect(formatarDataDoJogo('2026-01-14T19:00:00Z').hora).toBe('19:00')
    expect(formatarDataDoJogo('2026-07-15T19:00:00Z').hora).toBe('20:00')
  })

  it('a meia-noite é 00:00 e não 24:00', () => {
    expect(formatarDataDoJogo('2026-07-29T23:00:00Z').hora).toBe('00:00')
  })

  it('aceita o ISO com fuso que o Postgres devolve', () => {
    // timestamptz sai do PostgREST como "...+00:00" — tem de dar o mesmo.
    expect(formatarDataDoJogo('2026-07-29T18:00:00+00:00').completo)
      .toBe(formatarDataDoJogo(KICKOFF).completo)
  })

  it('sem data (ou com data inválida) devolve campos vazios', () => {
    const vazio = { diaDaSemana: '', data: '', hora: '', completo: '' }
    expect(formatarDataDoJogo(null)).toEqual(vazio)
    expect(formatarDataDoJogo('nao-e-uma-data')).toEqual(vazio)
  })

  it('o fuso é o de Lisboa', () => {
    expect(TIMEZONE).toBe('Europe/Lisbon')
  })
})

// --- componente -----------------------------------------------------------

const UNIDADES = ['DIAS', 'HORAS', 'MIN', 'SEG']

// Lê os quatro blocos como { DIAS: '02', HORAS: '03', ... }. Comparar o
// textContent inteiro não serve: '04' aparece em dois blocos ao mesmo tempo e
// um teste desses passa mesmo que a contagem esteja parada.
const blocos = (container) => {
  const saida = {}
  for (const el of container.querySelectorAll('div')) {
    const [valor, etiqueta] = el.children
    if (etiqueta && UNIDADES.includes(etiqueta.textContent)) {
      saida[etiqueta.textContent] = valor.textContent
    }
  }
  return saida
}

const etiquetaAcessivel = () => screen.getByRole('timer').getAttribute('aria-label')

let rendersDoPai = 0

// Conta os renders no efeito (nunca durante o render, que tem de ser puro).
function Pai() {
  useEffect(() => {
    rendersDoPai += 1
  })
  return h('div', null, h(Countdown, { kickoffAt: KICKOFF }))
}

describe('<Countdown />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const montar = (instante, props = {}) => {
    vi.setSystemTime(instante)
    const utils = render(h(Countdown, { kickoffAt: KICKOFF, ...props }))
    act(() => vi.advanceTimersByTime(0)) // primeira leitura do relógio
    return utils
  }

  it('mostra os quatro blocos e acerta ao segundo', () => {
    const { container } = montar(antes(dias(2) + horas(3) + minutos(4) + 5000))
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(blocos(container)).toEqual({ DIAS: '02', HORAS: '03', MIN: '04', SEG: '05' })

    act(() => vi.advanceTimersByTime(1000))
    expect(blocos(container)).toEqual({ DIAS: '02', HORAS: '03', MIN: '04', SEG: '04' })

    act(() => vi.advanceTimersByTime(5000))
    expect(blocos(container)).toEqual({ DIAS: '02', HORAS: '03', MIN: '03', SEG: '59' })
  })

  it('não lê o relógio durante o render: só depois da montagem é que há números', () => {
    vi.setSystemTime(antes(dias(2)))
    const { container } = render(h(Countdown, { kickoffAt: KICKOFF }))
    expect(blocos(container)).toEqual({ DIAS: '--', HORAS: '--', MIN: '--', SEG: '--' })
    act(() => vi.advanceTimersByTime(0))
    expect(blocos(container)).toEqual({ DIAS: '02', HORAS: '00', MIN: '00', SEG: '00' })
  })

  it('não re-renderiza o pai a cada segundo', () => {
    vi.setSystemTime(antes(dias(1)))
    rendersDoPai = 0
    render(h(Pai))
    act(() => vi.advanceTimersByTime(0))
    const depoisDeMontar = rendersDoPai

    act(() => vi.advanceTimersByTime(5000))
    expect(rendersDoPai).toBe(depoisDeMontar) // o tique fica preso no Countdown
  })

  it('limpa o intervalo ao desmontar', () => {
    const { unmount } = montar(antes(dias(1)))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fora da contagem não há tique ao segundo, só ao minuto', () => {
    const { container } = montar(antes(minutos(30)))
    expect(container.textContent).toContain('Faltam 30 min')

    // Com um intervalo de 1s isto já mostraria 29 min: aos 30s ainda faltam
    // 29m30s. Só ao fim do minuto é que o cartão pode mexer.
    act(() => vi.advanceTimersByTime(30000))
    expect(container.textContent).toContain('Faltam 30 min')

    act(() => vi.advanceTimersByTime(30000))
    expect(container.textContent).toContain('Faltam 29 min')
  })

  it('os estados terminais não deixam temporizadores a correr', () => {
    for (const props of [{ status: 'CANCELLED' }, { status: 'COMPLETED' }, { kickoffAt: null }]) {
      const { unmount } = montar(antes(dias(1)), props)
      expect(vi.getTimerCount()).toBe(0)
      unmount()
    }
  })

  it('"aguarda resultado" também não fica a repintar-se para sempre', () => {
    montar(depois(horas(5)))
    expect(screen.getByRole('timer').textContent).toContain('Aguardando resultado')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('atravessa sozinho a-contar → iminente → a decorrer', () => {
    const { container } = montar(antes(minutos(61)))
    expect(blocos(container).MIN).toBe('01')

    act(() => vi.advanceTimersByTime(minutos(2))) // entra na última hora
    expect(container.textContent).toContain('O jogo começa em breve')

    act(() => vi.advanceTimersByTime(horas(1))) // apito inicial
    expect(container.textContent).toContain('Jogo em andamento')
  })

  it('mostra cartão com ícone e texto nos estados especiais', () => {
    const { container } = montar(antes(dias(1)), { status: 'CANCELLED' })
    expect(container.textContent).toContain('Jogo cancelado')
    expect(container.textContent).toContain('🚫')
    expect(blocos(container)).toEqual({}) // sem blocos a "--" antes do cartão
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off')
  })

  it('sem jogo marcado diz-lo em vez de contar', () => {
    const { container } = montar(antes(dias(1)), { kickoffAt: null })
    expect(container.textContent).toContain('Sem jogo marcado')
    expect(etiquetaAcessivel()).toContain('Sem jogo marcado')
  })

  it('a etiqueta acessível descreve a falta sem segundos', () => {
    montar(antes(dias(2) + horas(3) + minutos(4) + 5000))
    const label = etiquetaAcessivel()
    expect(label).toContain('2 dias')
    expect(label).toContain('4 minutos')
    expect(label).toContain('29 de julho')
    expect(label).not.toMatch(/segundo/i)
  })

  it('a etiqueta acessível só muda de minuto a minuto', () => {
    montar(antes(dias(2) + horas(3) + minutos(4) + 5000))
    const inicial = etiquetaAcessivel()

    act(() => vi.advanceTimersByTime(3000)) // os segundos correm...
    expect(etiquetaAcessivel()).toBe(inicial) // ...mas o leitor de ecrã não é incomodado

    act(() => vi.advanceTimersByTime(minutos(1)))
    expect(etiquetaAcessivel()).not.toBe(inicial)
  })

  it('recarregar a página não perde a contagem', () => {
    const t0 = antes(dias(1) + horas(2) + minutos(3) + 4000)
    const primeiro = montar(t0)
    act(() => vi.advanceTimersByTime(5000))
    const antesDeRecarregar = blocos(primeiro.container)
    primeiro.unmount()

    // "Recarregar" = montar de novo cinco segundos depois, sem estado nenhum.
    const segundo = montar(new Date(t0.getTime() + 5000))
    expect(blocos(segundo.container)).toEqual(antesDeRecarregar)
  })

  it('a versão compacta cabe numa linha', () => {
    const { container } = montar(antes(dias(2) + horas(3)), { compacto: true })
    expect(container.textContent).toContain('02d 03h 00m 00s')
    expect(container.textContent).not.toContain('DIAS')
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off')
  })
})
