import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreatePeladaInput } from './peladas'
import { createPelada, createPeladaSlug, listMyPeladas, toPeladaSummary } from './peladas'

const supabaseMocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: supabaseMocks.rpc },
}))

describe('peladas API', () => {
  beforeEach(() => supabaseMocks.rpc.mockReset())

  it('gera slugs estáveis e compatíveis com URLs', () => {
    expect(createPeladaSlug('  Futebol das Sextas Zürich  ')).toBe('futebol-das-sextas-zurich')
    expect(createPeladaSlug('⚽')).toBe('pelada')
  })

  it('mapeia o read model para o card da dashboard', () => {
    const summary = toPeladaSummary({
      id: 'pelada-1',
      slug: 'sextas',
      name: 'Futebol das Sextas',
      description: null,
      city: 'Zürich',
      country_code: 'CH',
      visibility: 'unlisted',
      join_mode: 'invite',
      role: 'admin',
      member_count: '12',
    })

    expect(summary).toMatchObject({
      slug: 'sextas',
      membership: 'active',
      visibility: 'unlisted',
      joinMode: 'invite',
      role: 'admin',
      members: 12,
    })
  })

  it('lista somente através do read model protegido', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: [{
      id: 'pelada-1', slug: 'sextas', name: 'Sextas', description: '', city: 'Porto', country_code: 'PT',
      visibility: 'private', join_mode: 'approval', role: 'owner', member_count: 1,
    }], error: null })

    await expect(listMyPeladas()).resolves.toHaveLength(1)
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('list_my_peladas')
  })

  it('envia formato e frequência para a criação transacional', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: { id: 'pelada-1', name: 'Sextas', slug: 'sextas' }, error: null })
    const input: CreatePeladaInput = {
      name: 'Sextas', slug: 'sextas', description: '', countryCode: 'PT', city: 'Porto', timezone: 'Europe/Lisbon',
      visibility: 'private', joinMode: 'approval', defaultFormat: '5x5', frequency: 'fortnightly',
    }

    await expect(createPelada(input)).resolves.toEqual({ id: 'pelada-1', name: 'Sextas', slug: 'sextas' })
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('create_pelada_with_settings', expect.objectContaining({
      p_default_format: '5x5',
      p_frequency: 'fortnightly',
    }))
  })
})
