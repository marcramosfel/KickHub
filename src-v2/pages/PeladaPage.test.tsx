import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DemoJoinRequest, Pelada } from '../data/demo'
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

const pendingRequest: DemoJoinRequest = {
  id: 'request-1', peladaId: ownedPelada.id, profileId: 'profile-1', playerName: 'Joana Silva',
  username: 'joana', message: '', createdAt: '2026-08-13T09:42:00.000Z', status: 'pending',
}

function renderPelada(path: string, locale: string) {
  localStorage.setItem('kickhub-locale', locale)
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/p/:slug/:section?" element={<PeladaPage/>}/></Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('PeladaPage localizada', () => {
  beforeEach(() => {
    localStorage.clear()
    peladaMocks.user = null
    peladaMocks.query = { data: [], isPending: false, isError: false }
    peladaMocks.requests = []
    peladaMocks.createInvite.mockReset()
    peladaMocks.loadRequests.mockReset()
    peladaMocks.reviewRequest.mockReset()
  })

  it('traduz navegação e visão geral demonstrativa', () => {
    renderPelada('/p/browns', 'pt')
    expect(screen.getByRole('link', { name: 'Visão geral' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'O próximo capítulo começa em 2 dias.' })).toBeInTheDocument()
    expect(screen.getByText('14/16 confirmados')).toBeInTheDocument()
  })

  it('traduz as mesmas secções noutro idioma', () => {
    renderPelada('/p/browns', 'en')
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The next chapter starts in 2 days.' })).toBeInTheDocument()
    expect(screen.queryByText('Visão geral')).not.toBeInTheDocument()
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
})
