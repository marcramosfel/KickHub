import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'claim.title': 'Tens histórico na Pelada Browns?',
  'claim.body': 'Cola aqui o código que a Browns te deu. O teu histórico — jogos, golos, avaliações — passa a estar nesta conta.',
  'claim.label': 'Código de transferência',
  'claim.hint': 'Com ou sem hífenes, tanto faz. É válido durante 30 minutos.',
  'claim.submit': 'Reclamar o meu histórico',
  'claim.claiming': 'A reclamar…',
  'claim.privacy': 'Não partilhes este código: quem o tiver fica com o teu histórico.',
  'claim.errorINVALID_CLAIM': 'Esse código não confere. Confirma que o copiaste inteiro.',
  'claim.errorCLAIM_ALREADY_USED': 'Este código já foi usado.',
  'claim.errorCLAIM_EXPIRED': 'Este código expirou. Pede um novo na Browns.',
  'claim.errorALREADY_CLAIMED': 'Esse histórico já tem dono.',
  'claim.errorACCOUNT_ALREADY_LINKED': 'Esta conta já está ligada a um jogador.',
  'claim.errorTOO_MANY_ATTEMPTS': 'Demasiadas tentativas. Espera um quarto de hora e tenta de novo.',
  'claim.errorAUTH_REQUIRED': 'Inicia sessão antes de reclamar o histórico.',
  'claim.errorUNKNOWN': 'Não foi possível reclamar agora. Tenta novamente.',
} as const satisfies Record<string, TranslationValue>

type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'claim.title': 'Do you have history at Pelada Browns?',
  'claim.body': 'Paste the code Browns gave you. Your history — matches, goals, ratings — moves to this account.',
  'claim.label': 'Transfer code',
  'claim.hint': 'With or without dashes, either works. It is valid for 30 minutes.',
  'claim.submit': 'Claim my history',
  'claim.claiming': 'Claiming…',
  'claim.privacy': 'Do not share this code: whoever has it gets your history.',
  'claim.errorINVALID_CLAIM': 'That code does not match. Check you copied all of it.',
  'claim.errorCLAIM_ALREADY_USED': 'This code has already been used.',
  'claim.errorCLAIM_EXPIRED': 'This code expired. Ask Browns for a new one.',
  'claim.errorALREADY_CLAIMED': 'That history already has an owner.',
  'claim.errorACCOUNT_ALREADY_LINKED': 'This account is already linked to a player.',
  'claim.errorTOO_MANY_ATTEMPTS': 'Too many attempts. Wait fifteen minutes and try again.',
  'claim.errorAUTH_REQUIRED': 'Sign in before claiming your history.',
  'claim.errorUNKNOWN': 'We could not claim it right now. Try again.',
}

const es: Record<Key, TranslationValue> = {
  'claim.title': '¿Tienes historial en Pelada Browns?',
  'claim.body': 'Pega aquí el código que te dio Browns. Tu historial — partidos, goles, valoraciones — pasa a esta cuenta.',
  'claim.label': 'Código de transferencia',
  'claim.hint': 'Con o sin guiones, da igual. Vale durante 30 minutos.',
  'claim.submit': 'Reclamar mi historial',
  'claim.claiming': 'Reclamando…',
  'claim.privacy': 'No compartas este código: quien lo tenga se queda con tu historial.',
  'claim.errorINVALID_CLAIM': 'Ese código no coincide. Comprueba que lo copiaste entero.',
  'claim.errorCLAIM_ALREADY_USED': 'Este código ya se usó.',
  'claim.errorCLAIM_EXPIRED': 'Este código caducó. Pide uno nuevo en Browns.',
  'claim.errorALREADY_CLAIMED': 'Ese historial ya tiene dueño.',
  'claim.errorACCOUNT_ALREADY_LINKED': 'Esta cuenta ya está vinculada a un jugador.',
  'claim.errorTOO_MANY_ATTEMPTS': 'Demasiados intentos. Espera un cuarto de hora e inténtalo de nuevo.',
  'claim.errorAUTH_REQUIRED': 'Inicia sesión antes de reclamar el historial.',
  'claim.errorUNKNOWN': 'No pudimos reclamarlo ahora. Inténtalo de nuevo.',
}

const fr: Record<Key, TranslationValue> = {
  'claim.title': 'Tu as un historique à la Pelada Browns ?',
  'claim.body': 'Colle ici le code que Browns t’a donné. Ton historique — matchs, buts, notes — passe sur ce compte.',
  'claim.label': 'Code de transfert',
  'claim.hint': 'Avec ou sans tirets, peu importe. Valable 30 minutes.',
  'claim.submit': 'Récupérer mon historique',
  'claim.claiming': 'Récupération…',
  'claim.privacy': 'Ne partage pas ce code : celui qui l’a récupère ton historique.',
  'claim.errorINVALID_CLAIM': 'Ce code ne correspond pas. Vérifie que tu l’as copié en entier.',
  'claim.errorCLAIM_ALREADY_USED': 'Ce code a déjà été utilisé.',
  'claim.errorCLAIM_EXPIRED': 'Ce code a expiré. Demande-en un nouveau à Browns.',
  'claim.errorALREADY_CLAIMED': 'Cet historique a déjà un propriétaire.',
  'claim.errorACCOUNT_ALREADY_LINKED': 'Ce compte est déjà lié à un joueur.',
  'claim.errorTOO_MANY_ATTEMPTS': 'Trop de tentatives. Attends un quart d’heure et réessaie.',
  'claim.errorAUTH_REQUIRED': 'Connecte-toi avant de récupérer ton historique.',
  'claim.errorUNKNOWN': 'Impossible de le récupérer maintenant. Réessaie.',
}

const de: Record<Key, TranslationValue> = {
  'claim.title': 'Hast du eine Historie bei Pelada Browns?',
  'claim.body': 'Füge hier den Code ein, den Browns dir gegeben hat. Deine Historie — Spiele, Tore, Bewertungen — wandert zu diesem Konto.',
  'claim.label': 'Transfercode',
  'claim.hint': 'Mit oder ohne Bindestriche, beides geht. Er gilt 30 Minuten.',
  'claim.submit': 'Meine Historie übernehmen',
  'claim.claiming': 'Wird übernommen…',
  'claim.privacy': 'Teile diesen Code nicht: wer ihn hat, bekommt deine Historie.',
  'claim.errorINVALID_CLAIM': 'Dieser Code passt nicht. Prüfe, ob du ihn vollständig kopiert hast.',
  'claim.errorCLAIM_ALREADY_USED': 'Dieser Code wurde bereits benutzt.',
  'claim.errorCLAIM_EXPIRED': 'Dieser Code ist abgelaufen. Hol dir bei Browns einen neuen.',
  'claim.errorALREADY_CLAIMED': 'Diese Historie hat bereits einen Besitzer.',
  'claim.errorACCOUNT_ALREADY_LINKED': 'Dieses Konto ist bereits mit einem Spieler verknüpft.',
  'claim.errorTOO_MANY_ATTEMPTS': 'Zu viele Versuche. Warte eine Viertelstunde und versuch es erneut.',
  'claim.errorAUTH_REQUIRED': 'Melde dich an, bevor du deine Historie übernimmst.',
  'claim.errorUNKNOWN': 'Wir konnten sie gerade nicht übernehmen. Versuch es erneut.',
}

export const claimCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
