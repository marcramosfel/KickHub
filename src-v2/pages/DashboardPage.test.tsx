import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../lib/pelada-types'
import { I18nProvider } from '../lib/i18n'
import { DashboardPage } from './DashboardPage'

const dashboardMocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
}))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'owner@example.com' }, profile: { display_name: 'Marcos Owner' } }),
  getAuthDisplayName: () => 'Marcos Owner',
}))

vi.mock('../lib/peladas', () => ({
  useMyPeladas: () => dashboardMocks.query,
}))

const realPelada: Pelada = {
  id: 'pelada-1', slug: 'futebol-sextas', name: 'Futebol das Sextas', city: 'Porto', country: 'PT',
  role: 'owner', membership: 'active', joinMode: 'approval', members: 1, nextMatch: 'Primeiro jogo por marcar',
  accent: '#d8ff45', visibility: 'private', description: 'Comunidade real',
}

function renderDashboard(path = '/app') {
  return render(<I18nProvider><MemoryRouter initialEntries={[path]}><DashboardPage/></MemoryRouter></I18nProvider>)
}

describe('DashboardPage autoritativa', () => {
  beforeEach(() => {
    localStorage.setItem('kickhub-locale', 'pt')
    dashboardMocks.query = { data: [], isPending: false, isError: false, refetch: vi.fn() }
  })

  it('mostra o estado vazio real sem fixtures Browns', () => {
    renderDashboard()
    expect(screen.getByRole('heading', { name: 'A tua primeira pelada começa aqui.' })).toBeInTheDocument()
    expect(screen.queryByText(/Pelada Browns/)).not.toBeInTheDocument()
  })

  it('renderiza memberships devolvidas pelo read model', () => {
    dashboardMocks.query = { data: [realPelada], isPending: false, isError: false, refetch: vi.fn() }
    renderDashboard('/app?created=Futebol%20das%20Sextas')
    expect(screen.getAllByText('Futebol das Sextas').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OWNER')).not.toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('já faz parte das tuas peladas')
  })

  it('permite tentar novamente quando o read model falha', () => {
    const refetch = vi.fn()
    dashboardMocks.query = { data: undefined, isPending: false, isError: true, refetch }
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
