export type Locale = 'pt' | 'en' | 'es' | 'fr' | 'de'

export type TranslationValue = string | {
  one: string
  other: string
}

export type LocalizedNamespace<Key extends string> = Record<Locale, Record<Key, TranslationValue>>
