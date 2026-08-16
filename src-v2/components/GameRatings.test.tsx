import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../data/demo'
import type { Game } from '../lib/games'
import { I18nProvider } from '../lib/i18n'
import { GameRatings } from './GameRatings'

const ratingMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => ratingMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: ratingMocks.rpc } }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'player', membership: 'active', joinMode: 'approval', members: 6, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

const game: Game = {
  id: 'game-1', scheduledAt: '2026-08-10T19:00:00.000Z', durationMinutes: 90,
  location: 'Campo', format: '5x5', teamSize: 5, maxPlayers: 10, notes: null,
  status: 'played', confirmedCount: 10, waitlistCount: 0, declinedCount: 0, myStatus: null,
}

/** Eu na equipa A, com um companheiro; dois adversários na B. */
const lineup = [
  { membership_id: 'me', display_name: 'Eu', team: 'A', is_goalkeeper: false, overall_at_draw: 70, overall_estimated: false },
  { membership_id: 'colega', display_name: 'Joana Silva', team: 'A', is_goalkeeper: false, overall_at_draw: 66, overall_estimated: false },
  { membership_id: 'rival', display_name: 'Malik Diallo', team: 'B', is_goalkeeper: false, overall_at_draw: 68, overall_estimated: false },
]

const squad = [
  { membership_id: 'me', display_name: 'Eu', username: 'eu', role: 'player', player_type: 'FIELD', primary_position: 'MID', secondary_position: null, accepts_other_positions: true, overall: 70, is_me: true },
  { membership_id: 'colega', display_name: 'Joana Silva', username: 'joana', role: 'player', player_type: 'FIELD', primary_position: 'MID', secondary_position: null, accepts_other_positions: true, overall: 66, is_me: false },
]

function respondWith({ given = [] as unknown[], failing = '', myLineup = lineup, members = squad } = {}) {
  ratingMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'get_game_lineup') return { data: myLineup, error: null }
    if (fn === 'list_pelada_members') return { data: members, error: null }
    if (fn === 'get_my_game_ratings') return { data: given, error: null }
    return { data: [], error: null }
  })
}

function renderRatings(current = game, locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><GameRatings game={current}/></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('GameRatings', () => {
  beforeEach(() => {
    localStorage.clear()
    ratingMocks.context = { pelada, isDemo: false, canAdmin: false, slug: pelada.slug, status: 'ready', role: 'player', peladas: [pelada], retry: vi.fn() }
    ratingMocks.rpc.mockReset()
    respondWith()
  })

  it('não aparece antes de o jogo ser disputado', () => {
    respondWith()
    const { container } = renderRatings({ ...game, status: 'scheduled' })
    expect(container.querySelector('.game-ratings')).toBeNull()
    expect(ratingMocks.rpc).not.toHaveBeenCalled()
  })

  /**
   * Ninguém viu jogar quem tinha pelas costas, e deixar avaliar quem se
   * defronta transforma a nota numa arma. O servidor recusa na mesma; isto
   * evita oferecer o gesto que vai ser recusado.
   */
  it('oferece os companheiros de equipa e nunca o adversário', async () => {
    renderRatings()
    expect(await screen.findByText('Joana Silva')).toBeInTheDocument()
    expect(screen.queryByText('Malik Diallo')).not.toBeInTheDocument()
    expect(screen.queryByText('Eu')).not.toBeInTheDocument()
  })

  it('não aparece a quem não esteve em campo', async () => {
    respondWith({ myLineup: lineup.filter((entry) => entry.membership_id !== 'me') })
    const { container } = renderRatings()
    await waitFor(() => expect(ratingMocks.rpc).toHaveBeenCalledWith('get_game_lineup', expect.anything()))
    expect(container.querySelector('.game-ratings')).toBeNull()
  })

  it('envia as estrelas escolhidas', async () => {
    renderRatings()
    fireEvent.click(await screen.findByRole('radio', { name: '4 estrelas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar avaliações' }))

    await waitFor(() => expect(ratingMocks.rpc).toHaveBeenCalledWith('rate_game_players', {
      p_game_id: 'game-1',
      p_ratings: [{ membership_id: 'colega', stars: 4 }],
    }))
  })

  it('abre com as notas que já tinham sido dadas', async () => {
    respondWith({ given: [{ rated_membership_id: 'colega', stars: 3 }] })
    renderRatings()
    expect(await screen.findByRole('radio', { name: '3 estrelas', checked: true })).toBeInTheDocument()
  })

  /**
   * Guardar sem escolher nada apagaria o que estava lá em vez de não fazer
   * nada, e o servidor recusaria uma proposta vazia sem explicar porquê.
   */
  it('recusa guardar sem nenhuma nota escolhida', async () => {
    renderRatings()
    await screen.findByText('Joana Silva')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar avaliações' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Escolhe pelo menos uma nota')
    expect(ratingMocks.rpc).not.toHaveBeenCalledWith('rate_game_players', expect.anything())
  })

  it('explica quando a gravação falha', async () => {
    respondWith({ failing: 'rate_game_players' })
    renderRatings()
    fireEvent.click(await screen.findByRole('radio', { name: '5 estrelas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar avaliações' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar as avaliações')
  })

  it('diz a quem avalia que o voto não é público', async () => {
    renderRatings()
    expect(await screen.findByText('Só tu vês o que deste. A pelada vê apenas a média.')).toBeInTheDocument()
  })

  it('traduz as estrelas noutro idioma', async () => {
    renderRatings(game, 'de')
    expect(await screen.findByRole('button', { name: 'Bewertungen speichern' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '1 Stern' })).toBeInTheDocument()
  })
})
