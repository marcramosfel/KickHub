import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import type { MyPlayerProfile } from '../lib/player-profile'
import { ProfilePage } from './ProfilePage'

const mocks = vi.hoisted(() => ({ useMyPlayerProfile: vi.fn() }))

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: { username: 'marcos' } }),
  getAuthAvatarUrl: () => undefined,
}))

vi.mock('../lib/player-profile', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/player-profile')>(),
  useMyPlayerProfile: mocks.useMyPlayerProfile,
}))

const data: MyPlayerProfile = {
  profile: {
    id: 'profile-1', username: 'marcos', displayName: 'Marcos Real', avatarUrl: null,
    avatarPath: null, avatarBucket: null, bio: null,
    countryCode: 'CH', city: 'Zürich', locale: 'pt', timezone: 'Europe/Zurich',
  },
  totals: { peladas: 1, matches: 8, goals: 4, assists: 5, craques: 2 },
  peladas: [{
    id: 'pelada-1', slug: 'browns', name: 'Pelada Browns', city: 'Zürich', countryCode: 'CH', role: 'player',
    membershipId: 'member-1', playerType: 'FIELD', primaryPosition: 'DEF', secondaryPosition: 'MID', memberCount: 30,
    titles: ['topAssists'],
    stats: {
      membershipId: 'member-1', displayName: 'Marcos Real', gamesPlayed: 8, goals: 4, assists: 5, ownGoals: 0,
      saves: 0, wins: 5, draws: 1, losses: 2, isFormer: false, baseRating: 82, postRatingAvg: 4.5,
      postRatingCount: 10, craques: 2, bagres: 0, waeSaldo: .4, waeMatches: 5, currentWinStreak: 2, bestUnbeatenStreak: 4,
      playerType: 'FIELD', avatarPath: null, avatarBucket: null,
      gkMatches: 0, gkSaves: 0, gkConceded: 0, gkCleanSheets: 0, gkWins: 0,
    },
    overall: { overall: 84, provisional: false, parts: [], adjustments: [], version: 2 },
  }],
}

function renderPage() {
  // A página assina a foto do perfil pelo Storage, e isso passa a exigir um
  // cliente de query — o mesmo que a app inteira já tem em `main.tsx`.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/u/marcos']}><I18nProvider><Routes>
      <Route path="/u/:username" element={<ProfilePage/>}/>
    </Routes></I18nProvider></MemoryRouter>
  </QueryClientProvider>)
}

describe('ProfilePage', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.useMyPlayerProfile.mockReset()
  })

  it('mostra os números autenticados e o overall da Browns', () => {
    mocks.useMyPlayerProfile.mockReturnValue({ data, isPending: false, isError: false, refetch: vi.fn() })
    renderPage()

    expect(screen.getByRole('heading', { name: 'Marcos Real' })).toBeInTheDocument()
    expect(screen.getByText('Pelada Browns')).toBeInTheDocument()
    expect(screen.getByText('84')).toBeInTheDocument()
    expect(screen.getAllByText('8')).toHaveLength(2)
    expect(screen.queryByText('overall global')).not.toBeInTheDocument()
  })

  it('não mostra o perfil privado de outro username', () => {
    mocks.useMyPlayerProfile.mockReturnValue({ data, isPending: false, isError: false, refetch: vi.fn() })
    render(<MemoryRouter initialEntries={['/u/outra-pessoa']}><I18nProvider><Routes>
      <Route path="/u/:username" element={<ProfilePage/>}/>
    </Routes></I18nProvider></MemoryRouter>)

    expect(screen.getByRole('heading', { name: /profile|perfil/i })).toBeInTheDocument()
    expect(screen.queryByText('Marcos Real')).not.toBeInTheDocument()
  })
})
