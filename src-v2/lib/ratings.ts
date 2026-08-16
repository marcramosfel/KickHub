import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

/** Uma nota vai de uma a cinco estrelas. */
export const MIN_STARS = 1
export const MAX_STARS = 5

export type GivenRating = {
  ratedMembershipId: string
  stars: number
}

type RatingApiRow = Record<string, unknown>

export function toGivenRating(row: RatingApiRow): GivenRating {
  return {
    ratedMembershipId: String(row.rated_membership_id ?? ''),
    stars: Number(row.stars) || MIN_STARS,
  }
}

export async function getMyGameRatings(gameId: string) {
  const { data, error } = await supabase.rpc('get_my_game_ratings', { p_game_id: gameId })
  if (error) throw error
  return ((data ?? []) as RatingApiRow[]).map(toGivenRating)
}

export async function rateGamePlayers(gameId: string, ratings: GivenRating[]) {
  const { error } = await supabase.rpc('rate_game_players', {
    p_game_id: gameId,
    p_ratings: ratings.map((rating) => ({ membership_id: rating.ratedMembershipId, stars: rating.stars })),
  })
  if (error) throw error
}

export function useMyGameRatings(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['game-ratings', gameId],
    queryFn: () => getMyGameRatings(gameId),
    enabled: Boolean(gameId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function useRatingMutations(gameId: string, peladaId: string | undefined) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (ratings: GivenRating[]) => rateGamePlayers(gameId, ratings),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['game-ratings', gameId] })
      // A média entra no overall, portanto o ranking e o plantel ficam velhos
      // no instante em que alguém avalia.
      void client.invalidateQueries({ queryKey: ['pelada-ranking', peladaId] })
    },
  })
}
