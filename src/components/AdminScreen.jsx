import { useEffect, useState } from 'react'
import {
  adminAddMatch,
  adminDeleteMatch,
  adminPending,
  adminApprove,
  adminReject,
  adminResetRatings,
  adminResetRatingsFor,
  getMatches,
  getPlayers,
  getPublishedDraw,
  getStats,
  publishDraw,
} from '../api'
import { drawTeams } from '../lib/draw'
import { awardWinners, formatDia, hojeLocal } from '../lib/format'
import { ADMIN_NAME } from '../config'
import Avatar from './Avatar'
import DrawView from './DrawView'
import { colors, fonts, styles, disabled } from '../theme'

function idade(dob) {
  if (!dob) return null
  const d = new Date(dob)
  const hoje = new Date()
  let anos = hoje.getFullYear() - d.getFullYear()
  const m = hoje.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--
  return anos
}

const linkStyle = {
  background: 'none',
  border: 'none',
  color: colors.muted,
  fontSize: 13,
  textDecoration: 'underline',
}

const stepBtn = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: `1px solid ${colors.line}`,
  background: '#0C1915',
  color: colors.text,
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1,
  padding: 0,
}

// Contador − n + para gols/assistências
function Stepper({ icon, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} style={stepBtn}>
        −
      </button>
      <span style={{ width: 16, textAlign: 'center', fontWeight: 700, fontSize: 13 }}>
        {value}
      </span>
      <button type="button" onClick={() => onChange(Math.min(99, value + 1))} style={stepBtn}>
        +
      </button>
    </div>
  )
}

export default function AdminScreen({ onExit }) {
  const [pw, setPw] = useState('')
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState('pedidos') // pedidos | plantel | sorteio

  const [pending, setPending] = useState([])
  const [players, setPlayers] = useState([])
  const [stats, setStats] = useState(null) // { approved, voters }

  const [present, setPresent] = useState({}) // { [id]: bool }
  const [force, setForce] = useState(false)
  const [result, setResult] = useState(null) // { A, B }
  const [published, setPublished] = useState(false)

  // rodadas / estatísticas
  const [matches, setMatches] = useState([])
  const [matchesErr, setMatchesErr] = useState('')
  const [lastDraw, setLastDraw] = useState(null)
  const [jogoDate, setJogoDate] = useState(hojeLocal)
  const [jogou, setJogou] = useState({}) // { [id]: bool }
  const [gols, setGols] = useState({}) // { [id]: int }
  const [assists, setAssists] = useState({}) // { [id]: int }
  const [jogoOk, setJogoOk] = useState(false)

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async (senha = pw) => {
    // o sorteio publicado vem no mesmo lote para o efeito que semeia as
    // presenças do jogo já o ter disponível na primeira execução
    const [pend, pls, st, ld] = await Promise.all([
      adminPending(senha),
      getPlayers(),
      getStats(),
      getPublishedDraw().catch(() => null),
    ])
    setPending(pend || [])
    setPlayers(pls || [])
    setStats(st)
    setLastDraw(ld)
    // presenças: mantém escolhas anteriores, novos aprovados entram marcados
    setPresent((prev) => {
      const next = {}
      for (const p of pls || []) next[p.id] = prev[p.id] ?? true
      return next
    })
    // rodadas (não-fatal: sem a migração 0002 o resto do admin continua a funcionar)
    getMatches()
      .then((m) => {
        setMatches(m || [])
        setMatchesErr('')
      })
      .catch((err) => setMatchesErr(err.message))
  }

  // presenças do jogo a registar: por defeito, quem estava no último sorteio publicado
  useEffect(() => {
    if (!players.length) return
    const drawIds = lastDraw
      ? new Set([...(lastDraw.team_a || []), ...(lastDraw.team_b || [])].map((p) => p.id))
      : null
    setJogou((prev) => {
      const next = {}
      for (const p of players) next[p.id] = prev[p.id] ?? (drawIds ? drawIds.has(p.id) : true)
      return next
    })
  }, [players, lastDraw])

  const entrar = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await refresh(pw) // admin_pending valida a senha (erro ADMIN se errada)
      setAuthed(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const acao = async (fn) => {
    setError('')
    setBusy(true)
    try {
      await fn()
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const aprovar = (p) => acao(() => adminApprove(pw, p.id))
  const rejeitar = (p, verbo) => {
    if (!window.confirm(`${verbo} ${p.name}? Esta ação apaga a conta e os votos.`)) return
    acao(() => adminReject(pw, p.id))
  }

  const reavaliarUm = (p) => {
    if (!window.confirm(`Reiniciar a avaliação de ${p.name}? Todo o grupo terá de o avaliar de novo.`))
      return
    acao(() => adminResetRatingsFor(pw, p.id))
  }
  const reavaliarTodos = () => {
    if (
      !window.confirm(
        'Reiniciar TODAS as avaliações? Todo o grupo terá de avaliar toda a gente outra vez, do zero.'
      )
    )
      return
    acao(() => adminResetRatings(pw))
  }

  // ---------- sorteio ----------
  const presentes = players.filter((p) => present[p.id])
  const allVoted = stats != null && stats.approved > 1 && stats.voters >= stats.approved
  const podeSortear = presentes.length >= 2 && (allVoted || force)

  const sortear = () => {
    const lista = presentes.map((p) => ({
      id: p.id,
      name: p.name,
      photo: p.photo_url,
      avg: p.avg == null ? 2.5 : Number(p.avg), // sem notas → 2.5 neutro
    }))
    setResult(drawTeams(lista))
    setPublished(false)
  }

  const trocar = (idA, idB) => {
    setResult((r) => {
      const pa = r.A.find((p) => p.id === idA)
      const pb = r.B.find((p) => p.id === idB)
      if (!pa || !pb) return r
      return {
        A: r.A.map((p) => (p.id === idA ? pb : p)),
        B: r.B.map((p) => (p.id === idB ? pa : p)),
      }
    })
    setPublished(false)
  }

  const publicar = async () => {
    setError('')
    setBusy(true)
    try {
      await publishDraw(pw, result.A, result.B)
      setPublished(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // ---------- jogos / rodadas ----------
  const jogadoresDoJogo = players.filter((p) => jogou[p.id])

  const guardarJogo = async () => {
    setError('')
    setJogoOk(false)
    const lista = jogadoresDoJogo.map((p) => ({
      player_id: p.id,
      goals: gols[p.id] || 0,
      assists: assists[p.id] || 0,
    }))
    if (!jogoDate) return setError('A data do jogo é obrigatória.')
    // mínimo 3: com menos, a votação de craque/bagre seria impossível
    if (lista.length < 3) return setError('Marca pelo menos 3 jogadores que jogaram.')
    setBusy(true)
    try {
      await adminAddMatch(pw, jogoDate, lista)
      setGols({})
      setAssists({})
      setJogoOk(true)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const apagarJogo = (m) => {
    if (!window.confirm(`Apagar a rodada de ${formatDia(m.played_at)}? Leva os gols e os votos junto.`)) return
    acao(() => adminDeleteMatch(pw, m.id))
  }

  // ---------- ecrã de senha ----------
  if (!authed) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center', margin: '40px 0 24px' }}>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🔐</div>
          <h1 style={{ ...styles.title, fontSize: 24 }}>Área do admin</h1>
          <p style={{ ...styles.mutedText, marginTop: 6 }}>{ADMIN_NAME}</p>
        </div>
        <form onSubmit={entrar} style={styles.panel}>
          <label style={styles.label}>Senha de admin</label>
          <input
            style={styles.input}
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Senha"
            autoComplete="off"
          />
          <button
            type="submit"
            style={busy ? disabled({ ...styles.button, marginTop: 16 }) : { ...styles.button, marginTop: 16 }}
            disabled={busy}
          >
            {busy ? 'A verificar…' : 'Entrar'}
          </button>
          {error && <p style={styles.errorText}>{error}</p>}
        </form>
        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <button onClick={onExit} style={linkStyle}>
            Voltar
          </button>
        </div>
      </div>
    )
  }

  // ---------- tabs ----------
  const tabBtn = (id, label, badge) => (
    <button
      onClick={() => {
        setTab(id)
        setError('')
      }}
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
        position: 'relative',
      }}
    >
      {label}
      {badge > 0 && (
        <span
          style={{
            marginLeft: 6,
            background: colors.error,
            color: '#fff',
            borderRadius: 999,
            padding: '1px 7px',
            fontSize: 11,
            fontFamily: fonts.body,
          }}
        >
          {badge}
        </span>
      )}
    </button>
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
        <div>
          <h1 style={{ ...styles.title, fontSize: 22 }}>
            Admin <span style={{ color: colors.grass }}>⚖️</span>
          </h1>
          <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 2 }}>{ADMIN_NAME}</p>
        </div>
        <button onClick={onExit} style={linkStyle}>
          Sair
        </button>
      </div>

      <div style={{ display: 'flex', marginBottom: 16 }}>
        {tabBtn('pedidos', 'Pedidos', pending.length)}
        {tabBtn('plantel', 'Plantel', 0)}
        {tabBtn('sorteio', 'Sorteio', 0)}
        {tabBtn('jogos', 'Jogos', 0)}
      </div>

      {error && <p style={{ ...styles.errorText, marginBottom: 12 }}>{error}</p>}

      {/* ---------- PEDIDOS ---------- */}
      {tab === 'pedidos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.length === 0 && (
            <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
              <p style={styles.mutedText}>Sem pedidos pendentes. 👌</p>
            </div>
          )}
          {pending.map((p) => (
            <div key={p.id} style={{ ...styles.panel, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Avatar name={p.name} photo={p.photo_url} size={48} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: colors.muted }}>
                    {idade(p.dob) != null ? `${idade(p.dob)} anos` : 'Idade desconhecida'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => aprovar(p)}
                  disabled={busy}
                  style={{ ...styles.button, padding: '10px 0', fontSize: 14 }}
                >
                  Aprovar
                </button>
                <button
                  onClick={() => rejeitar(p, 'Rejeitar')}
                  disabled={busy}
                  style={{
                    ...styles.buttonGhost,
                    padding: '10px 0',
                    fontSize: 14,
                    color: colors.error,
                    borderColor: colors.error,
                  }}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- PLANTEL ---------- */}
      {tab === 'plantel' && (
        <div style={{ ...styles.panel, padding: 8 }}>
          {players.length === 0 && (
            <p style={{ ...styles.mutedText, textAlign: 'center', padding: 14 }}>
              Ainda não há jogadores aprovados.
            </p>
          )}
          {players.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 8,
                borderBottom: i < players.length - 1 ? `1px solid ${colors.line}` : 'none',
              }}
            >
              <Avatar name={p.name} photo={p.photo_url} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>
                  {p.avg != null ? `média ${Number(p.avg).toFixed(2)}` : 'sem votos'} ·{' '}
                  {p.votes} {Number(p.votes) === 1 ? 'voto' : 'votos'}
                </div>
              </div>
              <button
                onClick={() => reavaliarUm(p)}
                disabled={busy}
                title="Todo o grupo reavalia este jogador"
                style={{ ...linkStyle, color: colors.teamA }}
              >
                Reavaliar
              </button>
              <button
                onClick={() => rejeitar(p, 'Remover')}
                disabled={busy}
                style={{ ...linkStyle, color: colors.error }}
              >
                Remover
              </button>
            </div>
          ))}
          {players.length > 0 && (
            <div style={{ padding: '12px 8px 4px', borderTop: `1px solid ${colors.line}` }}>
              <button
                onClick={reavaliarTodos}
                disabled={busy}
                style={{
                  ...styles.buttonGhost,
                  color: colors.teamA,
                  borderColor: colors.teamA,
                  fontSize: 14,
                }}
              >
                🔄 Reiniciar avaliações de todos
              </button>
              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 8 }}>
                Todo o grupo terá de avaliar toda a gente outra vez. Usa "Reavaliar" num jogador
                para reiniciar só as notas dele.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------- SORTEIO ---------- */}
      {tab === 'sorteio' && (
        <div>
          {/* progresso das avaliações */}
          <div style={{ ...styles.panel, marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 8,
              }}
            >
              <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
                Avaliações
              </span>
              <span style={{ fontSize: 14, color: allVoted ? colors.grass : colors.muted }}>
                {stats ? `${stats.voters}/${stats.approved} avaliaram` : '…'}
              </span>
            </div>
            <div style={{ height: 8, background: '#0C1915', borderRadius: 999 }}>
              <div
                style={{
                  height: '100%',
                  width: stats && stats.approved > 0 ? `${Math.min(100, (stats.voters / stats.approved) * 100)}%` : 0,
                  background: allVoted ? colors.grass : colors.teamA,
                  borderRadius: 999,
                  transition: 'width .3s',
                }}
              />
            </div>
            {!allVoted && !force && (
              <div style={{ marginTop: 10, textAlign: 'right' }}>
                <button onClick={() => setForce(true)} style={{ ...linkStyle, fontSize: 12 }}>
                  forçar mesmo assim
                </button>
              </div>
            )}
            {force && !allVoted && (
              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 8 }}>
                ⚠️ Sorteio forçado: quem não tem notas entra com média neutra 2.5.
              </p>
            )}
          </div>

          {/* presenças */}
          <div style={{ ...styles.panel, marginBottom: 12, padding: 12 }}>
            <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 8 }}>
              Quem joga hoje? ({presentes.length})
            </div>
            {players.map((p) => (
              <label
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 2px',
                  fontSize: 15,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!present[p.id]}
                  onChange={(e) => setPresent({ ...present, [p.id]: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: colors.grass }}
                />
                <Avatar name={p.name} photo={p.photo_url} size={28} />
                <span style={{ flex: 1 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: colors.muted }}>
                  {p.avg != null ? Number(p.avg).toFixed(2) : '2.5*'}
                </span>
              </label>
            ))}
            {players.length === 0 && <p style={styles.mutedText}>Sem jogadores aprovados.</p>}
          </div>

          <button
            onClick={sortear}
            disabled={!podeSortear || busy}
            style={!podeSortear || busy ? disabled(styles.button) : styles.button}
          >
            {result ? 'Sortear de novo' : 'Sortear equipas'}
          </button>
          {!podeSortear && presentes.length < 2 && (
            <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
              São precisos pelo menos 2 presentes.
            </p>
          )}

          {result && (
            <div style={{ marginTop: 18 }}>
              <DrawView A={result.A} B={result.B} onSwap={trocar} />
              <button
                onClick={publicar}
                disabled={busy || published}
                style={
                  busy || published
                    ? disabled({ ...styles.button, marginTop: 14 })
                    : { ...styles.button, marginTop: 14 }
                }
              >
                {published ? 'Publicado ✓' : busy ? 'A publicar…' : 'Publicar sorteio'}
              </button>
              {published && (
                <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                  O sorteio já está visível na Home de todos os jogadores.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------- JOGOS ---------- */}
      {tab === 'jogos' && (
        <div>
          {matchesErr && (
            <div style={{ ...styles.panel, marginBottom: 12 }}>
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                ⚠️ Não consegui carregar as rodadas ({matchesErr}). Se ainda não aplicaste a
                migração <strong>0002_estatisticas.sql</strong> no Supabase, é isso que falta.
              </p>
            </div>
          )}

          {/* registar jogo */}
          <div style={{ ...styles.panel, marginBottom: 12, padding: 12 }}>
            <div
              style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 10 }}
            >
              Registar jogo
            </div>
            <label style={styles.label}>Data do jogo</label>
            <input
              style={{ ...styles.input, marginBottom: 12 }}
              type="date"
              value={jogoDate}
              onChange={(e) => setJogoDate(e.target.value)}
            />
            <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 4 }}>
              Marca quem jogou e regista os gols ⚽ e as assistências 🅰️ de cada um.
            </p>
            {players.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 0',
                  borderBottom: `1px solid ${colors.line}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={!!jogou[p.id]}
                  onChange={(e) => setJogou({ ...jogou, [p.id]: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: colors.grass }}
                />
                <Avatar name={p.name} photo={p.photo_url} size={28} />
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </span>
                {jogou[p.id] && (
                  <>
                    <Stepper
                      icon="⚽"
                      value={gols[p.id] || 0}
                      onChange={(v) => setGols({ ...gols, [p.id]: v })}
                    />
                    <Stepper
                      icon="🅰️"
                      value={assists[p.id] || 0}
                      onChange={(v) => setAssists({ ...assists, [p.id]: v })}
                    />
                  </>
                )}
              </div>
            ))}
            {players.length === 0 && <p style={styles.mutedText}>Sem jogadores aprovados.</p>}
            <button
              onClick={guardarJogo}
              disabled={busy || jogadoresDoJogo.length < 3}
              style={
                busy || jogadoresDoJogo.length < 3
                  ? disabled({ ...styles.button, marginTop: 14 })
                  : { ...styles.button, marginTop: 14 }
              }
            >
              {busy ? 'A guardar…' : `Guardar jogo (${jogadoresDoJogo.length} jogadores)`}
            </button>
            {jogoOk && (
              <p style={{ color: colors.grass, fontSize: 13, marginTop: 8 }}>
                Rodada registada ✓ — a votação de craque/bagre já está aberta para quem jogou.
              </p>
            )}
          </div>

          {/* rodadas registadas */}
          <div
            style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, margin: '18px 0 8px' }}
          >
            Rodadas registadas ({matches.length})
          </div>
          {matches.length === 0 && !matchesErr && (
            <div style={{ ...styles.panel, textAlign: 'center', padding: 18 }}>
              <p style={styles.mutedText}>Ainda não há rodadas registadas.</p>
            </div>
          )}
          {matches.map((m) => {
            const craque = awardWinners(m.craque)
            const bagre = awardWinners(m.bagre)
            const golsTot = m.players.reduce((s, p) => s + p.goals, 0)
            return (
              <div key={m.id} style={{ ...styles.panel, padding: 12, marginBottom: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14 }}>
                    {formatDia(m.played_at)}
                  </span>
                  <button
                    onClick={() => apagarJogo(m)}
                    disabled={busy}
                    style={{ ...linkStyle, color: colors.error }}
                  >
                    Apagar
                  </button>
                </div>
                <p style={{ fontSize: 13, color: colors.muted, marginTop: 6 }}>
                  {m.players.length} jogadores · {golsTot} {golsTot === 1 ? 'gol' : 'gols'} ·{' '}
                  {m.votes}/{m.players.length} votaram
                </p>
                {(craque || bagre) && (
                  <p style={{ fontSize: 13, marginTop: 4 }}>
                    {craque && <span style={{ color: colors.teamA }}>👑 {craque.names} </span>}
                    {bagre && <span style={{ color: colors.teamB }}>🐟 {bagre.names}</span>}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
