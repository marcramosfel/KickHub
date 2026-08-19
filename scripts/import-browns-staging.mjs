import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { LEGACY_TABLES, assertServiceRoleKey } from './lib/brownsSnapshot.mjs'
import {
  KICKHUB_STAGING_PROJECT_REF,
  chunksOf,
  rowsForStaging,
  validateStagingExport,
} from './lib/brownsStagingImport.mjs'

const TARGET_URL = `https://${KICKHUB_STAGING_PROJECT_REF}.supabase.co`
const BROWNS_PELADA_ID = '00000000-0000-4000-8000-000000000101'

function inputPathFromArgs(argv) {
  const inputIndex = argv.indexOf('--input')
  if (inputIndex >= 0 && argv[inputIndex + 1]) return path.resolve(argv[inputIndex + 1])
  const assignedInput = argv.find((argument) => argument.startsWith('--input='))
  if (assignedInput) return path.resolve(assignedInput.slice('--input='.length))
  const positionalInput = argv.find((argument) => !argument.startsWith('-'))
  if (positionalInput) return path.resolve(positionalInput)
  return path.resolve('artifacts', 'data', 'browns-staging-export.json')
}

async function readHidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('Execute o importador num terminal interativo.')
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  return new Promise((resolve, reject) => {
    let secret = ''
    const finish = () => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
      process.stdout.write('\n')
    }
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish()
          reject(new Error('Importação cancelada.'))
          return
        }
        if (character === '\r' || character === '\n') {
          finish()
          resolve(secret)
          return
        }
        if (character === '\u0008' || character === '\u007f') secret = secret.slice(0, -1)
        else secret += character
      }
    }
    process.stdin.on('data', onData)
  })
}

async function exactCount(supabase, tableName) {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${tableName}: não foi possível conferir o destino (${error.message})`)
  return count ?? 0
}

async function importTable(supabase, table, rows, allowResume, overwrite) {
  if (rows.length === 0) {
    process.stdout.write(`– ${table.name}: sem linhas exportáveis\n`)
    return
  }

  const currentCount = await exactCount(supabase, table.name)

  // `match_activity` tem chave gerada, portanto não há upsert que a case com
  // o que já lá está: reimportar por cima só faz sentido apagando primeiro.
  // Sem `--overwrite` é intocável, porque a contagem igual não garante que o
  // conteúdo seja o mesmo — trocar o modo de identidade muda o texto e deixa
  // a contagem exatamente onde estava.
  if (table.name === 'match_activity') {
    if (overwrite && currentCount !== 0) {
      const { error } = await supabase.from(table.name).delete().gte('id', 0)
      if (error) throw new Error(`${table.name}: falha ao limpar antes de reimportar (${error.message})`)
      process.stdout.write(`~ ${table.name}: ${currentCount} linha(s) substituída(s)\n`)
    } else if (currentCount === rows.length) {
      process.stdout.write(`= ${table.name}: já importada (${currentCount})\n`)
      return
    } else if (currentCount !== 0) {
      throw new Error(`match_activity tem ${currentCount} linhas; a carga identity não pode ser retomada parcialmente.`)
    }
  } else if (!allowResume && !overwrite && table.name !== 'app_config'
    && currentCount !== 0 && currentCount !== rows.length) {
    throw new Error(`${table.name} já contém ${currentCount} linhas. Revise o staging antes de usar --resume.`)
  }

  const preparedRows = rowsForStaging(table.name, rows)
  for (const chunk of chunksOf(preparedRows)) {
    const query = table.name === 'match_activity'
      ? supabase.from(table.name).insert(chunk)
      : supabase.from(table.name).upsert(chunk, {
          onConflict: table.orderBy.join(','),
          ignoreDuplicates: false,
          defaultToNull: false,
        })
    const { error } = await query
    if (error) throw new Error(`${table.name}: ${error.message}`)
  }

  const finalCount = await exactCount(supabase, table.name)
  // Com `--overwrite` o destino pode ficar com linhas a mais: as que existiam
  // antes e que esta exportação já não traz. O upsert cobre tudo o que veio;
  // ficar a menos é que seria perda silenciosa.
  if (overwrite ? finalCount < rows.length : finalCount !== rows.length) {
    throw new Error(`${table.name}: destino terminou com ${finalCount}, esperado ${rows.length}.`)
  }
  if (overwrite && finalCount > rows.length) {
    process.stdout.write(
      `! ${table.name}: ${finalCount - rows.length} linha(s) no destino que esta exportação não traz\n`,
    )
  }
  process.stdout.write(`✓ ${table.name}: ${finalCount} linha(s)\n`)
}

async function countPeladaRows(supabase, tableName, filters = []) {
  let query = supabase.from(tableName).select('*', { count: 'exact', head: true }).eq('pelada_id', BROWNS_PELADA_ID)
  for (const [column, value] of filters) query = query.eq(column, value)
  const { count, error } = await query
  if (error) throw new Error(`${tableName}: falha na reconciliação (${error.message})`)
  return count ?? 0
}

async function main() {
  const args = process.argv.slice(2)
  const inputPath = inputPathFromArgs(args)
  const backup = validateStagingExport(JSON.parse(await readFile(inputPath, 'utf8')))
  process.stdout.write(`Backup validado: ${backup.tables.players.rows.length} jogadores, SHA-256 ${backup.sha256}\n`)
  process.stdout.write(`Modo de identidade: ${backup.sanitization.identities}\n`)
  if (backup.sanitization.identities === 'real') {
    process.stdout.write(
      'Este staging vai conter nomes e fotos de pessoas reais.\n'
      + 'Depois de importar, corra `npm run data:migrate-media` para as fotos\n'
      + 'saírem das linhas e irem para o bucket privado.\n',
    )
  }

  let serviceRoleKey = process.env.KICKHUB_STAGING_SERVICE_ROLE_KEY ?? ''
  if (!serviceRoleKey) {
    serviceRoleKey = await readHidden('Secret/service_role key do KickHub STAGING (não será exibida): ')
  }
  assertServiceRoleKey(serviceRoleKey)

  const supabase = createClient(TARGET_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'kickhub-staging-data-import/1' } },
  })
  serviceRoleKey = ''

  const { error: destinationError } = await supabase.from('peladas').select('id').limit(1)
  if (destinationError) throw new Error(`A chave não pertence ao KickHub staging: ${destinationError.message}`)

  for (const table of LEGACY_TABLES) {
    await importTable(
      supabase, table, backup.tables[table.name].rows,
      args.includes('--resume'), args.includes('--overwrite'),
    )
  }

  process.stdout.write('\nExecutando projeção multi-pelada…\n')
  const { data: history, error: historyError } = await supabase.rpc('backfill_browns_history')
  if (historyError) throw new Error(`backfill_browns_history: ${historyError.message}`)
  const { data: content, error: contentError } = await supabase.rpc('backfill_browns_content')
  if (contentError) throw new Error(`backfill_browns_content: ${contentError.message}`)

  const [memberships, activeMembers, games, stats, feedEvents] = await Promise.all([
    countPeladaRows(supabase, 'pelada_memberships'),
    countPeladaRows(supabase, 'pelada_memberships', [['status', 'active']]),
    countPeladaRows(supabase, 'games'),
    countPeladaRows(supabase, 'game_player_stats'),
    countPeladaRows(supabase, 'pelada_feed_events'),
  ])

  process.stdout.write(`${JSON.stringify({ history, content, memberships, activeMembers, games, stats, feedEvents }, null, 2)}\n`)
  process.stdout.write('\nImportação Browns no KickHub staging concluída.\n')
}

main().catch((error) => {
  process.stderr.write(`Falha ao importar: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
