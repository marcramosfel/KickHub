import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { isKnownKind, toNotification, unreadCount } from '../lib/notifications'
import { NotificationBell } from './NotificationBell'

const bellMocks = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  rows: [] as unknown[],
  error: null as { message: string } | null,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: bellMocks.user, profile: null }) }))
vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: bellMocks.rpc,
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: bellMocks.rows, error: bellMocks.error }),
        }),
      }),
    }),
  },
}))

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    kind: 'game.created',
    title: 'Quinta Brava',
    body: null,
    pelada_id: 'pelada-1',
    payload: { game_id: 'game-1', scheduled_at: '2026-08-21T19:30:00.000Z' },
    read_at: null,
    created_at: '2026-08-16T10:00:00.000Z',
    ...overrides,
  }
}

function renderBell(locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><NotificationBell/></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('modelo de notificações', () => {
  it('extrai o jogo e a data do payload', () => {
    const item = toNotification(makeRow() as never)
    expect(item.gameId).toBe('game-1')
    expect(item.scheduledAt).toBe('2026-08-21T19:30:00.000Z')
  })

  it('ignora um payload sem os campos esperados em vez de rebentar', () => {
    const item = toNotification(makeRow({ payload: null }) as never)
    expect(item.gameId).toBeNull()
    expect(item.scheduledAt).toBeNull()
  })

  it('conta apenas as por ler', () => {
    const items = [makeRow(), makeRow({ id: 'n2', read_at: '2026-08-16T11:00:00.000Z' })]
      .map((row) => toNotification(row as never))
    expect(unreadCount(items)).toBe(1)
  })

  it('reconhece os tipos que sabe traduzir', () => {
    expect(isKnownKind('game.created')).toBe(true)
    expect(isKnownKind('algo.futuro')).toBe(false)
  })
})

describe('NotificationBell', () => {
  beforeEach(() => {
    localStorage.clear()
    bellMocks.user = { id: 'user-1' }
    bellMocks.rows = []
    bellMocks.error = null
    bellMocks.rpc.mockReset()
    bellMocks.rpc.mockResolvedValue({ data: 1, error: null })
  })

  it('não aparece sem sessão', () => {
    bellMocks.user = null
    const { container } = renderBell()
    expect(container.querySelector('.notification-bell')).toBeNull()
  })

  it('mostra o número por ler no rótulo acessível', async () => {
    bellMocks.rows = [makeRow(), makeRow({ id: 'n2' })]
    renderBell()
    expect(await screen.findByRole('button', { name: /2 por ler/ })).toBeInTheDocument()
  })

  it('traduz a frase a partir do tipo, não do texto guardado', async () => {
    bellMocks.rows = [makeRow()]
    renderBell()

    fireEvent.click(await screen.findByRole('button', { name: /notificações/i }))

    expect(await screen.findByText(/Novo jogo marcado para/)).toBeInTheDocument()
    expect(screen.getByText('Quinta Brava')).toBeInTheDocument()
  })

  it('usa o idioma de quem lê, não o de quem agiu', async () => {
    bellMocks.rows = [makeRow({ kind: 'join_request_approved', payload: {} })]
    renderBell('de')

    fireEvent.click(await screen.findByRole('button', { name: /Benachrichtigungen/ }))

    expect(await screen.findByText('Deine Anfrage wurde angenommen. Du bist dabei.')).toBeInTheDocument()
  })

  it('recorre ao texto guardado para um tipo que ainda não conhece', async () => {
    bellMocks.rows = [makeRow({ kind: 'achievement.unlocked', body: 'Conquista nova' })]
    renderBell()

    fireEvent.click(await screen.findByRole('button', { name: /notificações/i }))

    expect(await screen.findByText('Conquista nova')).toBeInTheDocument()
  })

  it('marca todas como lidas', async () => {
    bellMocks.rows = [makeRow()]
    renderBell()

    fireEvent.click(await screen.findByRole('button', { name: /notificações/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como lidas' }))

    await waitFor(() => expect(bellMocks.rpc).toHaveBeenCalledWith('mark_notifications_read'))
  })

  it('não oferece marcar como lidas quando não há por ler', async () => {
    bellMocks.rows = [makeRow({ read_at: '2026-08-16T11:00:00.000Z' })]
    renderBell()

    fireEvent.click(await screen.findByRole('button', { name: /notificações/i }))

    await screen.findByText('Quinta Brava')
    expect(screen.queryByRole('button', { name: 'Marcar como lidas' })).not.toBeInTheDocument()
  })

  it('explica o vazio em vez de mostrar uma lista em branco', async () => {
    renderBell()
    fireEvent.click(await screen.findByRole('button', { name: /notificações/i }))
    expect(await screen.findByText('Nada de novo por aqui.')).toBeInTheDocument()
  })

  it('fecha com Escape e devolve o foco', async () => {
    bellMocks.rows = [makeRow()]
    renderBell()
    const trigger = await screen.findByRole('button', { name: /notificações/i })

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })
})
