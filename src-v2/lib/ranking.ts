import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

export type RankingRow = {
  membershipId: string
  displayName: string
  gamesPlayed: number
  goals: number
  assists: number
  ownGoals: number
  saves: number
  wins: number
  draws: number
  losses: number
}

export type PeladaTotals = {
  gamesPlayed: number
  goals: number
  assists: number
  activeMembers: number
}

type RankingApiRow = Record<string, unknown>

const toNumber = (value: unknown) => Number(value) || 0

export function toRankingRow(row: RankingApiRow): RankingRow {
  return {
    membershipId: String(row.membership_id ?? ''),
    displayName: String(row.display_name ?? 'Jogador'),
    gamesPlayed: toNumber(row.games_played),
    goals: toNumber(row.goals),
    assists: toNumber(row.assists),
    ownGoals: toNumber(row.own_goals),
    saves: toNumber(row.saves),
    wins: toNumber(row.wins),
    draws: toNumber(row.draws),
    losses: toNumber(row.losses),
  }
}

/** Golos + assistências: o contributo direto para os golos da equipa. */
export function contribution(row: Pick<RankingRow, 'goals' | 'assists'>) {
  return row.goals + row.assists
}

/**
 * Percentagem de vitórias sobre jogos com resultado conhecido. Devolve null
 * quando não há nenhum: mostrar 0% a quem nunca teve um jogo decidido leria
 * como se tivesse perdido sempre.
 */
export function winRate(row: Pick<RankingRow, 'wins' | 'draws' | 'losses'>) {
  const decided = row.wins + row.draws + row.losses
  return decided === 0 ? null : row.wins / decided
}

export async function getPeladaRanking(peladaId: string) {
  const { data, error } = await supabase.rpc('get_pelada_ranking', { p_pelada_id: peladaId })
  if (error) throw error
  return ((data ?? []) as RankingApiRow[]).map(toRankingRow)
}

export async function getPeladaTotals(peladaId: string) {
  const { data, error } = await supabase.rpc('get_pelada_totals', { p_pelada_id: peladaId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as RankingApiRow | undefined
  if (!row) return null
  return {
    gamesPlayed: toNumber(row.games_played),
    goals: toNumber(row.goals),
    assists: toNumber(row.assists),
    activeMembers: toNumber(row.active_members),
  } satisfies PeladaTotals
}

export function usePeladaRanking(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-ranking', peladaId],
    queryFn: () => getPeladaRanking(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function usePeladaTotals(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-totals', peladaId],
    queryFn: () => getPeladaTotals(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}
