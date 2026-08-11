// O campeonatinho imaginário da pelada.
//
// Pega no plantel, reparte-o em quatro equipas equilibradas, joga um
// todos-contra-todos e uma final entre os dois primeiros. Não decide nada e não
// toca em nada gravado — é conversa de balneário com números por trás.
//
// Porquê todos-contra-todos e não só meias-finais: com quatro equipas são seis
// jogos em vez de três, dá uma CLASSIFICAÇÃO (que é metade da graça) e ninguém
// é eliminado no primeiro jogo por causa de uma zebra.
//
// Reutiliza tudo o que já existe:
//   - `sorteioRapido` reparte N equipas equilibradas (o mesmo do admin);
//   - `escalarEquipasFixas` decide quem vai à baliza e quem joga onde DENTRO de
//     cada equipa já formada — e já trata o caso de não haver goleiro
//     registado, que é o desta pelada, com a régua do rodízio;
//   - `simularPartida` joga cada jogo.

import { escalarEquipasFixas, sorteioRapido } from './drawEngine.js'
import { FORMACOES } from './formacoes.js'
import { comEstatisticas } from './repartir.js'
import { baralhar, criarRandom } from './seed.js'
import { simularPartida } from './simulador.js'

// Nomes e cores das equipas. Os dois primeiros são os de sempre da pelada.
export const EQUIPAS = [
  { id: 'PRETOS', nome: 'Pretos', cor: '#8A96A0' },
  { id: 'BRANCOS', nome: 'Brancos', cor: '#F2F5F2' },
  { id: 'AZUIS', nome: 'Azuis', cor: '#35A7FF' },
  { id: 'VERMELHOS', nome: 'Vermelhos', cor: '#FF5A5A' },
]

const PONTOS = { vitoria: 3, empate: 1 }

const num = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// A mesma regra da seleção e das curiosidades: só entra quem tem overall a
// sério.
const elegivel = (j) => j && num(j.overall) != null && j.provisorio !== true

// Todos contra todos, em pares.
function calendario(n) {
  const jogos = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) jogos.push([a, b])
  }
  return jogos
}

// Joga um jogo entre duas equipas já formadas.
//
// `escalarEquipasFixas` é que decide quem vai à baliza e quem joga onde: a
// COMPOSIÇÃO das equipas não se toca, senão o campeonato deixava de ser entre
// as mesmas quatro equipas de jogo para jogo.
function jogar({ equipaA, equipaB, seed, rodada }) {
  const escalacao = escalarEquipasFixas({
    equipas: [equipaA.jogadores, equipaB.jogadores],
    seed: `${seed}-${rodada}`,
  })
  const originais = [...equipaA.originais, ...equipaB.originais]
  const lineupA = comEstatisticas(escalacao.teamA.jogadores, originais)
  const lineupB = comEstatisticas(escalacao.teamB.jogadores, originais)

  const s = simularPartida({
    equipaA: lineupA,
    equipaB: lineupB,
    seed: `${seed}-${rodada}`,
    nomeA: equipaA.nome,
    nomeB: equipaB.nome,
  })

  return {
    rodada,
    equipaA: equipaA.id,
    equipaB: equipaB.id,
    nomeA: equipaA.nome,
    nomeB: equipaB.nome,
    golosA: s.golosA,
    golosB: s.golosB,
    craque: s.craque,
    bagre: s.bagre,
    marcadores: s.marcadores,
    assistencias: s.assistencias,
    probabilidades: s.probabilidades,
    narrativa: s.narrativa,
  }
}

// A tabela. Ordena por pontos, depois saldo, depois golos marcados — e por fim
// pelo nome, para a ordem não depender da ordem de entrada.
function classificar(equipas, jogos) {
  const linha = new Map(
    equipas.map((e) => [
      e.id,
      { id: e.id, nome: e.nome, cor: e.cor, j: 0, v: 0, e: 0, d: 0, gm: 0, gs: 0, pts: 0 },
    ])
  )

  for (const jogo of jogos) {
    const a = linha.get(jogo.equipaA)
    const b = linha.get(jogo.equipaB)
    if (!a || !b) continue
    a.j++
    b.j++
    a.gm += jogo.golosA
    a.gs += jogo.golosB
    b.gm += jogo.golosB
    b.gs += jogo.golosA
    if (jogo.golosA > jogo.golosB) {
      a.v++
      b.d++
      a.pts += PONTOS.vitoria
    } else if (jogo.golosB > jogo.golosA) {
      b.v++
      a.d++
      b.pts += PONTOS.vitoria
    } else {
      a.e++
      b.e++
      a.pts += PONTOS.empate
      b.pts += PONTOS.empate
    }
  }

  return [...linha.values()].sort(
    (x, y) =>
      y.pts - x.pts ||
      y.gm - y.gs - (x.gm - x.gs) ||
      y.gm - x.gm ||
      x.nome.localeCompare(y.nome, 'pt')
  )
}

// Quem se destacou no campeonato inteiro. Tudo somado dos jogos — nada aqui é
// inventado, e uma categoria sem dados não aparece.
function premios(jogos, porId) {
  const gols = new Map()
  const assists = new Map()
  const craques = new Map()

  const somar = (mapa, id, n = 1) => mapa.set(id, (mapa.get(id) || 0) + n)

  for (const jogo of jogos) {
    for (const lado of ['a', 'b']) {
      for (const m of jogo.marcadores[lado]) somar(gols, m.id, m.total)
      for (const m of jogo.assistencias[lado]) somar(assists, m.id, m.total)
    }
    if (jogo.craque) somar(craques, jogo.craque.id)
  }

  const topo = (mapa) => {
    let melhor = null
    for (const [id, total] of mapa) {
      if (!melhor || total > melhor.total) melhor = { id, total, name: porId.get(id)?.name ?? '—' }
    }
    return melhor
  }

  const artilheiro = topo(gols)
  const garcom = topo(assists)
  const craque = topo(craques)

  return {
    artilheiro,
    reiDasAssistencias: garcom,
    // "Melhor jogador" = quem foi craque em mais jogos. É diferente do
    // artilheiro de propósito: dá para o melhor jogador não ser o que mais
    // marca, e é exatamente aí que começa a discussão.
    melhorJogador: craque,
  }
}

// Monta e joga o campeonato.
//
// Devolve `{ completo: false, motivo }` quando não há gente que chegue — um
// grupo pequeno é uma situação normal, não um erro.
export function montarCampeonato({
  jogadores,
  // 'auto' e nao 4: quatro equipas de sete pedem 28 jogadores com overall
  // calculado, e este plantel tem 24 (23 de campo mais um goleiro). Com o 4
  // fixo o ecra aparecia permanentemente vazio — o mesmo erro que as
  // Curiosidades tiveram com os goleiros fixos.
  //
  // Nao se reduz o TAMANHO das equipas (6x6 caberia em 24) porque a escalacao
  // por lugares so sabe fazer 2-3-1; reduz-se o NUMERO de equipas, que e o
  // que o motor aguenta.
  nEquipas = 'auto',
  tamanho = 7,
  seed = 'campeonato',
} = {}) {
  const formacao = FORMACOES[tamanho] || FORMACOES[7]
  const porEquipa = formacao.slots.length + 1

  const lista = (Array.isArray(jogadores) ? jogadores : []).filter(elegivel)

  // Quantas equipas cabem: o maximo entre 4 e 2 que o plantel comporta.
  const nMax = Math.min(4, Math.floor(lista.length / porEquipa))
  const n = nEquipas === 'auto' ? nMax : nEquipas
  const precisos = n * porEquipa

  if (n < 2 || lista.length < precisos) {
    return {
      completo: false,
      motivo:
        `Para duas equipas de ${porEquipa} são precisos ${2 * porEquipa} jogadores com ` +
        `overall calculado, e há ${lista.length}.`,
    }
  }

  // Quem entra sai à sorte (com semente), e não por overall: um campeonato em
  // que os piores ficam sempre de fora não é um campeonato do grupo. Como a
  // semente muda em "simular outra vez", muda também quem joga.
  const random = criarRandom(seed)
  const participantes = baralhar(lista, random).slice(0, precisos)

  let rapido
  try {
    rapido = sorteioRapido({ jogadores: participantes, nEquipas: n, modo: 'equilibrado', seed })
  } catch (err) {
    return { completo: false, motivo: err?.message || 'Não foi possível montar as equipas.' }
  }

  const porId = new Map(participantes.map((j) => [j.id, j]))
  const equipas = rapido.equipas.map((e, i) => ({
    ...EQUIPAS[i % EQUIPAS.length],
    jogadores: e.jogadores,
    originais: e.jogadores.map((j) => porId.get(j.id)).filter(Boolean),
    forca: e.strength,
    media: Math.round(e.avg),
  }))

  const jogos = calendario(equipas.length).map(([a, b], i) =>
    jogar({ equipaA: equipas[a], equipaB: equipas[b], seed, rodada: i + 1 })
  )

  const tabela = classificar(equipas, jogos)

  // A final é entre os dois primeiros. Semente diferente da fase de grupos,
  // senão o jogo entre eles saía igual ao que já tinham feito.
  const finalistaA = equipas.find((e) => e.id === tabela[0].id)
  const finalistaB = equipas.find((e) => e.id === tabela[1].id)
  const final = jogar({
    equipaA: finalistaA,
    equipaB: finalistaB,
    seed: `${seed}-final`,
    rodada: 'final',
  })

  // Num empate na final não há prolongamento: ganha quem ficou melhor na fase
  // de grupos, que é a regra mais fácil de aceitar sem discussão.
  const campeao =
    final.golosA > final.golosB
      ? finalistaA
      : final.golosB > final.golosA
        ? finalistaB
        : finalistaA

  return {
    completo: true,
    equipas,
    jogos,
    tabela,
    final,
    campeao: { id: campeao.id, nome: campeao.nome, cor: campeao.cor },
    campeaoPorClassificacao: final.golosA === final.golosB,
    premios: premios([...jogos, final], porId),
    equilibrio: {
      pct: rapido.balancePct,
      rotulo: rapido.balanceLabel,
      forcas: equipas.map((e) => e.forca),
    },
    nEquipas: n,
    deFora: lista.length - precisos,
    seed,
  }
}
