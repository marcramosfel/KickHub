import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pelada } from './pelada-types'
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
  const { pelada, slug, status, canAdmin, role, peladas } = useCurrentPelada()
  return <dl>
    <dd data-testid="slug">{slug}</dd>
    <dd data-testid="status">{status}</dd>
    <dd data-testid="name">{pelada?.name ?? '—'}</dd>
    <dd data-testid="role">{role ?? '—'}</dd>
    <dd data-testid="can-admin">{String(canAdmin)}</dd>
    <dd data-testid="count">{peladas.length}</dd>
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
    expect(resolvePeladaStatus({ isPending: true, isError: false, found: false })).toBe('loading')
    expect(resolvePeladaStatus({ isPending: false, isError: true, found: false })).toBe('error')
    expect(resolvePeladaStatus({ isPending: false, isError: false, found: false })).toBe('missing')
    expect(resolvePeladaStatus({ isPending: false, isError: false, found: true })).toBe('ready')
  })
})

describe('canAdministerPelada', () => {
  it('concede administração apenas a owners e admins', () => {
    expect(canAdministerPelada('owner')).toBe(true)
    expect(canAdministerPelada('admin')).toBe(true)
    expect(canAdministerPelada('player')).toBe(false)
  })
})

describe('useCurrentPelada', () => {
  beforeEach(() => {
    contextMocks.user = null
    contextMocks.query = { data: undefined, isPending: false, isError: false, refetch: vi.fn() }
  })

  it('não cria memberships quando não há dados reais', () => {
    renderProbe('/p/limmat-united')
    expect(screen.getByTestId('status')).toHaveTextContent('missing')
    expect(screen.getByTestId('name')).toHaveTextContent('—')
    expect(screen.getByTestId('role')).toHaveTextContent('—')
    expect(screen.getByTestId('can-admin')).toHaveTextContent('false')
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  it('deriva as permissões da membership devolvida pelo read model', () => {
    contextMocks.user = { id: 'user-1' }
    contextMocks.query = { data: [adminPelada], isPending: false, isError: false, refetch: vi.fn() }
    renderProbe('/p/quinta-brava/ranking')
    expect(screen.getByTestId('slug')).toHaveTextContent('quinta-brava')
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(screen.getByTestId('role')).toHaveTextContent('admin')
    expect(screen.getByTestId('can-admin')).toHaveTextContent('true')
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
