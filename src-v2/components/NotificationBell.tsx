import { Bell, Check } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import {
  isKnownKind, unreadCount, useMarkNotificationsRead, useNotifications, type AppNotification,
} from '../lib/notifications'

/**
 * Disclosure, como o seletor de pelada: uma lista de avisos não precisa da
 * navegação por setas que o padrão de menu ARIA exigiria.
 */
export function NotificationBell() {
  const { t, formatNumber } = useI18n()
  const { user } = useAuth()
  const notifications = useNotifications(Boolean(user))
  const markRead = useMarkNotificationsRead()
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

  if (!user) return null

  const items = notifications.data ?? []
  const unread = unreadCount(items)

  return (
    <div className="notification-bell" ref={container}>
      <button
        ref={trigger}
        type="button"
        className="notification-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0
          ? `${t('notifications.open')} — ${t('notifications.unread', { count: unread })}`
          : t('notifications.open')}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={18} aria-hidden="true"/>
        {unread > 0 ? <span className="notification-dot">{formatNumber(unread)}</span> : null}
      </button>

      <div id={panelId} className="notification-panel" hidden={!open}>
        <header>
          <strong>{t('notifications.label')}</strong>
          {unread > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={markRead.isPending} onClick={() => markRead.mutate()}>
              {markRead.isPending ? t('notifications.marking') : t('notifications.markRead')}
            </button>
          ) : null}
        </header>

        {notifications.isPending ? (
          <p className="notification-empty" aria-busy="true">{t('notifications.loading')}</p>
        ) : notifications.isError ? (
          <p className="notification-empty" role="alert">{t('notifications.error')}</p>
        ) : items.length === 0 ? (
          <div className="notification-empty">
            <strong>{t('notifications.empty')}</strong>
            <small>{t('notifications.emptyBody')}</small>
          </div>
        ) : (
          <ul>
            {items.map((item) => <NotificationItem key={item.id} item={item}/>)}
          </ul>
        )}
      </div>
    </div>
  )
}

function NotificationItem({ item }: { item: AppNotification }) {
  const { t, formatDate } = useI18n()
  return (
    <li className={item.readAt === null ? 'unread' : undefined}>
      {item.readAt === null ? <i className="notification-unread-dot" aria-hidden="true"/> : <Check size={13} aria-hidden="true"/>}
      <div>
        <strong>{item.title}</strong>
        <small>{describe(item, t, formatDate)}</small>
      </div>
      <time dateTime={item.createdAt}>{formatDate(item.createdAt, { day: 'numeric', month: 'short' })}</time>
    </li>
  )
}

/**
 * A frase é montada aqui, no idioma de quem lê, a partir do tipo e do contexto.
 * Um tipo que o cliente ainda não conheça cai no texto guardado, para não
 * aparecer uma linha em branco.
 */
function describe(
  item: AppNotification,
  t: ReturnType<typeof useI18n>['t'],
  formatDate: ReturnType<typeof useI18n>['formatDate'],
) {
  if (!isKnownKind(item.kind)) return item.body ?? item.kind

  const date = item.scheduledAt
    ? formatDate(item.scheduledAt, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''

  switch (item.kind) {
    case 'game.created': return t('notifications.gameCreated', { date })
    case 'game.cancelled': return t('notifications.gameCancelled', { date })
    case 'join_request_approved': return t('notifications.joinApproved')
    case 'join_request_rejected': return t('notifications.joinRejected')
  }
}
