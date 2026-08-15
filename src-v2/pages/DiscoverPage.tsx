import { ArrowRight, Check, Clock3, Map, MapPin, Search, Send, SlidersHorizontal, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import { discoverPeladas, type Pelada } from '../data/demo'
import { useI18n } from '../lib/i18n'
import { useOnboarding } from '../lib/onboarding'
import { discoverPublicPeladas } from '../lib/onboarding-api'

const searchRadiusKm = 30
const referenceCity = 'Zürich'
const messageLimit = 500

export function DiscoverPage() {
  const { t, formatNumber } = useI18n()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Pelada | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [remoteResults, setRemoteResults] = useState<Pelada[] | null>(null)
  const [loading, setLoading] = useState(false)
  const { joinStates, requestJoin } = useOnboarding()
  const demoResults = useMemo(() => discoverPeladas.filter((pelada) => `${pelada.name} ${pelada.city}`.toLowerCase().includes(query.toLowerCase())), [query])
  const results = remoteResults ?? demoResults

  useEffect(() => {
    let active = true
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      const result = await discoverPublicPeladas(query.trim())
      if (active) { setRemoteResults(result); setLoading(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [query])

  const submitRequest = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const status = await requestJoin(selected, message.trim())
      setNotice(t(status === 'active' ? 'discover.noticeAlreadyMember' : 'discover.noticeRequestSent', { name: selected.name }))
      setSelected(null)
      setMessage('')
    } catch {
      setNotice(t('discover.noticeError'))
    } finally {
      setBusy(false)
    }
  }

  return <div className="page discover-page">
    <header className="page-heading"><span className="eyebrow dark-text">{t('discover.eyebrow')}</span><h1>{t('discover.title')}</h1><p>{t('discover.subtitle')}</p></header>
    <div className="search-panel"><label><span className="sr-only">{t('discover.searchLabel')}</span><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('discover.searchPlaceholder')}/></label><button type="button"><SlidersHorizontal/> {t('discover.filters')}</button><button type="button"><Map/> {t('discover.map')}</button></div>
    <div className="discover-summary" aria-live="polite"><strong>{loading ? t('discover.searching') : t('discover.resultCount', { count: results.length, city: referenceCity })}</strong><span>{t('discover.radius', { distance: formatNumber(searchRadiusKm, { style: 'unit', unit: 'kilometer' }) })}</span></div>
    {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}
    {results.length ? <div className="discover-grid" aria-busy={loading}>{results.map((pelada) => {
      const state = pelada.membership === 'active' ? 'active' : (joinStates[pelada.id] ?? 'idle')
      return <Card key={pelada.id} className="discover-card" style={{ '--accent': pelada.accent } as React.CSSProperties}>
        <div className="discover-card-head"><span className="pelada-monogram">{initials(pelada.name)}</span><Badge tone={state === 'active' ? 'blue' : state === 'pending' ? 'orange' : 'lime'}>{state === 'active' ? t('discover.badgeMember') : state === 'pending' ? t('discover.badgePending') : pelada.joinMode === 'open' ? t('discover.badgeOpen') : t('discover.badgeApproval')}</Badge></div>
        <h2>{pelada.name}</h2><p>{pelada.description}</p>
        <div className="discover-meta"><span><MapPin/> {pelada.city}</span><span><UsersRound/> {t('dashboard.membersCount', { count: pelada.members })}</span></div>
        <div className="discover-foot"><span>{t('discover.next')} <strong>{pelada.nextMatch}</strong></span><Link to={`/p/${pelada.slug}`}>{t('discover.viewPelada')} <ArrowRight/></Link></div>
        <div className="discover-actions">{state === 'active' ? <Link className="btn btn-secondary btn-md" to={`/p/${pelada.slug}`}>{t('discover.openCommunity')}</Link> : state === 'pending' ? <span className="pending-label"><Clock3/> {t('discover.awaitingApproval')}</span> : <Button onClick={() => { setSelected(pelada); setNotice('') }}><Send/> {pelada.joinMode === 'open' ? t('discover.joinNow') : t('discover.requestJoin')}</Button>}</div>
      </Card>
    })}</div> : <EmptyState icon={<Search/>} title={t('discover.emptyTitle')} body={t('discover.emptyBody')}/>}

    {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
      <section className="join-dialog" role="dialog" aria-modal="true" aria-labelledby="join-title">
        <button className="dialog-close" type="button" onClick={() => setSelected(null)} aria-label={t('discover.close')}><X/></button>
        <span className="pelada-monogram" style={{ background: selected.accent }}>{initials(selected.name)}</span>
        <p className="eyebrow dark-text">{t('discover.dialogEyebrow')}</p><h2 id="join-title">{t('discover.dialogTitle', { name: selected.name })}</h2>
        {selected.joinMode === 'open' ? <p>{t('discover.dialogOpenBody')}</p> : <label htmlFor="join-message">{t('discover.messageLabel')}<textarea id="join-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={messageLimit} placeholder={t('discover.messagePlaceholder')}/><small>{t('discover.messageCounter', { used: message.length, max: messageLimit })}</small></label>}
        <div className="dialog-actions"><Button variant="ghost" onClick={() => setSelected(null)}>{t('discover.cancel')}</Button><Button disabled={busy} onClick={submitRequest}>{busy ? t('discover.sending') : selected.joinMode === 'open' ? t('discover.confirmJoin') : t('discover.sendRequest')} <ArrowRight/></Button></div>
      </section>
    </div>}
  </div>
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('')
}
