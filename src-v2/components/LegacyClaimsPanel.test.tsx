import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { LegacyClaimsPanel } from './LegacyClaimsPanel'

const mocks = vi.hoisted(() => ({ issue: vi.fn(), issueAll: vi.fn(), revoke: vi.fn(), refetch: vi.fn() }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/legacy-claim', () => ({
  useLegacyClaimCandidates: () => ({
    data: [{ membershipId: 'membership-1', profileId: 'profile-1', displayName: 'João Browns', nickname: null,
      hasAccount: false, state: 'none', createdAt: null, expiresAt: null, reason: null }],
    isPending: false, isError: false, refetch: mocks.refetch,
  }),
  useIssueLegacyClaim: () => ({ mutateAsync: mocks.issue, isPending: false }),
  useIssueLegacyClaimsForPelada: () => ({ mutateAsync: mocks.issueAll, isPending: false }),
  useRevokeLegacyClaim: () => ({ mutateAsync: mocks.revoke, isPending: false }),
  claimUrl: (code: string) => `${window.location.origin}/reclamar/${code}`,
}))

describe('LegacyClaimsPanel', () => {
  beforeEach(() => {
    localStorage.setItem('kickhub-locale', 'pt')
    mocks.issue.mockReset(); mocks.issue.mockResolvedValue('ABCD-EF01-2345-6789-ABCD-EF01-2345-6789')
    mocks.issueAll.mockReset()
  })

  it('emite e mostra o link uma única vez no estado local', async () => {
    render(<I18nProvider><LegacyClaimsPanel peladaId="pelada-1"/></I18nProvider>)
    fireEvent.change(screen.getByLabelText('Jogador Browns'), { target: { value: 'membership-1' } })
    fireEvent.change(screen.getByLabelText('Motivo auditável'), { target: { value: 'identidade confirmada' } })
    fireEvent.click(screen.getByRole('button', { name: /Emitir código/ }))
    await waitFor(() => expect(mocks.issue).toHaveBeenCalledWith({ membershipId: 'membership-1', reason: 'identidade confirmada' }))
    // O que se mostra é o link, e não o código cru: é o link que se envia, e
    // poupar a quem o recebe o passo de colar é o objectivo de existir link.
    expect(await screen.findByText(
      `${window.location.origin}/reclamar/ABCD-EF01-2345-6789-ABCD-EF01-2345-6789`,
    )).toBeInTheDocument()
    expect(screen.getByText(/única vez que aparece/)).toBeInTheDocument()
  })

  it('emite para o plantel todo e lista um link por jogador', async () => {
    mocks.issueAll.mockResolvedValue([
      { membershipId: 'm-1', displayName: 'Favela', url: 'https://kickhub.test/reclamar/AAAA' },
      { membershipId: 'm-2', displayName: 'Dudu', url: 'https://kickhub.test/reclamar/BBBB' },
    ])
    render(<I18nProvider><LegacyClaimsPanel peladaId="pelada-1"/></I18nProvider>)
    fireEvent.click(screen.getByRole('button', { name: /Emitir para todos/ }))

    // Um link por pessoa, e o nome ao lado: sem o nome, a lista não se
    // distribui — ninguém sabe qual dos trinta links é de quem.
    expect(await screen.findByText('https://kickhub.test/reclamar/AAAA')).toBeInTheDocument()
    expect(screen.getByText('Favela')).toBeInTheDocument()
    expect(screen.getByText('https://kickhub.test/reclamar/BBBB')).toBeInTheDocument()
    expect(screen.getByText('Dudu')).toBeInTheDocument()
  })
})
