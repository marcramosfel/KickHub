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

export function getAuthRedirectUrl() {
  return new URL('/app', window.location.origin).toString()
}

export async function signInWithGoogle() {
  if (!isSupabaseConfigured) {
    throw new Error('A autenticação ainda não está configurada neste ambiente.')
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthRedirectUrl(),
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
  return data
}

export async function sendMagicLink(email: string) {
  if (!isSupabaseConfigured) return { demo: true }
  const redirectTo = getAuthRedirectUrl()
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
  if (error) throw error
  return { demo: false }
}

export async function createPelada(input: {
  name: string
  slug: string
  description: string
  countryCode: string
  city: string
  timezone: string
  visibility: string
  joinMode: string
}) {
  const { data, error } = await supabase.rpc('create_pelada', {
    p_name: input.name,
    p_slug: input.slug,
    p_description: input.description,
    p_country_code: input.countryCode,
    p_city: input.city,
    p_timezone: input.timezone,
    p_visibility: input.visibility,
    p_join_mode: input.joinMode,
  })
  if (error) throw error
  return data
}

export async function getCurrentProfile() {
  const { data, error } = await supabase.from('profiles').select('*').single()
  if (error) throw error
  return data
}

export async function getMyPeladas() {
  const { data, error } = await supabase
    .from('pelada_memberships')
    .select('role,status,peladas(*)')
    .eq('status', 'active')
  if (error) throw error
  return data
}
