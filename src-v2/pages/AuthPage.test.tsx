import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { AuthPage } from './AuthPage'

const authMocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    signInWithGoogle: authMocks.signInWithGoogle,
  }),
}))

function renderAuthPage() {
  return render(<I18nProvider><MemoryRouter><AuthPage/></MemoryRouter></I18nProvider>)
}

describe('AuthPage', () => {
  beforeEach(() => {
    localStorage.setItem('kickhub-locale', 'pt')
    authMocks.signInWithGoogle.mockReset()
  })

  it('inicia o cadastro ou login pelo Google no mesmo botão', async () => {
    authMocks.signInWithGoogle.mockResolvedValue(true)
    renderAuthPage()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))

    await waitFor(() => expect(authMocks.signInWithGoogle).toHaveBeenCalledOnce())
    expect(screen.getByText(/perfil global são criados automaticamente/i)).toBeInTheDocument()
  })

  it('mostra um erro amigável quando o provedor falha', async () => {
    authMocks.signInWithGoogle.mockResolvedValue(false)
    renderAuthPage()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar com o Google')
  })

  it('permite trocar de idioma antes de existir sessão', () => {
    renderAuthPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Entra em campo.' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'de' } })

    expect(screen.getByRole('button', { name: 'Weiter mit Google' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-Mail')).toBeInTheDocument()
    expect(screen.queryByText('Entra em campo.')).not.toBeInTheDocument()
  })

  it('traduz o erro do magic link no idioma ativo', async () => {
    authMocks.signInWithGoogle.mockResolvedValue(false)
    renderAuthPage()

    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'fr' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuer avec Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion avec Google impossible.')
  })
})
