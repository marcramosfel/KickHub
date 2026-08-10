import { useState } from 'react'
import { setMyStatus } from '../api'
import { ESTADO, ESTADOS, etiquetaDoEstado } from '../lib/plantel'
import { ErrorBox } from './Ui'
import { colors, fonts, styles } from '../theme'

// "Como estou" — o próprio jogador diz se está inteiro, a viajar ou partido.
//
// Bidirecional com o painel do admin: é a MESMA coluna
// (`players.availability_status`), escrita por duas portas. Quem sabe que
// torceu o tornozelo é o jogador; o admin continua a poder corrigir quando
// alguém se esquece.
//
// Não confundir com o "vais jogar?" (componente `Disponibilidade`): aquilo é
// a resposta a UM jogo, isto é o estado geral. Um 🟢 disponível pode faltar a
// esta sexta, e um ✈️ a viajar pode chegar a tempo da próxima.

const TOM = {
  ok: colors.grass,
  info: colors.teamB,
  aviso: colors.teamA,
  erro: colors.error,
}

export default function MeuEstado({ session, token, estadoAtual, onPedirPin, onAtualizado }) {
  // O que o servidor diz, até o próprio mudar aqui.
  const [local, setLocal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const atual = local ?? estadoAtual ?? ESTADO.DISPONIVEL

  const mudar = async (novo) => {
    if (busy || novo === atual) return
    setErro('')
    // Como na votação: o token do "lembrar-me" chega. Dizer que se está
    // lesionado não é mexer na conta.
    const pin = token ? null : session?.pin || (await onPedirPin?.('Vais mudar o teu estado.'))
    if (!token && !pin) return
    setBusy(true)
    try {
      await setMyStatus(session.id, pin, novo, null, token)
      setLocal(novo)
      await onAtualizado?.()
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-card">
      <div
        style={{
          fontFamily: fonts.title,
          letterSpacing: 1,
          fontSize: 12,
          textTransform: 'uppercase',
          color: colors.grass,
          marginBottom: 4,
        }}
      >
        Como estou
      </div>
      <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 12 }}>
        O grupo vê isto no plantel. É o teu estado geral — para dizeres se vais a um jogo
        concreto, usa o “vais jogar?”.
      </p>

      <div className="pb-stagger" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {ESTADOS.map((e) => {
          const ativo = atual === e.id
          const cor = TOM[e.tom] || colors.muted
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => mudar(e.id)}
              disabled={busy}
              aria-pressed={ativo}
              className="pb-tap"
              style={{
                flex: '1 1 140px',
                minHeight: 46,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${ativo ? cor : colors.line}`,
                background: ativo ? `${cor}1F` : '#0C1915',
                color: ativo ? cor : colors.text,
                font: 'inherit',
                fontSize: 13,
                fontWeight: ativo ? 700 : 600,
                opacity: busy ? 0.6 : 1,
              }}
            >
              <span aria-hidden style={{ fontSize: 15 }}>
                {e.icone}
              </span>
              {e.rotulo}
            </button>
          )
        })}
      </div>

      <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
        Estás como <strong style={{ color: TOM[etiquetaDoEstado(atual).tom] }}>
          {etiquetaDoEstado(atual).icone} {etiquetaDoEstado(atual).rotulo}
        </strong>
        .
      </p>

      {erro && <ErrorBox style={{ marginTop: 10 }}>{erro}</ErrorBox>}
    </div>
  )
}
