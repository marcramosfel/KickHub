import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../lib/pelada-types'
import { I18nProvider } from '../lib/i18n'
import { DiscoverPage } from './DiscoverPage'

const discoverMocks = vi.hoisted(() => ({
  requestJoin: vi.fn(),
  discover: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))

vi.mock('../lib/onboarding-api', () => ({
  discoverPublicPeladas: discoverMocks.discover,
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
    discoverMocks.discover.mockReset()
    discoverMocks.discover.mockResolvedValue([
      { id: 'p-1', slug: 'aberta', name: 'Pelada Aberta', city: 'Zürich', country: 'CH', role: undefined, membership: 'none', joinMode: 'open', members: 10, nextMatch: 'A anunciar', accent: '#d8ff45', visibility: 'public', description: 'Aberta' },
      { id: 'p-2', slug: 'norte', name: 'Pelada Norte', city: 'Zürich', country: 'CH', role: undefined, membership: 'none', joinMode: 'approval', members: 12, nextMatch: 'A anunciar', accent: '#72d8ff', visibility: 'public', description: 'Norte' },
      { id: 'p-3', slug: 'sul', name: 'Pelada Sul', city: 'Zürich', country: 'CH', role: undefined, membership: 'none', joinMode: 'approval', members: 8, nextMatch: 'A anunciar', accent: '#ff9f43', visibility: 'public', description: 'Sul' },
    ] satisfies Pelada[])
  })

  it('mostra cabeçalho, contagem e estados reais de entrada em português', async () => {
    renderDiscover('pt')
    expect(screen.getByRole('heading', { level: 1, name: 'Descobrir peladas' })).toBeInTheDocument()
    expect(await screen.findByText('3 peladas perto de Zürich')).toBeInTheDocument()
    expect(screen.getByText('ENTRADA ABERTA')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Pedir entrada/ })).not.toHaveLength(0)
  })

  it('traduz a mesma página e pluraliza a contagem noutro idioma', async () => {
    renderDiscover('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Gruppen entdecken' })).toBeInTheDocument()
    expect(await screen.findByText('3 Gruppen in der Nähe von Zürich')).toBeInTheDocument()
    expect(screen.getByText('OFFENER BEITRITT')).toBeInTheDocument()
    expect(screen.queryByText('Descobrir peladas')).not.toBeInTheDocument()
  })

  it('localiza o aviso devolvido pelo pedido de entrada', async () => {
    discoverMocks.requestJoin.mockResolvedValue('pending' as const)
    renderDiscover('es')

    await screen.findByText('Pelada Norte')
    fireEvent.click(screen.getAllByRole('button', { name: /Pedir entrada/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/ }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Solicitud enviada a'))
    const [pelada] = discoverMocks.requestJoin.mock.calls[0] as [Pelada, string]
    expect(pelada.membership).toBe('none')
  })

  it('avisa em francês quando o pedido falha', async () => {
    discoverMocks.requestJoin.mockRejectedValue(new Error('no session'))
    renderDiscover('fr')

    await screen.findByText('Pelada Norte')
    fireEvent.click(screen.getAllByRole('button', { name: /Demander à rejoindre/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /Envoyer la demande/ }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Envoi de la demande impossible.'))
  })

  it('mostra a falha real da consulta sem recorrer a fixtures', async () => {
    discoverMocks.discover.mockRejectedValue(new Error('staging unavailable'))
    renderDiscover('pt')
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as peladas')
    expect(screen.queryByText('Limmat United')).not.toBeInTheDocument()
  })
})
