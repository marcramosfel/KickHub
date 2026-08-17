import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../lib/pelada-types'
import { I18nProvider } from '../lib/i18n'
import { PeladaSettingsForm } from './PeladaSettingsForm'

const settingsMocks = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  rpc: vi.fn(),
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/current-pelada', () => ({ useCurrentPelada: () => settingsMocks.context }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: settingsMocks.rpc } }))

const pelada: Pelada = {
  id: 'pelada-1', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'owner', membership: 'active', joinMode: 'approval', members: 2, nextMatch: '',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Quinta Brava',
    slug: 'quinta-brava',
    description: 'Todas as quintas às 20h',
    visibility: 'private',
    join_mode: 'approval',
    default_format: '7x7',
    default_team_size: 7,
    frequency: 'weekly',
    goalkeeper_mode: 'fixed',
    ratings_enabled: true,
    awards_enabled: true,
    ...overrides,
  }
}

function respondWith({ settings = makeSettings(), failing = '' } = {}) {
  settingsMocks.rpc.mockImplementation(async (fn: string) => {
    if (fn === failing) return { data: null, error: { message: 'denied' } }
    if (fn === 'get_pelada_admin_settings') return { data: [settings], error: null }
    return { data: {}, error: null }
  })
}

function renderForm(locale = 'pt') {
  localStorage.setItem('kickhub-locale', locale)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><PeladaSettingsForm/></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('PeladaSettingsForm', () => {
  beforeEach(() => {
    localStorage.clear()
    settingsMocks.context = { pelada, isDemo: false, canAdmin: true, role: 'owner', status: 'ready' }
    settingsMocks.rpc.mockReset()
    respondWith()
  })

  it('carrega sempre as definições reais', async () => {
    renderForm()
    expect(await screen.findByLabelText('Nome da pelada')).toHaveValue('Quinta Brava')
    expect(settingsMocks.rpc).toHaveBeenCalledWith('get_pelada_admin_settings', { p_pelada_id: 'pelada-1' })
  })

  it('preenche o formulário com o que está gravado', async () => {
    renderForm()
    expect(await screen.findByLabelText('Nome da pelada')).toHaveValue('Quinta Brava')
    expect(screen.getByLabelText('Quem vê a pelada')).toHaveValue('private')
    expect(screen.getByLabelText('Guarda-redes')).toHaveValue('fixed')
    expect(screen.getByLabelText('Notas depois do jogo')).toBeChecked()
  })

  /**
   * O endereço é o que já circula nos convites. Se algum dia deixar de ser só
   * de leitura, este teste falha antes de alguém partir os links enviados.
   */
  it('mostra o endereço mas não o deixa mudar', async () => {
    renderForm()
    const slug = await screen.findByLabelText('Endereço')
    expect(slug).toHaveValue('/p/quinta-brava')
    expect(slug).toHaveAttribute('readonly')
  })

  it('grava identidade e regras de jogo', async () => {
    renderForm()

    fireEvent.change(await screen.findByLabelText('Nome da pelada'), { target: { value: 'Quinta Nova' } })
    fireEvent.change(screen.getByLabelText('Quem vê a pelada'), { target: { value: 'public' } })
    fireEvent.change(screen.getByLabelText('Guarda-redes'), { target: { value: 'rotating' } })
    fireEvent.change(screen.getByLabelText('Jogadores por equipa'), { target: { value: '5' } })
    fireEvent.click(screen.getByLabelText('Prémios e destaques'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar definições' }))

    await waitFor(() => expect(settingsMocks.rpc).toHaveBeenCalledWith('update_pelada_identity', {
      p_pelada_id: 'pelada-1',
      p_name: 'Quinta Nova',
      p_description: 'Todas as quintas às 20h',
      p_visibility: 'public',
      p_join_mode: 'approval',
    }))
    expect(settingsMocks.rpc).toHaveBeenCalledWith('update_pelada_settings', expect.objectContaining({
      p_goalkeeper_mode: 'rotating',
      p_default_team_size: 5,
      p_awards_enabled: false,
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Definições guardadas')
  })

  it('explica quando o servidor recusa a gravação', async () => {
    respondWith({ failing: 'update_pelada_identity' })
    renderForm()

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar definições' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar')
  })

  /**
   * A gravação são duas RPCs em série. Se a segunda falhar, a mensagem tem de
   * dizer que falhou — dar por guardado o que ficou meio gravado seria pior do
   * que o próprio erro.
   */
  it('não dá por guardado quando só a segunda chamada falha', async () => {
    respondWith({ failing: 'update_pelada_settings' })
    renderForm()

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar definições' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar')
    expect(screen.queryByText('Definições guardadas.')).not.toBeInTheDocument()
  })

  it('recupera de uma leitura falhada', async () => {
    respondWith({ failing: 'get_pelada_admin_settings' })
    renderForm()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não conseguimos carregar as definições')
  })

  it('traduz as definições noutro idioma', async () => {
    renderForm('de')
    expect(await screen.findByLabelText('Name der Gruppe')).toHaveValue('Quinta Brava')
    expect(screen.getByRole('button', { name: 'Einstellungen speichern' })).toBeInTheDocument()
  })
})
