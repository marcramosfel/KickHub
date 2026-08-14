import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreatePeladaPage } from './CreatePeladaPage'
import { I18nProvider } from '../lib/i18n'

const createMocks = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  createPelada: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: createMocks.user, loading: false }),
}))

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true }))

vi.mock('../lib/peladas', () => ({
  createPeladaSlug: () => 'futebol-das-sextas',
  createPelada: createMocks.createPelada,
}))

function renderCreate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider><MemoryRouter initialEntries={['/criar']}>
          <Routes>
            <Route path="/criar" element={<CreatePeladaPage/>}/>
            <Route path="/app" element={<p>Dashboard criada</p>}/>
          </Routes>
      </MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('CreatePeladaPage', () => {
  beforeEach(() => {
    localStorage.setItem('kickhub-locale', 'pt')
    createMocks.user = { id: 'user-1' }
    createMocks.createPelada.mockReset().mockResolvedValue({ id: 'pelada-1', name: 'Futebol das Sextas', slug: 'futebol-das-sextas' })
  })

  it('exige uma conta para criar dados persistentes', () => {
    createMocks.user = null
    renderCreate()
    expect(screen.getByRole('heading', { name: 'Entra para criar uma pelada.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Entrar ou criar conta/ })).toHaveAttribute('href', '/entrar')
  })

  it('persiste formato e frequência escolhidos no wizard', async () => {
    renderCreate()
    fireEvent.change(screen.getByLabelText('Nome da pelada'), { target: { value: 'Futebol das Sextas' } })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.click(screen.getByRole('button', { name: /5 × 5/ }))
    fireEvent.change(screen.getByLabelText('Frequência'), { target: { value: 'fortnightly' } })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    fireEvent.click(screen.getByRole('button', { name: /Criar pelada/ }))

    await waitFor(() => expect(createMocks.createPelada).toHaveBeenCalledWith(expect.objectContaining({
      defaultFormat: '5x5',
      frequency: 'fortnightly',
    })))
    expect(await screen.findByText('Dashboard criada')).toBeInTheDocument()
  })
})
