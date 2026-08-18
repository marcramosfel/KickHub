import { createHash } from 'node:crypto'
import { LEGACY_TABLES } from './brownsSnapshot.mjs'

export const BROWNS_SOURCE_PROJECT_REF = 'gfowkkchpqoirubumnau'
export const KICKHUB_STAGING_PROJECT_REF = 'ehbkjwtrrzekkdllchzb'

export function validateStagingExport(backup) {
  if (!backup || backup.formatVersion !== 1) throw new Error('Formato de exportação incompatível.')
  if (backup.sourceProjectRef !== BROWNS_SOURCE_PROJECT_REF) {
    throw new Error('O arquivo não veio do projeto Pelada Browns esperado.')
  }
  if (backup.sanitization?.credentials !== 'disabled'
    || backup.sanitization?.identities !== 'pseudonymized'
    || backup.sanitization?.embeddedMedia !== 'omitted'
    || backup.sanitization?.deviceSessions !== 'omitted') {
    throw new Error('O arquivo não passou pela sanitização obrigatória de staging.')
  }

  const { sha256, ...core } = backup
  const expected = createHash('sha256').update(JSON.stringify(core)).digest('hex')
  if (!sha256 || sha256 !== expected) throw new Error('Checksum inválido: o arquivo foi alterado após a exportação.')

  const expectedTables = new Set(LEGACY_TABLES.map(({ name }) => name))
  const actualTables = Object.keys(backup.tables ?? {})
  if (actualTables.length !== expectedTables.size || actualTables.some((name) => !expectedTables.has(name))) {
    throw new Error('O conjunto de tabelas legadas está incompleto ou contém tabelas inesperadas.')
  }

  const hasLegacyMatchMedia = (backup.tables.matches?.rows ?? []).some((row) =>
    row.winner_photo != null || row.location_photo != null)
  if (hasLegacyMatchMedia) {
    throw new Error('O arquivo ainda contém marcadores de fotos legadas em matches.')
  }

  const serialized = JSON.stringify(backup)
  if (/data:image\/|sb_secret_|sb_publishable_|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./u.test(serialized)) {
    throw new Error('O arquivo contém media incorporada ou material de credencial.')
  }
  if ((backup.tables.players?.rows?.length ?? 0) < 1) throw new Error('O arquivo não contém jogadores.')

  return backup
}

export function rowsForStaging(tableName, rows) {
  if (tableName !== 'match_activity') return rows
  return rows.map((row) => {
    const stagingRow = { ...row }
    delete stagingRow.id
    return stagingRow
  })
}

export function chunksOf(rows, size = 100) {
  const chunks = []
  for (let offset = 0; offset < rows.length; offset += size) chunks.push(rows.slice(offset, offset + size))
  return chunks
}
