import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { chunksOf, rowsForStaging, validateStagingExport } from '../../scripts/lib/brownsStagingImport.mjs'
import { LEGACY_TABLES } from '../../scripts/lib/brownsSnapshot.mjs'

function validBackup(sanitization = {}, players = [{ id: 'player-1', name: 'Jogador Browns 001' }]) {
  const core = {
    formatVersion: 1,
    sourceProjectRef: 'gfowkkchpqoirubumnau',
    generatedAt: '2026-08-17T15:00:00.000Z',
    sanitization: {
      credentials: 'disabled',
      identities: 'pseudonymized',
      embeddedMedia: 'omitted',
      deviceSessions: 'omitted',
      ...sanitization,
    },
    tables: Object.fromEntries(LEGACY_TABLES.map(({ name }) => [name, {
      sourceRowCount: name === 'players' ? players.length : 0,
      rows: name === 'players' ? players : [],
    }])),
  }
  return { ...core, sha256: createHash('sha256').update(JSON.stringify(core)).digest('hex') }
}

const realBackup = (players) => validBackup(
  { identities: 'real', embeddedMedia: 'included' }, players,
)

describe('importação Browns no staging', () => {
  it('aceita somente o manifesto completo e intacto', () => {
    expect(validateStagingExport(validBackup()).tables.players.rows).toHaveLength(1)
    const changed = validBackup()
    changed.tables.players.rows[0].name = 'alterado'
    expect(() => validateStagingExport(changed)).toThrow(/Checksum inválido/)

    const unsafeMedia = validBackup()
    unsafeMedia.tables.matches.rows = [{ id: 'match-1', winner_photo: '[media-removida]' }]
    const unsafeCore = { ...unsafeMedia }
    delete unsafeCore.sha256
    unsafeMedia.sha256 = createHash('sha256').update(JSON.stringify(unsafeCore)).digest('hex')
    expect(() => validateStagingExport(unsafeMedia)).toThrow(/fotos legadas/)
  })

  /**
   * O modo real e o pseudonimizado são ambos legítimos; o que nunca é legítimo é
   * um ficheiro que não diga em qual foi gerado, ou cujos dois carimbos não
   * combinem — aí não há forma de saber que verificações aplicar.
   */
  it('aceita identidades reais quando o manifesto o declara', () => {
    const real = realBackup([{ id: 'player-1', name: 'Nome Real', photo_url: 'data:image/png;base64,AAAA' }])
    expect(validateStagingExport(real).tables.players.rows[0].name).toBe('Nome Real')
  })

  it('recusa um manifesto sem modo declarado ou com carimbos que não combinam', () => {
    expect(() => validateStagingExport(validBackup({ identities: 'anonimo' })))
      .toThrow(/modo de identidade/)
    expect(() => validateStagingExport(validBackup({ identities: 'real' })))
      .toThrow(/não combinam/)
  })

  it('recusa credenciais e sessões de dispositivo em qualquer modo', () => {
    expect(() => validateStagingExport(realBackup([{ id: 'player-1', token: 'sb_secret_abc' }])))
      .toThrow(/credencial/)
    expect(() => validateStagingExport(validBackup({ credentials: 'kept' })))
      .toThrow(/sanitização obrigatória/)
    expect(() => validateStagingExport(validBackup({ deviceSessions: 'kept' })))
      .toThrow(/sanitização obrigatória/)
  })

  it('remove a identity gerada e divide lotes', () => {
    expect(rowsForStaging('match_activity', [{ id: 9, action: 'x' }])).toEqual([{ action: 'x' }])
    expect(chunksOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  /**
   * Com fotos por dentro, trinta linhas podem valer dezenas de megabytes e o
   * PostgREST recusa o lote muito antes de nós darmos por isso.
   */
  it('corta o lote pelo tamanho, não só pela contagem', () => {
    const heavy = { photo: 'x'.repeat(600) }
    expect(chunksOf([heavy, heavy, heavy], 100, 1400)).toEqual([[heavy, heavy], [heavy]])

    // Uma linha maior do que o limite segue sozinha: parti-la não é opção.
    const huge = { photo: 'x'.repeat(5000) }
    expect(chunksOf([huge, huge], 100, 1400)).toEqual([[huge], [huge]])
  })
})
