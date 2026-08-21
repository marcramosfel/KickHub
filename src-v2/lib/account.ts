import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * A conta: privacidade (§77), exportação e apagamento (§78).
 *
 * Não há aqui nenhuma decisão de produto sobre retenção — o servidor é que
 * decide o que sobrevive a um apagamento, e faz sentido que assim seja: o que
 * uma pessoa marcou continua a pertencer à história das rodadas em que os
 * outros jogaram.
 */
export type Visibility = 'public' | 'members' | 'private'

export type PrivacySettings = {
  profile: Visibility
  stats: Visibility
  showCity: boolean
  showPeladas: Visibility
  acceptInvites: boolean
}

/** O mais fechado de cada opção. Uma privacidade que nasce aberta não é uma. */
export const DEFAULT_PRIVACY: PrivacySettings = {
  profile: 'members', stats: 'members', showCity: false,
  showPeladas: 'members', acceptInvites: true,
}

export const VISIBILITIES: readonly Visibility[] = ['public', 'members', 'private']

type ApiObject = Record<string, unknown>

const asVisibility = (value: unknown, fallback: Visibility): Visibility =>
  VISIBILITIES.includes(value as Visibility) ? value as Visibility : fallback

export function toPrivacySettings(raw: unknown): PrivacySettings {
  const row = (raw && typeof raw === 'object' ? raw : {}) as ApiObject
  return {
    profile: asVisibility(row.profile, DEFAULT_PRIVACY.profile),
    stats: asVisibility(row.stats, DEFAULT_PRIVACY.stats),
    // `!== false` seria abrir por omissão a quem nunca escolheu. Aqui é o
    // contrário: só mostra a cidade quem disse que sim.
    showCity: row.show_city === true,
    showPeladas: asVisibility(row.show_peladas, DEFAULT_PRIVACY.showPeladas),
    acceptInvites: row.accept_invites !== false,
  }
}

export function toPrivacyPayload(settings: PrivacySettings) {
  return {
    profile: settings.profile,
    stats: settings.stats,
    show_city: settings.showCity,
    show_peladas: settings.showPeladas,
    accept_invites: settings.acceptInvites,
  }
}

export async function updateMyPrivacy(settings: PrivacySettings) {
  const { data, error } = await supabase.rpc('update_my_privacy', {
    p_privacy: toPrivacyPayload(settings),
  })
  if (error) throw error
  return toPrivacySettings(data)
}

export async function exportMyData() {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw error
  return data as ApiObject
}

export async function requestAccountDeletion() {
  const { error } = await supabase.rpc('request_account_deletion')
  if (error) throw error
}

/** O nome do ficheiro que a pessoa recebe. Sem data era um ficheiro sem contexto. */
export function exportFileName(now: Date) {
  return `kickhub-dados-${now.toISOString().slice(0, 10)}.json`
}

export function useSavePrivacy() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: updateMyPrivacy,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['my-player-profile'] }) },
  })
}

export type PlatformFlag = { key: string; enabled: boolean; description: string | null }

export async function listPlatformFlags() {
  const { data, error } = await supabase.from('platform_flags').select('key, enabled, description')
  if (error) throw error
  return ((data ?? []) as ApiObject[]).map((row) => ({
    key: String(row.key ?? ''),
    enabled: row.enabled !== false,
    description: typeof row.description === 'string' ? row.description : null,
  } satisfies PlatformFlag))
}

/**
 * As flags globais (§70).
 *
 * Uma flag que o servidor não conhece vale `true`: uma funcionalidade nova não
 * pode ficar invisível só porque a linha ainda não foi inserida. O interruptor
 * serve para desligar o que existe, e não para autorizar o que já lá está.
 */
export function usePlatformFlags() {
  const query = useQuery({
    queryKey: ['platform-flags'],
    queryFn: listPlatformFlags,
    enabled: isSupabaseConfigured,
    staleTime: 5 * 60_000,
  })
  const flags = query.data
  return {
    ...query,
    isEnabled: (key: string) => flags?.find((flag) => flag.key === key)?.enabled ?? true,
  }
}

export type ContentReportReason = 'spam' | 'abuse' | 'impersonation' | 'inappropriate' | 'other'

export const REPORT_REASONS: readonly ContentReportReason[] = [
  'spam', 'abuse', 'impersonation', 'inappropriate', 'other',
]

export async function reportContent(
  subjectType: 'profile' | 'pelada',
  subjectId: string,
  reason: ContentReportReason,
  detail?: string,
) {
  const { data, error } = await supabase.rpc('report_content', {
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_reason: reason,
    p_detail: detail?.trim() || null,
  })
  if (error) throw error
  const row = (data ?? {}) as ApiObject
  return { id: row.id ? String(row.id) : null, alreadyOpen: row.already_open === true }
}
