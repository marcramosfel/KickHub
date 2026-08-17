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
  | 'UNKNOWN'

const KNOWN: ClaimFailure[] = [
  'INVALID_CLAIM', 'CLAIM_ALREADY_USED', 'CLAIM_EXPIRED', 'ALREADY_CLAIMED',
  'ACCOUNT_ALREADY_LINKED', 'TOO_MANY_ATTEMPTS', 'AUTH_REQUIRED',
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

export async function issueLegacyClaim(membershipId: string, reason: string) {
  const { data, error } = await supabase.rpc('issue_legacy_claim', {
    p_membership_id: membershipId,
    p_reason: reason,
  })
  if (error) throw error
  return String(data ?? '')
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

export function useLegacyClaimCandidates(peladaId: string, enabled = true) {
  return useQuery({
    queryKey: ['legacy-claim-candidates', peladaId],
    queryFn: () => listLegacyClaimCandidates(peladaId),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 10_000,
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
