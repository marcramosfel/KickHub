import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import type { Pelada } from './pelada-types'
import { useAuth } from './auth'
import { useMyPeladas } from './peladas'

/**
 * `loading`  a membership ainda está a ser confirmada;
 * `error`    o read model falhou e a sessão continua válida;
 * `missing`  não existe membership ativa para este slug;
 * `ready`    a pelada e o papel do utilizador estão resolvidos.
 */
export type CurrentPeladaStatus = 'loading' | 'error' | 'missing' | 'ready'

export type CurrentPeladaValue = {
  slug: string
  status: CurrentPeladaStatus
  pelada: Pelada | null
  peladas: Pelada[]
  role: Pelada['role']
  canAdmin: boolean
  retry: () => void
}

const noPeladas: Pelada[] = []

const CurrentPeladaContext = createContext<CurrentPeladaValue | null>(null)

export function resolvePeladaStatus(
  { isPending, isError, found }: { isPending: boolean; isError: boolean; found: boolean },
): CurrentPeladaStatus {
  if (isPending) return 'loading'
  if (isError) return 'error'
  return found ? 'ready' : 'missing'
}

export function canAdministerPelada(role: Pelada['role']) {
  return role === 'owner' || role === 'admin'
}

/**
 * Fonte única do `currentPeladaId`. As páginas do contexto `/p/:slug` derivam a pelada,
 * o papel e as permissões daqui em vez de repetirem o lookup e o prop drilling.
 */
export function CurrentPeladaProvider({ children }: { children: ReactNode }) {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const myPeladas = useMyPeladas(user?.id)
  const peladas = myPeladas.data ?? noPeladas
  const { isPending, isError, refetch } = myPeladas

  const value = useMemo<CurrentPeladaValue>(() => {
    const pelada = peladas.find((item) => item.slug === slug) ?? null
    const role = pelada?.role
    return {
      slug,
      peladas,
      pelada,
      role,
      canAdmin: canAdministerPelada(role),
      status: resolvePeladaStatus({ isPending, isError, found: Boolean(pelada) }),
      retry: () => { void refetch() },
    }
  }, [isError, isPending, peladas, refetch, slug])

  return <CurrentPeladaContext.Provider value={value}>{children}</CurrentPeladaContext.Provider>
}

export function useCurrentPelada() {
  const value = useContext(CurrentPeladaContext)
  if (!value) throw new Error('useCurrentPelada precisa de CurrentPeladaProvider')
  return value
}
