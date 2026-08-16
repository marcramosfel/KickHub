import { useQuery } from '@tanstack/react-query'
import { explainOverall, type OverallBreakdown, type TitleKey } from '../domain/player-overall'
import { toRankingRow, type RankingRow } from './ranking'
import { isSupabaseConfigured, supabase } from './supabase'

export type PlayerProfileIdentity = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  countryCode: string | null
  city: string | null
  locale: string
  timezone: string
}

export type PlayerProfileCommunity = {
  id: string
  slug: string
  name: string
  city: string
  countryCode: string
  role: 'owner' | 'admin' | 'player'
  membershipId: string
  playerType: string | null
  primaryPosition: string | null
  secondaryPosition: string | null
  memberCount: number
  stats: RankingRow
  titles: TitleKey[]
  overall: OverallBreakdown | null
}

export type MyPlayerProfile = {
  profile: PlayerProfileIdentity
  peladas: PlayerProfileCommunity[]
  totals: {
    peladas: number
    matches: number
    goals: number
    assists: number
    craques: number
  }
}

type ApiObject = Record<string, unknown>

const asObject = (value: unknown): ApiObject => value && typeof value === 'object' && !Array.isArray(value)
  ? value as ApiObject
  : {}
const asString = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const asNullableString = (value: unknown) => typeof value === 'string' && value ? value : null
const asNumber = (value: unknown) => Number(value) || 0
const validRoles = new Set(['owner', 'admin', 'player'])
const validTitles = new Set<TitleKey>([
  'topScorer', 'topAssists', 'mostWins', 'mostCraques', 'mostGames', 'winStreak',
])

export function toMyPlayerProfile(value: unknown): MyPlayerProfile {
  const root = asObject(value)
  const profile = asObject(root.profile)
  const communities = Array.isArray(root.peladas) ? root.peladas : []

  const peladas = communities.map((item): PlayerProfileCommunity => {
    const community = asObject(item)
    const rawStats = asObject(community.stats)
    const stats = toRankingRow(rawStats)
    const titles = (Array.isArray(rawStats.titles) ? rawStats.titles : [])
      .filter((title): title is TitleKey => typeof title === 'string' && validTitles.has(title as TitleKey))
    const leagueAverageRaw = rawStats.gk_league_conceded_per_game
    const leagueAverage = leagueAverageRaw === null || leagueAverageRaw === undefined
      ? null
      : Number(leagueAverageRaw)
    const overall = explainOverall({
      ...stats,
      titles,
      gkLeagueConcededPerGame: Number.isFinite(leagueAverage) ? leagueAverage : null,
    })
    const role = asString(community.role, 'player')

    return {
      id: asString(community.id),
      slug: asString(community.slug),
      name: asString(community.name),
      city: asString(community.city),
      countryCode: asString(community.country_code),
      role: validRoles.has(role) ? role as PlayerProfileCommunity['role'] : 'player',
      membershipId: asString(community.membership_id),
      playerType: asNullableString(community.player_type),
      primaryPosition: asNullableString(community.primary_position),
      secondaryPosition: asNullableString(community.secondary_position),
      memberCount: asNumber(community.member_count),
      stats,
      titles,
      overall,
    }
  })

  return {
    profile: {
      id: asString(profile.id),
      username: asString(profile.username),
      displayName: asString(profile.display_name, 'Jogador'),
      avatarUrl: asNullableString(profile.avatar_path),
      bio: asNullableString(profile.bio),
      countryCode: asNullableString(profile.country_code),
      city: asNullableString(profile.city),
      locale: asString(profile.locale, 'pt'),
      timezone: asString(profile.timezone, 'Europe/Zurich'),
    },
    peladas,
    totals: {
      peladas: peladas.length,
      matches: peladas.reduce((sum, community) => sum + community.stats.gamesPlayed, 0),
      goals: peladas.reduce((sum, community) => sum + community.stats.goals, 0),
      assists: peladas.reduce((sum, community) => sum + community.stats.assists, 0),
      craques: peladas.reduce((sum, community) => sum + community.stats.craques, 0),
    },
  }
}

export async function getMyPlayerProfile() {
  const { data, error } = await supabase.rpc('get_my_player_profile')
  if (error) throw error
  return toMyPlayerProfile(data)
}

export function useMyPlayerProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-player-profile', userId],
    queryFn: getMyPlayerProfile,
    enabled: Boolean(userId && isSupabaseConfigured),
    staleTime: 30_000,
  })
}
