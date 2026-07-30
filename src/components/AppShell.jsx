import { useEffect, useRef, useState } from 'react'
import { APP_NAME } from '../config'
import Avatar from './Avatar'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useModal } from '../hooks/useModal'
import { colors, fonts } from '../theme'

// Navegação da app.
//
// Desktop: barra superior sticky com todas as secções à vista — o pedido era
// explícito, nada de esconder páginas principais dentro de menus.
// Telemóvel: barra fixa em baixo com os cinco destinos mais usados, mais um
// botão "Mais" na barra de cima para as páginas menos frequentes.

export const NAV_PRINCIPAIS = [
  { id: 'home', label: 'Início', curto: 'Início', icon: '🏠' },
  { id: 'next', label: 'Próximo jogo', curto: 'Jogo', icon: '📅' },
  { id: 'ranking', label: 'Ranking', curto: 'Ranking', icon: '🏅' },
  { id: 'draws', label: 'Sorteios', curto: 'Sorteio', icon: '🎲' },
  { id: 'profile', label: 'Perfil', curto: 'Perfil', icon: '👤' },
]

export const NAV_SECUNDARIAS = [
  { id: 'players', label: 'Jogadores', icon: '👥' },
  { id: 'stats', label: 'Estatísticas', icon: '📊' },
  { id: 'history', label: 'Histórico', icon: '📜' },
]

const NAV_ADMIN = { id: 'admin', label: 'Administração', icon: '🛠️' }

function Logo({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ir para o início"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'none',
        border: 'none',
        padding: '4px 6px',
        borderRadius: 10,
        flexShrink: 0,
      }}
    >
      <span aria-hidden style={{ fontSize: 20 }}>
        ⚖️
      </span>
      <span
        style={{
          ...{ fontFamily: fonts.title, textTransform: 'uppercase', letterSpacing: 1.2 },
          fontSize: 17,
          fontWeight: 700,
          color: colors.text,
          whiteSpace: 'nowrap',
        }}
      >
        {APP_NAME.main} <span style={{ color: colors.grass }}>{APP_NAME.accent}</span>
      </span>
    </button>
  )
}

// Menu do utilizador (avatar + nome + sair), fechado por defeito.
function UserMenu({ session, foto, onProfile, onLogout }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Menu de ${session.name}`}
        className="pb-tab"
        style={{ gap: 8 }}
      >
        <Avatar name={session.name} photo={foto} size={28} />
        <span className="pb-truncate" style={{ maxWidth: 130, fontSize: 14 }}>
          {session.name}
        </span>
        <span aria-hidden style={{ color: colors.muted, fontSize: 11 }}>
          ▾
        </span>
      </button>
      {aberto && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            minWidth: 190,
            background: colors.panel,
            border: `1px solid ${colors.line}`,
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            padding: 6,
            zIndex: 70,
          }}
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setAberto(false)
              onProfile()
            }}
            className="pb-menuitem"
          >
            👤 O meu perfil
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setAberto(false)
              onLogout()
            }}
            className="pb-menuitem"
            style={{ color: colors.error }}
          >
            ↩ Sair
          </button>
        </div>
      )}
    </div>
  )
}

// Menu "Mais" do telemóvel: as páginas que não cabem nos cinco destinos, mais
// a identificação de quem está a usar a app e o botão de sair — no telemóvel
// não há menu do utilizador, e sem isto não havia forma nenhuma de sair.
function MoreMenu({ view, session, foto, onNavigate, onLogout, isAdmin, onAdmin }) {
  const [aberto, setAberto] = useState(false)
  const itens = [...NAV_SECUNDARIAS, ...(isAdmin ? [NAV_ADMIN] : [])]

  // Escape, tranca do scroll do fundo, foco para dentro e foco devolvido ao
  // botão — tudo em `useModal`, para o próximo modal da app não repetir isto.
  const { ref: caixa, aoClicarNoFundo } = useModal(aberto, () => setAberto(false))

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Mais páginas"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className="pb-tab"
        style={{ padding: '8px 12px' }}
      >
        <span aria-hidden>☰</span>
        <span style={{ fontSize: 14 }}>Mais</span>
      </button>

      {aberto && (
        <div
          className="pb-overlay"
          aria-hidden={false}
          onClick={aoClicarNoFundo}
        >
          {/* o `role="dialog"` vive na folha, não no fundo: um leitor de ecrã
              anunciava o diálogo e depois não encontrava lá nada dentro */}
          <div
            ref={caixa}
            className="pb-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Mais páginas"
          >
            {session && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  paddingBottom: 12,
                  marginBottom: 10,
                  borderBottom: `1px solid ${colors.line}`,
                }}
              >
                <Avatar name={session.name} photo={foto} size={34} />
                <span className="pb-truncate" style={{ fontWeight: 700, fontSize: 15 }}>
                  {session.name}
                </span>
              </div>
            )}
            <div
              style={{
                fontFamily: fonts.title,
                letterSpacing: 1,
                fontSize: 15,
                marginBottom: 10,
              }}
            >
              Mais páginas
            </div>
            {itens.map((it) => (
              <button
                key={it.id}
                type="button"
                className="pb-menuitem"
                aria-current={view === it.id ? 'page' : undefined}
                style={{
                  fontSize: 15,
                  padding: '13px 12px',
                  color: view === it.id ? colors.grass : colors.text,
                }}
                onClick={() => {
                  setAberto(false)
                  if (it.id === 'admin') onAdmin()
                  else onNavigate(it.id)
                }}
              >
                <span aria-hidden style={{ marginRight: 10 }}>
                  {it.icon}
                </span>
                {it.label}
              </button>
            ))}
            {onLogout && (
              <>
                <div
                  aria-hidden
                  style={{ height: 1, background: colors.line, margin: '8px 0' }}
                />
                <button
                  type="button"
                  className="pb-menuitem"
                  style={{ fontSize: 15, padding: '13px 12px', color: colors.error }}
                  onClick={() => {
                    setAberto(false)
                    onLogout()
                  }}
                >
                  <span aria-hidden style={{ marginRight: 10 }}>
                    ↩
                  </span>
                  Sair
                </button>
              </>
            )}
            <button
              type="button"
              className="pb-menuitem"
              style={{ marginTop: 6, color: colors.muted }}
              onClick={() => setAberto(false)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default function AppShell({
  session,
  foto,
  view,
  onNavigate,
  onAdmin,
  onLogout,
  children,
  avisos = null,
}) {
  const isDesktop = useIsDesktop()

  const tab = (item) => (
    <button
      key={item.id}
      type="button"
      onClick={() => onNavigate(item.id)}
      className={`pb-tab${view === item.id ? ' is-active' : ''}`}
      aria-current={view === item.id ? 'page' : undefined}
    >
      <span aria-hidden>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  )

  return (
    <div className="pb-pitch-bg" style={{ minHeight: '100vh' }}>
      {/* ---------- barra superior ---------- */}
      <header className="pb-topbar">
        <div className="pb-container pb-topbar-inner">
          <Logo onClick={() => onNavigate('home')} />

          {/* desktop: todas as secções à vista */}
          <nav className="pb-nav-desktop" aria-label="Navegação principal">
            {NAV_PRINCIPAIS.filter((i) => i.id !== 'profile').map(tab)}
            {NAV_SECUNDARIAS.map(tab)}
            {session?.is_admin && (
              <button
                type="button"
                onClick={onAdmin}
                className={`pb-tab${view === 'admin' ? ' is-active' : ''}`}
                aria-current={view === 'admin' ? 'page' : undefined}
              >
                <span aria-hidden>{NAV_ADMIN.icon}</span>
                <span>{NAV_ADMIN.label}</span>
              </button>
            )}
          </nav>

          <div className="pb-topbar-right">
            {!isDesktop && (
              <MoreMenu
                view={view}
                session={session}
                foto={foto}
                onNavigate={onNavigate}
                onLogout={onLogout}
                isAdmin={!!session?.is_admin}
                onAdmin={onAdmin}
              />
            )}
            {isDesktop && session && (
              <UserMenu
                session={session}
                foto={foto}
                onProfile={() => onNavigate('profile')}
                onLogout={onLogout}
              />
            )}
          </div>
        </div>
      </header>

      {avisos}

      <main className="pb-container pb-with-bottomnav" style={{ paddingTop: 18 }}>
        {children}
      </main>

      {/* ---------- barra inferior (telemóvel) ---------- */}
      <nav className="pb-bottomnav" aria-label="Navegação principal">
        {NAV_PRINCIPAIS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`pb-bottomnav-item${view === item.id ? ' is-active' : ''}`}
            aria-current={view === item.id ? 'page' : undefined}
            aria-label={item.label}
          >
            <span aria-hidden style={{ fontSize: 19, lineHeight: 1 }}>
              {item.icon}
            </span>
            <span style={{ fontSize: 11 }}>{item.curto}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
