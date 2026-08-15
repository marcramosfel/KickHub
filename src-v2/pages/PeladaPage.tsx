import { Activity, ArrowRight, CalendarDays, Check, ChevronRight, ClipboardList, Copy, Crown, Inbox, Link2, MapPin, Settings, ShieldCheck, Sparkles, Trophy, UserCheck, UsersRound, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { PeladaSwitcher } from '../components/PeladaSwitcher'
import { Avatar, Badge, Button, Card } from '../components/ui'
import { rankings, upcomingPlayers } from '../data/demo'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { inviteMaxUses, inviteTtlHours, useOnboarding } from '../lib/onboarding'

const memberTabs: [string, TranslationKey][] = [
  ['', 'pelada.tabOverview'], ['jogos', 'pelada.tabGames'], ['jogadores', 'pelada.tabPlayers'],
  ['ranking', 'pelada.tabRanking'], ['estatisticas', 'pelada.tabStats'], ['admin', 'pelada.tabAdmin'],
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
  return <div className="pelada-page">
    <header className="pelada-hero" style={{ '--accent': pelada.accent } as React.CSSProperties}>
      <div className="pelada-hero-inner"><span className="pelada-monogram large">{pelada.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><div className="pelada-title-line"><h1>{pelada.name}</h1><Badge tone={pelada.visibility === 'private' ? 'neutral' : 'lime'}>{t(pelada.visibility === 'private' ? 'pelada.private' : 'pelada.public')}</Badge><PeladaSwitcher/></div><p><MapPin/> {pelada.city}, {pelada.country} · {t('dashboard.membersCount', { count: pelada.members })}</p></div>{canAdmin && <div className="pelada-actions"><Button variant="outline"><Settings/> {t('pelada.settings')}</Button><Button><CalendarDays/> {t('pelada.newGame')}</Button></div>}</div>
      <nav aria-label={t('pelada.sections')}>{tabs.map(([path, label]) => <NavLink key={path} end={!path} to={`/p/${slug}${path ? `/${path}` : ''}`}>{t(label)}</NavLink>)}</nav>
    </header>
    <main id="main-content" className="page pelada-content">{section === 'admin' ? <AdminPanel/> : section ? <SectionPlaceholder section={section}/> : <Overview/>}</main>
  </div>
}

function Overview() {
  const { t, formatDate, formatNumber } = useI18n()
  const { pelada, slug, isDemo, canAdmin } = useCurrentPelada()
  const matchDate = new Date(2026, 7, 14)

  if (!isDemo) {
    return (
      <div className="authoritative-pelada-start">
        <section className="pelada-welcome"><div><span className="eyebrow dark-text">{t('pelada.readyEyebrow')}</span><h2>{t('pelada.readyTitle', { name: pelada?.name ?? '' })}</h2></div>{canAdmin && <Button><CalendarDays/> {t('pelada.createFirstGame')}</Button>}</section>
        <div className="pelada-start-grid">
          <Card><span><UsersRound/></span><div><p className="eyebrow dark-text">{t('pelada.squadEyebrow')}</p><h3>{t(canAdmin ? 'pelada.squadAdminTitle' : 'pelada.squadMemberTitle')}</h3><p>{t(canAdmin ? 'pelada.squadAdminBody' : 'pelada.squadMemberBody')}</p></div><Link to={`/p/${slug}/${canAdmin ? 'admin' : 'jogadores'}`}>{t(canAdmin ? 'pelada.manageEntries' : 'pelada.openSquad')} <ArrowRight/></Link></Card>
          <Card><span><Settings/></span><div><p className="eyebrow dark-text">{t('pelada.configEyebrow')}</p><h3>{t(canAdmin ? 'pelada.configAdminTitle' : 'pelada.configMemberTitle')}</h3><p>{t(canAdmin ? 'pelada.configAdminBody' : 'pelada.configMemberBody')}</p></div>{canAdmin ? <Button variant="outline">{t('pelada.openSettings')}</Button> : <Link to={`/p/${slug}/jogos`}>{t('pelada.viewGames')} <ArrowRight/></Link>}</Card>
        </div>
      </div>
    )
  }

  return <>
    <section className="pelada-welcome"><div><span className="eyebrow dark-text">{t('pelada.demoEyebrow')}</span><h2>{t('pelada.demoNextChapter', { count: 2 })}</h2></div><Button>{t('pelada.confirmAttendance')} <ArrowRight/></Button></section>
    <div className="pelada-overview-grid">
      <Card className="game-card-feature"><div className="game-card-top"><Badge tone="lime">{t('pelada.openGameBadge')}</Badge><span>{t('pelada.confirmedOf', { confirmed: 14, total: 16 })}</span></div><h2>{t('pelada.gameNumber', { number: 87 })}</h2><div className="big-date"><strong>{formatNumber(14)}</strong><span>{formatDate(matchDate, { month: 'short' }).toLocaleUpperCase()}<br/>{formatDate(matchDate, { weekday: 'short' }).toLocaleUpperCase()}</span></div><div className="match-meta vertical"><span><CalendarDays/> {t('pelada.demoMatchWindow')}</span><span><MapPin/> Sportanlage Hardhof</span></div><div className="attendance-avatars">{upcomingPlayers.slice(0,7).map(([name]) => <Avatar key={name} name={name} size="sm"/>)}<span>+7</span></div><Link to={`/p/${slug}/jogos`}>{t('pelada.viewCallup')} <ChevronRight/></Link></Card>
      <Card className="balance-preview"><div className="card-head"><div><span className="eyebrow dark-text">{t('pelada.drawEyebrow')}</span><h2>{t('pelada.drawTitle')}</h2></div><Sparkles/></div><div className="teams-preview"><div><span>{t('pelada.teamYellow')}</span><strong>{formatNumber(4.38, { minimumFractionDigits: 2 })}</strong><div className="mini-team">{upcomingPlayers.slice(0,5).map(([name,pos]) => <p key={name}><Avatar name={name} size="sm"/><b>{name}</b><small>{pos}</small></p>)}</div></div><div className="versus"><span>{formatNumber(.96, { style: 'percent' })}</span><small>{t('pelada.balance')}</small><i>VS</i></div><div><span>{t('pelada.teamBlue')}</span><strong>{formatNumber(4.32, { minimumFractionDigits: 2 })}</strong><div className="mini-team">{upcomingPlayers.slice(5,10).map(([name,pos]) => <p key={name}><Avatar name={name} size="sm"/><b>{name}</b><small>{pos}</small></p>)}</div></div></div><Button variant="secondary">{t('pelada.openSimulator')}</Button></Card>
      <Card className="ranking-card"><div className="card-head"><div><span className="eyebrow dark-text">{t('pelada.rankingEyebrow')}</span><h2>{t('pelada.rankingTitle')}</h2></div><Trophy/></div><ol>{rankings.map((player) => <li key={player.name}><span>{formatNumber(player.rank)}</span><Avatar name={player.name} size="sm"/><strong>{player.name}</strong><b>{formatNumber(player.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><small>{player.trend}</small></li>)}</ol><Link to={`/p/${slug}/ranking`}>{t('pelada.fullRanking')} <ArrowRight/></Link></Card>
      <Card className="pulse-card"><div className="card-head"><div><span className="eyebrow dark-text">{t('pelada.pulseEyebrow')}</span><h2>{t('pelada.pulseTitle')}</h2></div><Activity/></div><div className="story"><span className="story-icon lime"><Crown/></span><p><strong>{t('pelada.storyStarTitle', { name: 'Tiago' })}</strong><small>{t('pelada.storyStarBody', { number: 86, count: 8 })}</small></p></div><div className="story"><span className="story-icon blue"><ShieldCheck/></span><p><strong>{t('pelada.storySavesTitle', { name: 'Bruno', count: 12 })}</strong><small>{t('pelada.storySavesBody')}</small></p></div><div className="story"><span className="story-icon orange"><ClipboardList/></span><p><strong>{t('pelada.storyRecapTitle')}</strong><small>{t('pelada.storyRecapBody')}</small></p></div></Card>
    </div>
  </>
}

function PeladaRouteState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <main className="pelada-route-state">
      <Card>
        <span><ShieldCheck/></span>
        <p className="eyebrow dark-text">{t('pelada.routeEyebrow')}</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {action}
      </Card>
    </main>
  )
}

function SectionPlaceholder({ section }: { section: string }) {
  const { t } = useI18n()
  const { slug } = useCurrentPelada()
  const content: Record<string, [TranslationKey, TranslationKey, React.ReactNode]> = {
    jogos: ['pelada.gamesTitle', 'pelada.gamesBody', <CalendarDays key="jogos"/>],
    jogadores: ['pelada.playersTitle', 'pelada.playersBody', <UsersRound key="jogadores"/>],
    ranking: ['pelada.rankingModuleTitle', 'pelada.rankingModuleBody', <Trophy key="ranking"/>],
    estatisticas: ['pelada.statsTitle', 'pelada.statsBody', <Activity key="estatisticas"/>],
  }
  const [title, body, icon] = content[section] ?? content.jogos
  return <div className="section-placeholder"><span>{icon}</span><p className="eyebrow dark-text">{t('pelada.moduleEyebrow')}</p><h2>{t(title)}</h2><p>{t(body)}</p><div><Button>{t('pelada.startTask')}</Button><Link className="btn btn-outline btn-md" to={`/p/${slug}`}>{t('pelada.backToOverview')}</Link></div></div>
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
      </section>
      <aside><Card className="invite-builder"><span className="invite-icon"><Link2/></span><p className="eyebrow dark-text">{t('admin.inviteEyebrow')}</p><h2>{t('admin.inviteTitle')}</h2><p>{t('admin.inviteBody', { days: inviteTtlHours / 24, uses: inviteMaxUses })}</p>{inviteUrl ? <div className="invite-result"><label htmlFor="invite-url">{t('admin.inviteLinkLabel')}</label><div><input id="invite-url" readOnly value={inviteUrl}/><Button size="icon" variant="outline" onClick={copyInvite} aria-label={t('admin.copyInvite')}><Copy/></Button></div><small>{t('admin.inviteExpiry', { date: inviteExpiry })}</small></div> : <Button onClick={generateInvite} disabled={busyId === 'invite'}>{busyId === 'invite' ? t('admin.creatingInvite') : t('admin.createInvite')} <ArrowRight/></Button>}</Card>
        <Card className="permission-card"><ShieldCheck/><div><strong>{t('admin.permissionsTitle')}</strong><p>{t('admin.permissionsBody')}</p></div></Card>
      </aside>
    </div>
  </div>
}
