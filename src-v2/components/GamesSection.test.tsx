import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../data/demo'
import { I18nProvider } from '../lib/i18n'
import { GamesSection } from './GamesSection'

/**
 * O mock fica no cliente Supabase e não em `lib/games`: assim o teste percorre
 * o mesmo caminho da aplicação, incluindo a conversão das linhas do read model.
 */
const gameMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => gameMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: gameMocks.rpc } }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'owner', membership: 'active', joinMode: 'approval', members: 12, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

type GameRow = Record<string, unknown>

function makeRow(overrides: GameRow = {}): GameRow {
  return {
    id: 'game-1',
    scheduled_at: '2026-08-21T19:30:00.000Z',
    duration_minutes: 90,
    location: 'Campo Central',
    format: '7x7',
    team_size: 7,
    max_players: 14,
    status: 'scheduled',
    notes: null,
    confirmed_count: 8,
    waitlist_count: 0,
    declined_count: 1,
    my_status: null,
    ...overrides,
  }
}

/** Encaminha cada RPC para a resposta pretendida, como faria o PostgREST. */
function respondWith({ games = [] as GameRow[], failing = '' } = {}) {
  gameMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'list_pelada_games') return { data: games, error: null }
    return { data: {}, error: null }
  })
}

function renderGames(locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><MemoryRouter><GamesSection/></MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('GamesSection', () => {
  beforeEach(() => {
    localStorage.clear()
    gameMocks.context = { pelada, isDemo: false, canAdmin: true, slug: pelada.slug, status: 'ready', role: 'owner', peladas: [pelada], retry: vi.fn() }
    gameMocks.rpc.mockReset()
    respondWith()
  })

  it('não consulta o servidor na demonstração e explica porquê', async () => {
    gameMocks.context = { ...gameMocks.context, isDemo: true, canAdmin: false }
    renderGames()
    expect(await screen.findByRole('status')).toHaveTextContent('Inicia sessão para marcar jogos a sério')
    expect(gameMocks.rpc).not.toHaveBeenCalled()
  })

  it('mostra o estado vazio com a ação de marcar para quem administra', async () => {
    renderGames()
    expect(await screen.findByRole('heading', { name: 'Ainda não há jogos marcados.' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Marcar jogo/ })).not.toHaveLength(0)
  })

  it('não oferece marcar jogo a um jogador comum', async () => {
    gameMocks.context = { ...gameMocks.context, canAdmin: false, role: 'player' }
    renderGames()
    expect(await screen.findByText('Assim que a organização marcar um jogo, ele aparece aqui.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marcar jogo/ })).not.toBeInTheDocument()
  })

  it('apresenta vagas, lista de espera e a resposta do próprio', async () => {
    respondWith({ games: [makeRow({ confirmed_count: 14, waitlist_count: 2, my_status: 'waitlist' })] })
    renderGames()
    expect(await screen.findByText('14 de 14 confirmados')).toBeInTheDocument()
    expect(screen.getByText('Sem vagas')).toBeInTheDocument()
    expect(screen.getByText('2 em espera')).toBeInTheDocument()
    expect(screen.getByText('Estás na lista de espera')).toBeInTheDocument()
  })

  it('pluraliza as vagas restantes', async () => {
    respondWith({ games: [makeRow({ confirmed_count: 13 })] })
    renderGames()
    expect(await screen.findByText('resta 1 vaga')).toBeInTheDocument()
  })

  it('confirma a presença através da RPC', async () => {
    respondWith({ games: [makeRow()] })
    renderGames()

    fireEvent.click(await screen.findByRole('button', { name: /Vou jogar/ }))

    await waitFor(() => expect(gameMocks.rpc).toHaveBeenCalledWith('set_game_attendance', {
      p_game_id: 'game-1', p_status: 'confirmed', p_note: '',
    }))
  })

  it('mostra um erro legível quando a resposta falha', async () => {
    respondWith({ games: [makeRow()], failing: 'set_game_attendance' })
    renderGames()

    fireEvent.click(await screen.findByRole('button', { name: /Não vou/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar a tua resposta')
  })

  it('recusa uma data no passado sem chamar o servidor', async () => {
    renderGames()
    fireEvent.click((await screen.findAllByRole('button', { name: /Marcar jogo/ }))[0])

    fireEvent.change(screen.getByLabelText('Data e hora'), { target: { value: '2020-01-01T20:00' } })
    // O cabeçalho e a submissão partilham o rótulo; submeter o formulário evita
    // depender da ordem em que aparecem.
    fireEvent.submit(document.querySelector('.game-form form')!)

    expect(await screen.findByRole('alert')).toHaveTextContent('Escolhe uma data no futuro.')
    expect(gameMocks.rpc).not.toHaveBeenCalledWith('create_game', expect.anything())
  })

  it('traduz o calendário noutro idioma', async () => {
    respondWith({ games: [makeRow({ confirmed_count: 13 })] })
    renderGames('de')
    // Espera pelo conteúdo carregado: o cabeçalho existe antes da resposta.
    expect(await screen.findByText('noch 1 Platz frei')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Kalender' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ich spiele/ })).toBeInTheDocument()
  })
})
