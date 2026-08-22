import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Os motivos por que uma reclamação pode falhar, tal como o servidor os nomeia.
 * A interface traduz cada um; um motivo desconhecido cai na mensagem genérica,
 * porque inventar uma explicação seria pior do que admitir que não se sabe.
 */
export type ClaimFailure =
  | 'INVALID_CLAIM'
  | 'CLAIM_ALREADY_USED'
  | 'CLAIM_EXPIRED'
  | 'ALREADY_CLAIMED'
  | 'ACCOUNT_ALREADY_LINKED'
  | 'TOO_MANY_ATTEMPTS'
  | 'AUTH_REQUIRED'
  | 'SAME_PROFILE'
  | 'LEGACY_MEMBERSHIP_NOT_FOUND'
  | 'MEMBERSHIP_HAS_HISTORY'
  | 'UNKNOWN'

const KNOWN: ClaimFailure[] = [
  'INVALID_CLAIM', 'CLAIM_ALREADY_USED', 'CLAIM_EXPIRED', 'ALREADY_CLAIMED',
  'ACCOUNT_ALREADY_LINKED', 'TOO_MANY_ATTEMPTS', 'AUTH_REQUIRED',
  'SAME_PROFILE', 'LEGACY_MEMBERSHIP_NOT_FOUND', 'MEMBERSHIP_HAS_HISTORY',
]

export function toClaimFailure(error: unknown): ClaimFailure {
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : ''
  return KNOWN.find((code) => message.includes(code)) ?? 'UNKNOWN'
}

/**
 * Normaliza o que a pessoa escreveu. Aceita-se com ou sem hífenes, em maiúsculas
 * ou minúsculas: quem copia de uma mensagem raramente copia exactamente.
 */
export function normalizeClaimCode(raw: string) {
  const clean = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  return clean.replace(/(.{4})(?=.)/g, '$1-')
}

export async function claimLegacyProfile(code: string) {
  const { data, error } = await supabase.rpc('claim_legacy_profile', { p_code: normalizeClaimCode(code) })
  if (error) throw error
  return String(data ?? '')
}

/**
 * Juntar o histórico deste código à conta em que já se está.
 *
 * O `claim_legacy_profile` recusa quem já tem perfil, e faz bem: apontar a conta
 * a outro perfil deixava o primeiro sem dono, com as peladas que criou. Isto faz
 * o contrário — a pertença do legado é que muda de perfil, e o histórico, que
 * está preso à pertença e não ao perfil, nem se mexe.
 */
export async function absorbLegacyClaim(code: string) {
  const { data, error } = await supabase.rpc('absorb_legacy_claim', { p_code: normalizeClaimCode(code) })
  if (error) throw error
  return data as { membership_id: string; pelada_id: string; role: string; merged: boolean }
}

/** Sete dias: um código que se envia por escrito precisa de tempo de resposta. */
export const CLAIM_TTL_HOURS = 168

export async function issueLegacyClaim(membershipId: string, reason: string) {
  const { data, error } = await supabase.rpc('issue_legacy_claim', {
    p_membership_id: membershipId,
    p_reason: reason,
    p_expires_in_hours: CLAIM_TTL_HOURS,
  })
  if (error) throw error
  return String(data ?? '')
}

export type IssuedClaim = { membershipId: string; displayName: string; url: string }

/**
 * Emite para todo o plantel de uma vez e devolve já os links prontos a enviar.
 *
 * O link é montado aqui e não no servidor: o servidor não sabe em que endereço
 * a app está a ser servida, e adivinhá-lo dava links que não abrem.
 */
export async function issueLegacyClaimsForPelada(peladaId: string, reason: string) {
  const { data, error } = await supabase.rpc('issue_legacy_claims_for_pelada', {
    p_pelada_id: peladaId,
    p_reason: reason,
    p_expires_in_hours: CLAIM_TTL_HOURS,
  })
  if (error) throw error
  return ((data ?? []) as { membership_id: string; display_name: string; code: string }[])
    .map((row) => ({
      membershipId: row.membership_id,
      displayName: row.display_name,
      url: claimUrl(row.code),
    }))
}

export function claimUrl(code: string) {
  return `${window.location.origin}/reclamar/${normalizeClaimCode(code)}`
}

export type ClaimPreview = {
  playerName: string
  peladaName: string
  expiresAt: string
  /** A conta já tem histórico próprio: o caminho é fundir, não substituir. */
  needsMerge: boolean
}

/** Diz de quem é o histórico sem gastar o código. */
export async function peekLegacyClaim(code: string): Promise<ClaimPreview> {
  const { data, error } = await supabase.rpc('peek_legacy_claim', { p_code: normalizeClaimCode(code) })
  if (error) throw error
  const row = data as { player_name: string; pelada_name: string; expires_at: string; needs_merge: boolean }
  return {
    playerName: row.player_name,
    peladaName: row.pelada_name,
    expiresAt: row.expires_at,
    needsMerge: Boolean(row.needs_merge),
  }
}

export type LegacyClaimState = 'none' | 'active' | 'expired' | 'revoked' | 'claimed'

export type LegacyClaimCandidate = {
  membershipId: string
  profileId: string
  displayName: string
  nickname: string | null
  hasAccount: boolean
  state: LegacyClaimState
  createdAt: string | null
  expiresAt: string | null
  reason: string | null
}

type LegacyClaimCandidateRow = {
  membership_id: string
  profile_id: string
  display_name: string
  nickname: string | null
  has_account: boolean
  claim_state: string
  claim_created_at: string | null
  claim_expires_at: string | null
  claim_reason: string | null
}

const claimStates: LegacyClaimState[] = ['none', 'active', 'expired', 'revoked', 'claimed']

export async function listLegacyClaimCandidates(peladaId: string): Promise<LegacyClaimCandidate[]> {
  const { data, error } = await supabase.rpc('get_legacy_claim_candidates', { p_pelada_id: peladaId })
  if (error) throw error
  return ((data ?? []) as LegacyClaimCandidateRow[]).map((row) => ({
    membershipId: row.membership_id,
    profileId: row.profile_id,
    displayName: row.display_name,
    nickname: row.nickname,
    hasAccount: Boolean(row.has_account),
    state: claimStates.includes(row.claim_state as LegacyClaimState) ? row.claim_state as LegacyClaimState : 'none',
    createdAt: row.claim_created_at,
    expiresAt: row.claim_expires_at,
    reason: row.claim_reason,
  }))
}

export async function revokeLegacyClaim(membershipId: string, reason: string) {
  const { data, error } = await supabase.rpc('revoke_legacy_claim', {
    p_membership_id: membershipId,
    p_reason: reason,
  })
  if (error) throw error
  return Boolean(data)
}

export function useClaimLegacyProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => claimLegacyProfile(code),
    onSuccess: () => {
      // O histórico passou a ser desta conta: tudo o que dependia de "que
      // peladas são minhas" ficou velho no mesmo instante.
      void client.invalidateQueries()
    },
  })
}

export function useAbsorbLegacyClaim() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => absorbLegacyClaim(code),
    // Mudou quem é o jogador desta conta: o plantel, o ranking e o overall
    // ficaram todos velhos ao mesmo tempo.
    onSuccess: () => { void client.invalidateQueries() },
  })
}

export function useLegacyClaimCandidates(peladaId: string, enabled = true) {
  return useQuery({
    queryKey: ['legacy-claim-candidates', peladaId],
    queryFn: () => listLegacyClaimCandidates(peladaId),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 10_000,
  })
}

export function usePeekLegacyClaim(code: string) {
  return useQuery({
    queryKey: ['legacy-claim-peek', normalizeClaimCode(code)],
    queryFn: () => peekLegacyClaim(code),
    enabled: Boolean(code) && isSupabaseConfigured,
    // Um código gasta-se uma vez: não vale a pena voltar a perguntar sozinho.
    retry: false,
    staleTime: Infinity,
  })
}

export function useIssueLegacyClaimsForPelada(peladaId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => issueLegacyClaimsForPelada(peladaId, reason),
    onSuccess: () => client.invalidateQueries({ queryKey: ['legacy-claim-candidates', peladaId] }),
  })
}

export function useIssueLegacyClaim(peladaId = '') {
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: ['legacy-claim-candidates', peladaId] })
  return useMutation({
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason: string }) =>
      issueLegacyClaim(membershipId, reason),
    onSuccess: invalidate,
  })
}

export function useRevokeLegacyClaim(peladaId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason: string }) =>
      revokeLegacyClaim(membershipId, reason),
    onSuccess: () => client.invalidateQueries({ queryKey: ['legacy-claim-candidates', peladaId] }),
  })
}
