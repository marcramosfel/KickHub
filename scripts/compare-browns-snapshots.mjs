import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compareSnapshots } from './lib/brownsSnapshot.mjs'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h') || args.length !== 2) {
  console.log('Uso: npm run data:compare -- artifacts/data/before.json artifacts/data/after.json')
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 2)
}

const [before, after] = await Promise.all(
  args.map(async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))),
)
const differences = compareSnapshots(before, after)

if (differences.length) {
  console.error('Validação Browns falhou:')
  for (const difference of differences) console.error(`- ${difference}`)
  process.exit(1)
}

console.log('Validação Browns passou: contagens, hashes e agregados são idênticos.')
