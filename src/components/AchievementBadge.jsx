import { memo } from 'react'
import { chip, colors, fonts } from '../theme'

// Pill de título secundário: ícone + nome.
// A moldura é para o título principal; estes badges são os restantes.

const TAMANHOS = {
  xs: { fonte: 9, icone: 11, pad: '2px 7px', gap: 4, padSoIcone: '2px 5px' },
  sm: { fonte: 10, icone: 12, pad: '3px 9px', gap: 5, padSoIcone: '3px 6px' },
  md: { fonte: 12, icone: 14, pad: '4px 11px', gap: 6, padSoIcone: '4px 8px' },
}

// Só se pode colar alfa a um hex; com rgb()/gradiente fica a cor crua.
function bordaDe(cor) {
  if (/^#[0-9a-f]{6}$/i.test(cor)) return `${cor}55`
  // #RGB → expande antes de colar o alfa, senão saía um #RGB5 inválido.
  const curto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(cor)
  if (curto) return `#${curto[1]}${curto[1]}${curto[2]}${curto[2]}${curto[3]}${curto[3]}55`
  return cor
}

function AchievementBadgeBase({ titulo, tamanho = 'sm', comTexto = true, style }) {
  if (!titulo) return null

  const t = TAMANHOS[tamanho] || TAMANHOS.sm
  const m = titulo.moldura || {}
  const cor = m.cor || colors.grass
  // Um título sem ícone continua a precisar de um sinal visual — sem isto o
  // badge só-ícone ficava uma pill vazia.
  const icone = titulo.icon || '🏅'
  const nome = titulo.titulo || 'Título'

  const base = {
    ...chip(cor, 'rgba(255, 255, 255, 0.06)'),
    border: `1px solid ${bordaDe(cor)}`,
    padding: comTexto ? t.pad : t.padSoIcone,
    gap: t.gap,
    fontFamily: fonts.title,
    fontSize: t.fonte,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    maxWidth: '100%',
    boxSizing: 'border-box',
    ...style,
  }

  // Só com ícone o texto tem de chegar por outra via — daí o role/aria-label.
  if (!comTexto) {
    return (
      <span role="img" aria-label={nome} title={nome} style={base}>
        <span style={{ fontSize: t.icone, lineHeight: 1 }}>{icone}</span>
      </span>
    )
  }

  return (
    <span title={titulo.descricao || nome} style={base}>
      <span aria-hidden style={{ fontSize: t.icone, lineHeight: 1, flexShrink: 0 }}>
        {icone}
      </span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {nome}
      </span>
    </span>
  )
}

export default memo(AchievementBadgeBase)
