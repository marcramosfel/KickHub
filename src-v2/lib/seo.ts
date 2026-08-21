import { useEffect } from 'react'
import type { Locale } from '../i18n/types'

/**
 * Metadados por página.
 *
 * A app é uma SPA: o `index.html` traz um conjunto de metadados e o browser
 * nunca mais os muda sozinho. Quem partilha o endereço de uma pelada no
 * WhatsApp recebia a descrição do produto inteiro — §44 pede o contrário.
 *
 * O que isto NÃO resolve: um robot que não execute JavaScript continua a ver o
 * `index.html`. Resolver isso a sério é pré-renderizar, que é uma mudança de
 * infraestrutura e não uma função. O que se ganha aqui é o link partilhado a
 * dizer a verdade nos leitores que executam JavaScript, e o canónico e o
 * hreflang certos para quem os lê.
 */
export const SUPPORTED_LOCALES: readonly Locale[] = ['pt', 'en', 'es', 'fr', 'de']

export type SeoMeta = {
  title: string
  description: string
  /** Caminho canónico, sem domínio. Por omissão, o da página actual. */
  path?: string
  image?: string
  /** `false` mantém a página fora dos motores de busca. */
  indexable?: boolean
  type?: 'website' | 'article' | 'profile'
}

const DEFAULT_IMAGE = '/og-kickhub.png'

const origin = () => (typeof window === 'undefined' ? 'https://kickhub.app' : window.location.origin)

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  if (typeof document === 'undefined') return
  let tag = document.head.querySelector<HTMLMetaElement>(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function upsertLink(rel: string, href: string, hreflang?: string) {
  if (typeof document === 'undefined') return
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`
  let tag = document.head.querySelector<HTMLLinkElement>(selector)
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    if (hreflang) tag.setAttribute('hreflang', hreflang)
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}

/**
 * `?lang=` e não um domínio por idioma: o produto serve os cinco idiomas do
 * mesmo sítio, e prometer `pt.kickhub.app` ao Google sem esse sítio existir era
 * apontar para o vazio.
 */
export function localeHref(path: string, locale: Locale) {
  const url = new URL(path, origin())
  url.searchParams.set('lang', locale)
  return url.toString()
}

export function applySeo(meta: SeoMeta) {
  if (typeof document === 'undefined') return
  const path = meta.path ?? window.location.pathname
  const canonical = new URL(path, origin()).toString()
  const image = new URL(meta.image ?? DEFAULT_IMAGE, origin()).toString()
  // Indexável por omissão é errado num produto com comunidades privadas: quem
  // não disser nada fica de fora, e só as páginas públicas se assumem.
  const indexable = meta.indexable === true

  document.title = meta.title
  upsertMeta('meta[name="description"]', 'name', 'description', meta.description)
  upsertMeta('meta[name="robots"]', 'name', 'robots', indexable ? 'index, follow' : 'noindex, nofollow')

  upsertMeta('meta[property="og:title"]', 'property', 'og:title', meta.title)
  upsertMeta('meta[property="og:description"]', 'property', 'og:description', meta.description)
  upsertMeta('meta[property="og:type"]', 'property', 'og:type', meta.type ?? 'website')
  upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonical)
  upsertMeta('meta[property="og:image"]', 'property', 'og:image', image)

  upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image')
  upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title)
  upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description)
  upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image)

  upsertLink('canonical', canonical)
  // O hreflang só faz sentido no que é indexável. Numa página privada seria a
  // dizer ao motor de busca que existem cinco versões de algo que ele não deve
  // sequer visitar.
  if (indexable) {
    for (const locale of SUPPORTED_LOCALES) upsertLink('alternate', localeHref(path, locale), locale)
    upsertLink('alternate', new URL(path, origin()).toString(), 'x-default')
  }
}

/** Aplica os metadados enquanto a página estiver montada. */
export function useSeo(meta: SeoMeta) {
  const { title, description, path, image, indexable, type } = meta
  useEffect(() => {
    applySeo({ title, description, path, image, indexable, type })
  }, [description, image, indexable, path, title, type])
}

/**
 * Dados estruturados de uma pelada pública (§49).
 *
 * `SportsClub` é o que uma pelada é: um grupo que joga num sítio, com um
 * horário. Um `Event` por rodada seria mais rico e obrigava a expor o
 * calendário de comunidades que podem não o querer público.
 */
export function peladaStructuredData(pelada: {
  name: string
  description: string
  city: string
  countryCode: string
  region: string | null
  slug: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsClub',
    name: pelada.name,
    description: pelada.description,
    sport: 'Football',
    url: new URL(`/p/${pelada.slug}`, origin()).toString(),
    address: {
      '@type': 'PostalAddress',
      addressLocality: pelada.city,
      addressRegion: pelada.region ?? undefined,
      addressCountry: pelada.countryCode,
    },
  }
}

export function applyStructuredData(data: object | null) {
  if (typeof document === 'undefined') return
  const id = 'kickhub-structured-data'
  const existing = document.getElementById(id)
  if (!data) {
    existing?.remove()
    return
  }
  const tag = existing ?? document.createElement('script')
  tag.id = id
  tag.setAttribute('type', 'application/ld+json')
  tag.textContent = JSON.stringify(data)
  if (!existing) document.head.appendChild(tag)
}
