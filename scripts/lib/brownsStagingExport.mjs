import { createHash } from 'node:crypto'

const serializedExports = new WeakMap()

export const IDENTITY_MODES = new Set(['pseudonymized', 'real'])

/**
 * As sessoes de dispositivo saem sempre: sao credenciais vivas, nao conteudo do
 * produto. As fotos de jogo so saem no modo pseudonimizado.
 */
const ALWAYS_OMITTED_TABLES = new Set(['player_devices'])
const PSEUDONYMIZED_OMITTED_TABLES = new Set(['match_media'])

/**
 * Nunca atravessam, em modo nenhum. Um PIN ou uma senha administrativa nao sao
 * conteudo do produto: o acesso ao KickHub passa por Supabase Auth e pelo claim
 * de uso unico, e uma credencial antiga copiada para outro ambiente e apenas
 * mais um sitio de onde pode fugir.
 */
const DISABLED_SECRET_COLUMNS = new Set(['admin_pw_hash', 'password_hash', 'pin_hash'])

/** Tokens e hashes de sessao. Tambem nunca atravessam. */
const ALWAYS_REMOVED_COLUMNS = new Set([
  'device_token',
  'secret',
  'token',
  'token_hash',
])

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

/**
 * Em modo real nao ha pseudonimos: as substituicoes ficam vazias e cada linha
 * atravessa como esta. O contexto continua a existir com a mesma forma para o
 * resto do codigo nao ter de perguntar em que modo esta a cada passo.
 */
export function buildPlayerAliases(players, identities = 'pseudonymized') {
  if (identities === 'real') {
    return {
      aliases: new Map(),
      replacements: { entries: [], pattern: null, targets: new Map() },
    }
  }
  return buildPseudonyms(players)
}

function buildPseudonyms(players) {
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

export function sanitizeText(value, replacements, identities = 'pseudonymized') {
  // Em modo real o texto atravessa inteiro. Continua a perder tokens JWT: esses
  // sao credenciais, e nao deixam de o ser por estarem no meio de uma frase.
  if (identities === 'real') {
    return value.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[token-removido]')
  }

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

function sanitizeNested(value, replacements, identities) {
  if (typeof value === 'string') return sanitizeText(value, replacements, identities)
  if (Array.isArray(value)) return value.map((item) => sanitizeNested(item, replacements, identities))
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeNested(item, replacements, identities)]),
    )
  }
  return normalizeForJson(value)
}

/** Uma tabela que nao atravessa de todo, ou que so atravessa em modo real. */
export function isOmittedTable(tableName, identities = 'pseudonymized') {
  if (ALWAYS_OMITTED_TABLES.has(tableName)) return true
  return identities !== 'real' && PSEUDONYMIZED_OMITTED_TABLES.has(tableName)
}

export function sanitizeLegacyRow(tableName, row, context) {
  const identities = context.identities ?? 'pseudonymized'
  if (isOmittedTable(tableName, identities)) return null

  const sanitized = {}
  for (const [column, rawValue] of Object.entries(row)) {
    if (DISABLED_SECRET_COLUMNS.has(column)) {
      sanitized[column] = 'staging-disabled'
    } else if (ALWAYS_REMOVED_COLUMNS.has(column)) {
      sanitized[column] = null
    } else if (identities !== 'real' && REMOVED_COLUMNS.has(column)) {
      sanitized[column] = null
    } else if (identities !== 'real' && FREE_TEXT_COLUMNS.get(tableName)?.has(column)) {
      sanitized[column] = null
    } else {
      sanitized[column] = sanitizeNested(rawValue, context.replacements, identities)
    }
  }

  // O PIN sai em qualquer modo: continua desativado mesmo quando tudo o resto
  // atravessa como esta. Uma credencial antiga copiada para outro ambiente e
  // apenas mais um sitio de onde pode fugir.
  if (tableName === 'players') sanitized.pin_hash = 'staging-disabled'
  if (identities === 'real') return sanitized

  if (tableName === 'players') {
    const identity = context.aliases.get(String(row.id))
    if (!identity) throw new Error(`Jogador sem pseudónimo: ${row.id}`)
    sanitized.name = identity.alias
    sanitized.nickname = null
    sanitized.user_id = identity.userId
    if ('photo_url' in sanitized) sanitized.photo_url = null
  }

  if (tableName === 'match_publications') {
    if ('title' in sanitized) sanitized.title = 'Publicação da Pelada Browns'
    if ('body' in sanitized) sanitized.body = 'Conteúdo pessoal removido no staging.'
  }

  return sanitized
}

/**
 * A ultima leitura antes de gravar. As credenciais sao proibidas em qualquer
 * modo; os identificadores pessoais so no modo pseudonimizado.
 */
export function assertSanitizedExport(payload, sourcePlayers, identities = 'pseudonymized') {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload)

  if (/"(?:pin_hash|admin_pw_hash|password_hash)":"(?!staging-disabled)/u.test(serialized)) {
    throw new Error('A exportação ainda contém credenciais.')
  }
  if (identities === 'real') return

  for (const player of sourcePlayers) {
    for (const value of [player.name, player.nickname, player.user_id]) {
      if (typeof value === 'string' && value.trim().length >= 3
        && !/^Jogador Browns \d{3}$|^STG\d{3}$/u.test(value.trim())
        && serialized.toLocaleLowerCase('pt').includes(value.trim().toLocaleLowerCase('pt'))) {
        throw new Error('A exportação ainda contém um identificador pessoal de jogador.')
      }
    }
  }

  if (/data:image\//iu.test(serialized)) {
    throw new Error('A exportação ainda contém media incorporada.')
  }
}

export function createSanitizedExport({
  sourceProjectRef, sourceTables, sourceCounts = {}, generatedAt, identities = 'pseudonymized',
}) {
  if (!IDENTITY_MODES.has(identities)) {
    throw new Error('Modo de identidade desconhecido: use pseudonymized ou real.')
  }
  const sourcePlayers = sourceTables.players ?? []
  const context = { ...buildPlayerAliases(sourcePlayers, identities), identities }
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
      identities,
      embeddedMedia: identities === 'real' ? 'included' : 'omitted',
      deviceSessions: 'omitted',
    },
    tables,
  }
  const serializedCore = JSON.stringify(core)
  const sha256 = createHash('sha256').update(serializedCore).digest('hex')
  const serialized = `${serializedCore.slice(0, -1)},"sha256":"${sha256}"}`
  const payload = { ...core, sha256 }

  assertSanitizedExport(serialized, sourcePlayers, identities)
  serializedExports.set(payload, serialized)
  return payload
}

export function serializeSanitizedExport(payload) {
  return serializedExports.get(payload) ?? JSON.stringify(payload)
}
