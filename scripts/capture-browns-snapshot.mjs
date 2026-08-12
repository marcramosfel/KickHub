import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  LEGACY_TABLES,
  assertServiceRoleKey,
  createAggregateAccumulator,
  createManifest,
  createTableAccumulator,
} from './lib/brownsSnapshot.mjs'

const args = process.argv.slice(2)
const valueAfter = (flag) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

if (args.includes('--help') || args.includes('-h')) {
  console.log('Uso: npm run data:snapshot -- --output artifacts/data/before.json --label staging-before')
  process.exit(0)
}

const output = valueAfter('--output')
if (!output) throw new Error('Informe --output. O snapshot nunca é escrito em um caminho implícito.')
const sourceLabel = valueAfter('--label') ?? process.env.SNAPSHOT_SOURCE_LABEL
if (!sourceLabel) throw new Error('Informe --label ou SNAPSHOT_SOURCE_LABEL para identificar a origem.')

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl) throw new Error('SUPABASE_URL não definido.')
assertServiceRoleKey(serviceRoleKey)

const parsedUrl = new URL(supabaseUrl)
if (parsedUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
  throw new Error('SUPABASE_URL deve usar HTTPS, exceto em localhost.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  global: { headers: { 'X-Client-Info': 'kickhub-foundation-verification/1' } },
})

const pageSize = 500
const tables = {}
const aggregates = createAggregateAccumulator()

for (const table of LEGACY_TABLES) {
  const accumulator = createTableAccumulator(table.name)
  let offset = 0

  while (true) {
    let query = supabase
      .from(table.name)
      .select('*')
      .range(offset, offset + pageSize - 1)
    for (const column of table.orderBy) query = query.order(column, { ascending: true })

    const { data, error } = await query
    if (error) throw new Error(`${table.name}: ${error.message}`)
    for (const row of data) {
      accumulator.add(row)
      aggregates.add(table.name, row)
    }
    if (data.length < pageSize) break
    offset += pageSize
  }

  tables[table.name] = accumulator.finish()
  console.log(`${table.name}: ${tables[table.name].rowCount}`)
}

const manifest = createManifest({
  tables,
  aggregates: aggregates.finish(),
  sourceLabel,
})
const outputPath = resolve(output)
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
console.log(`Snapshot gravado em ${outputPath}`)
console.log(`SHA-256 do manifesto: ${manifest.sha256}`)
