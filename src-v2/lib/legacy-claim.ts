import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

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

export function useIssueLegacyClaim() {
  return useMutation({
    mutationFn: ({ membershipId, reason }: { membershipId: string; reason: string }) =>
      issueLegacyClaim(membershipId, reason),
  })
}
