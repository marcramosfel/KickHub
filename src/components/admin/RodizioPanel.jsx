import { nomeDaEquipa, corDaEquipa } from '../../lib/substitutions'
import Avatar from '../Avatar'
import { colors, fonts, styles } from '../../theme'

// A ordem do rodízio, no passo de revisão do sorteio.
//
// Existe para o admin poder ver — e corrigir — a escolha que o motor fez,
// com a JUSTIFICAÇÃO à vista. Uma escolha automática sem explicação é uma
// escolha em que ninguém confia: se o admin não perceber porque calhou ao
// João, vai trocá-lo por hábito e a rotatividade nunca acontece.
//
// A regra que isto torna visível: o equilíbrio das equipas foi calculado
// SEM olhar a quem vai ao gol. Trocar aqui não mexe nas forças.

function explicacao(info) {
  if (!info) return 'sem histórico'
  if (info.aceita === false) return 'não aceita ir à baliza'
  const vezes = Number(info.vezes) || 0
  const dias = Math.round(Number(info.dias) || 0)
  if (vezes === 0) return 'nunca começou no gol'
  const quando = dias >= 120 ? 'há muito tempo' : dias >= 1 ? `há ${dias} dias` : 'hoje'
  return `${vezes}× no gol · última vez ${quando}`
}

export default function RodizioPanel({ resultado, historico, onDefinirInicio }) {
  if (resultado?.gkMode !== 'ROTATING' || !resultado.rodizio) return null

  const minutos = resultado.rotacaoMinutos || null
  const porId = new Map()
  for (const team of ['A', 'B']) {
    const equipa = team === 'A' ? resultado.teamA : resultado.teamB
    for (const j of equipa.jogadores) porId.set(j.id, j)
  }

  return (
    <div className="pb-card">
      <div style={{ fontFamily: fonts.title, letterSpacing: 1, fontSize: 14, marginBottom: 4 }}>
        🔄 Rodízio de goleiro
      </div>
      <p style={{ ...styles.mutedText, fontSize: 12, marginBottom: 12 }}>
        O equilíbrio das equipas foi calculado <strong>sem olhar a quem vai ao gol</strong> — trocar
        aqui não muda as forças. A ordem sai de quem foi menos vezes, há mais tempo, e aceita ir.
      </p>

      <div className="pb-cards" style={{ gap: 14 }}>
        {['A', 'B'].map((team) => {
          const ordem = resultado.rodizio[team] || []
          return (
            <div key={team}>
              <div
                style={{
                  fontSize: 12,
                  color: corDaEquipa(team),
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                {nomeDaEquipa(team)}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {ordem.map((id, i) => {
                  const j = porId.get(id)
                  if (!j) return null
                  const primeiro = i === 0
                  return (
                    <li
                      key={id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '7px 0',
                        borderTop: i === 0 ? 'none' : `1px solid ${colors.line}`,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 24,
                          flexShrink: 0,
                          textAlign: 'center',
                          fontSize: primeiro ? 15 : 12,
                          color: primeiro ? colors.teamA : colors.muted,
                          fontFamily: fonts.title,
                        }}
                      >
                        {primeiro ? '🧤' : i + 1}
                      </span>
                      <Avatar name={j.name} photo={j.photo} size={28} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          className="pb-truncate"
                          style={{
                            display: 'block',
                            fontSize: 13,
                            fontWeight: primeiro ? 700 : 500,
                          }}
                        >
                          {j.name}
                          {minutos && (
                            <span style={{ color: colors.muted, fontWeight: 400 }}>
                              {' '}
                              · {i * minutos}&#39;
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: 11, color: colors.muted }}>
                          {explicacao(historico?.[id])}
                        </span>
                      </span>
                      {!primeiro && (
                        <button
                          type="button"
                          onClick={() => onDefinirInicio?.(team, id)}
                          style={{ ...styles.link, flexShrink: 0, color: colors.teamA }}
                        >
                          começa
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
