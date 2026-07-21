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
