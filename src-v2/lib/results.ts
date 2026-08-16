import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

export type PlayerStat = {
  membershipId: string
  displayName: string
  team: 'A' | 'B' | null
  goals: number
  assists: number
  ownGoals: number
  saves: number
}

export type GameResult = {
  scoreA: number
  scoreB: number
  notes: string | null
  recordedAt: string
  players: PlayerStat[]
}

type ResultRow = {
  score_a: number
  score_b: number
  notes: string | null
  recorded_at: string
  membership_id: string | null
  display_name: string | null
  team: string | null
  goals: number | null
  assists: number | null
  own_goals: number | null
  saves: number | null
}

/**
 * A RPC devolve o placar repetido em cada linha de jogador, como qualquer join.
 * Aqui volta a ser um resultado com uma lista dentro.
 */
export function toGameResult(rows: ResultRow[]): GameResult | null {
  if (rows.length === 0) return null
  const [first] = rows
  return {
    scoreA: Number(first.score_a) || 0,
    scoreB: Number(first.score_b) || 0,
    notes: first.notes,
    recordedAt: first.recorded_at,
    players: rows
      .filter((row) => row.membership_id !== null)
      .map((row) => ({
        membershipId: row.membership_id!,
        displayName: row.display_name ?? 'Jogador',
        team: row.team === 'A' || row.team === 'B' ? row.team : null,
        goals: Number(row.goals) || 0,
        assists: Number(row.assists) || 0,
        ownGoals: Number(row.own_goals) || 0,
        saves: Number(row.saves) || 0,
      })),
  }
}

export type StatInput = {
  membershipId: string
  goals: number
  assists: number
  ownGoals: number
  saves: number
}

export async function getGameResult(gameId: string) {
  const { data, error } = await supabase.rpc('get_game_result', { p_game_id: gameId })
  if (error) throw error
  return toGameResult((data ?? []) as ResultRow[])
}

export async function saveGameResult(
  gameId: string,
  scoreA: number,
  scoreB: number,
  notes: string,
  stats: StatInput[],
) {
  // Só sobe quem tem algo a registar: uma linha de zeros para o plantel todo
  // enche a tabela sem acrescentar informação.
  const payload = stats
    .filter((stat) => stat.goals || stat.assists || stat.ownGoals || stat.saves)
    .map((stat) => ({
      membership_id: stat.membershipId,
      goals: stat.goals,
      assists: stat.assists,
      own_goals: stat.ownGoals,
      saves: stat.saves,
    }))

  const { error } = await supabase.rpc('save_game_result', {
    p_game_id: gameId,
    p_score_a: scoreA,
    p_score_b: scoreB,
    p_notes: notes,
    p_stats: payload,
  })
  if (error) throw error
}

export function useGameResult(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['game-result', gameId],
    queryFn: () => getGameResult(gameId),
    enabled: Boolean(gameId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function useResultMutations(gameId: string, peladaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { scoreA: number; scoreB: number; notes: string; stats: StatInput[] }) =>
      saveGameResult(gameId, input.scoreA, input.scoreB, input.notes, input.stats),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['game-result', gameId] })
      await queryClient.invalidateQueries({ queryKey: ['pelada-games', peladaId] })
    },
  })
}
