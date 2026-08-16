import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isSupabaseConfigured, signInWithGoogle as startGoogleSignIn, supabase } from './supabase'

export type GlobalProfile = {
  id: string
  username: string | null
  display_name: string
  avatar_path: string | null
  locale: string
  timezone: string
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: GlobalProfile | null
  loading: boolean
  signInWithGoogle: () => Promise<boolean>
  signOut: () => Promise<void>
}

const unavailable = async () => {
  throw new Error('O contexto de autenticação não está disponível.')
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: false,
  signInWithGoogle: unavailable,
  signOut: unavailable,
})

export function getAuthDisplayName(user: User | null, profile: GlobalProfile | null, fallback = 'Jogador') {
  const metadataName = user?.user_metadata?.full_name ?? user?.user_metadata?.name
  return profile?.display_name || metadataName || user?.email?.split('@')[0] || fallback
}

export function getAuthAvatarUrl(user: User | null, profile?: GlobalProfile | null) {
  if (profile?.avatar_path) return profile.avatar_path
  const value = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture
  return typeof value === 'string' ? value : undefined
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profileState, setProfileState] = useState<{
    authUserId: string
    data: GlobalProfile | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const authUserId = session?.user.id
  const profile = profileState && profileState.authUserId === authUserId ? profileState.data : null

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    }).catch(() => {
      if (active) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    if (!authUserId || !isSupabaseConfigured) {
      return () => { active = false }
    }

    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id,username,display_name,avatar_path,locale,timezone')
          .eq('auth_user_id', authUserId)
          .maybeSingle()

        // Uma sessão sem profile deixa o utilizador num estado em que nada
        // funciona: `current_profile_id()` devolve null e todas as RPCs
        // recusam. Acontece com contas anteriores ao trigger de criação, ou se
        // ele falhar. A RPC é idempotente e devolve o profile existente.
        const profileData = data ?? (await supabase.rpc('ensure_profile')).data

        if (active) {
          setProfileState({ authUserId, data: (profileData ?? null) as GlobalProfile | null })
        }
      } catch {
        if (active) setProfileState({ authUserId, data: null })
      }
    })()

    return () => { active = false }
  }, [authUserId])

  const signInWithGoogle = useCallback(async () => {
    try {
      await startGoogleSignIn()
      return true
    } catch {
      return false
    }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signInWithGoogle,
    signOut,
  }), [loading, profile, session, signInWithGoogle, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
