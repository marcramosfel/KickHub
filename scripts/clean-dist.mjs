import { rm } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const target = resolve(projectRoot, 'dist')
if (basename(target) !== 'dist' || dirname(target) !== projectRoot) {
  throw new Error(`Recusa limpar caminho inesperado: ${target}`)
}
await rm(target, { recursive: true, force: true })
