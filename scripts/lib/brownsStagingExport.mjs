import { createHash } from 'node:crypto'

const serializedExports = new WeakMap()

const OMITTED_TABLES = new Set(['match_media', 'player_devices'])
const DISABLED_SECRET_COLUMNS = new Set(['admin_pw_hash', 'password_hash', 'pin_hash'])
const REMOVED_COLUMNS = new Set([
  'address',
  'avatar_url',
  'availability_note',
  'birth_date',
  'data_url',
  'date_of_birth',
  'device_token',
  'dob',
  'email',
  'location_photo',
  'phone',
  'phone_number',
  'photo_url',
  'position_notice',
  'secret',
  'token',
  'token_hash',
  'winner_photo',
])

const FREE_TEXT_COLUMNS = new Map([
  ['draw_disputes', new Set(['reason'])],
  ['match_activity', new Set(['body', 'detail', 'details', 'message', 'note'])],
  ['match_availability', new Set(['note'])],
  ['match_forecasts', new Set(['narrativa'])],
  ['match_substitutions', new Set(['note', 'reason'])],
  ['match_swaps', new Set(['reason'])],
  ['matches', new Set(['notes'])],
  ['player_position_history', new Set(['change_reason'])],
])

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function normalizeForJson(value) {
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return null
  if (Array.isArray(value)) return value.map(normalizeForJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeForJson(item)]))
  }
  return value
}

export function buildPlayerAliases(players) {
  const aliases = new Map()
  const replacementEntries = []
  const replacementTargets = new Map()
  const seen = new Set()

  players.forEach((player, index) => {
    const sequence = String(index + 1).padStart(3, '0')
    const alias = `Jogador Browns ${sequence}`
    aliases.set(String(player.id), { alias, userId: `STG${sequence}` })

    for (const value of [player.name, player.nickname, player.user_id]) {
      if (typeof value === 'string' && value.trim().length >= 3) {
        const source = value.trim()
        const normalized = source.toLocaleLowerCase('pt')
        if (!seen.has(normalized)) {
          seen.add(normalized)
          replacementEntries.push({ source, target: alias })
          replacementTargets.set(normalized, alias)
        }
      }
    }
  })

  replacementEntries.sort((left, right) => right.source.length - left.source.length)
  const replacementPattern = replacementEntries.length
    ? new RegExp(replacementEntries.map(({ source }) => escapeRegExp(source)).join('|'), 'giu')
    : null
  return {
    aliases,
    replacements: { entries: replacementEntries, pattern: replacementPattern, targets: replacementTargets },
  }
}

export function sanitizeText(value, replacements) {
  if (value.length > 4096) return '[conteúdo extenso removido no staging]'

  const result = replacements.pattern
    ? value.replace(replacements.pattern, (match) =>
        replacements.targets.get(match.toLocaleLowerCase('pt')) ?? '[identidade-removida]')
    : value

  return result
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[email-removido]')
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/giu, '[media-removida]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[token-removido]')
}

function sanitizeNested(value, replacements) {
  if (typeof value === 'string') return sanitizeText(value, replacements)
  if (Array.isArray(value)) return value.map((item) => sanitizeNested(item, replacements))
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeNested(item, replacements)]),
    )
  }
  return normalizeForJson(value)
}

export function sanitizeLegacyRow(tableName, row, context) {
  if (OMITTED_TABLES.has(tableName)) return null

  const sanitized = {}
  for (const [column, rawValue] of Object.entries(row)) {
    if (DISABLED_SECRET_COLUMNS.has(column)) {
      sanitized[column] = 'staging-disabled'
    } else if (REMOVED_COLUMNS.has(column)) {
      sanitized[column] = null
    } else if (FREE_TEXT_COLUMNS.get(tableName)?.has(column)) {
      sanitized[column] = null
    } else {
      sanitized[column] = sanitizeNested(rawValue, context.replacements)
    }
  }

  if (tableName === 'players') {
    const identity = context.aliases.get(String(row.id))
    if (!identity) throw new Error(`Jogador sem pseudónimo: ${row.id}`)
    sanitized.name = identity.alias
    sanitized.nickname = null
    sanitized.user_id = identity.userId
    sanitized.pin_hash = 'staging-disabled'
    if ('photo_url' in sanitized) sanitized.photo_url = null
  }

  if (tableName === 'match_publications') {
    if ('title' in sanitized) sanitized.title = 'Publicação da Pelada Browns'
    if ('body' in sanitized) sanitized.body = 'Conteúdo pessoal removido no staging.'
  }

  return sanitized
}

export function assertSanitizedExport(payload, sourcePlayers) {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload)

  for (const player of sourcePlayers) {
    for (const value of [player.name, player.nickname, player.user_id]) {
      if (typeof value === 'string' && value.trim().length >= 3
        && !/^Jogador Browns \d{3}$|^STG\d{3}$/u.test(value.trim())
        && serialized.toLocaleLowerCase('pt').includes(value.trim().toLocaleLowerCase('pt'))) {
        throw new Error('A exportação ainda contém um identificador pessoal de jogador.')
      }
    }
  }

  if (/data:image\//iu.test(serialized) || /"(?:pin_hash|admin_pw_hash)":"(?!staging-disabled)/u.test(serialized)) {
    throw new Error('A exportação ainda contém credenciais ou media incorporada.')
  }
}

export function createSanitizedExport({ sourceProjectRef, sourceTables, sourceCounts = {}, generatedAt }) {
  const sourcePlayers = sourceTables.players ?? []
  const context = buildPlayerAliases(sourcePlayers)
  const tables = {}

  for (const [tableName, rows] of Object.entries(sourceTables)) {
    tables[tableName] = {
      sourceRowCount: sourceCounts[tableName] ?? rows.length,
      rows: rows
        .map((row) => sanitizeLegacyRow(tableName, row, context))
        .filter((row) => row !== null),
    }
  }

  const core = {
    formatVersion: 1,
    sourceProjectRef,
    generatedAt,
    sanitization: {
      credentials: 'disabled',
      identities: 'pseudonymized',
      embeddedMedia: 'omitted',
      deviceSessions: 'omitted',
    },
    tables,
  }
  const serializedCore = JSON.stringify(core)
  const sha256 = createHash('sha256').update(serializedCore).digest('hex')
  const serialized = `${serializedCore.slice(0, -1)},"sha256":"${sha256}"}`
  const payload = { ...core, sha256 }

  assertSanitizedExport(serialized, sourcePlayers)
  serializedExports.set(payload, serialized)
  return payload
}

export function serializeSanitizedExport(payload) {
  return serializedExports.get(payload) ?? JSON.stringify(payload)
}
