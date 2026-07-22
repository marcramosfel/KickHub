import { useEffect, useState } from 'react'
import { getPendingRatings, getPlayers, submitRatings } from '../api'
import { RATING_LABELS } from '../lib/labels'
import Avatar from './Avatar'
import { ErrorBox, SkeletonCard } from './Ui'
import { colors, fonts, styles, disabled } from '../theme'

// Cor do rótulo conforme a nota: bagre → craque
const labelColor = (v) => (v <= 1 ? colors.error : v === 2 ? colors.teamA : v === 3 ? colors.muted : colors.grass)

// Avaliação: dá nota a cada jogador que ainda não avaliaste. Aparece
// sempre que entram jogadores novos (ou o admin reinicia as avaliações).
export default function RateScreen({ session, onDone, onSkip }) {
  const [others, setOthers] = useState(null) // jogadores que faltam avaliar
  const [scores, setScores] = useState({}) // { [playerId]: 0..5 }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    getPendingRatings(session.id, session.pin)
      .then(setOthers)
      .catch(() =>
        // fallback se a migração 0005 ainda não estiver aplicada: avalia todos os outros
        getPlayers()
          .then((pls) => setOthers(pls.filter((p) => p.id !== session.id)))
          .catch((err) => setError(err.message))
      )
  }, [])

  if (others === null) {
    return (
      <div style={styles.page}>
        <h1 style={{ ...styles.title, fontSize: 24, marginBottom: 16 }}>Avalia o grupo</h1>
        {error ? (
          <ErrorBox>{error}</ErrorBox>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        )}
      </div>
    )
  }

  if (others.length === 0) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.panel, textAlign: 'center', padding: 28, marginTop: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
          <p style={styles.mutedText}>
            Já avaliaste toda a gente. Quando entrarem jogadores novos, pedimos-te as notas
            deles aqui.
          </p>
          <button style={{ ...styles.button, marginTop: 20 }} onClick={onSkip}>
            Continuar
          </button>
        </div>
      </div>
    )
  }

  const ratedCount = others.filter((p) => scores[p.id] != null).length
  const complete = ratedCount === others.length

  const setScore = (id, value) => setScores((s) => ({ ...s, [id]: value }))

  const handleSubmit = async () => {
    if (!complete || busy) return
    setError('')
    setBusy(true)
    try {
      await submitRatings(session.id, session.pin, scores)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, fontSize: 24, marginBottom: 6 }}>Avalia o grupo</h1>
      <p style={{ ...styles.mutedText, marginBottom: 4 }}>
        Dá uma nota de 0 a 5 a cada jogador que ainda não avaliaste. É{' '}
        <strong>anónimo</strong> entre vocês.
      </p>
      <p
        style={{
          fontFamily: fonts.title,
          color: complete ? colors.grass : colors.muted,
          margin: '10px 0 12px',
          letterSpacing: 1,
        }}
      >
        {ratedCount}/{others.length} avaliados
      </p>

      {/* guia humorístico das notas */}
      <button
        onClick={() => setShowGuide(!showGuide)}
        style={{
          background: 'none',
          border: 'none',
          color: colors.muted,
          fontSize: 13,
          textDecoration: 'underline',
          padding: 0,
          marginBottom: 12,
        }}
      >
        {showGuide ? 'esconder o guia das notas' : 'ℹ️ ver o guia das notas'}
      </button>
      {showGuide && (
        <div style={{ ...styles.panel, padding: 12, marginBottom: 14 }}>
          {RATING_LABELS.map((l) => (
            <div
              key={l.nota}
              style={{
                display: 'flex',
                gap: 10,
                padding: '5px 0',
                fontSize: 13,
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.title,
                  color: labelColor(l.nota),
                  width: 16,
                  textAlign: 'center',
                  fontSize: 15,
                }}
              >
                {l.nota}
              </span>
              <span>
                <strong style={{ color: labelColor(l.nota) }}>{l.titulo}</strong>{' '}
                <span style={{ color: colors.muted }}>— {l.desc}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {others.map((p) => (
          <div key={p.id} style={{ ...styles.panel, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <Avatar name={p.name} photo={p.photo_url} size={44} />
              <div style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2, 3, 4, 5].map((v) => {
                const selected = scores[p.id] === v
                return (
                  <button
                    key={v}
                    onClick={() => setScore(p.id, v)}
                    style={{
                      flex: 1,
                      padding: '10px 0',
                      borderRadius: 10,
                      border: `1px solid ${selected ? colors.grass : colors.line}`,
                      background: selected ? colors.grass : '#0C1915',
                      color: selected ? '#06130D' : colors.text,
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    {v}
                  </button>
                )
              })}
            </div>
            <p
              style={{
                fontSize: 12,
                marginTop: 8,
                minHeight: 15,
                color: scores[p.id] != null ? labelColor(scores[p.id]) : colors.muted,
              }}
            >
              {scores[p.id] != null ? (
                <>
                  <strong>{RATING_LABELS[scores[p.id]].titulo}</strong>
                  <span style={{ opacity: 0.8 }}> — {RATING_LABELS[scores[p.id]].desc}</span>
                </>
              ) : (
                'toca numa nota'
              )}
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!complete || busy}
        style={
          !complete || busy ? disabled({ ...styles.button, marginTop: 20 }) : { ...styles.button, marginTop: 20 }
        }
      >
        {busy ? 'A submeter…' : complete ? 'Submeter avaliações' : 'Dá nota a todos para submeter'}
      </button>
      {error && <p style={styles.errorText}>{error}</p>}
    </div>
  )
}
