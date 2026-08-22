import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { ProfileForm, saveProfile, validateProfile, type ProfileFormState } from './ProfileForm'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: mocks.rpc } }))
vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    profile: {
      id: 'p-1', username: 'marcos', display_name: 'Marcos Real',
      bio: 'Joga à sexta', city: 'Zürich', country_code: 'CH', locale: 'pt',
    },
  }),
}))

const form = (overrides: Partial<ProfileFormState> = {}): ProfileFormState => ({
  displayName: 'Marcos Real', username: 'marcos', bio: '', city: 'Zürich',
  countryCode: 'CH', locale: 'pt', ...overrides,
})

describe('validateProfile', () => {
  it('aceita um perfil normal', () => {
    expect(validateProfile(form())).toBeNull()
  })

  it('recusa um nome curto de mais', () => {
    expect(validateProfile(form({ displayName: 'M' }))).toBe('profileForm.errorName')
  })

  it('recusa um @ com maiúsculas ou espaços', () => {
    expect(validateProfile(form({ username: 'Marcos Real' }))).toBe('profileForm.errorUsername')
  })

  it('deixa o @ em branco: nem toda a gente escolheu um', () => {
    expect(validateProfile(form({ username: '' }))).toBeNull()
  })

  it('recusa uma bio maior do que o que a base aceita', () => {
    expect(validateProfile(form({ bio: 'x'.repeat(501) }))).toBe('profileForm.errorBio')
  })

  it('recusa um país que não são duas letras', () => {
    expect(validateProfile(form({ countryCode: 'SUI' }))).toBe('profileForm.errorCountry')
  })
})

describe('saveProfile', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({ data: { username: 'marcos' }, error: null })
  })

  it('normaliza o @ e o país antes de os enviar', async () => {
    await saveProfile(form({ username: '  MARCOS  ', countryCode: 'ch' }))
    expect(mocks.rpc).toHaveBeenCalledWith('update_my_profile', expect.objectContaining({
      p_username: 'marcos', p_country_code: 'CH',
    }))
  })

  it('uma bio vazia é apagar, e não deixar como está', async () => {
    await saveProfile(form({ bio: '' }))
    // `null` diria ao servidor para não mexer; a string vazia é a intenção.
    expect(mocks.rpc.mock.calls[0][1].p_bio).toBe('')
  })

  it('propaga a recusa em vez de fingir sucesso', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'USERNAME_TAKEN' } })
    await expect(saveProfile(form())).rejects.toBeTruthy()
  })
})

function renderForm() {
  localStorage.setItem('kickhub-locale', 'pt')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}><I18nProvider><ProfileForm/></I18nProvider></QueryClientProvider>,
  )
}

describe('ProfileForm', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValue({ data: { username: 'marcos' }, error: null })
  })

  it('arranca já com o que o perfil tem, e não vazio', () => {
    renderForm()
    expect(screen.getByLabelText(/Nome$/)).toHaveValue('Marcos Real')
    expect(screen.getByLabelText(/Nome de utilizador/)).toHaveValue('marcos')
    expect(screen.getByLabelText(/Cidade/)).toHaveValue('Zürich')
  })

  it('guarda o que foi mudado', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Nome$/), { target: { value: 'Marcos Ramos' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Perfil actualizado.'))
    expect(mocks.rpc).toHaveBeenCalledWith('update_my_profile', expect.objectContaining({
      p_display_name: 'Marcos Ramos',
    }))
  })

  it('diz que o @ já é de outra pessoa, e não uma mensagem da base de dados', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'USERNAME_TAKEN' } })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('já é de outra pessoa'))
  })

  it('não vai ao servidor com um @ que já se sabe inválido', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Nome de utilizador/), { target: { value: 'a b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
