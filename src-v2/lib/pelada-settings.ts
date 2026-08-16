import { useQuery } from '@tanstack/react-query'
import type { GoalkeeperMode } from '../domain/team-draw'
import { isSupabaseConfigured, supabase } from './supabase'

export type PeladaSettings = {
  defaultFormat: string
  defaultTeamSize: number
  goalkeeperMode: GoalkeeperMode
  ratingsEnabled: boolean
  awardsEnabled: boolean
}

const goalkeeperModes: GoalkeeperMode[] = ['fixed', 'rotating', 'mixed']

export function toPeladaSettings(row: Record<string, unknown>): PeladaSettings {
  const mode = row.goalkeeper_mode
  return {
    defaultFormat: String(row.default_format ?? '7x7'),
    defaultTeamSize: Number(row.default_team_size) || 7,
    // Sem definição legível, `rotating` é o pressuposto conservador: não separa
    // guarda-redes que a pelada pode não ter.
    goalkeeperMode: goalkeeperModes.includes(mode as GoalkeeperMode) ? mode as GoalkeeperMode : 'rotating',
    ratingsEnabled: row.ratings_enabled !== false,
    awardsEnabled: row.awards_enabled !== false,
  }
}

export async function getPeladaSettings(peladaId: string) {
  const { data, error } = await supabase.rpc('get_pelada_settings', { p_pelada_id: peladaId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined
  return row ? toPeladaSettings(row) : null
}

export function usePeladaSettings(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-settings', peladaId],
    queryFn: () => getPeladaSettings(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 5 * 60_000,
  })
}
