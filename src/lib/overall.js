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

// Nome único e centralizado para a fórmula de campo. É um alias de propósito:
// duplicar a lógica seria a forma mais rápida de os dois números divergirem.
export const calculateFieldPlayerOverall = calcularOverall

// ---------- Overall de goleiro ----------
//
// O goleiro não cabe na fórmula de campo: não marca, não assiste, e a média do
// grupo sozinha castiga quem passa a rodada a apanhar bolas. Por isso tem uma
// escala própria, construída só com o que ele faz na baliza.
//
// As defesas pesam 60% porque são a única parte quase inteiramente dele: gols
// sofridos, jogos sem sofrer e vitórias dependem também da linha à frente. O
// peso maior fica onde o mérito é mais individual — quem defende muito num
// time que sofre muito continua a ser bem avaliado.
//
// O fator de confiança existe para impedir que uma rodada de sorte (ou de
// azar) mande alguém para o topo ou para o fundo do ranking: até às 5 rodadas
// o overall é puxado para 50 e só a partir daí vale por inteiro. Sem isto, um
// goleiro com um único jogo perfeito ficava eternamente em primeiro.
export const PESO_DEFESAS = 0.6
export const PESO_GOLS_SOFRIDOS = 0.2
export const PESO_JOGOS_SEM_SOFRER = 0.1
export const PESO_VITORIAS_GK = 0.1
export const RODADAS_CONFIANCA = 5 // a partir daqui o overall vale a 100%
export const RODADAS_PROVISORIO = 3 // abaixo disto mostra-se como "Provisório"

const entre = (n, min, max) => Math.max(min, Math.min(max, n))
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// `gk` aceita tanto camelCase como as colunas cruas de get_goalkeeper_stats.
// `leagueAvgConceded` é a média de gols sofridos por jogo de todos os goleiros;
// sem ela usamos a média do próprio, o que dá uma pontuação neutra (50) em vez
// de inventar uma referência.
export function calculateGoalkeeperOverall(gk, leagueAvgConceded) {
  const matches = num(gk?.matches)
  const saves = num(gk?.saves)
  const goalsConceded = num(gk?.goalsConceded ?? gk?.goals_conceded ?? gk?.conceded)
  const cleanSheets = num(gk?.cleanSheets ?? gk?.clean_sheets)
  const wins = num(gk?.wins)

  const shotsOnTarget = saves + goalsConceded
  // As taxas são presas entre 0 e 1 porque as fontes podem discordar: as
  // vitórias vêm do histórico e as rodadas da tabela de baliza, e uma vitória
  // a mais do que rodadas dava winRate > 1 e um overall acima de 100.
  const saveRate = shotsOnTarget > 0 ? entre(saves / shotsOnTarget, 0, 1) : 0
  const goalsConcededPerMatch = matches > 0 ? Math.max(goalsConceded / matches, 0) : 0
  const cleanSheetRate = matches > 0 ? entre(cleanSheets / matches, 0, 1) : 0
  const winRate = matches > 0 ? entre(wins / matches, 0, 1) : 0

  // `== null` explícito: Number(null) é 0 e isso fingia uma pelada onde
  // ninguém sofre gols, castigando todos os goleiros de uma vez.
  const media = leagueAvgConceded == null ? NaN : Number(leagueAvgConceded)
  const referencia = Number.isFinite(media) ? media : goalsConcededPerMatch
  // sofrer menos do que a média da pelada sobe a pontuação, sofrer mais desce
  const concededScore = entre(50 + 15 * (referencia - goalsConcededPerMatch), 0, 100)

  const raw =
    saveRate * 100 * PESO_DEFESAS +
    concededScore * PESO_GOLS_SOFRIDOS +
    cleanSheetRate * 100 * PESO_JOGOS_SEM_SOFRER +
    winRate * 100 * PESO_VITORIAS_GK

  const confidence = Math.min(matches / RODADAS_CONFIANCA, 1)

  const partes = {
    raw,
    saveRate,
    savePct: Math.round(saveRate * 1000) / 10,
    shotsOnTarget,
    goalsConcededPerMatch,
    cleanSheetRate,
    winRate,
    concededScore,
    confidence,
  }

  // sem rodadas não há nada para calcular — mostrar 50 seria fingir dados
  if (matches === 0) return { ...partes, overall: null, provisorio: true }

  return {
    ...partes,
    // o `entre` é cinto e suspensórios: com as taxas já presas o raw nunca
    // sai de 0–100, mas um overall fora da escala partia a barra da UI
    overall: Math.round(entre(50 + (raw - 50) * confidence, 0, 100)),
    provisorio: matches < RODADAS_PROVISORIO,
  }
}
