// Overall do jogador (o número grande do card): junta a opinião do grupo
// — a média 0–5 que toda a gente dá — com o que acontece mesmo em campo.
//
// Fórmula: 70% opinião do grupo + 30% desempenho, mais um bónus pela taxa
// de craques e um desconto pela taxa de bagres. Fica entre 1 e 99.
//
// O desempenho conta desde o primeiro jogo (decisão do grupo). Só quem
// ainda não jogou nenhuma rodada registada é que fica só pela média —
// senão o desempenho a zero era um castigo por algo que não aconteceu.

export const PESO_GRUPO = 0.7
export const PESO_DESEMPENHO = 0.3
export const PARTICIPACOES_TOPO = 3 // gols + assistências por jogo que valem 100
// Os prémios contam pela TAXA, não pelo total: craque em todas as rodadas
// vale o máximo, craque numa de vinte vale quase nada. Assim quem joga há
// muito tempo não acumula bónus só por ter jogado mais.
export const BONUS_CRAQUE_MAX = 9
export const PENAL_BAGRE_MAX = 6

const limitar = (n) => Math.max(1, Math.min(99, Math.round(n)))

// Recebe o perfil de get_player_profile e devolve o overall já decomposto,
// para o número poder ser explicado (senão parece arbitrário).
export function calcularOverall(perfil) {
  const avg = perfil?.avg == null ? null : Number(perfil.avg)
  const matches = Number(perfil?.matches || 0)
  const goals = Number(perfil?.goals || 0)
  const assists = Number(perfil?.assists || 0)
  const craques = Number(perfil?.craques || 0)
  const bagres = Number(perfil?.bagres || 0)

  const base = avg == null ? null : avg * 20 // 0–100, a opinião do grupo
  const ppj = matches > 0 ? (goals + assists) / matches : 0 // participações por jogo
  const desempenho = Math.min(ppj / PARTICIPACOES_TOPO, 1) * 100
  // taxa de craque/bagre: em que fração das rodadas jogadas foi eleito
  const taxaCraque = matches > 0 ? Math.min(craques / matches, 1) : 0
  const taxaBagre = matches > 0 ? Math.min(bagres / matches, 1) : 0
  const bonusCraque = taxaCraque * BONUS_CRAQUE_MAX
  const penalBagre = taxaBagre * PENAL_BAGRE_MAX

  const partes = { base, desempenho, ppj, bonusCraque, penalBagre, taxaCraque, taxaBagre }

  // sem notas e sem jogos não há nada para calcular
  if (base == null && matches === 0) {
    return { ...partes, overall: null, provisorio: true }
  }
  // ainda sem notas do grupo: conta só o que fez em campo
  if (base == null) {
    return { ...partes, overall: limitar(desempenho), provisorio: true }
  }
  // ainda sem rodadas registadas: vale só a opinião do grupo
  if (matches === 0) {
    return { ...partes, overall: limitar(base), provisorio: true }
  }

  return {
    ...partes,
    overall: limitar(PESO_GRUPO * base + PESO_DESEMPENHO * desempenho + bonusCraque - penalBagre),
    provisorio: false,
  }
}
