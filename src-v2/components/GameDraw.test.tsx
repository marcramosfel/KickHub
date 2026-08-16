import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../data/demo'
import type { Game } from '../lib/games'
import { I18nProvider } from '../lib/i18n'
import { GameDraw } from './GameDraw'

const drawMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => drawMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: drawMocks.rpc } }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'owner', membership: 'active', joinMode: 'approval', members: 10, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    scheduledAt: '2026-08-21T19:30:00.000Z',
    durationMinutes: 90,
    location: 'Campo',
    format: '5x5',
    teamSize: 5,
    maxPlayers: null,
    status: 'scheduled',
    notes: null,
    confirmedCount: 10,
    waitlistCount: 0,
    declinedCount: 0,
    myStatus: 'confirmed',
    ...overrides,
  }
}

type AttendanceRow = {
  membership_id: string
  display_name: string
  status: string
  overall: number | null
  player_type: string | null
  primary_position: string | null
  secondary_position: string | null
  accepts_other_positions: boolean
}

function attendanceRows(count: number): AttendanceRow[] {
  return Array.from({ length: count }, (_, index) => ({
    membership_id: `m${index}`,
    display_name: `Jogador ${index}`,
    status: 'confirmed',
    overall: 50 + index,
    player_type: null,
    primary_position: null,
    secondary_position: null,
    accepts_other_positions: true,
  }))
}

function respondWith({ attendance = attendanceRows(10), lineup = [] as unknown[], ranking = [] as unknown[], failing = '', goalkeeperMode = 'rotating' }: { attendance?: AttendanceRow[]; lineup?: unknown[]; ranking?: unknown[]; failing?: string; goalkeeperMode?: string } = {}) {
  drawMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'list_game_attendance') return { data: attendance, error: null }
    if (fn === 'get_pelada_ranking') return { data: ranking, error: null }
    if (fn === 'get_game_lineup') return { data: lineup, error: null }
    if (fn === 'get_pelada_settings') {
      return { data: [{ default_format: '5x5', default_team_size: 5, goalkeeper_mode: goalkeeperMode, ratings_enabled: true, awards_enabled: true }], error: null }
    }
    return { data: [], error: null }
  })
}

function renderDraw(game = makeGame(), locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><MemoryRouter><GameDraw game={game}/></MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('GameDraw', () => {
  beforeEach(() => {
    localStorage.clear()
    drawMocks.context = { pelada, isDemo: false, canAdmin: true, slug: pelada.slug, status: 'ready', role: 'owner', peladas: [pelada], retry: vi.fn() }
    drawMocks.rpc.mockReset()
    respondWith()
  })

  it('diz quantas confirmações faltam em vez de oferecer um sorteio impossível', async () => {
    renderDraw(makeGame({ confirmedCount: 7 }))
    expect(await screen.findByText('Faltam 3 confirmados para sortear.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sortear/ })).not.toBeInTheDocument()
  })

  it('sorteia e mostra as duas equipas com o equilíbrio', async () => {
    renderDraw()
    fireEvent.click(await screen.findByRole('button', { name: /Sortear equipas/ }))

    expect(await screen.findByText('Equipa A')).toBeInTheDocument()
    expect(screen.getByText('Equipa B')).toBeInTheDocument()
    expect(screen.getByText(/Equilíbrio:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar sorteio/ })).toBeInTheDocument()
  })

  it('só grava depois de o organizador confirmar', async () => {
    renderDraw()
    fireEvent.click(await screen.findByRole('button', { name: /Sortear equipas/ }))
    await screen.findByText('Equipa A')
    expect(drawMocks.rpc).not.toHaveBeenCalledWith('save_game_lineup', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: /Guardar sorteio/ }))

    await waitFor(() => expect(drawMocks.rpc).toHaveBeenCalledWith('save_game_lineup', expect.objectContaining({
      p_game_id: 'game-1',
    })))
  })

  it('envia a escalação completa com o overall congelado', async () => {
    renderDraw()
    fireEvent.click(await screen.findByRole('button', { name: /Sortear equipas/ }))
    await screen.findByText('Equipa A')
    fireEvent.click(screen.getByRole('button', { name: /Guardar sorteio/ }))

    await waitFor(() => expect(drawMocks.rpc).toHaveBeenCalledWith('save_game_lineup', expect.anything()))
    const call = drawMocks.rpc.mock.calls.find(([fn]) => fn === 'save_game_lineup')!
    const payload = (call[1] as { p_lineup: Array<Record<string, unknown>> }).p_lineup
    expect(payload).toHaveLength(10)
    expect(payload.every((entry) => typeof entry.overall_at_draw === 'number')).toBe(true)
    expect(new Set(payload.map((entry) => entry.team))).toEqual(new Set(['A', 'B']))
  })

  /**
   * O sorteio tem de equilibrar pelo mesmo número que o ranking publica.
   * Enquanto usou a nota escrita à mão, o valor que formava as equipas não era
   * o valor que a pelada via: em staging, 82 aqui e 53 na tabela.
   */
  it('congela o overall calculado, não a nota que a organização escreveu', async () => {
    respondWith({
      attendance: attendanceRows(10).map((row, index) => ({ ...row, overall: index === 0 ? 90 : 50 })),
      ranking: [{
        membership_id: 'm0', display_name: 'Jogador 0', games_played: 20,
        goals: 0, assists: 0, own_goals: 0, saves: 0, wins: 0, draws: 0, losses: 0,
        is_former: false, base_rating: 90,
      }],
    })
    renderDraw()
    fireEvent.click(await screen.findByRole('button', { name: /Sortear equipas/ }))
    await screen.findByText('Equipa A')
    fireEvent.click(screen.getByRole('button', { name: /Guardar sorteio/ }))

    await waitFor(() => expect(drawMocks.rpc).toHaveBeenCalledWith('save_game_lineup', expect.anything()))
    const call = drawMocks.rpc.mock.calls.find(([fn]) => fn === 'save_game_lineup')!
    const payload = (call[1] as { p_lineup: Array<Record<string, unknown>> }).p_lineup
    const primeiro = payload.find((entry) => entry.membership_id === 'm0')!

    // Sem estrelas, os pesos 0,4 e 0,2 renormalizam para 2/3 e 1/3.
    // 2/3 × 90 + 1/3 × 10 (desempenho nulo em 20 jogos, encolhido) = 63.
    expect(primeiro.overall_at_draw).toBe(63)
  })

  it('separa os guarda-redes quando a pelada joga com eles fixos', async () => {
    const comGuardaRedes = [
      { ...attendanceRows(1)[0], membership_id: 'gk1', display_name: 'Guarda-redes 1', player_type: 'GOALKEEPER' },
      { ...attendanceRows(1)[0], membership_id: 'gk2', display_name: 'Guarda-redes 2', player_type: 'GOALKEEPER' },
      ...attendanceRows(8).map((row, index) => ({ ...row, membership_id: `f${index}`, display_name: `Campo ${index}` })),
    ]
    respondWith({ attendance: comGuardaRedes, goalkeeperMode: 'fixed' })
    renderDraw()

    fireEvent.click(await screen.findByRole('button', { name: /Sortear equipas/ }))
    await screen.findByText('Equipa A')

    const equipas = document.querySelectorAll('.draw-team')
    const comGk = [...equipas].filter((equipa) => equipa.textContent?.includes('GR'))
    expect(comGk).toHaveLength(2)
  })

  it('permite descartar o sorteio sem gravar', async () => {
    renderDraw()
    fireEvent.click(await screen.findByRole('button', { name: /Sortear equipas/ }))
    await screen.findByText('Equipa A')

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    await waitFor(() => expect(screen.queryByText('Equipa A')).not.toBeInTheDocument())
    expect(drawMocks.rpc).not.toHaveBeenCalledWith('save_game_lineup', expect.anything())
  })

  it('mostra a escalação já gravada a quem não organiza', async () => {
    drawMocks.context = { ...drawMocks.context, canAdmin: false, role: 'player' }
    respondWith({ lineup: [
      { membership_id: 'm1', display_name: 'Joana', team: 'A', is_goalkeeper: true, overall_at_draw: 70, overall_estimated: false },
      { membership_id: 'm2', display_name: 'Malik', team: 'B', is_goalkeeper: false, overall_at_draw: 66, overall_estimated: true },
    ] })
    renderDraw()

    expect(await screen.findByText('Joana')).toBeInTheDocument()
    expect(screen.getByText('GR')).toBeInTheDocument()
    expect(screen.getByText('66*')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sortear/ })).not.toBeInTheDocument()
  })

  it('esconde tudo de quem não organiza enquanto não houver sorteio', async () => {
    drawMocks.context = { ...drawMocks.context, canAdmin: false, role: 'player' }
    const { container } = renderDraw()
    await waitFor(() => expect(container.querySelector('.game-draw')).toBeNull())
  })

  it('avisa quando a gravação falha', async () => {
    respondWith({ failing: 'save_game_lineup' })
    renderDraw()
    fireEvent.click(await screen.findByRole('button', { name: /Sortear equipas/ }))
    await screen.findByText('Equipa A')
    fireEvent.click(screen.getByRole('button', { name: /Guardar sorteio/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar as equipas')
  })
})
