import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n } from '../lib/i18n'
import { roleLabel } from '../lib/role-label'

/**
 * Disclosure em vez de `role="menu"`: a lista é navegável por Tab e não promete
 * a navegação por setas que o padrão de menu ARIA exigiria.
 */
export function PeladaSwitcher() {
  const { t } = useI18n()
  const { pelada, peladas } = useCurrentPelada()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <div className="pelada-switcher" ref={container}>
      <button
        ref={trigger}
        type="button"
        className="pelada-switcher-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('pelada.switchLabel')}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronsUpDown size={16} aria-hidden="true"/>
      </button>
      <nav id={panelId} className="pelada-switcher-menu" aria-label={t('pelada.switchLabel')} hidden={!open}>
        <p className="eyebrow dark-text">{t('pelada.switchTitle')}</p>
        {peladas.map((item) => {
          const current = item.slug === pelada?.slug
          return (
            <Link
              key={item.id}
              to={`/p/${item.slug}`}
              aria-current={current ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <span className="pelada-monogram small" style={{ background: item.accent }}>
                {item.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </span>
              <span className="pelada-switcher-copy">
                <strong>{item.name}</strong>
                <small>{roleLabel(item.role, t)} · {t('dashboard.membersCount', { count: item.members })}</small>
              </span>
              {current ? <Check size={15} aria-hidden="true"/> : null}
            </Link>
          )
        })}
        <Link className="pelada-switcher-create" to="/criar" onClick={() => setOpen(false)}>
          <Plus size={15} aria-hidden="true"/> {t('dashboard.newPelada')}
        </Link>
      </nav>
    </div>
  )
}
