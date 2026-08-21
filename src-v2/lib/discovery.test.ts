import { beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverPeladas, isFull, listPeladaRegions, toDiscoveredPelada } from './discovery'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: mocks.rpc } }))

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'pelada-1', slug: 'browns', name: 'Pelada Browns', description: 'Sextas em Vilamoura',
  country_code: 'PT', region: 'Algarve', city: 'Vilamoura', join_mode: 'approval',
  timezone: 'Europe/Lisbon', member_count: 28, default_format: '7x7', frequency: 'weekly',
  skill_level: 'mixed', match_weekday: 5, match_time: '19:00:00', max_players: 30,
  distance_km: 4.2, location: { lat: 37.08, lon: -8.11, precision: 'approximate' },
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('toDiscoveredPelada', () => {
  it('lê a linha do servidor sem inventar o que falta', () => {
    const pelada = toDiscoveredPelada(row())
    expect(pelada.city).toBe('Vilamoura')
    expect(pelada.members).toBe(28)
    expect(pelada.distanceKm).toBe(4.2)
    expect(pelada.point).toEqual({ lat: 37.08, lon: -8.11, precision: 'approximate' })
  })

  it('corta os segundos de um horário, que são ruído', () => {
    expect(toDiscoveredPelada(row()).matchTime).toBe('19:00')
  })

  it('sem ponto autorizado não há ponto nenhum', () => {
    expect(toDiscoveredPelada(row({ location: null })).point).toBeNull()
  })

  it('não confunde ausência de distância com estar em cima', () => {
    expect(toDiscoveredPelada(row({ distance_km: null })).distanceKm).toBeNull()
  })

  it('rejeita uma precisão que o servidor não devia ter mandado', () => {
    const pelada = toDiscoveredPelada(row({ location: { lat: 1, lon: 2, precision: 'exacta' } }))
    // Fica na mais conservadora das reconhecidas, e não na que veio.
    expect(pelada.point?.precision).toBe('city')
  })

  it('um join_mode desconhecido cai em aprovação, não em entrada aberta', () => {
    expect(toDiscoveredPelada(row({ join_mode: 'whatever' })).joinMode).toBe('approval')
  })
})

describe('isFull', () => {
  it('uma pelada sem limite declarado nunca está cheia', () => {
    expect(isFull(toDiscoveredPelada(row({ max_players: null, member_count: 500 })))).toBe(false)
  })

  it('cheia é ter chegado ao limite que declarou', () => {
    expect(isFull(toDiscoveredPelada(row({ max_players: 30, member_count: 30 })))).toBe(true)
    expect(isFull(toDiscoveredPelada(row({ max_players: 30, member_count: 29 })))).toBe(false)
  })
})

describe('discoverPeladas', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({ data: [row()], error: null })
  })

  it('manda os filtros ao servidor em vez de os aplicar no browser', async () => {
    await discoverPeladas({
      query: ' browns ', countryCode: 'pt', centre: { lat: 37, lon: -8 }, radiusKm: 10,
      weekday: 5, format: '7x7', skillLevel: 'casual', onlyWithRoom: true,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('discover_peladas', expect.objectContaining({
      p_query: 'browns', p_country_code: 'pt', p_latitude: 37, p_longitude: -8,
      p_radius_km: 10, p_weekday: 5, p_format: '7x7', p_skill_level: 'casual',
      p_only_with_room: true,
    }))
  })

  it('sem centro não manda raio nenhum — não há distância para medir', async () => {
    await discoverPeladas({ radiusKm: 25 })
    expect(mocks.rpc).toHaveBeenCalledWith('discover_peladas', expect.objectContaining({
      p_latitude: null, p_longitude: null, p_radius_km: null,
    }))
  })

  it('um filtro vazio é ausência de filtro, e não uma pesquisa por vazio', async () => {
    await discoverPeladas({ query: '   ', city: '' })
    expect(mocks.rpc).toHaveBeenCalledWith('discover_peladas', expect.objectContaining({
      p_query: null, p_city: null,
    }))
  })

  it('propaga o erro em vez de devolver uma lista vazia', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(discoverPeladas({})).rejects.toBeTruthy()
  })
})

describe('listPeladaRegions', () => {
  it('lê a contagem por região', async () => {
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({
      data: [{ country_code: 'PT', region: 'Algarve', city: 'Vilamoura', pelada_count: 3 }],
      error: null,
    })
    await expect(listPeladaRegions('pt')).resolves.toEqual([
      { countryCode: 'PT', region: 'Algarve', city: 'Vilamoura', count: 3 },
    ])
  })
})
