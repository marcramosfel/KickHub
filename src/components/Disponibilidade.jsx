import { useState } from 'react'
import { setMyAvailability } from '../api'
import { formatarDataDoJogo } from '../lib/countdown'
import { ErrorBox } from './Ui'
import { colors, fonts, styles } from '../theme'

// "Vais jogar o próximo jogo?" — dois botões, uma linha.
//
// É a resposta a UM jogo e nada mais. O estado do jogador no plantel
// (🟢 disponível, ✈️ a viajar, 🤕 lesionado) é outra coisa, mexida pelo admin
// e mostrada noutro sítio: alguém a viajar pode chegar a tempo desta sexta, e
// alguém disponível pode faltar. Ver `lib/plantel.js`.
//
// A pergunta aparece mal existe jogo marcado — mesmo em rascunho —, porque é
// exatamente antes de escolher os 14 que o admin precisa da resposta.

export default function Disponibilidade({ convocatoria, session, token, onPedirPin, onRespondido }) {
  const jogoId = convocatoria?.id
  const minhaResposta = convocatoria?.answers?.find((a) => a.player_id === session?.id)

  // O que o servidor diz, até o próprio mudar aqui.
  const [local, setLocal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  if (!jogoId) return null

  const atual = local ?? (minhaResposta ? minhaResposta.available : null)
  const d = formatarDataDoJogo(convocatoria.kickoff_at || convocatoria.played_at)

  const responder = async (vai) => {
    if (busy) return
    setErro('')
    // O token do "lembrar-me" chega para isto, tal como para votar; só quem
    // entrou sem token é que tem de escrever o PIN.
    const pin = token ? null : session?.pin || (await onPedirPin?.('Vais responder à convocatória.'))
    if (!token && !pin) return
    setBusy(true)
    try {
      await setMyAvailability(session.id, pin, jogoId, vai, token)
      setLocal(vai)
      await onRespondido?.()
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  const botao = (vai, rotulo, icone, cor) => {
    const ativo = atual === vai
    return (
      <button
        type="button"
        onClick={() => responder(vai)}
        disabled={busy}
        aria-pressed={ativo}
        style={{
          flex: '1 1 140px',
          minHeight: 46,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 12,
          border: `1px solid ${ativo ? cor : colors.line}`,
          background: ativo ? `${cor}1F` : '#0C1915',
          color: ativo ? cor : colors.text,
          font: 'inherit',
          fontSize: 14,
          fontWeight: 700,
          opacity: busy ? 0.6 : 1,
        }}
      >
        <span aria-hidden>{icone}</span>
        {rotulo}
      </button>
    )
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
          marginBottom: 6,
        }}
      >
        Vais jogar?
      </div>
      <p style={{ ...styles.mutedText, fontSize: 13, marginBottom: 12 }}>
        {d.hora
          ? `${d.diaDaSemana}, ${d.data} às ${d.hora}`
          : d.data || 'Próximo jogo'}
        {convocatoria.location ? ` · ${convocatoria.location}` : ''}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {botao(true, 'Estou disponível', '✅', colors.grass)}
        {botao(false, 'Não estou', '❌', colors.error)}
      </div>

      <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
        {atual == null
          ? 'Ainda não respondeste — o admin usa isto para montar a rodada.'
          : atual
            ? 'Ficaste como disponível. Podes mudar até ao jogo.'
            : 'Ficaste como indisponível. Podes mudar até ao jogo.'}
      </p>

      {erro && <ErrorBox style={{ marginTop: 10 }}>{erro}</ErrorBox>}
    </div>
  )
}
