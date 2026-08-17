import { ArrowRight, Check, Clock3, LockKeyhole, MapPin, ShieldCheck, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Badge, Button, Card } from '../components/ui'
import { LocaleSelect, useI18n } from '../lib/i18n'
import { useOnboarding } from '../lib/onboarding'
import { getPeladaInvite, type PeladaInvitePreview } from '../lib/onboarding-api'

export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { t, formatDate } = useI18n()
  const { acceptInvite } = useOnboarding()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ token: string; pelada: PeladaInvitePreview | null; error: string }>({
    token: '', pelada: null, error: '',
  })
  const loading = preview.token !== token
  const pelada = loading ? null : preview.pelada
  const previewError = loading ? '' : preview.error

  useEffect(() => {
    let active = true
    void getPeladaInvite(token)
      .then((result) => { if (active) setPreview({ token, pelada: result, error: '' }) })
      .catch(() => { if (active) setPreview({ token, pelada: null, error: t('invite.error') }) })
    return () => { active = false }
  }, [t, token])

  const accept = async () => {
    setBusy(true); setError('')
    try { navigate(`/p/${await acceptInvite(token)}`) }
    catch { setError(t('invite.error')) }
    finally { setBusy(false) }
  }

  return <main id="main-content" className="invite-page">
    <header><Brand inverse ariaLabel={t('common.brandHome')}/><div className="invite-header-actions"><LocaleSelect compact/><Badge tone="lime"><LockKeyhole/> {t('invite.badge')}</Badge></div></header>
    <Card className="invite-card">
      {loading ? <p role="status">{t('invite.loading')}</p> : pelada ? <>
        <span className="pelada-monogram large">{pelada.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
        <p className="eyebrow dark-text">{t('invite.eyebrow')}</p><h1>{t('invite.title', { name: pelada.name })}</h1><p>{pelada.description}</p>
        <dl><div><MapPin/><dt>{t('invite.location')}</dt><dd>{pelada.city}, {pelada.countryCode}</dd></div><div><UsersRound/><dt>{t('invite.community')}</dt><dd>{t('dashboard.membersCount', { count: pelada.memberCount })}</dd></div><div><Clock3/><dt>{t('invite.nextMatch')}</dt><dd>{pelada.nextMatchAt ? formatDate(pelada.nextMatchAt, { dateStyle: 'medium', timeStyle: 'short' }) : t('invite.noMatch')}</dd></div></dl>
        <div className="secure-note"><ShieldCheck/><p><strong>{t('invite.secureTitle')}</strong><br/>{t('invite.secureBody')}</p></div>
        <Button size="lg" disabled={busy || !token} onClick={accept}>{busy ? t('invite.accepting') : t('invite.accept')} {!busy && <ArrowRight/>}</Button>
        <small><Check/> {t('invite.footnote')}</small>
      </> : <p className="form-error" role="alert">{previewError || t('invite.error')}</p>}
      {pelada && error ? <p className="form-error" role="alert">{error}</p> : null}
    </Card>
  </main>
}
