import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

export type Award = 'craque' | 'bagre'

/** De que lado a minha equipa ficou, que é o que decide em que prémio posso votar. */
export type TeamOutcome = 'winner' | 'loser' | 'draw'

export type AwardWinner = {
  award: Award
  membershipId: string
  displayName: string
  /**
   * `live` = ainda a contar votos; `votes` = congelado no fecho; `admin` = a
   * organização corrigiu. É a mesma ordem de precedência que o servidor aplica.
   */
  source: 'live' | 'votes' | 'admin'
}

export type MyAwardVote = {
  award: Award
  nomineeMembershipId: string
}

type ApiRow = Record<string, unknown>

export function toAwardWinner(row: ApiRow): AwardWinner {
  return {
    award: row.award === 'bagre' ? 'bagre' : 'craque',
    membershipId: String(row.membership_id ?? ''),
    displayName: String(row.display_name ?? 'Jogador'),
    source: row.source === 'admin' ? 'admin' : row.source === 'votes' ? 'votes' : 'live',
  }
}

export function toMyAwardVote(row: ApiRow): MyAwardVote {
  return {
    award: row.award === 'bagre' ? 'bagre' : 'craque',
    nomineeMembershipId: String(row.nominee_membership_id ?? ''),
  }
}

/**
 * Quem ganhou elege o craque; quem perdeu elege o bagre; num empate no placar
 * não há lados e vota-se nos dois. A regra é do servidor — isto só evita
 * oferecer o que vai ser recusado.
 */
export function canVote(award: Award, outcome: TeamOutcome | null) {
  if (outcome === null) return false
  if (outcome === 'draw') return true
  return award === 'craque' ? outcome === 'winner' : outcome === 'loser'
}

export async function getGameAwards(gameId: string) {
  const { data, error } = await supabase.rpc('get_game_awards', { p_game_id: gameId })
  if (error) throw error
  return ((data ?? []) as ApiRow[]).map(toAwardWinner)
}

export async function getMyGameAwardVotes(gameId: string) {
  const { data, error } = await supabase.rpc('get_my_game_award_votes', { p_game_id: gameId })
  if (error) throw error
  return ((data ?? []) as ApiRow[]).map(toMyAwardVote)
}

export async function voteGameAwards(gameId: string, craque: string | null, bagre: string | null) {
  const { error } = await supabase.rpc('vote_game_awards', {
    p_game_id: gameId,
    p_craque: craque,
    p_bagre: bagre,
  })
  if (error) throw error
}

export async function closeGameAwards(gameId: string) {
  const { error } = await supabase.rpc('close_game_awards', { p_game_id: gameId })
  if (error) throw error
}

export function useGameAwards(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['game-awards', gameId],
    queryFn: () => getGameAwards(gameId),
    enabled: Boolean(gameId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function useMyGameAwardVotes(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['game-award-votes', gameId],
    queryFn: () => getMyGameAwardVotes(gameId),
    enabled: Boolean(gameId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function useAwardMutations(gameId: string, peladaId: string | undefined) {
  const client = useQueryClient()
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['game-awards', gameId] })
    void client.invalidateQueries({ queryKey: ['game-award-votes', gameId] })
    // Os prémios entram no overall, portanto o ranking e o plantel ficam velhos.
    void client.invalidateQueries({ queryKey: ['pelada-ranking', peladaId] })
  }
  return {
    vote: useMutation({
      mutationFn: ({ craque, bagre }: { craque: string | null; bagre: string | null }) =>
        voteGameAwards(gameId, craque, bagre),
      onSuccess: invalidate,
    }),
    close: useMutation({ mutationFn: () => closeGameAwards(gameId), onSuccess: invalidate }),
  }
}
