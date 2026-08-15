import { ArrowRight, Check, Clock3, LockKeyhole, MapPin, ShieldCheck, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Badge, Button, Card } from '../components/ui'
import { peladas } from '../data/demo'
import { LocaleSelect, useI18n } from '../lib/i18n'
import { useOnboarding } from '../lib/onboarding'

export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { acceptInvite } = useOnboarding()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pelada = peladas[0]

  const accept = async () => {
    setBusy(true); setError('')
    try { navigate(`/p/${await acceptInvite(token)}`) }
    catch { setError(t('invite.error')) }
    finally { setBusy(false) }
  }

  return <main id="main-content" className="invite-page">
    <header><Brand inverse ariaLabel={t('common.brandHome')}/><div className="invite-header-actions"><LocaleSelect compact/><Badge tone="lime"><LockKeyhole/> {t('invite.badge')}</Badge></div></header>
    <Card className="invite-card"><span className="pelada-monogram large">PB</span><p className="eyebrow dark-text">{t('invite.eyebrow')}</p><h1>{t('invite.title', { name: pelada.name })}</h1><p>{pelada.description}</p>
      <dl><div><MapPin/><dt>{t('invite.location')}</dt><dd>{pelada.city}, {pelada.country}</dd></div><div><UsersRound/><dt>{t('invite.community')}</dt><dd>{t('dashboard.membersCount', { count: pelada.members })}</dd></div><div><Clock3/><dt>{t('invite.nextMatch')}</dt><dd>{pelada.nextMatch}</dd></div></dl>
      <div className="secure-note"><ShieldCheck/><p><strong>{t('invite.secureTitle')}</strong><br/>{t('invite.secureBody')}</p></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button size="lg" disabled={busy || !token} onClick={accept}>{busy ? t('invite.accepting') : t('invite.accept')} {!busy && <ArrowRight/>}</Button>
      <small><Check/> {t('invite.footnote')}</small>
    </Card>
  </main>
}
