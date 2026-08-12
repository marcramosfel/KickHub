import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { I18nProvider } from './lib/i18n'
import { OnboardingProvider } from './lib/onboarding'

function renderAt(path: string) {
  return render(<I18nProvider><OnboardingProvider><MemoryRouter initialEntries={[path]}><App/></MemoryRouter></OnboardingProvider></I18nProvider>)
}

describe('KickHub V2', () => {
  it('apresenta a proposta de valor e entrada na demonstração', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'A casa digital da sua pelada.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar demonstração' })).toHaveAttribute('href', '/app')
  })

  it('mostra duas memberships com papéis distintos', () => {
    renderAt('/app')
    expect(screen.getByRole('heading', { name: 'Minhas peladas' })).toBeInTheDocument()
    expect(screen.getByText('OWNER')).toBeInTheDocument()
    expect(screen.getByText('JOGADOR')).toBeInTheDocument()
  })

  it('exige um nome antes de avançar no wizard', () => {
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

  it('permite ao owner aprovar um pedido no centro de administração', async () => {
    renderAt('/p/browns/admin')
    expect(screen.getByRole('heading', { name: 'Pedidos pendentes' })).toBeInTheDocument()
    expect(screen.getByText('Joana Silva')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /Aprovar/ })[0])
    await waitFor(() => expect(screen.queryByText('Joana Silva')).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Jogador aprovado')
  })
})
