import { Compass, House, LogOut, Plus, UserRound } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getAuthAvatarUrl, getAuthDisplayName, useAuth } from '../lib/auth'
import { LocaleSelect, useI18n } from '../lib/i18n'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'
import { Avatar } from './ui'

export function AppShell() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const displayName = getAuthDisplayName(user, profile)
  const username = profile?.username ? `@${profile.username}` : user?.email ?? '@marcos'
  const profileSlug = profile?.username ?? 'marcos'
  const avatarUrl = getAuthAvatarUrl(user)
  const links = [
    { to: '/app', label: t('home'), icon: House },
    { to: '/descobrir', label: t('discover'), icon: Compass },
    { to: '/criar', label: t('create'), icon: Plus },
    { to: `/u/${profileSlug}`, label: t('profile'), icon: UserRound },
  ]

  const handleSignOut = async () => {
    await signOut()
    navigate('/entrar', { replace: true })
  }

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">Saltar para o conteúdo</a>
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Navegação principal">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'side-link active' : 'side-link'}>
              <Icon size={20} aria-hidden="true"/><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Avatar name={displayName} size="sm" src={avatarUrl}/>
          <div className="account-copy"><strong>{displayName}</strong><small>{username}</small></div>
          {user && (
            <button className="account-signout" type="button" aria-label="Sair da conta" title="Sair" onClick={handleSignOut}>
              <LogOut size={16}/>
            </button>
          )}
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <Brand />
          <div className="topbar-actions">
            <LocaleSelect compact />
            <ThemeToggle />
            <Avatar name={displayName} size="sm" src={avatarUrl}/>
            {user && (
              <button className="account-signout" type="button" aria-label="Sair da conta" title="Sair" onClick={handleSignOut}>
                <LogOut size={16}/>
              </button>
            )}
          </div>
        </header>
        <main id="main-content"><Outlet /></main>
      </div>
      <nav className="bottom-nav" aria-label="Navegação móvel">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icon size={21} aria-hidden="true"/><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
