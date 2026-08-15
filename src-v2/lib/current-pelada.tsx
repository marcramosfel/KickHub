import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { peladas as demoPeladas, type Pelada } from '../data/demo'
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
  isDemo: boolean
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
  { isDemo, isPending, isError, found }: { isDemo: boolean; isPending: boolean; isError: boolean; found: boolean },
): CurrentPeladaStatus {
  if (!isDemo && isPending) return 'loading'
  if (!isDemo && isError) return 'error'
  return found ? 'ready' : 'missing'
}

/**
 * Fonte única do `currentPeladaId`. As páginas do contexto `/p/:slug` derivam a pelada,
 * o papel e as permissões daqui em vez de repetirem o lookup e o prop drilling.
 */
export function CurrentPeladaProvider({ children }: { children: ReactNode }) {
  const { slug = '' } = useParams()
  const { user } = useAuth()
  const myPeladas = useMyPeladas(user?.id)
  const isDemo = !user
  const peladas = isDemo ? demoPeladas : (myPeladas.data ?? noPeladas)
  const { isPending, isError, refetch } = myPeladas

  const value = useMemo<CurrentPeladaValue>(() => {
    const pelada = peladas.find((item) => item.slug === slug) ?? null
    const role = pelada?.role
    return {
      slug,
      isDemo,
      peladas,
      pelada,
      role,
      canAdmin: role === 'owner' || role === 'admin',
      status: resolvePeladaStatus({ isDemo, isPending, isError, found: Boolean(pelada) }),
      retry: () => { void refetch() },
    }
  }, [isDemo, isError, isPending, peladas, refetch, slug])

  return <CurrentPeladaContext.Provider value={value}>{children}</CurrentPeladaContext.Provider>
}

export function useCurrentPelada() {
  const value = useContext(CurrentPeladaContext)
  if (!value) throw new Error('useCurrentPelada precisa de CurrentPeladaProvider')
  return value
}
