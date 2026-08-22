import { Check, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/telemetry'
import type { Locale } from '../i18n/types'
import { Button, Card } from './ui'

/**
 * Editar o próprio perfil.
 *
 * Não existia. Dava para ver o perfil e não dava para lhe mexer — nem ao nome,
 * nem ao `@`, nem à cidade. Isto é o formulário que faltava.
 *
 * A validação está aqui e no servidor, e não é duplicação inútil: aqui evita
 * uma ida ao servidor para dizer o óbvio, e lá é a única que conta, porque a
 * unicidade do `@` não se verifica num browser.
 */
export type ProfileFormState = {
  displayName: string
  username: string
  bio: string
  city: string
  countryCode: string
  locale: Locale
}

const locales: readonly Locale[] = ['pt', 'en', 'es', 'fr', 'de']
const localeNames: Record<Locale, string> = {
  pt: 'Português', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
}

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/

/** As mesmas regras do servidor. A chave devolvida é a que a interface traduz. */
export function validateProfile(form: ProfileFormState): TranslationKey | null {
  const name = form.displayName.trim()
  if (name.length < 2 || name.length > 60) return 'profileForm.errorName'
  const username = form.username.trim().toLowerCase()
  if (username && !USERNAME_PATTERN.test(username)) return 'profileForm.errorUsername'
  if (form.bio.length > 500) return 'profileForm.errorBio'
  const country = form.countryCode.trim().toUpperCase()
  if (country && !/^[A-Z]{2}$/.test(country)) return 'profileForm.errorCountry'
  return null
}

export async function saveProfile(form: ProfileFormState) {
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_display_name: form.displayName.trim(),
    p_username: form.username.trim().toLowerCase() || null,
    // Vazio é apagar, e é por isso que não vira `null`: `null` seria não mexer.
    p_bio: form.bio,
    p_country_code: form.countryCode.trim().toUpperCase() || null,
    p_city: form.city,
    p_locale: form.locale,
    p_timezone: null,
  })
  if (error) throw error
  return data as Record<string, unknown>
}

/** Traduz a recusa do servidor. Nunca se mostra a mensagem crua. */
function errorKey(cause: unknown): TranslationKey {
  const raw = errorMessage(cause)
  if (raw.includes('USERNAME_TAKEN')) return 'profileForm.errorUsernameTaken'
  if (raw.includes('INVALID_USERNAME')) return 'profileForm.errorUsername'
  if (raw.includes('INVALID_DISPLAY_NAME')) return 'profileForm.errorName'
  if (raw.includes('BIO_TOO_LONG')) return 'profileForm.errorBio'
  if (raw.includes('INVALID_COUNTRY')) return 'profileForm.errorCountry'
  return 'profileForm.errorGeneric'
}

export function ProfileForm() {
  const { t, setLocale } = useI18n()
  const { profile } = useAuth()
  const client = useQueryClient()
  const [form, setForm] = useState<ProfileFormState>(() => ({
    displayName: profile?.display_name ?? '',
    username: profile?.username ?? '',
    bio: (profile as { bio?: string | null } | null)?.bio ?? '',
    city: (profile as { city?: string | null } | null)?.city ?? '',
    countryCode: (profile as { country_code?: string | null } | null)?.country_code ?? '',
    locale: (locales.includes(profile?.locale as Locale) ? profile?.locale : 'pt') as Locale,
  }))
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () => saveProfile(form),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['my-player-profile'] })
      void client.invalidateQueries({ queryKey: ['my-peladas'] })
    },
  })

  const update = <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice(''); setError('')
    const invalid = validateProfile(form)
    if (invalid) { setError(t(invalid)); return }
    try {
      await save.mutateAsync()
      // A língua muda à frente de quem a mudou, e não só ao recarregar.
      setLocale(form.locale)
      setNotice(t('profileForm.saved'))
    } catch (cause) {
      setError(t(errorKey(cause)))
    }
  }

  return (
    <Card className="settings-card profile-form">
      <header><UserRound/><div>
        <p className="eyebrow dark-text">{t('profileForm.eyebrow')}</p>
        <h2>{t('profileForm.title')}</h2>
        <p>{t('profileForm.body')}</p>
      </div></header>

      <form onSubmit={submit}>
        <label htmlFor="profile-name">{t('profileForm.name')}
          <input id="profile-name" value={form.displayName} maxLength={60} required
            onChange={(event) => update('displayName', event.target.value)}/>
        </label>

        <label htmlFor="profile-username">{t('profileForm.username')}
          <input id="profile-username" value={form.username} maxLength={30} autoComplete="off"
            onChange={(event) => update('username', event.target.value.toLowerCase())}/>
          <small>{t('profileForm.usernameHint')}</small>
        </label>

        <label htmlFor="profile-bio">{t('profileForm.bio')}
          <textarea id="profile-bio" value={form.bio} maxLength={500} rows={3}
            onChange={(event) => update('bio', event.target.value)}/>
          <small>{t('profileForm.bioCounter', { used: form.bio.length, max: 500 })}</small>
        </label>

        <div className="field-grid">
          <label htmlFor="profile-city">{t('profileForm.city')}
            <input id="profile-city" value={form.city} maxLength={80}
              onChange={(event) => update('city', event.target.value)}/>
          </label>
          <label htmlFor="profile-country">{t('profileForm.country')}
            <input id="profile-country" value={form.countryCode} maxLength={2} placeholder="PT"
              onChange={(event) => update('countryCode', event.target.value.toUpperCase())}/>
          </label>
        </div>

        <label htmlFor="profile-locale">{t('profileForm.language')}
          <select id="profile-locale" value={form.locale}
            onChange={(event) => update('locale', event.target.value as Locale)}>
            {locales.map((value) => <option key={value} value={value}>{localeNames[value]}</option>)}
          </select>
        </label>

        {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? t('profileForm.saving') : t('profileForm.save')}
        </Button>
      </form>
    </Card>
  )
}
