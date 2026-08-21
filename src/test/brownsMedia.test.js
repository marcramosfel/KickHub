import { describe, expect, it } from 'vitest'
import { assertMediaMode, avatarObjectPath, decodeLegacyDataUrl, MAX_MEDIA_BYTES } from '../../scripts/lib/brownsMedia.mjs'

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

  /**
   * O primeiro segmento do caminho e o dono da foto: e sobre ele que a policy do
   * Storage decide quem pode ler o objeto. Um caminho que comece por outra coisa
   * ficaria legivel para toda a gente ou para ninguem.
   */
  it('poe o dono da foto no primeiro segmento do caminho', () => {
    const profileId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    expect(avatarObjectPath(profileId, 'image/jpeg')).toBe(`${profileId}/avatar.jpg`)
    expect(avatarObjectPath(profileId, 'image/webp')).toBe(`${profileId}/avatar.webp`)
  })

  /**
   * Os perfis da Browns sao `md5('kickhub:browns:profile:' || id)::uuid`: um
   * hash reinterpretado como UUID, sem bits de versao nem de variante. Exigir um
   * v1-v5 recusava 29 dos 30 jogadores, e o unico que passava passava por acaso.
   */
  it('aceita o UUID derivado de md5 que os perfis Browns tem', () => {
    const derivado = '030ae4d8-36ed-0b5b-e2cf-bdb541e948ca'
    expect(avatarObjectPath(derivado, 'image/jpeg')).toBe(`${derivado}/avatar.jpg`)
  })

  it('recusa avatar sem perfil valido ou com formato fora da lista', () => {
    expect(() => avatarObjectPath('nao-e-uuid', 'image/png')).toThrow(/perfil/i)
    expect(() => avatarObjectPath(null, 'image/png')).toThrow(/perfil/i)
    expect(() => avatarObjectPath('3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'image/svg+xml')).toThrow(/formato/i)
  })
})
