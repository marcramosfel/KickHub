import { useState } from 'react'
import { adminDeleteMatch, adminGetMatch, adminSaveGkStats, adminSaveMatch } from '../../api'
import { awardWinners, formatDia, hojeLocal, matchWinner } from '../../lib/format'
import { corDaEquipa } from '../../lib/substitutions'
import FiltroLista, { useFiltro } from './FiltroLista'
import GameDetail from './GameDetail'
import ResultadoForm from './ResultadoForm'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, disabled } from '../../theme'

// Rodadas antigas — o histórico administrativo.
//
// Era um formulário gigante sempre aberto no topo (o plantel inteiro, com
// contadores) e a lista das rodadas por baixo; "Editar" carregava a rodada
// para dentro desse formulário. Havia assim DOIS sítios para administrar um
// jogo, com dois formulários diferentes, e o de cá tinha divergido do do
// pós-jogo.
//
// Agora isto é só uma lista. Abrir uma rodada abre a MESMA página de jogo do
// separador "Jogos" (`GameDetail`), que já sabe lidar com uma rodada sem
// escalação. Registar uma rodada nova usa o mesmo `ResultadoForm` da página
// de jogo — o formulário existe uma vez só.

const ORDENS = [
  {
    id: 'recente',
    rotulo: 'Mais recentes',
    comparar: (a, b) => String(b.played_at).localeCompare(String(a.played_at)),
  },
  {
    id: 'antiga',
    rotulo: 'Mais antigas',
    comparar: (a, b) => String(a.played_at).localeCompare(String(b.played_at)),
  },
]

const CAMPOS = (m) => [m.played_at, m.notes, ...(m.players || []).map((x) => x.name)]

const FORM_VAZIO = {
  playedAt: '',
  teamAName: 'Amarelos',
  teamBName: 'Azuis',
  scoreA: 0,
  scoreB: 0,
  notes: '',
  stats: {},
  gk: {},
  jogou: {},
}

// ---------- registar uma rodada que nunca foi agendada ----------
function NovaRodada({ pw, jogadores, busy, onErro, onBusy, onCriada, onCancelar }) {
  const [form, setForm] = useState(() => ({ ...FORM_VAZIO, playedAt: hojeLocal() }))

  const setStat = (id, campo, valor) =>
    setForm((f) => ({
      ...f,
      stats: {
        ...f.stats,
        [id]: { team: null, goals: 0, assists: 0, own: 0, ...f.stats[id], [campo]: valor },
      },
    }))

  const setGk = (id, campo, valor) =>
    setForm((f) => {
      const gk = { ...f.gk }
      if (campo === 'alternar') {
        if (gk[id]) delete gk[id]
        else gk[id] = { saves: 0, conceded: 0 }
      } else {
        gk[id] = { ...(gk[id] || { saves: 0, conceded: 0 }), [campo]: valor }
      }
      return { ...f, gk }
    })

  const setJogou = (id, marcado) =>
    setForm((f) => {
      const jogou = { ...f.jogou, [id]: marcado }
      const stats = { ...f.stats }
      const gk = { ...f.gk }
      if (marcado) {
        if (!stats[id]) stats[id] = { team: null, goals: 0, assists: 0, own: 0 }
      } else {
        delete stats[id]
        delete gk[id]
      }
      return { ...f, jogou, stats, gk }
    })

  const marcados = Object.keys(form.jogou).filter((id) => form.jogou[id])

  const guardar = async () => {
    onErro('')
    if (!form.playedAt) return onErro('A data do jogo é obrigatória.')
    if (marcados.length < 3) return onErro('Marca pelo menos 3 jogadores que jogaram.')
    onBusy(true)
    try {
      const id = await adminSaveMatch(pw, null, {
        playedAt: form.playedAt,
        teamAName: form.teamAName,
        teamBName: form.teamBName,
        scoreA: Number(form.scoreA) || 0,
        scoreB: Number(form.scoreB) || 0,
        notes: form.notes,
        stats: marcados.map((player_id) => ({
          player_id,
          team: form.stats[player_id]?.team || null,
          goals: form.stats[player_id]?.goals || 0,
          assists: form.stats[player_id]?.assists || 0,
          own_goals: form.stats[player_id]?.own || 0,
        })),
      })
      const linhasGk = Object.entries(form.gk)
        .filter(([pid]) => form.jogou[pid])
        .map(([goalkeeper_id, g]) => ({
          goalkeeper_id,
          team: form.stats[goalkeeper_id]?.team || null,
          saves: g.saves || 0,
          goals_conceded: g.conceded || 0,
        }))
      // Não-fatal: sem a migração das estatísticas de baliza a rodada fica
      // gravada na mesma, só sem defesas.
      try {
        await adminSaveGkStats(pw, id, linhasGk)
      } catch (gkErr) {
        onErro(`Rodada guardada, mas as estatísticas de goleiro não (${gkErr.message}).`)
      }
      await onCriada(id)
    } catch (err) {
      onErro(err.message)
    } finally {
      onBusy(false)
    }
  }

  return (
    <div className="pb-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
          Registar rodada antiga
        </span>
        <button type="button" onClick={onCancelar} style={styles.link}>
          cancelar
        </button>
      </div>

      <div className="pb-split" style={{ '--pb-split-min': '260px', marginBottom: 12 }}>
        <div>
          <label style={styles.label} htmlFor="nova-data">
            Data do jogo
          </label>
          <input
            id="nova-data"
            type="date"
            style={styles.input}
            value={form.playedAt}
            onChange={(e) => setForm((f) => ({ ...f, playedAt: e.target.value }))}
          />
        </div>
        <div className="pb-split" style={{ '--pb-split-min': '120px', columnGap: 8 }}>
          <div>
            <label style={{ ...styles.label, color: corDaEquipa('A') }} htmlFor="nova-a">
              Nome do time A
            </label>
            <input
              id="nova-a"
              style={styles.input}
              value={form.teamAName}
              onChange={(e) => setForm((f) => ({ ...f, teamAName: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ ...styles.label, color: corDaEquipa('B') }} htmlFor="nova-b">
              Nome do time B
            </label>
            <input
              id="nova-b"
              style={styles.input}
              value={form.teamBName}
              onChange={(e) => setForm((f) => ({ ...f, teamBName: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 14 }}>
        {[
          { lado: 'A', campo: 'scoreA' },
          { lado: 'B', campo: 'scoreB' },
        ].map(({ lado, campo }) => (
          <div key={lado} style={{ flex: 1 }}>
            <label style={styles.label} htmlFor={`nova-placar-${lado}`}>
              Gols do time {lado}
            </label>
            <input
              id={`nova-placar-${lado}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              style={{
                ...styles.input,
                textAlign: 'center',
                fontFamily: fonts.title,
                fontSize: 24,
                color: corDaEquipa(lado),
              }}
              value={form[campo]}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  [campo]: Math.max(0, Math.min(99, Number(e.target.value) || 0)),
                }))
              }
            />
          </div>
        ))}
      </div>

      {/* o mesmo formulário da página de jogo */}
      <ResultadoForm
        jogo={null}
        escalacao={[]}
        plantel={jogadores}
        form={form}
        onStat={setStat}
        onGk={setGk}
        onJogou={setJogou}
      />

      <div style={{ marginTop: 14 }}>
        <label style={styles.label} htmlFor="nova-notas">
          📝 Observações (opcional)
        </label>
        <textarea
          id="nova-notas"
          rows={3}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Algo memorável da partida…"
          style={{ ...styles.input, resize: 'vertical', minHeight: 64 }}
        />
      </div>

      <button
        type="button"
        onClick={guardar}
        disabled={busy || marcados.length < 3}
        style={
          busy || marcados.length < 3
            ? disabled({ ...styles.button, marginTop: 16 })
            : { ...styles.button, marginTop: 16 }
        }
      >
        {busy ? 'A guardar…' : `Guardar rodada (${marcados.length} jogadores)`}
      </button>
    </div>
  )
}

export default function RodadasPanel({
  pw,
  jogadores = [],
  matches = [],
  matchesErr,
  busy,
  onErro,
  onBusy,
  onGuardado,
  onIrParaJogos,
}) {
  // O jogo aberto vem do servidor completo (`admin_get_match`): a lista só
  // tem o resumo, e a página de detalhe precisa das linhas todas.
  const [aberto, setAberto] = useState(null)
  const [criando, setCriando] = useState(false)
  const filtro = useFiltro({ lista: matches, campos: CAMPOS, ordens: ORDENS })

  const abrir = async (id) => {
    onErro('')
    onBusy(true)
    try {
      setAberto(await adminGetMatch(pw, id))
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      onErro(err.message)
    } finally {
      onBusy(false)
    }
  }

  const recarregarAberto = async (novo) => {
    if (novo?.id) setAberto(novo)
    else if (aberto?.id) {
      try {
        setAberto(await adminGetMatch(pw, aberto.id))
      } catch {
        /* o refresh geral em baixo já mostra o estado novo */
      }
    }
    await onGuardado()
  }

  const apagarRodada = async (m) => {
    if (
      !window.confirm(
        `Apagar a rodada de ${formatDia(m.played_at)}? Leva os gols, os autogolos e os votos junto.`
      )
    )
      return
    onErro('')
    onBusy(true)
    try {
      await adminDeleteMatch(pw, m.id)
      setAberto(null)
      await onGuardado()
    } catch (err) {
      onErro(err.message)
    } finally {
      onBusy(false)
    }
  }

  // ---------- uma rodada aberta: a MESMA página do separador "Jogos" ----------
  if (aberto) {
    return (
      <GameDetail
        pw={pw}
        jogo={aberto}
        jogadores={jogadores}
        matches={matches}
        onVoltar={() => setAberto(null)}
        onAtualizado={recarregarAberto}
        onApagado={() => {
          setAberto(null)
          onGuardado()
        }}
      />
    )
  }

  if (criando) {
    return (
      <NovaRodada
        pw={pw}
        jogadores={jogadores}
        busy={busy}
        onErro={onErro}
        onBusy={onBusy}
        onCancelar={() => setCriando(false)}
        onCriada={async (id) => {
          setCriando(false)
          await onGuardado()
          await abrir(id)
        }}
      />
    )
  }

  // ---------- a lista ----------
  return (
    <div className="pb-stack">
      <div style={{ ...styles.panel, borderColor: colors.teamB }}>
        <p style={{ fontSize: 13 }}>
          ℹ️ O histórico completo. Abre uma rodada para ver e corrigir tudo o que ela tem —
          jogadores, gols, autogolos, defesas, avaliações e votação — na mesma página que o
          separador{' '}
          <button
            type="button"
            onClick={onIrParaJogos}
            style={{
              display: 'inline',
              background: 'none',
              border: 'none',
              color: colors.grass,
              textDecoration: 'underline',
              font: 'inherit',
              padding: '8px 3px',
            }}
          >
            Jogos
          </button>{' '}
          usa para os jogos abertos.
        </p>
      </div>

      {matchesErr && (
        <ErrorBox>
          Não consegui carregar as rodadas ({matchesErr}). Se ainda não correste o{' '}
          <strong>supabase/migrations/esquema.sql</strong> no SQL Editor do Supabase, é isso que
          falta.
        </ErrorBox>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
          Rodadas antigas
        </span>
        <button
          type="button"
          onClick={() => setCriando(true)}
          style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px', flexShrink: 0 }}
        >
          + Registar rodada
        </button>
      </div>

      {matches.length > 0 && (
        <FiltroLista
          id="procura-rodadas"
          termo={filtro.termo}
          onTermo={filtro.setTermo}
          ordens={ORDENS}
          ordemId={filtro.ordemId}
          onOrdem={filtro.setOrdemId}
          total={matches.length}
          visiveis={filtro.resultado.length}
          rotuloSingular="rodada"
          rotuloPlural="rodadas"
          placeholder="Procurar por data, jogador ou nota"
        />
      )}

      {matches.length === 0 && !matchesErr && (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 18 }}>
          <p style={styles.mutedText}>Ainda não há rodadas registadas.</p>
        </div>
      )}
      {matches.length > 0 && filtro.resultado.length === 0 && (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 18 }}>
          <p style={styles.mutedText}>Nenhuma rodada corresponde a “{filtro.termo}”.</p>
        </div>
      )}

      <div className="pb-stack-sm pb-stagger">
        {filtro.resultado.map((m) => {
          const craque = awardWinners(m.craque)
          const bagre = awardWinners(m.bagre)
          const golsTot = (m.players || []).reduce((s, p) => s + (p.goals || 0), 0)
          const autogolos = (m.players || []).reduce((s, p) => s + (p.own_goals || 0), 0)
          const w = matchWinner(m)
          return (
            <div key={m.id} className="pb-card" style={{ padding: 12 }}>
              {/* A linha que o admin lê primeiro: data e placar, com os nomes
                  das equipas desta rodada (podem não ser Pretos e Brancos). */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14 }}>
                  {formatDia(m.played_at)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  <span style={{ color: colors.teamA }}>
                    {m.team_a_name || 'Time A'} {Number(m.score_a || 0)}
                  </span>
                  <span style={{ color: colors.muted }}> × </span>
                  <span style={{ color: colors.teamB }}>
                    {Number(m.score_b || 0)} {m.team_b_name || 'Time B'}
                  </span>
                </span>
                {!w.isDraw && (
                  <span style={{ fontSize: 13, color: colors.grass }}>🏆 {w.name}</span>
                )}
                {w.isDraw && <span style={{ fontSize: 13, color: colors.muted }}>🤝 Empate</span>}
              </div>

              <p style={{ fontSize: 13, color: colors.muted, marginTop: 6 }}>
                {(m.players || []).length} jogadores · {golsTot} {golsTot === 1 ? 'gol' : 'gols'}
                {autogolos > 0 ? ` · ${autogolos} AG` : ''} · {m.votes}/{(m.players || []).length}{' '}
                votaram
                {m.has_winner_photo ? ' · 🏆📸' : ''}
                {m.has_location_photo ? ' · 📍📸' : ''}
              </p>

              {(craque || bagre) && (
                <p style={{ fontSize: 13, marginTop: 4 }}>
                  {craque && <span style={{ color: colors.teamA }}>👑 {craque.names} </span>}
                  {bagre && <span style={{ color: colors.teamB }}>🐟 {bagre.names}</span>}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {/* "Ver detalhes" e "Editar" abrem a mesma página: ver e
                    corrigir é o mesmo ecrã, e fingir que são dois era o que
                    tornava isto confuso. */}
                <button
                  type="button"
                  onClick={() => abrir(m.id)}
                  disabled={busy}
                  style={{ ...styles.buttonGhost, width: 'auto', padding: '8px 14px' }}
                >
                  Ver detalhes
                </button>
                <button
                  type="button"
                  onClick={() => abrir(m.id)}
                  disabled={busy}
                  style={{
                    ...styles.buttonGhost,
                    width: 'auto',
                    padding: '8px 14px',
                    color: colors.teamA,
                    borderColor: colors.teamA,
                  }}
                >
                  ✏️ Editar
                </button>
                <button
                  type="button"
                  onClick={() => apagarRodada(m)}
                  disabled={busy}
                  style={{ ...styles.link, color: colors.error, marginLeft: 'auto' }}
                >
                  Apagar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
