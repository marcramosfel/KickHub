// Posições do futebol 7, na formação 2-3-1 que a pelada joga.
//
// Este ficheiro é o contrato partilhado entre a base de dados, o motor de
// sorteio, o campo visual e os formulários. Os `id` são os valores guardados
// em `players.primary_position` / `match_lineup.assigned_position` — não os
// mudes sem uma migração.
//
// `x` / `y` são percentagens dentro da metade do campo de uma equipa, com a
// baliza em baixo (y = 100) e o ataque em cima (y = 0). O componente do campo
// espelha estes valores para a equipa de cima.

export const GK = 'GK'

export const POSITIONS = [
  { id: 'GK', label: 'Goleiro', short: 'GOL', icon: '🧤', x: 50, y: 92 },
  { id: 'DEF-L', label: 'Defesa esquerdo', short: 'DEF-E', icon: '🛡️', x: 30, y: 72 },
  { id: 'DEF-R', label: 'Defesa direito', short: 'DEF-D', icon: '🛡️', x: 70, y: 72 },
  { id: 'MID-L', label: 'Ala esquerdo', short: 'ALA-E', icon: '🏃', x: 17, y: 45 },
  { id: 'MID-C', label: 'Meio-campo', short: 'MEIA', icon: '🎯', x: 50, y: 48 },
  { id: 'MID-R', label: 'Ala direito', short: 'ALA-D', icon: '🏃', x: 83, y: 45 },
  { id: 'ST', label: 'Atacante', short: 'ATA', icon: '⚽', x: 50, y: 20 },
]

// Os seis lugares de campo de cada equipa (o goleiro é tratado à parte).
export const FIELD_SLOTS = ['DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST']

// Todas as posições que um jogador pode escolher.
export const POSITION_IDS = POSITIONS.map((p) => p.id)

const BY_ID = new Map(POSITIONS.map((p) => [p.id, p]))

export const posicao = (id) => BY_ID.get(id) || null
export const nomeDaPosicao = (id) => BY_ID.get(id)?.label || '—'
export const siglaDaPosicao = (id) => BY_ID.get(id)?.short || '—'
export const iconeDaPosicao = (id) => BY_ID.get(id)?.icon || '❓'
export const ehPosicaoValida = (id) => BY_ID.has(id)

// Posições vizinhas: onde um jogador ainda rende sem estar na sua.
// Lê-se "quem joga a chave também se desenrasca nestes lugares".
export const COMPATIVEIS = {
  'DEF-L': ['DEF-R', 'MID-L'],
  'DEF-R': ['DEF-L', 'MID-R'],
  'MID-L': ['DEF-L', 'MID-C', 'ST'],
  'MID-R': ['DEF-R', 'MID-C', 'ST'],
  'MID-C': ['DEF-L', 'DEF-R', 'MID-L', 'MID-R'],
  ST: ['MID-L', 'MID-R', 'MID-C'],
  GK: [],
}

// Penalizações de adequação, usadas pelo custo do sorteio.
// RECUSADA é proibitiva de propósito: quem não aceita jogar noutras posições
// nunca deve acabar fora das suas duas escolhas se houver alternativa.
export const PENALIZACAO = {
  PRINCIPAL: 0,
  SECUNDARIA: 4,
  COMPATIVEL: 10,
  FORA: 25,
  RECUSADA: 1000,
}

// Quanto custa pôr este jogador neste lugar.
export function penalizacaoDe(jogador, slot) {
  if (!jogador) return PENALIZACAO.FORA
  if (jogador.primaryPosition === slot) return PENALIZACAO.PRINCIPAL
  if (jogador.secondaryPosition === slot) return PENALIZACAO.SECUNDARIA
  const vizinhas = COMPATIVEIS[jogador.primaryPosition] || []
  if (vizinhas.includes(slot)) return PENALIZACAO.COMPATIVEL
  // sem posição declarada, tudo lhe serve por igual — não é um castigo,
  // é falta de informação
  if (!jogador.primaryPosition) return PENALIZACAO.FORA
  return jogador.acceptsOther === false ? PENALIZACAO.RECUSADA : PENALIZACAO.FORA
}

// Ficou fora da posição principal? (o que o admin vê antes de publicar)
export const foraDePosicao = (jogador, slot) => jogador?.primaryPosition !== slot

// ---------- Estado de validação da posição ----------
export const POSITION_STATUS = {
  NOT_SELECTED: 'NOT_SELECTED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  ADJUSTED_BY_ADMIN: 'ADJUSTED_BY_ADMIN',
}

// Etiqueta mostrada em cada jogador na área de sorteio.
export const ETIQUETA_STATUS = {
  NOT_SELECTED: { texto: 'Sem posição', icone: '⚠️', tom: 'aviso' },
  PENDING_REVIEW: { texto: 'Escolhida pelo jogador', icone: '👤', tom: 'neutro' },
  APPROVED: { texto: 'Validada pelo admin', icone: '✅', tom: 'ok' },
  ADJUSTED_BY_ADMIN: { texto: 'Ajustada pelo admin', icone: '✏️', tom: 'info' },
}

// ---------- Tipo de jogador ----------
export const PLAYER_TYPE = { FIELD: 'FIELD', GOALKEEPER: 'GOALKEEPER' }

export const nomeDoTipo = (t) => (t === PLAYER_TYPE.GOALKEEPER ? 'Goleiro' : 'Jogador de campo')

// Normaliza uma linha de `get_players()` para o formato que o motor de
// sorteio e o campo visual esperam. Um único sítio a traduzir snake_case →
// camelCase evita que cada ecrã invente o seu.
export function jogadorDeLinha(row, overall = null) {
  return {
    id: row.id,
    name: row.name,
    photo: row.photo_url ?? row.photo ?? null,
    overall,
    playerType: row.player_type || PLAYER_TYPE.FIELD,
    primaryPosition: row.primary_position || null,
    secondaryPosition: row.secondary_position || null,
    acceptsOther: row.accepts_other_positions !== false,
    positionStatus: row.position_status || POSITION_STATUS.NOT_SELECTED,
  }
}
