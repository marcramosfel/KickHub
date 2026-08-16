import { Award, CalendarDays, MapPin, Medal, Share2, Shield, ShieldCheck, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Card } from '../components/ui'
import { currentProfile, peladas as demoPeladas } from '../data/demo'
import { getAuthAvatarUrl, useAuth } from '../lib/auth'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { useMyPlayerProfile, type MyPlayerProfile, type PlayerProfileCommunity } from '../lib/player-profile'
import { roleLabel } from '../lib/role-label'

export function ProfilePage() {
  const { username = '' } = useParams()
  const { t } = useI18n()
  const { user, profile: authProfile } = useAuth()
  const playerProfile = useMyPlayerProfile(user?.id)

  if (!user) return <DemoProfile/>

  if (playerProfile.isPending) {
    return <div className="page profile-page" aria-busy="true" aria-label={t('profile.loading')}>
      <Card className="profile-hero profile-hero-skeleton"><div aria-hidden="true"/><span aria-hidden="true"/><p aria-hidden="true"/></Card>
      <div className="profile-stat-grid">{[0, 1, 2, 3].map((item) => <Card key={item}/>)}</div>
    </div>
  }

  if (playerProfile.isError || !playerProfile.data) {
    return <ProfileState retry={() => void playerProfile.refetch()}/>
  }

  if (username && username !== playerProfile.data.profile.username) {
    return <ProfileState privateProfile/>
  }

  return <RealProfile data={playerProfile.data} avatarFallback={getAuthAvatarUrl(user, authProfile)}/>
}

function RealProfile({ data, avatarFallback }: { data: MyPlayerProfile; avatarFallback?: string }) {
  const { t, formatNumber } = useI18n()
  const [notice, setNotice] = useState('')
  const { profile, peladas, totals } = data
  const position = peladas.map((pelada) => pelada.primaryPosition).find(Boolean)

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: profile.displayName, url })
      else await navigator.clipboard.writeText(url)
      setNotice(t('profile.linkCopied'))
    } catch {
      // Cancelar o share nativo não é erro de produto e não precisa de aviso.
    }
  }

  return <div className="page profile-page">
    <Card className="profile-hero">
      <div className="profile-cover"><span>{t('profile.coverLabel')}</span></div>
      <div className="profile-main">
        <Avatar name={profile.displayName} size="lg" src={profile.avatarUrl ?? avatarFallback}/>
        <div>
          <div className="profile-name"><h1>{profile.displayName}</h1><Badge tone="lime">{t('profile.verified')}</Badge></div>
          <p>@{profile.username}{profile.city || profile.countryCode ? <> · <MapPin/> {[profile.city, profile.countryCode].filter(Boolean).join(', ')}</> : null}</p>
          <span className="position-pill">{position ? t(`squad.pos${position}` as TranslationKey) : t('profile.noPosition')}</span>
        </div>
        <div className="profile-actions"><Button variant="outline" onClick={share}><Share2/> {t('profile.share')}</Button></div>
      </div>
      <p className="profile-bio">{profile.bio || t('profile.bioFallback')}</p>
      {notice ? <p className="profile-share-notice" role="status">{notice}</p> : null}
    </Card>

    <div className="profile-stat-grid">
      <Card><strong>{formatNumber(totals.matches)}</strong><span>{t('profile.matches')}</span></Card>
      <Card><strong>{formatNumber(totals.goals)}</strong><span>{t('profile.goals')}</span></Card>
      <Card><strong>{formatNumber(totals.assists)}</strong><span>{t('profile.assists')}</span></Card>
      <Card><strong>{formatNumber(totals.peladas)}</strong><span>{t('profile.peladasCount')}</span></Card>
    </div>

    <div className="profile-columns">
      <section>
        <div className="section-title-row"><div><span className="eyebrow dark-text">{t('profile.communitiesEyebrow')}</span><h2>{t('profile.communitiesTitle')}</h2></div></div>
        {peladas.length ? peladas.map((pelada) => <CommunityCard key={pelada.id} community={pelada}/>) : (
          <Card className="profile-empty"><ShieldCheck/><p>{t('profile.noCommunities')}</p></Card>
        )}
      </section>
      <section>
        <div className="section-title-row"><div><span className="eyebrow dark-text">{t('profile.achievementsEyebrow')}</span><h2>{t('profile.achievementsTitle')}</h2></div></div>
        <div className="achievement-grid">
          <Card><span className="achievement gold"><Trophy/></span><strong>{t('profile.starTitle', { count: totals.craques })}</strong><small>{t('profile.starBodyReal')}</small></Card>
          <Card><span className="achievement violet"><Award/></span><strong>{t('profile.architectTitle')}</strong><small>{t('profile.architectBody', { count: totals.assists })}</small></Card>
          <Card><span className="achievement blue"><Medal/></span><strong>{t('profile.veteranTitle')}</strong><small>{t('profile.veteranBody', { count: totals.matches })}</small></Card>
        </div>
      </section>
    </div>
  </div>
}

function CommunityCard({ community }: { community: PlayerProfileCommunity }) {
  const { t, formatNumber } = useI18n()
  return <Card className="profile-pelada">
    <span className="pelada-monogram">{community.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
    <div className="profile-pelada-copy">
      <Link to={`/p/${community.slug}`}><strong>{community.name}</strong></Link>
      <small>{roleLabel(community.role, t)} · {t('dashboard.membersCount', { count: community.memberCount })}</small>
      <span className="profile-pelada-stats">
        <b>{formatNumber(community.stats.gamesPlayed)} <i>{t('profile.matchesShort')}</i></b>
        <b>{formatNumber(community.stats.goals)} <i>{t('profile.goalsShort')}</i></b>
        <b>{formatNumber(community.stats.assists)} <i>{t('profile.assistsShort')}</i></b>
        <b>{community.overall ? formatNumber(community.overall.overall) : '—'} <i>{t('profile.overallShort')}</i></b>
      </span>
    </div>
    <b>{community.role === 'owner' || community.role === 'admin' ? <Shield/> : <CalendarDays/>}</b>
  </Card>
}

function ProfileState({ retry, privateProfile = false }: { retry?: () => void; privateProfile?: boolean }) {
  const { t } = useI18n()
  return <div className="page profile-page"><Card className="dashboard-data-state" role={privateProfile ? undefined : 'alert'}>
    <ShieldCheck/>
    <div><h1>{t(privateProfile ? 'profile.privateTitle' : 'profile.errorTitle')}</h1><p>{t(privateProfile ? 'profile.privateBody' : 'profile.errorBody')}</p></div>
    {retry ? <Button variant="outline" onClick={retry}>{t('dashboard.retry')}</Button> : null}
  </Card></div>
}

function DemoProfile() {
  const { t, formatNumber } = useI18n()
  return <div className="page profile-page">
    <Card className="profile-hero"><div className="profile-cover"><span>{t('profile.coverLabel')}</span></div><div className="profile-main"><Avatar name={currentProfile.name} size="lg"/><div><div className="profile-name"><h1>{currentProfile.name}</h1><Badge tone="lime">{t('profile.verified')}</Badge></div><p>@{currentProfile.username} · <MapPin/> {currentProfile.city}, {currentProfile.country}</p><span className="position-pill">{t('profile.positions')}</span></div></div><p className="profile-bio">{t('profile.bio')}</p></Card>
    <div className="profile-stat-grid"><Card><strong>{formatNumber(currentProfile.matches)}</strong><span>{t('profile.matches')}</span></Card><Card><strong>{formatNumber(currentProfile.goals)}</strong><span>{t('profile.goals')}</span></Card><Card><strong>{formatNumber(currentProfile.assists)}</strong><span>{t('profile.assists')}</span></Card><Card><strong>{formatNumber(demoPeladas.length)}</strong><span>{t('profile.peladasCount')}</span></Card></div>
  </div>
}
