import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import type { Pelada } from '../lib/pelada-types'
import { CuriositiesSection } from './CuriositiesSection'

const curiosityMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => curiosityMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: curiosityMocks.rpc } }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'player', membership: 'active', joinMode: 'approval', members: 28, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

type Row = Record<string, unknown>

function member(id: string, position: string, overrides: Row = {}): Row {
  return {
    membership_id: id, display_name: id, username: id, role: 'player',
    player_type: position === 'GK' ? 'GOALKEEPER' : 'FIELD',
    primary_position: position, secondary_position: null, accepts_other_positions: true,
    overall: null, is_me: false, avatar_path: null, avatar_bucket: null, ...overrides,
  }
}

/** Jogos e avaliações que chegam para o overall deixar de ser provisório. */
function rankingRow(id: string, rating: number, overrides: Row = {}): Row {
  return {
    membership_id: id, display_name: id, games_played: 20, goals: 9, assists: 5, own_goals: 0,
    saves: 0, wins: 11, draws: 4, losses: 5, is_former: false, base_rating: rating,
    post_rating_avg: 4, post_rating_count: 12, craques: 1, bagres: 1, wae_saldo: 1, wae_matches: 20,
    current_win_streak: 1, best_unbeaten_streak: 3, player_type: 'FIELD',
    avatar_path: null, avatar_bucket: null, gk_matches: 0, gk_saves: 0, gk_conceded: 0,
    gk_clean_sheets: 0, gk_wins: 0, ...overrides,
  }
}

/** Um plantel de `size` com quatro guarda-redes e notas de 40 para cima. */
function squad(size: number) {
  const positions = ['DEF', 'MID', 'MID', 'ATT']
  const members: Row[] = []
  const ranking: Row[] = []
  for (let index = 0; index < size; index += 1) {
    const id = `p${index}`
    const isKeeper = index % 7 === 0
    const position = isKeeper ? 'GK' : positions[index % positions.length]
    members.push(member(id, position))
    ranking.push(rankingRow(id, 40 + index, {
      player_type: isKeeper ? 'GOALKEEPER' : 'FIELD',
      goals: index, assists: Math.floor(index / 2),
      ...(isKeeper ? { gk_matches: 20, gk_saves: 60, gk_conceded: 22, gk_clean_sheets: 5, gk_wins: 11 } : {}),
    }))
  }
  return { members, ranking }
}

function respondWith({ members = [] as Row[], ranking = [] as Row[], failing = '' } = {}) {
  curiosityMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'list_pelada_members') return { data: members, error: null }
    if (fn === 'get_pelada_ranking') return { data: ranking, error: null }
    if (fn === 'get_pelada_settings') return { data: [{ default_format: '7x7', default_team_size: 7, goalkeeper_mode: 'fixed' }], error: null }
    return { data: [], error: null }
  })
}

function renderCuriosities() {
  localStorage.setItem('kickhub-locale', 'pt')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><MemoryRouter><CuriositiesSection/></MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('CuriositiesSection', () => {
  beforeEach(() => {
    localStorage.clear()
    curiosityMocks.context = { pelada, canAdmin: false, slug: pelada.slug, status: 'ready', role: 'player', peladas: [pelada], retry: vi.fn() }
    curiosityMocks.rpc.mockReset()
    respondWith()
  })

  it('monta os três jogos a partir dos dados reais da pelada', async () => {
    respondWith(squad(28))
    renderCuriosities()
    expect(await screen.findByRole('heading', { name: 'O melhor jogo possível' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /duelo dos perebas/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Campeonato imaginário' })).toBeInTheDocument()
    expect(curiosityMocks.rpc).toHaveBeenCalledWith('list_pelada_members', { p_pelada_id: 'pelada-1' })
    expect(curiosityMocks.rpc).toHaveBeenCalledWith('get_pelada_ranking', { p_pelada_id: 'pelada-1' })
  })

  it('a classificação fecha com os jogos que mostrou', async () => {
    respondWith(squad(28))
    const { container } = renderCuriosities()
    await screen.findByRole('heading', { name: 'Campeonato imaginário' })

    const rows = [...container.querySelectorAll('.curiosity-table tbody tr')]
    expect(rows).toHaveLength(4)
    const played = rows.reduce((total, row) => total + Number(row.querySelectorAll('td')[0].textContent), 0)
    // Seis jogos da fase de grupos, dois participantes cada.
    expect(played).toBe(12)
    expect(container.querySelectorAll('.curiosity-fixture')).toHaveLength(7)
    expect(container.querySelector('.curiosity-fixture-final')).toBeInTheDocument()
  })

  it('imaginar outra vez muda os jogos', async () => {
    respondWith(squad(28))
    const { container } = renderCuriosities()
    await screen.findByRole('heading', { name: 'O melhor jogo possível' })

    const scorelines = () => [...container.querySelectorAll('.curiosity-scoreline > strong')]
      .map((node) => node.textContent).join('|')
    const before = scorelines()
    fireEvent.click(screen.getByRole('button', { name: /Imaginar outra vez/ }))
    await waitFor(() => expect(scorelines()).not.toBe(before))
  })

  it('diz quantos faltam em vez de esconder o jogo', async () => {
    respondWith(squad(10))
    renderCuriosities()
    await screen.findByRole('heading', { name: 'O melhor jogo possível' })
    // 7x7 pede 14; há 10 com overall calculado.
    expect(screen.getAllByText(/São precisos 14 jogadores/).length).toBeGreaterThan(0)
  })

  it('não imagina nada sem ninguém com overall calculado', async () => {
    respondWith({ members: squad(28).members, ranking: [] })
    renderCuriosities()
    expect(await screen.findByRole('heading', { name: 'Ainda não há jogos para imaginar.' })).toBeInTheDocument()
  })

  it('diz que falhou em vez de mostrar um jogo inventado', async () => {
    respondWith({ ...squad(28), failing: 'get_pelada_ranking' })
    renderCuriosities()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Não foi possível imaginar os jogos.' })).toBeInTheDocument()
  })
})
