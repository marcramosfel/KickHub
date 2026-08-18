import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { chunksOf, rowsForStaging, validateStagingExport } from '../../scripts/lib/brownsStagingImport.mjs'
import { LEGACY_TABLES } from '../../scripts/lib/brownsSnapshot.mjs'

function validBackup() {
  const core = {
    formatVersion: 1,
    sourceProjectRef: 'gfowkkchpqoirubumnau',
    generatedAt: '2026-08-17T15:00:00.000Z',
    sanitization: {
      credentials: 'disabled',
      identities: 'pseudonymized',
      embeddedMedia: 'omitted',
      deviceSessions: 'omitted',
    },
    tables: Object.fromEntries(LEGACY_TABLES.map(({ name }) => [name, {
      sourceRowCount: name === 'players' ? 1 : 0,
      rows: name === 'players' ? [{ id: 'player-1', name: 'Jogador Browns 001' }] : [],
    }])),
  }
  return { ...core, sha256: createHash('sha256').update(JSON.stringify(core)).digest('hex') }
}

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

  it('remove a identity gerada e divide lotes', () => {
    expect(rowsForStaging('match_activity', [{ id: 9, action: 'x' }])).toEqual([{ action: 'x' }])
    expect(chunksOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
