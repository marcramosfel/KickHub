import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from '../data/demo'
import { canAdministerPelada, CurrentPeladaProvider, resolvePeladaStatus, useCurrentPelada } from './current-pelada'

const contextMocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  query: {} as Record<string, unknown>,
}))

vi.mock('./auth', () => ({ useAuth: () => ({ user: contextMocks.user, profile: null }) }))
vi.mock('./peladas', () => ({ useMyPeladas: () => contextMocks.query }))

const adminPelada: Pelada = {
  id: 'pelada-2', slug: 'quinta-brava', name: 'Quinta Brava', city: 'Lisboa', country: 'PT',
  role: 'admin', membership: 'active', joinMode: 'approval', members: 12, nextMatch: '',
  accent: '#72d8ff', visibility: 'public', description: 'Comunidade real',
}

function Probe() {
  const { pelada, slug, status, canAdmin, role, peladas, isDemo } = useCurrentPelada()
  return <dl>
    <dd data-testid="slug">{slug}</dd>
    <dd data-testid="status">{status}</dd>
    <dd data-testid="name">{pelada?.name ?? '—'}</dd>
    <dd data-testid="role">{role ?? '—'}</dd>
    <dd data-testid="can-admin">{String(canAdmin)}</dd>
    <dd data-testid="count">{peladas.length}</dd>
    <dd data-testid="demo">{String(isDemo)}</dd>
  </dl>
}

function renderProbe(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/p/:slug/:section?" element={<CurrentPeladaProvider><Probe/></CurrentPeladaProvider>}/></Routes>
    </MemoryRouter>,
  )
}

describe('resolvePeladaStatus', () => {
  it('prioriza o carregamento e o erro do read model sobre a ausência de membership', () => {
    expect(resolvePeladaStatus({ isDemo: false, isPending: true, isError: false, found: false })).toBe('loading')
    expect(resolvePeladaStatus({ isDemo: false, isPending: false, isError: true, found: false })).toBe('error')
    expect(resolvePeladaStatus({ isDemo: false, isPending: false, isError: false, found: false })).toBe('missing')
    expect(resolvePeladaStatus({ isDemo: false, isPending: false, isError: false, found: true })).toBe('ready')
  })

  it('ignora o estado da query quando a demonstração está ativa', () => {
    expect(resolvePeladaStatus({ isDemo: true, isPending: true, isError: true, found: true })).toBe('ready')
    expect(resolvePeladaStatus({ isDemo: true, isPending: true, isError: true, found: false })).toBe('missing')
  })
})

describe('canAdministerPelada', () => {
  it('nunca concede administração a uma sessão demonstrativa', () => {
    expect(canAdministerPelada(true, 'owner')).toBe(false)
    expect(canAdministerPelada(true, 'admin')).toBe(false)
  })

  it('concede administração apenas a owners e admins autenticados', () => {
    expect(canAdministerPelada(false, 'owner')).toBe(true)
    expect(canAdministerPelada(false, 'admin')).toBe(true)
    expect(canAdministerPelada(false, 'player')).toBe(false)
  })
})

describe('useCurrentPelada', () => {
  beforeEach(() => {
    contextMocks.user = null
    contextMocks.query = { data: undefined, isPending: false, isError: false, refetch: vi.fn() }
  })

  it('resolve a pelada demonstrativa a partir do slug da rota', () => {
    renderProbe('/p/limmat-united')
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(screen.getByTestId('name')).toHaveTextContent('Limmat United')
    expect(screen.getByTestId('role')).toHaveTextContent('player')
    expect(screen.getByTestId('can-admin')).toHaveTextContent('false')
    expect(screen.getByTestId('demo')).toHaveTextContent('true')
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('trata a Browns demonstrativa como jogador sem poderes administrativos', () => {
    renderProbe('/p/browns/admin')
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(screen.getByTestId('role')).toHaveTextContent('player')
    expect(screen.getByTestId('can-admin')).toHaveTextContent('false')
    expect(screen.getByTestId('demo')).toHaveTextContent('true')
  })

  it('deriva as permissões da membership devolvida pelo read model', () => {
    contextMocks.user = { id: 'user-1' }
    contextMocks.query = { data: [adminPelada], isPending: false, isError: false, refetch: vi.fn() }
    renderProbe('/p/quinta-brava/ranking')
    expect(screen.getByTestId('slug')).toHaveTextContent('quinta-brava')
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(screen.getByTestId('role')).toHaveTextContent('admin')
    expect(screen.getByTestId('can-admin')).toHaveTextContent('true')
    expect(screen.getByTestId('demo')).toHaveTextContent('false')
  })

  it('não recorre às fixtures quando a conta não possui a membership', () => {
    contextMocks.user = { id: 'user-1' }
    contextMocks.query = { data: [adminPelada], isPending: false, isError: false, refetch: vi.fn() }
    renderProbe('/p/browns')
    expect(screen.getByTestId('status')).toHaveTextContent('missing')
    expect(screen.getByTestId('name')).toHaveTextContent('—')
    expect(screen.getByTestId('can-admin')).toHaveTextContent('false')
  })

  it('expõe uma nova tentativa ligada ao read model', () => {
    const refetch = vi.fn()
    contextMocks.user = { id: 'user-1' }
    contextMocks.query = { data: undefined, isPending: false, isError: true, refetch }
    function RetryProbe() {
      const { status, retry } = useCurrentPelada()
      return <button type="button" onClick={retry}>{status}</button>
    }
    render(
      <MemoryRouter initialEntries={['/p/quinta-brava']}>
        <Routes><Route path="/p/:slug/:section?" element={<CurrentPeladaProvider><RetryProbe/></CurrentPeladaProvider>}/></Routes>
      </MemoryRouter>,
    )
    screen.getByRole('button', { name: 'error' }).click()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('falha explicitamente fora do provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe/>)).toThrow('useCurrentPelada precisa de CurrentPeladaProvider')
    consoleError.mockRestore()
  })
})
