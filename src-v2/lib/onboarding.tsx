import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { demoJoinRequests, type DemoJoinRequest, type Pelada } from '../data/demo'
import { acceptPeladaInvite, createPeladaInvite, hasSupabaseSession, listPendingJoinRequests, requestPeladaMembership, reviewJoinRequest, type JoinRequestRecord } from './onboarding-api'

type JoinState = 'idle' | 'pending' | 'active'
type Invite = { token: string; url: string; expiresAt: string }

export const inviteMaxUses = 25
export const inviteTtlHours = 168

type OnboardingContextValue = {
  joinStates: Record<string, JoinState>
  requests: DemoJoinRequest[]
  requestJoin: (pelada: Pelada, message: string) => Promise<JoinState>
  loadRequests: (peladaId: string) => Promise<void>
  reviewRequest: (requestId: string, decision: 'approved' | 'rejected') => Promise<void>
  createInvite: (peladaId: string) => Promise<Invite>
  acceptInvite: (token: string) => Promise<string>
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [joinStates, setJoinStates] = useState<Record<string, JoinState>>({
    '10000000-0000-4000-8000-000000000101': 'active',
  })
  const [requests, setRequests] = useState<DemoJoinRequest[]>(demoJoinRequests)

  const requestJoin = useCallback(async (pelada: Pelada, message: string) => {
      if (pelada.membership === 'active' || joinStates[pelada.id] === 'active') return 'active'
      let next: JoinState = pelada.joinMode === 'open' ? 'active' : 'pending'
      if (await hasSupabaseSession()) {
        const result = await requestPeladaMembership(pelada.id, message)
        next = result.status
      }
      setJoinStates((current) => ({ ...current, [pelada.id]: next }))
      return next
  }, [joinStates])

  const loadRequests = useCallback(async (peladaId: string) => {
      if (!(await hasSupabaseSession())) return
      const result = await listPendingJoinRequests(peladaId)
      setRequests(result.map(toDemoRequest))
  }, [])

  const reviewRequest = useCallback(async (requestId: string, decision: 'approved' | 'rejected') => {
      if (await hasSupabaseSession()) await reviewJoinRequest(requestId, decision)
      setRequests((current) => current.map((request) => request.id === requestId ? { ...request, status: decision } : request))
  }, [])

  const createInvite = useCallback(async (peladaId: string) => {
      let token = `demo-${peladaId.slice(0, 8)}-${Math.random().toString(36).slice(2, 10)}`
      let expiresAt = new Date(Date.now() + inviteTtlHours * 3_600_000).toISOString()
      if (await hasSupabaseSession()) {
        const result = await createPeladaInvite(peladaId, inviteMaxUses, inviteTtlHours)
        token = result.token
        expiresAt = result.expires_at
      }
      return { token, expiresAt, url: `${window.location.origin}/convite/${token}` }
  }, [])

  const acceptInvite = useCallback(async (token: string) => {
      if (await hasSupabaseSession()) return (await acceptPeladaInvite(token)).slug
      return 'browns'
  }, [])

  const value = useMemo<OnboardingContextValue>(() => ({
    joinStates, requests, requestJoin, loadRequests, reviewRequest, createInvite, acceptInvite,
  }), [acceptInvite, createInvite, joinStates, loadRequests, requestJoin, requests, reviewRequest])

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

function toDemoRequest(request: JoinRequestRecord): DemoJoinRequest {
  return { ...request, createdAt: request.createdAt }
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) throw new Error('useOnboarding must be used inside OnboardingProvider')
  return context
}
