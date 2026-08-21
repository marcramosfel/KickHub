import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { AppShell } from './AppShell'

const shellMocks = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'marcos@example.test' } as { id: string; email: string } | null,
}))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: shellMocks.user, profile: { display_name: 'Marcos', username: 'marcos' }, signOut: vi.fn() }),
  getAuthDisplayName: () => 'Marcos',
  getAuthAvatarUrl: () => undefined,
  getAuthAvatarObject: () => ({ id: 'me', path: null, bucket: null }),
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
  },
}))

function renderShell() {
  localStorage.setItem('kickhub-locale', 'pt')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider><MemoryRouter><AppShell/></MemoryRouter></I18nProvider>
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear()
    shellMocks.user = { id: 'user-1', email: 'marcos@example.test' }
  })

  /**
   * A barra superior está escondida por CSS em desktop e a barra lateral em
   * mobile. O jsdom não carrega a folha de estilos, portanto nenhum teste
   * consegue ver qual das duas está visível — só se pode exigir que os
   * controlos existam nas duas, que foi o que faltou e deixou o desktop sem
   * seletor de idioma, sem tema e sem notificações.
   */
  it('repete os controlos na barra lateral e na barra superior', () => {
    const { container } = renderShell()

    for (const regiao of ['.sidebar-actions', '.topbar-actions']) {
      const area = container.querySelector(regiao)
      expect(area, `${regiao} deve existir`).not.toBeNull()
      expect(area!.querySelector('.notification-bell'), `${regiao} sem sino`).not.toBeNull()
      expect(area!.querySelector('.locale-select'), `${regiao} sem seletor de idioma`).not.toBeNull()
    }
  })

  it('não deixa nenhum destino móvel fora da navegação principal', () => {
    renderShell()
    const principal = screen.getByRole('navigation', { name: 'Navegação principal' })
    const movel = screen.getByRole('navigation', { name: 'Navegação móvel' })

    const destinos = (root: HTMLElement) => [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    // A barra de baixo é um subconjunto, e não uma cópia: cabem-lhe quatro
    // lugares. O que não pode acontecer é o contrário — algo alcançável no
    // telemóvel e desaparecido no ecrã grande.
    expect(destinos(principal)).toEqual(expect.arrayContaining(destinos(movel)))
    expect(destinos(movel)).toContain('/descobrir')
  })

  it('a conta vive na navegação principal, onde se entra de propósito', () => {
    renderShell()
    const principal = screen.getByRole('navigation', { name: 'Navegação principal' })
    const movel = screen.getByRole('navigation', { name: 'Navegação móvel' })
    const destinos = (root: HTMLElement) => [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))

    expect(destinos(principal)).toContain('/conta')
    expect(destinos(movel)).not.toContain('/conta')
  })

  it('mantém a ligação para saltar directamente ao conteúdo', () => {
    renderShell()
    expect(screen.getByRole('link', { name: 'Saltar para o conteúdo' })).toHaveAttribute('href', '#main-content')
  })
})
