import { useEffect, useState } from 'react'
import { getMatches, getMyAwardVotes, getPlayerStats, getPlayerStatsRange, voteAward } from '../api'
import {
  assisters as getAssisters,
  awardWinners,
  formatDia,
  intervaloDe,
  matchWinner,
  PERIODOS,
  scorers as getScorers,
} from '../lib/format'
import { liderancas } from '../lib/trophies'
import { NomeClicavel } from './RoundParts'
import Avatar from './Avatar'
import RoundDetail from './RoundDetail'
import { ErrorBox, SkeletonCard } from './Ui'
import { colors, fonts, styles, disabled } from '../theme'

const MEDALS = ['🥇', '🥈', '🥉']

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

// Card de uma rodada no histórico: placar, vencedor, marcadores/assistentes,
// craque/bagre e "Ver detalhes" (que abre a rodada com fotos).
function MatchPanel({ match, onDetail, onProfile }) {
  const scorers = getScorers(match)
  const assisters = getAssisters(match)
  const craque = awardWinners(match.craque)
  const bagre = awardWinners(match.bagre)
  const w = matchWinner(match)
  const temPlacar = Number(match.score_a || 0) + Number(match.score_b || 0) > 0 || match.team_a_name

  return (
    <div style={{ ...styles.panel, padding: 14, marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
          gap: 8,
        }}
      >
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
          {formatDia(match.played_at)}
        </span>
        <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>
          {match.votes}/{match.players.length} votaram
        </span>
      </div>

      {/* placar compacto */}
      {temPlacar && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 10,
            background: '#0C1915',
            border: `1px solid ${colors.line}`,
          }}
        >
          <span
            style={{
              fontFamily: fonts.title,
              fontSize: 20,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            <span style={{ color: colors.teamA }}>{Number(match.score_a || 0)}</span>
            <span style={{ color: colors.muted }}> — </span>
            <span style={{ color: colors.teamB }}>{Number(match.score_b || 0)}</span>
          </span>
          <span style={{ fontSize: 13, color: w.isDraw ? colors.muted : colors.grass, fontWeight: 600 }}>
            {w.isDraw ? '🤝 Empate' : `🏆 ${w.name}`}
          </span>
        </div>
      )}

      <p style={{ fontSize: 13, marginBottom: 4 }}>
        ⚽{' '}
        {scorers.length ? (
          scorers.map((p, i) => (
            <span key={p.player_id}>
              {i > 0 && ', '}
              <NomeClicavel id={p.player_id} nome={p.name} onProfile={onProfile} />
              {p.goals > 1 && <span style={{ color: colors.muted }}> ({p.goals})</span>}
            </span>
          ))
        ) : (
          <span style={{ color: colors.muted }}>sem gols</span>
        )}
      </p>
      <p style={{ fontSize: 13, marginBottom: 8 }}>
        🅰️{' '}
        {assisters.length ? (
          assisters.map((p, i) => (
            <span key={p.player_id}>
              {i > 0 && ', '}
              <NomeClicavel id={p.player_id} nome={p.name} onProfile={onProfile} />
              {p.assists > 1 && <span style={{ color: colors.muted }}> ({p.assists})</span>}
            </span>
          ))
        ) : (
          <span style={{ color: colors.muted }}>sem assistências</span>
        )}
      </p>

      {match.votes > 0 ? (
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
      ) : (
        <p style={{ ...styles.mutedText, fontSize: 13 }}>Ainda sem votos de craque/bagre.</p>
      )}

      <button
        onClick={() => onDetail(match.id)}
        style={{ ...styles.buttonGhost, marginTop: 12, padding: '10px 16px', fontSize: 14 }}
      >
        Ver detalhes →
      </button>
    </div>
  )
}

export default function StatsScreen({ session, onBack, initialTab = 'geral', onProfile }) {
  const [tab, setTab] = useState(initialTab) // geral | rodadas
  const [stats, setStats] = useState(null)
  const [matches, setMatches] = useState(null)
  const [myVotes, setMyVotes] = useState([])
  const [detailId, setDetailId] = useState(null) // rodada aberta em detalhe
  const [periodo, setPeriodo] = useState('sempre')
  const [error, setError] = useState('')

  // totais do período escolhido (cai para o get_player_stats se a 0013
  // ainda não estiver aplicada)
  const carregarStats = (p) => {
    const { de, ate } = intervaloDe(p)
    return getPlayerStatsRange(de, ate)
      .catch(() => getPlayerStats())
      .then((s) => setStats(s || []))
  }

  const load = () =>
    Promise.all([
      carregarStats(periodo),
      getMatches(),
      getMyAwardVotes(session.id, session.pin),
    ])
      .then(([, m, v]) => {
        setMatches(m || [])
        setMyVotes(v || [])
        setError('')
      })
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  // ao trocar de período, recarrega só os totais
  useEffect(() => {
    if (stats !== null) carregarStats(periodo).catch(() => {})
  }, [periodo])

  // detalhe de uma rodada (com fotos) sobrepõe-se ao resto
  if (detailId) {
    return (
      <RoundDetail
        matchId={detailId}
        onBack={() => setDetailId(null)}
        onProfile={(id) => onProfile?.(id, matches?.length || 0)}
      />
    )
  }

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
        <h1 style={{ ...styles.title, fontSize: 22, marginBottom: 16 }}>Estatísticas 📊</h1>
        {error ? (
          <>
            <ErrorBox>{error}</ErrorBox>
            <button style={{ ...styles.buttonGhost, marginTop: 16 }} onClick={onBack}>
              Voltar
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
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
          {/* período / temporada */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 12,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {PERIODOS.map((p) => {
              const on = periodo === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setPeriodo(p.id)}
                  style={{
                    flexShrink: 0,
                    padding: '7px 14px',
                    borderRadius: 999,
                    border: `1px solid ${on ? colors.grass : colors.line}`,
                    background: on ? 'rgba(52,208,88,0.14)' : '#0C1915',
                    color: on ? colors.grass : colors.muted,
                    fontSize: 13,
                    fontWeight: on ? 700 : 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

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
                  onClick={() => onProfile?.(p.id, matches.length)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onProfile?.(p.id, matches.length)}
                  title={`Ver perfil de ${p.name}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 8px',
                    borderBottom: i < stats.length - 1 ? `1px solid ${colors.line}` : 'none',
                    background:
                      p.id === session.id ? 'rgba(52,208,88,0.06)' : 'transparent',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.title,
                      color: colors.muted,
                      width: 22,
                      textAlign: 'center',
                      fontSize: i < 3 && p.goals > 0 ? 17 : 14,
                    }}
                  >
                    {i < 3 && p.goals > 0 ? MEDALS[i] : i + 1}
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

          {/* quadro de troféus do grupo */}
          {(() => {
            const l = liderancas(stats)
            const linhas = [
              ['⚽', 'Artilheiro', l.artilheiro, 'gols'],
              ['🅰️', 'Rei das assistências', l.garcom, 'assist.'],
              ['👑', 'Mais craques', l.craque, '×'],
              ['🐟', 'Mais bagres', l.bagre, '×'],
            ].filter(([, , v]) => v)
            if (!linhas.length) return null
            return (
              <>
                <div
                  style={{
                    fontFamily: fonts.title,
                    letterSpacing: 1,
                    fontSize: 15,
                    margin: '22px 0 8px',
                  }}
                >
                  🏆 Troféus do grupo
                </div>
                <div style={{ ...styles.panel, padding: 10 }}>
                  {linhas.map(([icon, titulo, dados, unidade], i) => (
                    <div
                      key={titulo}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 4px',
                        borderBottom: i < linhas.length - 1 ? `1px solid ${colors.line}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 20 }} aria-hidden>
                        {icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: colors.muted }}>{titulo}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {dados.jogadores.map((j) => j.name).join(' e ')}
                        </div>
                      </div>
                      <span
                        style={{
                          fontFamily: fonts.title,
                          fontSize: 18,
                          fontWeight: 700,
                          color: colors.grass,
                          flexShrink: 0,
                        }}
                      >
                        {dados.valor}
                        <span style={{ fontSize: 11, color: colors.muted }}> {unidade}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
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
              <MatchPanel
                key={m.id}
                match={m}
                onDetail={setDetailId}
                onProfile={(id) => onProfile?.(id, matches.length)}
              />
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
