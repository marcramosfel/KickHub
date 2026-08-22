import { CalendarDays, MapPin, Settings, Share2, Shield, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CardCollection } from '../components/PlayerCards'
import { computePlayerCards } from '../domain/player-cards'
import { Avatar, Badge, Button, Card } from '../components/ui'
import { getAuthAvatarUrl, useAuth } from '../lib/auth'
import { useSignedAvatars } from '../lib/avatars'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { useMyPlayerProfile, type MyPlayerProfile, type PlayerProfileCommunity } from '../lib/player-profile'
import { roleLabel } from '../lib/role-label'

export function ProfilePage() {
  const { username = '' } = useParams()
  const { t } = useI18n()
  const { user, profile: authProfile } = useAuth()
  const playerProfile = useMyPlayerProfile(user?.id)

  if (!user) return <ProfileState/>

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
  // A foto do bucket privado precisa de assinatura; a do OAuth já é um URL e
  // fica como recurso, tal como as iniciais ficam por baixo das duas.
  const storedAvatar = useSignedAvatars([
    { id: profile.id, path: profile.avatarPath, bucket: profile.avatarBucket },
  ]).get(profile.id)

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
        <Avatar name={profile.displayName} size="lg" src={storedAvatar ?? profile.avatarUrl ?? avatarFallback}/>
        <div>
          <div className="profile-name"><h1>{profile.displayName}</h1><Badge tone="lime">{t('profile.verified')}</Badge></div>
          <p>@{profile.username}{profile.city || profile.countryCode ? <> · <MapPin/> {[profile.city, profile.countryCode].filter(Boolean).join(', ')}</> : null}</p>
          <span className="position-pill">{position ? t(`squad.pos${position}` as TranslationKey) : t('profile.noPosition')}</span>
        </div>
        <div className="profile-actions"><Link className="btn btn-outline btn-md" to="/conta"><Settings/> {t('profileForm.editProfile')}</Link><Button variant="outline" onClick={share}><Share2/> {t('profile.share')}</Button></div>
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
        <div className="section-title-row"><div><span className="eyebrow dark-text">{t('cards.eyebrow')}</span><h2>{t('cards.title')}</h2></div></div>
        {peladas.length ? peladas.map((pelada) => (
          <PeladaCards
            key={pelada.id}
            community={pelada}
            name={profile.displayName}
            avatar={storedAvatar ?? profile.avatarUrl ?? avatarFallback}
          />
        )) : <Card className="profile-empty"><p>{t('cards.emptyBody')}</p></Card>}
      </section>
    </div>
  </div>
}

/**
 * Os cards de um jogador numa pelada.
 *
 * Sem o Rei da Pelada nem o Paredão: o perfil traz uma linha por pelada e não o
 * plantel de cada uma, e coroar alguém a partir de uma linha só era coroar toda
 * a gente. Os títulos, esses, já vêm calculados contra o plantel.
 */
function PeladaCards({ community, name, avatar }: {
  community: PlayerProfileCommunity
  name: string
  avatar?: string
}) {
  const cards = computePlayerCards({
    membershipId: community.membershipId,
    displayName: name,
    playerType: community.playerType === 'GOALKEEPER' ? 'GOALKEEPER' : 'FIELD',
    primaryPosition: community.primaryPosition,
    secondaryPosition: community.secondaryPosition,
    // O perfil não guarda esta preferência; sem ela o Coringa não se atribui,
    // que é melhor do que o atribuir a quem não a escolheu.
    acceptsOtherPositions: false,
    overall: community.overall?.overall ?? null,
    provisional: community.overall?.provisional ?? true,
    titles: community.titles,
    gamesPlayed: community.stats.gamesPlayed,
    goals: community.stats.goals,
    assists: community.stats.assists,
    wins: community.stats.wins,
    saves: community.stats.saves,
    craques: community.stats.craques,
    currentWinStreak: community.stats.currentWinStreak,
    bestUnbeatenStreak: community.stats.bestUnbeatenStreak,
    gkCleanSheets: community.stats.gkCleanSheets,
  })
  return (
    <Card className="profile-cards">
      <Link className="profile-cards-pelada" to={`/p/${community.slug}`}>{community.name}</Link>
      <CardCollection
        cards={cards}
        name={name}
        overall={community.overall?.overall ?? null}
        avatar={avatar}
        peladaName={community.name}
      />
    </Card>
  )
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
