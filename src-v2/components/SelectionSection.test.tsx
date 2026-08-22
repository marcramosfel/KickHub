import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { PlayerCardProvider } from '../lib/player-card'
import type { Pelada } from '../lib/pelada-types'
import { SelectionSection } from './SelectionSection'

const selectionMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => selectionMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: selectionMocks.rpc } }))
vi.mock('../lib/avatars', () => ({ useSignedAvatars: () => new Map<string, string>() }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'player', membership: 'active', joinMode: 'approval', members: 8, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

type Row = Record<string, unknown>

/** Um membro do plantel: é daqui que saem as posições. */
function member(id: string, position: string | null, overrides: Row = {}): Row {
  return {
    membership_id: id, display_name: id, username: id, role: 'player',
    player_type: position === 'GK' ? 'GOALKEEPER' : 'FIELD',
    primary_position: position, secondary_position: null, accepts_other_positions: true,
    overall: null, is_me: false, avatar_path: null, avatar_bucket: null, ...overrides,
  }
}

/**
 * Uma linha de ranking com jogos e avaliação suficientes para o overall deixar
 * de ser provisório — sem isso ninguém entraria na seleção.
 */
function rankingRow(id: string, rating: number, overrides: Row = {}): Row {
  return {
    membership_id: id, display_name: id, games_played: 20, goals: 10, assists: 5, own_goals: 0,
    saves: 0, wins: 12, draws: 4, losses: 4, is_former: false, base_rating: rating,
    post_rating_avg: 4, post_rating_count: 12, craques: 0, bagres: 0, wae_saldo: 1, wae_matches: 20,
    current_win_streak: 1, best_unbeaten_streak: 3, player_type: 'FIELD',
    avatar_path: null, avatar_bucket: null, gk_matches: 0, gk_saves: 0, gk_conceded: 0,
    gk_clean_sheets: 0, gk_wins: 0, ...overrides,
  }
}

function respondWith({ members = [] as Row[], ranking = [] as Row[], failing = '' } = {}) {
  selectionMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'list_pelada_members') return { data: members, error: null }
    if (fn === 'get_pelada_ranking') return { data: ranking, error: null }
    if (fn === 'get_pelada_settings') return { data: [{ default_format: '7x7', default_team_size: 7, goalkeeper_mode: 'fixed' }], error: null }
    return { data: [], error: null }
  })
}

function renderSelection() {
  localStorage.setItem('kickhub-locale', 'pt')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><MemoryRouter>
        {/* O card vive no provedor da pelada, não na secção: é o mesmo que
            abre a partir do ranking, do plantel e do resultado. */}
        <PlayerCardProvider><SelectionSection/></PlayerCardProvider>
      </MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

/** Plantel a sério: guarda-redes, defesas, médios e avançados com nota firme. */
function fullSquad() {
  const rows: [string, string, number][] = [
    ['Rui', 'GK', 80], ['Nuno', 'GK', 40],
    ['Ana', 'DEF', 78], ['Bea', 'DEF', 72], ['Carla', 'DEF', 55],
    ['Dias', 'MID', 76], ['Eva', 'MID', 70], ['Fabio', 'MID', 64], ['Gil', 'MID', 52],
    ['Hugo', 'ATT', 82], ['Ines', 'ATT', 58],
  ]
  return {
    members: rows.map(([id, position]) => member(id, position)),
    ranking: rows.map(([id, position, rating]) => rankingRow(id, rating, {
      player_type: position === 'GK' ? 'GOALKEEPER' : 'FIELD',
      ...(position === 'GK'
        ? { gk_matches: 20, gk_saves: rating, gk_conceded: 20, gk_clean_sheets: 6, gk_wins: 12 }
        : {}),
    })),
  }
}

describe('SelectionSection', () => {
  beforeEach(() => {
    localStorage.clear()
    selectionMocks.context = { pelada, canAdmin: false, slug: pelada.slug, status: 'ready', role: 'player', peladas: [pelada], retry: vi.fn() }
    selectionMocks.rpc.mockReset()
    respondWith()
  })

  it('cruza o plantel com o ranking em vez de inventar o onze', async () => {
    respondWith(fullSquad())
    renderSelection()
    await screen.findByRole('heading', { name: 'Seleção da Pelada', level: 2 })
    expect(selectionMocks.rpc).toHaveBeenCalledWith('list_pelada_members', { p_pelada_id: 'pelada-1' })
    expect(selectionMocks.rpc).toHaveBeenCalledWith('get_pelada_ranking', { p_pelada_id: 'pelada-1' })
  })

  it('mostra a formação da pelada e um lugar por posição', async () => {
    respondWith(fullSquad())
    const { container } = renderSelection()
    await screen.findByRole('heading', { name: 'Seleção da Pelada', level: 2 })
    expect(screen.getByText('Formação 2-3-1')).toBeInTheDocument()
    // 7x7: guarda-redes + seis lugares de campo.
    expect(container.querySelectorAll('.selection-poster .selection-slot')).toHaveLength(7)
  })

  it('a anti-seleção só aparece a pedido', async () => {
    respondWith(fullSquad())
    renderSelection()
    await screen.findByRole('heading', { name: 'Seleção da Pelada', level: 2 })
    expect(screen.queryByRole('heading', { name: 'A Anti-Seleção' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /anti-seleção/i }))
    expect(await screen.findByRole('heading', { name: 'A Anti-Seleção' })).toBeInTheDocument()
  })

  it('assume os lugares vazios quando falta gente', async () => {
    respondWith({
      members: [member('Rui', 'GK'), member('Dias', 'MID')],
      ranking: [
        rankingRow('Rui', 80, { player_type: 'GOALKEEPER', gk_matches: 20, gk_saves: 60, gk_conceded: 20, gk_clean_sheets: 6, gk_wins: 12 }),
        rankingRow('Dias', 76),
      ],
    })
    const { container } = renderSelection()
    await screen.findByRole('heading', { name: 'Seleção da Pelada', level: 2 })
    expect(await screen.findByText(/Faltou gente para 5 lugares/)).toBeInTheDocument()
    expect(container.querySelectorAll('.selection-slot-empty').length).toBe(5)
  })

  it('não monta nada com um plantel sem overall calculado', async () => {
    respondWith({ members: [member('Rui', 'GK'), member('Dias', 'MID')], ranking: [] })
    renderSelection()
    expect(await screen.findByRole('heading', { name: 'Ainda não há onze para discutir.' })).toBeInTheDocument()
  })

  it('diz que falhou em vez de mostrar um onze a meio', async () => {
    respondWith({ ...fullSquad(), failing: 'get_pelada_ranking' })
    renderSelection()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Não foi possível montar a seleção.' })).toBeInTheDocument()
  })

  it('carregar num jogador abre o card dele', async () => {
    respondWith(fullSquad())
    renderSelection()
    await screen.findByRole('heading', { name: 'Seleção da Pelada', level: 2 })

    // O lugar do campo é um botão: chega-lhe o Tab e o Enter, e não só o dedo.
    const slot = await screen.findByRole('button', { name: /Ver o card de Hugo/ })
    fireEvent.click(slot)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Hugo')
  })

  it('o card fecha-se com Escape', async () => {
    respondWith(fullSquad())
    renderSelection()
    await screen.findByRole('heading', { name: 'Seleção da Pelada', level: 2 })

    fireEvent.click(await screen.findByRole('button', { name: /Ver o card de Hugo/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('um lugar vazio não se abre — não há card de ninguém', async () => {
    respondWith({
      members: [member('Rui', 'GK'), member('Dias', 'MID')],
      ranking: [
        rankingRow('Rui', 80, { player_type: 'GOALKEEPER', gk_matches: 20, gk_saves: 60, gk_conceded: 20, gk_clean_sheets: 6, gk_wins: 12 }),
        rankingRow('Dias', 76),
      ],
    })
    const { container } = renderSelection()
    await screen.findByRole('heading', { name: 'Seleção da Pelada', level: 2 })
    const empty = container.querySelector('.selection-slot-empty')
    expect(empty?.tagName).toBe('DIV')
  })
})
