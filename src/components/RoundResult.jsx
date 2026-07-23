import { formatDia } from '../lib/format'
import { RoundBody } from './RoundParts'
import { colors, fonts, styles } from '../theme'

// Destaque da rodada mais recente — "Campeões da semana".
// `match` vem de getLatestMatch() (com fotos). onHistory abre o histórico.
export default function RoundResult({ match, onHistory, onProfile }) {
  if (!match) {
    return (
      <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>🏆</div>
        <p style={styles.mutedText}>
          Ainda não há rodadas registadas. Depois da próxima pelada, os campeões aparecem aqui.
        </p>
      </div>
    )
  }

  return (
    <div
      className="rise-in"
      style={{
        ...styles.panel,
        padding: 16,
        borderTop: `3px solid ${colors.grass}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
          gap: 8,
        }}
      >
        <h2 style={{ ...styles.title, fontSize: 18 }}>
          🏆 Campeões da <span style={{ color: colors.grass }}>semana</span>
        </h2>
        <span style={{ ...styles.mutedText, fontSize: 12, flexShrink: 0 }}>
          {formatDia(match.played_at)}
        </span>
      </div>

      <RoundBody m={match} full onProfile={onProfile} />

      <button style={{ ...styles.buttonGhost, marginTop: 16 }} onClick={onHistory}>
        Ver rodadas anteriores →
      </button>
    </div>
  )
}
