import type { LocalizedNamespace, TranslationValue } from './types'

const pt = {
  'common.home': 'Início',
  'common.brandHome': 'KickHub — início',
  'common.discover': 'Descobrir',
  'common.createPelada': 'Criar pelada',
  'common.profile': 'Perfil',
  'common.signIn': 'Entrar',
  'common.player': 'Jogador',
  'common.skipToContent': 'Saltar para o conteúdo',
  'common.mainNavigation': 'Navegação principal',
  'common.mobileNavigation': 'Navegação móvel',
  'common.signOutAccount': 'Sair da conta',
  'common.signOut': 'Sair',
  'common.useLightTheme': 'Usar tema claro',
  'common.useDarkTheme': 'Usar tema escuro',
  'common.language': 'Idioma',
  'common.notFoundEyebrow': '404 · BOLA FORA',
  'common.notFoundTitle': 'Esta página saiu pela linha lateral.',
  'common.notFoundBody': 'Volta ao campo e continua o jogo.',
  'common.goHome': 'Ir para o início',
} as const satisfies Record<string, TranslationValue>

type Key = keyof typeof pt

const en: Record<Key, TranslationValue> = {
  'common.home': 'Home', 'common.brandHome': 'KickHub — home', 'common.discover': 'Discover', 'common.createPelada': 'Create group', 'common.profile': 'Profile',
  'common.signIn': 'Sign in', 'common.player': 'Player', 'common.skipToContent': 'Skip to content',
  'common.mainNavigation': 'Main navigation', 'common.mobileNavigation': 'Mobile navigation',
  'common.signOutAccount': 'Sign out of your account', 'common.signOut': 'Sign out',
  'common.useLightTheme': 'Use light theme', 'common.useDarkTheme': 'Use dark theme', 'common.language': 'Language',
  'common.notFoundEyebrow': '404 · OUT OF PLAY', 'common.notFoundTitle': 'This page went out for a throw-in.',
  'common.notFoundBody': 'Get back on the pitch and keep the game going.', 'common.goHome': 'Go to home',
}

const es: Record<Key, TranslationValue> = {
  'common.home': 'Inicio', 'common.brandHome': 'KickHub — inicio', 'common.discover': 'Descubrir', 'common.createPelada': 'Crear grupo', 'common.profile': 'Perfil',
  'common.signIn': 'Entrar', 'common.player': 'Jugador', 'common.skipToContent': 'Saltar al contenido',
  'common.mainNavigation': 'Navegación principal', 'common.mobileNavigation': 'Navegación móvil',
  'common.signOutAccount': 'Cerrar sesión', 'common.signOut': 'Salir',
  'common.useLightTheme': 'Usar tema claro', 'common.useDarkTheme': 'Usar tema oscuro', 'common.language': 'Idioma',
  'common.notFoundEyebrow': '404 · BALÓN FUERA', 'common.notFoundTitle': 'Esta página se fue por la banda.',
  'common.notFoundBody': 'Vuelve al campo y sigue el partido.', 'common.goHome': 'Ir al inicio',
}

const fr: Record<Key, TranslationValue> = {
  'common.home': 'Accueil', 'common.brandHome': 'KickHub — accueil', 'common.discover': 'Découvrir', 'common.createPelada': 'Créer un groupe', 'common.profile': 'Profil',
  'common.signIn': 'Connexion', 'common.player': 'Joueur', 'common.skipToContent': 'Aller au contenu',
  'common.mainNavigation': 'Navigation principale', 'common.mobileNavigation': 'Navigation mobile',
  'common.signOutAccount': 'Se déconnecter du compte', 'common.signOut': 'Déconnexion',
  'common.useLightTheme': 'Utiliser le thème clair', 'common.useDarkTheme': 'Utiliser le thème sombre', 'common.language': 'Langue',
  'common.notFoundEyebrow': '404 · BALLON SORTI', 'common.notFoundTitle': 'Cette page est sortie en touche.',
  'common.notFoundBody': 'Reviens sur le terrain et continue le match.', 'common.goHome': 'Aller à l’accueil',
}

const de: Record<Key, TranslationValue> = {
  'common.home': 'Start', 'common.brandHome': 'KickHub — Startseite', 'common.discover': 'Entdecken', 'common.createPelada': 'Gruppe erstellen', 'common.profile': 'Profil',
  'common.signIn': 'Anmelden', 'common.player': 'Spieler', 'common.skipToContent': 'Zum Inhalt springen',
  'common.mainNavigation': 'Hauptnavigation', 'common.mobileNavigation': 'Mobile Navigation',
  'common.signOutAccount': 'Vom Konto abmelden', 'common.signOut': 'Abmelden',
  'common.useLightTheme': 'Helles Design verwenden', 'common.useDarkTheme': 'Dunkles Design verwenden', 'common.language': 'Sprache',
  'common.notFoundEyebrow': '404 · BALL IM AUS', 'common.notFoundTitle': 'Diese Seite ist ins Seitenaus gegangen.',
  'common.notFoundBody': 'Zurück auf den Platz und weiter geht das Spiel.', 'common.goHome': 'Zur Startseite',
}

export const commonCatalog: LocalizedNamespace<Key> = { pt, en, es, fr, de }
