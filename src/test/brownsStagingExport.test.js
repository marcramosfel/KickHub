import { describe, expect, it } from 'vitest'
import { createSanitizedExport, serializeSanitizedExport } from '../../scripts/lib/brownsStagingExport.mjs'

describe('exportação Browns sanitizada para staging', () => {
  it('remove credenciais, media e identidades pessoais sem quebrar relações por UUID', () => {
    const playerId = 'c1000000-0000-4000-8000-000000000001'
    const payload = createSanitizedExport({
      sourceProjectRef: 'legacy-test',
      generatedAt: '2026-08-17T12:00:00.000Z',
      sourceCounts: { match_media: 1, player_devices: 1 },
      sourceTables: {
        players: [{
          id: playerId,
          user_id: 'BR001',
          name: 'Nome Real',
          nickname: 'Apelido',
          dob: '1990-01-02',
          pin_hash: 'hash-secreto',
          photo_url: 'data:image/png;base64,AAAA',
        }],
        matches: [{
          id: 'match-1',
          created_by: playerId,
          notes: 'Nome Real marcou',
          winner_photo: 'data:image/jpeg;base64,AAAA',
          location_photo: 'data:image/webp;base64,BBBB',
        }],
        match_lineup: [{ match_id: 'match-1', player_id: playerId }],
        match_media: [{ id: 'media-1', data_url: 'data:image/png;base64,AAAA' }],
        player_devices: [{ id: 'device-1', token_hash: 'segredo' }],
        app_config: [{ id: 1, admin_pw_hash: 'admin-secreto' }],
      },
    })

    expect(payload.tables.players.rows[0]).toMatchObject({
      id: playerId,
      name: 'Jogador Browns 001',
      nickname: null,
      dob: null,
      user_id: 'STG001',
      pin_hash: 'staging-disabled',
      photo_url: null,
    })
    expect(payload.tables.matches.rows[0]).toMatchObject({
      created_by: playerId,
      notes: null,
      winner_photo: null,
      location_photo: null,
    })
    expect(payload.tables.match_lineup.rows[0].player_id).toBe(playerId)
    expect(payload.tables.match_media).toMatchObject({ sourceRowCount: 1, rows: [] })
    expect(payload.tables.player_devices).toMatchObject({ sourceRowCount: 1, rows: [] })
    expect(payload.tables.app_config.rows[0].admin_pw_hash).toBe('staging-disabled')
    expect(JSON.stringify(payload)).not.toContain('Nome Real')
    expect(JSON.stringify(payload)).not.toContain('hash-secreto')
    expect(JSON.stringify(payload)).not.toContain('data:image/')
    expect(serializeSanitizedExport(payload)).toContain(payload.sha256)
  })

  /**
   * O modo real existe porque só nele o KickHub fica igual à app original antes
   * do cutover, e é uma decisão do dono da pelada. O que ele não muda são as
   * credenciais: um PIN copiado para outro ambiente é apenas mais um sítio de
   * onde pode fugir, e por isso continua desativado.
   */
  it('deixa passar nomes e fotos no modo real, e nunca as credenciais', () => {
    const playerId = 'c1000000-0000-4000-8000-000000000001'
    const payload = createSanitizedExport({
      sourceProjectRef: 'legacy-test',
      generatedAt: '2026-08-18T12:00:00.000Z',
      identities: 'real',
      sourceCounts: { player_devices: 1 },
      sourceTables: {
        players: [{
          id: playerId,
          user_id: 'BR001',
          name: 'Nome Real',
          nickname: 'Apelido',
          pin_hash: 'hash-secreto',
          photo_url: 'data:image/png;base64,AAAA',
        }],
        matches: [{ id: 'match-1', created_by: playerId, notes: 'Nome Real marcou' }],
        match_media: [{ id: 'media-1', data_url: 'data:image/png;base64,AAAA' }],
        player_devices: [{ id: 'device-1', token_hash: 'segredo' }],
        app_config: [{ id: 1, admin_pw_hash: 'admin-secreto' }],
      },
    })

    expect(payload.sanitization).toMatchObject({
      credentials: 'disabled', identities: 'real', embeddedMedia: 'included', deviceSessions: 'omitted',
    })
    expect(payload.tables.players.rows[0]).toMatchObject({
      name: 'Nome Real',
      nickname: 'Apelido',
      user_id: 'BR001',
      photo_url: 'data:image/png;base64,AAAA',
      pin_hash: 'staging-disabled',
    })
    // O texto livre atravessa: era ele que punha "Conteúdo pessoal removido no
    // staging" no lugar das publicações da pelada.
    expect(payload.tables.matches.rows[0].notes).toBe('Nome Real marcou')
    expect(payload.tables.match_media.rows).toHaveLength(1)

    // As sessões de dispositivo saem em qualquer modo.
    expect(payload.tables.player_devices.rows).toEqual([])
    expect(payload.tables.app_config.rows[0].admin_pw_hash).toBe('staging-disabled')
    expect(JSON.stringify(payload)).not.toContain('hash-secreto')
    expect(JSON.stringify(payload)).not.toContain('admin-secreto')
    expect(JSON.stringify(payload)).not.toContain('segredo')
  })

  it('recusa um modo de identidade que não conhece', () => {
    expect(() => createSanitizedExport({
      sourceProjectRef: 'legacy-test',
      generatedAt: '2026-08-18T12:00:00.000Z',
      identities: 'anonimo',
      sourceTables: { players: [] },
    })).toThrow(/Modo de identidade/)
  })
})
