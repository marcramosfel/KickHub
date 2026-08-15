import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../data/demo'
import { I18nProvider } from '../lib/i18n'
import { SquadSection } from './SquadSection'

const squadMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => squadMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: squadMocks.rpc } }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'owner', membership: 'active', joinMode: 'approval', members: 2, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

type MemberRow = Record<string, unknown>

function makeRow(overrides: MemberRow = {}): MemberRow {
  return {
    membership_id: 'membership-1',
    display_name: 'Joana Silva',
    username: 'joana',
    role: 'player',
    player_type: 'FIELD',
    primary_position: 'MID',
    secondary_position: null,
    accepts_other_positions: true,
    overall: 72,
    is_me: false,
    ...overrides,
  }
}

function respondWith({ members = [] as MemberRow[], failing = '' } = {}) {
  squadMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'list_pelada_members') return { data: members, error: null }
    return { data: {}, error: null }
  })
}

function renderSquad(locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><MemoryRouter><SquadSection/></MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('SquadSection', () => {
  beforeEach(() => {
    localStorage.clear()
    squadMocks.context = { pelada, isDemo: false, canAdmin: true, slug: pelada.slug, status: 'ready', role: 'owner', peladas: [pelada], retry: vi.fn() }
    squadMocks.rpc.mockReset()
    respondWith()
  })

  it('não consulta o servidor na demonstração', async () => {
    squadMocks.context = { ...squadMocks.context, isDemo: true, canAdmin: false }
    renderSquad()
    expect(await screen.findByRole('status')).toHaveTextContent('Inicia sessão para ver o plantel real')
    expect(squadMocks.rpc).not.toHaveBeenCalled()
  })

  it('apresenta posição, papel e overall de cada jogador', async () => {
    respondWith({ members: [makeRow(), makeRow({ membership_id: 'm2', display_name: 'Malik Diallo', username: 'malik', role: 'owner', primary_position: 'GK', player_type: 'GOALKEEPER', overall: null })] })
    renderSquad()
    expect(await screen.findByText('Joana Silva')).toBeInTheDocument()
    expect(screen.getByText('Médio')).toBeInTheDocument()
    expect(screen.getByText('Guarda-redes')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('Por avaliar')).toBeInTheDocument()
    expect(screen.getByText('2 jogadores')).toBeInTheDocument()
  })

  it('marca o próprio jogador na lista', async () => {
    respondWith({ members: [makeRow({ is_me: true })] })
    renderSquad()
    expect(await screen.findByText('Tu')).toBeInTheDocument()
  })

  it('um jogador comum não edita os outros', async () => {
    squadMocks.context = { ...squadMocks.context, canAdmin: false, role: 'player' }
    respondWith({ members: [makeRow(), makeRow({ membership_id: 'm2', display_name: 'Eu Próprio', is_me: true })] })
    renderSquad()
    await screen.findByText('Joana Silva')
    expect(screen.getAllByRole('button', { name: /Editar/ })).toHaveLength(1)
  })

  it('guarda os atributos escolhidos pela organização', async () => {
    respondWith({ members: [makeRow()] })
    renderSquad()

    fireEvent.click(await screen.findByRole('button', { name: /Editar/ }))
    fireEvent.change(screen.getByLabelText('Posição principal'), { target: { value: 'ATT' } })
    fireEvent.change(screen.getByLabelText('Overall'), { target: { value: '85' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(squadMocks.rpc).toHaveBeenCalledWith('update_pelada_member', expect.objectContaining({
      p_membership_id: 'membership-1', p_primary_position: 'ATT', p_overall: 85,
    })))
  })

  it('bloqueia o overall a quem edita o próprio perfil e reenvia o valor atual', async () => {
    squadMocks.context = { ...squadMocks.context, canAdmin: false, role: 'player' }
    respondWith({ members: [makeRow({ is_me: true, overall: 64 })] })
    renderSquad()

    fireEvent.click(await screen.findByRole('button', { name: /Editar/ }))
    expect(screen.getByLabelText('Overall')).toBeDisabled()
    expect(screen.getByText('O teu overall é definido pela organização.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Posição principal'), { target: { value: 'DEF' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(squadMocks.rpc).toHaveBeenCalledWith('update_pelada_member', expect.objectContaining({
      p_primary_position: 'DEF', p_overall: 64,
    })))
  })

  it('mostra um erro legível quando a gravação falha', async () => {
    respondWith({ members: [makeRow()], failing: 'update_pelada_member' })
    renderSquad()

    fireEvent.click(await screen.findByRole('button', { name: /Editar/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar')
  })

  it('traduz o plantel noutro idioma', async () => {
    respondWith({ members: [makeRow({ primary_position: 'DEF' })] })
    renderSquad('de')
    expect(await screen.findByText('Abwehr')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Kader' })).toBeInTheDocument()
  })
})
