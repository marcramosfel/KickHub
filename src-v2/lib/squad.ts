import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

export const positions = ['GK', 'DEF', 'MID', 'ATT'] as const
export const playerTypes = ['FIELD', 'GOALKEEPER', 'HYBRID'] as const

export type Position = typeof positions[number]
export type PlayerType = typeof playerTypes[number]

export type SquadMember = {
  membershipId: string
  displayName: string
  username: string | null
  role: 'owner' | 'admin' | 'player'
  playerType: PlayerType | null
  primaryPosition: Position | null
  secondaryPosition: Position | null
  acceptsOtherPositions: boolean
  overall: number | null
  isMe: boolean
}

type MemberRow = {
  membership_id: string
  display_name: string
  username: string | null
  role: string
  player_type: string | null
  primary_position: string | null
  secondary_position: string | null
  accepts_other_positions: boolean
  overall: number | null
  is_me: boolean
}

const isPosition = (value: unknown): value is Position => positions.includes(value as Position)
const isPlayerType = (value: unknown): value is PlayerType => playerTypes.includes(value as PlayerType)

export function toSquadMember(row: MemberRow): SquadMember {
  return {
    membershipId: row.membership_id,
    displayName: row.display_name,
    username: row.username,
    role: ['owner', 'admin', 'player'].includes(row.role) ? row.role as SquadMember['role'] : 'player',
    playerType: isPlayerType(row.player_type) ? row.player_type : null,
    primaryPosition: isPosition(row.primary_position) ? row.primary_position : null,
    secondaryPosition: isPosition(row.secondary_position) ? row.secondary_position : null,
    acceptsOtherPositions: row.accepts_other_positions !== false,
    overall: row.overall === null ? null : Number(row.overall),
    isMe: row.is_me === true,
  }
}

/**
 * Quem organiza acerta o plantel todo; cada jogador acerta apenas as suas
 * posições. O servidor recusa qualquer outra combinação — isto só evita
 * oferecer um controlo que iria falhar.
 */
export function canEditMember(member: SquadMember, canAdmin: boolean) {
  return canAdmin || member.isMe
}

export function canEditOverall(canAdmin: boolean) {
  return canAdmin
}

export type MemberAttributes = {
  membershipId: string
  playerType: PlayerType | null
  primaryPosition: Position | null
  secondaryPosition: Position | null
  acceptsOtherPositions: boolean
  overall: number | null
}

export async function listPeladaMembers(peladaId: string) {
  const { data, error } = await supabase.rpc('list_pelada_members', { p_pelada_id: peladaId })
  if (error) throw error
  return ((data ?? []) as MemberRow[]).map(toSquadMember)
}

export async function updatePeladaMember(input: MemberAttributes) {
  const { data, error } = await supabase.rpc('update_pelada_member', {
    p_membership_id: input.membershipId,
    p_player_type: input.playerType,
    p_primary_position: input.primaryPosition,
    p_secondary_position: input.secondaryPosition,
    p_accepts_other: input.acceptsOtherPositions,
    p_overall: input.overall,
  })
  if (error) throw error
  return data
}

export function usePeladaSquad(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-squad', peladaId],
    queryFn: () => listPeladaMembers(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function useSquadMutations(peladaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MemberAttributes) => updatePeladaMember(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pelada-squad', peladaId] }),
  })
}
