import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMyPlayerProfile, toMyPlayerProfile } from './player-profile'

const supabaseMocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: supabaseMocks.rpc },
}))

const payload = {
  profile: {
    id: 'profile-1', username: 'marcos', display_name: 'Marcos Ramos', avatar_path: 'https://img.test/a.png',
    bio: 'Defesa e médio.', country_code: 'CH', city: 'Zürich', locale: 'pt', timezone: 'Europe/Zurich',
  },
  peladas: [{
    id: 'pelada-1', slug: 'browns', name: 'Pelada Browns', city: 'Zürich', country_code: 'CH', role: 'admin',
    membership_id: 'member-1', player_type: 'FIELD', primary_position: 'DEF', secondary_position: 'MID', member_count: 30,
    stats: {
      membership_id: 'member-1', display_name: 'Marcos Ramos', games_played: 8, goals: 4, assists: 5,
      own_goals: 0, saves: 0, wins: 5, draws: 1, losses: 2, is_former: false, base_rating: 82,
      post_rating_avg: 4.5, post_rating_count: 10, craques: 2, bagres: 0, wae_saldo: 0.4, wae_matches: 5,
      current_win_streak: 3, gk_matches: 0, gk_saves: 0, gk_conceded: 0, gk_clean_sheets: 0, gk_win_points: 0,
      titles: ['topAssists', 'winStreak'], gk_league_conceded_per_game: null,
    },
  }],
}

describe('perfil global do jogador', () => {
  beforeEach(() => supabaseMocks.rpc.mockReset())

  it('mapeia identidade, números por pelada e o overall explicável', () => {
    const result = toMyPlayerProfile(payload)

    expect(result.profile).toMatchObject({ username: 'marcos', displayName: 'Marcos Ramos', city: 'Zürich' })
    expect(result.totals).toEqual({ peladas: 1, matches: 8, goals: 4, assists: 5, craques: 2 })
    expect(result.peladas[0]).toMatchObject({ slug: 'browns', role: 'admin', titles: ['topAssists', 'winStreak'] })
    expect(result.peladas[0].overall?.overall).toBeGreaterThan(0)
    expect(result.peladas[0].overall?.parts.reduce((sum, part) => sum + part.weight, 0)).toBeCloseTo(1)
  })

  it('consulta somente o read model derivado da sessão', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: payload, error: null })

    await expect(getMyPlayerProfile()).resolves.toMatchObject({ totals: { matches: 8 } })
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('get_my_player_profile')
  })
})
