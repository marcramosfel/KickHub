import { adminResetRatings, adminResetRatingsFor } from '../../api'
import Avatar from '../Avatar'
import FiltroLista, { useFiltro } from './FiltroLista'
import { colors, styles } from '../../theme'

// O plantel aprovado.
//
// Com ~30 jogadores a lista precisa de pesquisa e de grelha; sem elas era
// rolar por rolar com meio ecrã vazio ao lado no computador.
//
// Reiniciar avaliações é destrutivo e não tem volta: as duas variantes
// (um jogador ou todos) confirmam antes, e a de "todos" fica separada, no
// fim, para não estar ao lado dos botões do dia a dia.

const ORDENS = [
  {
    id: 'nome',
    rotulo: 'Nome',
    comparar: (a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }),
  },
  { id: 'media', rotulo: 'Média', comparar: (a, b) => (b.avg ?? -1) - (a.avg ?? -1) },
  { id: 'votos', rotulo: 'Votos', comparar: (a, b) => Number(b.votes || 0) - Number(a.votes || 0) },
]

const CAMPOS = (p) => [p.name]

const linkStyle = {
  background: 'none',
  border: 'none',
  color: colors.muted,
  fontSize: 13,
  textDecoration: 'underline',
  minHeight: 22,
}

export default function PlantelPanel({ pw, players = [], busy, onAcao, onRemover }) {
  const filtro = useFiltro({ lista: players, campos: CAMPOS, ordens: ORDENS })

  const reavaliarUm = (p) => {
    if (
      !window.confirm(`Reiniciar a avaliação de ${p.name}? Todo o grupo terá de o avaliar de novo.`)
    )
      return
    onAcao(() => adminResetRatingsFor(pw, p.id))
  }

  const reavaliarTodos = () => {
    if (
      !window.confirm(
        'Reiniciar TODAS as avaliações? Todo o grupo terá de avaliar toda a gente outra vez, do zero.'
      )
    )
      return
    onAcao(() => adminResetRatings(pw))
  }

  return (
    <div>
      <FiltroLista
        id="procura-plantel"
        termo={filtro.termo}
        onTermo={filtro.setTermo}
        ordens={ORDENS}
        ordemId={filtro.ordemId}
        onOrdem={filtro.setOrdemId}
        total={players.length}
        visiveis={filtro.resultado.length}
        rotuloSingular="jogador"
        rotuloPlural="jogadores"
        placeholder="Procurar jogador"
      />

      {players.length === 0 ? (
        <p style={{ ...styles.mutedText, textAlign: 'center', padding: 14 }}>
          Ainda não há jogadores aprovados.
        </p>
      ) : filtro.resultado.length === 0 ? (
        <p style={{ ...styles.mutedText, textAlign: 'center', padding: 14 }}>
          Ninguém corresponde a “{filtro.termo}”.
        </p>
      ) : (
        <div className="pb-cards">
          {filtro.resultado.map((p) => (
            <div
              key={p.id}
              className="pb-card"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10 }}
            >
              <Avatar name={p.name} photo={p.photo_url} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pb-truncate" style={{ fontSize: 15, fontWeight: 600 }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 12, color: colors.muted }}>
                  {p.avg != null ? `média ${Number(p.avg).toFixed(2)}` : 'sem votos'} · {p.votes}{' '}
                  {Number(p.votes) === 1 ? 'voto' : 'votos'}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                <button
                  onClick={() => reavaliarUm(p)}
                  disabled={busy}
                  title="Todo o grupo reavalia este jogador"
                  style={{ ...linkStyle, color: colors.teamA }}
                >
                  Reavaliar
                </button>
                <button
                  onClick={() => onRemover(p)}
                  disabled={busy}
                  style={{ ...linkStyle, color: colors.error }}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {players.length > 0 && (
        <div className="pb-card" style={{ marginTop: 14 }}>
          <button
            onClick={reavaliarTodos}
            disabled={busy}
            style={{
              ...styles.buttonGhost,
              color: colors.teamA,
              borderColor: colors.teamA,
              fontSize: 14,
              minHeight: 44,
            }}
          >
            🔄 Reiniciar avaliações de todos
          </button>
          <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 8 }}>
            Todo o grupo terá de avaliar toda a gente outra vez. Usa “Reavaliar” num jogador para
            reiniciar só as notas dele.
          </p>
        </div>
      )}
    </div>
  )
}
