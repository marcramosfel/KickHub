// Rankings da pelada: junta as três fontes de dados num único array e ordena-o.
//
// Regra do projeto: nenhuma página recalcula estatísticas por sua conta. Quem
// precisa de um ranking chama `juntarEstatisticas` e depois um dos
// `ordenar*`. Foi assim que se evitou o overall aparecer diferente na home e
// no perfil — há um só sítio onde o número nasce.

import { calculateFieldPlayerOverall, calculateGoalkeeperOverall } from './overall.js'
import { PLAYER_TYPE, POSITION_STATUS } from './positions.js'

// As abas do ecrã de rankings, pela ordem em que aparecem.
export const RANKING_TABS = [
  { id: 'campo', label: 'Jogadores de campo', icon: '⚽' },
  { id: 'goleiros', label: 'Goleiros', icon: '🧤' },
  { id: 'artilheiros', label: 'Artilheiros', icon: '🥅' },
  { id: 'assistencias', label: 'Assistências', icon: '🅰️' },
  { id: 'craques', label: 'Craques', icon: '👑' },
  { id: 'vitorias', label: 'Vitórias', icon: '🏆' },
]

// A aba 'vitorias' precisa de dados que o get_player_stats não traz; quando
// não houver, mostra empty state em vez de números inventados.
export const CAMPO_DA_ABA = {
  artilheiros: 'goals',
  assistencias: 'assists',
  craques: 'craques',
  vitorias: 'wins',
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const numOuNulo = (v) => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const porNome = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pt', { sensitivity: 'base' })

// Comparadores encadeados: o primeiro que não empatar decide.
const encadear = (...comparadores) => (a, b) => {
  for (const cmp of comparadores) {
    const r = cmp(a, b)
    if (r) return r
  }
  return 0
}

// Maior primeiro, com null sempre no fim (nunca à frente de um zero real).
const maiorPrimeiro = (ler) => (a, b) => {
  const x = ler(a)
  const y = ler(b)
  if (x == null && y == null) return 0
  if (x == null) return 1
  if (y == null) return -1
  return y - x
}

// Menor primeiro (média de gols sofridos), também com null no fim.
const menorPrimeiro = (ler) => (a, b) => {
  const x = ler(a)
  const y = ler(b)
  if (x == null && y == null) return 0
  if (x == null) return 1
  if (y == null) return -1
  return x - y
}

const ehGoleiro = (j) => j?.playerType === PLAYER_TYPE.GOALKEEPER
// Tolerante de propósito: uma lista já filtrada pela página pode vir sem
// `playerType`, e nesse caso a presença de dados de baliza chega.
const temDadosDeBaliza = (j) => j?.gkOverall != null || j?.saves != null

// O `get_goalkeeper_stats()` devolve `{ league, goalkeepers }`, não um array.
// Sem isto, passar o resultado do RPC diretamente rebentava com "is not
// iterable" — a página de rankings ficava em branco.
const listaDeGoleiros = (fonte) => {
  if (Array.isArray(fonte)) return fonte
  if (Array.isArray(fonte?.goalkeepers)) return fonte.goalkeepers
  return []
}

// Só um goleiro pode cair no `overall` genérico: numa lista já filtrada esse
// número já é o de baliza. Num jogador de campo com passagens na baliza seria
// o overall de campo — outra escala — e ele saltava para o topo dos goleiros.
// `gkOverall: null` (explícito) significa "sem overall de baliza", não "usa o
// outro"; só a ausência da chave é que autoriza o fallback.
const overallDeBaliza = (j) => (j?.gkOverall !== undefined ? numOuNulo(j.gkOverall) : numOuNulo(j?.overall))

// ---------- Ordenações ----------

// Overall desc → mais jogos → mais participações diretas em gol → mais
// vitórias → nome. Quem ainda não tem overall vai para o fim da lista.
export function ordenarJogadoresDeCampo(lista) {
  return (lista || [])
    .filter((j) => j && !ehGoleiro(j))
    .sort(
      encadear(
        maiorPrimeiro((j) => numOuNulo(j.overall)),
        maiorPrimeiro((j) => num(j.matches)),
        maiorPrimeiro((j) => num(j.goals) + num(j.assists)),
        maiorPrimeiro((j) => num(j.wins)),
        porNome,
      ),
    )
}

// Overall de goleiro desc → maior % de defesas → MENOR média de gols
// sofridos → mais defesas → nome.
export function ordenarGoleiros(lista) {
  return (lista || [])
    .filter((j) => j && (ehGoleiro(j) || temDadosDeBaliza(j)))
    .sort(
      encadear(
        maiorPrimeiro(overallDeBaliza),
        maiorPrimeiro((j) => numOuNulo(j.savePct)),
        menorPrimeiro((j) => numOuNulo(j.goalsConcededPerMatch)),
        maiorPrimeiro((j) => num(j.saves)),
        porNome,
      ),
    )
}

// Abas de totais (artilheiros, assistências, craques, vitórias): quem tem zero
// não entra na lista — um ranking de artilheiros com 0 gols não diz nada.
export function ordenarPor(lista, campo) {
  return (lista || [])
    .filter((j) => j && numOuNulo(j[campo]) != null && num(j[campo]) > 0)
    .sort(
      encadear(
        maiorPrimeiro((j) => num(j[campo])),
        maiorPrimeiro((j) => num(j.matches)),
        porNome,
      ),
    )
}

// ---------- Vitórias por jogador ----------

// O get_player_stats não conta vitórias. Dá para as tirar do histórico das
// rodadas (o mesmo formato do match_json: `players` com `team`, mais o placar).
// Rodadas sem times atribuídos não contam para ninguém.
export function contarResultados(rodadas) {
  const mapa = {}
  for (const rodada of rodadas || []) {
    // Rodada por jogar (ou cancelada) não é resultado de ninguém. O
    // get_matches() já só devolve COMPLETED, mas quem lhe passar uma lista de
    // admin traz rascunhos a 0-0 — e isso dava um empate a toda a gente.
    if (rodada?.status && rodada.status !== 'COMPLETED') continue
    // Desde a 0019 há mais um estado invisível: resultado em rascunho. Só o
    // publicado conta — a mesma régua da view matches_validas do servidor.
    if (rodada?.result_status && rodada.result_status !== 'PUBLISHED') continue
    if (rodada?.score_a == null || rodada?.score_b == null) continue
    const a = num(rodada.score_a)
    const b = num(rodada.score_b)
    const jogadores = rodada?.players || rodada?.stats || []
    for (const linha of jogadores) {
      const team = linha?.team
      if (team !== 'A' && team !== 'B') continue
      const id = linha.player_id ?? linha.id
      if (!id) continue
      if (!mapa[id]) mapa[id] = { wins: 0, draws: 0, losses: 0 }
      const meu = team === 'A' ? a : b
      const dele = team === 'A' ? b : a
      if (meu > dele) mapa[id].wins++
      else if (meu < dele) mapa[id].losses++
      else mapa[id].draws++
    }
  }
  return mapa
}

// Aceita mapa `{ [playerId]: {wins,draws,losses} }` ou array de linhas.
function mapaDeResultados(resultados) {
  if (!resultados) return null
  if (Array.isArray(resultados)) {
    const mapa = {}
    for (const r of resultados) {
      const id = r?.player_id ?? r?.id
      if (id) mapa[id] = r
    }
    return mapa
  }
  return resultados
}

// ---------- Fusão das três fontes ----------

const idDe = (row) => row?.id ?? row?.player_id
const indexar = (lista) => {
  const mapa = new Map()
  for (const row of lista || []) {
    const id = idDe(row)
    if (id) mapa.set(id, row)
  }
  return mapa
}

// Média de gols sofridos por jogo de toda a pelada — é a referência que o
// overall de goleiro usa para saber se sofrer 2 por jogo é bom ou mau aqui.
// Aceita o array de goleiros ou o objeto inteiro do `get_goalkeeper_stats()`.
export function mediaGolsSofridos(goalkeeperStats) {
  let gols = 0
  let jogos = 0
  for (const g of listaDeGoleiros(goalkeeperStats)) {
    gols += num(g?.goalsConceded ?? g?.goals_conceded ?? g?.conceded)
    jogos += num(g?.matches)
  }
  if (jogos > 0) return gols / jogos
  // Sem rodadas de baliza no array ainda pode vir a média já calculada pela
  // base. O `> 0` é de propósito: o SQL faz coalesce(..., 0) quando não há
  // nada, e uma média de 0 gols dizia que toda a gente sofre a mais.
  const daBase = numOuNulo(goalkeeperStats?.league?.avg_goals_conceded)
  return daBase != null && daBase > 0 ? daBase : null
}

// Funde get_players (médias e posições), get_player_stats (gols, assistências,
// craques) e get_goalkeeper_stats (defesas) num único array. É a única função
// que a app usa para montar rankings.
export function juntarEstatisticas({ players, playerStats, goalkeeperStats, resultados } = {}) {
  const goleiros = listaDeGoleiros(goalkeeperStats)
  const base = players?.length ? players : playerStats?.length ? playerStats : goleiros
  const porId = indexar(playerStats)
  const gkPorId = indexar(goleiros)
  const resPorId = mapaDeResultados(resultados)
  const leagueAvgConceded = mediaGolsSofridos(goalkeeperStats)

  const lista = (base || []).map((row) => {
    const id = idDe(row)
    const stats = porId.get(id) || {}
    const gk = gkPorId.get(id) || null
    const playerType = row.player_type || row.playerType || PLAYER_TYPE.FIELD

    // O goleiro não tem linhas em `match_stats`: as rodadas dele estão só na
    // tabela de baliza. Ficar pelo `get_player_stats` mostrava "0 jogos" a
    // quem jogou a época toda, por isso vale a maior das duas contagens.
    const matchesDeCampo = num(stats.matches ?? row.matches)
    const matchesDeBaliza = num(gk?.matches)
    const matches = Math.max(matchesDeCampo, matchesDeBaliza)
    const goals = num(stats.goals ?? row.goals)
    const assists = num(stats.assists ?? row.assists)
    const craques = num(stats.craques ?? row.craques)
    const bagres = num(stats.bagres ?? row.bagres)
    const avg = numOuNulo(row.avg ?? stats.avg)
    // Avaliação pós-jogo (0023): `null` quer dizer "ainda ninguém o avaliou"
    // e é o que mantém o jogador na fórmula antiga. Um `?? 0` aqui punha
    // toda a gente na v2 com zero estrelas — exatamente o que o pedido
    // proíbe. A contagem, essa, pode ser 0 à vontade.
    const postRatingAvg = numOuNulo(stats.post_rating_avg ?? row.post_rating_avg)
    const postRatingCount = num(stats.post_rating_count ?? row.post_rating_count)
    // Vitórias acima do esperado (0026): saldo cru e quantas rodadas o
    // compõem. `null` no saldo quer dizer "não há rodadas com forças
    // gravadas" — e é isso que faz a parcela sair da conta em vez de valer
    // 50 (o neutro) a quem nunca teve um sorteio equilibrado medido.
    const waeSaldo = numOuNulo(stats.wae_saldo ?? row.wae_saldo)
    const waeMatches = num(stats.wae_matches ?? row.wae_matches)

    // As vitórias podem vir do histórico ou já contadas na linha do goleiro;
    // sem nenhuma das duas fontes ficam a null e a aba mostra empty state.
    // O histórico vem primeiro por contar todas as rodadas do jogador, não só
    // as que ele passou na baliza.
    const res = resPorId?.[id] || null
    const wins = numOuNulo(res?.wins ?? gk?.wins)
    const draws = numOuNulo(res?.draws ?? gk?.draws)
    const losses = numOuNulo(res?.losses ?? gk?.losses)

    const campo = calculateFieldPlayerOverall({
      avg,
      matches: matchesDeCampo,
      goals,
      assists,
      craques,
      bagres,
      post_rating_avg: postRatingAvg,
      post_rating_count: postRatingCount,
      wae_saldo: waeSaldo,
      wae_matches: waeMatches,
    })
    // Para o overall de baliza contam as vitórias COM ele na baliza; só na
    // falta delas é que se recorre ao histórico geral.
    const baliza = gk
      ? calculateGoalkeeperOverall(
          { ...gk, matches: matchesDeBaliza, wins: gk.wins ?? res?.wins },
          leagueAvgConceded,
        )
      : null

    return {
      id,
      name: row.name ?? stats.name ?? gk?.name ?? '',
      photo: row.photo_url ?? row.photo ?? stats.photo ?? null,
      playerType,
      primaryPosition: row.primary_position ?? row.primaryPosition ?? null,
      secondaryPosition: row.secondary_position ?? row.secondaryPosition ?? null,
      acceptsOther: (row.accepts_other_positions ?? row.acceptsOther) !== false,
      positionStatus: row.position_status ?? row.positionStatus ?? POSITION_STATUS.NOT_SELECTED,
      // escolhas do jogador para o card (migração 0022)
      nickname: row.nickname ?? row.apelido ?? null,
      primaryCard: row.primary_card ?? row.primaryCard ?? null,
      avg,
      votes: num(row.votes),
      matches,
      goals,
      assists,
      craques,
      bagres,
      postRatingAvg,
      postRatingCount,
      waeSaldo,
      waeMatches,
      // a nota já convertida (50 = exatamente o esperado), para os ecrãs não
      // terem de repetir a conta
      vitoriasAcimaDoEsperado: campo.vitorias,
      // versão da fórmula deste jogador: 1 enquanto não for avaliado pelos
      // companheiros, 2 a partir daí
      overallVersion: campo.versao,
      // o overall que a UI mostra depende do tipo: goleiro vale pela baliza
      overall: playerType === PLAYER_TYPE.GOALKEEPER ? (baliza?.overall ?? null) : campo.overall,
      provisorio: playerType === PLAYER_TYPE.GOALKEEPER ? (baliza?.provisorio ?? true) : campo.provisorio,
      fieldOverall: campo.overall,
      fieldParts: campo,
      gkOverall: baliza?.overall ?? null,
      gkParts: baliza,
      saves: gk ? num(gk.saves) : null,
      goalsConceded: gk ? num(gk.goalsConceded ?? gk.goals_conceded ?? gk.conceded) : null,
      cleanSheets: gk ? num(gk.cleanSheets ?? gk.clean_sheets) : null,
      savePct: baliza?.savePct ?? null,
      goalsConcededPerMatch: baliza?.goalsConcededPerMatch ?? null,
      wins,
      draws,
      losses,
    }
  })

  return lista.sort(porNome)
}
