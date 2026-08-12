import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const action = process.argv[2]
if (!['dump', 'diff'].includes(action)) {
  console.log('Uso: node scripts/schema-gate.mjs <dump|diff>')
  console.log('As duas operações são somente leitura e exigem um projeto Supabase já vinculado.')
  process.exit(action ? 2 : 0)
}

const projectRoot = resolve(import.meta.dirname, '..')
const projectRefFile = join(projectRoot, 'supabase', '.temp', 'project-ref')
let linkedProjectRef
try {
  await access(projectRefFile)
  linkedProjectRef = (await readFile(projectRefFile, 'utf8')).trim()
} catch {
  throw new Error('Projeto não vinculado. Execute supabase link conscientemente antes deste gate.')
}
const stagingProjectRef = process.env.SUPABASE_STAGING_PROJECT_REF?.trim()
if (!stagingProjectRef) {
  throw new Error('Defina SUPABASE_STAGING_PROJECT_REF para confirmar explicitamente o destino de staging.')
}
if (linkedProjectRef !== stagingProjectRef) {
  throw new Error(`Projeto vinculado (${linkedProjectRef}) não corresponde ao staging confirmado.`)
}

const output = action === 'dump'
  ? join(projectRoot, 'artifacts', 'schema', 'remote-public.sql')
  : join(projectRoot, 'artifacts', 'schema', 'remote-vs-migrations.sql')
await mkdir(dirname(output), { recursive: true })
try {
  await access(output)
  throw new Error(`Artefato já existe e não será sobrescrito: ${output}`)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const executable = process.execPath
const supabaseCli = join(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
const commandArgs = action === 'dump'
  ? [supabaseCli, 'db', 'dump', '--linked', '--schema', 'public', '--file', output]
  : [supabaseCli, 'db', 'diff', '--from', 'migrations', '--to', 'linked', '--schema', 'public', '--output', output]

const result = spawnSync(executable, commandArgs, {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false,
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

const contents = await readFile(output)
const digest = createHash('sha256').update(contents).digest('hex')
await writeFile(`${output}.sha256`, `${digest}  ${output.split(/[\\/]/).at(-1)}\n`, { mode: 0o600 })
console.log(`Artefato somente leitura: ${output}`)
console.log(`SHA-256: ${digest}`)
