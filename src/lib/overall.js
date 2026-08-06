// Overall do jogador (o número grande do card): junta a opinião do grupo
// — a média 0–5 que toda a gente dá — com o que acontece mesmo em campo.
//
// Há DUAS versões da fórmula a viver ao mesmo tempo, e é de propósito:
//
//   v1 (a de sempre): 70% opinião do grupo + 30% desempenho
//   v2 (esta):        50% opinião + 25% desempenho + 25% avaliação pós-jogo
//
// Um jogador só passa para a v2 quando recebe a PRIMEIRA avaliação pós-jogo
// válida (só existem em jogos da versão 2 — ver `overall_version` na
// migração 0023). Até lá continua na v1, com o número que sempre teve. Foi
// assim que os overalls não mudaram todos no dia em que os pesos mudaram:
// o que muda a nota de alguém é ele ser avaliado, não o deploy.
//
// A ausência de avaliações NUNCA vale zero. Sem avaliação não há parcela —
// há a fórmula antiga.
//
// Em ambas as versões, depois da base: bónus pela taxa de craques, desconto
// pela taxa de bagres, arredondamento e limite 1–99.
//
// O desempenho conta desde o primeiro jogo (decisão do grupo). Só quem
// ainda não jogou nenhuma rodada registada é que fica só pela média —
// senão o desempenho a zero era um castigo por algo que não aconteceu.

// Versão atual da fórmula. Não é decoração: é o que distingue "ainda não
// foi avaliado" de "foi avaliado e a nota é esta".
export const OVERALL_VERSION = 2

export const PESO_GRUPO = 0.7
export const PESO_DESEMPENHO = 0.3

// v2 — a soma continua a dar 1; o que saiu da opinião do grupo (20 pontos
// percentuais) e do desempenho (5) foi para a avaliação dos companheiros.
export const PESO_GRUPO_V2 = 0.5
export const PESO_DESEMPENHO_V2 = 0.25
export const PESO_POS_JOGO_V2 = 0.25
export const ESTRELAS_MAX = 5

// Confiança na avaliação dos companheiros.
//
// Sem isto, UMA estrela valia os 25% inteiros: bastava um 5★ de um amigo
// para mexer um quarto do overall de alguém. Com a participação baixa que
// motivou este redesenho, isso não é uma parcela — é ruído com peso.
//
// A parcela cresce com o número de avaliações recebidas até um jogo inteiro
// de companheiros (6). Abaixo disso o peso é proporcional e o que sobra é
// redistribuído pelas outras parcelas — não é castigo, é dizer que ainda não
// se sabe o suficiente. É o mesmo mecanismo que o overall de goleiro já usa
// com `RODADAS_CONFIANCA`.
export const AVALIACOES_CONFIANCA = 6

export const PARTICIPACOES_TOPO = 3 // gols + assistências por jogo que valem 100
// Os prémios contam pela TAXA, não pelo total: craque em todas as rodadas
// vale o máximo, craque numa de vinte vale quase nada. Assim quem joga há
// muito tempo não acumula bónus só por ter jogado mais.
export const BONUS_CRAQUE_MAX = 9
export const PENAL_BAGRE_MAX = 6

const limitar = (n) => Math.max(1, Math.min(99, Math.round(n)))

// A média de estrelas do servidor chega como numeric (string no JSON) ou
// já como número; `null` significa "ninguém o avaliou", que é diferente de 0.
const numeroOuNulo = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Recebe o perfil de get_player_profile (ou a linha de get_player_stats) e
// devolve o overall já decomposto, para o número poder ser explicado
// (senão parece arbitrário).
export function calcularOverall(perfil) {
  const avg = perfil?.avg == null ? null : Number(perfil.avg)
  const matches = Number(perfil?.matches || 0)
  const goals = Number(perfil?.goals || 0)
  const assists = Number(perfil?.assists || 0)
  const craques = Number(perfil?.craques || 0)
  const bagres = Number(perfil?.bagres || 0)
  const estrelas = numeroOuNulo(perfil?.post_rating_avg ?? perfil?.postRatingAvg)
  const avaliacoes = Number(perfil?.post_rating_count ?? perfil?.postRatingCount ?? 0)

  const base = avg == null ? null : avg * 20 // 0–100, a opinião do grupo
  const ppj = matches > 0 ? (goals + assists) / matches : 0 // participações por jogo
  const desempenho = Math.min(ppj / PARTICIPACOES_TOPO, 1) * 100
  // taxa de craque/bagre: em que fração das rodadas jogadas foi eleito
  const taxaCraque = matches > 0 ? Math.min(craques / matches, 1) : 0
  const taxaBagre = matches > 0 ? Math.min(bagres / matches, 1) : 0
  const bonusCraque = taxaCraque * BONUS_CRAQUE_MAX
  const penalBagre = taxaBagre * PENAL_BAGRE_MAX

  // A avaliação dos companheiros só entra com pelo menos uma nota dada. As
  // duas condições são precisas: o contador sem média (ou o contrário) é
  // sinal de dados a meio, e nesse caso vale a fórmula antiga.
  const temPosJogo = avaliacoes > 0 && estrelas != null
  const posJogo = temPosJogo ? (estrelas / ESTRELAS_MAX) * 100 : null
  const versao = temPosJogo ? 2 : 1

  // Quanto é que a parcela dos companheiros já vale, de 0 a 1.
  const confiancaPosJogo = temPosJogo ? Math.min(avaliacoes / AVALIACOES_CONFIANCA, 1) : 0
  const pesoPosJogo = PESO_POS_JOGO_V2 * confiancaPosJogo

  const partes = {
    base,
    desempenho,
    ppj,
    bonusCraque,
    penalBagre,
    taxaCraque,
    taxaBagre,
    versao,
    estrelas,
    avaliacoes,
    posJogo,
    confiancaPosJogo,
    // ainda sem avaliações que cheguem para a parcela valer por inteiro —
    // a UI diz que o número é provisório
    posJogoProvisorio: temPosJogo && avaliacoes < AVALIACOES_CONFIANCA,
    pesos:
      versao === 2
        ? { grupo: PESO_GRUPO_V2, desempenho: PESO_DESEMPENHO_V2, posJogo: pesoPosJogo }
        : { grupo: PESO_GRUPO, desempenho: PESO_DESEMPENHO, posJogo: 0 },
  }

  // ---------- v1: exatamente o que este ficheiro sempre fez ----------
  // Nem uma vírgula muda aqui. Os ramos abaixo devolvem o overall SEM o
  // bónus e o desconto (quem não tem notas do grupo, ou não tem rodadas,
  // também não tem prémios que contem) — passá-los pela conta genérica da
  // v2 mexia em números que têm de ficar quietos.
  if (!temPosJogo) {
    // sem notas e sem jogos não há nada para calcular
    if (base == null && matches === 0) {
      return { ...partes, overallBase: null, overall: null, provisorio: true }
    }
    // ainda sem notas do grupo: conta só o que fez em campo
    if (base == null) {
      return { ...partes, overallBase: desempenho, overall: limitar(desempenho), provisorio: true }
    }
    // ainda sem rodadas registadas: vale só a opinião do grupo
    if (matches === 0) {
      return { ...partes, overallBase: base, overall: limitar(base), provisorio: true }
    }
    const overallBase = PESO_GRUPO * base + PESO_DESEMPENHO * desempenho
    return {
      ...partes,
      overallBase,
      overall: limitar(overallBase + bonusCraque - penalBagre),
      provisorio: false,
    }
  }

  // ---------- v2: 50% grupo + 25% campo + 25% companheiros ----------
  // Média ponderada só com as parcelas que EXISTEM. Um jogador sem notas do
  // grupo (ou sem rodadas de campo) não leva zero na parcela em falta: ela
  // sai da conta e os pesos das outras são renormalizados.
  //
  // O peso dos companheiros é o dos 25% JÁ MULTIPLICADO pela confiança: com
  // uma avaliação pesa ~4%, com seis pesa os 25% cheios. A renormalização
  // trata do resto — o que a parcela ainda não vale vai para as outras, em
  // vez de puxar o número para baixo por falta de dados.
  const parcelas = [[posJogo, pesoPosJogo]]
  if (base != null) parcelas.push([base, PESO_GRUPO_V2])
  if (matches > 0) parcelas.push([desempenho, PESO_DESEMPENHO_V2])

  const pesoTotal = parcelas.reduce((s, [, p]) => s + p, 0)
  const somaPesada = parcelas.reduce((s, [v, p]) => s + v * p, 0)
  const overallBase = somaPesada / pesoTotal

  return {
    ...partes,
    overallBase,
    overall: limitar(overallBase + bonusCraque - penalBagre),
    // "provisório" continua a querer dizer "ainda falta informação para o
    // número valer por inteiro" — é o que escolhe o texto da explicação
    provisorio: base == null || matches === 0,
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
