import { useCallback, useEffect, useState } from 'react'
import { adminFinalizeVoting, adminSetVoting, adminVotingReview } from '../../api'
import { estadoDaVotacao, prazoLegivel, prazoParaInput, VOTACAO } from '../../lib/voting'
import { urlDaVotacao } from '../../lib/router'
import { copiarTexto, mensagemDeLembrete, partilharTexto } from '../../lib/share'
import Avatar from '../Avatar'
import { ErrorBox } from '../Ui'
import { colors, fonts, styles, chip, disabled } from '../../theme'

// A votação de uma rodada, do lado do admin.
//
// Antes havia só um interruptor "abrir/encerrar avaliação" — e isso apenas
// para as estrelas: a votação de craque/bagre não tinha controlo nenhum,
// nem prazo, nem forma de saber quem faltava. Aqui está tudo:
//
//   · em que pé está e quanto falta para fechar
//   · quantos já votaram, de quantos
//   · o lembrete pronto a colar no grupo, com os nomes de quem falta
//   · a REVISÃO: quando não há quórum ou há empate, é aqui que se decide
//
// Anonimato: as estrelas saem só como MÉDIA, nem para o admin. Foi o que se
// prometeu a quem vota. O craque/bagre tem o votante identificado desde a
// 0002 e continua a tê-lo — são regras diferentes e isso está escrito no ecrã.

const TOM_COR = { ok: colors.grass, aviso: colors.teamA, erro: colors.error, neutro: colors.muted }

function Barra({ votantes, total, quorum }) {
  const pct = total > 0 ? Math.round((votantes / total) * 100) : 0
  const atingiu = pct >= (quorum ?? 50)
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: colors.muted,
          marginBottom: 6,
        }}
      >
        <span>🗳️ Já votaram</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {votantes}/{total} ({pct}%)
        </span>
      </div>
      <div
        style={{ height: 8, background: '#0C1915', borderRadius: 999, overflow: 'hidden' }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${votantes} de ${total} já votaram`}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: atingiu ? colors.grass : colors.teamA,
            borderRadius: 999,
            transition: 'width .3s',
          }}
        />
      </div>
      {quorum != null && (
        <p style={{ ...styles.mutedText, fontSize: 11, marginTop: 5 }}>
          Quórum: {quorum}% — {atingiu ? 'atingido ✓' : 'ainda não atingido'}
        </p>
      )}
    </div>
  )
}

// Contagem de votos de um prémio, com o botão de escolher em caso de empate.
function Contagem({ titulo, icone, cor, lista, escolhido, onEscolher }) {
  if (!lista?.length) {
    return (
      <div>
        <div style={{ fontSize: 12, color: cor, letterSpacing: 1, marginBottom: 6 }}>
          {icone} {titulo}
        </div>
        <p style={{ ...styles.mutedText, fontSize: 13 }}>Sem votos.</p>
      </div>
    )
  }
  const topo = lista[0]?.votes
  return (
    <div>
      <div style={{ fontSize: 12, color: cor, letterSpacing: 1, marginBottom: 6 }}>
        {icone} {titulo}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {lista.map((p) => {
          const lidera = p.votes === topo
          const sel = escolhido === p.player_id
          return (
            <li
              key={p.player_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 0',
                borderTop: `1px solid ${colors.line}`,
              }}
            >
              <Avatar name={p.name} photo={p.photo} size={26} />
              <span
                className="pb-truncate"
                style={{ flex: 1, fontSize: 13, fontWeight: lidera ? 700 : 400, minWidth: 0 }}
              >
                {p.name}
              </span>
              <span
                style={{
                  fontFamily: fonts.title,
                  fontSize: 14,
                  color: lidera ? cor : colors.muted,
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}
              >
                {p.votes}
              </span>
              <button
                type="button"
                onClick={() => onEscolher(sel ? null : p.player_id)}
                style={{ ...styles.link, flexShrink: 0, color: sel ? cor : colors.muted }}
              >
                {sel ? 'escolhido ✓' : 'escolher'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function VotingPanel({ pw, jogo, onAtualizado }) {
  const [revisao, setRevisao] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [busy, setBusy] = useState(false)
  const [prazo, setPrazo] = useState(() => prazoParaInput(jogo?.voting_deadline))
  const [craque, setCraque] = useState(null)
  const [bagre, setBagre] = useState(null)
  const [aberto, setAberto] = useState(false)

  const v = estadoDaVotacao(jogo)
  const url = urlDaVotacao(jogo?.id)

  const carregar = useCallback(
    async (vivo = { atual: true }) => {
      try {
        const r = await adminVotingReview(pw, jogo.id)
        if (!vivo.atual) return
        setRevisao(r)
        setCraque(jogo.craque_override || null)
        setBagre(jogo.bagre_override || null)
      } catch (e) {
        if (vivo.atual) setErro(e.message)
      }
    },
    [pw, jogo.id, jogo.craque_override, jogo.bagre_override]
  )

  // O campo do prazo segue o que está gravado, sem apagar o que o admin
  // esteja a escrever. Ajustar durante o render (em vez de num efeito) é o
  // padrão que o resto do painel já usa — evita o render extra e o piscar.
  const [prazoGravado, setPrazoGravado] = useState(jogo?.voting_deadline || null)
  if (prazoGravado !== (jogo?.voting_deadline || null)) {
    setPrazoGravado(jogo?.voting_deadline || null)
    setPrazo(prazoParaInput(jogo?.voting_deadline))
  }

  // A revisão só se carrega quando é precisa: em REVIEW é o próprio motivo
  // do painel, e nos outros estados só se o admin a abrir.
  useEffect(() => {
    if (!aberto && !v.emRevisao) return undefined
    const vivo = { atual: true }
    ;(async () => {
      await carregar(vivo)
    })()
    return () => {
      vivo.atual = false
    }
  }, [aberto, v.emRevisao, carregar])

  const correr = async (fn, msg) => {
    if (busy) return
    setBusy(true)
    setErro('')
    try {
      const novo = await fn()
      if (novo?.id) onAtualizado?.(novo)
      if (msg) {
        setAviso(msg)
        setTimeout(() => setAviso(''), 3000)
      }
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  const guardarPrazo = () =>
    correr(
      () => adminSetVoting(pw, jogo.id, { deadline: prazo ? new Date(prazo).toISOString() : null }),
      'Prazo atualizado.'
    )

  const mudarEstado = (status) =>
    correr(
      () => adminSetVoting(pw, jogo.id, { status }),
      status === VOTACAO.OPEN
        ? 'Votação reaberta — o pessoal já pode votar outra vez.'
        : 'Votação encerrada.'
    )

  const confirmar = () => {
    if (
      !window.confirm(
        'Confirmar o resultado final da votação? Craque e bagre ficam congelados e as estatísticas passam a contá-los.'
      )
    )
      return
    correr(
      () => adminFinalizeVoting(pw, jogo.id, craque, bagre),
      'Votação fechada e resultado confirmado. 🏁'
    )
  }

  const lembrar = async (copiarSo) => {
    const texto = mensagemDeLembrete(jogo, url, revisao?.faltam || [])
    const r = copiarSo ? await copiarTexto(texto) : await partilharTexto(texto)
    if (r === 'copiado' || r === 'manual') setAviso('Lembrete copiado — cola no grupo.')
    else if (r === 'whatsapp') setAviso('Abri o WhatsApp com o lembrete.')
    setTimeout(() => setAviso(''), 3000)
  }

  if (!jogo || jogo.result_status !== 'PUBLISHED') return null

  const cor = TOM_COR[v.etiqueta.tom] || colors.muted
  const votantes = revisao?.participacao?.votantes ?? jogo.voting_voters ?? 0
  const total = revisao?.participacao?.total ?? jogo.voting_total ?? 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={chip(cor, `${cor}1A`)}>
          <span aria-hidden>{v.etiqueta.icone}</span> {v.etiqueta.texto}
        </span>
        {v.deadline && (
          <span style={{ fontSize: 13, color: colors.muted }}>
            {v.aberta && !v.tempo.expirado
              ? `fecha em ${v.tempo.texto} · ${prazoLegivel(v.deadline)}`
              : `prazo: ${prazoLegivel(v.deadline)}`}
          </span>
        )}
      </div>

      <Barra votantes={votantes} total={total} quorum={jogo.voting_quorum_pct} />

      {v.emRevisao && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 10,
            background: `${colors.teamA}14`,
            border: `1px solid ${colors.teamA}55`,
            fontSize: 13,
          }}
        >
          ⚠️ <strong>Revisão do admin.</strong> O prazo passou sem quórum, ou há empate no topo.
          Escolhe o craque e o bagre em baixo e confirma — ou estende o prazo e reabre.
        </div>
      )}

      {/* ---------- link e lembrete ---------- */}
      {v.aberta && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...styles.label, marginBottom: 6 }}>Link da votação</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 10,
              background: '#0C1915',
              border: `1px solid ${colors.line}`,
              marginBottom: 10,
            }}
          >
            <span
              className="pb-truncate"
              style={{ flex: 1, fontSize: 12, color: colors.muted, minWidth: 0 }}
            >
              {url}
            </span>
            <button
              type="button"
              onClick={() => copiarTexto(url).then(() => setAviso('Link copiado.'))}
              style={{ ...styles.link, flexShrink: 0 }}
            >
              copiar
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => lembrar(true)}
              style={{ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
            >
              📋 Copiar lembrete
            </button>
            <button
              type="button"
              onClick={() => lembrar(false)}
              style={{ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
            >
              🟢 Lembrar no WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* ---------- prazo ---------- */}
      <div style={{ marginTop: 14 }}>
        <label style={styles.label} htmlFor="prazo-votacao">
          Prazo para votar
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            id="prazo-votacao"
            type="datetime-local"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            style={{ ...styles.input, flex: '1 1 200px', width: 'auto' }}
          />
          <button
            type="button"
            onClick={guardarPrazo}
            disabled={busy}
            style={
              busy
                ? disabled({ ...styles.buttonGhost, flex: '0 1 120px', width: 'auto' })
                : { ...styles.buttonGhost, flex: '0 1 120px', width: 'auto' }
            }
          >
            Guardar
          </button>
        </div>
      </div>

      {/* ---------- revisão ---------- */}
      {(v.emRevisao || aberto) && revisao && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${colors.line}`, paddingTop: 14 }}>
          <div className="pb-cards" style={{ gap: 14 }}>
            <Contagem
              titulo="Craque"
              icone="👑"
              cor={colors.teamA}
              lista={revisao.craque}
              escolhido={craque}
              onEscolher={setCraque}
            />
            <Contagem
              titulo="Bagre"
              icone="🐟"
              cor={colors.teamB}
              lista={revisao.bagre}
              escolhido={bagre}
              onEscolher={setBagre}
            />
          </div>

          {revisao.faltam?.length > 0 && (
            <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 12 }}>
              Ainda não votaram: {revisao.faltam.map((p) => p.name).join(', ')}.
            </p>
          )}

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>
              ⭐ Médias da avaliação pós-jogo
            </summary>
            <p style={{ ...styles.mutedText, fontSize: 12, margin: '8px 0' }}>
              Só médias — nem aqui se vê quem deu que nota. Foi o que se prometeu a quem vota.
            </p>
            {revisao.estrelas?.length ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {revisao.estrelas.map((p) => (
                  <li
                    key={p.player_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 0',
                      fontSize: 13,
                    }}
                  >
                    <Avatar name={p.name} photo={p.photo} size={24} />
                    <span className="pb-truncate" style={{ flex: 1, minWidth: 0 }}>
                      {p.name}
                    </span>
                    <span style={{ color: colors.teamA, fontWeight: 700 }}>
                      {Number(p.avg).toFixed(1)}
                    </span>
                    <span style={{ fontSize: 11, color: colors.muted }}>({p.votes})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ ...styles.mutedText, fontSize: 13 }}>Ainda ninguém avaliou.</p>
            )}
          </details>

          <button
            type="button"
            onClick={confirmar}
            disabled={busy}
            style={busy ? disabled({ ...styles.button, marginTop: 14 }) : { ...styles.button, marginTop: 14 }}
          >
            {busy ? 'A confirmar…' : '🏁 Confirmar resultado final'}
          </button>
        </div>
      )}

      {/* ---------- ações de estado ---------- */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {!v.aberta && (
          <button
            type="button"
            onClick={() => mudarEstado(VOTACAO.OPEN)}
            disabled={busy}
            style={{ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
          >
            🔓 Reabrir votação
          </button>
        )}
        {v.aberta && (
          <button
            type="button"
            onClick={() => mudarEstado(VOTACAO.REVIEW)}
            disabled={busy}
            style={{ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
          >
            ⏹ Fechar já e rever
          </button>
        )}
        {!v.emRevisao && (
          <button
            type="button"
            onClick={() => setAberto((a) => !a)}
            style={{ ...styles.buttonGhost, flex: '1 1 150px', width: 'auto' }}
          >
            {aberto ? 'Esconder votos' : '👁 Ver os votos'}
          </button>
        )}
      </div>

      {aviso && (
        <p style={{ color: colors.grass, fontSize: 13, marginTop: 10 }} role="status">
          {aviso}
        </p>
      )}
      {erro && <ErrorBox style={{ marginTop: 10 }}>{erro}</ErrorBox>}
    </div>
  )
}
