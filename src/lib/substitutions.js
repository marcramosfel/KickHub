// Desistências de última hora e as suas consequências.
//
// Depois de publicado, um sorteio não se recalcula (0016). Quando alguém
// desiste, entra outro no lugar dele — e as equipas deixam de estar
// equilibradas. Isso não é um defeito a esconder: é informação que quem
// vai jogar tem de ter, e é este ficheiro que a põe em palavras.
//
// Tudo aqui é puro e trabalha sobre o JSON de `get_next_match()`: os ecrãs
// não voltam a somar overalls por conta própria.

import { avaliarEquilibrio } from './drawEngine.js'

// Os dois times da pelada, num sítio só.
export const EQUIPAS = {
  A: { id: 'A', nome: '⚫ Pretos', cor: '#8A96A0' },
  B: { id: 'B', nome: '⚪ Brancos', cor: '#F2F5F2' },
}

export const nomeDaEquipa = (lado) => EQUIPAS[lado]?.nome ?? '—'
export const corDaEquipa = (lado) => EQUIPAS[lado]?.cor ?? null

const ladoDe = (v) => (v === 'A' ? 'A' : v === 'B' ? 'B' : null)

const numOuNulo = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Soma dos overalls congelados no sorteio, equipa a equipa. É a mesma conta
// que o motor faz (`strength`), por isso bate certo com o que foi publicado
// e continua a bater depois de uma troca.
export function forcasDaEscalacao(lineup) {
  const soma = { A: 0, B: 0 }
  for (const l of Array.isArray(lineup) ? lineup : []) {
    const lado = ladoDe(l?.team)
    const n = numOuNulo(l?.overall_at_draw)
    if (lado && n != null) soma[lado] += n
  }
  return soma
}

// Quem está mais forte, e quanto. Os níveis e os limiares são os do sorteio
// (`avaliarEquilibrio`) — aqui só se acrescenta de que lado pende.
export function vantagem(forcaA, forcaB) {
  const a = numOuNulo(forcaA)
  const b = numOuNulo(forcaB)
  if (a == null || b == null || (a === 0 && b === 0)) {
    return {
      lado: null,
      forcaA: a ?? 0,
      forcaB: b ?? 0,
      diff: 0,
      pct: 0,
      nivel: 'desconhecido',
      rotulo: 'Por apurar',
      texto: 'Forças por apurar',
      equilibrado: true,
    }
  }

  const { diff, balancePct, balanceLevel, balanceLabel } = avaliarEquilibrio(a, b)
  const lado = diff === 0 ? null : a > b ? 'A' : 'B'
  return {
    lado,
    forcaA: a,
    forcaB: b,
    diff,
    pct: balancePct,
    nivel: balanceLevel,
    rotulo: balanceLabel,
    texto: lado ? `${nomeDaEquipa(lado)} mais forte` : 'Equipas iguais',
    // "bom" e "excelente" são os níveis que o sorteio dá por aceitáveis
    equilibrado: balanceLevel === 'excelente' || balanceLevel === 'bom',
  }
}

// ---------- prévias: o que uma mexida faz às forças, ANTES de a fazer ----------
// O admin vê o antes/depois e decide; nada disto escreve seja onde for.

// Troca de dois jogadores entre equipas (cada um herda o lugar do outro).
export function previewSwap(jogo, idA, idB) {
  const lineup = Array.isArray(jogo?.lineup) ? jogo.lineup : []
  const a = lineup.find((l) => l.player_id === idA)
  const b = lineup.find((l) => l.player_id === idB)
  if (!a || !b) return null
  if (a.team === b.team) return { valido: false, motivo: 'Os dois estão na mesma equipa.' }
  if ((a.is_goalkeeper === true) !== (b.is_goalkeeper === true)) {
    return { valido: false, motivo: 'Um goleiro só pode trocar com o outro goleiro.' }
  }

  const antes = forcasDaEscalacao(lineup)
  const depois = forcasDaEscalacao(
    lineup.map((l) =>
      l.player_id === idA ? { ...l, team: b.team } : l.player_id === idB ? { ...l, team: a.team } : l
    )
  )
  return {
    valido: true,
    a: { id: idA, nome: a.name, de: a.team, para: b.team, posicao: b.assigned_position },
    b: { id: idB, nome: b.name, de: b.team, para: a.team, posicao: a.assigned_position },
    antes: vantagem(antes.A, antes.B),
    depois: vantagem(depois.A, depois.B),
  }
}

// Substituição de um escalado por alguém de fora (a força de quem entra
// ocupa o lugar da de quem sai, na mesma equipa).
export function previewReplace(jogo, outId, inOverall) {
  const lineup = Array.isArray(jogo?.lineup) ? jogo.lineup : []
  const sai = lineup.find((l) => l.player_id === outId)
  if (!sai) return null
  const antes = forcasDaEscalacao(lineup)
  const depois = forcasDaEscalacao(
    lineup.map((l) => (l.player_id === outId ? { ...l, overall_at_draw: inOverall } : l))
  )
  return {
    valido: true,
    lado: ladoDe(sai.team),
    posicao: sai.assigned_position,
    antes: vantagem(antes.A, antes.B),
    depois: vantagem(depois.A, depois.B),
  }
}

// Uma troca em linguagem de ecrã. `delta` é o que a equipa ganhou (ou
// perdeu) com ela; fica `null` quando falta um dos overalls, porque zero
// aqui significaria "não mudou nada" e seria mentira.
function normalizarTroca(s) {
  if (!s) return null
  const lado = ladoDe(s.team)
  const saiu = numOuNulo(s.out_overall)
  const entrou = numOuNulo(s.in_overall)
  return {
    id: s.id ?? `${s.out_player_id}-${s.in_player_id}`,
    // DESISTENCIA ("não posso ir") ou TROCA (opção do admin) — a etiqueta
    // que os jogadores veem depende disto
    kind: s.kind === 'TROCA' ? 'TROCA' : 'DESISTENCIA',
    lado,
    equipa: lado ? nomeDaEquipa(lado) : '—',
    slot: s.assigned_position ?? null,
    ehGoleiro: s.is_goalkeeper === true,
    saiId: s.out_player_id ?? null,
    saiNome: s.out_name || 'Jogador',
    saiFoto: s.out_photo ?? null,
    saiOverall: saiu,
    entraId: s.in_player_id ?? null,
    entraNome: s.in_name || 'Jogador',
    entraFoto: s.in_photo ?? null,
    entraOverall: entrou,
    delta: saiu == null || entrou == null ? null : entrou - saiu,
    motivo: s.reason || null,
    quando: s.created_at ?? null,
  }
}

// As desistências de um jogo, pela ordem em que aconteceram.
export function desistenciasDoJogo(jogo) {
  const lista = Array.isArray(jogo?.substitutions) ? jogo.substitutions : []
  return lista.map(normalizarTroca).filter((t) => t && t.lado)
}

// Quanto é que cada equipa ganhou ou perdeu com as desistências. Serve para
// dizer *porquê* é que um time ficou mais forte, em vez de só mostrar que
// ficou.
export function impactoDasDesistencias(trocas) {
  const impacto = { A: 0, B: 0, incerto: false, total: 0 }
  for (const t of Array.isArray(trocas) ? trocas : []) {
    if (!t?.lado) continue
    impacto.total += 1
    if (t.delta == null) impacto.incerto = true
    else impacto[t.lado] += t.delta
  }
  return impacto
}

// Tudo o que os ecrãs precisam de saber sobre as desistências de um jogo.
export function resumoDeDesistencias(jogo) {
  const trocas = desistenciasDoJogo(jogo)
  // As forças gravadas em `matches` são recalculadas pela base de dados a
  // cada troca; a soma da escalação é o plano B para um jogo antigo que
  // nunca as chegou a ter.
  const somas = forcasDaEscalacao(jogo?.lineup)
  const a = numOuNulo(jogo?.team_a_overall) ?? somas.A
  const b = numOuNulo(jogo?.team_b_overall) ?? somas.B

  return {
    trocas,
    total: trocas.length,
    houve: trocas.length > 0,
    impacto: impactoDasDesistencias(trocas),
    vantagem: vantagem(a, b),
  }
}
