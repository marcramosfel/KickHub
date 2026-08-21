import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PRIVACY, exportFileName, reportContent, toPrivacyPayload,
  toPrivacySettings, updateMyPrivacy,
} from './account'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: mocks.rpc, from: mocks.from },
}))

describe('privacidade', () => {
  it('o que o servidor não disser fica na opção mais fechada', () => {
    expect(toPrivacySettings({})).toEqual(DEFAULT_PRIVACY)
    expect(toPrivacySettings(null)).toEqual(DEFAULT_PRIVACY)
  })

  it('mostrar a cidade exige um sim explícito', () => {
    expect(toPrivacySettings({ show_city: true }).showCity).toBe(true)
    // Ausente e nulo são a mesma coisa: ninguém escolheu.
    expect(toPrivacySettings({}).showCity).toBe(false)
    expect(toPrivacySettings({ show_city: null }).showCity).toBe(false)
  })

  it('aceitar convites mantém-se ligado até alguém o desligar', () => {
    expect(toPrivacySettings({}).acceptInvites).toBe(true)
    expect(toPrivacySettings({ accept_invites: false }).acceptInvites).toBe(false)
  })

  it('uma visibilidade que não existe cai na fechada e não na aberta', () => {
    expect(toPrivacySettings({ profile: 'toda-a-gente' }).profile).toBe('members')
  })

  it('lê as três visibilidades reais', () => {
    const settings = toPrivacySettings({ profile: 'public', stats: 'private', show_peladas: 'public' })
    expect(settings).toMatchObject({ profile: 'public', stats: 'private', showPeladas: 'public' })
  })

  it('escreve de volta no formato que o servidor conhece', () => {
    expect(toPrivacyPayload(DEFAULT_PRIVACY)).toEqual({
      profile: 'members', stats: 'members', show_city: false,
      show_peladas: 'members', accept_invites: true,
    })
  })

  it('a ida e a volta não perdem nada', () => {
    const settings = { ...DEFAULT_PRIVACY, profile: 'public' as const, showCity: true }
    expect(toPrivacySettings(toPrivacyPayload(settings))).toEqual(settings)
  })

  it('guarda pelo RPC e devolve o que o servidor aceitou', async () => {
    mocks.rpc.mockResolvedValue({ data: { profile: 'public' }, error: null })
    await expect(updateMyPrivacy({ ...DEFAULT_PRIVACY, profile: 'public' }))
      .resolves.toMatchObject({ profile: 'public' })
    expect(mocks.rpc).toHaveBeenCalledWith('update_my_privacy', {
      p_privacy: expect.objectContaining({ profile: 'public' }),
    })
  })
})

describe('exportação', () => {
  it('o ficheiro leva a data, para não ser um ficheiro sem contexto', () => {
    expect(exportFileName(new Date('2026-08-22T10:00:00Z'))).toBe('kickhub-dados-2026-08-22.json')
  })
})

describe('denúncias', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('envia a denúncia com o motivo escolhido', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'r-1', already_open: false }, error: null })
    await expect(reportContent('pelada', 'p-1', 'spam', '  demasiadas mensagens  '))
      .resolves.toEqual({ id: 'r-1', alreadyOpen: false })
    expect(mocks.rpc).toHaveBeenCalledWith('report_content', {
      p_subject_type: 'pelada', p_subject_id: 'p-1',
      p_reason: 'spam', p_detail: 'demasiadas mensagens',
    })
  })

  it('repetir uma denúncia aberta não é um erro', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: null, already_open: true }, error: null })
    await expect(reportContent('profile', 'u-1', 'abuse'))
      .resolves.toEqual({ id: null, alreadyOpen: true })
  })

  it('propaga a recusa do servidor', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'AUTH_REQUIRED' } })
    await expect(reportContent('profile', 'u-1', 'other')).rejects.toBeTruthy()
  })
})
