import { beforeEach, describe, expect, it } from 'vitest'
import { applySeo, applyStructuredData, localeHref, peladaStructuredData } from './seo'

const meta = (name: string) => document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content
const property = (name: string) => document.head.querySelector<HTMLMetaElement>(`meta[property="${name}"]`)?.content
const link = (rel: string, hreflang?: string) => document.head.querySelector<HTMLLinkElement>(
  hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`,
)?.getAttribute('href')

describe('applySeo', () => {
  beforeEach(() => { document.head.innerHTML = '' })

  it('escreve título, descrição e Open Graph da página', () => {
    applySeo({ title: 'Pelada Browns', description: 'Sextas em Vilamoura', path: '/p/browns', indexable: true })
    expect(document.title).toBe('Pelada Browns')
    expect(meta('description')).toBe('Sextas em Vilamoura')
    expect(property('og:title')).toBe('Pelada Browns')
    expect(property('og:url')).toContain('/p/browns')
    expect(meta('twitter:card')).toBe('summary_large_image')
  })

  it('uma página não declarada indexável fica fora dos motores de busca', () => {
    applySeo({ title: 'Minhas Peladas', description: 'Privado' })
    expect(meta('robots')).toBe('noindex, nofollow')
  })

  it('só quem se assume público é indexado', () => {
    applySeo({ title: 'Descobrir', description: 'Público', indexable: true })
    expect(meta('robots')).toBe('index, follow')
  })

  it('o canónico aponta para o caminho da página e não para a raiz', () => {
    applySeo({ title: 'Descobrir', description: 'Público', path: '/descobrir', indexable: true })
    expect(link('canonical')).toContain('/descobrir')
  })

  it('declara os cinco idiomas e um x-default', () => {
    applySeo({ title: 'Descobrir', description: 'Público', path: '/descobrir', indexable: true })
    for (const locale of ['pt', 'en', 'es', 'fr', 'de']) {
      expect(link('alternate', locale)).toContain(`lang=${locale}`)
    }
    expect(link('alternate', 'x-default')).toContain('/descobrir')
  })

  it('não promete traduções de uma página que ninguém deve visitar', () => {
    applySeo({ title: 'Perfil', description: 'Privado', path: '/u/marcos' })
    expect(link('alternate', 'pt')).toBeUndefined()
  })

  it('reescreve em vez de acumular etiquetas a cada navegação', () => {
    applySeo({ title: 'A', description: 'primeira', indexable: true })
    applySeo({ title: 'B', description: 'segunda', indexable: true })
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(meta('description')).toBe('segunda')
  })

  it('a imagem social é absoluta, que é o que os leitores de link exigem', () => {
    applySeo({ title: 'A', description: 'b', indexable: true })
    expect(property('og:image')).toMatch(/^https?:\/\//)
  })
})

describe('localeHref', () => {
  it('marca o idioma no endereço em vez de prometer um domínio que não existe', () => {
    expect(localeHref('/descobrir', 'fr')).toContain('lang=fr')
  })
})

describe('dados estruturados', () => {
  beforeEach(() => { document.head.innerHTML = '' })

  it('descreve a pelada como o clube que ela é', () => {
    const data = peladaStructuredData({
      name: 'Pelada Browns', description: 'Sextas', city: 'Vilamoura',
      countryCode: 'PT', region: 'Algarve', slug: 'browns',
    })
    expect(data['@type']).toBe('SportsClub')
    expect(data.address.addressLocality).toBe('Vilamoura')
  })

  it('põe e tira o bloco sem deixar restos', () => {
    applyStructuredData({ '@type': 'SportsClub' })
    expect(document.getElementById('kickhub-structured-data')).not.toBeNull()
    applyStructuredData(null)
    expect(document.getElementById('kickhub-structured-data')).toBeNull()
  })

  it('não duplica o bloco quando a página se actualiza', () => {
    applyStructuredData({ a: 1 })
    applyStructuredData({ a: 2 })
    expect(document.head.querySelectorAll('#kickhub-structured-data')).toHaveLength(1)
  })
})
