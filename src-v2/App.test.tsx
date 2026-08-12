import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { I18nProvider } from './lib/i18n'

function renderAt(path: string) {
  return render(<I18nProvider><MemoryRouter initialEntries={[path]}><App/></MemoryRouter></I18nProvider>)
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
})
