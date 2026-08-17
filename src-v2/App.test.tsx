import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { I18nProvider } from './lib/i18n'
import { OnboardingProvider } from './lib/onboarding'

vi.mock('./lib/supabase', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/supabase')>(),
  isSupabaseConfigured: false,
}))

function renderAt(path: string) {
  localStorage.setItem('kickhub-locale', 'pt')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><I18nProvider><OnboardingProvider><MemoryRouter initialEntries={[path]}><App/></MemoryRouter></OnboardingProvider></I18nProvider></QueryClientProvider>)
}

describe('KickHub V2', () => {
  it('apresenta a proposta de valor e entrada na demonstração', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'A casa digital da sua pelada.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar demonstração' })).toHaveAttribute('href', '/app')
  })

  it('troca o idioma da experiência principal sem perder a rota', () => {
    renderAt('/')
    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } })
    expect(screen.getByRole('heading', { name: 'The digital home of your football group.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore demo' })).toHaveAttribute('href', '/app')
  })

  it('mostra as memberships de demonstração sem conceder papel administrativo', () => {
    renderAt('/app')
    expect(screen.getByRole('heading', { name: 'Minhas peladas' })).toBeInTheDocument()
    expect(screen.queryByText('OWNER')).not.toBeInTheDocument()
    expect(screen.getAllByText('JOGADOR')).toHaveLength(2)
  })

  it('exige um nome antes de avançar no wizard demonstrativo', () => {
    renderAt('/criar')
    const continueButton = screen.getByRole('button', { name: /Continuar/ })
    expect(continueButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Nome da pelada'), { target: { value: 'Futebol das Sextas' } })
    expect(continueButton).toBeEnabled()
  })

  it('envia pedido de entrada pela descoberta e mostra o estado pendente', async () => {
    renderAt('/descobrir')
    fireEvent.click(screen.getAllByRole('button', { name: 'Pedir entrada' })[0])
    fireEvent.change(screen.getByLabelText(/Mensagem para os administradores/), { target: { value: 'Jogo no meio-campo.' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar pedido/ }))
    await waitFor(() => expect(screen.getByText('PEDIDO PENDENTE')).toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Pedido enviado')
  })

  it('protege o centro de administração durante a demonstração', () => {
    renderAt('/p/browns/admin')
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Só para a equipa de organização.' })).toBeInTheDocument()
    expect(screen.queryByText('Joana Silva')).not.toBeInTheDocument()
  })
})
