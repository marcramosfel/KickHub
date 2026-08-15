import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../data/demo'
import { I18nProvider } from '../lib/i18n'
import { DiscoverPage } from './DiscoverPage'

const discoverMocks = vi.hoisted(() => ({
  requestJoin: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))

vi.mock('../lib/onboarding-api', () => ({
  discoverPublicPeladas: vi.fn(async () => null),
}))

vi.mock('../lib/onboarding', () => ({
  useOnboarding: () => ({ joinStates: {}, requestJoin: discoverMocks.requestJoin }),
}))

function renderDiscover(locale: string) {
  localStorage.setItem('kickhub-locale', locale)
  return render(<I18nProvider><MemoryRouter><DiscoverPage/></MemoryRouter></I18nProvider>)
}

describe('DiscoverPage localizada', () => {
  beforeEach(() => {
    localStorage.clear()
    discoverMocks.requestJoin.mockReset()
  })

  it('mostra cabeçalho, contagem e estados de entrada em português', () => {
    renderDiscover('pt')
    expect(screen.getByRole('heading', { level: 1, name: 'Descobrir peladas' })).toBeInTheDocument()
    expect(screen.getByText('3 peladas perto de Zürich')).toBeInTheDocument()
    expect(screen.getByText('ENTRADA ABERTA')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Pedir entrada/ })).not.toHaveLength(0)
  })

  it('traduz a mesma página e pluraliza a contagem noutro idioma', () => {
    renderDiscover('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Gruppen entdecken' })).toBeInTheDocument()
    expect(screen.getByText('3 Gruppen in der Nähe von Zürich')).toBeInTheDocument()
    expect(screen.getByText('OFFENER BEITRITT')).toBeInTheDocument()
    expect(screen.queryByText('Descobrir peladas')).not.toBeInTheDocument()
  })

  it('localiza o aviso devolvido pelo pedido de entrada', async () => {
    discoverMocks.requestJoin.mockResolvedValue('pending' as const)
    renderDiscover('es')

    fireEvent.click(screen.getAllByRole('button', { name: /Pedir entrada/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/ }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Solicitud enviada a'))
    const [pelada] = discoverMocks.requestJoin.mock.calls[0] as [Pelada, string]
    expect(pelada.membership).toBe('none')
  })

  it('avisa em francês quando o pedido falha', async () => {
    discoverMocks.requestJoin.mockRejectedValue(new Error('no session'))
    renderDiscover('fr')

    fireEvent.click(screen.getAllByRole('button', { name: /Demander à rejoindre/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /Envoyer la demande/ }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Envoi de la demande impossible.'))
  })
})
