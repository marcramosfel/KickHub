import { useEffect, useState } from 'react'
import {
  adminAddMatch,
  adminDeleteMatch,
  adminPending,
  adminApprove,
  adminReject,
  adminExport,
  adminPendingVotes,
  adminResetRatings,
  adminResetRatingsFor,
  adminSaveMatch,
  adminUsers,
  adminRegenUserId,
  adminSetPin,
  adminSetUserId,
  getMatch,
  getMatches,
  getPlayers,
  getPublishedDraw,
  getStats,
  publishDraw,
} from '../api'
import { drawTeams } from '../lib/draw'
import { fileToDataURL } from '../lib/image'
import { awardWinners, formatDia, hojeLocal, matchWinner } from '../lib/format'
import { ADMIN_NAME, APP_NAME } from '../config'
import Avatar from './Avatar'
import DrawView from './DrawView'
import { PhotoFrame } from './RoundParts'
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
  const [team, setTeam] = useState({}) // { [id]: 'A' | 'B' }
  const [gols, setGols] = useState({}) // { [id]: int }
  const [assists, setAssists] = useState({}) // { [id]: int }
  const [teamAName, setTeamAName] = useState('Amarelos')
  const [teamBName, setTeamBName] = useState('Azuis')
  const [scoreA, setScoreA] = useState(0)
  const [scoreB, setScoreB] = useState(0)
  const [winnerPhoto, setWinnerPhoto] = useState('')
  const [locationPhoto, setLocationPhoto] = useState('')
  const [notes, setNotes] = useState('')
  const [editingId, setEditingId] = useState(null) // null = criar; senão editar
  const [jogoOk, setJogoOk] = useState(false)

  // quem falta votar
  const [faltas, setFaltas] = useState(null)
  const [faltasErr, setFaltasErr] = useState('')
  const [copiedFalta, setCopiedFalta] = useState('')

  // utilizadores / IDs
  const [users, setUsers] = useState([])
  const [usersErr, setUsersErr] = useState('')
  const [copiedId, setCopiedId] = useState(null) // user_id copiado (feedback)
  const [copiedList, setCopiedList] = useState(false)
  const [novoPin, setNovoPin] = useState(null) // { id, name, userId, pin } acabado de definir
  const [copiedAcesso, setCopiedAcesso] = useState(false)

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
    // utilizadores/IDs (não-fatal: sem a migração 0008 esta aba mostra o aviso)
    adminUsers(senha)
      .then((u) => {
        setUsers(u || [])
        setUsersErr('')
      })
      .catch((err) => setUsersErr(err.message))
    // quem falta votar (não-fatal: sem a migração 0011 esta aba mostra o aviso)
    adminPendingVotes(senha)
      .then((f) => {
        setFaltas(f)
        setFaltasErr('')
      })
      .catch((err) => setFaltasErr(err.message))
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

  // ---------- utilizadores / IDs ----------
  const copiarTexto = async (texto, onOk) => {
    try {
      await navigator.clipboard.writeText(texto)
      onOk?.()
    } catch {
      window.prompt('Copia manualmente:', texto)
    }
  }
  const copiarId = (u) =>
    copiarTexto(u.user_id, () => {
      setCopiedId(u.user_id)
      setTimeout(() => setCopiedId(null), 1600)
    })
  const copiarLista = () =>
    copiarTexto(users.map((u) => `${u.name} — ${u.user_id}`).join('\n'), () => {
      setCopiedList(true)
      setTimeout(() => setCopiedList(false), 1800)
    })
  // descarrega um snapshot dos dados em JSON (backup)
  const exportarDados = async (comFotos) => {
    setError('')
    setBusy(true)
    try {
      const dump = await adminExport(pw, comFotos)
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pelada-browns-backup-${hojeLocal()}${comFotos ? '-com-fotos' : ''}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // copia uma lista de "quem falta" pronta a colar no grupo
  const copiarFaltas = (lista, chave) =>
    copiarTexto(lista.map((u) => `${u.name} — ${u.user_id}`).join('\n'), () => {
      setCopiedFalta(chave)
      setTimeout(() => setCopiedFalta(''), 1800)
    })
  const regenerarId = (u) => {
    if (
      !window.confirm(
        `Regenerar o ID de ${u.name}? O ID atual (${u.user_id}) deixa de servir para o login.`
      )
    )
      return
    acao(() => adminRegenUserId(pw, u.id))
  }
  // define um PIN novo para quem se esqueceu do seu (o antigo não é preciso)
  const definirPin = (u) => {
    const sugestao = String(1000 + Math.floor(Math.random() * 9000))
    const novo = window.prompt(
      `Novo PIN de 4 dígitos para ${u.name} (sugestão gerada; podes escrever outro):`,
      sugestao
    )
    if (novo == null) return
    const limpo = novo.trim()
    if (!/^\d{4}$/.test(limpo)) {
      setError('O PIN tem de ter exatamente 4 dígitos.')
      return
    }
    if (!window.confirm(`Definir o PIN de ${u.name} como ${limpo}? O PIN antigo deixa de servir.`))
      return
    setNovoPin(null)
    acao(async () => {
      await adminSetPin(pw, u.id, limpo)
      setNovoPin({ id: u.id, name: u.name, userId: u.user_id, pin: limpo })
    })
  }
  // mensagem pronta a mandar à pessoa
  const copiarAcesso = () => {
    if (!novoPin) return
    copiarTexto(
      `Olá ${novoPin.name}! Acesso à ${APP_NAME.main} ${APP_NAME.accent}:\n` +
        `ID: ${novoPin.userId || novoPin.name}\nPIN: ${novoPin.pin}\n` +
        `Podes trocá-lo por um teu na tua página (🔑 Mudar PIN).`,
      () => {
        setCopiedAcesso(true)
        setTimeout(() => setCopiedAcesso(false), 1800)
      }
    )
  }

  const editarId = (u) => {
    const novo = window.prompt(
      `Novo ID para ${u.name} (letras e números; será normalizado):`,
      u.user_id
    )
    if (novo == null) return
    if (!window.confirm(`Mudar o ID de ${u.name} para "${novo}"? Passará a entrar com o novo ID.`))
      return
    acao(() => adminSetUserId(pw, u.id, novo))
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

  const limparFormJogo = () => {
    setEditingId(null)
    setJogoDate(hojeLocal())
    setTeam({})
    setGols({})
    setAssists({})
    setTeamAName('Amarelos')
    setTeamBName('Azuis')
    setScoreA(0)
    setScoreB(0)
    setWinnerPhoto('')
    setLocationPhoto('')
    setNotes('')
    // volta as presenças ao default (último sorteio / todos)
    setJogou(() => {
      const next = {}
      for (const p of players) next[p.id] = true
      return next
    })
  }

  const escolherFoto = (setter) => async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      setter(await fileToDataURL(file, 1280, 0.8)) // paisagem, um pouco maior
    } catch (err) {
      setError(err.message)
    }
  }

  const guardarJogo = async () => {
    setError('')
    setJogoOk(false)
    const stats = jogadoresDoJogo.map((p) => ({
      player_id: p.id,
      team: team[p.id] || null,
      goals: gols[p.id] || 0,
      assists: assists[p.id] || 0,
    }))
    if (!jogoDate) return setError('A data do jogo é obrigatória.')
    if (stats.length < 3) return setError('Marca pelo menos 3 jogadores que jogaram.')
    setBusy(true)
    try {
      await adminSaveMatch(pw, editingId, {
        playedAt: jogoDate,
        teamAName,
        teamBName,
        scoreA: Number(scoreA) || 0,
        scoreB: Number(scoreB) || 0,
        winnerPhoto,
        locationPhoto,
        notes,
        stats,
      })
      setJogoOk(true)
      limparFormJogo()
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const editarJogo = async (m) => {
    setError('')
    setJogoOk(false)
    setBusy(true)
    try {
      const full = await getMatch(m.id) // traz as fotos
      const jg = {}, tm = {}, gl = {}, as = {}
      for (const pl of full.players || []) {
        jg[pl.player_id] = true
        if (pl.team) tm[pl.player_id] = pl.team
        gl[pl.player_id] = pl.goals
        as[pl.player_id] = pl.assists
      }
      // jogadores não incluídos ficam desmarcados
      setJogou(() => {
        const next = {}
        for (const p of players) next[p.id] = !!jg[p.id]
        return next
      })
      setTeam(tm)
      setGols(gl)
      setAssists(as)
      setEditingId(m.id)
      setJogoDate(full.played_at)
      setTeamAName(full.team_a_name || 'Amarelos')
      setTeamBName(full.team_b_name || 'Azuis')
      setScoreA(Number(full.score_a || 0))
      setScoreB(Number(full.score_b || 0))
      setWinnerPhoto(full.winner_photo || '')
      setLocationPhoto(full.location_photo || '')
      setNotes(full.notes || '')
      setTab('jogos')
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const apagarJogo = (m) => {
    if (!window.confirm(`Apagar a rodada de ${formatDia(m.played_at)}? Leva os gols e os votos junto.`)) return
    if (editingId === m.id) limparFormJogo()
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

  // ---------- quem falta ----------
  const awardPend = faltas?.award_pending || []
  const ratingsPend = faltas?.ratings_pending || []
  const faltasTotal = awardPend.length + ratingsPend.length

  // ---------- tabs ----------
  const tabBtn = (id, label, badge) => (
    <button
      onClick={() => {
        setTab(id)
        setError('')
      }}
      style={{
        flex: '1 0 auto',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        padding: '10px 12px',
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

      <div
        style={{
          display: 'flex',
          marginBottom: 16,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tabBtn('pedidos', 'Pedidos', pending.length)}
        {tabBtn('plantel', 'Plantel', 0)}
        {tabBtn('sorteio', 'Sorteio', 0)}
        {tabBtn('jogos', 'Jogos', 0)}
        {tabBtn('faltas', 'Faltas', faltasTotal)}
        {tabBtn('utilizadores', 'IDs', 0)}
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

          {/* registar / editar jogo */}
          <div style={{ ...styles.panel, marginBottom: 12, padding: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
                {editingId ? '✎ Editar rodada' : 'Registar jogo'}
              </span>
              {editingId && (
                <button onClick={limparFormJogo} style={linkStyle}>
                  cancelar edição
                </button>
              )}
            </div>

            <label style={styles.label}>Data do jogo</label>
            <input
              style={{ ...styles.input, marginBottom: 12 }}
              type="date"
              value={jogoDate}
              onChange={(e) => setJogoDate(e.target.value)}
            />

            {/* nomes dos times + placar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end', marginBottom: 12 }}>
              <div>
                <label style={{ ...styles.label, color: colors.teamA }}>Time A</label>
                <input
                  style={styles.input}
                  value={teamAName}
                  onChange={(e) => setTeamAName(e.target.value)}
                  placeholder="Amarelos"
                />
                <input
                  style={{ ...styles.input, marginTop: 6, textAlign: 'center', fontSize: 22, fontWeight: 700, color: colors.teamA }}
                  type="number"
                  min="0"
                  max="99"
                  inputMode="numeric"
                  value={scoreA}
                  onChange={(e) => setScoreA(e.target.value)}
                  aria-label="Gols do time A"
                />
              </div>
              <span style={{ fontFamily: fonts.title, fontSize: 22, color: colors.muted, paddingBottom: 10 }}>
                —
              </span>
              <div>
                <label style={{ ...styles.label, color: colors.teamB }}>Time B</label>
                <input
                  style={styles.input}
                  value={teamBName}
                  onChange={(e) => setTeamBName(e.target.value)}
                  placeholder="Azuis"
                />
                <input
                  style={{ ...styles.input, marginTop: 6, textAlign: 'center', fontSize: 22, fontWeight: 700, color: colors.teamB }}
                  type="number"
                  min="0"
                  max="99"
                  inputMode="numeric"
                  value={scoreB}
                  onChange={(e) => setScoreB(e.target.value)}
                  aria-label="Gols do time B"
                />
              </div>
            </div>

            <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 4 }}>
              Marca quem jogou, o time (A/B) e os gols ⚽ e assistências 🅰️ de cada um.
            </p>
            {players.map((p) => (
              <div
                key={p.id}
                style={{ padding: '8px 0', borderBottom: `1px solid ${colors.line}` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                  {jogou[p.id] &&
                    ['A', 'B'].map((t) => {
                      const on = team[p.id] === t
                      const cor = t === 'A' ? colors.teamA : colors.teamB
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTeam({ ...team, [p.id]: on ? undefined : t })}
                          aria-label={`Time ${t}`}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: `1px solid ${on ? cor : colors.line}`,
                            background: on ? cor : '#0C1915',
                            color: on ? '#06130D' : colors.muted,
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {t}
                        </button>
                      )
                    })}
                </div>
                {jogou[p.id] && (
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, paddingLeft: 34 }}>
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
                  </div>
                )}
              </div>
            ))}
            {players.length === 0 && <p style={styles.mutedText}>Sem jogadores aprovados.</p>}

            {/* fotos */}
            <div style={{ marginTop: 14 }}>
              <label style={{ ...styles.label, marginBottom: 6 }}>🏆 Foto do time vencedor</label>
              {winnerPhoto ? (
                <div>
                  <PhotoFrame src={winnerPhoto} alt="Time vencedor" />
                  <button onClick={() => setWinnerPhoto('')} style={{ ...linkStyle, color: colors.error, marginTop: 6 }}>
                    remover foto
                  </button>
                </div>
              ) : (
                <input type="file" accept="image/*" onChange={escolherFoto(setWinnerPhoto)} style={{ color: colors.muted, fontSize: 13 }} />
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={{ ...styles.label, marginBottom: 6 }}>📍 Foto do local</label>
              {locationPhoto ? (
                <div>
                  <PhotoFrame src={locationPhoto} alt="Local da pelada" />
                  <button onClick={() => setLocationPhoto('')} style={{ ...linkStyle, color: colors.error, marginTop: 6 }}>
                    remover foto
                  </button>
                </div>
              ) : (
                <input type="file" accept="image/*" onChange={escolherFoto(setLocationPhoto)} style={{ color: colors.muted, fontSize: 13 }} />
              )}
            </div>

            {/* observações */}
            <div style={{ marginTop: 14 }}>
              <label style={{ ...styles.label, marginBottom: 6 }}>📝 Observações (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Algo memorável da partida…"
                style={{ ...styles.input, resize: 'vertical', minHeight: 64 }}
              />
            </div>

            <button
              onClick={guardarJogo}
              disabled={busy || jogadoresDoJogo.length < 3}
              style={
                busy || jogadoresDoJogo.length < 3
                  ? disabled({ ...styles.button, marginTop: 16 })
                  : { ...styles.button, marginTop: 16 }
              }
            >
              {busy
                ? 'A guardar…'
                : editingId
                ? `Guardar alterações (${jogadoresDoJogo.length})`
                : `Guardar jogo (${jogadoresDoJogo.length} jogadores)`}
            </button>
            {jogoOk && (
              <p style={{ color: colors.grass, fontSize: 13, marginTop: 8 }}>
                Rodada guardada ✓ — aparece em "Campeões da semana" e no histórico.
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
            const w = matchWinner(m)
            const temPlacar = Number(m.score_a || 0) + Number(m.score_b || 0) > 0
            return (
              <div key={m.id} style={{ ...styles.panel, padding: 12, marginBottom: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14 }}>
                    {formatDia(m.played_at)}
                  </span>
                  <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                    <button onClick={() => editarJogo(m)} disabled={busy} style={{ ...linkStyle, color: colors.teamA }}>
                      Editar
                    </button>
                    <button
                      onClick={() => apagarJogo(m)}
                      disabled={busy}
                      style={{ ...linkStyle, color: colors.error }}
                    >
                      Apagar
                    </button>
                  </div>
                </div>
                {temPlacar && (
                  <p style={{ fontSize: 14, marginTop: 6, fontWeight: 700 }}>
                    <span style={{ color: colors.teamA }}>{Number(m.score_a || 0)}</span>
                    <span style={{ color: colors.muted }}> — </span>
                    <span style={{ color: colors.teamB }}>{Number(m.score_b || 0)}</span>
                    <span style={{ color: w.isDraw ? colors.muted : colors.grass, fontWeight: 600, fontSize: 13 }}>
                      {'  '}
                      {w.isDraw ? '🤝 Empate' : `🏆 ${w.name}`}
                    </span>
                  </p>
                )}
                <p style={{ fontSize: 13, color: colors.muted, marginTop: 6 }}>
                  {m.players.length} jogadores · {golsTot} {golsTot === 1 ? 'gol' : 'gols'} ·{' '}
                  {m.votes}/{m.players.length} votaram
                  {m.has_winner_photo ? ' · 🏆📸' : ''}
                  {m.has_location_photo ? ' · 📍📸' : ''}
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

      {/* ---------- QUEM FALTA VOTAR ---------- */}
      {tab === 'faltas' && (
        <div>
          {faltasErr && (
            <div style={{ ...styles.panel, marginBottom: 12 }}>
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                ⚠️ Não consegui carregar ({faltasErr}). Se ainda não aplicaste a migração{' '}
                <strong>0011_quem_falta.sql</strong> no Supabase, é isso que falta.
              </p>
            </div>
          )}

          {!faltasErr && faltas && (
            <>
              {/* 1) craque/bagre da última rodada */}
              <div style={{ ...styles.panel, marginBottom: 12, padding: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
                    🗳️ Falta votar (craque/bagre)
                  </span>
                  {faltas.match && (
                    <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>
                      {faltas.match.voted}/{faltas.match.total} votaram
                    </span>
                  )}
                </div>

                {!faltas.match ? (
                  <p style={{ ...styles.mutedText, fontSize: 13 }}>
                    Ainda não há rodadas registadas.
                  </p>
                ) : awardPend.length === 0 ? (
                  <p style={{ color: colors.grass, fontSize: 14 }}>
                    🎉 Toda a gente que jogou já votou!
                  </p>
                ) : (
                  <>
                    <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                      Rodada de {formatDia(faltas.match.played_at)} — falta o voto de{' '}
                      {awardPend.length}:
                    </p>
                    {awardPend.map((u) => (
                      <div
                        key={u.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 0',
                        }}
                      >
                        <Avatar
                          name={u.name}
                          photo={players.find((p) => p.id === u.id)?.photo_url}
                          size={30}
                        />
                        <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{u.name}</span>
                        <code
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: 12,
                            color: colors.muted,
                          }}
                        >
                          {u.user_id}
                        </code>
                      </div>
                    ))}
                    <button
                      onClick={() => copiarFaltas(awardPend, 'award')}
                      style={{
                        ...styles.buttonGhost,
                        marginTop: 10,
                        fontSize: 13,
                        color: copiedFalta === 'award' ? colors.grass : colors.text,
                        borderColor: copiedFalta === 'award' ? colors.grass : colors.line,
                      }}
                    >
                      {copiedFalta === 'award' ? 'Lista copiada ✓' : '📋 Copiar lista para o grupo'}
                    </button>
                  </>
                )}
              </div>

              {/* 2) avaliações (notas) por dar */}
              <div style={{ ...styles.panel, padding: 12 }}>
                <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 8 }}>
                  ⭐ Falta dar notas
                </div>
                {ratingsPend.length === 0 ? (
                  <p style={{ color: colors.grass, fontSize: 14 }}>
                    🎉 Toda a gente já avaliou todo o grupo!
                  </p>
                ) : (
                  <>
                    <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                      {ratingsPend.length}{' '}
                      {ratingsPend.length === 1 ? 'jogador tem' : 'jogadores têm'} notas por dar:
                    </p>
                    {ratingsPend.map((u) => (
                      <div
                        key={u.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}
                      >
                        <Avatar
                          name={u.name}
                          photo={players.find((p) => p.id === u.id)?.photo_url}
                          size={30}
                        />
                        <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{u.name}</span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: colors.teamA,
                            flexShrink: 0,
                          }}
                        >
                          faltam {u.faltam}
                        </span>
                      </div>
                    ))}
                    <button
                      onClick={() => copiarFaltas(ratingsPend, 'ratings')}
                      style={{
                        ...styles.buttonGhost,
                        marginTop: 10,
                        fontSize: 13,
                        color: copiedFalta === 'ratings' ? colors.grass : colors.text,
                        borderColor: copiedFalta === 'ratings' ? colors.grass : colors.line,
                      }}
                    >
                      {copiedFalta === 'ratings'
                        ? 'Lista copiada ✓'
                        : '📋 Copiar lista para o grupo'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------- UTILIZADORES / IDs ---------- */}
      {tab === 'utilizadores' && (
        <div>
          {usersErr && (
            <div style={{ ...styles.panel, marginBottom: 12 }}>
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                ⚠️ Não consegui carregar os utilizadores ({usersErr}). Se ainda não aplicaste a
                migração <strong>0008_user_ids.sql</strong> no Supabase, é isso que falta.
              </p>
            </div>
          )}

          {!usersErr && (
            <>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                  gap: 10,
                }}
              >
                <span style={{ ...styles.mutedText, fontSize: 13 }}>
                  {users.length} {users.length === 1 ? 'utilizador' : 'utilizadores'}
                </span>
                <button
                  onClick={copiarLista}
                  disabled={!users.length}
                  style={{
                    ...styles.buttonGhost,
                    width: 'auto',
                    padding: '9px 14px',
                    fontSize: 13,
                    color: copiedList ? colors.grass : colors.text,
                    borderColor: copiedList ? colors.grass : colors.line,
                  }}
                >
                  {copiedList ? 'Lista copiada ✓' : '📋 Copiar lista (nome — ID)'}
                </button>
              </div>

              {users.length === 0 && (
                <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
                  <p style={styles.mutedText}>Ainda não há utilizadores.</p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {users.map((u) => (
                  <div key={u.id} style={{ ...styles.panel, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{u.name}</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: u.approved
                                ? 'rgba(52,208,88,0.12)'
                                : 'rgba(255,197,49,0.12)',
                              color: u.approved ? colors.grass : colors.teamA,
                            }}
                          >
                            {u.approved ? 'aprovado' : 'pendente'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                          registado a {formatDia(u.created_at)}
                        </div>
                      </div>
                    </div>

                    {/* ID + copiar */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 10,
                        background: '#0C1915',
                        border: `1px solid ${colors.line}`,
                        borderRadius: 10,
                        padding: '7px 10px',
                      }}
                    >
                      <code
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 14,
                          fontWeight: 700,
                          color: colors.grass,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {u.user_id}
                      </code>
                      <button
                        onClick={() => copiarId(u)}
                        aria-label={`Copiar ID de ${u.name}`}
                        style={{
                          ...linkStyle,
                          color: copiedId === u.user_id ? colors.grass : colors.text,
                          flexShrink: 0,
                        }}
                      >
                        {copiedId === u.user_id ? 'Copiado ✓' : 'Copiar'}
                      </button>
                    </div>

                    {/* ações */}
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => editarId(u)}
                        disabled={busy}
                        style={{ ...linkStyle, color: colors.teamA }}
                      >
                        ✎ Editar ID
                      </button>
                      <button
                        onClick={() => regenerarId(u)}
                        disabled={busy}
                        style={linkStyle}
                      >
                        ↻ Regenerar
                      </button>
                      <button
                        onClick={() => definirPin(u)}
                        disabled={busy}
                        style={{ ...linkStyle, color: colors.grass }}
                      >
                        🔑 Definir novo PIN
                      </button>
                    </div>

                    {/* PIN acabado de definir para este jogador */}
                    {novoPin?.id === u.id && (
                      <div
                        style={{
                          marginTop: 10,
                          border: `1px solid ${colors.grass}`,
                          borderRadius: 10,
                          padding: 10,
                          background: 'rgba(52,208,88,0.07)',
                        }}
                      >
                        <div style={{ fontSize: 13, marginBottom: 6 }}>
                          PIN novo de {novoPin.name}:{' '}
                          <strong
                            style={{
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              fontSize: 18,
                              color: colors.grass,
                              letterSpacing: 2,
                            }}
                          >
                            {novoPin.pin}
                          </strong>
                        </div>
                        <p style={{ ...styles.mutedText, fontSize: 11, marginBottom: 8 }}>
                          Passa-lho em privado — depois de saíres desta página não o consegues ver
                          outra vez (fica só o hash na base de dados).
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            onClick={copiarAcesso}
                            style={{
                              ...styles.buttonGhost,
                              width: 'auto',
                              padding: '8px 12px',
                              fontSize: 13,
                              color: copiedAcesso ? colors.grass : colors.text,
                              borderColor: copiedAcesso ? colors.grass : colors.line,
                            }}
                          >
                            {copiedAcesso ? 'Mensagem copiada ✓' : '📋 Copiar mensagem'}
                          </button>
                          <button
                            onClick={() => setNovoPin(null)}
                            style={{
                              ...styles.buttonGhost,
                              width: 'auto',
                              padding: '8px 12px',
                              fontSize: 13,
                            }}
                          >
                            Esconder
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 12 }}>
                O ID serve para o jogador entrar (além do nome). Editar/regenerar muda como ele
                faz login — usa só quando preciso. "Definir novo PIN" é para quem se esqueceu do
                seu: defines um, passas-lho, e ele troca-o depois na página dele.
              </p>
            </>
          )}

          {/* backup / exportação */}
          <div style={{ ...styles.panel, padding: 12, marginTop: 18 }}>
            <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 6 }}>
              💾 Backup dos dados
            </div>
            <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
              Descarrega um ficheiro JSON com jogadores, avaliações, rodadas e votos. Guarda-o de
              vez em quando — é a tua rede de segurança.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => exportarDados(false)}
                disabled={busy}
                style={{ ...styles.buttonGhost, fontSize: 13 }}
              >
                ⬇️ Exportar (leve)
              </button>
              <button
                onClick={() => exportarDados(true)}
                disabled={busy}
                style={{ ...styles.buttonGhost, fontSize: 13 }}
              >
                🖼️ Com fotos
              </button>
            </div>
            <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 8 }}>
              O "leve" não inclui fotos (ficheiro pequeno). Por segurança, os PINs nunca são
              exportados.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
