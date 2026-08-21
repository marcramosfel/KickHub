import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  chunksOf, dataUrlColumns, rowsForStaging, stripDataUrls, unknownColumns,
  validateStagingExport, withoutColumns,
} from '../../scripts/lib/brownsStagingImport.mjs'
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

describe('divergência de schema entre a Browns e o destino', () => {
  /**
   * O schema legado da Browns continuou a andar depois do baseline do KickHub:
   * `matches.gk_mode_a` é uma coluna que a origem tem e o destino não conhece.
   * O PostgREST recusa a linha inteira por causa dela.
   */
  it('nomeia todas as colunas que o destino não conhece, não só a primeira', () => {
    const rows = [
      { id: 1, gk_mode: 'FIXED', gk_mode_a: 'ROTATING' },
      { id: 2, gk_mode: 'ROTATING', gk_mode_b: 'FIXED', gk_rotation_seconds: 300 },
    ]
    expect(unknownColumns(rows, new Set(['id', 'gk_mode'])))
      .toEqual(['gk_mode_a', 'gk_mode_b', 'gk_rotation_seconds'])
  })

  it('não inventa divergência quando o destino conhece tudo', () => {
    expect(unknownColumns([{ id: 1, gk_mode: 'FIXED' }], new Set(['id', 'gk_mode']))).toEqual([])
  })

  /** Sem descrição do destino não há juízo a fazer: nada se deita fora. */
  it('deixa as linhas intactas quando não sabe o que o destino tem', () => {
    expect(unknownColumns([{ id: 1, seja_o_que_for: 'x' }], undefined)).toEqual([])
  })

  it('remove as colunas divergentes sem tocar nas restantes', () => {
    const rows = [{ id: 1, gk_mode: 'FIXED', gk_mode_a: 'X' }, { id: 2, gk_mode_b: 'Y' }]
    expect(withoutColumns(rows, ['gk_mode_a', 'gk_mode_b']))
      .toEqual([{ id: 1, gk_mode: 'FIXED' }, { id: 2 }])
    // As originais não são mexidas: o relatório é impresso a partir delas.
    expect(rows[0].gk_mode_a).toBe('X')
  })
})

describe('imagens fora das linhas', () => {
  /**
   * Uma foto em base64 dentro de uma linha faz o corpo do pedido crescer até o
   * gateway o deixar cair, e o que chega é `TypeError: fetch failed` — sem
   * resposta HTTP que explique nada. Foi assim que a importação real morreu em
   * `players`, depois de a versão pseudonimizada ter passado sem tocar nisto.
   */
  it('encontra as colunas que trazem imagem embutida', () => {
    const row = { id: 1, name: 'Ana', photo_url: 'data:image/png;base64,AAAA', map_url: 'https://exemplo.test' }
    expect(dataUrlColumns(row)).toEqual(['photo_url'])
  })

  it('esvazia a imagem e deixa o resto da linha como estava', () => {
    const rows = [
      { id: 1, name: 'Ana', photo_url: 'data:image/jpeg;base64,AAAA' },
      { id: 2, name: 'Bia', photo_url: null },
    ]
    const result = stripDataUrls(rows)
    expect(result.stripped).toBe(1)
    expect(result.rows).toEqual([
      { id: 1, name: 'Ana', photo_url: null },
      { id: 2, name: 'Bia', photo_url: null },
    ])
    // A original fica intacta: é dela que o passo seguinte tira os bytes.
    expect(rows[0].photo_url).toBe('data:image/jpeg;base64,AAAA')
  })

  it('não conta nada quando não há imagem nenhuma embutida', () => {
    const rows = [{ id: 1, name: 'Ana', photo_url: null }]
    const result = stripDataUrls(rows)
    expect(result.stripped).toBe(0)
    expect(result.rows).toEqual(rows)
    // A linha em si nem é copiada quando não há nada a tirar dela.
    expect(result.rows[0]).toBe(rows[0])
  })
})
