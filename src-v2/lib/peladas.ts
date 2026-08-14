import { useQuery } from '@tanstack/react-query'
import type { Pelada } from '../data/demo'
import { isSupabaseConfigured, supabase } from './supabase'

const accents = ['#d8ff45', '#72d8ff', '#ff8657', '#c8a8ff']

type MyPeladaRow = {
  id: string
  slug: string
  name: string
  description: string | null
  city: string
  country_code: string
  visibility: string
  join_mode: string
  role: string
  member_count: number | string
}

export type CreatePeladaInput = {
  name: string
  slug: string
  description: string
  countryCode: string
  city: string
  timezone: string
  visibility: 'private' | 'unlisted' | 'public'
  joinMode: 'invite' | 'approval' | 'open'
  defaultFormat: '5x5' | '7x7' | '11x11'
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'irregular'
}

export type CreatedPelada = {
  id: string
  name: string
  slug: string
}

export function createPeladaSlug(name: string) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return normalized.length >= 3 ? normalized : 'pelada'
}

export function toPeladaSummary(row: MyPeladaRow, index = 0): Pelada {
  const visibility = ['private', 'unlisted', 'public'].includes(row.visibility)
    ? row.visibility as Pelada['visibility']
    : 'private'
  const joinMode = ['invite', 'approval', 'open'].includes(row.join_mode)
    ? row.join_mode as Pelada['joinMode']
    : 'approval'
  const role = ['owner', 'admin', 'player'].includes(row.role)
    ? row.role as NonNullable<Pelada['role']>
    : 'player'

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? 'Comunidade KickHub',
    city: row.city,
    country: row.country_code,
    membership: 'active',
    joinMode,
    role,
    members: Number(row.member_count) || 0,
    nextMatch: '',
    accent: accents[index % accents.length],
    visibility,
  }
}

export async function listMyPeladas() {
  const { data, error } = await supabase.rpc('list_my_peladas')
  if (error) throw error
  return ((data ?? []) as MyPeladaRow[]).map(toPeladaSummary)
}

export function useMyPeladas(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-peladas', userId],
    queryFn: listMyPeladas,
    enabled: Boolean(userId && isSupabaseConfigured),
    staleTime: 30_000,
  })
}

export async function createPelada(input: CreatePeladaInput): Promise<CreatedPelada> {
  const { data, error } = await supabase.rpc('create_pelada_with_settings', {
    p_name: input.name,
    p_slug: input.slug,
    p_description: input.description,
    p_country_code: input.countryCode,
    p_city: input.city,
    p_timezone: input.timezone,
    p_visibility: input.visibility,
    p_join_mode: input.joinMode,
    p_default_format: input.defaultFormat,
    p_frequency: input.frequency,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') {
    throw new Error('O Supabase não devolveu a pelada criada.')
  }
  return { id: String(row.id), name: String(row.name), slug: String(row.slug) }
}
