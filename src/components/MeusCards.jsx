import { useState } from 'react'
import { setMyPrimaryCard } from '../api'
import { cardsEscolhiveis, raridade } from '../lib/cards'
import { ErrorBox } from './Ui'
import { colors, fonts, styles } from '../theme'

// Escolher o card, a partir do perfil.
//
// A escolha já existia — mas só dentro do modal do card, que se abre tocando
// no avatar de alguém. Ninguém a encontrava: o sítio onde se pensa "quero
// mudar o meu card" é o próprio perfil, que é onde ele está a ser mostrado.
//
// É o mesmo `setMyPrimaryCard` e a mesma regra de `lib/cards.js`; isto é uma
// segunda porta para a mesma decisão, não uma segunda decisão.

export default function MeusCards({ cards, escolhido, atual, session, onPedirPin, onAtualizado }) {
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const lista = cardsEscolhiveis(cards)
  if (lista.length < 2) return null // com um card só não há escolha nenhuma

  const escolher = async (cardId) => {
    if (busy) return
    setErro('')
    const pin = session?.pin || (await onPedirPin?.('Vais escolher o teu card principal.'))
    if (!pin) return
    setBusy(true)
    try {
      await setMyPrimaryCard(session.id, pin, cardId)
      setAviso(cardId ? 'Card atualizado!' : 'Voltou ao automático.')
      setTimeout(() => setAviso(''), 2500)
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
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: fonts.title,
            letterSpacing: 1,
            fontSize: 12,
            textTransform: 'uppercase',
            color: colors.grass,
          }}
        >
          🏅 Os meus cards ({lista.length})
        </span>
        {aviso && (
          <span role="status" style={{ color: colors.grass, fontSize: 12 }}>
            ✅ {aviso}
          </span>
        )}
      </div>
      <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 12 }}>
        Escolhe qual é que o grupo vê no ranking e na imagem que partilhas. Sem escolha, mostra-se
        sempre o mais raro que tiveres nesse momento.
      </p>

      <div className="pb-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lista.map((c) => {
          const r = raridade(c.raridade)
          const emUso = atual?.id === c.id
          const escolhidoAMao = escolhido === c.id
          const brilha = c.raridade === 'lendario' || c.raridade === 'epico'
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => escolher(escolhidoAMao ? null : c.id)}
              disabled={busy}
              aria-pressed={escolhidoAMao}
              className={`pb-tap${brilha ? ' pb-shine' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: 10,
                borderRadius: 12,
                border: `1px solid ${emUso ? r.cor : colors.line}`,
                background: emUso ? `${r.cor}0F` : 'transparent',
                boxShadow: emUso && r.brilho ? `0 0 18px ${r.brilho}` : undefined,
                color: colors.text,
                font: 'inherit',
                textAlign: 'left',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              <span aria-hidden style={{ fontSize: 22, flexShrink: 0 }}>
                {c.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="pb-truncate"
                  style={{ display: 'block', fontFamily: fonts.title, fontSize: 14, color: r.cor }}
                >
                  {c.titulo}
                  {escolhidoAMao && <span style={{ color: colors.grass }}> ★</span>}
                </span>
                <span style={{ fontSize: 11, color: colors.muted, display: 'block' }}>
                  {r.nome} · {c.motivo}
                </span>
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  color: escolhidoAMao ? colors.grass : colors.muted,
                }}
              >
                {escolhidoAMao ? '★ o teu' : emUso ? 'fixar' : 'usar'}
              </span>
            </button>
          )
        })}
      </div>

      {erro && <ErrorBox style={{ marginTop: 10 }}>{erro}</ErrorBox>}
    </div>
  )
}
