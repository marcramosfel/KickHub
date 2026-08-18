import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured, supabase } from './supabase'

/**
 * As fotos vivem num bucket privado. O servidor devolve o caminho do objeto — e
 * só quando ele já lá está — e é aqui que esse caminho vira um URL que o browser
 * consegue carregar.
 *
 * Assina em lote, uma chamada por bucket, porque um plantel de trinta jogadores
 * são trinta pedidos se cada `<Avatar>` se assinar a si mesmo.
 */
export type AvatarSource = {
  /** Serve de chave do resultado: normalmente o `membershipId` da linha. */
  id: string
  path: string | null
  bucket: string | null
}

const AVATAR_TTL_SECONDS = 3600

/** Renovamos antes de expirar; um URL assinado que morre no ecrã é uma foto partida. */
const AVATAR_STALE_MS = (AVATAR_TTL_SECONDS - 300) * 1000

export type AvatarUrls = Map<string, string>

export async function signAvatars(sources: readonly AvatarSource[]): Promise<AvatarUrls> {
  const usable = sources.filter((source): source is AvatarSource & { path: string; bucket: string } =>
    Boolean(source.path) && Boolean(source.bucket))
  if (usable.length === 0) return new Map()

  const byBucket = new Map<string, typeof usable>()
  for (const source of usable) byBucket.set(source.bucket, [...(byBucket.get(source.bucket) ?? []), source])

  const signed = await Promise.all([...byBucket.entries()].map(async ([bucket, items]) => {
    // Um caminho repetido — a mesma pessoa em duas linhas — pede uma assinatura
    // só. A ordem de `createSignedUrls` acompanha a dos caminhos enviados.
    const paths = [...new Set(items.map((item) => item.path))]
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, AVATAR_TTL_SECONDS)
    if (error) throw error
    const urlByPath = new Map(paths.flatMap((path, index) => {
      const url = data?.[index]?.signedUrl
      return url ? [[path, url] as const] : []
    }))
    return items.flatMap((item) => {
      const url = urlByPath.get(item.path)
      return url ? [[item.id, url] as const] : []
    })
  }))

  return new Map(signed.flat())
}

/**
 * Uma foto que não carrega não é um erro que valha a pena mostrar: o `<Avatar>`
 * cai nas iniciais sozinho. Por isso a query nunca tenta outra vez nem propaga
 * a falha para o ecrã.
 */
export function useSignedAvatars(sources: readonly AvatarSource[]) {
  const usable = sources.filter((source) => source.path && source.bucket)
  const key = usable.map((source) => `${source.bucket}:${source.path}`).sort().join('|')

  const query = useQuery({
    queryKey: ['signed-avatars', key],
    queryFn: () => signAvatars(usable),
    enabled: key.length > 0 && isSupabaseConfigured,
    staleTime: AVATAR_STALE_MS,
    gcTime: AVATAR_STALE_MS,
    retry: false,
  })

  return query.data ?? new Map<string, string>()
}
