import { createHash } from 'node:crypto'
import { LEGACY_TABLES } from './brownsSnapshot.mjs'

export const BROWNS_SOURCE_PROJECT_REF = 'gfowkkchpqoirubumnau'
export const KICKHUB_STAGING_PROJECT_REF = 'ehbkjwtrrzekkdllchzb'

export function validateStagingExport(backup) {
  if (!backup || backup.formatVersion !== 1) throw new Error('Formato de exportação incompatível.')
  if (backup.sourceProjectRef !== BROWNS_SOURCE_PROJECT_REF) {
    throw new Error('O arquivo não veio do projeto Pelada Browns esperado.')
  }
  // Credenciais e sessões de dispositivo são inegociáveis: um PIN ou um token
  // copiado para outro ambiente é apenas mais um sítio de onde pode fugir.
  if (backup.sanitization?.credentials !== 'disabled'
    || backup.sanitization?.deviceSessions !== 'omitted') {
    throw new Error('O arquivo não passou pela sanitização obrigatória de staging.')
  }

  // Identidades já não são. O owner pode decidir que o staging da Browns corre
  // com os nomes e as fotos verdadeiros — é o único modo em que o KickHub fica
  // igual à app original antes do cutover. O modo tem de vir declarado no
  // manifesto: um ficheiro que não diga em que modo foi gerado não entra.
  const identities = backup.sanitization?.identities
  if (identities !== 'pseudonymized' && identities !== 'real') {
    throw new Error('O arquivo não declara um modo de identidade conhecido.')
  }
  const realIdentities = identities === 'real'
  const expectedMedia = realIdentities ? 'included' : 'omitted'
  if (backup.sanitization?.embeddedMedia !== expectedMedia) {
    throw new Error('O modo de identidade e o de mídia do arquivo não combinam.')
  }

  const { sha256, ...core } = backup
  const expected = createHash('sha256').update(JSON.stringify(core)).digest('hex')
  if (!sha256 || sha256 !== expected) throw new Error('Checksum inválido: o arquivo foi alterado após a exportação.')

  const expectedTables = new Set(LEGACY_TABLES.map(({ name }) => name))
  const actualTables = Object.keys(backup.tables ?? {})
  if (actualTables.length !== expectedTables.size || actualTables.some((name) => !expectedTables.has(name))) {
    throw new Error('O conjunto de tabelas legadas está incompleto ou contém tabelas inesperadas.')
  }

  const serialized = JSON.stringify(backup)

  // Material de credencial nunca é aceitável, em modo nenhum.
  if (/sb_secret_|sb_publishable_|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./u.test(serialized)) {
    throw new Error('O arquivo contém material de credencial.')
  }

  if (!realIdentities) {
    const hasLegacyMatchMedia = (backup.tables.matches?.rows ?? []).some((row) =>
      row.winner_photo != null || row.location_photo != null)
    if (hasLegacyMatchMedia) {
      throw new Error('O arquivo ainda contém marcadores de fotos legadas em matches.')
    }
    if (/data:image\//u.test(serialized)) {
      throw new Error('O arquivo contém media incorporada.')
    }
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

/**
 * Um lote grande de mais rebenta no PostgREST muito antes de rebentar aqui.
 * Com fotos por dentro, trinta linhas podem valer dezenas de megabytes, por
 * isso o corte é pelo tamanho e não só pela contagem — e uma linha sozinha
 * segue sempre, mesmo que seja maior do que o limite: parti-la não é opção.
 */
export const MAX_CHUNK_BYTES = 4 * 1024 * 1024

export function chunksOf(rows, size = 100, maxBytes = MAX_CHUNK_BYTES) {
  const chunks = []
  let current = []
  let currentBytes = 0

  for (const row of rows) {
    const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8')
    if (current.length > 0 && (current.length >= size || currentBytes + bytes > maxBytes)) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }
    current.push(row)
    currentBytes += bytes
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

/**
 * Colunas que a exportação traz e o destino não conhece.
 *
 * O schema legado da Browns continuou a andar depois do baseline do KickHub —
 * `matches.gk_mode_a` é uma delas. O PostgREST recusa a linha inteira quando vê
 * uma coluna que não existe, portanto sem isto a importação morre na primeira
 * tabela que divergiu e só revela uma coluna de cada vez.
 */
export function unknownColumns(rows, allowed) {
  if (!allowed) return []
  const unknown = new Set()
  for (const row of rows) {
    for (const column of Object.keys(row)) if (!allowed.has(column)) unknown.add(column)
  }
  return [...unknown].sort()
}

/** As linhas sem as colunas que o destino não tem. Não muda as originais. */
export function withoutColumns(rows, columns) {
  if (columns.length === 0) return rows
  const dropped = new Set(columns)
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([column]) => !dropped.has(column)),
  ))
}

/**
 * Colunas de cada tabela do destino, lidas do OpenAPI que o PostgREST publica
 * na raiz. É a única descrição do schema que uma chave de API alcança —
 * `information_schema` não é exposto.
 */
export async function fetchDestinationColumns(url, key) {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  })
  if (!response.ok) {
    throw new Error(`Não foi possível ler o schema do destino (HTTP ${response.status}).`)
  }
  const spec = await response.json()
  const definitions = spec.definitions ?? spec.components?.schemas ?? {}
  return new Map(Object.entries(definitions).map(
    ([table, definition]) => [table, new Set(Object.keys(definition?.properties ?? {}))],
  ))
}
