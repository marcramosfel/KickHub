import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../data/demo'
import { I18nProvider } from '../lib/i18n'
import { contribution, toRankingRow, winRate } from '../lib/ranking'
import { RankingSection } from './RankingSection'

const rankMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => rankMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: rankMocks.rpc } }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'owner', membership: 'active', joinMode: 'approval', members: 3, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    membership_id: 'm1', display_name: 'Joana', games_played: 4, goals: 7, assists: 3,
    own_goals: 0, saves: 0, wins: 3, draws: 0, losses: 1, ...overrides,
  }
}

function respondWith({ ranking = [] as unknown[], totals = null as unknown } = {}) {
  rankMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'get_pelada_ranking') return { data: ranking, error: null }
    if (fn === 'get_pelada_totals') return { data: totals ? [totals] : [], error: null }
    return { data: [], error: null }
  })
}

function renderRanking(variant: 'ranking' | 'stats' = 'ranking', locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><MemoryRouter><RankingSection variant={variant}/></MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('cálculos do ranking', () => {
  it('soma golos e assistências como contributo', () => {
    expect(contribution({ goals: 7, assists: 3 })).toBe(10)
  })

  it('devolve null quando não há jogos decididos, em vez de zero por cento', () => {
    expect(winRate({ wins: 0, draws: 0, losses: 0 })).toBeNull()
    expect(winRate({ wins: 3, draws: 0, losses: 1 })).toBe(0.75)
  })

  it('normaliza números que chegam como texto', () => {
    const row = toRankingRow({ membership_id: 'm1', display_name: 'Joana', goals: '7', wins: '2' })
    expect(row.goals).toBe(7)
    expect(row.wins).toBe(2)
    expect(row.saves).toBe(0)
  })
})

describe('RankingSection', () => {
  beforeEach(() => {
    localStorage.clear()
    rankMocks.context = { pelada, isDemo: false, canAdmin: true, slug: pelada.slug, status: 'ready', role: 'owner', peladas: [pelada], retry: vi.fn() }
    rankMocks.rpc.mockReset()
    respondWith()
  })

  it('não consulta o servidor na demonstração', async () => {
    rankMocks.context = { ...rankMocks.context, isDemo: true }
    renderRanking()
    expect(await screen.findByRole('status')).toHaveTextContent('Inicia sessão para ver o ranking real')
    expect(rankMocks.rpc).not.toHaveBeenCalled()
  })

  it('mostra o estado vazio enquanto nenhum jogo terminou', async () => {
    respondWith({ ranking: [makeRow({ games_played: 0, goals: 0, assists: 0, wins: 0, losses: 0 })] })
    renderRanking()
    expect(await screen.findByRole('heading', { name: 'Ainda não há jogos terminados.' })).toBeInTheDocument()
  })

  it('lista os jogadores com jogos, golos e o registo de vitórias', async () => {
    respondWith({ ranking: [makeRow(), makeRow({ membership_id: 'm2', display_name: 'Malik', goals: 2, assists: 5, saves: 9, wins: 1, draws: 1, losses: 2 })] })
    renderRanking()

    expect(await screen.findByText('Joana')).toBeInTheDocument()
    expect(screen.getByText('Malik')).toBeInTheDocument()
    expect(screen.getByText('3-0-1')).toBeInTheDocument()
    expect(screen.getByText('1-1-2')).toBeInTheDocument()
    expect(screen.getByText('75% de vitórias')).toBeInTheDocument()
  })

  it('diz que não há jogos decididos em vez de mostrar zero por cento', async () => {
    respondWith({ ranking: [makeRow({ wins: 0, draws: 0, losses: 0, games_played: 2 })] })
    renderRanking()
    expect(await screen.findByText('Sem jogos decididos')).toBeInTheDocument()
  })

  it('apresenta os totais da comunidade e os destaques', async () => {
    respondWith({
      ranking: [makeRow(), makeRow({ membership_id: 'm2', display_name: 'Malik', goals: 1, assists: 9 })],
      totals: { games_played: 4, goals: 12, assists: 8, active_members: 11 },
    })
    renderRanking('stats')

    expect(await screen.findByText('4 jogos disputados')).toBeInTheDocument()
    expect(screen.getByText('12 golos marcados')).toBeInTheDocument()
    expect(screen.getByText('11 jogadores no plantel')).toBeInTheDocument()
    expect(screen.getByText('Artilheiro')).toBeInTheDocument()
    expect(screen.getByText('Mais assistências')).toBeInTheDocument()
  })

  it('mostra o overall calculado e assinala quando ainda e provisorio', async () => {
    respondWith({ ranking: [
      makeRow({ membership_id: 'm1', display_name: 'Veterana', games_played: 12, goals: 14, wins: 8, losses: 4 }),
      makeRow({ membership_id: 'm2', display_name: 'Novato', games_played: 2, goals: 3, wins: 2, losses: 0 }),
    ] })
    renderRanking()

    await screen.findByText('Veterana')
    // O asterisco marca a amostra curta; a veterana ja nao o tem.
    expect(screen.getByText(/^\d+\*$/)).toBeInTheDocument()
  })

  it('traduz o ranking noutro idioma', async () => {
    respondWith({ ranking: [makeRow()] })
    renderRanking('ranking', 'de')
    // Espera pela tabela: o cabeçalho existe antes de a resposta chegar.
    expect(await screen.findByText('S-U-N')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Rangliste' })).toBeInTheDocument()
  })

  /**
   * Quem sai da pelada continua no ranking: os golos que marcou aconteceram.
   * Esconde-los fazia com que as linhas deixassem de somar o total mostrado
   * no mesmo ecrã.
   */
  it('mantém quem saiu, marcado como antigo membro', async () => {
    respondWith({ ranking: [
      makeRow(),
      makeRow({ membership_id: 'm2', display_name: 'Nuno', goals: 3, is_former: true }),
    ] })
    renderRanking()

    expect(await screen.findByText('Nuno')).toBeInTheDocument()
    expect(screen.getByText('ex-membro')).toBeInTheDocument()
  })

  /**
   * O destaque e a tabela leem a mesma linha. Sem a marca nos dois sitios, o
   * mesmo ecra dava alguem como artilheiro da pelada duas linhas abaixo de o
   * ter dado como ex-membro.
   */
  it('marca quem saiu tambem nos destaques', async () => {
    respondWith({
      ranking: [makeRow({ membership_id: 'm2', display_name: 'Nuno', goals: 9, assists: 9, is_former: true })],
    })
    renderRanking('stats')

    // A tabela não existe nesta vista: as três marcas são as dos destaques —
    // artilheiro, assistências e contributo.
    expect(await screen.findAllByText('ex-membro')).toHaveLength(3)
  })
})
