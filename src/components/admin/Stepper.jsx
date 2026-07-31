import { colors } from '../../theme'

// Contador − n + para gols, assistências, defesas e gols sofridos.
//
// Vivia duplicado no GameDetail e no RodadasPanel, igual nos dois sítios.
//
// O botão continua a ver-se com 26px, mas o alvo de toque não é esse: a
// `padding` alarga-o para 44×44 e a margem negativa devolve o espaço ao
// layout, por isso o desenho não muda. Medido a 375px, os 26px reais eram
// pouco — são até quatro contadores por linha, e falhar o "−" do jogador
// errado obriga a corrigir dois números.
//
// A folga não chega a tocar na do vizinho: entre o "−" e o "+" há 22px
// (3 de gap + 16 do número + 3 de gap) e cada um só se estende 9px.
const HIT = 9

const botao = {
  width: 26,
  height: 26,
  boxSizing: 'content-box',
  padding: HIT,
  margin: -HIT,
  borderRadius: 8,
  border: `1px solid ${colors.line}`,
  background: '#0C1915',
  color: colors.text,
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1,
  backgroundClip: 'content-box', // senão o fundo pintava também a folga
}

export default function Stepper({ icon, label, value, onChange, max = 99 }) {
  const n = Number(value) || 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <span aria-hidden style={{ fontSize: 12 }}>
        {icon}
      </span>
      <button
        type="button"
        aria-label={label ? `Menos um em ${label}` : 'Menos um'}
        onClick={() => onChange(Math.max(0, n - 1))}
        style={botao}
      >
        −
      </button>
      <span
        style={{
          width: 16,
          textAlign: 'center',
          fontWeight: 700,
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {n}
      </span>
      <button
        type="button"
        aria-label={label ? `Mais um em ${label}` : 'Mais um'}
        onClick={() => onChange(Math.min(max, n + 1))}
        style={botao}
      >
        +
      </button>
    </div>
  )
}
