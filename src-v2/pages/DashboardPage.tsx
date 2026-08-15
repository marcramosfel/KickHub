import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Clock3, MapPin, Plus, Shield, UsersRound } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Card, EmptyState } from '../components/ui'
import { peladas as demoPeladas, type Pelada } from '../data/demo'
import { getAuthDisplayName, useAuth } from '../lib/auth'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { useMyPeladas } from '../lib/peladas'
import { roleLabel } from '../lib/role-label'

export function DashboardPage() {
  const { t, locale, formatDate } = useI18n()
  const { user, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const myPeladas = useMyPeladas(user?.id)
  const isDemo = !user
  const peladas = isDemo ? demoPeladas : (myPeladas.data ?? [])
  const firstName = getAuthDisplayName(user, profile, t('common.player')).split(' ')[0]
  const createdName = searchParams.get('created')
  const dateLabel = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' }).toLocaleUpperCase(locale)

  return (
    <div className="page page-dashboard">
      <header className="page-heading split-heading">
        <div>
          <span className="eyebrow dark-text">{dateLabel}</span>
          <h1>{t('dashboard.greeting', { name: firstName })}</h1>
          <p>{isDemo ? t('dashboard.demoSummary') : dashboardSummary(peladas.length, t)}</p>
        </div>
        <Link className="btn btn-primary btn-md" to="/criar"><Plus size={18}/> {t('dashboard.newPelada')}</Link>
      </header>

      {createdName ? (
        <p className="inline-notice" role="status">
          <CheckCircle2/> {t(searchParams.get('demo') ? 'dashboard.createdDemo' : 'dashboard.createdReal', { name: createdName })}
        </p>
      ) : null}

      {isDemo ? <DemoNextMatch/> : peladas.length > 0 ? <RealNextStep pelada={peladas[0]}/> : null}

      <section aria-labelledby="groups-title">
        <div className="section-title-row">
          <div><span className="eyebrow dark-text">{t('dashboard.communitiesEyebrow')}</span><h2 id="groups-title">{t('dashboard.myPeladas')}</h2></div>
          {!myPeladas.isPending || isDemo ? <span className="muted-count">{t('dashboard.groupCount', { count: peladas.length })}</span> : null}
        </div>

        {!isDemo && myPeladas.isPending ? (
          <div className="pelada-grid" aria-label={t('dashboard.loading')} aria-busy="true">
            {[0, 1].map((item) => <div className="pelada-card pelada-card-skeleton" key={item} aria-hidden="true"><span/><i/><i/><b/></div>)}
          </div>
        ) : !isDemo && myPeladas.isError ? (
          <Card className="dashboard-data-state" role="alert">
            <Shield/>
            <div><h3>{t('dashboard.loadErrorTitle')}</h3><p>{t('dashboard.loadErrorBody')}</p></div>
            <button type="button" className="btn btn-outline btn-md" onClick={() => void myPeladas.refetch()}>{t('dashboard.retry')}</button>
          </Card>
        ) : peladas.length === 0 ? (
          <EmptyState
            icon={<UsersRound/>}
            title={t('dashboard.emptyTitle')}
            body={t('dashboard.emptyBody')}
            action={<Link className="btn btn-primary btn-md" to="/criar"><Plus/> {t('dashboard.createFirst')}</Link>}
          />
        ) : (
          <div className="pelada-grid">
            {peladas.map((pelada) => <PeladaCard key={pelada.id} pelada={pelada}/>) }
            <Link to="/criar" className="pelada-card pelada-card-new"><span><Plus/></span><h3>{t('dashboard.createCardTitle')}</h3><p>{t('dashboard.createCardBody')}</p></Link>
          </div>
        )}
      </section>

      {isDemo ? <DemoLowerGrid/> : null}
    </div>
  )
}

function dashboardSummary(count: number, t: (key: TranslationKey, params?: Record<string, string | number>) => string) {
  if (count === 0) return t('dashboard.emptySummary')
  if (count === 1) return t('dashboard.oneSummary')
  return t('dashboard.manySummary', { count })
}

function PeladaCard({ pelada }: { pelada: Pelada }) {
  const { t, formatDate } = useI18n()
  const nextMatch = pelada.nextMatchAt
    ? formatDate(pelada.nextMatchAt, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : pelada.nextMatch || t('dashboard.noMatchScheduled')
  return (
    <Link to={`/p/${pelada.slug}`} className="pelada-card" style={{ '--accent': pelada.accent } as React.CSSProperties}>
      <div className="pelada-cover">
        <span className="pelada-monogram">{pelada.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
        <Badge tone={pelada.role === 'owner' ? 'lime' : pelada.role === 'admin' ? 'orange' : 'blue'}>{roleLabel(pelada.role, t)}</Badge>
      </div>
      <div className="pelada-content">
        <h3>{pelada.name}</h3>
        <p><MapPin size={15}/>{pelada.city}, {pelada.country}</p>
        <div className="pelada-stats"><span><UsersRound/> {t('dashboard.membersCount', { count: pelada.members })}</span><span><CalendarDays/> {nextMatch}</span></div>
        <span className="text-link">{t('dashboard.openPelada')} <ArrowRight size={16}/></span>
      </div>
    </Link>
  )
}

function RealNextStep({ pelada }: { pelada: Pelada }) {
  const { t } = useI18n()
  return (
    <section aria-labelledby="next-step-title">
      <div className="section-title-row"><div><span className="eyebrow dark-text">{t('dashboard.nextStepEyebrow')}</span><h2 id="next-step-title">{t('dashboard.nextStepTitle')}</h2></div></div>
      <Card className="dashboard-next-step">
        <span><CalendarDays/></span>
        <div><Badge tone="lime">{pelada.role === 'owner' ? t('dashboard.owner') : t('dashboard.member')}</Badge><h3>{pelada.name}</h3><p>{t('dashboard.nextStepBody')}</p></div>
        <Link className="btn btn-secondary btn-md" to={`/p/${pelada.slug}`}>{t('dashboard.openPelada')} <ChevronRight/></Link>
      </Card>
    </section>
  )
}

function DemoNextMatch() {
  const { t, formatDate, formatNumber } = useI18n()
  const matchDate = new Date(2026, 7, 14)
  return (
    <section aria-labelledby="next-title">
      <div className="section-title-row"><div><span className="eyebrow dark-text">{t('dashboard.featuredEyebrow')}</span><h2 id="next-title">{t('dashboard.nextMatch')}</h2></div><Link to="/p/browns/jogos">{t('dashboard.viewCalendar')} <ArrowRight size={16}/></Link></div>
      <Card className="next-match-feature">
        <div className="match-date"><span>{formatDate(matchDate, { month: 'short' }).toLocaleUpperCase()}</span><strong>{formatNumber(14)}</strong><small>{formatDate(matchDate, { weekday: 'short' }).toLocaleUpperCase()}</small></div>
        <div className="match-main"><Badge tone="lime">{t('dashboard.confirmed')}</Badge><h3>{t('dashboard.gameLabel', { name: 'Pelada Browns', number: 87 })}</h3><div className="match-meta"><span><Clock3/>20:30–22:00</span><span><MapPin/>Sportanlage Hardhof</span><span><UsersRound/>{t('dashboard.confirmedPlayers', { confirmed: 14, total: 16 })}</span></div></div>
        <div className="attendance-ring" aria-label={t('dashboard.confirmedPlayersAria', { confirmed: 14, total: 16 })}><strong>14</strong><span>/ 16</span></div>
        <Link className="btn btn-secondary btn-md" to="/p/browns">{t('dashboard.openGame')} <ChevronRight size={18}/></Link>
      </Card>
    </section>
  )
}

function DemoLowerGrid() {
  const { t, formatNumber } = useI18n()
  return (
    <section className="dashboard-lower-grid">
      <Card><div className="section-title-row compact"><div><span className="eyebrow dark-text">{t('dashboard.activityEyebrow')}</span><h2>{t('dashboard.thisWeek')}</h2></div></div><ol className="activity-list"><li><i className="activity-dot lime"/><div><strong>{t('dashboard.activityConfirmed')}</strong><span>Pelada Browns · {t('dashboard.twoHoursAgo')}</span></div></li><li><i className="activity-dot blue"/><div><strong>{t('dashboard.activityRanking')}</strong><span>Limmat United · {t('dashboard.yesterday')}</span></div></li><li><i className="activity-dot orange"/><div><strong>{t('dashboard.activityAchievement')}</strong><span>Pelada Browns · {t('dashboard.threeDaysAgo')}</span></div></li></ol></Card>
      <Card className="profile-completion"><Shield/><div><span className="eyebrow dark-text">{t('dashboard.globalProfile')}</span><h2>{t('dashboard.profileComplete', { percent: formatNumber(.8, { style: 'percent' }) })}</h2><p>{t('dashboard.profileBody')}</p><Link to="/u/marcos">{t('dashboard.completeProfile')} <ArrowRight size={16}/></Link></div></Card>
    </section>
  )
}
