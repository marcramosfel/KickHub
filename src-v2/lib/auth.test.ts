import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { getAuthAvatarUrl, getAuthDisplayName, type GlobalProfile } from './auth'
import { getAuthRedirectUrl } from './supabase'

const user = (input: Partial<User>) => input as User

describe('auth helpers', () => {
  it('prioriza o nome do profile global', () => {
    const profile = { display_name: 'Marcos Ramos' } as GlobalProfile
    const authUser = user({ email: 'outro@example.com', user_metadata: { full_name: 'Nome Google' } })
    expect(getAuthDisplayName(authUser, profile)).toBe('Marcos Ramos')
  })

  it('usa metadata do Google e depois o email como fallback', () => {
    expect(getAuthDisplayName(user({ email: 'marcos@example.com', user_metadata: { full_name: 'Marcos Google' } }), null)).toBe('Marcos Google')
    expect(getAuthDisplayName(user({ email: 'jogador@example.com', user_metadata: {} }), null)).toBe('jogador')
  })

  it('aceita os campos de avatar enviados pelo Google', () => {
    expect(getAuthAvatarUrl(user({ user_metadata: { picture: 'https://example.com/avatar.png' } }))).toBe('https://example.com/avatar.png')
    expect(getAuthAvatarUrl(user({ user_metadata: {} }))).toBeUndefined()
  })

  it('redireciona o OAuth para a rota do app no mesmo ambiente', () => {
    const redirect = new URL(getAuthRedirectUrl())
    expect(redirect.origin).toBe(window.location.origin)
    expect(redirect.pathname).toBe('/app')
  })
})
