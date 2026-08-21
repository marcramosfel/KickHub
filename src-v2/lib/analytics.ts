/**
 * A camada de analytics.
 *
 * §51 é explícito: não espalhar chamadas do fornecedor pelo produto. O produto
 * chama `track()` e mais nada; trocar PostHog por Plausible passa a ser trocar
 * um `sink`, e não caçar chamadas por trinta ficheiros.
 *
 * Não há fornecedor nenhum ligado, e é de propósito. Escolher um é uma decisão
 * de produto e de privacidade — e enviar dados de utilizadores para um terceiro
 * antes de essa decisão estar tomada seria decidi-la por omissão. O que existe
 * é a estrutura, a fila e a atribuição, prontas para quando ele chegar.
 */

/** O catálogo de §51. Um evento fora desta lista não se envia por engano. */
export const ANALYTICS_EVENTS = [
  'signup_started', 'signup_completed',
  'pelada_created', 'pelada_discovered',
  'join_request_sent', 'join_request_approved',
  'game_created', 'game_joined',
  'draw_generated', 'result_submitted', 'rating_submitted',
  'share_clicked',
] as const

export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number]

/**
 * O funil de §52, pela ordem em que se percorre. Serve para as etapas terem um
 * nome só e não três variantes escritas à mão em sítios diferentes.
 */
export const FUNNEL_STEPS = [
  'landing', 'signup', 'joined_pelada', 'first_game', 'second_game', 'shared',
] as const

export type FunnelStep = typeof FUNNEL_STEPS[number]

export type AnalyticsProperties = Record<string, string | number | boolean | null>

export type AnalyticsPayload = {
  event: AnalyticsEvent
  properties: AnalyticsProperties
  /** Quem trouxe esta pessoa. Vai em todos os eventos da sessão. */
  attribution: Attribution
  at: string
}

export type AnalyticsSink = (payload: AnalyticsPayload) => void

/**
 * A atribuição de §53 e §54.
 *
 * `inviteCode` é o que liga uma conta nova a quem a convidou, e é por isso que
 * está aqui e não só no fluxo do convite: sem ele, o crescimento por convite
 * não se distingue do crescimento espontâneo.
 */
export type Attribution = {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  inviteCode: string | null
  /** O primeiro referrer externo desta sessão. */
  referrer: string | null
}

const EMPTY_ATTRIBUTION: Attribution = {
  utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
  inviteCode: null, referrer: null,
}

const STORAGE_KEY = 'kickhub-attribution'
/** A fila só existe para o arranque não perder eventos; não é um armazém. */
const MAX_QUEUE = 100

let sink: AnalyticsSink | null = null
let queue: AnalyticsPayload[] = []
let attribution: Attribution = EMPTY_ATTRIBUTION

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 120) : null
}

const isEmpty = (value: Attribution) =>
  Object.values(value).every((entry) => entry === null)

/**
 * Lê a atribuição do endereço e guarda-a.
 *
 * A primeira ganha: quem chega por uma campanha e depois navega pelo produto
 * não deixou de vir dessa campanha. Sobrepor a cada página fazia a última
 * página vista parecer a origem de toda a gente.
 */
export function captureAttribution(url: string, referrer?: string): Attribution {
  const stored = readStoredAttribution()
  if (stored && !isEmpty(stored)) {
    attribution = stored
    return attribution
  }

  let params: URLSearchParams
  try {
    params = new URL(url, 'https://kickhub.app').searchParams
  } catch {
    params = new URLSearchParams()
  }

  const captured: Attribution = {
    utmSource: clean(params.get('utm_source')),
    utmMedium: clean(params.get('utm_medium')),
    utmCampaign: clean(params.get('utm_campaign')),
    utmContent: clean(params.get('utm_content')),
    inviteCode: clean(params.get('invite') ?? params.get('invite_code')),
    // Um referrer do próprio site não é uma origem; é navegação.
    referrer: clean(referrer && !referrer.includes('kickhub') ? referrer : null),
  }

  attribution = captured
  if (!isEmpty(captured)) writeStoredAttribution(captured)
  return attribution
}

function readStoredAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Attribution>
    return { ...EMPTY_ATTRIBUTION, ...parsed }
  } catch {
    return null
  }
}

function writeStoredAttribution(value: Attribution) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* sessão anónima */ }
}

export function getAttribution() {
  return attribution
}

/**
 * Liga um fornecedor. Os eventos que aconteceram antes disto são entregues de
 * uma vez — o arranque da app produz eventos antes de qualquer script externo
 * carregar, e perdê-los deixava o funil sem o primeiro degrau.
 */
export function setAnalyticsSink(next: AnalyticsSink | null) {
  sink = next
  if (!next) return
  const pending = queue
  queue = []
  for (const payload of pending) next(payload)
}

export function track(event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  const payload: AnalyticsPayload = {
    event,
    properties,
    attribution,
    // A hora do cliente é aproximada e assume-se como tal: quem receber isto
    // tem o seu próprio relógio para o que precisar de ser exacto.
    at: new Date().toISOString(),
  }
  if (sink) {
    sink(payload)
    return payload
  }
  queue.push(payload)
  if (queue.length > MAX_QUEUE) queue.shift()
  return payload
}

/** Uma etapa do funil é um evento como os outros, com um nome estável. */
export function trackFunnel(step: FunnelStep, properties: AnalyticsProperties = {}) {
  const event: AnalyticsEvent = step === 'signup' ? 'signup_completed'
    : step === 'joined_pelada' ? 'join_request_approved'
      : step === 'shared' ? 'share_clicked'
        : 'pelada_discovered'
  return track(event, { ...properties, funnel_step: step })
}

/** Só para os testes: devolve a app ao estado de arranque. */
export function resetAnalytics() {
  sink = null
  queue = []
  attribution = EMPTY_ATTRIBUTION
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* sessão anónima */ }
}

export function pendingEvents() {
  return [...queue]
}
