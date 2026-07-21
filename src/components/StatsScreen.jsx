import { useEffect, useState } from 'react'
import { getMatches, getMyAwardVotes, getPlayerStats, voteAward } from '../api'
import { awardWinners, formatDia } from '../lib/format'
import { GIF_BAGRE, GIF_CRAQUE } from '../lib/gifs'
import Avatar from './Avatar'
import { colors, fonts, styles, disabled } from '../theme'

// Cartão do vencedor com GIF — só na rodada mais recente, para a página não pesar
function WinnerGif({ tipo, winner }) {
  if (!winner) return null
  const craque = tipo === 'craque'
  const cor = craque ? colors.teamA : colors.teamB
  const rotulo = craque ? '👑 Craque da rodada' : '🐟 Bagre da rodada'
  return (
    <div
      style={{
        border: `1px solid ${cor}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: '#0C1915',
      }}
    >
      <img
        src={craque ? GIF_CRAQUE : GIF_BAGRE}
        alt={rotulo}
        style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
      />
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontFamily: fonts.title, fontSize: 12, letterSpacing: 1, color: cor }}>
          {rotulo}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{winner.names}</div>
        <div style={{ fontSize: 12, color: colors.muted }}>
          {winner.votes} {winner.votes === 1 ? 'voto' : 'votos'}
        </div>
      </div>
    </div>
  )
}

// Cartão de votação de craque + bagre numa rodada pendente
function VoteCard({ match, session, onVoted }) {
  const [craque, setCraque] = useState(null)
  const [bagre, setBagre] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const options = match.players.filter((p) => p.player_id !== session.id)
  const mesmo = craque && bagre && craque === bagre
  const pronto = craque && bagre && !mesmo

  const submit = async () => {
    if (!pronto || busy) return
    setError('')
    setBusy(true)
    try {
      await voteAward(session.id, session.pin, match.id, craque, bagre)
      onVoted()
    } catch (err) {
      // votou entretanto noutro dispositivo/tab: refresca em vez de mostrar erro
      if (err.code === 'VOTOFEITO') onVoted()
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const chips = (selected, cor, onPick) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {options.map((p) => {
        const sel = selected === p.player_id
        return (
          <button
            key={p.player_id}
            onClick={() => onPick(sel ? null : p.player_id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 12px 6px 6px',
              borderRadius: 999,
              border: `1px solid ${sel ? cor : colors.line}`,
              background: sel ? 'rgba(255,255,255,0.06)' : '#0C1915',
              color: sel ? cor : colors.text,
              fontSize: 14,
              fontWeight: sel ? 700 : 400,
            }}
          >
            <Avatar name={p.name} photo={p.photo} size={26} />
            {p.name}
          </button>
        )
      })}
    </div>
  )

  return (
    <div style={{ ...styles.panel, border: `1px solid ${colors.teamA}`, marginBottom: 12 }}>
      <div style={{ ...styles.title, fontSize: 16, marginBottom: 4 }}>
        🗳️ Vota na rodada de {formatDia(match.played_at)}
      </div>
      <p style={{ ...styles.mutedText, fontSize: 13 }}>
        Só quem jogou vota, e só se vota uma vez — pensa bem. 😄
      </p>

      <div style={{ marginTop: 14 }}>
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, color: colors.teamA }}>
          👑 Craque da rodada
        </span>
        {chips(craque, colors.teamA, setCraque)}
      </div>

      <div style={{ marginTop: 14 }}>
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, color: colors.teamB }}>
          🐟 Bagre da rodada
        </span>
        {chips(bagre, colors.teamB, setBagre)}
      </div>

      {mesmo && (
        <p style={styles.errorText}>O craque e o bagre não podem ser o mesmo jogador.</p>
      )}
      <button
        onClick={submit}
        disabled={!pronto || busy}
        style={
          !pronto || busy
            ? disabled({ ...styles.button, marginTop: 16 })
            : { ...styles.button, marginTop: 16 }
        }
      >
        {busy ? 'A votar…' : 'Submeter voto'}
      </button>
      {error && <p style={styles.errorText}>{error}</p>}
    </div>
  )
}

// Painel de resultados de uma rodada já votada (ou de quem não jogou)
function MatchPanel({ match, destaque }) {
  const scorers = match.players.filter((p) => p.goals > 0)
  const assisters = match.players.filter((p) => p.assists > 0)
  const craque = awardWinners(match.craque)
  const bagre = awardWinners(match.bagre)

  return (
    <div style={{ ...styles.panel, padding: 14, marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
          {formatDia(match.played_at)}
        </span>
        <span style={{ fontSize: 12, color: colors.muted }}>
          {match.votes}/{match.players.length} votaram
        </span>
      </div>

      <p style={{ fontSize: 13, marginBottom: 4 }}>
        ⚽{' '}
        {scorers.length ? (
          scorers.map((p) => `${p.name} (${p.goals})`).join(', ')
        ) : (
          <span style={{ color: colors.muted }}>sem gols… ninguém quis decidir 🥱</span>
        )}
      </p>
      <p style={{ fontSize: 13, marginBottom: 8 }}>
        🅰️{' '}
        {assisters.length ? (
          assisters.map((p) => `${p.name} (${p.assists})`).join(', ')
        ) : (
          <span style={{ color: colors.muted }}>sem assistências</span>
        )}
      </p>

      {match.votes > 0 ? (
        destaque ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
            <WinnerGif tipo="craque" winner={craque} />
            <WinnerGif tipo="bagre" winner={bagre} />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
            {craque && (
              <span style={{ color: colors.teamA }}>
                👑 {craque.names} <span style={{ color: colors.muted }}>({craque.votes}{' '}
                {craque.votes === 1 ? 'voto' : 'votos'})</span>
              </span>
            )}
            {bagre && (
              <span style={{ color: colors.teamB }}>
                🐟 {bagre.names} <span style={{ color: colors.muted }}>({bagre.votes}{' '}
                {bagre.votes === 1 ? 'voto' : 'votos'})</span>
              </span>
            )}
          </div>
        )
      ) : (
        <p style={{ ...styles.mutedText, fontSize: 13 }}>Ainda sem votos de craque/bagre.</p>
      )}
    </div>
  )
}

export default function StatsScreen({ session, onBack, initialTab = 'geral' }) {
  const [tab, setTab] = useState(initialTab) // geral | rodadas
  const [stats, setStats] = useState(null)
  const [matches, setMatches] = useState(null)
  const [myVotes, setMyVotes] = useState([])
  const [error, setError] = useState('')

  const load = () =>
    Promise.all([getPlayerStats(), getMatches(), getMyAwardVotes(session.id, session.pin)])
      .then(([s, m, v]) => {
        setStats(s || [])
        setMatches(m || [])
        setMyVotes(v || [])
        setError('')
      })
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        padding: '10px 0',
        background: 'transparent',
        color: tab === id ? colors.text : colors.muted,
        border: 'none',
        borderBottom: `2px solid ${tab === id ? colors.grass : colors.line}`,
        fontFamily: fonts.title,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  )

  if (stats === null || matches === null) {
    return (
      <div style={styles.page}>
        <p style={{ ...styles.mutedText, textAlign: 'center', marginTop: 60 }}>
          {error || 'A carregar estatísticas…'}
        </p>
        {error && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button style={styles.buttonGhost} onClick={onBack}>
              Voltar
            </button>
          </div>
        )}
      </div>
    )
  }

  // rodadas em que joguei e ainda não votei (com <3 jogadores não há
  // votação possível — sem votar em si e com craque ≠ bagre)
  const pendentes = matches.filter(
    (m) =>
      m.players.length >= 3 &&
      m.players.some((p) => p.player_id === session.id) &&
      !myVotes.includes(m.id)
  )

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
        <h1 style={{ ...styles.title, fontSize: 22 }}>
          Estatísticas <span style={{ color: colors.grass }}>📊</span>
        </h1>
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
          Voltar
        </button>
      </div>

      <div style={{ display: 'flex', marginBottom: 16 }}>
        {tabBtn('geral', 'Geral')}
        {tabBtn('rodadas', `Rodadas${pendentes.length ? ' 🗳️' : ''}`)}
      </div>

      {error && <p style={{ ...styles.errorText, marginBottom: 12 }}>{error}</p>}

      {/* ---------- GERAL ---------- */}
      {tab === 'geral' && (
        <div>
          {stats.length === 0 ? (
            <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
              <p style={styles.mutedText}>Ainda não há jogadores aprovados.</p>
            </div>
          ) : (
            <div style={{ ...styles.panel, padding: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '4px 8px 8px',
                  fontSize: 12,
                  color: colors.muted,
                  borderBottom: `1px solid ${colors.line}`,
                }}
              >
                <span style={{ width: 22 }} />
                <span style={{ width: 36 }} />
                <span style={{ flex: 1 }}>Jogador</span>
                <span style={statCol}>J</span>
                <span style={statCol}>⚽</span>
                <span style={statCol}>🅰️</span>
                <span style={statCol}>👑</span>
                <span style={statCol}>🐟</span>
              </div>
              {stats.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 8px',
                    borderBottom: i < stats.length - 1 ? `1px solid ${colors.line}` : 'none',
                    background:
                      p.id === session.id ? 'rgba(52,208,88,0.06)' : 'transparent',
                    borderRadius: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.title,
                      color: colors.muted,
                      width: 22,
                      textAlign: 'center',
                      fontSize: 14,
                    }}
                  >
                    {i + 1}
                  </span>
                  <Avatar name={p.name} photo={p.photo} size={36} />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: p.id === session.id ? 700 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name}
                  </span>
                  <span style={{ ...statCol, color: colors.muted }}>{p.matches}</span>
                  <span style={{ ...statCol, fontWeight: 700 }}>{p.goals}</span>
                  <span style={statCol}>{p.assists}</span>
                  <span style={{ ...statCol, color: colors.teamA }}>{p.craques}</span>
                  <span style={{ ...statCol, color: colors.teamB }}>{p.bagres}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
            J = jogos · ⚽ gols · 🅰️ assistências · 👑 craque da rodada · 🐟 bagre da rodada
          </p>
        </div>
      )}

      {/* ---------- RODADAS ---------- */}
      {tab === 'rodadas' && (
        <div>
          {pendentes.map((m) => (
            <VoteCard key={m.id} match={m} session={session} onVoted={load} />
          ))}
          {matches.length === 0 && (
            <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
              <p style={styles.mutedText}>
                Ainda não há rodadas registadas. Depois de cada pelada, o admin regista os gols
                e as assistências — e a votação abre aqui.
              </p>
            </div>
          )}
          {matches
            .filter((m) => !pendentes.some((p) => p.id === m.id))
            .map((m) => (
              <MatchPanel key={m.id} match={m} destaque={m.id === matches[0]?.id} />
            ))}
        </div>
      )}
    </div>
  )
}

const statCol = {
  width: 26,
  textAlign: 'center',
  fontSize: 13,
  flexShrink: 0,
}
