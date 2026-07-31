import { useState } from 'react'
import { submitPostMatchRatings } from '../api'
import { formatDia } from '../lib/format'
import Avatar from './Avatar'
import { StarLegend, StarPicker } from './StarRating'
import { colors, fonts, styles, disabled } from '../theme'

// Avaliação pós-jogo: cada um dá 0 a 5 estrelas aos COMPANHEIROS DE EQUIPA
// daquele jogo. Serve para o overall reconhecer quem jogou bem sem marcar —
// o zagueiro que fechou, quem recuperou bola, quem organizou, o goleiro que
// defendeu.
//
// Aceita avaliações parciais (dar nota a três hoje e aos outros amanhã) e
// permite corrigir enquanto a votação estiver aberta; o servidor é que
// fecha a porta quando o admin encerra.

export default function PostMatchRatingCard({ jogo, session, onSaved }) {
  const companheiros = jogo.teammates || []
  const [notas, setNotas] = useState(() => {
    const n = {}
    for (const c of companheiros) if (Number.isInteger(c.stars)) n[c.player_id] = c.stars
    return n
  })
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const dadas = companheiros.filter((c) => Number.isInteger(notas[c.player_id])).length
  const completo = dadas === companheiros.length && companheiros.length > 0

  const gravar = async () => {
    if (busy || dadas === 0) return
    setErro('')
    setAviso('')
    setBusy(true)
    try {
      await submitPostMatchRatings(
        session.id,
        session.pin,
        jogo.match_id,
        companheiros
          .filter((c) => Number.isInteger(notas[c.player_id]))
          .map((c) => ({ player_id: c.player_id, stars: notas[c.player_id] })),
      )
      setAviso(completo ? 'Avaliações guardadas ✓' : `Guardado — faltam ${companheiros.length - dadas}.`)
      setTimeout(() => setAviso(''), 2600)
      onSaved?.()
    } catch (e) {
      setErro(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!companheiros.length) return null

  const meuLado = jogo.team === 'A' ? jogo.team_a_name : jogo.team_b_name

  return (
    <div style={{ ...styles.panel, border: `1px solid ${colors.teamA}`, marginBottom: 12 }}>
      <div style={{ ...styles.title, fontSize: 16, marginBottom: 4 }}>
        ⭐ Avalia o teu time — {formatDia(jogo.played_at)}
      </div>
      <p style={{ ...styles.mutedText, fontSize: 13 }}>
        Só avalias quem jogou contigo{meuLado ? ` nos ${meuLado}` : ''}. É{' '}
        <strong>anónimo</strong>: cada um só vê a média que recebeu. Podes mudar as notas
        enquanto a votação estiver aberta.
      </p>
      <p
        style={{
          fontFamily: fonts.title,
          color: completo ? colors.grass : colors.muted,
          letterSpacing: 1,
          margin: '10px 0 2px',
          fontSize: 14,
        }}
      >
        {dadas}/{companheiros.length} avaliados
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {companheiros.map((c) => (
          <div
            key={c.player_id}
            style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 10 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={c.name} photo={c.photo} size={36} />
              <span className="pb-truncate" style={{ flex: 1, fontSize: 15, fontWeight: 600, minWidth: 0 }}>
                {c.name}
              </span>
            </div>
            <StarPicker
              nome={c.name}
              valor={notas[c.player_id]}
              onChange={(v) => setNotas((n) => ({ ...n, [c.player_id]: v }))}
            />
            <StarLegend valor={notas[c.player_id]} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={gravar}
        disabled={busy || dadas === 0}
        style={
          busy || dadas === 0
            ? disabled({ ...styles.button, marginTop: 12 })
            : { ...styles.button, marginTop: 12 }
        }
      >
        {busy ? 'A guardar…' : completo ? 'Guardar avaliações' : `Guardar ${dadas} avaliação${dadas === 1 ? '' : 'ões'}`}
      </button>
      {aviso && (
        <p style={{ color: colors.grass, fontSize: 13, marginTop: 8, textAlign: 'center' }}>{aviso}</p>
      )}
      {erro && <p style={styles.errorText}>{erro}</p>}
    </div>
  )
}
