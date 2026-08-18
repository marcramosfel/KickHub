import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signAvatars } from './avatars'

const mocks = vi.hoisted(() => ({ createSignedUrls: vi.fn(), from: vi.fn() }))
vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: (bucket: string) => {
        mocks.from(bucket)
        return { createSignedUrls: mocks.createSignedUrls }
      },
    },
  },
}))

describe('fotos do plantel', () => {
  beforeEach(() => { mocks.createSignedUrls.mockReset(); mocks.from.mockReset() })

  /**
   * Um plantel de trinta jogadores são trinta pedidos ao Storage se cada
   * `<Avatar>` se assinar a si mesmo. É por isso que a assinatura é em lote.
   */
  it('assina o plantel inteiro numa chamada por bucket', async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [{ signedUrl: 'https://signed.test/ana' }, { signedUrl: 'https://signed.test/bia' }],
      error: null,
    })

    const urls = await signAvatars([
      { id: 'member-1', path: 'perfil-1/avatar.jpg', bucket: 'player-avatars' },
      { id: 'member-2', path: 'perfil-2/avatar.png', bucket: 'player-avatars' },
    ])

    expect(mocks.createSignedUrls).toHaveBeenCalledTimes(1)
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(
      ['perfil-1/avatar.jpg', 'perfil-2/avatar.png'], 3600,
    )
    expect(urls.get('member-1')).toBe('https://signed.test/ana')
    expect(urls.get('member-2')).toBe('https://signed.test/bia')
  })

  /** A mesma pessoa em duas linhas é o mesmo objeto: uma assinatura chega. */
  it('assina o mesmo caminho uma só vez e devolve-o a todas as linhas', async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [{ signedUrl: 'https://signed.test/ana' }], error: null,
    })

    const urls = await signAvatars([
      { id: 'lineup-1', path: 'perfil-1/avatar.jpg', bucket: 'player-avatars' },
      { id: 'ranking-1', path: 'perfil-1/avatar.jpg', bucket: 'player-avatars' },
    ])

    expect(mocks.createSignedUrls).toHaveBeenCalledWith(['perfil-1/avatar.jpg'], 3600)
    expect(urls.get('lineup-1')).toBe('https://signed.test/ana')
    expect(urls.get('ranking-1')).toBe('https://signed.test/ana')
  })

  /**
   * Uma foto pendente chega sem caminho. Pedir a assinatura de nada devolveria
   * um erro que o ecrã não sabe mostrar — e as iniciais já são a resposta certa.
   */
  it('não toca no Storage quando ninguém tem foto pronta', async () => {
    const urls = await signAvatars([
      { id: 'member-1', path: null, bucket: 'player-avatars' },
      { id: 'member-2', path: 'perfil-2/avatar.png', bucket: null },
    ])

    expect(mocks.createSignedUrls).not.toHaveBeenCalled()
    expect(urls.size).toBe(0)
  })

  /** Um caminho que o Storage recusa assinar cai para as iniciais, não parte. */
  it('deixa de fora quem o Storage não conseguiu assinar', async () => {
    mocks.createSignedUrls.mockResolvedValue({
      data: [{ signedUrl: 'https://signed.test/ana' }, { error: 'not found' }],
      error: null,
    })

    const urls = await signAvatars([
      { id: 'member-1', path: 'perfil-1/avatar.jpg', bucket: 'player-avatars' },
      { id: 'member-2', path: 'perfil-2/avatar.png', bucket: 'player-avatars' },
    ])

    expect(urls.get('member-1')).toBe('https://signed.test/ana')
    expect(urls.has('member-2')).toBe(false)
  })
})
