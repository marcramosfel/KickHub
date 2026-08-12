import type { Pelada } from '../data/demo'
import { isSupabaseConfigured, supabase } from './supabase'

export type JoinRequestRecord = {
  id: string
  peladaId: string
  profileId: string
  playerName: string
  username: string
  message: string
  createdAt: string
  status: 'pending' | 'approved' | 'rejected'
}

export async function hasSupabaseSession() {
  const { data } = await supabase.auth.getSession()
  return Boolean(data.session)
}

export async function discoverPublicPeladas(query: string): Promise<Pelada[] | null> {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase.rpc('discover_public_peladas', {
    p_query: query || null,
    p_city: null,
    p_limit: 24,
    p_offset: 0,
  })
  if (error) return null
  return (data ?? []).map((row: Record<string, string | null>) => ({
    id: row.id ?? '',
    slug: row.slug ?? '',
    name: row.name ?? 'Pelada',
    description: row.description ?? 'Comunidade de futebol aberta a novos jogadores.',
    city: row.city ?? '',
    country: row.country_code ?? '',
    membership: 'none' as const,
    joinMode: (row.join_mode ?? 'approval') as Pelada['joinMode'],
    members: 0,
    nextMatch: 'A anunciar',
    accent: '#d8ff45',
    visibility: 'public' as const,
  }))
}

export async function requestPeladaMembership(peladaId: string, message: string) {
  const { data, error } = await supabase.rpc('request_pelada_membership', {
    p_pelada_id: peladaId,
    p_message: message || null,
  })
  if (error) throw error
  return data as { status: 'pending' | 'active'; request_id: string | null }
}

export async function listPendingJoinRequests(peladaId: string): Promise<JoinRequestRecord[]> {
  const { data, error } = await supabase
    .from('pelada_join_requests')
    .select('id,pelada_id,profile_id,message,status,created_at,profiles!pelada_join_requests_profile_id_fkey(display_name,username)')
    .eq('pelada_id', peladaId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      id: row.id,
      peladaId: row.pelada_id,
      profileId: row.profile_id,
      playerName: profile?.display_name ?? 'Jogador',
      username: profile?.username ?? 'jogador',
      message: row.message ?? '',
      createdAt: new Intl.DateTimeFormat('pt', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.created_at)),
      status: row.status,
    }
  })
}

export async function reviewJoinRequest(requestId: string, decision: 'approved' | 'rejected') {
  const { data, error } = await supabase.rpc('review_pelada_join_request', {
    p_request_id: requestId,
    p_decision: decision,
  })
  if (error) throw error
  return data
}

export async function createPeladaInvite(peladaId: string, maxUses: number, expiresInHours: number) {
  const { data, error } = await supabase.rpc('create_pelada_invite', {
    p_pelada_id: peladaId,
    p_role: 'player',
    p_max_uses: maxUses,
    p_expires_in_hours: expiresInHours,
  })
  if (error) throw error
  return data as { token: string; invite_id: string; expires_at: string }
}

export async function acceptPeladaInvite(token: string) {
  const { data, error } = await supabase.rpc('accept_pelada_invite', { p_token: token })
  if (error) throw error
  return data as { pelada_id: string; slug: string; status: 'active' }
}
