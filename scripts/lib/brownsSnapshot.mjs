import { createHash } from 'node:crypto'

export const SNAPSHOT_FORMAT_VERSION = 1

export const LEGACY_TABLES = Object.freeze([
  { name: 'players', orderBy: ['id'] },
  { name: 'ratings', orderBy: ['rater_id', 'target_id'] },
  { name: 'draws', orderBy: ['id'] },
  { name: 'app_config', orderBy: ['id'] },
  { name: 'matches', orderBy: ['id'] },
  { name: 'match_stats', orderBy: ['match_id', 'player_id'] },
  { name: 'award_votes', orderBy: ['match_id', 'voter_id'] },
  { name: 'player_position_history', orderBy: ['id'] },
  { name: 'match_lineup', orderBy: ['match_id', 'player_id'] },
  { name: 'goalkeeper_match_stats', orderBy: ['match_id', 'goalkeeper_id'] },
  { name: 'match_substitutions', orderBy: ['id'] },
  { name: 'match_media', orderBy: ['id'] },
  { name: 'match_activity', orderBy: ['id'] },
  { name: 'match_publications', orderBy: ['id'] },
  { name: 'match_swaps', orderBy: ['id'] },
  { name: 'post_match_ratings', orderBy: ['match_id', 'rater_id', 'target_id'] },
  { name: 'player_devices', orderBy: ['id'] },
  { name: 'ratings_arquivo', orderBy: ['ronda', 'rater_id', 'target_id'] },
  { name: 'match_predictions', orderBy: ['match_id', 'player_id'] },
  { name: 'draw_disputes', orderBy: ['match_id', 'player_id'] },
  { name: 'match_availability', orderBy: ['match_id', 'player_id'] },
  { name: 'match_forecasts', orderBy: ['match_id'] },
])

export const IGNORED_COLUMNS = Object.freeze({
  '*': ['pelada_id'],
  players: ['pin_hash'],
  app_config: ['admin_pw_hash'],
  player_devices: ['token', 'token_hash'],
})

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    )
  }
  return value
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value))
}

export function stripIgnoredColumns(tableName, row) {
  const ignored = new Set([
    ...(IGNORED_COLUMNS['*'] ?? []),
    ...(IGNORED_COLUMNS[tableName] ?? []),
  ])
  return Object.fromEntries(Object.entries(row).filter(([column]) => !ignored.has(column)))
}

export function createTableAccumulator(tableName) {
  const hash = createHash('sha256')
  let rowCount = 0

  return {
    add(row) {
      hash.update(canonicalJson(stripIgnoredColumns(tableName, row)))
      hash.update('\n')
      rowCount += 1
    },
    finish() {
      return { rowCount, sha256: hash.digest('hex') }
    },
  }
}

export function createAggregateAccumulator() {
  const values = {
    players: 0,
    approvedPlayers: 0,
    memberPlayers: 0,
    matches: 0,
    scoreA: 0,
    scoreB: 0,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    saves: 0,
    goalsConceded: 0,
    ratings: 0,
    ratingScoreTotal: 0,
    awardVotes: 0,
    postMatchRatings: 0,
    mediaItems: 0,
  }

  const number = (value) => {
    const parsed = Number(value ?? 0)
    if (!Number.isFinite(parsed)) throw new Error(`Valor numérico inválido no snapshot: ${value}`)
    return parsed
  }

  return {
    add(tableName, row) {
      if (tableName === 'players') {
        values.players += 1
        if (row.approved) values.approvedPlayers += 1
        if (row.is_member) values.memberPlayers += 1
      } else if (tableName === 'matches') {
        values.matches += 1
        values.scoreA += number(row.score_a)
        values.scoreB += number(row.score_b)
      } else if (tableName === 'match_stats') {
        values.goals += number(row.goals)
        values.assists += number(row.assists)
        values.ownGoals += number(row.own_goals)
      } else if (tableName === 'goalkeeper_match_stats') {
        values.saves += number(row.saves)
        values.goalsConceded += number(row.goals_conceded)
      } else if (tableName === 'ratings') {
        values.ratings += 1
        values.ratingScoreTotal += number(row.score)
      } else if (tableName === 'award_votes') {
        values.awardVotes += 1
      } else if (tableName === 'post_match_ratings') {
        values.postMatchRatings += 1
      } else if (tableName === 'match_media') {
        values.mediaItems += 1
      }
    },
    finish() {
      return { ...values }
    },
  }
}

export function calculateManifestDigest(manifest) {
  const stablePayload = {
    formatVersion: manifest.formatVersion,
    ignoredColumns: manifest.ignoredColumns,
    tables: manifest.tables,
    aggregates: manifest.aggregates,
  }
  return createHash('sha256').update(canonicalJson(stablePayload)).digest('hex')
}

export function createManifest({ tables, aggregates, sourceLabel, generatedAt }) {
  const manifest = {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    ignoredColumns: IGNORED_COLUMNS,
    tables,
    aggregates,
  }
  return {
    ...manifest,
    sha256: calculateManifestDigest(manifest),
    metadata: {
      generatedAt: generatedAt ?? new Date().toISOString(),
      sourceLabel,
    },
  }
}

function decodeJwtPayload(value) {
  const parts = value.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function assertServiceRoleKey(value) {
  if (!value) throw new Error('SUPABASE_SERVICE_ROLE_KEY não definido.')
  if (value.startsWith('sb_secret_')) return
  if (decodeJwtPayload(value)?.role === 'service_role') return
  throw new Error('A chave informada não é uma service role. Chaves publishable/anon são recusadas.')
}

export function compareSnapshots(before, after) {
  const differences = []
  if (before.sha256 !== calculateManifestDigest(before)) {
    differences.push('before: SHA-256 do manifesto inválido')
  }
  if (after.sha256 !== calculateManifestDigest(after)) {
    differences.push('after: SHA-256 do manifesto inválido')
  }
  if (before.formatVersion !== SNAPSHOT_FORMAT_VERSION || after.formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    differences.push('formatVersion incompatível')
  }
  if (canonicalJson(before.ignoredColumns) !== canonicalJson(after.ignoredColumns)) {
    differences.push('conjunto de colunas ignoradas mudou')
  }

  const tableNames = [...new Set([
    ...Object.keys(before.tables ?? {}),
    ...Object.keys(after.tables ?? {}),
  ])].sort()
  for (const tableName of tableNames) {
    const left = before.tables?.[tableName]
    const right = after.tables?.[tableName]
    if (!left || !right) {
      differences.push(`${tableName}: tabela ausente em um snapshot`)
      continue
    }
    if (left.rowCount !== right.rowCount) {
      differences.push(`${tableName}: contagem ${left.rowCount} -> ${right.rowCount}`)
    }
    if (left.sha256 !== right.sha256) {
      differences.push(`${tableName}: conteúdo divergiu`)
    }
  }

  const aggregateNames = [...new Set([
    ...Object.keys(before.aggregates ?? {}),
    ...Object.keys(after.aggregates ?? {}),
  ])].sort()
  for (const name of aggregateNames) {
    if (before.aggregates?.[name] !== after.aggregates?.[name]) {
      differences.push(`agregado ${name}: ${before.aggregates?.[name]} -> ${after.aggregates?.[name]}`)
    }
  }
  return differences
}
