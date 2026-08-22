import { ProfileForm } from '../components/ProfileForm'
import { DataPanel, PrivacyPanel } from '../components/PrivacyPanel'
import { toPrivacySettings } from '../lib/account'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useSeo } from '../lib/seo'

/**
 * A conta: privacidade, os dados e o fim.
 *
 * Está fora do perfil de propósito. O perfil é o que os outros vêem; isto é o
 * que só a pessoa decide — e misturar as duas coisas faz a privacidade parecer
 * uma preferência de apresentação.
 */
export function AccountPage() {
  const { t } = useI18n()
  const { profile } = useAuth()
  useSeo({ title: t('account.title'), description: t('account.privacyBody') })

  return (
    <div className="page account-page">
      <header className="page-heading">
        <span className="eyebrow dark-text">{t('account.eyebrow')}</span>
        <h1>{t('account.title')}</h1>
        <p>{t('account.subtitle')}</p>
      </header>

      <div className="account-grid">
        {/* O perfil primeiro: é o que a maioria vem aqui corrigir. */}
        <ProfileForm/>
        <PrivacyPanel initial={toPrivacySettings((profile as { privacy?: unknown } | null)?.privacy)}/>
        <DataPanel/>
      </div>
    </div>
  )
}
