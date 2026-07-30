// O catálogo de cards da pelada.
//
// Até aqui havia dois sistemas a viver lado a lado: `achievements.js` (as
// LIDERANÇAS — quem é o artilheiro, quem é o Rei da Pelada, com moldura) e
// `trophies.js` (os MARCOS pessoais — hat-trick, 10 gols, presença). Um card
// é a mesma ideia dos dois, com um nome só e uma raridade: alguns nascem de
// se ser o melhor do grupo, outros de se ter chegado a uma marca.
//
// Nada disto vive na base de dados, e é de propósito — a decisão vem de
// `achievements.js` e mantém-se: os cards são derivados dos números do
// momento, por isso é impossível ficarem dessincronizados. Quem perde a
// artilharia perde o card na mesma hora, sem job nem migração. O que a base
// guarda é só a ESCOLHA do jogador (qual o card principal), na 0022.
//
// Cada card diz porquê foi desbloqueado — `motivo` é texto para o jogador
// ler, não um id. Regras transparentes eram o pedido.

import { TITULOS_POR_ID } from './achievements.js'
import { PLAYER_TYPE } from './positions.js'

// ---------------------------------------------------------------- raridade
// A hierarquia pedida. `peso` ordena a coleção e decide o card por omissão.
export const RARIDADES = {
  comum: { id: 'comum', nome: 'Comum', peso: 1, cor: '#7FA090', brilho: null },
  especial: { id: 'especial', nome: 'Especial', peso: 2, cor: '#5CD1F5', brilho: '#5CD1F533' },
  raro: { id: 'raro', nome: 'Raro', peso: 3, cor: '#C99BFF', brilho: '#A855F74D' },
  epico: { id: 'epico', nome: 'Épico', peso: 4, cor: '#FF9E3D', brilho: '#FF6B354D' },
  lendario: { id: 'lendario', nome: 'Lendário', peso: 5, cor: '#FFC531', brilho: '#FFC53166' },
}

export const raridade = (id) => RARIDADES[id] || RARIDADES.comum

const num = (v) => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const val = (v) => num(v) ?? 0

// ---------------------------------------------------------------- catálogo
//
// `regra(ctx)` devolve `null` (não desbloqueado) ou `{ motivo }`. O ctx traz
// o jogador já com estatísticas (juntarEstatisticas), as lideranças do grupo
// (calcularLiderancas) e as sequências (calcularSequencias, de streaks.js).
//
// Os que vêm de liderança reaproveitam as cores e ícones de `achievements.js`
// — a moldura do Rei da Pelada é a mesma no ranking e no card.

const deLideranca = (tituloId, raridadeId) => {
  const t = TITULOS_POR_ID[tituloId]
  return {
    id: tituloId,
    titulo: t.titulo,
    icon: t.icon,
    descricao: t.descricao,
    raridade: raridadeId,
    moldura: t.moldura,
    estilo: t.estilo,
    prioridade: t.prioridade,
    regra: ({ jogador, liderancas }) => {
      const l = liderancas?.[tituloId]
      if (!l?.playerIds?.includes(jogador.id)) return null
      const partilhado = l.playerIds.length > 1
      return {
        motivo: `${t.descricao} (${l.valor})${partilhado ? ` — a dividir com mais ${l.playerIds.length - 1}` : ''}.`,
      }
    },
  }
}

// Um marco pessoal: não depende de ser o melhor, depende de lá ter chegado.
const marco = ({ id, titulo, icon, descricao, raridade: r, cor, prioridade, regra }) => ({
  id,
  titulo,
  icon,
  descricao,
  raridade: r,
  prioridade,
  moldura: {
    borda: cor,
    brilho: `${cor}4D`,
    fundo: '#0E1F18',
    cor,
    corTexto: '#0A1512',
  },
  regra,
})

export const CARDS = [
  // ---- lideranças (o melhor do grupo agora) ----
  deLideranca('rei-da-pelada', 'lendario'),
  deLideranca('paredao', 'epico'),
  deLideranca('artilheiro', 'epico'),
  deLideranca('rei-assistencias', 'raro'),
  deLideranca('rei-craques', 'raro'),
  deLideranca('rei-vitorias', 'raro'),
  deLideranca('rei-bagres', 'especial'),

  // ---- marcos: sequências (de streaks.js) ----
  marco({
    id: 'invencivel',
    titulo: 'INVENCÍVEL',
    icon: '🛡️',
    descricao: 'Está há 5 jogos ou mais sem perder',
    raridade: 'epico',
    cor: '#34D058',
    prioridade: 20,
    regra: ({ seq }) =>
      val(seq?.seqSemPerder) >= 5
        ? { motivo: `${seq.seqSemPerder} jogos seguidos sem perder — e a contar.` }
        : null,
  }),
  marco({
    id: 'rei-da-sequencia',
    titulo: 'REI DA SEQUÊNCIA',
    icon: '🔗',
    descricao: 'Maior sequência de vitórias da carreira: 4 ou mais',
    raridade: 'raro',
    cor: '#38BDF8',
    prioridade: 21,
    regra: ({ seq }) =>
      val(seq?.melhorSeqVitorias) >= 4
        ? { motivo: `Chegou a ${seq.melhorSeqVitorias} vitórias seguidas.` }
        : null,
  }),
  marco({
    id: 'homem-gol',
    titulo: 'HOMEM-GOL',
    icon: '🎯',
    descricao: 'Marcou em 3 jogos seguidos',
    raridade: 'raro',
    cor: '#FF6B35',
    prioridade: 22,
    regra: ({ seq }) =>
      val(seq?.seqMarcando) >= 3
        ? { motivo: `Marca há ${seq.seqMarcando} jogos seguidos.` }
        : null,
  }),
  marco({
    id: 'garcom',
    titulo: 'GARÇOM',
    icon: '🅰️',
    descricao: '10 assistências ou mais',
    raridade: 'especial',
    cor: '#5CD1F5',
    prioridade: 23,
    regra: ({ jogador }) =>
      val(jogador.assists) >= 10 ? { motivo: `${jogador.assists} assistências no total.` } : null,
  }),
  marco({
    id: 'muralha',
    titulo: 'MURALHA',
    icon: '🧱',
    descricao: 'Goleiro com 3 ou mais jogos sem sofrer gol',
    raridade: 'epico',
    cor: '#9FC6F0',
    prioridade: 24,
    regra: ({ jogador }) =>
      jogador.playerType === PLAYER_TYPE.GOALKEEPER && val(jogador.cleanSheets) >= 3
        ? { motivo: `${jogador.cleanSheets} jogos sem sofrer gol.` }
        : null,
  }),
  marco({
    id: 'motorzinho',
    titulo: 'MOTORZINHO',
    icon: '🔋',
    descricao: 'Presente em 80% das rodadas (mínimo 8 jogos)',
    raridade: 'especial',
    cor: '#34D058',
    prioridade: 25,
    regra: ({ jogador, totalRodadas }) => {
      const jogos = val(jogador.matches)
      if (!totalRodadas || jogos < 8) return null
      const pct = Math.round((jogos / totalRodadas) * 100)
      return pct >= 80 ? { motivo: `Jogou ${jogos} de ${totalRodadas} rodadas (${pct}%).` } : null
    },
  }),
  marco({
    id: 'coringa',
    titulo: 'CORINGA',
    icon: '🃏',
    descricao: 'Joga em duas posições e aceita qualquer outra',
    raridade: 'especial',
    cor: '#C99BFF',
    prioridade: 26,
    regra: ({ jogador }) =>
      jogador.primaryPosition && jogador.secondaryPosition && jogador.acceptsOther !== false
        ? { motivo: 'Tem posição principal e secundária, e aceita jogar noutras.' }
        : null,
  }),
  marco({
    id: 'lenda',
    titulo: 'LENDA DA PELADA',
    icon: '🏛️',
    descricao: '30+ jogos, 20+ participações em gols e 3+ vezes craque',
    raridade: 'lendario',
    cor: '#E8C87A',
    prioridade: 10,
    regra: ({ jogador }) => {
      const jogos = val(jogador.matches)
      const participacoes = val(jogador.goals) + val(jogador.assists)
      const craques = val(jogador.craques)
      return jogos >= 30 && participacoes >= 20 && craques >= 3
        ? {
            motivo: `${jogos} jogos, ${participacoes} participações em gols e ${craques} vezes craque.`,
          }
        : null
    },
  }),
]

export const CARDS_POR_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]))

// O card que toda a gente tem — sem conquista nenhuma, o jogador continua a
// ter um card. Nunca aparece na coleção a par dos outros: é o fundo.
export const CARD_BASE = {
  id: 'base',
  titulo: 'JOGADOR DA PELADA',
  icon: '⚽',
  descricao: 'O card de toda a gente',
  raridade: 'comum',
  prioridade: 999,
  moldura: {
    borda: '#1E3A2E',
    brilho: null,
    fundo: '#10201A',
    cor: '#7FA090',
    corTexto: '#0A1512',
  },
  regra: () => ({ motivo: 'Todos os jogadores da pelada têm este card.' }),
}

// ---------------------------------------------------------------- cálculo

// Ordena por raridade (mais raro primeiro) e depois pela prioridade do
// catálogo — assim dois lendários saem sempre pela mesma ordem.
const porImportancia = (a, b) =>
  raridade(b.raridade).peso - raridade(a.raridade).peso ||
  (a.prioridade ?? 500) - (b.prioridade ?? 500)

// Todos os cards que um jogador tem neste momento, do mais raro ao mais
// comum. O card base vai sempre no fim, para a coleção nunca ficar vazia.
export function cardsDoJogador({ jogador, liderancas, sequencias, totalRodadas = 0 } = {}) {
  if (!jogador?.id) return []
  const ctx = {
    jogador,
    liderancas,
    seq: sequencias?.[jogador.id] || null,
    totalRodadas,
  }
  const ganhos = []
  for (const card of CARDS) {
    let r = null
    try {
      r = card.regra(ctx)
    } catch {
      r = null // uma regra com um dado estranho não pode partir o card todo
    }
    if (r) ganhos.push({ ...card, motivo: r.motivo })
  }
  ganhos.sort(porImportancia)
  return [...ganhos, { ...CARD_BASE, motivo: CARD_BASE.regra().motivo }]
}

// O card que se mostra a toda a gente: o escolhido pelo jogador, se ele o
// tiver escolhido E ainda o tiver; senão o mais raro que tenha.
//
// A segunda metade importa: um jogador que escolheu "Artilheiro" e perdeu a
// artilharia não pode continuar a exibi-lo. A escolha fica guardada — se ele
// voltar a ser artilheiro, o card volta sozinho.
export function cardPrincipal(cards, escolhido) {
  const lista = Array.isArray(cards) ? cards : []
  if (!lista.length) return null
  if (escolhido) {
    const encontrado = lista.find((c) => c.id === escolhido)
    if (encontrado) return encontrado
  }
  return lista[0]
}

// Só faz sentido escolher entre os que se tem — e o base não é escolha, é o
// que sobra quando não há mais nada.
export const cardsEscolhiveis = (cards) => (cards || []).filter((c) => c.id !== CARD_BASE.id)
