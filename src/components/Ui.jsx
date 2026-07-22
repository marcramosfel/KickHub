import { colors, styles } from '../theme'

// Cabeçalho de secção com uma barrinha de acento à esquerda.
export function SectionTitle({ children, cor = colors.grass, style }) {
  return (
    <h2
      style={{
        ...styles.title,
        fontSize: 17,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: '24px 0 10px',
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{ width: 4, height: 16, borderRadius: 2, background: cor, flexShrink: 0 }}
      />
      {children}
    </h2>
  )
}

// Caixa de erro clara (ícone + fundo), com aria-live para leitores de ecrã.
export function ErrorBox({ children, style }) {
  if (!children) return null
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(255, 90, 90, 0.1)',
        border: '1px solid rgba(255, 90, 90, 0.35)',
        color: colors.error,
        fontSize: 14,
        ...style,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0 }}>
        ⚠️
      </span>
      <span>{children}</span>
    </div>
  )
}

// Bloco de skeleton (usa a animação .skeleton do index.css).
export function Skeleton({ height = 16, width = '100%', radius = 10, style }) {
  return (
    <div className="skeleton" style={{ height, width, borderRadius: radius, ...style }} />
  )
}

// Skeleton no formato de um card/painel (para ecrãs a carregar).
export function SkeletonCard({ lines = 3 }) {
  return (
    <div style={{ ...styles.panel }}>
      <Skeleton height={20} width="55%" style={{ marginBottom: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={13}
          width={i === lines - 1 ? '70%' : '100%'}
          style={{ marginBottom: 8 }}
        />
      ))}
    </div>
  )
}
