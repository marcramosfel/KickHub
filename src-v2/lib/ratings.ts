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

/**
 * As notas que recebi, jogo a jogo.
 *
 * Agregado e nunca a linha: a política `game_ratings_own_read` só deixa alguém
 * ler as avaliações que **deu**, e as que recebeu são anónimas de propósito.
 * Abaixo de três avaliadores num jogo o servidor devolve a contagem sem a
 * média — com dois, numa pelada de dez, a média é praticamente uma assinatura.
 */
export type RatingHistoryEntry = {
  gameId: string
  playedAt: string
  raters: number
  /** `null` quando foram poucos para agregar sem identificar quem avaliou. */
  average: number | null
}

export async function getMyRatingHistory(peladaId: string): Promise<RatingHistoryEntry[]> {
  const { data, error } = await supabase.rpc('get_my_rating_history', { p_pelada_id: peladaId })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    gameId: String(row.game_id ?? ''),
    playedAt: String(row.played_at ?? ''),
    raters: Number(row.raters) || 0,
    average: row.average === null || row.average === undefined ? null : Number(row.average),
  }))
}

export function useMyRatingHistory(peladaId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['my-rating-history', peladaId],
    queryFn: () => getMyRatingHistory(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

/**
 * O histórico de um jogador, jogo a jogo.
 *
 * Vive aqui e não num ficheiro próprio porque é lido no mesmo sítio das notas —
 * as duas abas do card que olham para trás — e um terceiro módulo para duas
 * funções seria arrumação sem arrumar nada.
 */
export type GameHistoryEntry = {
  gameId: string
  playedAt: string
  goals: number
  assists: number
  saves: number
  /** `null` quando o jogo ainda não tem resultado: por registar não é empate. */
  outcome: 'win' | 'draw' | 'loss' | null
  craque: boolean
}

export async function getPlayerGameHistory(peladaId: string, membershipId: string) {
  const { data, error } = await supabase.rpc('get_player_game_history', {
    p_pelada_id: peladaId,
    p_membership_id: membershipId,
  })
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map((row): GameHistoryEntry => ({
    gameId: String(row.game_id ?? ''),
    playedAt: String(row.played_at ?? ''),
    goals: Number(row.goals) || 0,
    assists: Number(row.assists) || 0,
    saves: Number(row.saves) || 0,
    outcome: row.outcome === 'win' || row.outcome === 'draw' || row.outcome === 'loss'
      ? row.outcome
      : null,
    craque: row.craque === true,
  }))
}

export function usePlayerGameHistory(peladaId: string | undefined, membershipId: string | undefined) {
  return useQuery({
    queryKey: ['player-game-history', peladaId, membershipId],
    queryFn: () => getPlayerGameHistory(peladaId!, membershipId!),
    enabled: Boolean(peladaId && membershipId) && isSupabaseConfigured,
    staleTime: 30_000,
  })
}
