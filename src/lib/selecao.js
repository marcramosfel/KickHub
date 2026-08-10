// A seleção da pelada — e a anti-seleção.
//
// É uma brincadeira, e é por isso que existe: o ranking já diz quem é o
// melhor, mas ninguém discute uma tabela. Um onze montado com os melhores de
// cada posição, e outro com os piores, dá conversa a semana toda.
//
// Duas regras que a tornam honesta:
//
//   1. É POR POSIÇÃO, não os N melhores overalls. Um time com seis atacantes
//      não é o melhor time possível — e chamar-lhe isso era mentir com
//      números certos. Cada lugar da formação vai ao melhor de quem joga lá.
//   2. Só entra quem tem overall CALCULADO. Quem ainda não foi avaliado tem
//      overall provisório ou nenhum, e enchia a anti-seleção de gente nova
//      que só teve o azar de chegar há duas semanas — o que não tem piada
//      nenhuma para quem chegou há duas semanas.
//
// Tudo puro: recebe os jogadores já fundidos (`juntarEstatisticas`) e não
// chama nada. O sorteio a sério vive no `drawEngine` e não passa por aqui.

import { FORMACOES } from './formacoes.js'
import { PLAYER_TYPE } from './positions.js'

// O `v == null` primeiro não é defensivo a mais: `Number(null)` é 0, e sem
// esta linha quem ainda não tem overall entrava na anti-seleção como o pior
// de todos — precisamente o que a regra de elegibilidade quer evitar.
const num = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Elegível = tem overall a sério. `provisorio` marca quem ainda está a ser
// avaliado; deixá-lo entrar era premiá-lo ou castigá-lo por um número que a
// própria app diz não ser de confiança.
const elegivel = (j) => j && num(j.overall) != null && j.provisorio !== true

// Quem pode ocupar um lugar: primeiro quem o tem como posição principal,
// depois a secundária, e por fim quem aceita jogar noutros sítios. A ordem
// é a mesma que o sorteio a sério usa — um ala a jogar de zagueiro conta,
// mas conta depois dos zagueiros.
function candidatos(jogadores, slot) {
  const principais = jogadores.filter((j) => j.primaryPosition === slot)
  const secundarios = jogadores.filter(
    (j) => j.primaryPosition !== slot && j.secondaryPosition === slot
  )
  const restantes = jogadores.filter(
    (j) => j.primaryPosition !== slot && j.secondaryPosition !== slot && j.acceptsOther !== false
  )
  return [...principais, ...secundarios, ...restantes]
}

// `melhor` a false monta a anti-seleção: a mesma função, a escolher pelo
// outro lado. Duas funções quase iguais seriam duas para divergir.
function montar({ jogadores, slots, melhor }) {
  const disponiveis = jogadores.filter(elegivel)
  const usados = new Set()
  const escolhidos = []

  // Os lugares mais difíceis de preencher primeiro (menos gente joga lá),
  // senão um lugar com dois candidatos ficava vazio porque um deles já tinha
  // sido levado para um lugar com quinze.
  const porEscassez = [...slots].sort(
    (a, b) =>
      candidatos(disponiveis, a).filter((j) => j.primaryPosition === a).length -
      candidatos(disponiveis, b).filter((j) => j.primaryPosition === b).length
  )

  for (const slot of porEscassez) {
    const lista = candidatos(disponiveis, slot).filter((j) => !usados.has(j.id))
    if (!lista.length) continue
    const escolhido = lista.reduce((acc, j) => {
      const a = num(acc.overall)
      const b = num(j.overall)
      if (melhor) return b > a ? j : acc
      return b < a ? j : acc
    })
    usados.add(escolhido.id)
    escolhidos.push({ ...escolhido, slot })
  }

  // devolve pela ordem da formação, não pela ordem de escolha
  return slots.map((s) => escolhidos.find((e) => e.slot === s)).filter(Boolean)
}

// O goleiro tem uma escala própria (`gkOverall`) e não se compara com um
// atacante. Escolhe-se à parte, entre quem é mesmo goleiro.
function baliza(jogadores, melhor) {
  const gks = jogadores.filter(
    (j) => (j.playerType === PLAYER_TYPE.GOALKEEPER || j.primaryPosition === 'GK') && elegivel(j)
  )
  if (!gks.length) return null
  const escolhido = gks.reduce((acc, j) => {
    const a = num(acc.gkOverall ?? acc.overall)
    const b = num(j.gkOverall ?? j.overall)
    if (melhor) return b > a ? j : acc
    return b < a ? j : acc
  })
  return { ...escolhido, slot: 'GK' }
}

// A seleção (ou a anti-seleção) de uma formação.
//
// Devolve `{ lineup, forca, completa }`. `completa` a false quer dizer que
// não houve gente para todos os lugares — a UI diz isso em vez de fingir um
// onze a meio.
export function selecaoDaPelada({ jogadores, tamanho = 7, melhor = true } = {}) {
  const lista = Array.isArray(jogadores) ? jogadores : []
  const formacao = FORMACOES[tamanho] || FORMACOES[7]
  const slots = formacao.slots

  const campo = montar({
    jogadores: lista.filter(
      (j) => j.playerType !== PLAYER_TYPE.GOALKEEPER && j.primaryPosition !== 'GK'
    ),
    slots,
    melhor,
  })
  const gk = baliza(lista, melhor)

  const lineup = [...(gk ? [gk] : []), ...campo]
  // A força é a soma dos overalls de campo, como no sorteio: o goleiro tem
  // escala própria e somá-lo aqui misturava duas medidas diferentes.
  const forca = campo.reduce((s, j) => s + (num(j.overall) || 0), 0)

  return {
    lineup,
    forca,
    media: campo.length ? Math.round(forca / campo.length) : null,
    completa: campo.length === slots.length && Boolean(gk),
    formacao: formacao.nome,
  }
}

// As duas de uma vez, que é como se mostram.
export function selecoesDaPelada({ jogadores, tamanho = 7 } = {}) {
  return {
    melhor: selecaoDaPelada({ jogadores, tamanho, melhor: true }),
    pior: selecaoDaPelada({ jogadores, tamanho, melhor: false }),
  }
}
