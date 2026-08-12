import { describe, expect, it } from 'vitest'
import { fileToDataURL } from './image'

describe('fileToDataURL — guardas antes de ler o ficheiro', () => {
  it('recusa formatos fora da allowlist', async () => {
    await expect(
      fileToDataURL({ type: 'image/svg+xml', size: 100 })
    ).rejects.toThrow('JPEG, PNG ou WebP')
  })

  it('recusa ficheiros maiores que 12 MB', async () => {
    await expect(
      fileToDataURL({ type: 'image/jpeg', size: 12 * 1024 * 1024 + 1 })
    ).rejects.toThrow('12 MB')
  })
})
