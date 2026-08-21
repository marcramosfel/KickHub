import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyError, getTelemetryContext, logError, report, resetTelemetry,
  scrub, setTelemetryContext, setTelemetrySink,
} from './telemetry'

afterEach(() => resetTelemetry())

describe('scrub', () => {
  it('não deixa sair um token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r'
    expect(scrub(`falhou com ${jwt}`)).not.toContain(jwt)
    expect(scrub(`falhou com ${jwt}`)).toContain('[redigido]')
  })

  it('não deixa sair um email', () => {
    expect(scrub('conflito para marcos@exemplo.pt')).toBe('conflito para [redigido]')
  })

  it('não deixa sair uma chave de serviço', () => {
    expect(scrub('key sb_secret_ABCDEFGHIJKLMNOPQRST')).toContain('[redigido]')
  })

  it('não deixa sair um número que pareça um cartão', () => {
    expect(scrub('ref 4111111111111111')).toBe('ref [redigido]')
  })

  it('corta o que é comprido de mais para caber num registo', () => {
    expect(scrub('x'.repeat(2000))).toHaveLength(500)
  })

  it('deixa passar o que é inofensivo', () => {
    expect(scrub('o sorteio falhou por falta de jogadores')).toBe('o sorteio falhou por falta de jogadores')
  })
})

describe('contexto', () => {
  it('acompanha tudo o que é reportado', () => {
    setTelemetryContext({ userId: 'u-1', peladaId: 'p-1', feature: 'sorteio' })
    const sink = vi.fn()
    setTelemetrySink(sink)
    logError('o sorteio falhou')
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ userId: 'u-1', peladaId: 'p-1', feature: 'sorteio' }),
    }))
  })

  it('acumula em vez de substituir o que já estava', () => {
    setTelemetryContext({ userId: 'u-1' })
    setTelemetryContext({ feature: 'ranking' })
    expect(getTelemetryContext()).toMatchObject({ userId: 'u-1', feature: 'ranking' })
  })
})

describe('report', () => {
  it('limpa também a mensagem e a pilha do erro', () => {
    const sink = vi.fn()
    setTelemetrySink(sink)
    const error = new Error('falhou para joana@exemplo.pt')
    error.stack = 'Error: falhou para joana@exemplo.pt\n  at algures'
    report('error', 'guardar resultado', error)
    const event = sink.mock.calls[0][0]
    expect(event.cause.message).not.toContain('joana@exemplo.pt')
    expect(event.cause.stack).not.toContain('joana@exemplo.pt')
  })

  it('aguenta quem atirou algo que não é um erro', () => {
    const sink = vi.fn()
    setTelemetrySink(sink)
    report('error', 'estranho', 'só uma string')
    expect(sink.mock.calls[0][0].cause).toMatchObject({ name: 'Unknown', message: 'só uma string' })
  })

  it('sem erro nenhum não inventa uma causa', () => {
    const sink = vi.fn()
    setTelemetrySink(sink)
    report('warning', 'nada de grave')
    expect(sink.mock.calls[0][0].cause).toBeNull()
  })

  it('sem destino ligado só a consola vê, e só os erros', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    report('warning', 'isto não vai para a consola')
    expect(spy).not.toHaveBeenCalled()
    report('error', 'isto vai')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('classifyError', () => {
  it('reconhece a falta de sessão', () => {
    expect(classifyError(new Error('AUTH_REQUIRED'))).toBe('auth')
  })

  it('reconhece uma recusa do RLS sem a mostrar', () => {
    expect(classifyError(new Error('new row violates row-level security policy'))).toBe('forbidden')
  })

  it('reconhece um conflito de unicidade', () => {
    expect(classifyError(new Error('duplicate key value violates unique constraint'))).toBe('conflict')
  })

  it('reconhece a rede', () => {
    expect(classifyError(new Error('Failed to fetch'))).toBe('network')
  })

  it('o que não reconhece fica desconhecido, e não inventa uma causa', () => {
    expect(classifyError(new Error('algo muito estranho'))).toBe('unknown')
    expect(classifyError(null)).toBe('unknown')
  })
})
