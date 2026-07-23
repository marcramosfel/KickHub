// Overall do jogador (o número grande do card): junta a opinião do grupo
// — a média 0–5 que toda a gente dá — com o que acontece mesmo em campo.
//
// Fórmula: 70% opinião do grupo + 30% desempenho, mais um bónus por ser
// eleito craque e um desconto por ser eleito bagre. Fica entre 1 e 99.
//
// Com poucos jogos o desempenho é ruído (um jogo fraco não pode arrasar
// o número de ninguém), por isso até aos 3 jogos conta só a média — e o
// resultado fica marcado como provisório.

export const PESO_GRUPO = 0.7
export const PESO_DESEMPENHO = 0.3
export const PARTICIPACOES_TOPO = 3 // gols + assistências por jogo que valem 100
export const MIN_JOGOS = 3
export const BONUS_CRAQUE = 3
export const BONUS_CRAQUE_MAX = 9
export const PENAL_BAGRE = 2
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
  const bonusCraque = Math.min(craques * BONUS_CRAQUE, BONUS_CRAQUE_MAX)
  const penalBagre = Math.min(bagres * PENAL_BAGRE, PENAL_BAGRE_MAX)

  const partes = { base, desempenho, ppj, bonusCraque, penalBagre }

  // sem notas e sem jogos não há nada para calcular
  if (base == null && matches === 0) {
    return { ...partes, overall: null, provisorio: true }
  }
  // ainda sem notas do grupo: conta só o que fez em campo
  if (base == null) {
    return { ...partes, overall: limitar(desempenho), provisorio: true }
  }
  // poucos jogos: vale só a opinião do grupo
  if (matches < MIN_JOGOS) {
    return { ...partes, overall: limitar(base), provisorio: true }
  }

  return {
    ...partes,
    overall: limitar(PESO_GRUPO * base + PESO_DESEMPENHO * desempenho + bonusCraque - penalBagre),
    provisorio: false,
  }
}
