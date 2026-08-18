import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { assertServiceRoleKey } from './lib/brownsSnapshot.mjs'
import { AVATAR_BUCKET, assertMediaMode, avatarObjectPath, decodeLegacyDataUrl } from './lib/brownsMedia.mjs'

const url = process.env.BROWNS_MEDIA_SUPABASE_URL
const key = process.env.BROWNS_MEDIA_SERVICE_ROLE_KEY
const mode = process.env.BROWNS_MEDIA_MODE

if (!url) throw new Error('BROWNS_MEDIA_SUPABASE_URL nao definido.')
assertServiceRoleKey(key)
assertMediaMode(mode, process.env.BROWNS_MEDIA_CONFIRM)

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: backfill, error: backfillError } = await client.rpc('backfill_browns_content')
if (backfillError) throw backfillError

let migrated = 0
let failed = 0
const pageSize = 50

for (;;) {
  const { data: pending, error } = await client
    .from('game_media')
    .select('id,legacy_media_id,bucket_id,object_path')
    .eq('status', 'pending')
    .not('legacy_media_id', 'is', null)
    .order('created_at')
    .range(0, pageSize - 1)
  if (error) throw error
  if (!pending?.length) break

  for (const media of pending) {
    try {
      const { data: legacy, error: legacyError } = await client
        .from('match_media')
        .select('data_url')
        .eq('id', media.legacy_media_id)
        .single()
      if (legacyError) throw legacyError

      const decoded = decodeLegacyDataUrl(legacy.data_url)
      const { error: uploadError } = await client.storage
        .from(media.bucket_id)
        .upload(media.object_path, decoded.bytes, { contentType: decoded.mimeType, upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const { error: readyError } = await client.rpc('mark_browns_media_ready', {
        p_media_id: media.id,
        p_mime_type: decoded.mimeType,
        p_sha256: decoded.sha256,
        p_byte_size: decoded.bytes.length,
      })
      if (readyError) throw readyError
      migrated += 1
    } catch (error) {
      failed += 1
      console.error(`Falha ao migrar media ${media.id}:`, error instanceof Error ? error.message : String(error))
      const { error: failedError } = await client.rpc('mark_browns_media_failed', { p_media_id: media.id })
      if (failedError) throw failedError
    }
  }
  if (pending.length < pageSize) break
}

// As fotos de jogador seguem o mesmo contrato das fotos de jogo, mas vivem no
// perfil: o backfill deixa o perfil `pending` sem caminho, e so aqui a imagem
// chega ao bucket privado e o estado passa a `ready`. Enquanto isso nao
// acontecer, o plantel mostra iniciais em vez de uma foto meia carregada.
let avatarsMigrated = 0
let avatarsFailed = 0

for (;;) {
  const { data: pendingAvatars, error } = await client.rpc('list_browns_pending_avatars', { p_limit: pageSize })
  if (error) throw error
  if (!pendingAvatars?.length) break

  let advanced = 0
  for (const avatar of pendingAvatars) {
    try {
      const decoded = decodeLegacyDataUrl(avatar.data_url)
      const objectPath = avatarObjectPath(avatar.profile_id, decoded.mimeType)
      const { error: uploadError } = await client.storage
        .from(AVATAR_BUCKET)
        .upload(objectPath, decoded.bytes, { contentType: decoded.mimeType, upsert: true, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const { error: readyError } = await client.rpc('mark_browns_avatar_ready', {
        p_profile_id: avatar.profile_id,
        p_object_path: objectPath,
        p_bucket_id: AVATAR_BUCKET,
        p_mime_type: decoded.mimeType,
        p_sha256: decoded.sha256,
        p_byte_size: decoded.bytes.length,
      })
      if (readyError) throw readyError
      avatarsMigrated += 1
    } catch (avatarError) {
      avatarsFailed += 1
      console.error(`Falha ao migrar avatar ${avatar.profile_id}:`, avatarError instanceof Error ? avatarError.message : String(avatarError))
      const { error: failedError } = await client.rpc('mark_browns_avatar_failed', { p_profile_id: avatar.profile_id })
      if (failedError) throw failedError
    }
    // Sucesso ou falha, o perfil sai de `pending` — e por isso que a proxima
    // pagina avanca. Sem isto, um erro que nao marcasse nada girava para sempre.
    advanced += 1
  }
  if (advanced === 0) break
}

console.log(JSON.stringify({ mode, backfill, migrated, failed, avatarsMigrated, avatarsFailed }))
if (failed > 0 || avatarsFailed > 0) process.exitCode = 1
