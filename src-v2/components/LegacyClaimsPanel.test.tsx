import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { LegacyClaimsPanel } from './LegacyClaimsPanel'

const mocks = vi.hoisted(() => ({ issue: vi.fn(), revoke: vi.fn(), refetch: vi.fn() }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))
vi.mock('../lib/legacy-claim', () => ({
  useLegacyClaimCandidates: () => ({
    data: [{ membershipId: 'membership-1', profileId: 'profile-1', displayName: 'João Browns', nickname: null,
      hasAccount: false, state: 'none', createdAt: null, expiresAt: null, reason: null }],
    isPending: false, isError: false, refetch: mocks.refetch,
  }),
  useIssueLegacyClaim: () => ({ mutateAsync: mocks.issue, isPending: false }),
  useRevokeLegacyClaim: () => ({ mutateAsync: mocks.revoke, isPending: false }),
}))

describe('LegacyClaimsPanel', () => {
  beforeEach(() => {
    localStorage.setItem('kickhub-locale', 'pt')
    mocks.issue.mockReset(); mocks.issue.mockResolvedValue('ABCD-EF01-2345-6789-ABCD-EF01-2345-6789')
  })

  it('emite e mostra o código uma única vez no estado local', async () => {
    render(<I18nProvider><LegacyClaimsPanel peladaId="pelada-1"/></I18nProvider>)
    fireEvent.change(screen.getByLabelText('Jogador Browns'), { target: { value: 'membership-1' } })
    fireEvent.change(screen.getByLabelText('Motivo auditável'), { target: { value: 'identidade confirmada' } })
    fireEvent.click(screen.getByRole('button', { name: /Emitir código/ }))
    await waitFor(() => expect(mocks.issue).toHaveBeenCalledWith({ membershipId: 'membership-1', reason: 'identidade confirmada' }))
    expect(await screen.findByText('ABCD-EF01-2345-6789-ABCD-EF01-2345-6789')).toBeInTheDocument()
    expect(screen.getByText(/única vez que o código é mostrado/)).toBeInTheDocument()
  })
})
