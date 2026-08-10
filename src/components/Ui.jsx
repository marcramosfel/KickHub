import { createPortal } from 'react-dom'
import { colors, styles } from '../theme'

// Leva o que está cá dentro para o fim do `body`, fora da árvore onde foi
// escrito.
//
// Não é arrumação: é o que faz um `position: fixed` continuar a valer o ecrã
// inteiro. A barra de cima tem `backdrop-filter: blur(8px)`, e um
// backdrop-filter diferente de `none` transforma o elemento em BLOCO
// CONTENTOR dos descendentes `fixed` — exatamente como um `transform`. A
// folha "Mais" vivia lá dentro, por isso o `inset: 0` do fundo media a barra
// (375×60) e não a janela: a folha, colada em baixo com `align-items:
// flex-end`, ficava com o topo em -352px e via-se só a última linha
// ("Fechar"). No computador nunca apareceu porque lá o menu é `absolute`.
//
// Qualquer modal dentro de um antepassado com blur, transform ou filter cai
// no mesmo buraco — daí isto ser um componente e não um remendo local.
export function Portal({ children }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

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
