import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { track } from './analytics'
import type { Pelada } from './pelada-types'
import { acceptPeladaInvite, createPeladaInvite, listPendingJoinRequests, requestPeladaMembership, reviewJoinRequest, type JoinRequestRecord } from './onboarding-api'

type JoinState = 'idle' | 'pending' | 'active'
type Invite = { token: string; url: string; expiresAt: string }

export const inviteMaxUses = 25
export const inviteTtlHours = 168

type OnboardingContextValue = {
  joinStates: Record<string, JoinState>
  requests: JoinRequestRecord[]
  requestJoin: (pelada: Pelada, message: string) => Promise<JoinState>
  loadRequests: (peladaId: string) => Promise<void>
  reviewRequest: (requestId: string, decision: 'approved' | 'rejected') => Promise<void>
  createInvite: (peladaId: string) => Promise<Invite>
  acceptInvite: (token: string) => Promise<string>
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [joinStates, setJoinStates] = useState<Record<string, JoinState>>({})
  const [requests, setRequests] = useState<JoinRequestRecord[]>([])

  const requestJoin = useCallback(async (pelada: Pelada, message: string) => {
      if (pelada.membership === 'active' || joinStates[pelada.id] === 'active') return 'active'
      const result = await requestPeladaMembership(pelada.id, message)
      const next: JoinState = result.status
      setJoinStates((current) => ({ ...current, [pelada.id]: next }))
      // 'active' é entrada aberta e não um pedido: o funil distingue-os porque
      // são degraus diferentes — um espera aprovação, o outro já entrou.
      track(next === 'active' ? 'join_request_approved' : 'join_request_sent', {
        pelada_id: pelada.id, join_mode: pelada.joinMode,
      })
      return next
  }, [joinStates])

  const loadRequests = useCallback(async (peladaId: string) => {
      const result = await listPendingJoinRequests(peladaId)
      setRequests(result)
  }, [])

  const reviewRequest = useCallback(async (requestId: string, decision: 'approved' | 'rejected') => {
      await reviewJoinRequest(requestId, decision)
      setRequests((current) => current.map((request) => request.id === requestId ? { ...request, status: decision } : request))
      if (decision === 'approved') track('join_request_approved', { request_id: requestId })
  }, [])

  const createInvite = useCallback(async (peladaId: string) => {
      const result = await createPeladaInvite(peladaId, inviteMaxUses, inviteTtlHours)
      const token = result.token
      const expiresAt = result.expires_at
      return { token, expiresAt, url: `${window.location.origin}/convite/${token}` }
  }, [])

  const acceptInvite = useCallback(async (token: string) => {
      return (await acceptPeladaInvite(token)).slug
  }, [])

  const value = useMemo<OnboardingContextValue>(() => ({
    joinStates, requests, requestJoin, loadRequests, reviewRequest, createInvite, acceptInvite,
  }), [acceptInvite, createInvite, joinStates, loadRequests, requestJoin, requests, reviewRequest])

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) throw new Error('useOnboarding must be used inside OnboardingProvider')
  return context
}
