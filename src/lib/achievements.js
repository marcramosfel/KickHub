// Títulos e molduras da pelada.
//
// Decisão consciente: nada disto vive na base de dados. Os títulos são sempre
// derivados das estatísticas do momento, por isso é impossível ficarem
// dessincronizados — quem perder a artilharia perde a moldura na mesma hora,
// sem job nem migração. O preço é recalcular a cada ecrã, o que é barato para
// ~30 jogadores.
//
// Aqui só há dados e cálculo: nenhum JSX sai deste ficheiro.

import { PLAYER_TYPE } from './positions.js'

// Cada moldura traz `borda`, `brilho`, `fundo`, `cor` (a cor de destaque do
// título) e `corTexto` (o que fica legível por cima de `cor`). Hex de 8
// dígitos no brilho para o box-shadow ter alfa sem sair do formato.
//
// A cor NUNCA é o único sinal: todos os títulos têm ícone e texto, senão quem
// não distingue cores ficava sem perceber a diferença entre duas molduras.
export const TITULOS = [
  {
    id: 'rei-da-pelada',
    titulo: 'REI DA PELADA',
    icon: '👑',
    descricao: 'Maior overall entre os jogadores de campo',
    prioridade: 1,
    moldura: {
      borda: '#FFC531',
      brilho: '#FFC53166',
      fundo: '#123024',
      cor: '#FFC531',
      corTexto: '#0A1512',
    },
    estilo: { coroa: true, brilhoPulsante: true },
  },
  {
    id: 'paredao',
    titulo: 'PAREDÃO',
    icon: '🧤',
    descricao: 'Goleiro com maior overall',
    prioridade: 2,
    moldura: {
      borda: '#BFD3E6',
      brilho: '#7FB6FF4D',
      fundo: '#152233',
      cor: '#9FC6F0',
      corTexto: '#0A1512',
    },
    estilo: { metalico: true },
  },
  {
    id: 'artilheiro',
    titulo: 'ARTILHEIRO',
    icon: '🔥',
    descricao: 'Mais gols na pelada',
    prioridade: 3,
    moldura: {
      borda: '#FF6B35',
      brilho: '#FF6B354D',
      fundo: '#2A1410',
      cor: '#FF9E3D',
      corTexto: '#0A1512',
    },
  },
  {
    id: 'rei-assistencias',
    titulo: 'REI DAS ASSISTÊNCIAS',
    icon: '🅰️',
    descricao: 'Mais assistências na pelada',
    prioridade: 4,
    moldura: {
      borda: '#38BDF8',
      brilho: '#38BDF84D',
      fundo: '#0E2230',
      cor: '#5CD1F5',
      corTexto: '#0A1512',
    },
  },
  {
    id: 'rei-craques',
    titulo: 'REI DOS CRAQUES',
    icon: '⭐',
    descricao: 'Mais vezes eleito craque da rodada',
    prioridade: 5,
    moldura: {
      borda: '#A855F7',
      brilho: '#A855F74D',
      fundo: '#1C1030',
      cor: '#C99BFF',
      corTexto: '#0A1512',
    },
  },
  {
    id: 'rei-vitorias',
    titulo: 'REI DAS VITÓRIAS',
    icon: '🏆',
    descricao: 'Mais vitórias na pelada',
    prioridade: 6,
    moldura: {
      borda: '#34D058',
      brilho: '#34D0584D',
      fundo: '#0E2419',
      cor: '#34D058',
      corTexto: '#0A1512',
    },
  },
  {
    id: 'rei-bagres',
    titulo: 'REI DOS BAGRES',
    icon: '🐟',
    // A brincadeira é do grupo e fica pela brincadeira: moldura torta e
    // enferrujada, nunca um visual que humilhe quem a recebe.
    descricao: 'Mais vezes eleito bagre da rodada — com carinho',
    prioridade: 7,
    moldura: {
      borda: '#8A6B4F',
      brilho: '#8A6B4F40',
      fundo: '#231A12',
      cor: '#C89B6A',
      corTexto: '#0A1512',
    },
    estilo: { inclinacao: -2, enferrujada: true },
  },
]

export const TITULOS_POR_ID = Object.fromEntries(TITULOS.map((t) => [t.id, t]))

const ehGoleiro = (j) => j?.playerType === PLAYER_TYPE.GOALKEEPER

const valor = (v) => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Como se mede cada título. Fora do TITULOS de propósito: aquilo é o que a UI
// mostra, isto é o que o cálculo usa.
const METRICA = {
  'rei-da-pelada': (j) => (ehGoleiro(j) ? null : valor(j.overall ?? j.fieldOverall)),
  paredao: (j) => (ehGoleiro(j) ? valor(j.gkOverall ?? j.overall) : null),
  artilheiro: (j) => valor(j.goals),
  'rei-assistencias': (j) => valor(j.assists),
  'rei-craques': (j) => valor(j.craques),
  'rei-vitorias': (j) => valor(j.wins),
  'rei-bagres': (j) => valor(j.bagres),
}

// Lideranças de cada título: `{ [titleId]: { valor, playerIds: [] } }`.
// Um título só existe se o valor máximo for > 0 (não há artilheiro com 0 gols)
// e em caso de empate TODOS os empatados o recebem — dividir por critérios
// inventados seria pior do que assumir o empate.
export function calcularLiderancas({ jogadores } = {}) {
  const lista = (jogadores || []).filter((j) => j && j.id != null)
  const liderancas = {}

  for (const titulo of TITULOS) {
    const medir = METRICA[titulo.id]
    let melhor = null
    let ids = []

    for (const j of lista) {
      const v = medir(j)
      if (v == null || v <= 0) continue
      if (melhor == null || v > melhor) {
        melhor = v
        ids = [j.id]
      } else if (v === melhor) {
        ids.push(j.id)
      }
    }

    if (melhor != null && ids.length) liderancas[titulo.id] = { valor: melhor, playerIds: ids }
  }

  return liderancas
}

// Todos os títulos de um jogador, do mais forte para o mais fraco.
export function badgesDoJogador(playerId, liderancas) {
  if (playerId == null || !liderancas) return []
  return TITULOS.filter((t) => liderancas[t.id]?.playerIds?.includes(playerId))
    .slice()
    .sort((a, b) => a.prioridade - b.prioridade)
    .map((t) => ({ ...t, valor: liderancas[t.id].valor }))
}

// Um jogador pode acumular badges, mas só usa UMA moldura: a de maior
// prioridade. Duas molduras ao mesmo tempo tornavam o card ilegível.
export function molduraPrincipal(playerId, liderancas) {
  return badgesDoJogador(playerId, liderancas)[0] || null
}
