import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const serverDirectory = resolve(projectRoot, 'dist', 'server')
await mkdir(serverDirectory, { recursive: true })
await copyFile(resolve(projectRoot, 'sites', 'worker.js'), resolve(serverDirectory, 'index.js'))
