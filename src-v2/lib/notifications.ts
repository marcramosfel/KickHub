import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * Tipos que a interface sabe traduzir. O que vier de fora desta lista cai no
 * texto guardado na linha — é o que impede uma notificação futura de aparecer
 * em branco só porque o servidor foi mais longe do que o cliente.
 */
export const knownKinds = [
  'game.created',
  'game.cancelled',
  'join_request_approved',
  'join_request_rejected',
] as const

export type NotificationKind = typeof knownKinds[number]

export type AppNotification = {
  id: string
  kind: string
  title: string
  body: string | null
  peladaId: string | null
  gameId: string | null
  scheduledAt: string | null
  readAt: string | null
  createdAt: string
}

type NotificationRow = {
  id: string
  kind: string
  title: string
  body: string | null
  pelada_id: string | null
  payload: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

const asString = (value: unknown) => (typeof value === 'string' ? value : null)

export function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    peladaId: row.pelada_id,
    gameId: asString(row.payload?.game_id),
    scheduledAt: asString(row.payload?.scheduled_at),
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

export const isKnownKind = (kind: string): kind is NotificationKind =>
  (knownKinds as readonly string[]).includes(kind)

export const unreadCount = (items: readonly AppNotification[]) =>
  items.filter((item) => item.readAt === null).length

export async function listNotifications(limit = 20) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,kind,title,body,pelada_id,payload,read_at,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as NotificationRow[]).map(toNotification)
}

export async function markNotificationsRead() {
  const { error } = await supabase.rpc('mark_notifications_read')
  if (error) throw error
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications(),
    enabled: enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
