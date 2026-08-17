import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listPeladaFeed } from './feed'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), createSignedUrls: vi.fn() }))
vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUrls: mocks.createSignedUrls }) },
  },
}))

describe('feed multi-tenant', () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.createSignedUrls.mockReset() })

  it('carrega a RPC e assina mídia privada por uma hora', async () => {
    mocks.rpc.mockResolvedValue({ data: [{
      id: 'event-1', game_id: 'game-1', kind: 'result', title: 'Final', body: 'Grande jogo',
      payload: { score_a: 3, score_b: 2 }, published_at: '2026-08-17T12:00:00Z',
      media: [{ id: 'media-1', bucket: 'game-media', path: 'tenant/game/photo.jpg', kind: 'photo', alt: 'Final' }],
    }], error: null })
    mocks.createSignedUrls.mockResolvedValue({ data: [{ signedUrl: 'https://signed.example/photo' }], error: null })

    const result = await listPeladaFeed('tenant-1')

    expect(mocks.rpc).toHaveBeenCalledWith('get_pelada_feed', { p_pelada_id: 'tenant-1', p_limit: 30, p_before: null })
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(['tenant/game/photo.jpg'], 3600)
    expect(result[0].media[0].url).toBe('https://signed.example/photo')
    expect(result[0].payload).toEqual({ score_a: 3, score_b: 2 })
  })

  it('não toca no Storage quando o evento não tem mídia', async () => {
    mocks.rpc.mockResolvedValue({ data: [{
      id: 'event-2', game_id: null, kind: 'scheduled', title: null, body: null,
      payload: null, published_at: '2026-08-17T12:00:00Z', media: [],
    }], error: null })
    expect((await listPeladaFeed('tenant-1'))[0].media).toEqual([])
    expect(mocks.createSignedUrls).not.toHaveBeenCalled()
  })
})
