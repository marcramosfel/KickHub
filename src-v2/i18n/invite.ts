import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'invite.badge': 'CONVITE PRIVADO',
  'invite.loading': 'A validar o convite…',
  'invite.eyebrow': 'FOSTE CONVOCADO',
  'invite.title': 'Entra na {name}.',
  'invite.location': 'Local',
  'invite.community': 'Comunidade',
  'invite.nextMatch': 'Próximo jogo',
  'invite.noMatch': 'A anunciar',
  'invite.secureTitle': 'Entrada segura',
  'invite.secureBody': 'O convite concede acesso como jogador. As permissões administrativas continuam protegidas.',
  'invite.accept': 'Aceitar convite',
  'invite.accepting': 'A entrar…',
  'invite.error': 'Este convite expirou, foi revogado ou já atingiu o limite de utilizações.',
  'invite.footnote': 'Ao aceitar, esta pelada aparece em “Minhas peladas”.',
} as const satisfies Record<string, TranslationValue>

type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'invite.badge': 'PRIVATE INVITE',
  'invite.loading': 'Validating the invite…',
  'invite.eyebrow': 'YOU HAVE BEEN CALLED UP',
  'invite.title': 'Join {name}.',
  'invite.location': 'Location',
  'invite.community': 'Community',
  'invite.nextMatch': 'Next match',
  'invite.noMatch': 'To be announced',
  'invite.secureTitle': 'Secure entry',
  'invite.secureBody': 'The invite grants player access. Administrative permissions remain protected.',
  'invite.accept': 'Accept invite',
  'invite.accepting': 'Joining…',
  'invite.error': 'This invite has expired, was revoked or already reached its usage limit.',
  'invite.footnote': 'Once accepted, this group shows up in “My groups”.',
}

const es: Record<Key, TranslationValue> = {
  'invite.badge': 'INVITACIÓN PRIVADA',
  'invite.loading': 'Validando la invitación…',
  'invite.eyebrow': 'TE HAN CONVOCADO',
  'invite.title': 'Entra en {name}.',
  'invite.location': 'Lugar',
  'invite.community': 'Comunidad',
  'invite.nextMatch': 'Próximo partido',
  'invite.noMatch': 'Por anunciar',
  'invite.secureTitle': 'Entrada segura',
  'invite.secureBody': 'La invitación da acceso como jugador. Los permisos administrativos siguen protegidos.',
  'invite.accept': 'Aceptar invitación',
  'invite.accepting': 'Entrando…',
  'invite.error': 'Esta invitación caducó, fue revocada o ya alcanzó su límite de usos.',
  'invite.footnote': 'Al aceptar, este grupo aparece en “Mis grupos”.',
}

const fr: Record<Key, TranslationValue> = {
  'invite.badge': 'INVITATION PRIVÉE',
  'invite.loading': 'Validation de l’invitation…',
  'invite.eyebrow': 'TU AS ÉTÉ CONVOQUÉ',
  'invite.title': 'Rejoins {name}.',
  'invite.location': 'Lieu',
  'invite.community': 'Communauté',
  'invite.nextMatch': 'Prochain match',
  'invite.noMatch': 'À annoncer',
  'invite.secureTitle': 'Entrée sécurisée',
  'invite.secureBody': 'L’invitation donne un accès joueur. Les permissions d’administration restent protégées.',
  'invite.accept': 'Accepter l’invitation',
  'invite.accepting': 'Connexion…',
  'invite.error': 'Cette invitation a expiré, a été révoquée ou a atteint sa limite d’utilisations.',
  'invite.footnote': 'Une fois acceptée, ce groupe apparaît dans « Mes groupes ».',
}

const de: Record<Key, TranslationValue> = {
  'invite.badge': 'PRIVATE EINLADUNG',
  'invite.loading': 'Einladung wird geprüft…',
  'invite.eyebrow': 'DU WURDEST NOMINIERT',
  'invite.title': 'Tritt {name} bei.',
  'invite.location': 'Ort',
  'invite.community': 'Community',
  'invite.nextMatch': 'Nächstes Spiel',
  'invite.noMatch': 'Wird angekündigt',
  'invite.secureTitle': 'Sicherer Beitritt',
  'invite.secureBody': 'Die Einladung gewährt Spielerzugang. Administrative Rechte bleiben geschützt.',
  'invite.accept': 'Einladung annehmen',
  'invite.accepting': 'Beitritt läuft…',
  'invite.error': 'Diese Einladung ist abgelaufen, wurde widerrufen oder hat ihr Nutzungslimit erreicht.',
  'invite.footnote': 'Nach der Annahme erscheint diese Gruppe in „Meine Gruppen“.',
}

export const inviteCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
