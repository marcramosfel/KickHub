/**
 * Registo centralizado de erros (§63).
 *
 * O contexto que um erro precisa de ter — quem, que pelada, que funcionalidade
 * — nunca está no sítio onde o erro rebenta. Por isso o contexto anexa-se à
 * sessão e vai com tudo o que for reportado, em vez de ser passado de função
 * em função até alguém se esquecer.
 *
 * O que NUNCA sai daqui: tokens, chaves, emails, mensagens de base de dados em
 * bruto. §63 pede contexto suficiente "sem armazenar informações sensíveis
 * indevidas", e a única forma de garantir isso é limpar à saída em vez de
 * confiar em quem chama.
 *
 * Não há Sentry ligado. A estrutura é a mesma que ele quer receber, e ligá-lo
 * passa a ser um `setTelemetrySink`.
 */
export type TelemetryLevel = 'info' | 'warning' | 'error'

export type TelemetryContext = {
  userId: string | null
  peladaId: string | null
  feature: string | null
  locale: string | null
}

export type TelemetryEvent = {
  level: TelemetryLevel
  message: string
  context: TelemetryContext
  /** O que sobra de um erro depois de limpo: nome, mensagem e origem. */
  cause: { name: string; message: string; stack: string | null } | null
  extra: Record<string, string | number | boolean | null>
  at: string
}

export type TelemetrySink = (event: TelemetryEvent) => void

const EMPTY_CONTEXT: TelemetryContext = { userId: null, peladaId: null, feature: null, locale: null }

let context: TelemetryContext = EMPTY_CONTEXT
let sink: TelemetrySink | null = null

/**
 * Padrões que não podem sair da aplicação, em nenhum campo.
 *
 * Isto não substitui não os pôr lá — é a última barreira antes de o texto sair
 * para um terceiro, e existe porque uma mensagem de erro do Postgres pode
 * trazer o conteúdo de uma linha sem ninguém a pedir.
 */
const SECRETS = [
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,               // email
  /\b(sb|sk|pk)_[A-Za-z0-9_-]{16,}\b/g,                                // chaves
  /\b[0-9]{13,19}\b/g,                                                 // cartões
]

const MAX_LENGTH = 500

export function scrub(value: string) {
  let output = value
  for (const pattern of SECRETS) output = output.replace(pattern, '[redigido]')
  return output.slice(0, MAX_LENGTH)
}

export function setTelemetryContext(next: Partial<TelemetryContext>) {
  context = { ...context, ...next }
  return context
}

export function getTelemetryContext() {
  return context
}

export function setTelemetrySink(next: TelemetrySink | null) {
  sink = next
}

function toCause(error: unknown): TelemetryEvent['cause'] {
  if (!(error instanceof Error)) {
    return error === undefined || error === null
      ? null
      : { name: 'Unknown', message: scrub(String(error)), stack: null }
  }
  return {
    name: error.name,
    message: scrub(error.message),
    // A pilha é o que diz onde foi, e também o que mais facilmente traz um
    // caminho com o nome de alguém. Limpa-se como o resto.
    stack: error.stack ? scrub(error.stack) : null,
  }
}

export function report(
  level: TelemetryLevel,
  message: string,
  error?: unknown,
  extra: TelemetryEvent['extra'] = {},
) {
  const event: TelemetryEvent = {
    level,
    message: scrub(message),
    context,
    cause: toCause(error),
    extra,
    at: new Date().toISOString(),
  }
  if (sink) sink(event)
  // Sem destino ligado, a consola é o destino — e só para o que é mesmo um
  // erro. Encher a consola de `info` esconde o que interessa.
  else if (level === 'error' && typeof console !== 'undefined') console.error(event.message, event)
  return event
}

export const logError = (message: string, error?: unknown, extra?: TelemetryEvent['extra']) =>
  report('error', message, error, extra)
export const logWarning = (message: string, extra?: TelemetryEvent['extra']) =>
  report('warning', message, undefined, extra)

/** Só para os testes: devolve o módulo ao estado de arranque. */
export function resetTelemetry() {
  context = EMPTY_CONTEXT
  sink = null
}

/**
 * A mensagem que uma pessoa vê quando algo falha (§64).
 *
 * Nunca a do servidor. "duplicate key value violates unique constraint" não
 * ajuda ninguém e diz mais sobre a base de dados do que devia — o que a pessoa
 * precisa de saber é se pode tentar outra vez.
 */
export type UserFacingError = 'auth' | 'forbidden' | 'notFound' | 'conflict' | 'network' | 'unknown'

export function classifyError(error: unknown): UserFacingError {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  if (/AUTH_REQUIRED|JWT|not authenticated/i.test(raw)) return 'auth'
  if (/FORBIDDEN|permission denied|row-level security/i.test(raw)) return 'forbidden'
  if (/NOT_FOUND|no rows/i.test(raw)) return 'notFound'
  if (/duplicate key|already|conflict/i.test(raw)) return 'conflict'
  if (/fetch|network|timeout|ECONN/i.test(raw)) return 'network'
  return 'unknown'
}
