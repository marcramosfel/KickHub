import { Compass, House, LogOut, Plus, Settings, UserRound } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getAuthAvatarObject, getAuthAvatarUrl, getAuthDisplayName, useAuth } from '../lib/auth'
import { useSignedAvatars } from '../lib/avatars'
import { LocaleSelect, useI18n } from '../lib/i18n'
import { Brand } from './Brand'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { Avatar } from './ui'

export function AppShell() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const displayName = getAuthDisplayName(user, profile, t('common.player'))
  const username = profile?.username ? `@${profile.username}` : user?.email ?? ''
  const profileSlug = profile?.username ?? user?.id ?? 'perfil'
  const storedAvatar = useSignedAvatars([getAuthAvatarObject(profile)])
  // A foto do Storage manda; a do OAuth fica como recurso quando nao ha nenhuma.
  const avatarUrl = storedAvatar.get(profile?.id ?? 'me') ?? getAuthAvatarUrl(user, profile)
  // A barra de baixo tem quatro lugares e é o que cabe num telemóvel; a conta
  // fica só na lateral, porque é um sítio onde se entra de propósito e não uma
  // secção por onde se passa.
  const links = [
    { to: '/app', label: t('common.home'), icon: House },
    { to: '/descobrir', label: t('common.discover'), icon: Compass },
    { to: '/criar', label: t('common.createPelada'), icon: Plus },
    { to: `/u/${profileSlug}`, label: t('common.profile'), icon: UserRound },
  ]
  const sideLinks = [...links, { to: '/conta', label: t('common.account'), icon: Settings }]

  const handleSignOut = async () => {
    await signOut()
    navigate('/entrar', { replace: true })
  }

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">{t('common.skipToContent')}</a>
      <aside className="sidebar">
        <Brand ariaLabel={t('common.brandHome')} />
        <nav aria-label={t('common.mainNavigation')}>
          {sideLinks.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'side-link active' : 'side-link'}>
              <Icon size={20} aria-hidden="true"/><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {/* Estes controlos vivem na barra superior, que está escondida em
            desktop. Sem os repetir aqui, quem usa ecrã grande fica sem sino,
            sem seletor de idioma e sem alternador de tema dentro da app. */}
        <div className="sidebar-actions">
          <NotificationBell />
          <LocaleSelect compact />
          <ThemeToggle />
        </div>
        <div className="sidebar-foot">
          <Avatar name={displayName} size="sm" src={avatarUrl}/>
          <div className="account-copy"><strong>{displayName}</strong><small>{username}</small></div>
          {user && (
            <button className="account-signout" type="button" aria-label={t('common.signOutAccount')} title={t('common.signOut')} onClick={handleSignOut}>
              <LogOut size={16}/>
            </button>
          )}
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <Brand ariaLabel={t('common.brandHome')} />
          <div className="topbar-actions">
            <NotificationBell />
            <LocaleSelect compact />
            <ThemeToggle />
            <Avatar name={displayName} size="sm" src={avatarUrl}/>
            {user && (
              <button className="account-signout" type="button" aria-label={t('common.signOutAccount')} title={t('common.signOut')} onClick={handleSignOut}>
                <LogOut size={16}/>
              </button>
            )}
          </div>
        </header>
        <main id="main-content"><Outlet /></main>
      </div>
      <nav className="bottom-nav" aria-label={t('common.mobileNavigation')}>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icon size={21} aria-hidden="true"/><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
