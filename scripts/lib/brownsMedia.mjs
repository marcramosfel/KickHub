import { createHash } from 'node:crypto'

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024
export const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export const ALLOWED_MEDIA_MODES = new Set(['staging-sanitized', 'production-approved'])

export function assertMediaMode(mode, confirmation) {
  if (!ALLOWED_MEDIA_MODES.has(mode)) {
    throw new Error('BROWNS_MEDIA_MODE deve ser staging-sanitized ou production-approved.')
  }
  if (confirmation !== 'UPLOAD') {
    throw new Error('Defina BROWNS_MEDIA_CONFIRM=UPLOAD para autorizar a escrita no bucket privado.')
  }
}

export const AVATAR_BUCKET = 'player-avatars'

const AVATAR_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

/**
 * O primeiro segmento do caminho e o dono da foto: e sobre ele que a policy do
 * Storage decide quem pode ler o objeto. A extensao vem do MIME que acabamos de
 * validar, e nunca do nome do ficheiro legado.
 */
export function avatarObjectPath(profileId, mimeType) {
  const extension = AVATAR_EXTENSIONS.get(mimeType)
  if (!extension) throw new Error('Formato de avatar nao permitido.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId ?? '')) {
    throw new Error('Avatar sem perfil de destino valido.')
  }
  return `${profileId}/avatar.${extension}`
}

export function decodeLegacyDataUrl(value) {
  if (typeof value !== 'string') throw new Error('Midia legada sem data URL.')
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(value)
  if (!match || !ALLOWED_MEDIA_TYPES.has(match[1])) throw new Error('Formato de imagem legado nao permitido.')
  const bytes = Buffer.from(match[2].replace(/[\r\n]/g, ''), 'base64')
  if (bytes.length < 1 || bytes.length > MAX_MEDIA_BYTES) throw new Error('Tamanho de imagem legado fora do limite.')
  return { bytes, mimeType: match[1], sha256: createHash('sha256').update(bytes).digest('hex') }
}
