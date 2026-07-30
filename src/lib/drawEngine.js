// Motor de sorteio posicional (futebol 7, formação 2-3-1).
//
// O motor antigo (`draw.js`) só equilibrava somas de notas. Este também tem de
// pôr cada jogador num lugar do campo, e a posição pesa tanto como a força:
// uma equipa com 6 atacantes é "equilibrada" no papel e um desastre em campo.
//
// A busca é exaustiva de propósito. O espaço é pequeno o suficiente para
// garantir o óptimo em vez de andar a adivinhar com heurísticas gulosas:
//   - 12 jogadores de campo → C(12,6) = 924 divisões, mas trocar as equipas
//     dá o mesmo sorteio, por isso o primeiro jogador fica sempre na equipa A
//     e sobram C(11,5) = 462 divisões reais.
//   - para cada divisão, cada equipa tem de distribuir 6 jogadores por 6
//     lugares. Testar as 720 permutações seria 462 × 2 × 720 ≈ 665 mil
//     avaliações; em vez disso usa-se o algoritmo húngaro (Munkres) na
//     variante com potenciais e caminho aumentante, O(n³) — exacto, ~900
//     execuções triviais por sorteio e sem risco de ficar preso num óptimo
//     local como aconteceria com um guloso.
//   - os 2 goleiros geram 2 atribuições por divisão; qual deles vai para cada
//     lado não se decide à mão, deixa-se o custo decidir (924 configurações).
//
// No fim junta-se tudo o que empata (a 1% ou a 1 ponto do melhor) e escolhe-se
// uma ao acaso com o gerador semeado: o sorteio deixa de ser sempre idêntico
// mas continua a ser reproduzível a partir do ID do jogo.

import { FIELD_SLOTS, PENALIZACAO, penalizacaoDe } from './positions.js'
import { baralhar, criarRandom, escolher } from './seed.js'

// Quem ainda não tem overall entra como médio: 0 fazia dele um peso morto que
// o equilíbrio ia tentar compensar, e isso é pior do que não saber nada.
export const OVERALL_NEUTRO = 50

export const N_GOLEIROS = 2
export const N_CAMPO = 12
const POR_EQUIPA = FIELD_SLOTS.length // 6 jogadores de campo
const JOGADORES_POR_EQUIPA = POR_EQUIPA + 1 // 7, com o goleiro

// Pesos do custo. A diferença de força manda; a penalização de posição vem a
// seguir; a diferença de médias é só um desempate suave (é proporcional à
// diferença de força, serve para afinar, não para decidir).
const PESO_DIFERENCA = 10
const PESO_PENALIZACAO = 3
const PESO_MEDIA = 5

// Margem de empate: tudo o que estiver a menos de 1% — ou a 1 ponto, para
// custos muito baixos onde 1% é um valor ridículo — entra no sorteio final.
const MARGEM_RELATIVA = 0.01
const MARGEM_ABSOLUTA = 1
const EPSILON = 1e-9

// ---------------------------------------------------------------- erros

// As funções atiram códigos curtos (como as funções SQL do projeto) e põem a
// explicação legível em `.detalhe` — o admin precisa de saber o que corrigir.
function erro(codigo, detalhe, extra = {}) {
  const e = new Error(codigo)
  e.codigo = codigo
  e.detalhe = detalhe
  return Object.assign(e, extra)
}

function validarLote(lista, esperado, codigo, rotulo) {
  const arr = Array.isArray(lista) ? lista.filter(Boolean) : []
  if (arr.length === esperado) return arr
  const faltam = esperado - arr.length
  const sobram = -faltam
  const conta =
    faltam > 0
      ? faltam === 1
        ? 'falta 1'
        : `faltam ${faltam}`
      : sobram === 1
        ? 'sobra 1'
        : `sobram ${sobram}`
  throw erro(codigo, `São precisos ${esperado} ${rotulo}: há ${arr.length}, ${conta}.`, {
    tem: arr.length,
    esperado,
    faltam,
  })
}

// ---------------------------------------------------------------- jogadores

function normalizar(j) {
  const bruto = j?.overall
  // Só números e texto numérico contam. Sem isto, `Number([])` dava 0 e
  // `Number(true)` dava 1 — um valor lixo virava o pior overall possível e
  // desequilibrava o sorteio de verdade, em vez de cair no neutro.
  const numerico = typeof bruto === 'number' || (typeof bruto === 'string' && bruto.trim() !== '')
  const numero = numerico ? Number(bruto) : Number.NaN
  const semOverall = !Number.isFinite(numero)
  return {
    id: j?.id,
    name: j?.name ?? '',
    photo: j?.photo ?? j?.photo_url ?? null,
    // Arredondado de propósito: `match_lineup.overall_at_draw` e
    // `matches.team_a_overall` são colunas `int`, e o `admin_save_lineup` faz
    // `->>'overall_at_draw'::int` — um 72,4 subiria como 22P02 e o admin via
    // "Gols e assistências têm de estar entre 0 e 99" (o código STATS) em vez
    // do erro verdadeiro. Com o overall inteiro, `strength` também é inteiro.
    overall: semOverall ? OVERALL_NEUTRO : Math.round(numero),
    // fica registado que o número é um palpite, para a UI poder avisar
    overallEstimado: semOverall,
    playerType: j?.playerType ?? null,
    primaryPosition: j?.primaryPosition || null,
    secondaryPosition: j?.secondaryPosition || null,
    acceptsOther: j?.acceptsOther !== false,
    positionStatus: j?.positionStatus ?? null,
  }
}

// Porque é que este jogador está fora da principal. `null` = está na dela.
function classificar(jogador, slot) {
  if (!jogador.primaryPosition) return { nivel: 'indefinida', motivo: 'Sem posição definida' }
  const p = penalizacaoDe(jogador, slot)
  if (p === PENALIZACAO.PRINCIPAL) return null
  if (p === PENALIZACAO.SECUNDARIA) return { nivel: 'secundaria', motivo: 'Posição secundária' }
  if (p === PENALIZACAO.COMPATIVEL) return { nivel: 'compativel', motivo: 'Posição compatível' }
  // FORA e RECUSADA dizem a mesma coisa ao adepto; o `nivel` é que distingue
  // quem tinha dito que não aceitava jogar noutro lado.
  return { nivel: p === PENALIZACAO.RECUSADA ? 'recusada' : 'fora', motivo: 'Fora de posição' }
}

// ---------------------------------------------------------------- equilíbrio

export function avaliarEquilibrio(strengthA, strengthB) {
  const a = Number(strengthA) || 0
  const b = Number(strengthB) || 0
  const diff = Math.abs(a - b)
  const media = (a + b) / 2
  const balancePct = media > 0 ? (diff / media) * 100 : 0
  let balanceLevel = 'desequilibrado'
  let balanceLabel = 'Desequilibrado'
  if (balancePct <= 2) {
    balanceLevel = 'excelente'
    balanceLabel = 'Excelente'
  } else if (balancePct <= 5) {
    balanceLevel = 'bom'
    balanceLabel = 'Bom'
  } else if (balancePct <= 8) {
    balanceLevel = 'regular'
    balanceLabel = 'Regular'
  }
  return { diff, balancePct, balanceLevel, balanceLabel }
}

const custoDe = (sA, sB, penalizacao) =>
  Math.abs(sA - sB) * PESO_DIFERENCA +
  penalizacao * PESO_PENALIZACAO +
  Math.abs(sA / JOGADORES_POR_EQUIPA - sB / JOGADORES_POR_EQUIPA) * PESO_MEDIA

// ---------------------------------------------------------------- combinatória

// Divisões dos 12 jogadores de campo em 6 + 6, com o índice 0 sempre na
// equipa A (equipas trocadas são o mesmo sorteio → 462 em vez de 924).
function divisoesDeCampo() {
  const out = []
  const restantes = POR_EQUIPA - 1
  const escolha = new Array(restantes)
  const passo = (inicio, k) => {
    if (k === restantes) {
      out.push([0, ...escolha])
      return
    }
    const limite = N_CAMPO - (restantes - k)
    for (let i = inicio; i <= limite; i++) {
      escolha[k] = i
      passo(i + 1, k + 1)
    }
  }
  passo(1, 0)
  return out
}

// As divisões só dependem de N_CAMPO, não dos jogadores: calculam-se uma vez
// e reaproveitam-se em todos os sorteios (são 462 arrays por chamada).
// Nunca são mutadas — `indicesA` só é lido.
const DIVISOES = divisoesDeCampo()

// Algoritmo húngaro (Munkres) para uma matriz quadrada 6×6 de penalizações.
// Devolve, para cada jogador, o índice do lugar em FIELD_SLOTS, e o total.
// É exacto: nenhuma outra distribuição destes 6 jogadores por estes 6 lugares
// tem penalização menor.
function atribuicaoOtima(jogadores) {
  const n = FIELD_SLOTS.length
  const c = jogadores.map((j) => FIELD_SLOTS.map((slot) => penalizacaoDe(j, slot)))

  // Índices 1..n; a coluna 0 é a sentinela do caminho aumentante.
  const u = new Array(n + 1).fill(0)
  const v = new Array(n + 1).fill(0)
  const p = new Array(n + 1).fill(0) // p[coluna] = linha lá colocada
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(n + 1).fill(Infinity)
    const caminho = new Array(n + 1).fill(0)
    const usado = new Array(n + 1).fill(false)
    do {
      usado[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (usado[j]) continue
        const cur = c[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          caminho[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (usado[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    // desfaz o caminho, recolocando as linhas nas colunas
    do {
      const j1 = caminho[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }

  const slotDe = new Array(n)
  let total = 0
  for (let j = 1; j <= n; j++) {
    const linha = p[j] - 1
    slotDe[linha] = j - 1
    total += c[linha][j - 1]
  }
  return { slotDe, total }
}

// ---------------------------------------------------------------- montagem

function montarEquipa(goleiro, porSlot) {
  const gk = { ...goleiro, assignedPosition: 'GK', isGoalkeeper: true }
  const slots = {}
  let penalidade = 0
  let strength = gk.overall
  for (const slot of FIELD_SLOTS) {
    const j = porSlot[slot]
    slots[slot] = { ...j, assignedPosition: slot, isGoalkeeper: false }
    penalidade += penalizacaoDe(j, slot)
    strength += j.overall
  }
  return {
    goalkeeper: gk,
    slots,
    jogadores: [gk, ...FIELD_SLOTS.map((slot) => slots[slot])],
    strength,
    avg: strength / JOGADORES_POR_EQUIPA,
    penalidade,
  }
}

function forasDe(equipa, team) {
  const out = []
  for (const slot of FIELD_SLOTS) {
    const j = equipa.slots[slot]
    const c = classificar(j, slot)
    if (!c) continue
    out.push({
      playerId: j.id,
      name: j.name,
      team,
      assigned: slot,
      preferred: j.primaryPosition,
      motivo: c.motivo,
      nivel: c.nivel,
    })
  }
  return out
}

// Os goleiros ficam de fora de `outOfPosition`: foram escolhidos como
// goleiros, não foram empurrados para ali pelo sorteio.
function montarResultado(equipaA, equipaB, seed) {
  const penalidadeTotal = equipaA.penalidade + equipaB.penalidade
  const semOverall = []
  for (const [team, equipa] of [
    ['A', equipaA],
    ['B', equipaB],
  ]) {
    for (const j of equipa.jogadores) {
      if (j.overallEstimado) semOverall.push({ playerId: j.id, name: j.name, team })
    }
  }
  return {
    teamA: equipaA,
    teamB: equipaB,
    ...avaliarEquilibrio(equipaA.strength, equipaB.strength),
    outOfPosition: [...forasDe(equipaA, 'A'), ...forasDe(equipaB, 'B')],
    semOverall,
    penalidadeTotal,
    custo: custoDe(equipaA.strength, equipaB.strength, penalidadeTotal),
    seed: seed ?? null,
  }
}

// Estrutura mínima e mutável de um sorteio, para os ajustes manuais mexerem
// sem tocar no resultado original (o admin há-de querer desfazer).
function desmontar(resultado) {
  return {
    A: { gk: resultado.teamA.goalkeeper, slots: { ...resultado.teamA.slots } },
    B: { gk: resultado.teamB.goalkeeper, slots: { ...resultado.teamB.slots } },
  }
}

const remontar = (base, seed) =>
  montarResultado(montarEquipa(base.A.gk, base.A.slots), montarEquipa(base.B.gk, base.B.slots), seed)

function localizar(resultado, id) {
  for (const team of ['A', 'B']) {
    const equipa = team === 'A' ? resultado?.teamA : resultado?.teamB
    if (!equipa) continue
    if (equipa.goalkeeper?.id === id) {
      return { team, slot: 'GK', jogador: equipa.goalkeeper, isGoalkeeper: true }
    }
    for (const slot of FIELD_SLOTS) {
      if (equipa.slots?.[slot]?.id === id) {
        return { team, slot, jogador: equipa.slots[slot], isGoalkeeper: false }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------- API

export function sortearEquipas({ goalkeepers, fieldPlayers, seed } = {}) {
  const gks = validarLote(goalkeepers, N_GOLEIROS, 'GOLEIROS', 'goleiros').map(normalizar)
  const campo = validarLote(fieldPlayers, N_CAMPO, 'CAMPO', 'jogadores de campo').map(normalizar)

  const todos = [...gks, ...campo]
  // Sem esta verificação, dois jogadores sem `id` pareciam o mesmo jogador
  // repetido e o admin ia à procura de um duplicado que não existe.
  const semId = todos.find((j) => j.id == null || j.id === '')
  if (semId) {
    throw erro('SEMJOGADOR', `"${semId.name || 'Um jogador'}" não tem id — recarrega a lista.`)
  }
  const vistos = new Set()
  for (const j of todos) {
    if (vistos.has(j.id)) {
      throw erro('DUPLICADO', `"${j.name}" aparece mais do que uma vez na lista do sorteio.`, {
        playerId: j.id,
      })
    }
    vistos.add(j.id)
  }

  const random = criarRandom(seed ?? '')
  const configuracoes = []
  let melhor = Infinity

  for (const indicesA of DIVISOES) {
    const naA = new Set(indicesA)
    const jogA = indicesA.map((i) => campo[i])
    const jogB = campo.filter((_, i) => !naA.has(i))
    const atribA = atribuicaoOtima(jogA)
    const atribB = atribuicaoOtima(jogB)
    const penalizacao = atribA.total + atribB.total
    const somaA = jogA.reduce((s, j) => s + j.overall, 0)
    const somaB = jogB.reduce((s, j) => s + j.overall, 0)

    // Qual goleiro fica em cada lado é mais uma variável do custo: o melhor
    // goleiro deve calhar ao conjunto de campo mais fraco.
    for (let g = 0; g < N_GOLEIROS; g++) {
      const gkA = gks[g]
      const gkB = gks[N_GOLEIROS - 1 - g]
      const custo = custoDe(somaA + gkA.overall, somaB + gkB.overall, penalizacao)
      if (custo < melhor) melhor = custo
      configuracoes.push({ jogA, jogB, atribA, atribB, gkA, gkB, custo })
    }
  }

  const limiar = melhor + Math.max(melhor * MARGEM_RELATIVA, MARGEM_ABSOLUTA) + EPSILON
  const escolhida = escolher(
    configuracoes.filter((c) => c.custo <= limiar),
    random,
  )

  const porSlot = (jogadores, atrib) => {
    const mapa = {}
    jogadores.forEach((j, i) => {
      mapa[FIELD_SLOTS[atrib.slotDe[i]]] = j
    })
    return mapa
  }

  let A = montarEquipa(escolhida.gkA, porSlot(escolhida.jogA, escolhida.atribA))
  let B = montarEquipa(escolhida.gkB, porSlot(escolhida.jogB, escolhida.atribB))
  // O primeiro jogador da lista ficou sempre na equipa A para cortar as
  // divisões a metade; uma moeda no fim evita que a ordem com que os nomes
  // chegaram decida quem é a equipa A e quem é a B.
  if (random() < 0.5) [A, B] = [B, A]

  return montarResultado(A, B, seed)
}

// Troca dois jogadores de lugar. Entre equipas ou dentro da mesma — quem entra
// fica exactamente no lugar de quem saiu, mais ninguém é mexido.
export function trocarJogadores(resultado, idA, idB) {
  const a = localizar(resultado, idA)
  if (!a) throw erro('SEMJOGADOR', `Não há nenhum jogador com o id "${idA}" neste sorteio.`)
  const b = localizar(resultado, idB)
  if (!b) throw erro('SEMJOGADOR', `Não há nenhum jogador com o id "${idB}" neste sorteio.`)

  const base = desmontar(resultado)
  // trocar alguém consigo próprio não é erro, é só não fazer nada
  if (idA === idB) return remontar(base, resultado.seed)

  if (a.isGoalkeeper !== b.isGoalkeeper) {
    throw erro(
      'TROCAGK',
      'Um goleiro só pode trocar com o outro goleiro — o sorteio precisa de um em cada equipa.',
    )
  }

  if (a.isGoalkeeper) {
    const tmp = base[a.team].gk
    base[a.team].gk = base[b.team].gk
    base[b.team].gk = tmp
  } else {
    const tmp = base[a.team].slots[a.slot]
    base[a.team].slots[a.slot] = base[b.team].slots[b.slot]
    base[b.team].slots[b.slot] = tmp
  }
  return remontar(base, resultado.seed)
}

// Muda um jogador de lugar dentro da própria equipa, trocando com quem lá
// estava (a formação tem de continuar a ter os 6 lugares ocupados).
export function moverParaSlot(resultado, playerId, team, slot) {
  if (team !== 'A' && team !== 'B') {
    throw erro('EQUIPA', `Equipa inválida: "${team}". Só existem "A" e "B".`)
  }
  if (!FIELD_SLOTS.includes(slot)) {
    throw erro('SLOT', `Lugar de campo inválido: "${slot}".`)
  }
  const onde = localizar(resultado, playerId)
  if (!onde) throw erro('SEMJOGADOR', `Não há nenhum jogador com o id "${playerId}" neste sorteio.`)
  if (onde.isGoalkeeper) throw erro('TROCAGK', 'O goleiro não ocupa lugares de campo.')
  if (onde.team !== team) {
    throw erro('EQUIPA', `Esse jogador está na equipa ${onde.team}, não na equipa ${team}.`)
  }

  const base = desmontar(resultado)
  if (onde.slot !== slot) {
    const alvo = base[team].slots
    const tmp = alvo[slot]
    alvo[slot] = alvo[onde.slot]
    alvo[onde.slot] = tmp
  }
  return remontar(base, resultado.seed)
}

// ---------------------------------------------------------------- sorteio rápido
//
// O modo "rachão": qualquer número de jogadores, 2+ equipas, sem posições.
// Não é um segundo motor — reutiliza a normalização, o equilíbrio e a
// semente do motor posicional; só a distribuição é diferente (não há
// lugares para atribuir, logo não há algoritmo húngaro).
//
// `equilibrado`: serpentina por overall (1º→A, 2º→B, 3º→B, 4º→A, …) seguida
// de uma subida de encosta — enquanto houver uma troca de par entre equipas
// que aperte a diferença entre a mais forte e a mais fraca, faz-se a melhor.
// Com ≤30 jogadores é instantâneo e determinístico para a mesma semente.
// `aleatorio`: baralha e corta — para quando a graça é essa.

function validarRapido(jogadores, nEquipas) {
  const lista = Array.isArray(jogadores) ? jogadores.filter(Boolean) : []
  const n = Number(nEquipas)
  if (!Number.isInteger(n) || n < 2) {
    throw erro('EQUIPAS', 'São precisas pelo menos 2 equipas.')
  }
  if (lista.length < n) {
    throw erro('CAMPO', `Com ${n} equipas são precisos pelo menos ${n} jogadores (há ${lista.length}).`)
  }
  const vistos = new Set()
  for (const j of lista) {
    const id = j?.id
    if (id == null || id === '') {
      throw erro('SEMJOGADOR', `"${j?.name || 'Um jogador'}" não tem id — recarrega a lista.`)
    }
    if (vistos.has(id)) {
      throw erro('DUPLICADO', `"${j.name}" aparece mais do que uma vez na lista do sorteio.`, { playerId: id })
    }
    vistos.add(id)
  }
  return lista
}

const somaDe = (equipa) => equipa.reduce((s, j) => s + j.overall, 0)

function montarRapido(equipas, seed, modo) {
  const montadas = equipas.map((jogadores) => {
    const strength = somaDe(jogadores)
    return {
      jogadores,
      strength,
      avg: jogadores.length ? strength / jogadores.length : 0,
    }
  })
  // o desequilíbrio mede-se entre a mais forte e a mais fraca — com 2
  // equipas é exatamente a conta do sorteio oficial
  const forcas = montadas.map((e) => e.strength)
  const eq = avaliarEquilibrio(Math.max(...forcas), Math.min(...forcas))
  return {
    equipas: montadas,
    ...eq,
    semOverall: montadas.flatMap((e, i) =>
      e.jogadores.filter((j) => j.overallEstimado).map((j) => ({ playerId: j.id, name: j.name, team: i }))
    ),
    seed: seed ?? null,
    modo,
  }
}

export function sorteioRapido({ jogadores, nEquipas = 2, modo = 'equilibrado', seed } = {}) {
  const lista = validarRapido(jogadores, nEquipas).map(normalizar)
  const n = Number(nEquipas)
  const random = criarRandom(seed ?? '')

  // tamanhos: o resto distribui-se por equipas sorteadas, não sempre pelas
  // primeiras — senão a equipa 1 tinha quase sempre mais um jogador
  const base = Math.floor(lista.length / n)
  const comExtra = new Set(
    baralhar(Array.from({ length: n }, (_, i) => i), random).slice(0, lista.length % n)
  )
  const capacidade = Array.from({ length: n }, (_, i) => base + (comExtra.has(i) ? 1 : 0))

  let equipas
  if (modo === 'aleatorio') {
    const fila = baralhar(lista, random)
    equipas = capacidade.map((cap) => fila.splice(0, cap))
  } else {
    // serpentina + subida de encosta, VÁRIAS vezes: uma subida só de trocas
    // de par encalha em ótimos locais (viu-se um diff 15 com um perfeito de
    // ~1 disponível). Cada tentativa parte de uma serpentina baralhada de
    // maneira diferente e fica-se com a melhor — determinístico na mesma
    // semente, instantâneo para ≤30 jogadores.
    const TENTATIVAS = 6
    let melhorEquipas = null
    let melhorAmplitude = Infinity

    for (let t = 0; t < TENTATIVAS; t++) {
      // O baralhar sozinho não diversifica nada: o sort é estável e, com
      // overalls todos distintos, refaz sempre a mesma ordem — as tentativas
      // saíam iguais e o reinício era teatro. O ruído na chave (zero na
      // primeira tentativa, a crescer nas seguintes) dá pontos de partida
      // realmente diferentes à subida de encosta.
      const ruido = t === 0 ? 0 : 2 + 3 * t
      const ordenados = lista
        .map((j) => ({ j, chave: j.overall + (random() - 0.5) * ruido }))
        .sort((a, b) => b.chave - a.chave)
        .map((x) => x.j)
      const atual = Array.from({ length: n }, () => [])
      let direcao = 1
      let alvo = 0
      for (const j of ordenados) {
        let voltas = 0
        while (atual[alvo].length >= capacidade[alvo] && voltas < 2 * n) {
          alvo += direcao
          if (alvo === n || alvo === -1) {
            direcao = -direcao
            alvo += direcao
          }
          voltas++
        }
        atual[alvo].push(j)
        alvo += direcao
        if (alvo === n || alvo === -1) {
          direcao = -direcao
          alvo += direcao
        }
      }

      // a melhor troca de par que reduzir a amplitude (máx − mín), até parar
      let melhorou = true
      let guarda = 0
      while (melhorou && guarda < 200) {
        melhorou = false
        guarda++
        const forcas = atual.map(somaDe)
        const amplitude = Math.max(...forcas) - Math.min(...forcas)
        let melhor = { ganho: 0 }
        for (let e1 = 0; e1 < n; e1++) {
          for (let e2 = e1 + 1; e2 < n; e2++) {
            for (let i = 0; i < atual[e1].length; i++) {
              for (let k = 0; k < atual[e2].length; k++) {
                const delta = atual[e2][k].overall - atual[e1][i].overall
                const novas = [...forcas]
                novas[e1] += delta
                novas[e2] -= delta
                const novaAmp = Math.max(...novas) - Math.min(...novas)
                const ganho = amplitude - novaAmp
                if (ganho > melhor.ganho + EPSILON) melhor = { ganho, e1, e2, i, k }
              }
            }
          }
        }
        if (melhor.ganho > 0) {
          const tmp = atual[melhor.e1][melhor.i]
          atual[melhor.e1][melhor.i] = atual[melhor.e2][melhor.k]
          atual[melhor.e2][melhor.k] = tmp
          melhorou = true
        }
      }

      const forcasFinais = atual.map(somaDe)
      const amp = Math.max(...forcasFinais) - Math.min(...forcasFinais)
      if (amp < melhorAmplitude - EPSILON) {
        melhorAmplitude = amp
        melhorEquipas = atual
        if (amp === 0) break // não há melhor que perfeito
      }
    }
    equipas = melhorEquipas
  }

  // dentro de cada equipa a ordem é alfabética — a posição na lista não
  // pode sugerir hierarquia nenhuma
  for (const e of equipas) e.sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }))

  return montarRapido(equipas, seed, modo)
}

// Troca manual entre equipas do sorteio rápido (tocar num de cada lado).
export function trocarNoRapido(resultado, idA, idB) {
  const onde = (id) => {
    for (let e = 0; e < resultado.equipas.length; e++) {
      const i = resultado.equipas[e].jogadores.findIndex((j) => j.id === id)
      if (i >= 0) return { e, i }
    }
    return null
  }
  const a = onde(idA)
  if (!a) throw erro('SEMJOGADOR', `Não há nenhum jogador com o id "${idA}" neste sorteio.`)
  const b = onde(idB)
  if (!b) throw erro('SEMJOGADOR', `Não há nenhum jogador com o id "${idB}" neste sorteio.`)
  if (a.e === b.e) return resultado // mesma equipa: não há nada para trocar

  const equipas = resultado.equipas.map((eq) => [...eq.jogadores])
  const tmp = equipas[a.e][a.i]
  equipas[a.e][a.i] = equipas[b.e][b.i]
  equipas[b.e][b.i] = tmp
  for (const e of equipas) e.sort((x, y) => x.name.localeCompare(y.name, 'pt', { sensitivity: 'base' }))
  return montarRapido(equipas, resultado.seed, resultado.modo)
}

// Linhas prontas para `admin_save_lineup`. `overall_at_draw` guarda o número
// que o sorteio usou de facto (já com o neutro de quem não tinha overall),
// senão a escalação guardada não explicaria as forças que mostrámos.
export function paraLinhasDeEscalacao(resultado) {
  // Sem sorteio não há escalação. `SEMESCALACAO` já é traduzido em api.js
  // ("Sorteia as equipas antes de publicar."), o que é exactamente o que o
  // admin precisa de ler — melhor do que um TypeError sobre `undefined`.
  if (!resultado?.teamA?.jogadores || !resultado?.teamB?.jogadores) {
    throw erro('SEMESCALACAO', 'Ainda não há sorteio para gravar.')
  }
  const linhas = []
  for (const team of ['A', 'B']) {
    const equipa = team === 'A' ? resultado.teamA : resultado.teamB
    for (const j of equipa.jogadores) {
      linhas.push({
        player_id: j.id,
        team,
        assigned_position: j.assignedPosition,
        preferred_position: j.primaryPosition ?? null,
        was_out_of_position: !j.isGoalkeeper && j.primaryPosition !== j.assignedPosition,
        overall_at_draw: j.overall,
        is_goalkeeper: !!j.isGoalkeeper,
      })
    }
  }
  return linhas
}
