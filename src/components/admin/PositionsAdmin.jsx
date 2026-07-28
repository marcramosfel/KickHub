import { useEffect, useMemo, useState } from 'react'
import {
  adminApprovePositions,
  adminPositionHistory,
  adminPositionsOverview,
  adminSetPositions,
} from '../../api'
import {
  ETIQUETA_STATUS,
  nomeDaPosicao,
  nomeDoTipo,
  PLAYER_TYPE,
  POSITIONS,
  POSITION_STATUS,
} from '../../lib/positions'
import Avatar from '../Avatar'
import PositionPicker from '../PositionPicker'
import { ErrorBox, SkeletonCard } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// Área "Posições dos jogadores".
//
// O jogador escolhe uma vez; a partir daí é aqui que se corrige. O admin vê o
// que a pessoa escolheu, ajusta com um motivo, e a alteração fica no histórico
// de auditoria. Nada disto toca em jogos já publicados.

const TOM = {
  aviso: { cor: colors.teamA, fundo: 'rgba(255,197,49,0.12)' },
  ok: { cor: colors.grass, fundo: 'rgba(52,208,88,0.12)' },
  info: { cor: colors.teamB, fundo: 'rgba(53,167,255,0.12)' },
  neutro: { cor: colors.muted, fundo: 'rgba(127,160,144,0.12)' },
}

function EtiquetaEstado({ status }) {
  const e = ETIQUETA_STATUS[status] || ETIQUETA_STATUS.NOT_SELECTED
  const t = TOM[e.tom] || TOM.neutro
  return (
    <span style={chip(t.cor, t.fundo)}>
      <span aria-hidden>{e.icone}</span>
      {e.texto}
    </span>
  )
}

function formatarQuando(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

// Formulário de alteração de um jogador.
function EditorDePosicao({ jogador, onGuardar, onCancelar, busy }) {
  const [tipo, setTipo] = useState(jogador.player_type || PLAYER_TYPE.FIELD)
  const [principal, setPrincipal] = useState(jogador.primary_position || null)
  const [secundaria, setSecundaria] = useState(jogador.secondary_position || null)
  const [aceita, setAceita] = useState(jogador.accepts_other_positions !== false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')

  const escolher = (id) => {
    setErro('')
    if (id === principal) return setPrincipal(null)
    if (id === secundaria) return setSecundaria(null)
    if (!principal) return setPrincipal(id)
    setSecundaria(id)
  }

  const mudouAlgo =
    tipo !== (jogador.player_type || PLAYER_TYPE.FIELD) ||
    principal !== (jogador.primary_position || null) ||
    secundaria !== (jogador.secondary_position || null) ||
    aceita !== (jogador.accepts_other_positions !== false)

  const submeter = () => {
    if (!principal) return setErro('Escolhe a posição principal.')
    if (principal === secundaria) return setErro('A secundária tem de ser diferente da principal.')
    onGuardar({ playerType: tipo, primary: principal, secondary: secundaria, acceptsOther: aceita, reason: motivo })
  }

  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${colors.line}`, paddingTop: 12 }}>
      {/* antes → depois, para o admin ver o que está a mudar */}
      <div className="pb-cards" style={{ gap: 10, marginBottom: 12 }}>
        <Comparacao
          titulo="Atual"
          tipo={jogador.player_type}
          principal={jogador.primary_position}
          secundaria={jogador.secondary_position}
          cor={colors.muted}
        />
        <Comparacao
          titulo="Nova"
          tipo={tipo}
          principal={principal}
          secundaria={secundaria}
          cor={mudouAlgo ? colors.grass : colors.muted}
        />
      </div>

      <div style={{ ...styles.label, marginBottom: 6 }}>Tipo de jogador</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[PLAYER_TYPE.FIELD, PLAYER_TYPE.GOALKEEPER].map((t) => {
          const on = tipo === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              aria-pressed={on}
              style={{
                flex: '1 1 140px',
                padding: '11px 12px',
                borderRadius: 10,
                minHeight: 44,
                border: `1px solid ${on ? colors.grass : colors.line}`,
                background: on ? 'rgba(52,208,88,0.12)' : '#0C1915',
                color: on ? colors.grass : colors.text,
                fontWeight: on ? 700 : 500,
                fontSize: 14,
              }}
            >
              {t === PLAYER_TYPE.GOALKEEPER ? '🧤 ' : '⚽ '}
              {nomeDoTipo(t)}
            </button>
          )
        })}
      </div>

      <PositionPicker principal={principal} secundaria={secundaria} onPick={escolher} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {POSITIONS.map((p) => {
          const on = p.id === principal || p.id === secundaria
          const cor = p.id === principal ? colors.grass : colors.teamA
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => escolher(p.id)}
              aria-pressed={on}
              style={{
                padding: '7px 11px',
                borderRadius: 999,
                minHeight: 36,
                border: `1px solid ${on ? cor : colors.line}`,
                background: on ? 'rgba(255,255,255,0.06)' : '#0C1915',
                color: on ? cor : colors.muted,
                fontSize: 13,
                fontWeight: on ? 700 : 400,
              }}
            >
              {p.short}
            </button>
          )
        })}
      </div>

      <label
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 14 }}
      >
        <input
          type="checkbox"
          checked={aceita}
          onChange={(e) => setAceita(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: colors.grass }}
        />
        Aceita jogar noutras posições
      </label>

      <div style={{ marginTop: 14 }}>
        <label style={styles.label} htmlFor={`motivo-${jogador.id}`}>
          Motivo da alteração (opcional)
        </label>
        <input
          id={`motivo-${jogador.id}`}
          style={styles.input}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Posição ajustada com base nos jogos realizados."
        />
      </div>

      {erro && <ErrorBox style={{ marginTop: 12 }}>{erro}</ErrorBox>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={submeter}
          disabled={busy || !mudouAlgo}
          style={
            busy || !mudouAlgo
              ? disabled({ ...styles.button, flex: '1 1 160px', width: 'auto' })
              : { ...styles.button, flex: '1 1 160px', width: 'auto' }
          }
        >
          {busy ? 'A guardar…' : 'Guardar alteração'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={busy}
          style={{ ...styles.buttonGhost, flex: '1 1 120px', width: 'auto' }}
        >
          Cancelar
        </button>
      </div>
      <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 8 }}>
        O jogador recebe um aviso da alteração. Escalações de jogos já publicados e o histórico
        de partidas não mudam.
      </p>
    </div>
  )
}

function Comparacao({ titulo, tipo, principal, secundaria, cor }) {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 10,
        background: '#0C1915',
        border: `1px solid ${colors.line}`,
      }}
    >
      <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' }}>
        {titulo}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: cor, marginTop: 4 }}>
        {principal ? nomeDaPosicao(principal) : 'Sem posição'}
      </div>
      <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
        {secundaria ? `2.ª: ${nomeDaPosicao(secundaria)}` : 'sem secundária'} · {nomeDoTipo(tipo)}
      </div>
    </div>
  )
}

function Historico({ pw, playerId }) {
  const [linhas, setLinhas] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    adminPositionHistory(pw, playerId)
      .then((h) => vivo && setLinhas(h || []))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [pw, playerId])

  if (erro) return <ErrorBox style={{ marginTop: 10 }}>{erro}</ErrorBox>
  if (linhas === null) return <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 10 }}>A carregar…</p>
  if (!linhas.length)
    return (
      <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 10 }}>
        Ainda não houve alterações registadas.
      </p>
    )

  return (
    <ul style={{ listStyle: 'none', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {linhas.map((h, i) => (
        <li
          key={h.id || i}
          style={{
            fontSize: 13,
            padding: '8px 10px',
            borderRadius: 8,
            background: '#0C1915',
            border: `1px solid ${colors.line}`,
          }}
        >
          <div style={{ color: colors.muted, fontSize: 11 }}>
            {formatarQuando(h.changed_at)} ·{' '}
            {h.changed_by_admin ? 'pelo administrador' : 'pelo próprio jogador'}
          </div>
          <div style={{ marginTop: 3 }}>
            {h.previous_primary_position ? nomeDaPosicao(h.previous_primary_position) : 'Sem posição'}
            {' → '}
            <strong style={{ color: colors.grass }}>
              {h.new_primary_position ? nomeDaPosicao(h.new_primary_position) : 'Sem posição'}
            </strong>
          </div>
          {h.previous_player_type !== h.new_player_type && (
            <div style={{ color: colors.teamB, fontSize: 12, marginTop: 2 }}>
              Tipo: {nomeDoTipo(h.previous_player_type)} → {nomeDoTipo(h.new_player_type)}
            </div>
          )}
          {h.change_reason && (
            <div style={{ color: colors.muted, fontSize: 12, marginTop: 2, fontStyle: 'italic' }}>
              “{h.change_reason}”
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function PositionsAdmin({ pw }) {
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [procura, setProcura] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [aberto, setAberto] = useState(null) // id em edição
  const [historicoDe, setHistoricoDe] = useState(null)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState('')

  const carregar = () =>
    adminPositionsOverview(pw)
      .then((l) => {
        setLista(l || [])
        setErro('')
      })
      .catch((e) => setErro(e.message))

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pw])

  const contagens = useMemo(() => {
    const l = lista || []
    return {
      todos: l.length,
      semPosicao: l.filter((p) => p.position_status === POSITION_STATUS.NOT_SELECTED).length,
      porRever: l.filter((p) => p.position_status === POSITION_STATUS.PENDING_REVIEW).length,
      ajustados: l.filter((p) => p.position_status === POSITION_STATUS.ADJUSTED_BY_ADMIN).length,
      goleiros: l.filter((p) => p.player_type === PLAYER_TYPE.GOALKEEPER).length,
    }
  }, [lista])

  const visiveis = useMemo(() => {
    const q = procura.trim().toLowerCase()
    return (lista || []).filter((p) => {
      if (q && !`${p.name} ${p.user_id || ''}`.toLowerCase().includes(q)) return false
      if (filtro === 'semPosicao') return p.position_status === POSITION_STATUS.NOT_SELECTED
      if (filtro === 'porRever') return p.position_status === POSITION_STATUS.PENDING_REVIEW
      if (filtro === 'ajustados') return p.position_status === POSITION_STATUS.ADJUSTED_BY_ADMIN
      if (filtro === 'goleiros') return p.player_type === PLAYER_TYPE.GOALKEEPER
      return true
    })
  }, [lista, procura, filtro])

  const guardar = async (jogador, mudanca) => {
    setBusy(true)
    setErro('')
    try {
      await adminSetPositions(pw, jogador.id, mudanca)
      setAberto(null)
      setOk(`Posição de ${jogador.name} atualizada ✓`)
      setTimeout(() => setOk(''), 3000)
      await carregar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  const aprovar = async (jogador) => {
    setBusy(true)
    setErro('')
    try {
      await adminApprovePositions(pw, jogador.id)
      await carregar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (lista === null) {
    return erro ? (
      <div style={styles.panel}>
        <p style={{ ...styles.mutedText, fontSize: 13 }}>
          ⚠️ Não consegui carregar as posições ({erro}). Se ainda não aplicaste a migração{' '}
          <strong>0015_posicoes.sql</strong> no Supabase, é isso que falta.
        </p>
      </div>
    ) : (
      <div className="pb-stack">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    )
  }

  const filtros = [
    ['todos', `Todos (${contagens.todos})`],
    ['semPosicao', `Sem posição (${contagens.semPosicao})`],
    ['porRever', `Por rever (${contagens.porRever})`],
    ['ajustados', `Ajustados (${contagens.ajustados})`],
    ['goleiros', `Goleiros (${contagens.goleiros})`],
  ]

  return (
    <div>
      <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 12 }}>
        O jogador escolhe a posição uma vez. Aqui podes corrigir quem escolheu mal, definir quem é
        goleiro e ver o histórico de alterações.
      </p>

      <input
        style={{ ...styles.input, marginBottom: 10 }}
        value={procura}
        onChange={(e) => setProcura(e.target.value)}
        placeholder="🔎 Procurar jogador por nome ou ID"
        aria-label="Procurar jogador"
      />

      <div className="pb-scroll-x" style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {filtros.map(([id, label]) => {
          const on = filtro === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              style={{
                flexShrink: 0,
                padding: '7px 13px',
                borderRadius: 999,
                minHeight: 36,
                border: `1px solid ${on ? colors.grass : colors.line}`,
                background: on ? 'rgba(52,208,88,0.14)' : '#0C1915',
                color: on ? colors.grass : colors.muted,
                fontSize: 13,
                fontWeight: on ? 700 : 500,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {erro && <ErrorBox style={{ marginBottom: 12 }}>{erro}</ErrorBox>}
      {ok && (
        <p style={{ color: colors.grass, fontSize: 13, marginBottom: 12 }} role="status">
          {ok}
        </p>
      )}

      {visiveis.length === 0 && (
        <div style={{ ...styles.panel, textAlign: 'center', padding: 22 }}>
          <p style={styles.mutedText}>
            {procura ? 'Nenhum jogador encontrado.' : 'Nada para mostrar neste filtro.'}
          </p>
        </div>
      )}

      <div className="pb-stack">
        {visiveis.map((p) => {
          const emEdicao = aberto === p.id
          const escolheuGkSemSerGk =
            p.primary_position === 'GK' && p.player_type !== PLAYER_TYPE.GOALKEEPER
          return (
            <div key={p.id} className="pb-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={p.name} photo={p.photo} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pb-truncate" style={{ fontSize: 15, fontWeight: 700 }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                    {p.primary_position ? nomeDaPosicao(p.primary_position) : 'Sem posição'}
                    {p.secondary_position ? ` · 2.ª ${nomeDaPosicao(p.secondary_position)}` : ''}
                    {' · '}
                    {nomeDoTipo(p.player_type)}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <EtiquetaEstado status={p.position_status} />
                </div>
              </div>

              {escolheuGkSemSerGk && (
                <p
                  style={{
                    fontSize: 12,
                    color: colors.teamA,
                    marginTop: 8,
                    padding: '7px 10px',
                    borderRadius: 8,
                    background: 'rgba(255,197,49,0.1)',
                  }}
                >
                  ⚠️ Escolheu Goleiro mas continua registado como jogador de campo. Só tu podes
                  mudar o tipo — edita e escolhe “Goleiro”.
                </p>
              )}

              {p.position_updated_at && (
                <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 6 }}>
                  Última alteração: {formatarQuando(p.position_updated_at)}
                  {p.changed_by_admin ? ' · pelo administrador' : ' · pelo próprio jogador'}
                </p>
              )}

              <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setAberto(emEdicao ? null : p.id)}
                  disabled={busy}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.teamA,
                    fontSize: 13,
                    textDecoration: 'underline',
                  }}
                >
                  {emEdicao ? 'Fechar' : '✎ Alterar posição'}
                </button>
                {p.position_status === POSITION_STATUS.PENDING_REVIEW && (
                  <button
                    type="button"
                    onClick={() => aprovar(p)}
                    disabled={busy}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: colors.grass,
                      fontSize: 13,
                      textDecoration: 'underline',
                    }}
                  >
                    ✅ Validar como está
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setHistoricoDe(historicoDe === p.id ? null : p.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.muted,
                    fontSize: 13,
                    textDecoration: 'underline',
                  }}
                >
                  {historicoDe === p.id ? 'Esconder histórico' : '🕓 Histórico'}
                </button>
              </div>

              {historicoDe === p.id && <Historico pw={pw} playerId={p.id} />}

              {emEdicao && (
                <EditorDePosicao
                  jogador={p}
                  busy={busy}
                  onGuardar={(m) => guardar(p, m)}
                  onCancelar={() => setAberto(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 14 }}>
        <span style={{ fontFamily: fonts.title, letterSpacing: 1 }}>NOTA:</span> o sorteio usa
        sempre a posição mais recente definida ou validada por ti — a escolha do jogador nunca se
        sobrepõe a uma correção administrativa.
      </p>
    </div>
  )
}
