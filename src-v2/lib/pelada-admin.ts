import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GoalkeeperMode } from '../domain/team-draw'
import { SKILL_LEVELS, type LocationPrecision, type SkillLevel } from './discovery'
import { isSupabaseConfigured, supabase } from './supabase'

export type PeladaVisibility = 'private' | 'unlisted' | 'public'
export type PeladaJoinMode = 'invite' | 'approval' | 'open'
export type PeladaFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'irregular'

export const visibilities: PeladaVisibility[] = ['private', 'unlisted', 'public']
export const joinModes: PeladaJoinMode[] = ['invite', 'approval', 'open']
export const frequencies: PeladaFrequency[] = ['weekly', 'fortnightly', 'monthly', 'irregular']
export const goalkeeperModes: GoalkeeperMode[] = ['fixed', 'rotating', 'mixed']
export const formats = ['5x5', '6x6', '7x7', '8x8', '11x11', 'custom'] as const

export type PeladaAdminSettings = {
  name: string
  /** Só de leitura: é o endereço partilhado e nenhuma RPC o altera. */
  slug: string
  description: string
  visibility: PeladaVisibility
  joinMode: PeladaJoinMode
  /** Onde a pelada se joga. Sem isto, uma pelada nunca podia mudar de sítio. */
  city: string
  countryCode: string
  timezone: string
  defaultFormat: string
  defaultTeamSize: number
  frequency: PeladaFrequency
  goalkeeperMode: GoalkeeperMode
  ratingsEnabled: boolean
  awardsEnabled: boolean
  /**
   * O que a descoberta mostra. Vem na mesma leitura de propósito: são dois
   * formulários lado a lado sobre a mesma pelada, e duas leituras eram duas
   * versões da verdade a poderem discordar uma da outra no mesmo ecrã.
   */
  region: string
  latitude: string
  longitude: string
  locationPrecision: LocationPrecision
  matchWeekday: number | null
  matchTime: string
  skillLevel: SkillLevel
  maxPlayers: number | null
}

const precisions: LocationPrecision[] = ['hidden', 'city', 'approximate', 'exact']

/** Um número que o servidor não tem é ausência, e não zero. */
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.includes(value as T) ? value as T : fallback

export function toAdminSettings(row: Record<string, unknown>): PeladaAdminSettings {
  return {
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    description: typeof row.description === 'string' ? row.description : '',
    visibility: oneOf(visibilities, row.visibility, 'private'),
    joinMode: oneOf(joinModes, row.join_mode, 'approval'),
    city: typeof row.city === 'string' ? row.city : '',
    countryCode: typeof row.country_code === 'string' ? row.country_code : '',
    timezone: typeof row.timezone === 'string' ? row.timezone : '',
    defaultFormat: oneOf(formats, row.default_format, '7x7'),
    defaultTeamSize: Number(row.default_team_size) || 7,
    frequency: oneOf(frequencies, row.frequency, 'weekly'),
    goalkeeperMode: oneOf(goalkeeperModes, row.goalkeeper_mode, 'fixed'),
    ratingsEnabled: row.ratings_enabled !== false,
    awardsEnabled: row.awards_enabled !== false,
    region: typeof row.region === 'string' ? row.region : '',
    // Coordenadas ficam texto: são campos de texto, e passá-las por `Number`
    // aqui perdia as casas decimais que o organizador escreveu.
    latitude: row.latitude === null || row.latitude === undefined ? '' : String(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? '' : String(row.longitude),
    locationPrecision: oneOf(precisions, row.location_precision, 'city'),
    matchWeekday: numberOrNull(row.match_weekday),
    matchTime: typeof row.match_time === 'string' ? row.match_time : '',
    skillLevel: oneOf(SKILL_LEVELS, row.skill_level, 'mixed'),
    maxPlayers: numberOrNull(row.max_players),
  }
}

export async function getPeladaAdminSettings(peladaId: string) {
  const { data, error } = await supabase.rpc('get_pelada_admin_settings', { p_pelada_id: peladaId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  return row ? toAdminSettings(row) : null
}

export function usePeladaAdminSettings(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-admin-settings', peladaId],
    queryFn: () => getPeladaAdminSettings(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
  })
}

/**
 * Gravar toca em duas tabelas por duas RPCs distintas. Correm em série e não
 * numa transação única: se a segunda falhar, a identidade fica gravada e as
 * definições não. É o mal menor face a juntar identidade e regras de jogo numa
 * função só, e a interface recarrega a partir do servidor, portanto o que o
 * organizador vê a seguir é o estado real e não o que ele escreveu.
 */
export function useSavePeladaAdminSettings(peladaId: string | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (values: PeladaAdminSettings) => {
      const identity = await supabase.rpc('update_pelada_identity', {
        p_pelada_id: peladaId,
        p_name: values.name,
        p_description: values.description,
        p_visibility: values.visibility,
        p_join_mode: values.joinMode,
        p_city: values.city,
        p_country_code: values.countryCode,
        p_timezone: values.timezone,
      })
      if (identity.error) throw identity.error

      const settings = await supabase.rpc('update_pelada_settings', {
        p_pelada_id: peladaId,
        p_default_format: values.defaultFormat,
        p_default_team_size: values.defaultTeamSize,
        p_frequency: values.frequency,
        p_goalkeeper_mode: values.goalkeeperMode,
        p_ratings_enabled: values.ratingsEnabled,
        p_awards_enabled: values.awardsEnabled,
      })
      if (settings.error) throw settings.error
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['pelada-admin-settings', peladaId] }),
        // O modo de guarda-redes é lido pelo sorteio, e o nome vem de
        // `my-peladas` — é de lá que saem o cabeçalho e o seletor de pelada.
        client.invalidateQueries({ queryKey: ['pelada-settings', peladaId] }),
        client.invalidateQueries({ queryKey: ['my-peladas'] }),
        client.invalidateQueries({ queryKey: ['my-peladas'] }),
      ])
    },
  })
}

export function useSetMemberRole(peladaId: string | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ membershipId, role }: { membershipId: string; role: 'admin' | 'player' }) => {
      const { error } = await supabase.rpc('set_pelada_member_role', {
        p_membership_id: membershipId,
        p_role: role,
      })
      if (error) throw error
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['pelada-squad', peladaId] }),
  })
}

export function useRemoveMember(peladaId: string | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase.rpc('remove_pelada_member', { p_membership_id: membershipId })
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['pelada-squad', peladaId] }),
        // Sair liberta a vaga de quem estava confirmado num jogo que aí vem.
        client.invalidateQueries({ queryKey: ['pelada-games', peladaId] }),
      ])
    },
  })
}
