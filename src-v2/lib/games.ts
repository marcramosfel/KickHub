import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

export type AttendanceStatus = 'confirmed' | 'declined' | 'waitlist'
export type GameStatus = 'scheduled' | 'played' | 'cancelled'

export type Game = {
  id: string
  scheduledAt: string
  durationMinutes: number
  location: string | null
  format: string
  teamSize: number
  maxPlayers: number | null
  status: GameStatus
  notes: string | null
  confirmedCount: number
  waitlistCount: number
  declinedCount: number
  myStatus: AttendanceStatus | null
}

type GameRow = {
  id: string
  scheduled_at: string
  duration_minutes: number
  location: string | null
  format: string
  team_size: number
  max_players: number | null
  status: string
  notes: string | null
  confirmed_count: number
  waitlist_count: number
  declined_count: number
  my_status: string | null
}

export type CreateGameInput = {
  peladaId: string
  scheduledAt: string
  durationMinutes: number
  location: string
  format: string
  teamSize: number
  maxPlayers: number | null
  notes: string
}

const attendanceStatuses: AttendanceStatus[] = ['confirmed', 'declined', 'waitlist']
const gameStatuses: GameStatus[] = ['scheduled', 'played', 'cancelled']

export function toGame(row: GameRow): Game {
  return {
    id: row.id,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    location: row.location,
    format: row.format,
    teamSize: row.team_size,
    maxPlayers: row.max_players,
    status: gameStatuses.includes(row.status as GameStatus) ? row.status as GameStatus : 'scheduled',
    notes: row.notes,
    confirmedCount: Number(row.confirmed_count) || 0,
    waitlistCount: Number(row.waitlist_count) || 0,
    declinedCount: Number(row.declined_count) || 0,
    myStatus: attendanceStatuses.includes(row.my_status as AttendanceStatus) ? row.my_status as AttendanceStatus : null,
  }
}

/** Vagas livres, ou null quando a pelada não impôs limite. */
export function remainingSeats(game: Pick<Game, 'maxPlayers' | 'confirmedCount'>) {
  if (game.maxPlayers === null) return null
  return Math.max(game.maxPlayers - game.confirmedCount, 0)
}

export async function listPeladaGames(peladaId: string, limit = 20, offset = 0) {
  const { data, error } = await supabase.rpc('list_pelada_games', {
    p_pelada_id: peladaId,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return ((data ?? []) as GameRow[]).map(toGame)
}

export async function createGame(input: CreateGameInput) {
  const { data, error } = await supabase.rpc('create_game', {
    p_pelada_id: input.peladaId,
    p_scheduled_at: input.scheduledAt,
    p_duration_minutes: input.durationMinutes,
    p_location: input.location,
    p_format: input.format,
    p_team_size: input.teamSize,
    p_max_players: input.maxPlayers,
    p_notes: input.notes,
  })
  if (error) throw error
  return data
}

export async function setGameAttendance(gameId: string, status: 'confirmed' | 'declined', note = '') {
  const { data, error } = await supabase.rpc('set_game_attendance', {
    p_game_id: gameId,
    p_status: status,
    p_note: note,
  })
  if (error) throw error
  return data
}

export async function cancelGame(gameId: string, reason = '') {
  const { data, error } = await supabase.rpc('cancel_game', { p_game_id: gameId, p_reason: reason })
  if (error) throw error
  return data
}

export function usePeladaGames(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-games', peladaId],
    queryFn: () => listPeladaGames(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 15_000,
  })
}

/**
 * As contagens e a lista de espera são decididas no servidor, portanto a
 * resposta local é invalidada em vez de adivinhada.
 */
export function useGameMutations(peladaId: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pelada-games', peladaId] })

  return {
    attend: useMutation({
      mutationFn: ({ gameId, status }: { gameId: string; status: 'confirmed' | 'declined' }) =>
        setGameAttendance(gameId, status),
      onSuccess: invalidate,
    }),
    create: useMutation({
      mutationFn: (input: CreateGameInput) => createGame(input),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: (gameId: string) => cancelGame(gameId),
      onSuccess: invalidate,
    }),
  }
}
