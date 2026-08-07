// Overall do jogador (o número grande do card): junta a opinião do grupo
// — a média 0–5 que toda a gente dá — com o que acontece mesmo em campo.
//
// Há DUAS versões da fórmula a viver ao mesmo tempo, e é de propósito:
//
//   v1 (a de sempre): 70% opinião do grupo + 30% desempenho
//   v2 (esta):        40% opinião + 20% desempenho + 25% avaliação pós-jogo
//                     + 15% vitórias acima do esperado
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

// v2 — a soma dá 1. Os 15 pontos das vitórias saíram da opinião do grupo
// (10) e do desempenho (5).
export const PESO_GRUPO_V2 = 0.4
export const PESO_VITORIAS_V2 = 0.15
export const PESO_DESEMPENHO_V2 = 0.2
export const PESO_POS_JOGO_V2 = 0.25
export const ESTRELAS_MAX = 5

// Os pesos ANTES de haver rodadas medidas: a fórmula que existia antes das
// vitórias entrarem. É daqui que a transição parte.
export const PESO_GRUPO_SEM_VITORIAS = 0.5
export const PESO_DESEMPENHO_SEM_VITORIAS = 0.25

// A avaliação dos companheiros vale os 25% a partir da PRIMEIRA nota.
//
// Houve uma versão que amortecia a parcela até seis avaliações, para um
// voto isolado não decidir um quarto do overall. Foi decisão do grupo tirá-la:
// a média é a média de quem votou. Quem não vota dentro do prazo não tem de
// influenciar a nota de quem foi avaliado — e o jogador avaliado não pode
// ficar pendurado na participação dos outros.
//
// O que resta desse desenho é a transparência: o painel do perfil diz sempre
// quantas avaliações compõem a média, para um 5,0 de uma pessoa não se ler
// como um 5,0 de sete.

// ---------- Vitórias acima do esperado ----------
//
// A pergunta não é "ganhaste?" — é "ganhaste mais do que era suposto?".
//
// A taxa de vitórias crua não serve, e isso foi medido no plantel real, não
// argumentado: o que ela premiava eram amostras de 1 e 2 jogos, e castigava
// em 21 pontos quem tinha a melhor avaliação do grupo e quatro derrotas. Pior,
// luta contra o próprio sorteio — o motor existe para IGUALAR as equipas, por
// isso se ele funcionar as taxas convergem para 50% e a parcela mede ruído.
//
// O servidor (migração 0026) manda o SALDO cru: por cada rodada, o resultado
// real menos o que a diferença de forças previa. Ganhar sendo favorito a 93%
// vale +0,07; ganhar sendo favorito a 74% vale +0,26.
//
// Aqui converte-se para a escala 0–100 onde **50 = exatamente o esperado**.
export const WAE_NEUTRO = 50
export const WAE_ESCALA = 100 // saldo médio de +0,5 por jogo → nota 100
// A partir daqui a parcela vale os 15% inteiros. Abaixo, os pesos ainda
// estão a transitar (ver `pesosDaTransicao`).
export const WAE_MIN_JOGOS = 5

// `saldo` é a soma dos desvios; `jogos`, quantas rodadas contribuíram.
// Devolve `null` quando não há rodadas com forças gravadas — e `null` faz a
// parcela sair da conta, em vez de contar como "exatamente o esperado".
//
// A nota é CRUA: não é puxada para 50 com poucos jogos. Quem trata da falta
// de dados é o PESO (`pesosDaTransicao`), não o valor. Amortecer os dois era
// contar a mesma incerteza duas vezes.
export function notaAcimaDoEsperado(saldo, jogos) {
  // `Number(null)` é 0, e um 0 aqui não é "saldo zero" — é ausência de
  // dados, que tem de sair da conta em vez de virar "exatamente o esperado".
  // É a mesma armadilha que já mordeu no overall de goleiro.
  if (saldo == null || saldo === '') return null
  const n = Number(jogos)
  const s = Number(saldo)
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(s)) return null
  return Math.max(0, Math.min(100, WAE_NEUTRO + (s / n) * WAE_ESCALA))
}

// Os pesos da v2 no ponto da transição em que este jogador está.
//
// A parcela das vitórias não se liga de repente: os pesos DESLIZAM da
// fórmula anterior (50/0/25/25) para a nova (40/15/20/25) à medida que há
// rodadas medidas. Somam sempre 1.
//
//   0 rodadas → 50 /  0 / 25 / 25   (exatamente a fórmula anterior)
//   2 rodadas → 46 /  6 / 23 / 25
//   5 rodadas → 40 / 15 / 20 / 25   (a nova, completa)
//
// A alternativa — ligar a parcela de uma vez às 5 rodadas — fazia um jogador
// que rendeu EXATAMENTE o esperado perder 5 pontos de um dia para o outro,
// só por cruzar a fronteira. Um número que cai sem nada ter acontecido em
// campo é impossível de explicar a quem o vê.
export function pesosDaTransicao(waeJogos) {
  const n = Number(waeJogos)
  const t = Number.isFinite(n) && n > 0 ? Math.min(n / WAE_MIN_JOGOS, 1) : 0
  return {
    grupo: PESO_GRUPO_SEM_VITORIAS + (PESO_GRUPO_V2 - PESO_GRUPO_SEM_VITORIAS) * t,
    vitorias: PESO_VITORIAS_V2 * t,
    desempenho:
      PESO_DESEMPENHO_SEM_VITORIAS + (PESO_DESEMPENHO_V2 - PESO_DESEMPENHO_SEM_VITORIAS) * t,
    posJogo: PESO_POS_JOGO_V2,
  }
}

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
  // saldo cru das vitórias acima do esperado (migração 0026)
  const waeSaldo = numeroOuNulo(perfil?.wae_saldo ?? perfil?.waeSaldo)
  const waeJogos = Number(perfil?.wae_matches ?? perfil?.waeMatches ?? 0)

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

  // Peso cheio a partir da primeira avaliação. Sem nenhuma não há parcela —
  // isso é ausência de dados (e vale a fórmula antiga), não uma média fraca.
  const pesoPosJogo = temPosJogo ? PESO_POS_JOGO_V2 : 0

  // `null` quando não há rodadas com forças gravadas (as anteriores ao
  // sorteio agendado, ou as criadas à mão). Aí o peso das vitórias é 0 e os
  // outros ficam nos da fórmula anterior — não há transição a acontecer.
  const vitorias = notaAcimaDoEsperado(waeSaldo, waeJogos)
  const pesosV2 = pesosDaTransicao(vitorias == null ? 0 : waeJogos)

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
    vitorias,
    waeSaldo,
    waeJogos,
    // com poucas rodadas o PESO ainda está a subir — a UI diz isso, em vez
    // de deixar parecer que a parcela já vale por inteiro
    vitoriasProvisorio: vitorias != null && waeJogos < WAE_MIN_JOGOS,
    // uma única avaliação já conta por inteiro, mas ainda não é uma média —
    // a UI diz de quantas notas vem o número, sem lhe mexer no peso
    posJogoProvisorio: temPosJogo && avaliacoes === 1,
    pesos:
      versao === 2
        ? { ...pesosV2, posJogo: pesoPosJogo }
        : { grupo: PESO_GRUPO, vitorias: 0, desempenho: PESO_DESEMPENHO, posJogo: 0 },
    // Preenchido a seguir por cada ramo. São os pesos DEPOIS de as parcelas
    // em falta saírem da conta — os únicos que explicam o número final.
    pesosEfetivos: { grupo: 0, vitorias: 0, desempenho: 0, posJogo: 0 },
  }

  // Os pesos nominais (50/25/25) não explicam o overall quando falta uma
  // parcela ou a confiança ainda não é 1: o que manda são estes, já
  // renormalizados. Sem os expor, o painel "como se calcula o overall"
  // mostrava parcelas que não somavam ao total — e o painel existe
  // precisamente para o número não parecer arbitrário.
  const efetivos = (pares) => {
    const total = pares.reduce((s, [, p]) => s + p, 0)
    const out = { grupo: 0, vitorias: 0, desempenho: 0, posJogo: 0 }
    if (total <= 0) return out
    for (const [nome, p] of pares) out[nome] = p / total
    return out
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
      return {
        ...partes,
        pesosEfetivos: { grupo: 0, vitorias: 0, desempenho: 1, posJogo: 0 },
        overallBase: desempenho,
        overall: limitar(desempenho),
        provisorio: true,
      }
    }
    // ainda sem rodadas registadas: vale só a opinião do grupo
    if (matches === 0) {
      return {
        ...partes,
        pesosEfetivos: { grupo: 1, vitorias: 0, desempenho: 0, posJogo: 0 },
        overallBase: base,
        overall: limitar(base),
        provisorio: true,
      }
    }
    const overallBase = PESO_GRUPO * base + PESO_DESEMPENHO * desempenho
    return {
      ...partes,
      pesosEfetivos: { grupo: PESO_GRUPO, vitorias: 0, desempenho: PESO_DESEMPENHO, posJogo: 0 },
      overallBase,
      overall: limitar(overallBase + bonusCraque - penalBagre),
      provisorio: false,
    }
  }

  // ---------- v2: até 40% grupo + 15% vitórias + 20% campo + 25% companheiros ----------
  // Média ponderada só com as parcelas que EXISTEM. Um jogador sem notas do
  // grupo (ou sem rodadas de campo, ou sem rodadas com forças gravadas) não
  // leva zero na parcela em falta: ela sai da conta e os pesos das outras são
  // renormalizados.
  //
  // É isto que evita o efeito colateral da taxa de vitórias crua, onde quem
  // nunca jogou perdia ~10 pontos por causa de uma parcela que nem se lhe
  // aplicava.
  //
  // Os pesos vêm de `pesosDaTransicao`: com 0 rodadas medidas são os da
  // fórmula anterior (50/25/25) e vão deslizando até aos definitivos às 5.
  const parcelas = [['posJogo', posJogo, pesoPosJogo]]
  if (base != null) parcelas.push(['grupo', base, pesosV2.grupo])
  if (vitorias != null && pesosV2.vitorias > 0) {
    parcelas.push(['vitorias', vitorias, pesosV2.vitorias])
  }
  if (matches > 0) parcelas.push(['desempenho', desempenho, pesosV2.desempenho])

  const pesoTotal = parcelas.reduce((s, [, , p]) => s + p, 0)
  const somaPesada = parcelas.reduce((s, [, v, p]) => s + v * p, 0)
  const overallBase = somaPesada / pesoTotal

  return {
    ...partes,
    pesosEfetivos: efetivos(parcelas.map(([nome, , p]) => [nome, p])),
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
