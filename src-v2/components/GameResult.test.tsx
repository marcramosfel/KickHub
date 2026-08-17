import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../lib/pelada-types'
import type { Game } from '../lib/games'
import { I18nProvider } from '../lib/i18n'
import { GameResult } from './GameResult'

const resultMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => resultMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: resultMocks.rpc } }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'owner', membership: 'active', joinMode: 'approval', members: 4, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1', scheduledAt: '2026-08-21T19:30:00.000Z', durationMinutes: 90,
    location: 'Campo', format: '5x5', teamSize: 5, maxPlayers: null, status: 'scheduled',
    notes: null, confirmedCount: 4, waitlistCount: 0, declinedCount: 0, myStatus: 'confirmed',
    ...overrides,
  }
}

const attendance = [
  { membership_id: 'm1', display_name: 'Joana', status: 'confirmed', overall: 70, player_type: null, primary_position: null, secondary_position: null, accepts_other_positions: true },
  { membership_id: 'm2', display_name: 'Malik', status: 'confirmed', overall: 65, player_type: null, primary_position: null, secondary_position: null, accepts_other_positions: true },
]

function respondWith({ result = [] as unknown[], failing = '' } = {}) {
  resultMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'get_game_result') return { data: result, error: null }
    if (fn === 'list_game_attendance') return { data: attendance, error: null }
    return { data: {}, error: null }
  })
}

function renderResult(game = makeGame(), locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><MemoryRouter><GameResult game={game}/></MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('GameResult', () => {
  beforeEach(() => {
    localStorage.clear()
    resultMocks.context = { pelada, isDemo: false, canAdmin: true, slug: pelada.slug, status: 'ready', role: 'owner', peladas: [pelada], retry: vi.fn() }
    resultMocks.rpc.mockReset()
    respondWith()
  })

  it('esconde tudo de quem não organiza enquanto não houver resultado', async () => {
    resultMocks.context = { ...resultMocks.context, canAdmin: false, role: 'player' }
    const { container } = renderResult()
    await waitFor(() => expect(container.querySelector('.game-result')).toBeNull())
  })

  it('mostra o placar e quem marcou a quem não organiza', async () => {
    resultMocks.context = { ...resultMocks.context, canAdmin: false, role: 'player' }
    respondWith({ result: [
      { score_a: 5, score_b: 3, notes: 'Noite de reviravolta', recorded_at: '2026-08-21T22:00:00.000Z', membership_id: 'm1', display_name: 'Joana', team: 'A', goals: 3, assists: 1, own_goals: 0, saves: 0 },
      { score_a: 5, score_b: 3, notes: 'Noite de reviravolta', recorded_at: '2026-08-21T22:00:00.000Z', membership_id: 'm2', display_name: 'Malik', team: 'B', goals: 0, assists: 0, own_goals: 0, saves: 6 },
    ] })
    renderResult(makeGame({ status: 'played' }))

    expect(await screen.findByText('5 — 3')).toBeInTheDocument()
    expect(screen.getByText('Noite de reviravolta')).toBeInTheDocument()
    expect(screen.getByText('3 G')).toBeInTheDocument()
    expect(screen.getByText('6 D')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registar resultado/ })).not.toBeInTheDocument()
  })

  it('só oferece linhas de estatística para quem confirmou presença', async () => {
    renderResult()
    fireEvent.click(await screen.findByRole('button', { name: /Registar resultado/ }))

    expect(await screen.findByLabelText('Golos — Joana')).toBeInTheDocument()
    expect(screen.getByLabelText('Golos — Malik')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/^Golos —/)).toHaveLength(2)
  })

  it('grava o placar com as estatísticas preenchidas', async () => {
    renderResult()
    fireEvent.click(await screen.findByRole('button', { name: /Registar resultado/ }))
    await screen.findByLabelText('Golos — Joana')

    fireEvent.change(screen.getByLabelText('Golos da equipa A'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Golos da equipa B'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Golos — Joana'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Defesas — Malik'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar resultado' }))

    await waitFor(() => expect(resultMocks.rpc).toHaveBeenCalledWith('save_game_result', expect.objectContaining({
      p_game_id: 'game-1', p_score_a: 5, p_score_b: 3,
    })))
    const call = resultMocks.rpc.mock.calls.find(([fn]) => fn === 'save_game_result')!
    const stats = (call[1] as { p_stats: Array<Record<string, unknown>> }).p_stats
    expect(stats).toHaveLength(2)
    expect(stats.find((s) => s.membership_id === 'm1')?.goals).toBe(3)
    expect(stats.find((s) => s.membership_id === 'm2')?.saves).toBe(6)
  })

  it('não envia linhas de quem não somou nada', async () => {
    renderResult()
    fireEvent.click(await screen.findByRole('button', { name: /Registar resultado/ }))
    await screen.findByLabelText('Golos — Joana')

    fireEvent.change(screen.getByLabelText('Golos — Joana'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar resultado' }))

    await waitFor(() => expect(resultMocks.rpc).toHaveBeenCalledWith('save_game_result', expect.anything()))
    const call = resultMocks.rpc.mock.calls.find(([fn]) => fn === 'save_game_result')!
    expect((call[1] as { p_stats: unknown[] }).p_stats).toHaveLength(1)
  })

  it('avisa quando a gravação falha', async () => {
    respondWith({ failing: 'save_game_result' })
    renderResult()
    fireEvent.click(await screen.findByRole('button', { name: /Registar resultado/ }))
    await screen.findByLabelText('Golos — Joana')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar resultado' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar o resultado')
  })

  it('permite corrigir um resultado já registado', async () => {
    respondWith({ result: [
      { score_a: 2, score_b: 2, notes: null, recorded_at: '2026-08-21T22:00:00.000Z', membership_id: 'm1', display_name: 'Joana', team: 'A', goals: 1, assists: 0, own_goals: 0, saves: 0 },
    ] })
    renderResult(makeGame({ status: 'played' }))

    fireEvent.click(await screen.findByRole('button', { name: /Corrigir resultado/ }))
    expect(await screen.findByLabelText('Golos da equipa A')).toHaveValue(2)
    expect(screen.getByLabelText('Golos — Joana')).toHaveValue(1)
  })

  it('traduz o resultado noutro idioma', async () => {
    respondWith({ result: [
      { score_a: 1, score_b: 0, notes: null, recorded_at: '2026-08-21T22:00:00.000Z', membership_id: 'm1', display_name: 'Joana', team: 'A', goals: 1, assists: 0, own_goals: 0, saves: 0 },
    ] })
    renderResult(makeGame({ status: 'played' }), 'de')
    expect(await screen.findByText('1 — 0')).toBeInTheDocument()
    expect(screen.getByText('1 T')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ergebnis korrigieren/ })).toBeInTheDocument()
  })
})
