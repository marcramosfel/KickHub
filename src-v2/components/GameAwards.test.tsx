import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../lib/pelada-types'
import { canVote } from '../lib/awards'
import type { Game } from '../lib/games'
import { I18nProvider } from '../lib/i18n'
import { GameAwards } from './GameAwards'

const awardMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => awardMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: awardMocks.rpc } }))

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

/** Eu na equipa A com um companheiro; um adversário na B. */
const lineup = [
  { membership_id: 'me', display_name: 'Eu', team: 'A', is_goalkeeper: false, overall_at_draw: 70, overall_estimated: false },
  { membership_id: 'colega', display_name: 'Joana Silva', team: 'A', is_goalkeeper: false, overall_at_draw: 66, overall_estimated: false },
  { membership_id: 'rival', display_name: 'Malik Diallo', team: 'B', is_goalkeeper: false, overall_at_draw: 68, overall_estimated: false },
]

const squad = [
  { membership_id: 'me', display_name: 'Eu', username: 'eu', role: 'player', player_type: 'FIELD', primary_position: 'MID', secondary_position: null, accepts_other_positions: true, overall: 70, is_me: true },
]

function respondWith({ winners = [] as unknown[], myVotes = [] as unknown[], scoreA = 3, scoreB = 1, failing = '' } = {}) {
  awardMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'get_game_lineup') return { data: lineup, error: null }
    if (fn === 'list_pelada_members') return { data: squad, error: null }
    if (fn === 'get_game_result') return { data: [{ score_a: scoreA, score_b: scoreB, notes: null, stats: [] }], error: null }
    if (fn === 'get_game_awards') return { data: winners, error: null }
    if (fn === 'get_my_game_award_votes') return { data: myVotes, error: null }
    return { data: [], error: null }
  })
}

function renderAwards(current = game, locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><GameAwards game={current}/></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('quem pode votar em quê', () => {
  it('o craque é de quem ganhou e o bagre de quem perdeu', () => {
    expect(canVote('craque', 'winner')).toBe(true)
    expect(canVote('craque', 'loser')).toBe(false)
    expect(canVote('bagre', 'loser')).toBe(true)
    expect(canVote('bagre', 'winner')).toBe(false)
  })

  it('num empate não há lados e vota-se nos dois', () => {
    expect(canVote('craque', 'draw')).toBe(true)
    expect(canVote('bagre', 'draw')).toBe(true)
  })

  it('sem resultado não se vota em nada', () => {
    expect(canVote('craque', null)).toBe(false)
    expect(canVote('bagre', null)).toBe(false)
  })
})

describe('GameAwards', () => {
  beforeEach(() => {
    localStorage.clear()
    awardMocks.context = { pelada, isDemo: false, canAdmin: false, slug: pelada.slug, status: 'ready', role: 'player', peladas: [pelada], retry: vi.fn() }
    awardMocks.rpc.mockReset()
    respondWith()
  })

  it('não aparece antes de o jogo ser disputado', () => {
    const { container } = renderAwards({ ...game, status: 'scheduled' })
    expect(container.querySelector('.game-awards')).toBeNull()
    expect(awardMocks.rpc).not.toHaveBeenCalled()
  })

  /**
   * Quem ganhou elege o craque. Oferecer-lhe o bagre seria pedir o que o
   * servidor recusa com BAGRE_IS_FOR_LOSERS.
   */
  it('a quem ganhou só oferece o craque', async () => {
    renderAwards()
    expect(await screen.findByText('O craque da tua equipa')).toBeInTheDocument()
    expect(screen.queryByText('O bagre da tua equipa')).not.toBeInTheDocument()
  })

  it('a quem perdeu só oferece o bagre', async () => {
    respondWith({ scoreA: 1, scoreB: 3 })
    renderAwards()
    expect(await screen.findByText('O bagre da tua equipa')).toBeInTheDocument()
    expect(screen.queryByText('O craque da tua equipa')).not.toBeInTheDocument()
  })

  it('num empate oferece os dois', async () => {
    respondWith({ scoreA: 2, scoreB: 2 })
    renderAwards()
    expect(await screen.findByText('O craque da tua equipa')).toBeInTheDocument()
    expect(screen.getByText('O bagre da tua equipa')).toBeInTheDocument()
  })

  it('nunca oferece o adversário como candidato', async () => {
    renderAwards()
    await screen.findByText('O craque da tua equipa')
    expect(screen.getByRole('option', { name: 'Joana Silva' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Malik Diallo' })).not.toBeInTheDocument()
  })

  it('envia o voto escolhido', async () => {
    renderAwards()
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'colega' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar voto' }))

    await waitFor(() => expect(awardMocks.rpc).toHaveBeenCalledWith('vote_game_awards', {
      p_game_id: 'game-1', p_craque: 'colega', p_bagre: null,
    }))
  })

  it('abre com o voto que já tinha sido dado', async () => {
    respondWith({ myVotes: [{ award: 'craque', nominee_membership_id: 'colega' }] })
    renderAwards()
    await waitFor(() => expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('colega'))
  })

  it('mostra quem ganhou e assinala que ainda se está a contar', async () => {
    respondWith({ winners: [{ award: 'craque', membership_id: 'colega', display_name: 'Joana Silva', source: 'live' }] })
    const { container } = renderAwards()

    // O nome também está na lista de candidatos, portanto a asserção tem de ser
    // sobre o quadro de vencedores e não sobre o ecrã inteiro.
    expect(await screen.findByText('ainda a contar votos')).toBeInTheDocument()
    expect(container.querySelector('.award-winners strong')).toHaveTextContent('Joana Silva')
  })

  /**
   * Uma rodada fechada não se reabre: um voto atrasado mudaria retroativamente
   * quem foi craque, e o overall de duas pessoas com ele.
   */
  it('fecha a votação quando o resultado já não é contagem ao vivo', async () => {
    respondWith({ winners: [{ award: 'craque', membership_id: 'colega', display_name: 'Joana Silva', source: 'votes' }] })
    renderAwards()
    expect(await screen.findByText('Votação fechada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar voto' })).not.toBeInTheDocument()
  })

  it('assinala quando foi a organização a decidir', async () => {
    respondWith({ winners: [{ award: 'bagre', membership_id: 'colega', display_name: 'Joana Silva', source: 'admin' }] })
    renderAwards()
    expect(await screen.findByText('decidido pela organização')).toBeInTheDocument()
  })

  it('só oferece fechar a quem organiza', async () => {
    renderAwards()
    await screen.findByText('O craque da tua equipa')
    expect(screen.queryByRole('button', { name: 'Fechar votação' })).not.toBeInTheDocument()

    awardMocks.context = { ...awardMocks.context, canAdmin: true }
    renderAwards()
    expect(await screen.findAllByRole('button', { name: 'Fechar votação' })).toHaveLength(1)
  })

  it('explica quando o voto não pode ser guardado', async () => {
    respondWith({ failing: 'vote_game_awards' })
    renderAwards()
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'colega' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar voto' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar o voto')
  })

  it('diz a quem vota que o voto não é público', async () => {
    renderAwards()
    expect(await screen.findByText('Só tu vês em quem votaste. A pelada vê apenas quem ganhou.')).toBeInTheDocument()
  })

  it('traduz noutro idioma', async () => {
    renderAwards(game, 'de')
    expect(await screen.findByRole('button', { name: 'Stimme speichern' })).toBeInTheDocument()
  })
})
