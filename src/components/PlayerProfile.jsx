import { useEffect, useState } from 'react'
import { getPlayerProfile } from '../api'
import { formatDia } from '../lib/format'
import { descarregarCard, overallDe, partilharCard, renderPlayerCard } from '../lib/card'
import { balanco, calcularConquistas, calcularSequencias, resultadoDe } from '../lib/trophies'
import { ErrorBox, SectionTitle, SkeletonCard } from './Ui'
import { colors, fonts, styles } from '../theme'

const CORES_RES = { V: colors.grass, E: colors.muted, D: colors.error }

function StatBox({ label, valor, cor }) {
  return (
    <div
      style={{
        background: '#0C1915',
        border: `1px solid ${colors.line}`,
        borderRadius: 10,
        padding: '10px 8px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: fonts.title,
          fontSize: 24,
          fontWeight: 700,
          color: cor || colors.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </div>
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

export default function PlayerProfile({ playerId, totalRodadas = 0, onBack }) {
  const [p, setP] = useState(null)
  const [error, setError] = useState('')
  const [cardUrl, setCardUrl] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    let vivo = true
    getPlayerProfile(playerId)
      .then((d) => vivo && setP(d))
      .catch((err) => vivo && setError(err.message))
    return () => {
      vivo = false
    }
  }, [playerId])

  // gera o card assim que o perfil chega
  useEffect(() => {
    if (!p) return
    let vivo = true
    renderPlayerCard(p)
      .then((url) => vivo && setCardUrl(url))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [p])

  const voltar = (
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
  )

  if (error) {
    return (
      <div style={styles.page}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>{voltar}</div>
        <ErrorBox>{error}</ErrorBox>
      </div>
    )
  }

  if (!p) {
    return (
      <div style={styles.page}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>{voltar}</div>
        <SkeletonCard lines={4} />
      </div>
    )
  }

  const seq = calcularSequencias(p)
  const bal = balanco(p)
  const { desbloqueadas, bloqueadas } = calcularConquistas(p, totalRodadas)
  const ovr = overallDe(p.avg)

  const partilhar = async () => {
    if (!cardUrl) return
    const r = await partilharCard(cardUrl, p.name)
    setAviso(r === 'partilhado' ? 'Partilhado ✓' : 'Card descarregado ✓')
    setTimeout(() => setAviso(''), 2200)
  }

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
        <h1 style={{ ...styles.title, fontSize: 20 }}>Perfil</h1>
        {voltar}
      </div>

      {/* card partilhável */}
      <div className="rise-in" style={{ ...styles.panel, padding: 14 }}>
        {cardUrl ? (
          <img
            src={cardUrl}
            alt={`Card de ${p.name}`}
            style={{ width: '100%', maxWidth: 340, margin: '0 auto', borderRadius: 14 }}
          />
        ) : (
          <div
            className="skeleton"
            style={{ width: '100%', maxWidth: 340, margin: '0 auto', aspectRatio: '600 / 840' }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={partilhar}
            disabled={!cardUrl}
            style={{ ...styles.button, fontSize: 14, padding: '12px 10px' }}
          >
            📤 Partilhar card
          </button>
          <button
            onClick={() => cardUrl && descarregarCard(cardUrl, p.name)}
            disabled={!cardUrl}
            style={{ ...styles.buttonGhost, fontSize: 14, padding: '12px 10px' }}
          >
            ⬇️ Guardar
          </button>
        </div>
        {aviso && (
          <p style={{ color: colors.grass, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
            {aviso}
          </p>
        )}
      </div>

      {/* números */}
      <SectionTitle>Números</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <StatBox label="MÉDIA" valor={p.avg == null ? '—' : Number(p.avg).toFixed(2)} cor={colors.grass} />
        <StatBox label="OVERALL" valor={ovr == null ? '—' : ovr} cor={colors.grass} />
        <StatBox label="JOGOS" valor={p.matches} />
        <StatBox label="GOLS" valor={p.goals} />
        <StatBox label="ASSIST." valor={p.assists} />
        <StatBox label="VOTOS" valor={p.votes} />
        <StatBox label="👑 CRAQUE" valor={p.craques} cor={colors.teamA} />
        <StatBox label="🐟 BAGRE" valor={p.bagres} cor={colors.teamB} />
        <StatBox
          label="V-E-D"
          valor={`${bal.V}-${bal.E}-${bal.D}`}
        />
      </div>

      {/* sequências */}
      {(seq.marcando.melhor > 0 || seq.vitorias.melhor > 0) && (
        <>
          <SectionTitle cor={colors.teamA}>Sequências</SectionTitle>
          <div style={{ ...styles.panel, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {seq.marcando.atual >= 2 && (
              <p style={{ fontSize: 14 }}>
                🔥 <strong>{seq.marcando.atual} rodadas seguidas a marcar</strong> (a contar!)
              </p>
            )}
            {seq.marcando.melhor > 0 && (
              <p style={{ fontSize: 14, color: colors.muted }}>
                ⚽ Melhor sequência a marcar: <strong style={{ color: colors.text }}>{seq.marcando.melhor}</strong>
              </p>
            )}
            {seq.vitorias.atual >= 2 && (
              <p style={{ fontSize: 14 }}>
                🏆 <strong>{seq.vitorias.atual} vitórias seguidas</strong>
              </p>
            )}
            {seq.vitorias.melhor > 0 && (
              <p style={{ fontSize: 14, color: colors.muted }}>
                🥇 Melhor série de vitórias: <strong style={{ color: colors.text }}>{seq.vitorias.melhor}</strong>
              </p>
            )}
          </div>
        </>
      )}

      {/* conquistas */}
      <SectionTitle cor={colors.teamA}>Conquistas</SectionTitle>
      {desbloqueadas.length === 0 ? (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 20 }}>
          <p style={styles.mutedText}>Ainda sem conquistas — joga e marca! ⚽</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {desbloqueadas.map((t) => (
            <div
              key={t.id}
              style={{
                ...styles.panel,
                padding: 10,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                borderColor: colors.teamA,
              }}
            >
              <span style={{ fontSize: 24 }} aria-hidden>
                {t.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.titulo}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>{t.detalhe || t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {bloqueadas.length > 0 && (
        <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
          Por desbloquear: {bloqueadas.map((t) => `${t.icon} ${t.titulo}`).join(' · ')}
        </p>
      )}

      {/* histórico */}
      <SectionTitle>Histórico</SectionTitle>
      {(p.history || []).length === 0 ? (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 20 }}>
          <p style={styles.mutedText}>Ainda não jogou nenhuma rodada registada.</p>
        </div>
      ) : (
        <div style={{ ...styles.panel, padding: 8 }}>
          {p.history.map((h, i) => {
            const res = resultadoDe(h)
            return (
              <div
                key={h.match_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 6px',
                  borderBottom: i < p.history.length - 1 ? `1px solid ${colors.line}` : 'none',
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: res ? CORES_RES[res] : colors.muted,
                    border: `1px solid ${res ? CORES_RES[res] : colors.line}`,
                  }}
                >
                  {res || '–'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{formatDia(h.played_at)}</div>
                  <div style={{ fontSize: 11, color: colors.muted }}>
                    {h.team_a_name} {h.score_a}–{h.score_b} {h.team_b_name}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>
                  {h.goals > 0 && <span style={{ color: colors.text }}>⚽{h.goals} </span>}
                  {h.assists > 0 && <span style={{ color: colors.text }}>🅰️{h.assists} </span>}
                  {h.craque && '👑'}
                  {h.bagre && '🐟'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
