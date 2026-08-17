import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { assertServiceRoleKey } from './lib/brownsSnapshot.mjs'
import { assertMediaMode, decodeLegacyDataUrl } from './lib/brownsMedia.mjs'

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

console.log(JSON.stringify({ mode, backfill, migrated, failed }))
if (failed > 0) process.exitCode = 1
