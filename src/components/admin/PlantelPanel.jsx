import {
  adminResetRatings,
  adminResetRatingsFor,
  adminSetMember,
  adminSetPlayerStatus,
} from '../../api'
import { ESTADO, ESTADOS, etiquetaDoEstado } from '../../lib/plantel'
import Avatar from '../Avatar'
import FiltroLista, { useFiltro } from './FiltroLista'
import { colors, styles } from '../../theme'

// O plantel aprovado.
//
// Com ~30 jogadores a lista precisa de pesquisa e de grelha; sem elas era
// rolar por rolar com meio ecrã vazio ao lado no computador.
//
// É aqui que se marcam as duas coisas que o admin gere sobre uma pessoa (e
// não sobre um jogo):
//   ⭐ mensalista  — paga o mensal, aparece primeiro na escolha do elenco
//   🟢/✈️/🤕/🔴    — o estado geral, que explica quem provavelmente não joga
// A resposta a UM jogo é outra coisa e é o próprio jogador que a dá.
//
// Reiniciar avaliações é destrutivo e não tem volta: as duas variantes
// (um jogador ou todos) confirmam antes, e a de "todos" fica separada, no
// fim, para não estar ao lado dos botões do dia a dia.

const ORDENS = [
  {
    id: 'mensalistas',
    rotulo: 'Mensalistas',
    comparar: (a, b) => {
      const ma = a.is_member ? 0 : 1
      const mb = b.is_member ? 0 : 1
      if (ma !== mb) return ma - mb
      return a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' })
    },
  },
  {
    id: 'nome',
    rotulo: 'Nome',
    comparar: (a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }),
  },
  { id: 'media', rotulo: 'Média', comparar: (a, b) => (b.avg ?? -1) - (a.avg ?? -1) },
  { id: 'votos', rotulo: 'Votos', comparar: (a, b) => Number(b.votes || 0) - Number(a.votes || 0) },
]

const CAMPOS = (p) => [p.name]

const TOM = {
  ok: colors.grass,
  info: colors.teamB,
  aviso: colors.teamA,
  erro: colors.error,
}

export default function PlantelPanel({ pw, players = [], busy, onAcao, onRemover }) {
  const filtro = useFiltro({ lista: players, campos: CAMPOS, ordens: ORDENS })
  const mensalistas = players.filter((p) => p.is_member).length

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

      {players.length > 0 && (
        <p style={{ ...styles.mutedText, fontSize: 13, margin: '0 0 12px' }}>
          ⭐ {mensalistas} {mensalistas === 1 ? 'mensalista' : 'mensalistas'} de {players.length}{' '}
          no plantel. Os mensalistas aparecem primeiro na escolha do elenco — continuas a escolher
          quem joga.
        </p>
      )}

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
          {filtro.resultado.map((p) => {
            const estado = etiquetaDoEstado(p.availability_status)
            return (
              <div key={p.id} className="pb-card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={p.name} photo={p.photo_url} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="pb-truncate"
                      style={{ fontSize: 15, fontWeight: 600, display: 'flex', gap: 6 }}
                    >
                      {p.is_member && (
                        <span aria-label="mensalista" title="Mensalista">
                          ⭐
                        </span>
                      )}
                      <span className="pb-truncate">{p.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: colors.muted }}>
                      {p.avg != null ? `média ${Number(p.avg).toFixed(2)}` : 'sem votos'} ·{' '}
                      {p.votes} {Number(p.votes) === 1 ? 'voto' : 'votos'}
                    </div>
                  </div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}
                  >
                    <button
                      onClick={() => reavaliarUm(p)}
                      disabled={busy}
                      title="Todo o grupo reavalia este jogador"
                      style={{ ...styles.link, color: colors.teamA }}
                    >
                      Reavaliar
                    </button>
                    <button
                      onClick={() => onRemover(p)}
                      disabled={busy}
                      style={{ ...styles.link, color: colors.error }}
                    >
                      Remover
                    </button>
                  </div>
                </div>

                {/* ---------- estado e mensalista ---------- */}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: `1px solid ${colors.line}`,
                  }}
                >
                  <label
                    htmlFor={`estado-${p.id}`}
                    style={{ fontSize: 12, color: colors.muted, flexShrink: 0 }}
                  >
                    Estado
                  </label>
                  <select
                    id={`estado-${p.id}`}
                    disabled={busy}
                    value={p.availability_status || ESTADO.DISPONIVEL}
                    onChange={(e) => onAcao(() => adminSetPlayerStatus(pw, p.id, e.target.value))}
                    style={{
                      ...styles.input,
                      width: 'auto',
                      flex: '1 1 140px',
                      padding: '8px 10px',
                      fontSize: 13,
                      color: TOM[estado.tom] || colors.text,
                    }}
                  >
                    {ESTADOS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.icone} {e.rotulo}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAcao(() => adminSetMember(pw, p.id, !p.is_member))}
                    aria-pressed={!!p.is_member}
                    title="Mensalistas têm prioridade na escolha do elenco"
                    style={{
                      flexShrink: 0,
                      minHeight: 40,
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: `1px solid ${p.is_member ? colors.teamA : colors.line}`,
                      background: p.is_member ? 'rgba(255,197,49,0.12)' : 'transparent',
                      color: p.is_member ? colors.teamA : colors.muted,
                      font: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    ⭐ {p.is_member ? 'Mensalista' : 'Marcar mensalista'}
                  </button>
                </div>
                {p.availability_note && (
                  <p style={{ ...styles.mutedText, fontSize: 12, marginTop: 6 }}>
                    {estado.icone} {p.availability_note}
                  </p>
                )}
              </div>
            )
          })}
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
