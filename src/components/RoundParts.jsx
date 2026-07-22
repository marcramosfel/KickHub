import Avatar from './Avatar'
import { assisters, matchWinner, scorers, teamPlayers } from '../lib/format'
import { colors, fonts, styles } from '../theme'

// Foto em proporção 16:9 (ou empty state quando não há).
export function PhotoFrame({ src, alt, empty = 'Sem foto', height }) {
  const box = {
    width: '100%',
    aspectRatio: '16 / 9',
    height,
    borderRadius: 12,
    overflow: 'hidden',
    border: `1px solid ${colors.line}`,
    background: '#0C1915',
  }
  if (!src) {
    return (
      <div
        style={{
          ...box,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 6,
          color: colors.muted,
        }}
      >
        <span style={{ fontSize: 26, opacity: 0.6 }} aria-hidden>
          🖼️
        </span>
        <span style={{ fontSize: 13 }}>{empty}</span>
      </div>
    )
  }
  return (
    <div style={box}>
      <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

// Placar em destaque, com o time vencedor realçado.
export function ScoreBoard({ m }) {
  const w = matchWinner(m)
  const col = (name, score, side) => {
    const isWin = w.side === side
    return (
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: fonts.title,
            fontSize: 13,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: side === 'A' ? colors.teamA : colors.teamB,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: fonts.title,
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: isWin ? colors.grass : colors.text,
          }}
        >
          {score}
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {col(m.team_a_name || 'Amarelos', Number(m.score_a || 0), 'A')}
        <span style={{ fontFamily: fonts.title, fontSize: 24, color: colors.muted }}>—</span>
        {col(m.team_b_name || 'Azuis', Number(m.score_b || 0), 'B')}
      </div>
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '3px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: w.isDraw ? 'rgba(127,160,144,0.15)' : 'rgba(52,208,88,0.14)',
            color: w.isDraw ? colors.muted : colors.grass,
          }}
        >
          {w.isDraw ? '🤝 Empate' : `🏆 ${w.name}`}
        </span>
      </div>
    </div>
  )
}

// Linha de estatística (gols/assistências) com ícone + texto (nunca só cor).
export function StatLine({ icon, label, list, emptyText }) {
  return (
    <div style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span aria-hidden style={{ flexShrink: 0 }}>
        {icon}
      </span>
      <span>
        <span style={{ color: colors.muted }}>{label}: </span>
        {list.length ? (
          list.map((p, i) => (
            <span key={p.player_id}>
              {i > 0 && ', '}
              {p.name}
              {p[label === 'Gols' ? 'goals' : 'assists'] > 1 && (
                <span style={{ color: colors.muted }}>
                  {' '}
                  ×{p[label === 'Gols' ? 'goals' : 'assists']}
                </span>
              )}
            </span>
          ))
        ) : (
          <span style={{ color: colors.muted }}>{emptyText}</span>
        )}
      </span>
    </div>
  )
}

// Chips de jogadores de um time.
export function TeamRoster({ m, side }) {
  const cor = side === 'A' ? colors.teamA : colors.teamB
  const name = side === 'A' ? m.team_a_name || 'Amarelos' : m.team_b_name || 'Azuis'
  const list = teamPlayers(m, side)
  if (!list.length) return null
  return (
    <div>
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 12,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: cor,
          marginBottom: 6,
        }}
      >
        {name}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {list.map((p) => (
          <span
            key={p.player_id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px 4px 4px',
              borderRadius: 999,
              background: '#0C1915',
              border: `1px solid ${colors.line}`,
              fontSize: 13,
            }}
          >
            <Avatar name={p.name} photo={p.photo} size={22} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}

// Corpo partilhado de uma rodada (placar, rosters, gols/assistências, local, obs).
// `full` inclui as fotos (detalhe/destaque); sem `full` mostra só o resumo.
export function RoundBody({ m, full = false }) {
  const temTimes = (m.players || []).some((p) => p.team)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {full && <PhotoFrame src={m.winner_photo} alt="Time vencedor" empty="Sem foto do time vencedor" />}

      <ScoreBoard m={m} />

      {temTimes && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <TeamRoster m={m} side="A" />
          <TeamRoster m={m} side="B" />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <StatLine icon="⚽" label="Gols" list={scorers(m)} emptyText="sem gols" />
        <StatLine icon="🅰️" label="Assistências" list={assisters(m)} emptyText="sem assistências" />
      </div>

      {full && (m.has_location_photo || m.location_photo) && (
        <div>
          <div style={{ ...styles.label, marginBottom: 6 }}>📍 Local da pelada</div>
          <PhotoFrame src={m.location_photo} alt="Local da pelada" empty="Sem foto do local" />
        </div>
      )}

      {m.notes && (
        <p style={{ fontSize: 14, color: colors.text, lineHeight: 1.5 }}>
          <span style={{ color: colors.muted }}>📝 </span>
          {m.notes}
        </p>
      )}
    </div>
  )
}
