import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { LEGACY_TABLES, assertServiceRoleKey } from './lib/brownsSnapshot.mjs'
import { createSanitizedExport, isOmittedTable, serializeSanitizedExport } from './lib/brownsStagingExport.mjs'

const SOURCE_PROJECT_REF = 'gfowkkchpqoirubumnau'
const SOURCE_URL = `https://${SOURCE_PROJECT_REF}.supabase.co`
/**
 * Por omissao o staging leva pseudonimos e nenhuma foto. O modo real existe
 * porque so nele o KickHub fica igual a app original antes do cutover, e e uma
 * decisao do dono da pelada — por isso exige as duas variaveis, e nao uma
 * flag de linha de comando que se apanha por engano no historico da shell.
 *
 * Em qualquer modo, PIN, senha administrativa e tokens de dispositivo ficam
 * de fora: nao sao conteudo do produto.
 */
function identityModeFromEnv() {
  const requested = process.env.BROWNS_STAGING_IDENTITIES ?? 'pseudonymized'
  if (requested === 'pseudonymized') return requested
  if (requested !== 'real') {
    throw new Error('BROWNS_STAGING_IDENTITIES deve ser pseudonymized ou real.')
  }
  if (process.env.BROWNS_STAGING_CONFIRM !== 'REAL-DATA') {
    throw new Error(
      'Identidades reais exigem BROWNS_STAGING_CONFIRM=REAL-DATA. '
      + 'O arquivo passa a conter nomes e fotos de pessoas reais: guarde-o como tal.',
    )
  }
  return requested
}

function outputPathFromArgs(argv) {
  const outputIndex = argv.indexOf('--output')
  if (outputIndex >= 0 && argv[outputIndex + 1]) return path.resolve(argv[outputIndex + 1])
  const assignedOutput = argv.find((argument) => argument.startsWith('--output='))
  if (assignedOutput) return path.resolve(assignedOutput.slice('--output='.length))
  const positionalOutput = argv.find((argument) => !argument.startsWith('-'))
  if (positionalOutput) return path.resolve(positionalOutput)
  return path.resolve('artifacts', 'data', 'browns-staging-export.json')
}

async function readHidden(prompt) {
  if (!process.stdin.isTTY) {
    throw new Error('Execute este comando num terminal interativo para informar a senha com segurança.')
  }

  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  return new Promise((resolve, reject) => {
    let password = ''
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
          reject(new Error('Exportação cancelada.'))
          return
        }
        if (character === '\r' || character === '\n') {
          finish()
          resolve(password)
          return
        }
        if (character === '\u0008' || character === '\u007f') {
          password = password.slice(0, -1)
        } else {
          password += character
        }
      }
    }
    process.stdin.on('data', onData)
  })
}

async function readLegacyTables(supabase, identities) {
  const tables = {}
  const counts = {}
  const pageSize = 500

  for (const table of LEGACY_TABLES) {
    if (isOmittedTable(table.name, identities)) {
      const { count, error } = await supabase
        .from(table.name)
        .select('*', { count: 'exact', head: true })
      if (error) throw new Error(`${table.name}: ${error.message}`)
      tables[table.name] = []
      counts[table.name] = count ?? 0
      process.stdout.write(`✓ ${table.name}: ${counts[table.name]} linha(s), conteúdo omitido\n`)
      continue
    }

    const rows = []
    let offset = 0
    while (true) {
      let query = supabase
        .from(table.name)
        .select('*')
        .range(offset, offset + pageSize - 1)
      for (const column of table.orderBy) query = query.order(column, { ascending: true })

      const { data, error } = await query
      if (error) throw new Error(`${table.name}: ${error.message}`)
      const page = data ?? []
      rows.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    tables[table.name] = rows
    counts[table.name] = rows.length
    process.stdout.write(`✓ ${table.name}: ${rows.length} linha(s) lida(s)\n`)
  }
  return { tables, counts }
}

async function main() {
  const identities = identityModeFromEnv()
  const outputPath = outputPathFromArgs(process.argv.slice(2))
  let serviceRoleKey = process.env.BROWNS_SERVICE_ROLE_KEY ?? ''
  if (!serviceRoleKey) {
    serviceRoleKey = await readHidden('Secret/service_role key da Pelada Browns (não será exibida): ')
  }
  assertServiceRoleKey(serviceRoleKey)

  const supabase = createClient(SOURCE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'kickhub-staging-sanitized-export/1' } },
  })
  serviceRoleKey = ''

  const source = await readLegacyTables(supabase, identities)
  process.stdout.write(identities === 'real'
    ? '\nMantendo identidades e fotos reais; removendo apenas credenciais…\n'
    : '\nPseudonimizando identidades e removendo dados sensíveis…\n')
  const payload = createSanitizedExport({
    sourceProjectRef: SOURCE_PROJECT_REF,
    sourceTables: source.tables,
    sourceCounts: source.counts,
    generatedAt: new Date().toISOString(),
    identities,
  })
  process.stdout.write('✓ Sanitização e validação concluídas\n')

  await mkdir(path.dirname(outputPath), { recursive: true })
  process.stdout.write('Gravando o arquivo privado…\n')
  await writeFile(outputPath, `${serializeSanitizedExport(payload)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  process.stdout.write(`\nBackup criado em:\n${outputPath}\n`)
  process.stdout.write(`Modo de identidade: ${identities}\n`)
  process.stdout.write(`SHA-256 do manifesto: ${payload.sha256}\n`)
  if (identities === 'real') {
    process.stdout.write(
      '\nEste arquivo contém nomes e fotos de pessoas reais. Não o partilhe,\n'
      + 'não o comite e apague-o depois de importar.\n',
    )
  }
}

main().catch((error) => {
  process.stderr.write(`Falha ao exportar: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
