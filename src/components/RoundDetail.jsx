import { useEffect, useState } from 'react'
import { getMatch } from '../api'
import { formatDia } from '../lib/format'
import { RoundBody, ShareRound } from './RoundParts'
import { colors, styles } from '../theme'

// Detalhe completo de uma rodada (com fotos), aberto a partir do histórico.
export default function RoundDetail({ matchId, onBack, onProfile }) {
  const [m, setM] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getMatch(matchId)
      .then((d) => alive && setM(d))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [matchId])

  return (
    <div style={styles.page}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <h1 style={{ ...styles.title, fontSize: 20 }}>Rodada</h1>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: colors.muted,
            fontSize: 13,
            textDecoration: 'underline',
          }}
        >
          ← Voltar
        </button>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {!m && !error && (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 30 }}>
          <p style={styles.mutedText}>A carregar…</p>
        </div>
      )}

      {m && (
        <div style={styles.panel}>
          <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 12 }}>
            {formatDia(m.played_at)}
          </p>
          <RoundBody m={m} full onProfile={onProfile} />
          <ShareRound m={m} />
        </div>
      )}
    </div>
  )
}
