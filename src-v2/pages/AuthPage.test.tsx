import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthPage } from './AuthPage'

const authMocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signInWithGoogle: authMocks.signInWithGoogle,
  }),
}))

describe('AuthPage', () => {
  beforeEach(() => authMocks.signInWithGoogle.mockReset())

  it('inicia o cadastro ou login pelo Google no mesmo botão', async () => {
    authMocks.signInWithGoogle.mockResolvedValue(true)
    render(<MemoryRouter><AuthPage/></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))

    await waitFor(() => expect(authMocks.signInWithGoogle).toHaveBeenCalledOnce())
    expect(screen.getByText(/perfil global são criados automaticamente/i)).toBeInTheDocument()
  })

  it('mostra um erro amigável quando o provedor falha', async () => {
    authMocks.signInWithGoogle.mockResolvedValue(false)
    render(<MemoryRouter><AuthPage/></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar com o Google')
  })
})
