import { describe, expect, it } from 'vitest'
import { assertMediaMode, decodeLegacyDataUrl, MAX_MEDIA_BYTES } from '../../scripts/lib/brownsMedia.mjs'

describe('migrador de mídia Browns', () => {
  it('exige modo e confirmação explícitos antes de escrever', () => {
    expect(() => assertMediaMode('staging-sanitized', 'UPLOAD')).not.toThrow()
    expect(() => assertMediaMode('production-approved', 'UPLOAD')).not.toThrow()
    expect(() => assertMediaMode('production', 'UPLOAD')).toThrow(/BROWNS_MEDIA_MODE/)
    expect(() => assertMediaMode('staging-sanitized', '')).toThrow(/BROWNS_MEDIA_CONFIRM/)
  })

  it('decodifica imagem permitida e calcula integridade', () => {
    const decoded = decodeLegacyDataUrl('data:image/png;base64,a2lja2h1Yg==')
    expect(decoded.bytes.toString()).toBe('kickhub')
    expect(decoded.mimeType).toBe('image/png')
    expect(decoded.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('recusa formatos, texto e arquivos acima do limite', () => {
    expect(() => decodeLegacyDataUrl('data:text/plain;base64,aGk=')).toThrow(/formato/i)
    expect(() => decodeLegacyDataUrl('https://example.test/photo.jpg')).toThrow(/formato/i)
    const oversized = Buffer.alloc(MAX_MEDIA_BYTES + 1).toString('base64')
    expect(() => decodeLegacyDataUrl(`data:image/jpeg;base64,${oversized}`)).toThrow(/tamanho/i)
  })
})
