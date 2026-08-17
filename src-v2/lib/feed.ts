import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

export type FeedKind = 'scheduled' | 'draw' | 'result' | 'cancellation' | 'substitution'
export type FeedMedia = { id: string; kind: string; alt: string; url: string }
export type FeedEvent = {
  id: string; gameId: string | null; kind: FeedKind; title: string | null; body: string | null
  payload: Record<string, unknown>; publishedAt: string; media: FeedMedia[]
}

type FeedMediaRow = { id: string; bucket: string; path: string; kind: string; alt: string }
type FeedRow = {
  id: string; game_id: string | null; kind: string; title: string | null; body: string | null
  payload: Record<string, unknown> | null; published_at: string; media: FeedMediaRow[] | null
}

const kinds: FeedKind[] = ['scheduled', 'draw', 'result', 'cancellation', 'substitution']

async function signMedia(items: FeedMediaRow[]): Promise<FeedMedia[]> {
  const groups = new Map<string, FeedMediaRow[]>()
  for (const item of items) groups.set(item.bucket, [...(groups.get(item.bucket) ?? []), item])
  const signed = await Promise.all([...groups.entries()].map(async ([bucket, bucketItems]) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(bucketItems.map((item) => item.path), 3600)
    if (error) throw error
    return bucketItems.flatMap((item, index) => {
      const url = data?.[index]?.signedUrl
      return url ? [{ id: item.id, kind: item.kind, alt: item.alt, url }] : []
    })
  }))
  return signed.flat()
}

export async function listPeladaFeed(peladaId: string, limit = 30): Promise<FeedEvent[]> {
  const { data, error } = await supabase.rpc('get_pelada_feed', { p_pelada_id: peladaId, p_limit: limit, p_before: null })
  if (error) throw error
  const rows = (data ?? []) as FeedRow[]
  const media = await signMedia(rows.flatMap((row) => row.media ?? []))
  const mediaById = new Map(media.map((item) => [item.id, item]))
  return rows.map((row) => ({
    id: row.id, gameId: row.game_id,
    kind: kinds.includes(row.kind as FeedKind) ? row.kind as FeedKind : 'scheduled',
    title: row.title, body: row.body, payload: row.payload ?? {}, publishedAt: row.published_at,
    media: (row.media ?? []).flatMap((item) => mediaById.get(item.id) ?? []),
  }))
}

export function usePeladaFeed(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-feed', peladaId], queryFn: () => listPeladaFeed(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured, staleTime: 30_000,
  })
}
