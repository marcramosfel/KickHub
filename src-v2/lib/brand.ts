/**
 * A marca, num sítio só (§35).
 *
 * O nome da plataforma pode mudar — o master prompt di-lo explicitamente — e
 * quando mudar tem de mudar aqui e em mais lado nenhum. Um componente genérico
 * que escreva "KickHub" à mão passa a ser um sítio para esquecer.
 *
 * "Pelada Browns" nunca entra aqui: é uma comunidade dentro do produto, e não
 * o produto (§34).
 */
export const brand = {
  name: 'KickHub',
  shortName: 'KickHub',
  /** Usado no `og:site_name` e no rodapé. Traduzido vem do catálogo. */
  domain: 'kickhub.app',
  supportEmail: 'ola@kickhub.app',
  logo: {
    mark: '/icons/apple-touch-icon.png',
    social: '/og-kickhub.png',
  },
  social: {
    instagram: null as string | null,
    x: null as string | null,
  },
} as const

/**
 * Os tokens de §32, com os nomes que o design system usa.
 *
 * As variáveis existem em `styles.css`, que é onde o browser as lê; isto é o
 * mapa que permite ao TypeScript falar delas sem escrever `var(--...)` à mão em
 * componentes. Mudar a identidade visual passa a ser mudar o CSS — nunca os
 * componentes, que é a promessa de §32.
 */
export const tokens = {
  color: {
    brand: 'var(--brand)',
    brandInk: 'var(--brand-ink)',
    surface: 'var(--surface)',
    surfaceAlt: 'var(--surface-2)',
    background: 'var(--bg)',
    ink: 'var(--ink)',
    muted: 'var(--muted)',
    border: 'var(--border)',
    dark: 'var(--dark)',
    /** Estados. O sucesso é a própria marca: uma pelada bem sucedida é verde. */
    success: 'var(--brand)',
    info: 'var(--blue)',
    warning: 'var(--orange)',
    danger: 'var(--danger)',
  },
  space: {
    1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)',
    4: 'var(--space-4)', 5: 'var(--space-5)', 6: 'var(--space-6)',
  },
  radius: {
    sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', pill: 'var(--radius-pill)',
  },
  shadow: {
    card: 'var(--shadow)', raised: 'var(--shadow-raised)',
  },
  font: {
    sans: 'var(--font-sans)', display: 'var(--font-display)',
  },
  motion: {
    fast: 'var(--motion-fast)', base: 'var(--motion-base)', slow: 'var(--motion-slow)',
  },
  z: {
    base: 0, sticky: 20, nav: 30, dialog: 60, toast: 80,
  },
} as const

/**
 * Os pontos de quebra, e são os que o CSS já usa.
 *
 * Estão aqui para os componentes que precisam de decidir em JavaScript o que
 * não se decide em CSS — e não para duplicar media queries, que continuam a
 * viver na folha de estilos.
 */
export const breakpoints = {
  mobile: 760,
  tablet: 1024,
  desktop: 1280,
} as const

export type Breakpoint = keyof typeof breakpoints
