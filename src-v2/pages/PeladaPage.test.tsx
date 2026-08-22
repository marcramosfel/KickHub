import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../lib/pelada-types'
import type { JoinRequestRecord } from '../lib/onboarding-api'
import { CurrentPeladaProvider } from '../lib/current-pelada'
import { I18nProvider } from '../lib/i18n'
import { PeladaPage } from './PeladaPage'

const peladaMocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  query: {} as Record<string, unknown>,
  requests: [] as unknown[],
  createInvite: vi.fn(),
  loadRequests: vi.fn(),
  reviewRequest: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: peladaMocks.user, profile: null }),
}))

vi.mock('../lib/peladas', () => ({
  useMyPeladas: () => peladaMocks.query,
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: async () => ({ data: [], error: null }) },
}))

vi.mock('../lib/onboarding', () => ({
  inviteMaxUses: 25,
  inviteTtlHours: 168,
  useOnboarding: () => ({
    requests: peladaMocks.requests,
    loadRequests: peladaMocks.loadRequests,
    reviewRequest: peladaMocks.reviewRequest,
    createInvite: peladaMocks.createInvite,
  }),
}))

const ownedPelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'owner', membership: 'active', joinMode: 'approval', members: 12, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

const secondPelada: Pelada = {
  ...ownedPelada, id: 'pelada-2', slug: 'lago-azul', name: 'Lago Azul', role: 'player', city: 'Zürich', country: 'CH',
}

const pendingRequest: JoinRequestRecord = {
  id: 'request-1', peladaId: ownedPelada.id, profileId: 'profile-1', playerName: 'Joana Silva',
  username: 'joana', message: '', createdAt: '2026-08-13T09:42:00.000Z', status: 'pending',
}

function renderPelada(path: string, locale: string) {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path="/p/:slug/:section?" element={<CurrentPeladaProvider><PeladaPage/></CurrentPeladaProvider>}/></Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('PeladaPage localizada', () => {
  beforeEach(() => {
    localStorage.clear()
    peladaMocks.user = { id: 'user-1' }
    peladaMocks.query = { data: [ownedPelada, secondPelada], isPending: false, isError: false, refetch: vi.fn() }
    peladaMocks.requests = []
    peladaMocks.createInvite.mockReset()
    peladaMocks.loadRequests.mockReset()
    peladaMocks.reviewRequest.mockReset()
  })

  it('traduz navegação e visão geral com dados reais', () => {
    renderPelada('/p/quinta-brava', 'pt')
    expect(screen.getByRole('link', { name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quinta Brava já tem uma casa no KickHub.' })).toBeInTheDocument()
    expect(screen.queryByText('14/16 confirmados')).not.toBeInTheDocument()
  })

  it('traduz as mesmas secções noutro idioma', () => {
    renderPelada('/p/quinta-brava', 'en')
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quinta Brava now has a home on KickHub.' })).toBeInTheDocument()
    expect(screen.queryByText('Visão geral')).not.toBeInTheDocument()
  })

  it('permite trocar de contexto sem sair da pelada', () => {
    renderPelada('/p/quinta-brava', 'pt')
    const trigger = screen.getByRole('button', { name: 'Trocar de pelada' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Trocar de pelada' })).not.toBeInTheDocument()

    fireEvent.click(trigger)

    const panel = screen.getByRole('navigation', { name: 'Trocar de pelada' })
    expect(trigger).toHaveAttribute('aria-controls', panel.id)
    expect(screen.getByRole('link', { name: /Quinta Brava/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Lago Azul/ })).toHaveAttribute('href', '/p/lago-azul')
    expect(screen.getByRole('link', { name: /Nova pelada/ })).toHaveAttribute('href', '/criar')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Trocar de pelada' })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('mostra um estado de erro com nova tentativa quando o read model falha', () => {
    const refetch = vi.fn()
    peladaMocks.user = { id: 'user-1' }
    peladaMocks.query = { data: undefined, isPending: false, isError: true, refetch }
    renderPelada('/p/quinta-brava', 'pt')

    expect(screen.getByRole('heading', { name: 'Não conseguimos abrir esta pelada.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('traduz o estado de pelada inexistente para uma conta autenticada', () => {
    peladaMocks.user = { id: 'user-1' }
    renderPelada('/p/desconhecida', 'es')
    expect(screen.getByRole('heading', { name: 'Grupo no encontrado.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a mis grupos' })).toBeInTheDocument()
  })

  it('esconde o separador de administração e protege a área para jogadores', () => {
    peladaMocks.user = { id: 'user-1' }
    peladaMocks.query = { data: [{ ...ownedPelada, role: 'player' }], isPending: false, isError: false }
    renderPelada('/p/quinta-brava/admin', 'pt')
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Só para a equipa de organização.' })).toBeInTheDocument()
    expect(peladaMocks.loadRequests).not.toHaveBeenCalled()
  })

  it('localiza a fila de pedidos, as datas e o convite criado', async () => {
    peladaMocks.user = { id: 'user-1' }
    peladaMocks.query = { data: [ownedPelada], isPending: false, isError: false }
    peladaMocks.requests = [pendingRequest]
    peladaMocks.createInvite.mockResolvedValue({
      token: 'token-1', url: 'https://kickhub.test/convite/token-1', expiresAt: '2026-08-20T10:00:00.000Z',
    })
    renderPelada('/p/quinta-brava/admin', 'de')

    const germanRequestDate = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(pendingRequest.createdAt))
    const germanExpiry = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date('2026-08-20T10:00:00.000Z'))

    expect(screen.getByRole('heading', { name: 'Offene Anfragen' })).toBeInTheDocument()
    expect(screen.getByText('Keine Vorstellungsnachricht.')).toBeInTheDocument()
    expect(screen.getByText(`@joana · ${germanRequestDate}`)).toBeInTheDocument()
    expect(screen.getByText(/7 Tage und bis zu 25 Nutzungen/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Einladung erstellen/ }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Einladung erstellt.'))
    expect(screen.getByLabelText('Privater Link')).toHaveValue('https://kickhub.test/convite/token-1')
    expect(screen.getByText(`Läuft am ${germanExpiry} ab. Du kannst jederzeit einen neuen Link erzeugen.`)).toBeInTheDocument()
  })

  it('dá sempre caminho de volta ao painel global', () => {
    renderPelada('/p/quinta-brava', 'pt')
    // Entrar numa pelada não pode ser uma rua sem saída: era exactamente isso
    // que acontecia com a página fora do AppShell.
    expect(screen.getByRole('link', { name: /Voltar às minhas peladas/i })).toHaveAttribute('href', '/app')
  })

  it('os botões do cabeçalho levam mesmo a algum lado', () => {
    renderPelada('/p/quinta-brava', 'pt')
    expect(screen.getByRole('link', { name: /Definições/ })).toHaveAttribute('href', '/p/quinta-brava/admin')
    expect(screen.getByRole('link', { name: /Novo jogo/ })).toHaveAttribute('href', '/p/quinta-brava/jogos?novo=1')
  })

  it('não deixa nenhum botão sem destino na visão geral', () => {
    const { container } = renderPelada('/p/quinta-brava', 'pt')
    // Um `<button>` sem `onClick` e sem `type=submit` nesta página é um botão
    // morto — foi o que o utilizador encontrou.
    const orphans = [...container.querySelectorAll('button')]
      .filter((node) => node.getAttribute('type') !== 'submit' && !node.className.includes('pelada-switcher'))
    expect(orphans.every((node) => node.onclick !== null || node.getAttribute('aria-expanded') !== null)).toBe(true)
  })

  it('um endereço de secção inventado assume-o em vez de anunciar um módulo', () => {
    renderPelada('/p/quinta-brava/inexistente', 'pt')
    expect(screen.getByRole('heading', { name: 'Esta secção não existe.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Voltar à visão geral/i })).toBeInTheDocument()
  })
})
