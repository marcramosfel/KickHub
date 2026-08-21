import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANALYTICS_EVENTS, captureAttribution, getAttribution, pendingEvents,
  resetAnalytics, setAnalyticsSink, track, trackFunnel,
} from './analytics'

describe('analytics', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAnalytics()
  })
  afterEach(() => resetAnalytics())

  it('não perde os eventos que acontecem antes de haver fornecedor', () => {
    track('signup_started')
    track('pelada_discovered')
    expect(pendingEvents()).toHaveLength(2)

    const sink = vi.fn()
    setAnalyticsSink(sink)
    expect(sink).toHaveBeenCalledTimes(2)
    // A fila esvazia-se ao entregar: não é um armazém.
    expect(pendingEvents()).toHaveLength(0)
  })

  it('sem fornecedor não sai nada para lado nenhum', () => {
    const payload = track('share_clicked', { title: 'Seleção' })
    expect(payload.event).toBe('share_clicked')
    expect(pendingEvents()).toHaveLength(1)
  })

  it('a fila tem tecto, para uma sessão longa não crescer sem fim', () => {
    for (let index = 0; index < 150; index += 1) track('game_joined', { index })
    expect(pendingEvents().length).toBeLessThanOrEqual(100)
    // O tecto deita fora os mais velhos, e não os mais recentes.
    expect(pendingEvents().at(-1)?.properties.index).toBe(149)
  })

  it('entrega ao fornecedor assim que ele existe', () => {
    const sink = vi.fn()
    setAnalyticsSink(sink)
    track('draw_generated', { pelada_id: 'p-1' })
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({
      event: 'draw_generated',
      properties: { pelada_id: 'p-1' },
    }))
  })

  it('o catálogo de eventos é o de §51', () => {
    expect(ANALYTICS_EVENTS).toContain('signup_started')
    expect(ANALYTICS_EVENTS).toContain('result_submitted')
    expect(ANALYTICS_EVENTS).toContain('rating_submitted')
  })
})

describe('atribuição', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAnalytics()
  })
  afterEach(() => resetAnalytics())

  it('lê as UTM e o código de convite do endereço', () => {
    const attribution = captureAttribution(
      'https://kickhub.app/?utm_source=whatsapp&utm_medium=group&utm_campaign=browns&utm_content=poster&invite=ABC123',
    )
    expect(attribution).toMatchObject({
      utmSource: 'whatsapp', utmMedium: 'group', utmCampaign: 'browns',
      utmContent: 'poster', inviteCode: 'ABC123',
    })
  })

  it('a primeira origem ganha — navegar não muda de onde se veio', () => {
    captureAttribution('https://kickhub.app/?utm_source=whatsapp')
    captureAttribution('https://kickhub.app/descobrir?utm_source=instagram')
    expect(getAttribution().utmSource).toBe('whatsapp')
  })

  it('um referrer do próprio site não é uma origem', () => {
    const attribution = captureAttribution('https://kickhub.app/app', 'https://kickhub.app/')
    expect(attribution.referrer).toBeNull()
  })

  it('guarda um referrer externo', () => {
    const attribution = captureAttribution('https://kickhub.app/', 'https://t.co/abc')
    expect(attribution.referrer).toBe('https://t.co/abc')
  })

  it('um endereço sem campanha nenhuma não inventa uma', () => {
    expect(captureAttribution('https://kickhub.app/')).toEqual({
      utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
      inviteCode: null, referrer: null,
    })
  })

  it('a atribuição acompanha cada evento', () => {
    captureAttribution('https://kickhub.app/?utm_campaign=browns')
    const sink = vi.fn()
    setAnalyticsSink(sink)
    track('signup_completed')
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({
      attribution: expect.objectContaining({ utmCampaign: 'browns' }),
    }))
  })

  it('aguenta um endereço que não é endereço nenhum', () => {
    expect(() => captureAttribution('nem-sequer-um-url')).not.toThrow()
  })
})

describe('funil', () => {
  beforeEach(() => { localStorage.clear(); resetAnalytics() })
  afterEach(() => resetAnalytics())

  it('marca a etapa sem inventar um evento fora do catálogo', () => {
    const payload = trackFunnel('first_game', { pelada_id: 'p-1' })
    expect(ANALYTICS_EVENTS).toContain(payload.event)
    expect(payload.properties.funnel_step).toBe('first_game')
  })
})
