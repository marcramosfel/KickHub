// O estado do Simulador manual: quem está em que lugar, de que lado.
//
// Vive aqui e não dentro do componente porque é lógica com regras (um jogador
// só pode estar num sítio, trocar dois é uma operação e não duas) e isso quer
// testes. O componente fica só com o desenho.
//
// O estado é um objeto simples e imutável:
//
//   { A: { GK: id|null, 'DEF-L': id|null, ... }, B: { ... } }
//
// Só ids: os jogadores completos vivem na lista que o ecrã já tem, e duplicá-los
// aqui era arranjar maneira de os dois ficarem diferentes.

import { FORMACOES } from './formacoes.js'
import { comEstatisticas, repartirEquilibrado } from './repartir.js'

export const LADOS = ['A', 'B']

// O goleiro à cabeça: é o primeiro lugar que se escolhe e o único que não é
// de campo.
export function slotsDe(tamanho = 7) {
  const formacao = FORMACOES[tamanho] || FORMACOES[7]
  return ['GK', ...formacao.slots]
}

export function estadoVazio(tamanho = 7) {
  const slots = slotsDe(tamanho)
  const lado = () => Object.fromEntries(slots.map((s) => [s, null]))
  return { A: lado(), B: lado() }
}

// Onde está um jogador, se estiver em algum lado.
export function ondeEsta(estado, id) {
  if (id == null) return null
  for (const team of LADOS) {
    for (const [slot, ocupante] of Object.entries(estado[team] || {})) {
      if (ocupante === id) return { team, slot }
    }
  }
  return null
}

export function remover(estado, id) {
  const onde = ondeEsta(estado, id)
  if (!onde) return estado
  return {
    ...estado,
    [onde.team]: { ...estado[onde.team], [onde.slot]: null },
  }
}

// Põe um jogador num lugar.
//
// Duas regras que evitam estados impossíveis:
//   - ninguém fica em dois sítios: sai de onde estava;
//   - se o lugar de destino estava ocupado, os dois TROCAM em vez de o de lá
//     desaparecer. Fazer desaparecer alguém que estava escalado é a maneira
//     mais rápida de perder o trabalho de quem estava a montar o jogo.
export function colocar(estado, { id, team, slot }) {
  if (id == null || !estado?.[team] || !(slot in estado[team])) return estado
  const origem = ondeEsta(estado, id)
  const ocupante = estado[team][slot]

  if (origem?.team === team && origem.slot === slot) return estado

  const novo = { A: { ...estado.A }, B: { ...estado.B } }
  if (origem) novo[origem.team][origem.slot] = null
  novo[team][slot] = id
  // o que lá estava vai para o lugar de onde este veio (troca), ou sai
  if (ocupante != null && ocupante !== id && origem) {
    novo[origem.team][origem.slot] = ocupante
  }
  return novo
}

// Troca dois jogadores de lugar, venham de onde vierem.
export function trocar(estado, idA, idB) {
  const a = ondeEsta(estado, idA)
  const b = ondeEsta(estado, idB)
  if (!a || !b || idA === idB) return estado
  const novo = { A: { ...estado.A }, B: { ...estado.B } }
  novo[a.team][a.slot] = idB
  novo[b.team][b.slot] = idA
  return novo
}

export function idsEmCampo(estado) {
  return LADOS.flatMap((t) => Object.values(estado?.[t] || {})).filter((v) => v != null)
}

export function contagem(estado) {
  const conta = (t) => Object.values(estado?.[t] || {}).filter((v) => v != null).length
  return { A: conta('A'), B: conta('B') }
}

// Prontas = os dois lados com todos os lugares preenchidos. Sem isto o
// simulador dava um jogo de seis contra sete e ninguém percebia porquê.
export function completo(estado, tamanho = 7) {
  const n = slotsDe(tamanho).length
  const c = contagem(estado)
  return c.A === n && c.B === n
}

// O lineup de um lado, no formato que o motor de simulação quer.
export function lineupDe(estado, team, jogadores) {
  const porId = new Map((jogadores || []).map((j) => [j.id, j]))
  return Object.entries(estado?.[team] || {})
    .filter(([, id]) => id != null && porId.has(id))
    .map(([slot, id]) => ({ ...porId.get(id), slot }))
}

// Sugere duas equipas equilibradas a partir de uma lista.
//
// Reutiliza o `repartirEquilibrado` — o mesmo que as Curiosidades usam e o
// mesmo algoritmo do sorteio oficial, incluindo a escolha entre goleiros fixos
// e rodízio. Quem monta à mão pode partir daqui e mexer.
export function sugerirEquipas({ jogadores, tamanho = 7, seed = 'simulador' } = {}) {
  const r = repartirEquilibrado({ jogadores, tamanho, seed })
  if (!r.ok) return { ok: false, motivo: r.motivo }

  const estado = estadoVazio(tamanho)
  const aplicar = (team, lista) => {
    for (const j of comEstatisticas(lista, r.usados)) {
      if (j.slot && estado[team] && j.slot in estado[team]) estado[team][j.slot] = j.id
    }
  }
  aplicar('A', r.sorteio.teamA.jogadores)
  aplicar('B', r.sorteio.teamB.jogadores)

  return { ok: true, estado, gkMode: r.gkMode }
}
