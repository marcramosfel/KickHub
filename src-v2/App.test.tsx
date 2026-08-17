import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { I18nProvider } from './lib/i18n'
import { OnboardingProvider } from './lib/onboarding'

const appMocks = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  loading: false,
  signInWithGoogle: vi.fn(),
  peladas: [] as Array<Record<string, unknown>>,
}))

vi.mock('./lib/auth', () => ({
  useAuth: () => ({
    user: appMocks.user,
    profile: appMocks.user ? { username: 'marcos', display_name: 'Marcos' } : null,
    loading: appMocks.loading,
    signInWithGoogle: appMocks.signInWithGoogle,
    signOut: vi.fn(),
  }),
  getAuthDisplayName: () => 'Marcos',
  getAuthAvatarUrl: () => undefined,
}))

vi.mock('./lib/peladas', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/peladas')>(),
  useMyPeladas: () => ({ data: appMocks.peladas, isPending: false, isError: false, refetch: vi.fn() }),
}))

function renderAt(path: string) {
  localStorage.setItem('kickhub-locale', 'pt')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <OnboardingProvider>
          <MemoryRouter initialEntries={[path]}><App/></MemoryRouter>
        </OnboardingProvider>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('KickHub V2 com dados reais', () => {
  beforeEach(() => {
    appMocks.user = null
    appMocks.loading = false
    appMocks.peladas = []
    appMocks.signInWithGoogle.mockReset()
    appMocks.signInWithGoogle.mockResolvedValue(true)
  })

  it('apresenta a proposta de valor sem oferecer uma demonstração', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'A casa digital da sua pelada.' })).toBeInTheDocument()
    expect(screen.queryByText(/demonstração|demo/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Começar agora' })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Começar agora' })[0]).toHaveAttribute('href', '/entrar')
  })

  it('troca o idioma da landing sem criar um atalho para dados fictícios', () => {
    renderAt('/')
    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } })
    expect(screen.getByRole('heading', { name: 'The digital home of your football group.' })).toBeInTheDocument()
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument()
  })

  it('envia utilizadores sem sessão para o login ao abrir a app', () => {
    renderAt('/app')
    expect(screen.getByRole('heading', { name: 'Entra em campo.' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Minhas peladas' })).not.toBeInTheDocument()
  })

  it('protege também as páginas privadas de uma pelada', () => {
    renderAt('/p/browns/admin')
    expect(screen.getByRole('heading', { name: 'Entra em campo.' })).toBeInTheDocument()
  })

  it('preserva o convite como destino do login', async () => {
    renderAt('/convite/123456789012345678901234567890123456789012345678')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
    await waitFor(() => expect(appMocks.signInWithGoogle).toHaveBeenCalledWith('/convite/123456789012345678901234567890123456789012345678'))
  })

  it('mostra apenas as memberships reais depois da autenticação', () => {
    appMocks.user = { id: 'user-1', email: 'marcos@example.com' }
    appMocks.peladas = [{
      id: 'pelada-1', slug: 'browns', name: 'Pelada Browns', city: 'Zürich', country: 'CH',
      role: 'owner', membership: 'active', joinMode: 'invite', members: 30, nextMatch: 'A anunciar',
      accent: '#d8ff45', visibility: 'private', description: 'Tenant real do staging',
    }]
    renderAt('/app')
    expect(screen.getByRole('heading', { name: 'Minhas peladas' })).toBeInTheDocument()
    expect(screen.getAllByText('Pelada Browns').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OWNER').length).toBeGreaterThan(0)
  })
})
