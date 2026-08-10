// Data de uma rodada (played_at é só data, sem hora).
// timeZone UTC porque new Date('YYYY-MM-DD') é meia-noite UTC — sem isto,
// em fusos negativos (Brasil) a data aparecia um dia mais cedo.
export function formatDia(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return ''
  }
}

// Data local de hoje em 'YYYY-MM-DD' (toISOString seria a data UTC,
// que à noite no Brasil já é "amanhã")
export function hojeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

// Vencedor(es) de uma contagem [{name, votes}] já ordenada desc pelo servidor.
// Empate no topo devolve todos os nomes juntos.
export function awardWinners(list) {
  if (!list || !list.length) return null
  const top = list[0].votes
  return {
    names: list.filter((x) => x.votes === top).map((x) => x.name).join(' e '),
    votes: top,
  }
}

// Períodos para os rankings ("temporadas").
export const PERIODOS = [
  { id: 'sempre', label: 'Sempre' },
  { id: 'ano', label: 'Este ano' },
  { id: '3meses', label: '3 meses' },
  { id: '30dias', label: '30 dias' },
]

// Converte um período no intervalo de datas (local, não UTC).
export function intervaloDe(periodo) {
  const iso = (x) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  const hoje = new Date()
  if (periodo === 'ano') return { de: `${hoje.getFullYear()}-01-01`, ate: null }
  if (periodo === '3meses') {
    const x = new Date(hoje)
    x.setMonth(x.getMonth() - 3)
    return { de: iso(x), ate: null }
  }
  if (periodo === '30dias') {
    const x = new Date(hoje)
    x.setDate(x.getDate() - 30)
    return { de: iso(x), ate: null }
  }
  return { de: null, ate: null } // sempre
}

// Quem venceu a rodada, a partir do placar.
export function matchWinner(m) {
  const a = Number(m.score_a || 0)
  const b = Number(m.score_b || 0)
  if (a > b) return { side: 'A', name: m.team_a_name || 'Amarelos', isDraw: false }
  if (b > a) return { side: 'B', name: m.team_b_name || 'Azuis', isDraw: false }
  return { side: null, name: 'Empate', isDraw: true }
}

// Jogadores de um time ('A' ou 'B').
export const teamPlayers = (m, side) => (m.players || []).filter((p) => p.team === side)

// Marcadores e assistentes (já vêm ordenados por gols/assistências desc).
export const scorers = (m) => (m.players || []).filter((p) => p.goals > 0)
export const assisters = (m) => (m.players || []).filter((p) => p.assists > 0)
// Autogolos. Lista à parte, e é isso que interessa: um autogolo nunca entra
// em `scorers` — não é um gol do jogador e não conta para o ranking de
// artilheiros. Nas rodadas anteriores à coluna, `own_goals` vem a 0.
export const ownScorers = (m) => (m.players || []).filter((p) => (p.own_goals || 0) > 0)
