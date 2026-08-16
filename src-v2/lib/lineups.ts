import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DrawPlayer, DrawResult } from '../domain/team-draw'
import { isSupabaseConfigured, supabase } from './supabase'
import type { PlayerType, Position } from './squad'

export type LineupEntry = {
  membershipId: string
  displayName: string
  team: 'A' | 'B'
  isGoalkeeper: boolean
  overallAtDraw: number
  overallEstimated: boolean
}

type AttendanceRow = {
  membership_id: string
  display_name: string
  status: string
  overall: number | null
  player_type: string | null
  primary_position: string | null
  secondary_position: string | null
  accepts_other_positions: boolean
}

type LineupRow = {
  membership_id: string
  display_name: string
  team: string
  is_goalkeeper: boolean
  overall_at_draw: number
  overall_estimated: boolean
}

export function toDrawPlayer(row: AttendanceRow): DrawPlayer {
  return {
    id: row.membership_id,
    name: row.display_name,
    overall: row.overall === null ? null : Number(row.overall),
    playerType: (row.player_type as PlayerType | null) ?? null,
    primaryPosition: (row.primary_position as Position | null) ?? null,
    secondaryPosition: (row.secondary_position as Position | null) ?? null,
    acceptsOtherPositions: row.accepts_other_positions !== false,
  }
}

export function toLineupEntry(row: LineupRow): LineupEntry {
  return {
    membershipId: row.membership_id,
    displayName: row.display_name,
    team: row.team === 'B' ? 'B' : 'A',
    isGoalkeeper: row.is_goalkeeper === true,
    overallAtDraw: Number(row.overall_at_draw),
    overallEstimated: row.overall_estimated === true,
  }
}

/** Converte o resultado do domínio no formato que a RPC aceita. */
export function toLineupPayload(result: DrawResult) {
  return result.teams.flatMap((team) => team.players.map((player) => ({
    membership_id: player.id,
    team: team.key,
    is_goalkeeper: player.isGoalkeeper,
    overall_at_draw: player.effectiveOverall,
    overall_estimated: player.estimatedOverall,
  })))
}

export async function listConfirmedPlayers(gameId: string) {
  const { data, error } = await supabase.rpc('list_game_attendance', { p_game_id: gameId })
  if (error) throw error
  return ((data ?? []) as AttendanceRow[])
    .filter((row) => row.status === 'confirmed')
    .map(toDrawPlayer)
}

export async function getGameLineup(gameId: string) {
  const { data, error } = await supabase.rpc('get_game_lineup', { p_game_id: gameId })
  if (error) throw error
  return ((data ?? []) as LineupRow[]).map(toLineupEntry)
}

export async function saveGameLineup(gameId: string, result: DrawResult) {
  const { error } = await supabase.rpc('save_game_lineup', {
    p_game_id: gameId,
    p_seed: result.seed,
    p_lineup: toLineupPayload(result),
  })
  if (error) throw error
}

export function useGameLineup(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['game-lineup', gameId],
    queryFn: () => getGameLineup(gameId),
    enabled: Boolean(gameId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function useLineupMutations(gameId: string, peladaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (result: DrawResult) => saveGameLineup(gameId, result),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['game-lineup', gameId] })
      await queryClient.invalidateQueries({ queryKey: ['pelada-games', peladaId] })
    },
  })
}

export { listConfirmedPlayers as fetchConfirmedPlayers }
