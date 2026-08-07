import { useEffect, useMemo, useState } from 'react'
import { getPendingRatings, getPlayers, submitRatings } from '../api'
import { formatarNota, RATING_LABELS } from '../lib/labels'
import Avatar from './Avatar'
import RatingSlider from './RatingSlider'
import { ErrorBox, SkeletonCard } from './Ui'
import { colors, fonts, styles, disabled } from '../theme'

// Avaliação do grupo: a nota de 0 a 5 que cada um dá aos outros.
//
// Era uma lista comprida com todos os jogadores e seis botões por linha —
// trinta pessoas de uma vez, e quem chegava ao fim já não sabia com que
// régua tinha começado. Agora é UM jogador por ecrã, com a barra a dar
// nome à nota, e um contador que mostra quanto falta.
//
// A nota é a parcela mais pesada do overall, e o overall é o que equilibra
// as equipas. Vale a pena o ecrã pedir atenção a sério.

// O "não conheço" é enviado como `null` — o servidor guarda a linha sem
// nota, o jogador sai dos pendentes e não entra em média nenhuma.
const NAO_CONHECO = null

export default function RateScreen({ session, onPedirPin, onDone, onSkip }) {
  const [others, setOthers] = useState(null)
  const [notas, setNotas] = useState({}) // { [id]: number | null }
  const [indice, setIndice] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const { id: meuId, pin: meuPin } = session

  useEffect(() => {
    let vivo = true
    getPendingRatings(meuId, meuPin)
      .then((l) => vivo && setOthers(l))
      .catch(() =>
        // fallback se a 0005 não estiver aplicada: avalia todos os outros
        getPlayers()
          .then((pls) => vivo && setOthers(pls.filter((p) => p.id !== meuId)))
          .catch((err) => vivo && setError(err.message))
      )
    return () => {
      vivo = false
    }
  }, [meuId, meuPin])

  const total = others?.length || 0
  const respondidos = useMemo(
    () => (others || []).filter((p) => p.id in notas).length,
    [others, notas]
  )
  const atual = others?.[indice] || null
  const notaAtual = atual && atual.id in notas ? notas[atual.id] : undefined
  const respondeu = atual ? atual.id in notas : false
  const ultimo = indice >= total - 1
  const completo = respondidos === total && total > 0

  const responder = (valor) => {
    if (!atual) return
    setNotas((n) => ({ ...n, [atual.id]: valor }))
  }

  const avancar = () => {
    if (!respondeu) return
    if (!ultimo) setIndice((i) => i + 1)
  }

  const enviar = async () => {
    if (!completo || busy) return
    setError('')
    const pin = meuPin || (await onPedirPin?.('Vais enviar as tuas avaliações.'))
    if (!pin) return
    setBusy(true)
    try {
      await submitRatings(meuId, pin, notas)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // ---------- estados fora do fluxo ----------

  if (others === null) {
    return (
      <div style={styles.page}>
        <h1 style={{ ...styles.title, fontSize: 24, marginBottom: 16 }}>Avalia o grupo</h1>
        {error ? (
          <ErrorBox>{error}</ErrorBox>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        )}
      </div>
    )
  }

  if (total === 0) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.panel, textAlign: 'center', padding: 28, marginTop: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }} aria-hidden>
            ✅
          </div>
          <p style={styles.mutedText}>
            Já avaliaste toda a gente. Quando entrarem jogadores novos, pedimos-te as notas
            deles aqui.
          </p>
          <button style={{ ...styles.button, marginTop: 20 }} onClick={onSkip}>
            Continuar
          </button>
        </div>
      </div>
    )
  }

  // ---------- o ecrã ----------

  return (
    <div style={{ ...styles.page, maxWidth: 520 }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <h1 style={{ ...styles.title, fontSize: 22 }}>Avalia o grupo</h1>
        <p style={{ ...styles.mutedText, fontSize: 13, marginTop: 6 }}>
          É esta nota que equilibra as equipas no sorteio. As notas ficam{' '}
          <strong>anónimas até toda a gente entregar</strong> — depois disso, abrem para todos.
        </p>
      </div>

      {/* progresso */}
      <div style={{ margin: '14px 0 18px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            fontSize: 12,
            color: colors.muted,
            marginBottom: 6,
          }}
        >
          <span>
            {respondidos} de {total}
          </span>
          <button
            type="button"
            onClick={() => setShowGuide((s) => !s)}
            style={{ ...styles.link, padding: '2px 0' }}
          >
            {showGuide ? 'esconder guia' : 'como calibrar?'}
          </button>
        </div>
        <div
          style={{ height: 6, background: '#0C1915', borderRadius: 999, overflow: 'hidden' }}
          role="progressbar"
          aria-valuenow={respondidos}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div
            style={{
              height: '100%',
              width: `${(respondidos / total) * 100}%`,
              background: colors.grass,
              borderRadius: 999,
              transition: 'width .25s',
            }}
          />
        </div>
      </div>

      {showGuide && (
        <div className="pb-card" style={{ marginBottom: 16 }}>
          {RATING_LABELS.map((r) => (
            <div
              key={r.nota}
              style={{ display: 'flex', gap: 10, fontSize: 13, padding: '3px 0' }}
            >
              <span
                style={{
                  fontFamily: fonts.title,
                  width: 18,
                  color: colors.teamA,
                  flexShrink: 0,
                }}
              >
                {r.nota}
              </span>
              <span>
                <strong>{r.titulo}</strong>{' '}
                <span style={{ color: colors.muted }}>— {r.desc}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* o jogador */}
      <div className="pb-card">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <Avatar name={atual.name} photo={atual.photo_url ?? atual.photo} size={84} />
          <div
            className="pb-truncate"
            style={{ fontFamily: fonts.title, fontSize: 21, maxWidth: '100%' }}
          >
            {atual.name}
          </div>
        </div>

        {notaAtual === NAO_CONHECO && respondeu ? (
          <div
            style={{
              textAlign: 'center',
              padding: '26px 12px',
              borderRadius: 12,
              border: `1px dashed ${colors.line}`,
              background: '#0C1915',
            }}
          >
            <div style={{ fontSize: 34 }} aria-hidden>
              🤷
            </div>
            <div style={{ ...styles.title, fontSize: 15, marginTop: 8 }}>Não o conheces</div>
            <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 6 }}>
              Não entra na média dele — e é assim que deve ser.
            </p>
            <button
              type="button"
              onClick={() => responder(2.5)}
              style={{ ...styles.link, marginTop: 8 }}
            >
              afinal quero dar nota
            </button>
          </div>
        ) : (
          <RatingSlider valor={notaAtual} onChange={responder} nome={atual.name} />
        )}

        {/* o "não conheço" — a alternativa honesta a inventar uma nota */}
        {!(respondeu && notaAtual === NAO_CONHECO) && (
          <button
            type="button"
            onClick={() => responder(NAO_CONHECO)}
            style={{ ...styles.buttonGhost, marginTop: 14, fontSize: 14 }}
          >
            🤷 Não conheço este jogador
          </button>
        )}

        {error && <ErrorBox style={{ marginTop: 12 }}>{error}</ErrorBox>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {indice > 0 && (
            <button
              type="button"
              onClick={() => setIndice((i) => i - 1)}
              style={{ ...styles.buttonGhost, flex: '1 1 100px', width: 'auto' }}
            >
              ← Anterior
            </button>
          )}
          {!ultimo ? (
            <button
              type="button"
              onClick={avancar}
              disabled={!respondeu}
              style={
                respondeu
                  ? { ...styles.button, flex: '2 1 160px', width: 'auto' }
                  : disabled({ ...styles.button, flex: '2 1 160px', width: 'auto' })
              }
            >
              Seguinte →
            </button>
          ) : (
            <button
              type="button"
              onClick={enviar}
              disabled={!completo || busy}
              style={
                completo && !busy
                  ? { ...styles.button, flex: '2 1 160px', width: 'auto' }
                  : disabled({ ...styles.button, flex: '2 1 160px', width: 'auto' })
              }
            >
              {busy ? 'A enviar…' : '✅ Enviar as minhas notas'}
            </button>
          )}
        </div>

        {ultimo && !completo && (
          <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
            Faltam {total - respondidos} por responder — usa o “Anterior” para voltar atrás.
          </p>
        )}
      </div>

      {/* o que já respondeste, para poder voltar atrás sem procurar */}
      {respondidos > 0 && (
        <details className="pb-card" style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: colors.muted }}>
            Rever as {respondidos} notas que já deste
          </summary>
          <div style={{ marginTop: 10 }}>
            {others.map((p, i) =>
              p.id in notas ? (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setIndice(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '7px 4px',
                    background: 'none',
                    border: 'none',
                    borderBottom: `1px solid ${colors.line}`,
                    color: colors.text,
                    font: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <Avatar name={p.name} photo={p.photo_url ?? p.photo} size={26} />
                  <span className="pb-truncate" style={{ flex: 1, fontSize: 13 }}>
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.title,
                      fontSize: 14,
                      color: notas[p.id] === NAO_CONHECO ? colors.muted : colors.teamA,
                      flexShrink: 0,
                    }}
                  >
                    {notas[p.id] === NAO_CONHECO ? '🤷' : formatarNota(notas[p.id])}
                  </span>
                </button>
              ) : null
            )}
          </div>
        </details>
      )}
    </div>
  )
}
