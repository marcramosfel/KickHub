import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { normalizeClaimCode, toClaimFailure } from '../lib/legacy-claim'
import { ClaimPage } from './ClaimPage'

const claimMocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: claimMocks.rpc } }))

const CODIGO = 'A1B2-C3D4-E5F6-0718-293A-4B5C-6D7E-8F90'

function renderClaim(locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/reclamar']}>
          <Routes>
            <Route path="/reclamar" element={<ClaimPage/>}/>
            <Route path="/app" element={<p>Entrei</p>}/>
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('código de transferência', () => {
  /** Quem copia de uma mensagem raramente copia exactamente. */
  it('aceita o código com ou sem hífenes, em qualquer caixa', () => {
    expect(normalizeClaimCode('a1b2c3d4e5f60718293a4b5c6d7e8f90')).toBe(CODIGO)
    expect(normalizeClaimCode('  A1B2-c3d4 e5f6:0718.293a4b5c6d7e8f90 ')).toBe(CODIGO)
  })

  it('reconhece cada motivo de recusa que o servidor nomeia', () => {
    expect(toClaimFailure({ message: 'CLAIM_EXPIRED' })).toBe('CLAIM_EXPIRED')
    expect(toClaimFailure({ message: 'ACCOUNT_ALREADY_LINKED' })).toBe('ACCOUNT_ALREADY_LINKED')
    // Inventar uma explicação seria pior do que admitir que não se sabe.
    expect(toClaimFailure({ message: 'algo novo' })).toBe('UNKNOWN')
    expect(toClaimFailure(null)).toBe('UNKNOWN')
  })
})

describe('ClaimPage', () => {
  beforeEach(() => {
    localStorage.clear()
    claimMocks.rpc.mockReset()
    claimMocks.rpc.mockResolvedValue({ data: 'profile-1', error: null })
  })

  it('não chama o servidor com um código incompleto', async () => {
    renderClaim()
    fireEvent.change(screen.getByLabelText('Código de transferência'), { target: { value: 'A1B2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reclamar o meu histórico' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Esse código não confere')
    expect(claimMocks.rpc).not.toHaveBeenCalled()
  })

  it('envia o código normalizado e leva a pessoa para dentro', async () => {
    renderClaim()
    fireEvent.change(screen.getByLabelText('Código de transferência'), {
      target: { value: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reclamar o meu histórico' }))

    await waitFor(() => expect(claimMocks.rpc).toHaveBeenCalledWith('claim_legacy_profile', { p_code: CODIGO }))
    expect(await screen.findByText('Entrei')).toBeInTheDocument()
  })

  /**
   * Cada recusa do servidor tem de chegar à pessoa como uma frase que lhe diga
   * o que fazer a seguir — não como um código de erro.
   */
  it('explica cada recusa por palavras', async () => {
    for (const [motivo, frase] of [
      ['CLAIM_EXPIRED', 'Este código expirou'],
      ['CLAIM_ALREADY_USED', 'Este código já foi usado'],
      ['ACCOUNT_ALREADY_LINKED', 'Esta conta já está ligada'],
      ['TOO_MANY_ATTEMPTS', 'Demasiadas tentativas'],
    ] as const) {
      claimMocks.rpc.mockResolvedValueOnce({ data: null, error: { message: motivo } })
      const { unmount } = renderClaim()
      fireEvent.change(screen.getByLabelText('Código de transferência'), { target: { value: CODIGO } })
      fireEvent.click(screen.getByRole('button', { name: 'Reclamar o meu histórico' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(frase)
      unmount()
    }
  })

  it('avisa que o código não se partilha', () => {
    renderClaim()
    expect(screen.getByText(/quem o tiver fica com o teu histórico/)).toBeInTheDocument()
  })

  it('traduz noutro idioma', () => {
    renderClaim('de')
    expect(screen.getByRole('button', { name: 'Meine Historie übernehmen' })).toBeInTheDocument()
  })
})
