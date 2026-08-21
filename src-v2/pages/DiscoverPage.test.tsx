import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../lib/pelada-types'
import { I18nProvider } from '../lib/i18n'
import { DiscoverPage } from './DiscoverPage'

const discoverMocks = vi.hoisted(() => ({
  requestJoin: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: discoverMocks.rpc } }))
vi.mock('../lib/onboarding', () => ({
  useOnboarding: () => ({ joinStates: {}, requestJoin: discoverMocks.requestJoin }),
}))

type Row = Record<string, unknown>

function row(overrides: Row = {}): Row {
  return {
    id: 'p-1', slug: 'aberta', name: 'Pelada Aberta', description: 'Aberta',
    country_code: 'CH', region: 'Zürich', city: 'Zürich', join_mode: 'open',
    timezone: 'Europe/Zurich', member_count: 10, default_format: '7x7', frequency: 'weekly',
    skill_level: 'mixed', match_weekday: 5, match_time: '19:00:00', max_players: null,
    distance_km: null, location: null, created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const results = [
  row(),
  row({ id: 'p-2', slug: 'norte', name: 'Pelada Norte', join_mode: 'approval', member_count: 12 }),
  row({ id: 'p-3', slug: 'sul', name: 'Pelada Sul', join_mode: 'approval', member_count: 8 }),
]

function respondWith({ peladas = results as Row[] | null, failing = false, regions = [] as Row[] } = {}) {
  discoverMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'discover_peladas') {
      return failing ? { data: null, error: { message: 'staging unavailable' } } : { data: peladas, error: null }
    }
    if (fn === 'list_pelada_regions') return { data: regions, error: null }
    return { data: [], error: null }
  })
}

function renderDiscover(locale: string, path = '/descobrir') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/descobrir" element={<DiscoverPage/>}/>
            <Route path="/descobrir/:country/:region" element={<DiscoverPage/>}/>
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('DiscoverPage localizada', () => {
  beforeEach(() => {
    localStorage.clear()
    discoverMocks.requestJoin.mockReset()
    discoverMocks.rpc.mockReset()
    respondWith()
  })

  it('mostra cabeçalho, contagem e estados reais de entrada em português', async () => {
    renderDiscover('pt')
    expect(screen.getByRole('heading', { level: 1, name: 'Descobrir peladas' })).toBeInTheDocument()
    expect(await screen.findByText('3 peladas encontradas')).toBeInTheDocument()
    expect(screen.getByText('ENTRADA ABERTA')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Pedir entrada/ })).not.toHaveLength(0)
  })

  it('traduz a mesma página e pluraliza a contagem noutro idioma', async () => {
    renderDiscover('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Gruppen entdecken' })).toBeInTheDocument()
    expect(await screen.findByText('3 Peladas gefunden')).toBeInTheDocument()
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
    respondWith({ failing: true })
    renderDiscover('pt')
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar as peladas')
    expect(screen.queryByText('Pelada Aberta')).not.toBeInTheDocument()
  })

  it('manda os filtros ao servidor em vez de os aplicar depois', async () => {
    renderDiscover('pt')
    await screen.findByText('Pelada Aberta')

    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }))
    fireEvent.click(screen.getByRole('button', { name: '7x7' }))

    await waitFor(() => expect(discoverMocks.rpc).toHaveBeenCalledWith(
      'discover_peladas', expect.objectContaining({ p_format: '7x7' }),
    ))
  })

  it('a página de uma região já chega filtrada por ela', async () => {
    renderDiscover('pt', '/descobrir/pt/Algarve')
    expect(await screen.findByRole('heading', { level: 1, name: 'Peladas em Algarve' })).toBeInTheDocument()
    await waitFor(() => expect(discoverMocks.rpc).toHaveBeenCalledWith(
      'discover_peladas', expect.objectContaining({ p_country_code: 'PT', p_region: 'Algarve' }),
    ))
  })

  it('alterna para o mapa e assume quem não autoriza mostrar onde joga', async () => {
    renderDiscover('pt')
    await screen.findByText('Pelada Aberta')

    fireEvent.click(screen.getByRole('button', { name: /Mapa/ }))
    // Nenhuma das três devolveu `location`, portanto o mapa não inventa pinos.
    expect(await screen.findByText(/Nenhuma destas peladas autoriza/)).toBeInTheDocument()
  })
})
