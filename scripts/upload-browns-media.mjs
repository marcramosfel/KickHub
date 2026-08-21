/**
 * Sobe as imagens da exportação Browns para os buckets privados do KickHub.
 *
 * Existe porque uma imagem em base64 dentro de uma linha não passa por
 * PostgREST: o corpo do pedido cresce até o gateway o deixar cair, e o erro que
 * chega é um `TypeError: fetch failed` sem resposta HTTP que explique nada. Os
 * bytes não pertencem a uma linha de qualquer maneira — o importador tira-os e
 * este passo entrega-os ao Storage, que é o transporte feito para eles.
 *
 * Este é o caminho do staging, onde os dados atravessam a API. No cutover de
 * produção as tabelas legadas são restauradas por `pg_restore` e as imagens já
 * lá estão: aí corre-se `npm run data:migrate-media`, que as lê da base.
 *
 *   KICKHUB_STAGING_SERVICE_ROLE_KEY=... \
 *   node scripts/upload-browns-media.mjs --input <exportacao.json>
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { assertServiceRoleKey } from './lib/brownsSnapshot.mjs'
import { AVATAR_BUCKET, avatarObjectPath, decodeLegacyDataUrl } from './lib/brownsMedia.mjs'
import { KICKHUB_STAGING_PROJECT_REF } from './lib/brownsStagingImport.mjs'

const TARGET_URL = `https://${KICKHUB_STAGING_PROJECT_REF}.supabase.co`
const BROWNS_PELADA_ID = '00000000-0000-4000-8000-000000000101'

function inputPathFromArgs(argv) {
  const index = argv.indexOf('--input')
  if (index >= 0 && argv[index + 1]) return path.resolve(argv[index + 1])
  const assigned = argv.find((argument) => argument.startsWith('--input='))
  if (assigned) return path.resolve(assigned.slice('--input='.length))
  const positional = argv.find((argument) => !argument.startsWith('-'))
  if (positional) return path.resolve(positional)
  throw new Error('Informe o arquivo da exportação com --input.')
}

/** `legacy_player_id` → `profile_id`, para saber de quem é cada foto. */
async function profilesByLegacyPlayer(supabase) {
  const { data, error } = await supabase
    .from('pelada_memberships')
    .select('legacy_player_id,profile_id')
    .eq('pelada_id', BROWNS_PELADA_ID)
    .not('legacy_player_id', 'is', null)
  if (error) throw new Error(`Não foi possível ler os membros: ${error.message}`)
  return new Map((data ?? []).map((row) => [row.legacy_player_id, row.profile_id]))
}

async function uploadAvatars(supabase, players) {
  const profiles = await profilesByLegacyPlayer(supabase)
  let uploaded = 0
  let failed = 0
  let skipped = 0

  for (const player of players) {
    if (typeof player.photo_url !== 'string' || !player.photo_url.startsWith('data:image/')) continue

    const profileId = profiles.get(player.id)
    if (!profileId) {
      // Sem perfil projetado não há dono para a foto. Acontece se o backfill
      // ainda não correu; avisar é melhor do que subir um objeto órfão.
      process.stderr.write(`! jogador ${player.id} sem perfil projetado; foto ignorada\n`)
      skipped += 1
      continue
    }

    try {
      const decoded = decodeLegacyDataUrl(player.photo_url)
      const objectPath = avatarObjectPath(profileId, decoded.mimeType)
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(objectPath, decoded.bytes, {
          contentType: decoded.mimeType, upsert: true, cacheControl: '3600',
        })
      if (uploadError) throw uploadError

      const { error: readyError } = await supabase.rpc('mark_browns_avatar_ready', {
        p_profile_id: profileId,
        p_object_path: objectPath,
        p_bucket_id: AVATAR_BUCKET,
        p_mime_type: decoded.mimeType,
        p_sha256: decoded.sha256,
        p_byte_size: decoded.bytes.length,
      })
      if (readyError) throw readyError
      uploaded += 1
    } catch (error) {
      failed += 1
      process.stderr.write(`Falha na foto do jogador ${player.id}: ${error instanceof Error ? error.message : String(error)}\n`)
      // O perfil fica `failed` e não `pending`: uma foto que falhou não deve
      // ficar à espera de uma repetição que ninguém pediu.
      const { error: failedError } = await supabase.rpc('mark_browns_avatar_failed', { p_profile_id: profileId })
      if (failedError) process.stderr.write(`  e não foi possível marcá-la: ${failedError.message}\n`)
    }
  }

  return { uploaded, failed, skipped }
}

async function uploadGameMedia(supabase, mediaRows) {
  const { data, error } = await supabase
    .from('game_media')
    .select('id,legacy_media_id,bucket_id,object_path')
    .eq('pelada_id', BROWNS_PELADA_ID)
    .not('legacy_media_id', 'is', null)
  if (error) throw new Error(`Não foi possível ler a mídia projetada: ${error.message}`)

  const destinations = new Map((data ?? []).map((row) => [row.legacy_media_id, row]))
  let uploaded = 0
  let failed = 0

  for (const media of mediaRows) {
    if (typeof media.data_url !== 'string' || !media.data_url.startsWith('data:image/')) continue
    const destination = destinations.get(media.id)
    if (!destination) continue

    try {
      const decoded = decodeLegacyDataUrl(media.data_url)
      const { error: uploadError } = await supabase.storage
        .from(destination.bucket_id)
        .upload(destination.object_path, decoded.bytes, {
          contentType: decoded.mimeType, upsert: true, cacheControl: '3600',
        })
      if (uploadError) throw uploadError

      const { error: readyError } = await supabase.rpc('mark_browns_media_ready', {
        p_media_id: destination.id,
        p_mime_type: decoded.mimeType,
        p_sha256: decoded.sha256,
        p_byte_size: decoded.bytes.length,
      })
      if (readyError) throw readyError
      uploaded += 1
    } catch (uploadError) {
      failed += 1
      process.stderr.write(`Falha na mídia ${media.id}: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}\n`)
      const { error: failedError } = await supabase.rpc('mark_browns_media_failed', { p_media_id: destination.id })
      if (failedError) process.stderr.write(`  e não foi possível marcá-la: ${failedError.message}\n`)
    }
  }

  return { uploaded, failed }
}

async function main() {
  const inputPath = inputPathFromArgs(process.argv.slice(2))
  const backup = JSON.parse(await readFile(inputPath, 'utf8'))

  const serviceRoleKey = process.env.KICKHUB_STAGING_SERVICE_ROLE_KEY ?? ''
  assertServiceRoleKey(serviceRoleKey)

  const supabase = createClient(TARGET_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'kickhub-staging-media-upload/1' } },
  })

  const players = backup.tables?.players?.rows ?? []
  const mediaRows = backup.tables?.match_media?.rows ?? []

  const avatars = await uploadAvatars(supabase, players)
  const media = await uploadGameMedia(supabase, mediaRows)

  process.stdout.write(`${JSON.stringify({ avatars, media }, null, 2)}\n`)
  if (avatars.failed > 0 || media.failed > 0) process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`Falha ao subir as imagens: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
