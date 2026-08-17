import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, MapPin, Plus, Shield, UsersRound } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Card, EmptyState } from '../components/ui'
import type { Pelada } from '../lib/pelada-types'
import { getAuthDisplayName, useAuth } from '../lib/auth'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { useMyPeladas } from '../lib/peladas'
import { roleLabel } from '../lib/role-label'

export function DashboardPage() {
  const { t, locale, formatDate } = useI18n()
  const { user, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const myPeladas = useMyPeladas(user?.id)
  const peladas = myPeladas.data ?? []
  const firstName = getAuthDisplayName(user, profile, t('common.player')).split(' ')[0]
  const createdName = searchParams.get('created')
  const dateLabel = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'short' }).toLocaleUpperCase(locale)

  return (
    <div className="page page-dashboard">
      <header className="page-heading split-heading">
        <div>
          <span className="eyebrow dark-text">{dateLabel}</span>
          <h1>{t('dashboard.greeting', { name: firstName })}</h1>
          <p>{dashboardSummary(peladas.length, t)}</p>
        </div>
        <Link className="btn btn-primary btn-md" to="/criar"><Plus size={18}/> {t('dashboard.newPelada')}</Link>
      </header>

      {createdName ? (
        <p className="inline-notice" role="status">
          <CheckCircle2/> {t('dashboard.createdReal', { name: createdName })}
        </p>
      ) : null}

      {peladas.length > 0 ? <RealNextStep pelada={peladas[0]}/> : null}

      <section aria-labelledby="groups-title">
        <div className="section-title-row">
          <div><span className="eyebrow dark-text">{t('dashboard.communitiesEyebrow')}</span><h2 id="groups-title">{t('dashboard.myPeladas')}</h2></div>
          {!myPeladas.isPending ? <span className="muted-count">{t('dashboard.groupCount', { count: peladas.length })}</span> : null}
        </div>

        {myPeladas.isPending ? (
          <div className="pelada-grid" aria-label={t('dashboard.loading')} aria-busy="true">
            {[0, 1].map((item) => <div className="pelada-card pelada-card-skeleton" key={item} aria-hidden="true"><span/><i/><i/><b/></div>)}
          </div>
        ) : myPeladas.isError ? (
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
