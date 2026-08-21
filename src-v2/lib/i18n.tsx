import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { authCatalog } from '../i18n/auth'
import { commonCatalog } from '../i18n/common'
import { createPeladaCatalog } from '../i18n/createPelada'
import { dashboardCatalog } from '../i18n/dashboard'
import { discoverCatalog } from '../i18n/discover'
import { gamesCatalog } from '../i18n/games'
import { feedCatalog } from '../i18n/feed'
import { inviteCatalog } from '../i18n/invite'
import { landingCatalog } from '../i18n/landing'
import { notificationsCatalog } from '../i18n/notifications'
import { peladaCatalog } from '../i18n/pelada'
import { peladaAdminCatalog } from '../i18n/peladaAdmin'
import { profileCatalog } from '../i18n/profile'
import { rankingCatalog } from '../i18n/ranking'
import { selectionCatalog } from '../i18n/selection'
import { awardsCatalog } from '../i18n/awards'
import { claimCatalog } from '../i18n/claim'
import { legacyClaimsCatalog } from '../i18n/legacyClaims'
import { ratingsCatalog } from '../i18n/ratings'
import { squadCatalog } from '../i18n/squad'
import type { Locale, TranslationValue } from '../i18n/types'
import { useAuth } from './auth'

const supportedLocales: Locale[] = ['pt', 'en', 'es', 'fr', 'de']
const localeLabels: Record<Locale, string> = {
  pt: 'Português', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
}
const intlLocales: Record<Locale, string> = {
  pt: 'pt-PT', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
}
const pluralRules = Object.fromEntries(supportedLocales.map((locale) => [locale, new Intl.PluralRules(intlLocales[locale])])) as Record<Locale, Intl.PluralRules>
const numberFormatters = Object.fromEntries(supportedLocales.map((locale) => [locale, new Intl.NumberFormat(intlLocales[locale])])) as Record<Locale, Intl.NumberFormat>

const catalogs = Object.fromEntries(supportedLocales.map((locale) => [locale, {
  ...commonCatalog[locale],
  ...landingCatalog[locale],
  ...dashboardCatalog[locale],
  ...createPeladaCatalog[locale],
  ...authCatalog[locale],
  ...inviteCatalog[locale],
  ...discoverCatalog[locale],
  ...profileCatalog[locale],
  ...peladaCatalog[locale],
  ...peladaAdminCatalog[locale],
  ...gamesCatalog[locale],
  ...feedCatalog[locale],
  ...squadCatalog[locale],
  ...rankingCatalog[locale],
  ...selectionCatalog[locale],
  ...ratingsCatalog[locale],
  ...awardsCatalog[locale],
  ...claimCatalog[locale],
  ...legacyClaimsCatalog[locale],
  ...notificationsCatalog[locale],
}])) as Record<Locale, typeof commonCatalog.pt & typeof landingCatalog.pt & typeof dashboardCatalog.pt & typeof createPeladaCatalog.pt
  & typeof authCatalog.pt & typeof inviteCatalog.pt & typeof discoverCatalog.pt & typeof profileCatalog.pt & typeof peladaCatalog.pt
  & typeof peladaAdminCatalog.pt & typeof gamesCatalog.pt & typeof feedCatalog.pt & typeof squadCatalog.pt & typeof rankingCatalog.pt & typeof selectionCatalog.pt & typeof ratingsCatalog.pt & typeof awardsCatalog.pt & typeof claimCatalog.pt & typeof legacyClaimsCatalog.pt & typeof notificationsCatalog.pt>

export type TranslationKey = keyof typeof catalogs.pt
type TranslationParams = Record<string, string | number>

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && supportedLocales.includes(value as Locale)
}

function localeFromBrowser(language: string | undefined) {
  const base = language?.toLowerCase().split('-')[0]
  return isLocale(base) ? base : undefined
}

export function resolveLocale(saved: unknown, account: unknown, browser: string | undefined): Locale {
  if (isLocale(saved)) return saved
  if (isLocale(account)) return account
  return localeFromBrowser(browser) ?? 'en'
}

function interpolate(locale: Locale, message: string, params: TranslationParams) {
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (token, key: string) => (
    params[key] === undefined ? token : typeof params[key] === 'number' ? numberFormatters[locale].format(params[key]) : String(params[key])
  ))
}

function translate(locale: Locale, key: TranslationKey, params: TranslationParams = {}) {
  const value: TranslationValue = catalogs[locale][key]
  const message = typeof value === 'string'
    ? value
    : value[pluralRules[locale].select(Number(params.count)) === 'one' ? 'one' : 'other']
  return interpolate(locale, message, params)
}

type I18nValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, params?: TranslationParams) => string
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

export type Translate = I18nValue['t']

const I18nContext = createContext<I18nValue | null>(null)

function readSavedLocale() {
  try { return localStorage.getItem('kickhub-locale') } catch { return null }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [initialSavedLocale] = useState(readSavedLocale)
  const hasExplicitPreference = useRef(isLocale(initialSavedLocale))
  const [locale, setLocaleState] = useState<Locale>(() => resolveLocale(
    initialSavedLocale,
    profile?.locale,
    typeof navigator === 'undefined' ? undefined : navigator.language,
  ))

  useEffect(() => {
    if (!hasExplicitPreference.current && isLocale(profile?.locale)) setLocaleState(profile.locale)
  }, [profile?.locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale(next) {
      hasExplicitPreference.current = true
      try { localStorage.setItem('kickhub-locale', next) } catch { /* preference remains active in memory */ }
      setLocaleState(next)
    },
    t: (key, params) => translate(locale, key, params),
    formatDate: (date, options) => new Intl.DateTimeFormat(intlLocales[locale], options).format(new Date(date)),
    formatNumber: (number, options) => new Intl.NumberFormat(intlLocales[locale], options).format(number),
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n precisa de I18nProvider')
  return value
}

export function LocaleSelect({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <label className="locale-select">
      <span className="sr-only">{t('common.language')}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t('common.language')}>
        {supportedLocales.map((value) => (
          <option key={value} value={value}>{compact ? value.toUpperCase() : localeLabels[value]}</option>
        ))}
      </select>
    </label>
  )
}
