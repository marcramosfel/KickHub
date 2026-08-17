export type Pelada = {
  id: string
  slug: string
  name: string
  city: string
  country: string
  role?: 'owner' | 'admin' | 'player'
  membership: 'active' | 'none'
  joinMode: 'invite' | 'approval' | 'open'
  members: number
  nextMatch: string
  nextMatchAt?: string
  accent: string
  visibility: 'public' | 'unlisted' | 'private'
  description: string
}
