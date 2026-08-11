// As Curiosidades da pelada: jogos que nunca vão acontecer, simulados como se
// fossem acontecer.
//
// Duas de saída, e a estrutura fica preparada para mais:
//
//   - O melhor jogo possível — os melhores do plantel, repartidos em duas
//     equipas EQUILIBRADAS.
//   - O Duelo dos Perebas — o mesmo, pelo outro lado da tabela.
//
// A regra que as duas partilham, e que é o ponto todo: não é "os melhores de
// um lado e os seguintes do outro". Isso dava um jogo morto e uma conversa
// curta. É pegar nos N melhores (ou nos N piores) e depois REPARTI-LOS de
// forma equilibrada, para o jogo valer a pena ser imaginado.
//
// Nada disto é sorteio a sério nem toca em nada gravado: é conversa de balneário
// com números por trás.
//
// Reutiliza o que já existe e não reimplementa nada:
//   - `sortearEquipas` (drawEngine) reparte de forma equilibrada — é o mesmo
//     algoritmo húngaro do sorteio oficial;
//   - `simularPartida` (simulador) dá o placar, os marcadores e as
//     probabilidades;
//   - a regra de elegibilidade é a mesma da `selecao.js`.

import { FORMACOES } from './formacoes.js'
import { comEstatisticas, ehGoleiro, repartirEquilibrado, requisitos } from './repartir.js'
import { simularPartida } from './simulador.js'

const num = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Mesma regra da seleção: só entra quem tem overall a sério.
//
// Nos Perebas isto não é um detalhe, é o que impede a brincadeira de ser
// injusta — sem esta linha, o duelo enchia-se de gente que chegou há duas
// semanas e ainda não foi avaliada, o que não tem piada nenhuma para elas.
const elegivel = (j) => j && num(j.overall) != null && j.provisorio !== true

const overallDe = (j) => num(j.gkOverall ?? j.overall) ?? 0

// Devolve os `n` primeiros por overall — do melhor para o pior, ou ao
// contrário.
function extremos(lista, n, melhores) {
  const ordenada = [...lista].sort((a, b) =>
    melhores ? overallDe(b) - overallDe(a) : overallDe(a) - overallDe(b)
  )
  return ordenada.slice(0, n)
}

// Monta um duelo entre os melhores (ou os piores) e simula-o.
//
// Devolve `{ completo: false, motivo }` em vez de rebentar quando não há gente
// suficiente: um grupo pequeno é uma situação normal, não um erro.
export function montarDuelo({
  jogadores,
  tamanho = 7,
  seed = 'curiosidades',
  melhores = true,
  nomeA = 'Pretos',
  nomeB = 'Brancos',
} = {}) {
  const lista = (Array.isArray(jogadores) ? jogadores : []).filter(elegivel)
  const formacao = FORMACOES[tamanho] || FORMACOES[7]
  const req = requisitos(tamanho)
  const gks = lista.filter(ehGoleiro)
  const campo = lista.filter((j) => !ehGoleiro(j))

  // Quais entram: os N melhores (ou os N piores). A escolha do MODO — goleiros
  // fixos ou rodizio — e de quem reparte, e vive no `repartir.js`.
  const modoFixo = gks.length >= req.goleirosFixos && campo.length >= req.campoFixo
  const escolhidos = modoFixo
    ? {
        goleiros: extremos(gks, req.goleirosFixos, melhores),
        campo: extremos(campo, req.campoFixo, melhores),
      }
    : { goleiros: [], campo: extremos(lista, req.rodizio, melhores) }

  const r = repartirEquilibrado({
    jogadores: [...escolhidos.goleiros, ...escolhidos.campo],
    tamanho,
    seed,
  })
  if (!r.ok) {
    return {
      completo: false,
      motivo: `Faltam jogadores com overall calculado: ${r.motivo}`,
    }
  }
  const sorteio = r.sorteio

  const originais = [...escolhidos.goleiros, ...escolhidos.campo]
  const lineupA = comEstatisticas(sorteio.teamA.jogadores, originais)
  const lineupB = comEstatisticas(sorteio.teamB.jogadores, originais)

  const simulacao = simularPartida({
    equipaA: lineupA,
    equipaB: lineupB,
    seed,
    nomeA,
    nomeB,
  })

  return {
    completo: true,
    melhores,
    lineupA,
    lineupB,
    // O equilíbrio vem do próprio sorteio (mesma medida que o admin vê no
    // sorteio oficial), para não haver duas noções de "equilibrado" na app.
    equilibrio: {
      diff: sorteio.diff,
      pct: sorteio.balancePct,
      nivel: sorteio.balanceLevel,
      rotulo: sorteio.balanceLabel,
      forcaA: sorteio.teamA.strength,
      forcaB: sorteio.teamB.strength,
    },
    simulacao,
    formacao: formacao.nome,
    // A UI diz qual foi, senão "quem é o goleiro?" fica sem resposta num
    // grupo que joga com a baliza a rodar.
    gkMode: r.gkMode,
  }
}

export const melhorJogoPossivel = (opcoes = {}) =>
  montarDuelo({ ...opcoes, melhores: true, seed: opcoes.seed ?? 'melhor-jogo' })

export const dueloDosPerebas = (opcoes = {}) =>
  montarDuelo({
    ...opcoes,
    melhores: false,
    seed: opcoes.seed ?? 'perebas',
    nomeA: opcoes.nomeA ?? 'Perebas Pretos',
    nomeB: opcoes.nomeB ?? 'Perebas Brancos',
  })

// Os números divertidos que acompanham um duelo. Saem todos de dados reais —
// se não houver dados para uma linha, a linha não sai (a regra da `resenha.js`).
export function numerosDoDuelo(duelo) {
  if (!duelo?.completo) return []
  const todos = [...duelo.lineupA, ...duelo.lineupB]
  const soma = (campo) => todos.reduce((s, j) => s + (num(j[campo]) ?? 0), 0)
  const jogos = soma('matches')

  const out = [
    { rotulo: 'Overall médio', valor: mediaOverall(todos) },
    { rotulo: 'Gols somados', valor: soma('goals') },
    { rotulo: 'Assistências', valor: soma('assists') },
  ]
  if (jogos > 0) {
    // Golos a dividir por jogos-de-jogador, não por jogos da equipa: é o que
    // cada um destes marca, em média, por jogo que faz. O rótulo diz isso —
    // "Gols por jogo" sozinho lia-se como golos da equipa e era 40× maior.
    out.push({
      rotulo: 'Gols/jogo por jogador',
      valor: (soma('goals') / jogos).toFixed(2),
    })
  }
  return out
}

function mediaOverall(lista) {
  const campo = lista.filter((j) => j.slot !== 'GK')
  if (!campo.length) return '—'
  return (campo.reduce((s, j) => s + (num(j.overall) ?? 0), 0) / campo.length).toFixed(1)
}

// O "craque improvável" e o "bagre favorito" dos Perebas: quem, dentro do
// grupo dos piores, ainda assim é o melhor — e ao contrário.
//
// A provocação é sobre o jogo e nunca sobre a pessoa, como no resto da app.
export function destaquesDoDuelo(duelo) {
  if (!duelo?.completo) return null
  const campo = [...duelo.lineupA, ...duelo.lineupB].filter((j) => j.slot !== 'GK')
  if (!campo.length) return null
  const porOverall = [...campo].sort((a, b) => (num(b.overall) ?? 0) - (num(a.overall) ?? 0))
  const porGols = [...campo].sort((a, b) => (num(b.goals) ?? 0) - (num(a.goals) ?? 0))
  return {
    maiorOverall: porOverall[0] ?? null,
    menorOverall: porOverall[porOverall.length - 1] ?? null,
    artilheiro: (num(porGols[0]?.goals) ?? 0) > 0 ? porGols[0] : null,
  }
}
