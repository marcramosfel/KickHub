import { useState } from 'react'
import { setMyDispute } from '../api'
import Avatar from './Avatar'
import { ErrorBox } from './Ui'
import { colors, fonts, styles } from '../theme'

// "Não acho justo este sorteio."
//
// O sorteio é feito por um motor que equilibra overalls, e mesmo assim há
// sempre quem ache que a outra equipa ficou melhor. Essa conversa já existe —
// acontece no grupo do WhatsApp, onde o admin a lê tarde e sem números ao
// lado. Trazê-la para aqui não é dar razão a ninguém: é pôr o desacordo
// ao lado do sorteio a que se refere.
//
// Regras que o desenho impõe:
//   · um voto por pessoa, e muda-se de ideias com o mesmo botão;
//   · o motivo é opcional e limitado a 140 caracteres — chega para "os pretos
//     ficaram com os dois melhores meias", não chega para uma discussão;
//   · quem contesta aparece pelo nome. Contestar às escondidas não é
//     contestar, e um número anónimo a crescer só deixa o grupo desconfiado.

const MAX = 140

export default function Contestar({ jogo, session, token, onPedirPin, onAtualizado }) {
  const contestacoes = Array.isArray(jogo?.disputes) ? jogo.disputes : []
  const minha = contestacoes.find((d) => d.player_id === session?.id) || null

  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState(minha?.reason || '')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  // Só faz sentido enquanto o sorteio é o próximo jogo. Depois do apito, o
  // placar já respondeu à pergunta.
  if (!jogo?.id || !['PUBLISHED', 'IN_PROGRESS'].includes(jogo.status)) return null

  const enviar = async (contesta) => {
    if (busy) return
    setErro('')
    const pin = token ? null : session?.pin || (await onPedirPin?.('Vais contestar o sorteio.'))
    if (!token && !pin) return
    setBusy(true)
    try {
      await setMyDispute(session.id, pin, jogo.id, contesta, contesta ? motivo : null, token)
      setAberto(false)
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
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: contestacoes.length ? 10 : 6,
        }}
      >
        <span
          style={{
            fontFamily: fonts.title,
            letterSpacing: 1,
            fontSize: 12,
            textTransform: 'uppercase',
            color: contestacoes.length ? colors.teamA : colors.muted,
          }}
        >
          ⚖️ O sorteio é justo?
        </span>
        {contestacoes.length > 0 && (
          <span style={{ ...styles.mutedText, fontSize: 12 }}>
            {contestacoes.length}{' '}
            {contestacoes.length === 1 ? 'pessoa contestou' : 'pessoas contestaram'}
          </span>
        )}
      </div>

      {/* quem já levantou a mão, e porquê */}
      {contestacoes.length > 0 && (
        <ul className="pb-stagger" style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
          {contestacoes.map((d) => (
            <li
              key={d.player_id}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0' }}
            >
              <Avatar name={d.name} photo={d.photo} size={24} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                <strong>{d.name}</strong>
                {d.reason ? (
                  <span style={{ color: colors.muted }}> — “{d.reason}”</span>
                ) : (
                  <span style={{ color: colors.muted }}> acha o sorteio desequilibrado.</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!aberto && (
        <button
          type="button"
          onClick={() => (minha ? enviar(false) : setAberto(true))}
          disabled={busy}
          className="pb-tap"
          style={{
            ...styles.buttonGhost,
            width: 'auto',
            padding: '10px 16px',
            fontSize: 13,
            color: minha ? colors.teamA : colors.muted,
            borderColor: minha ? colors.teamA : colors.line,
          }}
        >
          {busy ? '…' : minha ? '✋ Contestaste — retirar' : '🤔 Não acho justo'}
        </button>
      )}

      {aberto && (
        <div>
          <label style={styles.label} htmlFor="motivo-contestar">
            Porquê? (opcional)
          </label>
          <textarea
            id="motivo-contestar"
            rows={2}
            maxLength={MAX}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: os pretos ficaram com os dois melhores meias."
            style={{ ...styles.input, resize: 'vertical' }}
          />
          <div style={{ ...styles.mutedText, fontSize: 11, marginTop: 4 }}>
            {motivo.length}/{MAX} · o teu nome fica visível para o grupo.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => enviar(true)}
              disabled={busy}
              className="pb-tap"
              style={{ ...styles.button, width: 'auto', flex: '1 1 140px' }}
            >
              {busy ? 'A enviar…' : 'Contestar'}
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              style={{ ...styles.buttonGhost, width: 'auto', flex: '1 1 100px' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <ErrorBox style={{ marginTop: 10 }}>{erro}</ErrorBox>}
    </div>
  )
}
