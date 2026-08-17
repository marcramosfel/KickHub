import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && key)
export const supabase = createClient(url ?? 'https://example.invalid', key ?? 'missing-publishable-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

export function getAuthRedirectUrl(redirectPath = '/app') {
  const safePath = redirectPath.startsWith('/') && !redirectPath.startsWith('//') ? redirectPath : '/app'
  return new URL(safePath, window.location.origin).toString()
}

export async function signInWithGoogle(redirectPath?: string) {
  if (!isSupabaseConfigured) {
    throw new Error('A autenticação ainda não está configurada neste ambiente.')
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthRedirectUrl(redirectPath),
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
  return data
}

export async function sendMagicLink(email: string, redirectPath?: string) {
  if (!isSupabaseConfigured) {
    throw new Error('A autenticação ainda não está configurada neste ambiente.')
  }
  const redirectTo = getAuthRedirectUrl(redirectPath)
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
  if (error) throw error
}
