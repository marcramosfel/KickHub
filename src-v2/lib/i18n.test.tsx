import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, LocaleSelect, resolveLocale, useI18n } from './i18n'

const i18nMocks = vi.hoisted(() => ({
  profile: null as { locale: string } | null,
}))

vi.mock('./auth', () => ({
  useAuth: () => ({ profile: i18nMocks.profile }),
}))

function Probe() {
  const { t, formatDate } = useI18n()
  return <div>
    <LocaleSelect/>
    <p data-testid="groups">{t('dashboard.groupCount', { count: 2 })}</p>
    <p data-testid="date">{formatDate(new Date(2026, 7, 14), { month: 'long' })}</p>
  </div>
}

describe('i18n', () => {
  beforeEach(() => {
    localStorage.clear()
    i18nMocks.profile = null
    document.documentElement.lang = ''
  })

  it('resolve a prioridade preferência, conta, browser e fallback inglês', () => {
    expect(resolveLocale('de', 'fr', 'es-ES')).toBe('de')
    expect(resolveLocale(null, 'fr', 'es-ES')).toBe('fr')
    expect(resolveLocale(null, null, 'es-MX')).toBe('es')
    expect(resolveLocale(null, null, 'ja-JP')).toBe('en')
  })

  it('traduz, pluraliza, formata datas e persiste a troca', () => {
    localStorage.setItem('kickhub-locale', 'pt')
    render(<I18nProvider><Probe/></I18nProvider>)
    expect(screen.getByTestId('groups')).toHaveTextContent('2 peladas')
    expect(screen.getByTestId('date')).toHaveTextContent('agosto')

    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } })
    expect(screen.getByTestId('groups')).toHaveTextContent('2 groups')
    expect(screen.getByTestId('date')).toHaveTextContent('August')
    expect(localStorage.getItem('kickhub-locale')).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('usa o idioma da conta quando não existe preferência local', () => {
    i18nMocks.profile = { locale: 'fr' }
    render(<I18nProvider><Probe/></I18nProvider>)
    expect(screen.getByTestId('groups')).toHaveTextContent('2 groupes')
  })
})
