import { describe, expect, it } from 'vitest'
import {
  assertServiceRoleKey,
  canonicalJson,
  compareSnapshots,
  createAggregateAccumulator,
  createManifest,
  createTableAccumulator,
} from '../../scripts/lib/brownsSnapshot.mjs'

describe('snapshot de preservação Browns', () => {
  it('gera hash determinístico sem pelada_id nem credenciais', () => {
    const left = createTableAccumulator('players')
    left.add({ id: '1', name: 'Ana', pelada_id: 'tenant-a', pin_hash: 'segredo-a' })
    const right = createTableAccumulator('players')
    right.add({ pin_hash: 'segredo-b', pelada_id: 'tenant-b', name: 'Ana', id: '1' })

    expect(left.finish()).toEqual(right.finish())
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
  })

  it('preserva os agregados esportivos críticos', () => {
    const accumulator = createAggregateAccumulator()
    accumulator.add('players', { approved: true, is_member: true })
    accumulator.add('matches', { score_a: 4, score_b: 3 })
    accumulator.add('match_stats', { goals: 2, assists: 1, own_goals: 1 })
    accumulator.add('goalkeeper_match_stats', { saves: 8, goals_conceded: 3 })

    expect(accumulator.finish()).toMatchObject({
      players: 1,
      approvedPlayers: 1,
      memberPlayers: 1,
      matches: 1,
      scoreA: 4,
      scoreB: 3,
      goals: 2,
      assists: 1,
      ownGoals: 1,
      saves: 8,
      goalsConceded: 3,
    })
  })

  it('detecta alteração de conteúdo mesmo quando a contagem não muda', () => {
    const before = createManifest({
      tables: { players: { rowCount: 1, sha256: 'a' } },
      aggregates: { players: 1 },
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    const after = createManifest({
      tables: { players: { rowCount: 1, sha256: 'a' } },
      aggregates: { players: 1 },
      generatedAt: '2026-01-02T00:00:00.000Z',
    })

    after.tables.players.sha256 = 'b'
    expect(compareSnapshots(before, after)).toEqual(expect.arrayContaining([
      'after: SHA-256 do manifesto inválido',
      'players: conteúdo divergiu',
    ]))
  })

  it('recusa chave anon/publishable no coletor privilegiado', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')
    expect(() => assertServiceRoleKey(`x.${payload}.x`)).not.toThrow()
    expect(() => assertServiceRoleKey('sb_secret_local-test')).not.toThrow()
    expect(() => assertServiceRoleKey('sb_publishable_example')).toThrow(/recusadas/)
  })
})
