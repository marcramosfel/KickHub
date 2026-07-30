// Atributos do card, no espírito dos jogos de futebol — mas só com o que a
// pelada MEDE.
//
// A regra que manda aqui é a do pedido: **não inventar**. Um atributo sem
// dados que o sustentem devolve `null`, e o card mostra "sem dados" em vez
// de um número bonito e falso.
//
// Por isso os seis atributos não são os do FIFA. Velocidade, físico e
// desarme exigiriam registar sprints, duelos e desarmes — coisas que
// ninguém apita num sábado de manhã. Ficaram os seis que saem dos números
// que o grupo produz de facto:
//
//   Campo      ATA  gols por jogo
//              PAS  assistências por jogo
//              DEC  vezes eleito craque (o que o grupo achou decisivo)
//              REG  presença (jogos / rodadas da pelada)
//              VIT  aproveitamento (3 pontos por vitória, 1 por empate)
//              TEC  a média que o grupo lhe dá (0–5)
//
//   Goleiro    DEF  defesas por jogo
//              SEG  percentagem de defesas
//              SG   jogos sem sofrer gol
//              REG  presença
//              VIT  aproveitamento
//              TEC  a média que o grupo lhe dá
//
// Nenhum destes números é derivado de outro atributo — cada um vem da sua
// fonte, senão o card dizia a mesma coisa seis vezes.

import { PLAYER_TYPE } from './positions.js'

// Abaixo disto os rácios por jogo são ruído: dois jogos de sorte davam 99.
export const JOGOS_MINIMOS = 3
// A média do grupo só conta com votos que cheguem para ela significar algo.
export const VOTOS_MINIMOS = 3

const num = (v) => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Converte um valor bruto numa nota 0–99, com o `topo` a valer 99.
// O topo é uma âncora explícita (ver ANCORAS) e não a melhor marca do
// grupo: assim o atributo de um jogador não muda porque OUTRO melhorou.
function escala(valor, topo) {
  if (valor == null || topo <= 0) return null
  const n = Math.round((valor / topo) * 99)
  return Math.max(0, Math.min(99, n))
}

// O que vale 99 em cada atributo. Números de pelada, não de profissionais.
export const ANCORAS = {
  golosPorJogo: 1.5,
  assistenciasPorJogo: 1,
  craquesPorJogo: 0.5,
  defesasPorJogo: 8,
  jogosSemSofrerPorJogo: 0.6,
  media: 5,
}

const ATRIBUTOS_CAMPO = [
  { id: 'ATA', nome: 'Ataque', desc: 'Gols por jogo' },
  { id: 'PAS', nome: 'Passe', desc: 'Assistências por jogo' },
  { id: 'DEC', nome: 'Decisivo', desc: 'Vezes eleito craque da rodada' },
  { id: 'REG', nome: 'Regularidade', desc: 'Presença nas rodadas da pelada' },
  { id: 'VIT', nome: 'Vitórias', desc: 'Aproveitamento (3 por vitória, 1 por empate)' },
  { id: 'TEC', nome: 'Técnica', desc: 'A média que o grupo lhe dá (0–5)' },
]

const ATRIBUTOS_GOLEIRO = [
  { id: 'DEF', nome: 'Defesas', desc: 'Defesas por jogo' },
  { id: 'SEG', nome: 'Segurança', desc: 'Percentagem de defesas' },
  { id: 'SG', nome: 'Sem sofrer', desc: 'Jogos sem sofrer gol' },
  { id: 'REG', nome: 'Regularidade', desc: 'Presença nas rodadas da pelada' },
  { id: 'VIT', nome: 'Vitórias', desc: 'Aproveitamento (3 por vitória, 1 por empate)' },
  { id: 'TEC', nome: 'Técnica', desc: 'A média que o grupo lhe dá (0–5)' },
]

export const ehGoleiro = (j) =>
  j?.playerType === PLAYER_TYPE.GOALKEEPER || j?.primaryPosition === 'GK'

// Aproveitamento 0–100 a partir de vitórias/empates/derrotas conhecidas.
// Um jogador cujas rodadas não têm equipa registada (rodadas antigas) não
// tem aproveitamento — e isso é `null`, não zero.
function aproveitamentoDe(j) {
  const v = num(j?.wins)
  const e = num(j?.draws)
  const d = num(j?.losses)
  if (v == null && e == null && d == null) return null
  const jogos = (v || 0) + (e || 0) + (d || 0)
  if (!jogos) return null
  return Math.round((((v || 0) * 3 + (e || 0)) / (jogos * 3)) * 100)
}

// Os seis atributos de um jogador. `totalRodadas` é quantas rodadas a
// pelada já teve — sem isso não há presença para calcular.
export function calcularAtributos(jogador, totalRodadas = 0) {
  if (!jogador) return []
  const gk = ehGoleiro(jogador)
  const definicoes = gk ? ATRIBUTOS_GOLEIRO : ATRIBUTOS_CAMPO

  const jogos = num(jogador.matches) || 0
  const comJogos = jogos >= JOGOS_MINIMOS
  const votos = num(jogador.votes) || 0
  const media = num(jogador.avg)

  const porJogo = (total) => {
    const t = num(total)
    if (!comJogos || t == null) return null
    return t / jogos
  }

  const valores = {
    ATA: escala(porJogo(jogador.goals), ANCORAS.golosPorJogo),
    PAS: escala(porJogo(jogador.assists), ANCORAS.assistenciasPorJogo),
    DEC: escala(porJogo(jogador.craques), ANCORAS.craquesPorJogo),
    DEF: escala(porJogo(jogador.saves), ANCORAS.defesasPorJogo),
    // savePct já vem 0–100 do cálculo de overall do goleiro
    SEG: num(jogador.savePct) == null ? null : Math.round(num(jogador.savePct)),
    SG: escala(porJogo(jogador.cleanSheets), ANCORAS.jogosSemSofrerPorJogo),
    REG: totalRodadas > 0 && jogos > 0 ? Math.min(99, Math.round((jogos / totalRodadas) * 99)) : null,
    VIT: aproveitamentoDe(jogador) == null ? null : Math.min(99, aproveitamentoDe(jogador)),
    TEC: votos >= VOTOS_MINIMOS && media != null ? escala(media, ANCORAS.media) : null,
  }

  return definicoes.map((d) => ({ ...d, valor: valores[d.id] ?? null }))
}

// Quantos atributos têm mesmo dados. A UI usa isto para decidir se mostra a
// grelha ou uma frase — seis "—" seguidos não são um card, são um erro.
export const atributosComDados = (lista) => (lista || []).filter((a) => a.valor != null).length

// A nota geral do card é o overall que a app já calcula noutro sítio
// (src/lib/overall.js). Não se recalcula aqui: dois overalls diferentes na
// mesma app foi exatamente o problema que a `juntarEstatisticas` resolveu.
export const overallDoCard = (jogador) => {
  const n = num(jogador?.overall)
  return n == null ? null : Math.round(n)
}
