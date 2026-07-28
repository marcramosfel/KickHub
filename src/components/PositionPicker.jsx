import { memo, useMemo } from 'react'
import { FIELD_SLOTS, GK, POSITIONS, posicao } from '../lib/positions'
import { colors, fonts } from '../theme'

// Mini-campo para escolher a posição: em vez de uma lista de nomes, o jogador
// vê onde é que cada posição fica. A área escolhida acende — o desenho é que
// explica a formação 2-3-1, não o texto.

const ORDEM_VISUAL = [GK, ...FIELD_SLOTS]

function Marca({ p, estado, onPick, disabled }) {
  const cores = {
    principal: { fundo: colors.grass, borda: colors.grass, texto: '#06130D' },
    secundaria: { fundo: 'rgba(255,197,49,0.85)', borda: colors.teamA, texto: '#1A1200' },
    livre: { fundo: 'rgba(12,25,21,0.85)', borda: colors.line, texto: colors.muted },
  }
  const c = cores[estado] || cores.livre
  const marcado = estado !== 'livre'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick?.(p.id)}
      aria-pressed={marcado}
      aria-label={`${p.label}${
        estado === 'principal'
          ? ' — posição principal'
          : estado === 'secundaria'
            ? ' — posição secundária'
            : ''
      }`}
      title={p.label}
      style={{
        position: 'absolute',
        left: `${p.x}%`,
        top: `${p.y}%`,
        transform: 'translate(-50%, -50%)',
        width: 'clamp(46px, 15%, 62px)',
        aspectRatio: '1 / 1',
        borderRadius: '50%',
        border: `2px solid ${c.borda}`,
        background: c.fundo,
        color: c.texto,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: marcado ? `0 0 0 4px ${c.borda}22` : 'none',
      }}
    >
      <span aria-hidden style={{ fontSize: 'clamp(13px, 4.2vw, 17px)', lineHeight: 1 }}>
        {p.icon}
      </span>
      <span
        style={{
          fontFamily: fonts.title,
          fontSize: 'clamp(8px, 2.6vw, 10px)',
          letterSpacing: 0.5,
          fontWeight: 700,
        }}
      >
        {p.short}
      </span>
    </button>
  )
}

// Linhas do campo, só CSS/SVG — nada de imagem estática.
function LinhasDoCampo() {
  return (
    <svg
      viewBox="0 0 100 150"
      preserveAspectRatio="none"
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <rect x="0" y="0" width="100" height="150" fill="#0E2A1C" />
      <rect x="0" y="0" width="100" height="150" fill="url(#relva)" opacity="0.5" />
      <defs>
        <pattern id="relva" width="100" height="25" patternUnits="userSpaceOnUse">
          <rect width="100" height="12.5" fill="rgba(255,255,255,0.022)" />
        </pattern>
      </defs>
      <g fill="none" stroke="rgba(234,242,236,0.28)" strokeWidth="0.6">
        <rect x="2" y="2" width="96" height="146" />
        <line x1="2" y1="75" x2="98" y2="75" />
        <circle cx="50" cy="75" r="14" />
        <rect x="26" y="2" width="48" height="24" />
        <rect x="26" y="124" width="48" height="24" />
        <rect x="39" y="2" width="22" height="9" />
        <rect x="39" y="139" width="22" height="9" />
      </g>
    </svg>
  )
}

// `principal` e `secundaria` são ids de posição. Clicar numa marca livre
// escolhe a principal; se já houver principal, escolhe a secundária.
function PositionPicker({ principal, secundaria, onPick, disabled = false, altura = 340 }) {
  const estados = useMemo(() => {
    const m = {}
    for (const p of POSITIONS) {
      m[p.id] = p.id === principal ? 'principal' : p.id === secundaria ? 'secundaria' : 'livre'
    }
    return m
  }, [principal, secundaria])

  return (
    <div>
      <div
        className="pb-pitch-wrap"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          margin: '0 auto',
          aspectRatio: '2 / 3',
          minHeight: altura ? undefined : 0,
          borderRadius: 14,
          overflow: 'hidden',
          border: `1px solid ${colors.line}`,
        }}
      >
        <LinhasDoCampo />
        {ORDEM_VISUAL.map((id) => {
          const p = posicao(id)
          if (!p) return null
          return (
            <Marca
              key={id}
              p={p}
              estado={estados[id]}
              onPick={onPick}
              disabled={disabled}
            />
          )
        })}
      </div>

      {/* legenda: nunca só cor — sempre com texto */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginTop: 10,
          fontSize: 12,
          color: colors.muted,
        }}
      >
        <span>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: colors.grass,
              marginRight: 6,
            }}
          />
          Principal
        </span>
        <span>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: colors.teamA,
              marginRight: 6,
            }}
          />
          Secundária (opcional)
        </span>
      </div>
    </div>
  )
}

export default memo(PositionPicker)
