import { useState } from 'react'
import { formatDia } from '../../lib/format'
import Avatar from '../Avatar'
import { colors, fonts, styles } from '../../theme'

// Quem ainda não votou no craque/bagre e quem tem notas por dar.
//
// A utilidade disto é dar ao admin uma lista pronta a colar no grupo, por
// isso cada secção tem o seu botão de copiar — e o feedback ("copiado ✓")
// é por chave, senão os dois botões acendiam ao mesmo tempo.

export default function FaltasPanel({ faltas, faltasErr, players = [] }) {
  const [copiado, setCopiado] = useState('')

  const copiarTexto = async (texto, onOk) => {
    try {
      await navigator.clipboard.writeText(texto)
      onOk?.()
    } catch {
      window.prompt('Copia manualmente:', texto)
    }
  }

  const copiarFaltas = (lista, chave) =>
    copiarTexto(lista.map((u) => `${u.name} — ${u.user_id}`).join('\n'), () => {
      setCopiado(chave)
      setTimeout(() => setCopiado(''), 1800)
    })

  const awardPend = faltas?.award_pending || []
  const ratingsPend = faltas?.ratings_pending || []

  return (

    <div>
      {faltasErr && (
        <div style={{ ...styles.panel, marginBottom: 12 }}>
          <p style={{ ...styles.mutedText, fontSize: 13 }}>
            ⚠️ Não consegui carregar ({faltasErr}). Se ainda não aplicaste a migração{' '}
            <strong>0011_quem_falta.sql</strong> no Supabase, é isso que falta.
          </p>
        </div>
      )}

      {!faltasErr && faltas && (
        <>
          {/* 1) craque/bagre da última rodada */}
          <div style={{ ...styles.panel, marginBottom: 12, padding: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15 }}>
                🗳️ Falta votar (craque/bagre)
              </span>
              {faltas.match && (
                <span style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}>
                  {faltas.match.voted}/{faltas.match.total} votaram
                </span>
              )}
            </div>

            {!faltas.match ? (
              <p style={{ ...styles.mutedText, fontSize: 13 }}>
                Ainda não há rodadas registadas.
              </p>
            ) : awardPend.length === 0 ? (
              <p style={{ color: colors.grass, fontSize: 14 }}>
                🎉 Toda a gente que jogou já votou!
              </p>
            ) : (
              <>
                <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                  Rodada de {formatDia(faltas.match.played_at)} — falta o voto de{' '}
                  {awardPend.length}:
                </p>
                {awardPend.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 0',
                    }}
                  >
                    <Avatar
                      name={u.name}
                      photo={players.find((p) => p.id === u.id)?.photo_url}
                      size={30}
                    />
                    <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{u.name}</span>
                    <code
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 12,
                        color: colors.muted,
                      }}
                    >
                      {u.user_id}
                    </code>
                  </div>
                ))}
                <button
                  onClick={() => copiarFaltas(awardPend, 'award')}
                  style={{
                    ...styles.buttonGhost,
                    marginTop: 10,
                    fontSize: 13,
                    color: copiado === 'award' ? colors.grass : colors.text,
                    borderColor: copiado === 'award' ? colors.grass : colors.line,
                  }}
                >
                  {copiado === 'award' ? 'Lista copiada ✓' : '📋 Copiar lista para o grupo'}
                </button>
              </>
            )}
          </div>

          {/* 2) avaliações (notas) por dar */}
          <div style={{ ...styles.panel, padding: 12 }}>
            <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 15, marginBottom: 8 }}>
              ⭐ Falta dar notas
            </div>
            {ratingsPend.length === 0 ? (
              <p style={{ color: colors.grass, fontSize: 14 }}>
                🎉 Toda a gente já avaliou todo o grupo!
              </p>
            ) : (
              <>
                <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 10 }}>
                  {ratingsPend.length}{' '}
                  {ratingsPend.length === 1 ? 'jogador tem' : 'jogadores têm'} notas por dar:
                </p>
                {ratingsPend.map((u) => (
                  <div
                    key={u.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}
                  >
                    <Avatar
                      name={u.name}
                      photo={players.find((p) => p.id === u.id)?.photo_url}
                      size={30}
                    />
                    <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{u.name}</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: colors.teamA,
                        flexShrink: 0,
                      }}
                    >
                      faltam {u.faltam}
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => copiarFaltas(ratingsPend, 'ratings')}
                  style={{
                    ...styles.buttonGhost,
                    marginTop: 10,
                    fontSize: 13,
                    color: copiado === 'ratings' ? colors.grass : colors.text,
                    borderColor: copiado === 'ratings' ? colors.grass : colors.line,
                  }}
                >
                  {copiado === 'ratings'
                    ? 'Lista copiada ✓'
                    : '📋 Copiar lista para o grupo'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
