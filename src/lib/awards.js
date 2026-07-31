// Quem pode ser votado craque e quem pode ser votado bagre numa rodada.
//
// A regra: o craque sai da equipa VENCEDORA, o bagre da DERROTADA. Quem
// perdeu não concorre a craque e quem ganhou não leva bagre — o prémio
// deixa de contrariar o resultado.
//
// Duas exceções, ambas por não haver lados definidos:
//   - EMPATE: não há vencedor nem derrotado, por isso vale toda a gente
//     que jogou (decisão do grupo).
//   - Rodada antiga sem equipas atribuídas (`team` a null): idem, senão a
//     votação de uma rodada histórica ficava sem candidatos nenhuns.
//
// Este ficheiro é o espelho de `elegiveis_premio` (migração 0023). A régua
// que vale é a do servidor — isto existe para a UI não oferecer um botão
// que a base vai recusar.

export const CRAQUE = 'CRAQUE'
export const BAGRE = 'BAGRE'

const jogadoresDe = (m) => m?.players || m?.stats || []

// Lado vencedor ('A', 'B') ou null (empate / sem placar).
export function ladoVencedor(m) {
  if (!m) return null
  if (m.score_a == null || m.score_b == null) return null
  const a = Number(m.score_a)
  const b = Number(m.score_b)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null
  return a > b ? 'A' : 'B'
}

export const ladoDerrotado = (m) => {
  const v = ladoVencedor(m)
  return v == null ? null : v === 'A' ? 'B' : 'A'
}

// True quando não há como separar vencedores de derrotados — e portanto
// toda a gente concorre. A UI usa isto para explicar porquê.
//
// Exige gente dos DOIS lados: com um deles vazio (rodada meio preenchida)
// uma das listas ficaria sem ninguém, e um cartão de votação sem candidatos
// é pior do que a regra antiga.
export function semLadosDefinidos(m) {
  const vencedor = ladoVencedor(m)
  if (vencedor == null) return true
  const todos = jogadoresDe(m)
  const derrotado = vencedor === 'A' ? 'B' : 'A'
  return !todos.some((p) => p?.team === vencedor) || !todos.some((p) => p?.team === derrotado)
}

// Candidatos a craque ou a bagre. `excluirId` tira quem está a votar (não
// se vota em si próprio).
//
// A exclusão é a ÚLTIMA coisa a acontecer, de propósito: se fosse antes, o
// único derrotado do jogo esvaziava a lista de bagres ao abri-la e o código
// caía no "sem lados definidos", oferecendo-lhe os vencedores para bagre.
export function candidatos(m, tipo, excluirId = null) {
  const todos = jogadoresDe(m).filter(Boolean)
  const lado = tipo === CRAQUE ? ladoVencedor(m) : ladoDerrotado(m)
  const base = semLadosDefinidos(m) ? todos : todos.filter((p) => p.team === lado)
  return base.filter((p) => (p.player_id ?? p.id) !== excluirId)
}

export const candidatosCraque = (m, excluirId = null) => candidatos(m, CRAQUE, excluirId)
export const candidatosBagre = (m, excluirId = null) => candidatos(m, BAGRE, excluirId)

// Um jogador só vê o cartão de votação se houver alguém em quem votar dos
// dois lados — senão submeter dava erro do servidor sem explicação.
export function podeVotar(m, votanteId) {
  return (
    candidatosCraque(m, votanteId).length > 0 && candidatosBagre(m, votanteId).length > 0
  )
}
