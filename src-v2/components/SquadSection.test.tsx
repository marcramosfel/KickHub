import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../lib/pelada-types'
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

function respondWith({ members = [] as MemberRow[], ranking = [] as MemberRow[], failing = '' } = {}) {
  squadMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'list_pelada_members') return { data: members, error: null }
    if (fn === 'get_pelada_ranking') return { data: ranking, error: null }
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

  it('consulta sempre o plantel real', async () => {
    renderSquad()
    expect(await screen.findByRole('heading', { name: 'Ainda só estás tu.' })).toBeInTheDocument()
    expect(squadMocks.rpc).toHaveBeenCalledWith('list_pelada_members', { p_pelada_id: 'pelada-1' })
  })

  it('apresenta posição, papel e overall de cada jogador', async () => {
    respondWith({
      members: [makeRow(), makeRow({ membership_id: 'm2', display_name: 'Malik Diallo', username: 'malik', role: 'owner', primary_position: 'GK', player_type: 'GOALKEEPER', overall: null })],
      // O ranking traz uma linha por membro activo, sempre. Sem elas o cartão
      // não teria de onde tirar a nota do grupo.
      ranking: [
        { membership_id: 'membership-1', display_name: 'Joana Silva', games_played: 0, goals: 0, assists: 0, own_goals: 0, saves: 0, wins: 0, draws: 0, losses: 0, is_former: false, base_rating: 72, post_rating_avg: null, post_rating_count: 0, craques: 0, bagres: 0, wae_saldo: null, wae_matches: 0, current_win_streak: 0 },
        { membership_id: 'm2', display_name: 'Malik Diallo', games_played: 0, goals: 0, assists: 0, own_goals: 0, saves: 0, wins: 0, draws: 0, losses: 0, is_former: false, base_rating: null, post_rating_avg: null, post_rating_count: 0, craques: 0, bagres: 0, wae_saldo: null, wae_matches: 0, current_win_streak: 0 },
      ],
    })
    renderSquad()
    expect(await screen.findByText('Joana Silva')).toBeInTheDocument()
    expect(screen.getByText('Médio')).toBeInTheDocument()
    expect(screen.getByText('Guarda-redes')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('Por avaliar')).toBeInTheDocument()
    expect(screen.getByText('2 jogadores')).toBeInTheDocument()
  })

  /**
   * Havia dois números a chamar-se overall: este cartão mostrava a nota escrita
   * à mão e o ranking mostrava o valor calculado. Em staging a mesma jogadora
   * aparecia com 82 aqui e 53 lá. Agora o cartão mostra a conta completa.
   */
  it('mostra o overall calculado, não a nota que a organização escreveu', async () => {
    respondWith({
      members: [makeRow({ overall: 90 })],
      ranking: [{
        membership_id: 'membership-1', display_name: 'Joana Silva', games_played: 20,
        goals: 0, assists: 0, own_goals: 0, saves: 0, wins: 0, draws: 0, losses: 0,
        is_former: false, base_rating: 90,
      }],
    })
    renderSquad()

    await screen.findByText('Joana Silva')
    // Sem avaliações dos companheiros está na v1: 0,70 × 90 + 0,30 × desempenho.
    // O desempenho é zero e conta a zero — sem golos nem assistências em 20
    // rodadas — o que dá 63. Mais os +3 de "mais jogos", título de ouro que ela
    // lidera por ser a única no ranking.
    expect(await screen.findByText('66')).toBeInTheDocument()
    expect(screen.queryByText('90')).not.toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText('Nota do grupo'), { target: { value: '85' } })
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
    expect(screen.getByLabelText('Nota do grupo')).toBeDisabled()
    expect(screen.getByText('A tua nota é definida pela organização.')).toBeInTheDocument()

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

  it('o dono promove um jogador a admin', async () => {
    respondWith({ members: [makeRow(), makeRow({ membership_id: 'm2', display_name: 'Eu', is_me: true, role: 'owner' })] })
    renderSquad()

    fireEvent.click(await screen.findByRole('button', { name: 'Tornar admin' }))
    await waitFor(() => expect(squadMocks.rpc).toHaveBeenCalledWith('set_pelada_member_role', {
      p_membership_id: 'membership-1', p_role: 'admin',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Joana Silva passou a admin')
  })

  it('o dono despromove um admin', async () => {
    respondWith({ members: [makeRow({ role: 'admin' }), makeRow({ membership_id: 'm2', display_name: 'Eu', is_me: true, role: 'owner' })] })
    renderSquad()

    fireEvent.click(await screen.findByRole('button', { name: 'Passar a jogador' }))
    await waitFor(() => expect(squadMocks.rpc).toHaveBeenCalledWith('set_pelada_member_role', {
      p_membership_id: 'membership-1', p_role: 'player',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Joana Silva voltou a jogador')
  })

  /**
   * O botão não pode remover à primeira: perder um membro é o tipo de gesto que
   * não se desfaz a partir da interface.
   */
  it('pede confirmação antes de remover', async () => {
    respondWith({ members: [makeRow()] })
    renderSquad()

    fireEvent.click(await screen.findByRole('button', { name: 'Remover da pelada' }))
    expect(squadMocks.rpc).not.toHaveBeenCalledWith('remove_pelada_member', expect.anything())
    expect(screen.getByText(/Remover Joana Silva da pelada\?/)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Remover da pelada' })[0])
    await waitFor(() => expect(squadMocks.rpc).toHaveBeenCalledWith('remove_pelada_member', {
      p_membership_id: 'membership-1',
    }))
  })

  it('não oferece papéis nem remoção a quem só administra', async () => {
    squadMocks.context = { ...squadMocks.context, role: 'admin' }
    respondWith({ members: [makeRow({ membership_id: 'm2', display_name: 'Outro Admin', role: 'admin' })] })
    renderSquad()

    await screen.findByText('Outro Admin')
    expect(screen.queryByRole('button', { name: 'Tornar admin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover da pelada' })).not.toBeInTheDocument()
  })

  it('não deixa ninguém mexer no dono nem em si próprio', async () => {
    respondWith({ members: [
      makeRow({ membership_id: 'm2', display_name: 'Eu', is_me: true, role: 'owner' }),
      makeRow({ membership_id: 'm3', display_name: 'Fundador', role: 'owner' }),
    ] })
    renderSquad()

    await screen.findByText('Fundador')
    expect(screen.queryByRole('button', { name: /Tornar admin|Passar a jogador/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover da pelada' })).not.toBeInTheDocument()
  })

  it('explica quando a mudança de papel falha', async () => {
    respondWith({ members: [makeRow()], failing: 'set_pelada_member_role' })
    renderSquad()

    fireEvent.click(await screen.findByRole('button', { name: 'Tornar admin' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir')
  })
})
