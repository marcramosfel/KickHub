import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type Locale = 'pt' | 'en' | 'es' | 'fr' | 'de'
type TranslationKey = keyof typeof copy.pt

const copy = {
  pt: { home: 'Início', discover: 'Descobrir', create: 'Criar pelada', profile: 'Perfil', signIn: 'Entrar', myGroups: 'Minhas peladas', nextMatch: 'Próximo jogo', viewGroup: 'Abrir pelada', members: 'jogadores', hero: 'A casa digital da sua pelada.', heroBody: 'Organize jogos, sorteie equipas equilibradas e transforme cada sexta-feira em história.', start: 'Começar agora', explore: 'Explorar demonstração' },
  en: { home: 'Home', discover: 'Discover', create: 'Create group', profile: 'Profile', signIn: 'Sign in', myGroups: 'My groups', nextMatch: 'Next match', viewGroup: 'Open group', members: 'players', hero: 'The digital home of your football group.', heroBody: 'Organize games, balance teams and turn every match into a story.', start: 'Get started', explore: 'Explore demo' },
  es: { home: 'Inicio', discover: 'Descubrir', create: 'Crear grupo', profile: 'Perfil', signIn: 'Entrar', myGroups: 'Mis grupos', nextMatch: 'Próximo partido', viewGroup: 'Abrir grupo', members: 'jugadores', hero: 'La casa digital de tu fútbol.', heroBody: 'Organiza partidos, equilibra equipos y convierte cada fecha en historia.', start: 'Empezar', explore: 'Explorar demo' },
  fr: { home: 'Accueil', discover: 'Découvrir', create: 'Créer un groupe', profile: 'Profil', signIn: 'Connexion', myGroups: 'Mes groupes', nextMatch: 'Prochain match', viewGroup: 'Ouvrir le groupe', members: 'joueurs', hero: 'La maison numérique de votre groupe de foot.', heroBody: 'Organisez les matchs, équilibrez les équipes et écrivez votre histoire.', start: 'Commencer', explore: 'Explorer la démo' },
  de: { home: 'Start', discover: 'Entdecken', create: 'Gruppe erstellen', profile: 'Profil', signIn: 'Anmelden', myGroups: 'Meine Gruppen', nextMatch: 'Nächstes Spiel', viewGroup: 'Gruppe öffnen', members: 'Spieler', hero: 'Das digitale Zuhause eurer Fußballrunde.', heroBody: 'Spiele organisieren, Teams ausgleichen und jede Partie zur Geschichte machen.', start: 'Loslegen', explore: 'Demo ansehen' },
} as const

const localeLabels: Record<Locale, string> = { pt: 'PT', en: 'EN', es: 'ES', fr: 'FR', de: 'DE' }

type I18nValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: TranslationKey) => string }
const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (localStorage.getItem('kickhub-locale') as Locale) || 'pt')
  const value = useMemo(() => ({
    locale,
    setLocale(next: Locale) {
      localStorage.setItem('kickhub-locale', next)
      document.documentElement.lang = next
      setLocaleState(next)
    },
    t: (key: TranslationKey) => copy[locale][key],
  }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n precisa de I18nProvider')
  return value
}

export function LocaleSelect({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useI18n()
  return (
    <label className="locale-select">
      <span className="sr-only">Idioma</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label="Idioma">
        {(Object.keys(localeLabels) as Locale[]).map((value) => (
          <option key={value} value={value}>{compact ? localeLabels[value] : `${localeLabels[value]} · ${value}`}</option>
        ))}
      </select>
    </label>
  )
}
