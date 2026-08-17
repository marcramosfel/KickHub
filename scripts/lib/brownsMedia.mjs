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

export function decodeLegacyDataUrl(value) {
  if (typeof value !== 'string') throw new Error('Midia legada sem data URL.')
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(value)
  if (!match || !ALLOWED_MEDIA_TYPES.has(match[1])) throw new Error('Formato de imagem legado nao permitido.')
  const bytes = Buffer.from(match[2].replace(/[\r\n]/g, ''), 'base64')
  if (bytes.length < 1 || bytes.length > MAX_MEDIA_BYTES) throw new Error('Tamanho de imagem legado fora do limite.')
  return { bytes, mimeType: match[1], sha256: createHash('sha256').update(bytes).digest('hex') }
}
