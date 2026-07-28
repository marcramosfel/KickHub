import { useState } from 'react'
import Avatar from './Avatar'
import { teamAvg } from '../lib/draw'
import { colors, fonts, styles } from '../theme'

// Times do sorteio: Pretos vs Brancos (com marcadores ⚫/⚪ para ficarem
// claros no tema escuro).
const TEAM_A = { nome: '⚫ Pretos', cor: '#8A96A0' } // cinza legível (time preto)
const TEAM_B = { nome: '⚪ Brancos', cor: '#F2F5F2' } // branco

// A "balança" assinatura: inclina conforme a diferença de média entre os times.
// Fica verde quando Δ ≤ 0,4.
function Balanca({ mA, mB }) {
  const delta = Math.abs(mA - mB)
  const ok = delta <= 0.4
  const tilt = Math.max(-14, Math.min(14, (mB - mA) * 18))
  const cor = ok ? colors.grass : colors.muted

  return (
    <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <svg width="150" height="64" viewBox="0 0 200 84" style={{ margin: '0 auto' }}>
        {/* base */}
        <path d="M88 78 L112 78 L104 62 L96 62 Z" fill={cor} opacity="0.8" />
        <rect x="97" y="34" width="6" height="30" rx="2" fill={cor} opacity="0.8" />
        {/* braço + pratos, inclinados */}
        <g transform={`rotate(${tilt} 100 32)`}>
          <rect x="36" y="29" width="128" height="6" rx="3" fill={cor} />
          <circle cx="100" cy="32" r="6" fill={cor} />
          <line x1="44" y1="35" x2="44" y2="48" stroke={cor} strokeWidth="3" />
          <path d="M30 48 Q44 62 58 48" fill="none" stroke={TEAM_A.cor} strokeWidth="5" strokeLinecap="round" />
          <line x1="156" y1="35" x2="156" y2="48" stroke={cor} strokeWidth="3" />
          <path d="M142 48 Q156 62 170 48" fill="none" stroke={TEAM_B.cor} strokeWidth="5" strokeLinecap="round" />
        </g>
      </svg>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 15,
          letterSpacing: 1,
          color: ok ? colors.grass : colors.error,
        }}
      >
        Δ {delta.toFixed(2)}
      </div>
    </div>
  )
}

function TeamPanel({ nome, cor, team, selectedId, onPick }) {
  const media = teamAvg(team)
  return (
    <div style={{ ...styles.panel, padding: 12, borderTop: `3px solid ${cor}` }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: fonts.title,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: 600,
            color: cor,
            fontSize: 16,
          }}
        >
          {nome}
        </span>
        <span style={{ fontSize: 13, color: colors.muted }}>média {media.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {team.map((p) => {
          const selected = selectedId === p.id
          return (
            <div
              key={p.id}
              onClick={onPick ? () => onPick(p.id) : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 6,
                borderRadius: 10,
                border: `1px solid ${selected ? cor : 'transparent'}`,
                background: selected ? '#0C1915' : 'transparent',
                cursor: onPick ? 'pointer' : 'default',
              }}
            >
              <Avatar name={p.name} photo={p.photo} size={30} />
              <span style={{ fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              <span style={{ fontSize: 12, color: colors.muted }}>{Number(p.avg).toFixed(1)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Mostra um sorteio (A = Pretos, B = Brancos).
// Com `onSwap`, permite trocar jogadores tocando num de cada time.
export default function DrawView({ A, B, onSwap }) {
  const [sel, setSel] = useState({ A: null, B: null })

  // Um re-sorteio substitui as equipas — a seleção de troca a meio não pode
  // sobreviver. Ajustar durante o render (em vez de num efeito) evita o
  // fotograma intermédio em que a seleção antiga aparecia sobre as equipas novas.
  const [equipas, setEquipas] = useState({ A, B })
  if (equipas.A !== A || equipas.B !== B) {
    setEquipas({ A, B })
    setSel({ A: null, B: null })
  }

  const pick = (team) => (id) => {
    const next = { ...sel, [team]: sel[team] === id ? null : id }
    if (next.A && next.B) {
      onSwap(next.A, next.B)
      setSel({ A: null, B: null })
    } else {
      setSel(next)
    }
  }

  return (
    <div>
      <Balanca mA={teamAvg(A)} mB={teamAvg(B)} />
      {onSwap && (
        <p style={{ ...styles.mutedText, textAlign: 'center', fontSize: 13, marginBottom: 10 }}>
          Para trocar, toca num jogador de cada time.
        </p>
      )}
      {/* Duas colunas quando há espaço, empilhadas no telemóvel. Um
          `1fr 1fr` fixo obrigava a deslizar de lado num ecrã de 320px. */}
      <div className="pb-cards" style={{ gap: 10 }}>
        <TeamPanel
          nome={TEAM_A.nome}
          cor={TEAM_A.cor}
          team={A}
          selectedId={sel.A}
          onPick={onSwap ? pick('A') : undefined}
        />
        <TeamPanel
          nome={TEAM_B.nome}
          cor={TEAM_B.cor}
          team={B}
          selectedId={sel.B}
          onPick={onSwap ? pick('B') : undefined}
        />
      </div>
    </div>
  )
}
