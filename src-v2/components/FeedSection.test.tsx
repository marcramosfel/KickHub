import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { FeedSection } from './FeedSection'

const mocks = vi.hoisted(() => ({ context: {} as Record<string, unknown>, feed: vi.fn() }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => mocks.context }))
vi.mock('../lib/feed', () => ({ usePeladaFeed: mocks.feed }))

describe('FeedSection', () => {
  beforeEach(() => {
    localStorage.setItem('kickhub-locale', 'pt')
    mocks.context = { pelada: { id: 'pelada-1' }, isDemo: false }
    mocks.feed.mockReset()
    mocks.feed.mockReturnValue({ data: [], isPending: false, isError: false, refetch: vi.fn() })
  })

  it('não habilita dados reais na demonstração', () => {
    mocks.context = { pelada: { id: 'demo' }, isDemo: true }
    render(<I18nProvider><FeedSection/></I18nProvider>)
    expect(mocks.feed).toHaveBeenCalledWith('demo', false)
    expect(screen.getByRole('heading', { name: 'A atividade real é privada.' })).toBeInTheDocument()
  })

  it('mostra resultado histórico e foto assinada', () => {
    mocks.feed.mockReturnValue({ data: [{
      id: 'event-1', gameId: 'game-1', kind: 'result', title: 'Noite de virada', body: 'A resenha completa.',
      payload: { score_a: 3, score_b: 2 }, publishedAt: '2026-08-17T12:00:00Z',
      media: [{ id: 'media-1', kind: 'photo', alt: 'Equipe vencedora', url: 'https://signed.example/photo' }],
    }], isPending: false, isError: false, refetch: vi.fn() })
    render(<I18nProvider><FeedSection/></I18nProvider>)
    expect(screen.getByRole('heading', { name: 'Noite de virada' })).toBeInTheDocument()
    expect(screen.getByText('Equipa A 3 · 2 Equipa B')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Equipe vencedora' })).toHaveAttribute('src', 'https://signed.example/photo')
  })
})
