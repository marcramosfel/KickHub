import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'notifications.label': 'Notificações',
  'notifications.open': 'Abrir notificações',
  'notifications.unread': { one: '{count} por ler', other: '{count} por ler' },
  'notifications.markRead': 'Marcar como lidas',
  'notifications.marking': 'A marcar…',
  'notifications.empty': 'Nada de novo por aqui.',
  'notifications.emptyBody': 'Avisamos-te quando houver jogo marcado ou resposta a um pedido.',
  'notifications.loading': 'A carregar notificações',
  'notifications.error': 'Não conseguimos carregar as notificações.',
  'notifications.gameCreated': 'Novo jogo marcado para {date}.',
  'notifications.gameCancelled': 'O jogo de {date} foi cancelado.',
  'notifications.joinApproved': 'O teu pedido foi aprovado. Já podes entrar.',
  'notifications.joinRejected': 'O teu pedido não foi aprovado desta vez.',
  'notifications.promoted': 'Passaste a admin desta pelada.',
  'notifications.demoted': 'Deixaste de ser admin desta pelada.',
} as const satisfies Record<string, TranslationValue>

type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'notifications.label': 'Notifications',
  'notifications.open': 'Open notifications',
  'notifications.unread': { one: '{count} unread', other: '{count} unread' },
  'notifications.markRead': 'Mark as read',
  'notifications.marking': 'Marking…',
  'notifications.empty': 'Nothing new here.',
  'notifications.emptyBody': 'We will tell you when a match is scheduled or a request gets an answer.',
  'notifications.loading': 'Loading notifications',
  'notifications.error': 'We could not load the notifications.',
  'notifications.gameCreated': 'New match scheduled for {date}.',
  'notifications.gameCancelled': 'The match on {date} was cancelled.',
  'notifications.joinApproved': 'Your request was approved. You are in.',
  'notifications.joinRejected': 'Your request was not approved this time.',
  'notifications.promoted': 'You are now an admin of this group.',
  'notifications.demoted': 'You are no longer an admin of this group.',
}

const es: Record<Key, TranslationValue> = {
  'notifications.label': 'Notificaciones',
  'notifications.open': 'Abrir notificaciones',
  'notifications.unread': { one: '{count} sin leer', other: '{count} sin leer' },
  'notifications.markRead': 'Marcar como leídas',
  'notifications.marking': 'Marcando…',
  'notifications.empty': 'Nada nuevo por aquí.',
  'notifications.emptyBody': 'Te avisamos cuando haya partido programado o respuesta a una solicitud.',
  'notifications.loading': 'Cargando notificaciones',
  'notifications.error': 'No pudimos cargar las notificaciones.',
  'notifications.gameCreated': 'Nuevo partido programado para el {date}.',
  'notifications.gameCancelled': 'El partido del {date} fue cancelado.',
  'notifications.joinApproved': 'Tu solicitud fue aprobada. Ya puedes entrar.',
  'notifications.joinRejected': 'Tu solicitud no fue aprobada esta vez.',
  'notifications.promoted': 'Ahora eres admin de este grupo.',
  'notifications.demoted': 'Ya no eres admin de este grupo.',
}

const fr: Record<Key, TranslationValue> = {
  'notifications.label': 'Notifications',
  'notifications.open': 'Ouvrir les notifications',
  'notifications.unread': { one: '{count} non lue', other: '{count} non lues' },
  'notifications.markRead': 'Marquer comme lues',
  'notifications.marking': 'Marquage…',
  'notifications.empty': 'Rien de neuf ici.',
  'notifications.emptyBody': 'On te prévient dès qu’un match est programmé ou qu’une demande reçoit une réponse.',
  'notifications.loading': 'Chargement des notifications',
  'notifications.error': 'Impossible de charger les notifications.',
  'notifications.gameCreated': 'Nouveau match programmé pour le {date}.',
  'notifications.gameCancelled': 'Le match du {date} a été annulé.',
  'notifications.joinApproved': 'Ta demande a été acceptée. Tu es des nôtres.',
  'notifications.joinRejected': 'Ta demande n’a pas été acceptée cette fois.',
  'notifications.promoted': 'Tu es maintenant admin de ce groupe.',
  'notifications.demoted': 'Tu n’es plus admin de ce groupe.',
}

const de: Record<Key, TranslationValue> = {
  'notifications.label': 'Benachrichtigungen',
  'notifications.open': 'Benachrichtigungen öffnen',
  'notifications.unread': { one: '{count} ungelesen', other: '{count} ungelesen' },
  'notifications.markRead': 'Als gelesen markieren',
  'notifications.marking': 'Wird markiert…',
  'notifications.empty': 'Hier gibt es nichts Neues.',
  'notifications.emptyBody': 'Wir sagen Bescheid, sobald ein Spiel angesetzt wird oder eine Anfrage beantwortet ist.',
  'notifications.loading': 'Benachrichtigungen werden geladen',
  'notifications.error': 'Die Benachrichtigungen konnten nicht geladen werden.',
  'notifications.gameCreated': 'Neues Spiel angesetzt für {date}.',
  'notifications.gameCancelled': 'Das Spiel am {date} wurde abgesagt.',
  'notifications.joinApproved': 'Deine Anfrage wurde angenommen. Du bist dabei.',
  'notifications.joinRejected': 'Deine Anfrage wurde diesmal nicht angenommen.',
  'notifications.promoted': 'Du bist jetzt Admin dieser Gruppe.',
  'notifications.demoted': 'Du bist nicht mehr Admin dieser Gruppe.',
}

export const notificationsCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
