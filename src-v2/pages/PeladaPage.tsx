import { Activity, ArrowLeft, ArrowRight, CalendarDays, Check, Copy, Inbox, Link2, MapPin, Settings, ShieldCheck, UserCheck, UsersRound, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { GamesSection } from '../components/GamesSection'
import { FeedSection } from '../components/FeedSection'
import { LegacyClaimsPanel } from '../components/LegacyClaimsPanel'
import { PeladaSettingsForm } from '../components/PeladaSettingsForm'
import { PeladaSwitcher } from '../components/PeladaSwitcher'
import { RankingSection } from '../components/RankingSection'
import { CuriositiesSection } from '../components/CuriositiesSection'
import { DiscoverySettingsForm } from '../components/DiscoverySettingsForm'
import { SelectionSection } from '../components/SelectionSection'
import { SquadSection } from '../components/SquadSection'
import { Badge, Button, Card } from '../components/ui'
import { useCurrentPelada } from '../lib/current-pelada'
import { PlayerCardProvider } from '../lib/player-card'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { inviteMaxUses, inviteTtlHours, useOnboarding } from '../lib/onboarding'

const memberTabs: [string, TranslationKey][] = [
  ['', 'pelada.tabOverview'], ['jogos', 'pelada.tabGames'], ['atividade', 'pelada.tabActivity'], ['jogadores', 'pelada.tabPlayers'],
  ['ranking', 'pelada.tabRanking'], ['selecao', 'pelada.tabSelection'], ['curiosidades', 'pelada.tabCuriosities'], ['estatisticas', 'pelada.tabStats'], ['admin', 'pelada.tabAdmin'],
]

export function PeladaPage() {
  const { section } = useParams()
  const { t } = useI18n()
  const { pelada, slug, status, canAdmin, retry } = useCurrentPelada()

  if (status === 'loading') {
    return <PeladaRouteState title={t('pelada.loadingTitle')} body={t('pelada.loadingBody')}/>
  }
  if (status === 'error') {
    return <PeladaRouteState
      title={t('pelada.loadErrorTitle')}
      body={t('pelada.loadErrorBody')}
      action={<button type="button" className="btn btn-primary btn-md" onClick={retry}>{t('dashboard.retry')}</button>}
    />
  }
  if (!pelada) {
    return <PeladaRouteState title={t('pelada.notFoundTitle')} body={t('pelada.notFoundBody')} action={<Link className="btn btn-primary btn-md" to="/app">{t('pelada.backToMyPeladas')}</Link>}/>
  }

  const tabs = canAdmin ? memberTabs : memberTabs.filter(([path]) => path !== 'admin')
  // O provedor do card envolve a pelada inteira: a foto de um jogador aparece
  // no ranking, no plantel, na escalação e no resultado, e todas abrem o mesmo.
  return <PlayerCardProvider><div className="pelada-page">
    <header className="pelada-hero" style={{ '--accent': pelada.accent } as React.CSSProperties}>
      <div className="pelada-hero-top"><Link className="pelada-back" to="/app"><ArrowLeft/> {t('pelada.backToMyPeladas')}</Link></div>
      <div className="pelada-hero-inner"><span className="pelada-monogram large">{pelada.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><div className="pelada-title-line"><h1>{pelada.name}</h1><Badge tone={pelada.visibility === 'private' ? 'neutral' : 'lime'}>{t(pelada.visibility === 'private' ? 'pelada.private' : 'pelada.public')}</Badge><PeladaSwitcher/></div><p><MapPin/> {pelada.city}, {pelada.country} · {t('dashboard.membersCount', { count: pelada.members })}</p></div>{canAdmin && <div className="pelada-actions"><Link className="btn btn-outline btn-md" to={`/p/${slug}/admin`}><Settings/> {t('pelada.settings')}</Link><Link className="btn btn-primary btn-md" to={`/p/${slug}/jogos?novo=1`}><CalendarDays/> {t('pelada.newGame')}</Link></div>}</div>
      <nav aria-label={t('pelada.sections')}>{tabs.map(([path, label]) => <NavLink key={path} end={!path} to={`/p/${slug}${path ? `/${path}` : ''}`}>{t(label)}</NavLink>)}</nav>
    </header>
    {/* Sem `<main id="main-content">`: o AppShell já tem o seu, e dois com o
        mesmo id partiam a ligação de saltar para o conteúdo. */}
    <div className="page pelada-sections">{section === 'admin' ? <AdminPanel/> : section === 'jogos' ? <GamesSection/> : section === 'atividade' ? <FeedSection/> : section === 'jogadores' ? <SquadSection/> : section === 'ranking' ? <RankingSection variant="ranking"/> : section === 'selecao' ? <SelectionSection/> : section === 'curiosidades' ? <CuriositiesSection/> : section === 'estatisticas' ? <RankingSection variant="stats"/> : section ? <UnknownSection/> : <Overview/>}</div>
  </div></PlayerCardProvider>
}

function Overview() {
  const { t } = useI18n()
  const { pelada, slug, canAdmin } = useCurrentPelada()

  return (
    <div className="authoritative-pelada-start">
      <section className="pelada-welcome"><div><span className="eyebrow dark-text">{t('pelada.readyEyebrow')}</span><h2>{t('pelada.readyTitle', { name: pelada?.name ?? '' })}</h2></div>{canAdmin && <Link className="btn btn-primary btn-md" to={`/p/${slug}/jogos?novo=1`}><CalendarDays/> {t('pelada.createFirstGame')}</Link>}</section>
      <div className="pelada-start-grid">
        <Card><span><UsersRound/></span><div><p className="eyebrow dark-text">{t('pelada.squadEyebrow')}</p><h3>{t(canAdmin ? 'pelada.squadAdminTitle' : 'pelada.squadMemberTitle')}</h3><p>{t(canAdmin ? 'pelada.squadAdminBody' : 'pelada.squadMemberBody')}</p></div><Link to={`/p/${slug}/${canAdmin ? 'admin' : 'jogadores'}`}>{t(canAdmin ? 'pelada.manageEntries' : 'pelada.openSquad')} <ArrowRight/></Link></Card>
        <Card><span><Settings/></span><div><p className="eyebrow dark-text">{t('pelada.configEyebrow')}</p><h3>{t(canAdmin ? 'pelada.configAdminTitle' : 'pelada.configMemberTitle')}</h3><p>{t(canAdmin ? 'pelada.configAdminBody' : 'pelada.configMemberBody')}</p></div>{canAdmin ? <Link to={`/p/${slug}/admin`}>{t('pelada.openSettings')} <ArrowRight/></Link> : <Link to={`/p/${slug}/jogos`}>{t('pelada.viewGames')} <ArrowRight/></Link>}</Card>
      </div>
    </div>
  )
}

function PeladaRouteState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="pelada-route-state">
      <Card>
        <span><ShieldCheck/></span>
        <p className="eyebrow dark-text">{t('pelada.routeEyebrow')}</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {action}
      </Card>
    </div>
  )
}

/**
 * Uma secção que não existe.
 *
 * Isto era um cartaz de "módulo em breve" com um botão que não fazia nada —
 * e todas as secções que ele anunciava já existem. O que sobra é um endereço
 * escrito à mão, e a resposta honesta a isso é dizê-lo e dar o caminho de volta.
 */
function UnknownSection() {
  const { t } = useI18n()
  const { slug } = useCurrentPelada()
  return <div className="section-placeholder">
    <span><Activity/></span>
    <p className="eyebrow dark-text">{t('pelada.moduleEyebrow')}</p>
    <h2>{t('pelada.unknownSectionTitle')}</h2>
    <p>{t('pelada.unknownSectionBody')}</p>
    <div><Link className="btn btn-primary btn-md" to={`/p/${slug}`}>{t('pelada.backToOverview')}</Link></div>
  </div>
}

function AdminPanel() {
  const { t, formatDate } = useI18n()
  const { pelada, canAdmin, role } = useCurrentPelada()
  const peladaId = pelada?.id ?? ''
  const { requests, loadRequests, reviewRequest, createInvite } = useOnboarding()
  const [busyId, setBusyId] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteExpiry, setInviteExpiry] = useState('')
  const [notice, setNotice] = useState('')
  const pending = requests.filter((request) => request.peladaId === peladaId && request.status === 'pending')

  useEffect(() => { if (canAdmin && peladaId) void loadRequests(peladaId) }, [canAdmin, loadRequests, peladaId])

  const decide = async (requestId: string, decision: 'approved' | 'rejected') => {
    setBusyId(requestId); setNotice('')
    try {
      await reviewRequest(requestId, decision)
      setNotice(t(decision === 'approved' ? 'admin.approvedNotice' : 'admin.rejectedNotice'))
    } catch { setNotice(t('admin.reviewError')) }
    finally { setBusyId('') }
  }

  const generateInvite = async () => {
    setBusyId('invite'); setNotice('')
    try {
      const invite = await createInvite(peladaId)
      setInviteUrl(invite.url)
      setInviteExpiry(formatDate(invite.expiresAt, { dateStyle: 'medium' }))
      setNotice(t('admin.inviteCreated'))
    } catch { setNotice(t('admin.inviteError')) }
    finally { setBusyId('') }
  }

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setNotice(t('admin.linkCopied'))
  }

  if (!canAdmin) return <div className="section-placeholder"><span><ShieldCheck/></span><p className="eyebrow dark-text">{t('admin.restrictedEyebrow')}</p><h2>{t('admin.restrictedTitle')}</h2><p>{t('admin.restrictedBody')}</p></div>

  return <div className="admin-page">
    <header className="page-heading split-heading"><div><span className="eyebrow dark-text">{t('admin.eyebrow')}</span><h1>{t('admin.title')}</h1><p>{t('admin.subtitle')}</p></div><Badge tone="lime"><ShieldCheck/> {t(role === 'owner' ? 'dashboard.owner' : 'dashboard.admin')}</Badge></header>
    {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}
    <div className="admin-grid">
      <section aria-labelledby="requests-title"><div className="section-title-row"><div><span className="eyebrow dark-text">{t('admin.queueEyebrow')}</span><h2 id="requests-title">{t('admin.queueTitle')}</h2></div><Badge tone={pending.length ? 'orange' : 'neutral'}>{pending.length}</Badge></div>
        {pending.length ? <div className="request-list">{pending.map((request) => <Card className="request-card" key={request.id}><div className="request-person"><span className="avatar avatar-md">{request.playerName.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><strong>{request.playerName}</strong><small>@{request.username} · {formatDate(request.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</small></div></div><blockquote>{request.message || t('admin.noMessage')}</blockquote><div className="request-actions"><Button variant="outline" disabled={busyId === request.id} onClick={() => decide(request.id, 'rejected')}><UserX/> {t('admin.reject')}</Button><Button disabled={busyId === request.id} onClick={() => decide(request.id, 'approved')}><UserCheck/> {t('admin.approve')}</Button></div></Card>)}</div> : <Card className="empty-state compact"><span className="empty-icon"><Inbox/></span><h2>{t('admin.emptyQueueTitle')}</h2><p>{t('admin.emptyQueueBody')}</p></Card>}
        <LegacyClaimsPanel peladaId={peladaId}/>
      </section>
      <aside><PeladaSettingsForm/><DiscoverySettingsForm/>
        <Card className="invite-builder"><span className="invite-icon"><Link2/></span><p className="eyebrow dark-text">{t('admin.inviteEyebrow')}</p><h2>{t('admin.inviteTitle')}</h2><p>{t('admin.inviteBody', { days: inviteTtlHours / 24, uses: inviteMaxUses })}</p>{inviteUrl ? <div className="invite-result"><label htmlFor="invite-url">{t('admin.inviteLinkLabel')}</label><div><input id="invite-url" readOnly value={inviteUrl}/><Button size="icon" variant="outline" onClick={copyInvite} aria-label={t('admin.copyInvite')}><Copy/></Button></div><small>{t('admin.inviteExpiry', { date: inviteExpiry })}</small></div> : <Button onClick={generateInvite} disabled={busyId === 'invite'}>{busyId === 'invite' ? t('admin.creatingInvite') : t('admin.createInvite')} <ArrowRight/></Button>}</Card>
        <Card className="permission-card"><ShieldCheck/><div><strong>{t('admin.permissionsTitle')}</strong><p>{t('admin.permissionsBody')}</p></div></Card>
      </aside>
    </div>
  </div>
}
