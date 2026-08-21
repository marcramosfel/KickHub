import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * A descoberta de peladas.
 *
 * A distância nunca se calcula aqui. O servidor tem PostGIS e um índice
 * espacial; o browser teria de trazer todas as peladas do mundo para medir a
 * que está a 5 km, o que deixa de funcionar exactamente quando o produto
 * começa a resultar.
 *
 * O que volta já vem com o pudor que cada pelada escolheu: quem esconde a
 * morada é filtrado pela localização verdadeira mas devolvido sem ela.
 */
export type LocationPrecision = 'hidden' | 'city' | 'approximate' | 'exact'
export type SkillLevel = 'casual' | 'mixed' | 'competitive'

export type DiscoveredPelada = {
  id: string
  slug: string
  name: string
  description: string
  countryCode: string
  region: string | null
  city: string
  joinMode: 'invite' | 'approval' | 'open'
  members: number
  defaultFormat: string | null
  frequency: string | null
  skillLevel: SkillLevel | null
  /** ISO: 1 = segunda, 7 = domingo. `null` = a pelada não o declarou. */
  matchWeekday: number | null
  /** 'HH:MM' local da pelada, ou `null`. */
  matchTime: string | null
  maxPlayers: number | null
  /** Quilómetros ao centro pedido. `null` sem centro ou sem coordenadas. */
  distanceKm: number | null
  /** O ponto que a pelada autoriza mostrar. `null` = nenhum. */
  point: { lat: number; lon: number; precision: LocationPrecision } | null
}

export type DiscoveryFilters = {
  query?: string
  countryCode?: string
  region?: string
  city?: string
  centre?: { lat: number; lon: number } | null
  radiusKm?: number | null
  weekday?: number | null
  fromTime?: string | null
  toTime?: string | null
  format?: string | null
  skillLevel?: SkillLevel | null
  onlyWithRoom?: boolean
}

export const RADIUS_OPTIONS = [2, 5, 10, 25, 50, 100] as const
export const SKILL_LEVELS: readonly SkillLevel[] = ['casual', 'mixed', 'competitive']
export const FORMAT_OPTIONS = ['5x5', '6x6', '7x7', '8x8', '11x11'] as const
/** ISO, para a interface não ter de decidir se a semana começa ao domingo. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

type ApiRow = Record<string, unknown>

const asString = (value: unknown) => typeof value === 'string' ? value : null
const asNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const precisions: readonly LocationPrecision[] = ['hidden', 'city', 'approximate', 'exact']

function toPoint(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const raw = value as ApiRow
  const lat = asNumber(raw.lat)
  const lon = asNumber(raw.lon)
  const precision = asString(raw.precision)
  if (lat === null || lon === null) return null
  return {
    lat, lon,
    precision: precisions.includes(precision as LocationPrecision)
      ? precision as LocationPrecision
      : 'city',
  }
}

/** 'HH:MM:SS' do Postgres fica 'HH:MM': os segundos de um horário são ruído. */
const toClock = (value: unknown) => {
  const raw = asString(value)
  return raw ? raw.slice(0, 5) : null
}

export function toDiscoveredPelada(row: ApiRow): DiscoveredPelada {
  const joinMode = asString(row.join_mode)
  const skill = asString(row.skill_level)
  return {
    id: String(row.id ?? ''),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    description: asString(row.description) ?? '',
    countryCode: String(row.country_code ?? ''),
    region: asString(row.region),
    city: String(row.city ?? ''),
    joinMode: joinMode === 'open' || joinMode === 'invite' ? joinMode : 'approval',
    members: asNumber(row.member_count) ?? 0,
    defaultFormat: asString(row.default_format),
    frequency: asString(row.frequency),
    skillLevel: SKILL_LEVELS.includes(skill as SkillLevel) ? skill as SkillLevel : null,
    matchWeekday: asNumber(row.match_weekday),
    matchTime: toClock(row.match_time),
    maxPlayers: asNumber(row.max_players),
    distanceKm: asNumber(row.distance_km),
    point: toPoint(row.location),
  }
}

/** Uma pelada com limite declarado e lotação esgotada. */
export function isFull(pelada: DiscoveredPelada) {
  return pelada.maxPlayers !== null && pelada.members >= pelada.maxPlayers
}

const trimmed = (value: string | undefined) => {
  const clean = value?.trim()
  return clean ? clean : null
}

export async function discoverPeladas(filters: DiscoveryFilters) {
  const { data, error } = await supabase.rpc('discover_peladas', {
    p_query: trimmed(filters.query),
    p_country_code: trimmed(filters.countryCode),
    p_region: trimmed(filters.region),
    p_city: trimmed(filters.city),
    p_latitude: filters.centre?.lat ?? null,
    p_longitude: filters.centre?.lon ?? null,
    p_radius_km: filters.centre ? filters.radiusKm ?? null : null,
    p_weekday: filters.weekday ?? null,
    p_from_time: filters.fromTime ?? null,
    p_to_time: filters.toTime ?? null,
    p_format: filters.format ?? null,
    p_skill_level: filters.skillLevel ?? null,
    p_only_with_room: filters.onlyWithRoom === true,
    p_limit: 24,
    p_offset: 0,
  })
  if (error) throw error
  return ((data ?? []) as ApiRow[]).map(toDiscoveredPelada)
}

export type PeladaRegion = {
  countryCode: string
  region: string
  city: string
  count: number
}

export async function listPeladaRegions(countryCode?: string) {
  const { data, error } = await supabase.rpc('list_pelada_regions', {
    p_country_code: trimmed(countryCode),
    p_limit: 60,
  })
  if (error) throw error
  return ((data ?? []) as ApiRow[]).map((row) => ({
    countryCode: String(row.country_code ?? ''),
    region: String(row.region ?? ''),
    city: String(row.city ?? ''),
    count: asNumber(row.pelada_count) ?? 0,
  } satisfies PeladaRegion))
}

export function useDiscovery(filters: DiscoveryFilters, enabled = true) {
  return useQuery({
    queryKey: ['discover-peladas', filters],
    queryFn: () => discoverPeladas(filters),
    enabled: enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function usePeladaRegions(countryCode?: string) {
  return useQuery({
    queryKey: ['pelada-regions', countryCode ?? null],
    queryFn: () => listPeladaRegions(countryCode),
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60_000,
  })
}

export type GeolocationState = 'idle' | 'asking' | 'granted' | 'denied' | 'unsupported'

/**
 * Pede a posição ao browser uma vez, a pedido.
 *
 * Nunca no arranque: a caixa de permissão do sistema aparecer sozinha é o
 * género de coisa que faz fechar a página. Só depois de alguém carregar em
 * "peladas perto de mim" é que a pergunta faz sentido.
 */
export function requestPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('UNSUPPORTED'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => reject(new Error('DENIED')),
      { maximumAge: 5 * 60_000, timeout: 10_000 },
    )
  })
}
