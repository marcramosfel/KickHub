import { useState } from 'react'
import { setMyPrediction } from '../api'
import { nomeDaEquipa, corDaEquipa } from '../lib/substitutions'
import Avatar from './Avatar'
import { ErrorBox } from './Ui'
import { colors, fonts, styles } from '../theme'

// "Quem é que ganha?"
//
// Não vale nada e é esse o ponto: não mexe no sorteio, no overall nem no
// ranking. Serve para haver alguma coisa a fazer entre o sorteio sair e a
// bola rolar — e para alguém ficar mal visto por ter apostado contra a
// própria equipa, que é onde está a graça.
//
// Fecha ao apito: um palpite dado depois de se saber o resultado não é um
// palpite, e o servidor recusa (PALPITEFECHADO).

const OPCOES = [
  { id: 'A', rotulo: () => nomeDaEquipa('A'), cor: () => corDaEquipa('A') },
  { id: 'EMPATE', rotulo: () => '🤝 Empate', cor: () => colors.muted },
  { id: 'B', rotulo: () => nomeDaEquipa('B'), cor: () => corDaEquipa('B') },
]

export default function Palpite({ jogo, session, token, onPedirPin, onAtualizado }) {
  const palpites = Array.isArray(jogo?.predictions) ? jogo.predictions : []
  const meu = palpites.find((p) => p.player_id === session?.id) || null

  const [local, setLocal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  // Só enquanto o jogo não aconteceu. Depois disso o placar já respondeu.
  if (!jogo?.id || !['PUBLISHED', 'IN_PROGRESS'].includes(jogo.status)) return null

  const atual = local ?? meu?.palpite ?? null

  // Quantos apostaram em cada lado — a informação que faz o grupo falar.
  const contagem = OPCOES.map((o) => ({
    ...o,
    n: palpites.filter((p) => p.palpite === o.id).length,
  }))
  const total = palpites.length

  const apostar = async (palpite) => {
    if (busy || palpite === atual) return
    setErro('')
    const pin = token ? null : session?.pin || (await onPedirPin?.('Vais dar o teu palpite.'))
    if (!token && !pin) return
    setBusy(true)
    try {
      await setMyPrediction(session.id, pin, jogo.id, palpite, token)
      setLocal(palpite)
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
        🔮 Quem é que ganha?
      </div>
      <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 12 }}>
        {total > 0
          ? `${total} ${total === 1 ? 'palpite dado' : 'palpites dados'}. Fecha quando a bola rolar.`
          : 'Ainda ninguém arriscou. Fecha quando a bola rolar.'}
      </p>

      <div className="pb-stagger" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {contagem.map((o) => {
          const ativo = atual === o.id
          const cor = o.cor()
          const pct = total ? Math.round((o.n / total) * 100) : 0
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => apostar(o.id)}
              disabled={busy}
              aria-pressed={ativo}
              className="pb-tap"
              style={{
                position: 'relative',
                overflow: 'hidden',
                flex: '1 1 120px',
                minHeight: 58,
                padding: '10px 12px',
                borderRadius: 12,
                border: `1px solid ${ativo ? cor : colors.line}`,
                background: '#0C1915',
                color: ativo ? cor : colors.text,
                font: 'inherit',
                fontSize: 13,
                fontWeight: ativo ? 700 : 600,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {/* barra de fundo com a percentagem — lê-se sem ler números */}
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${pct}%`,
                  background: `${cor}1F`,
                  transition: 'width 320ms ease',
                }}
              />
              <span style={{ position: 'relative', display: 'block' }}>{o.rotulo()}</span>
              <span
                style={{
                  position: 'relative',
                  display: 'block',
                  fontSize: 11,
                  color: colors.muted,
                  marginTop: 2,
                }}
              >
                {o.n} {o.n === 1 ? 'palpite' : 'palpites'}
                {total ? ` · ${pct}%` : ''}
              </span>
            </button>
          )
        })}
      </div>

      {atual && (
        <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10 }}>
          Apostaste em{' '}
          <strong style={{ color: OPCOES.find((o) => o.id === atual)?.cor() }}>
            {OPCOES.find((o) => o.id === atual)?.rotulo()}
          </strong>
          . Podes mudar até ao apito.
        </p>
      )}

      {/* quem apostou em quê — é isto que dá conversa */}
      {total > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: colors.muted }}>
            Ver quem arriscou o quê
          </summary>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {palpites.map((p) => {
              const o = OPCOES.find((x) => x.id === p.palpite)
              return (
                <span
                  key={p.player_id}
                  title={`${p.name} → ${o?.rotulo()}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '3px 9px 3px 3px',
                    borderRadius: 999,
                    border: `1px solid ${o?.cor() || colors.line}55`,
                    fontSize: 12,
                  }}
                >
                  <Avatar name={p.name} photo={p.photo} size={20} />
                  <span className="pb-truncate" style={{ maxWidth: 90 }}>
                    {p.name.split(' ')[0]}
                  </span>
                </span>
              )
            })}
          </div>
        </details>
      )}

      {erro && <ErrorBox style={{ marginTop: 10 }}>{erro}</ErrorBox>}
    </div>
  )
}
