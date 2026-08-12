import { Compass, House, Plus, UserRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { LocaleSelect, useI18n } from '../lib/i18n'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'
import { Avatar } from './ui'

export function AppShell() {
  const { t } = useI18n()
  const links = [
    { to: '/app', label: t('home'), icon: House },
    { to: '/descobrir', label: t('discover'), icon: Compass },
    { to: '/criar', label: t('create'), icon: Plus },
    { to: '/u/marcos', label: t('profile'), icon: UserRound },
  ]
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
          <Avatar name="Marcos Ramos" size="sm" />
          <div><strong>Marcos Ramos</strong><small>@marcos</small></div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <Brand />
          <div className="topbar-actions"><LocaleSelect compact /><ThemeToggle /><Avatar name="Marcos Ramos" size="sm" /></div>
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
