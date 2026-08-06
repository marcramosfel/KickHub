// O estado da votação de uma rodada, num sítio só.
//
// Mesma ideia do `lifecycle.js` para o ciclo de vida do jogo: a base guarda
// `voting_status` e `voting_deadline`, e nenhum ecrã deve andar a comparar
// strings à mão nem a fazer contas de datas dentro do render.
//
//   NONE    → o jogo ainda não foi encerrado; não há nada para votar
//   OPEN    → a votação está a decorrer (com prazo)
//   REVIEW  → o prazo passou sem quórum, ou houve empate: decide o admin
//   CLOSED  → fechada; craque e bagre congelados, estatísticas contam

import { TIMEZONE } from './countdown.js'

export const VOTACAO = {
  NONE: 'NONE',
  OPEN: 'OPEN',
  REVIEW: 'REVIEW',
  CLOSED: 'CLOSED',
}

export const ETIQUETA_DA_VOTACAO = {
  [VOTACAO.NONE]: { texto: 'Por abrir', icone: '⚪', tom: 'neutro' },
  [VOTACAO.OPEN]: { texto: 'A decorrer', icone: '🟢', tom: 'ok' },
  [VOTACAO.REVIEW]: { texto: 'Revisão do admin', icone: '⚠️', tom: 'aviso' },
  [VOTACAO.CLOSED]: { texto: 'Fechada', icone: '🔒', tom: 'neutro' },
}

// Quantos dias depois do jogo fecha a votação, por omissão.
//
// O pedido era "jogo à sexta ⇒ até terça às 23:59". À letra isso só serve
// para jogos de sexta; a regra que generaliza é `+4 dias, às 23:59`, que dá
// terça para os de sexta e faz sentido para todos os outros. É a mesma conta
// que `prazo_de_votacao()` faz no servidor — as duas têm de concordar, senão
// o ecrã anuncia um prazo e a base recusa noutro.
export const DIAS_ATE_FECHAR = 4

// A partir daqui a faixa de lembrete fica em tom de aviso.
export const HORAS_URGENTE = 6

export function prazoPorOmissao(kickoffISO, dias = DIAS_ATE_FECHAR) {
  const base = kickoffISO ? new Date(kickoffISO) : new Date()
  if (Number.isNaN(base.getTime())) return null
  const d = new Date(base.getTime())
  d.setDate(d.getDate() + dias)
  d.setHours(23, 59, 0, 0)
  return d
}

// `datetime-local` (o input do admin) ↔ ISO, como no assistente do jogo.
export const prazoParaInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Quanto falta para fechar. `agora` é injetável para os testes não dependerem
// do relógio — a mesma regra do resto do projeto.
export function tempoAteFechar(deadlineISO, agora = new Date()) {
  if (!deadlineISO) return { conhecido: false, expirado: false, ms: null, texto: '' }
  const fim = new Date(deadlineISO).getTime()
  if (Number.isNaN(fim)) return { conhecido: false, expirado: false, ms: null, texto: '' }

  const ms = fim - (agora instanceof Date ? agora.getTime() : Date.now())
  if (ms <= 0) return { conhecido: true, expirado: true, ms: 0, urgente: false, texto: 'fechada' }

  const minutos = Math.floor(ms / 60000)
  const horas = Math.floor(minutos / 60)
  const dias = Math.floor(horas / 24)

  let texto
  if (dias >= 1) texto = `${dias}d ${horas % 24}h`
  else if (horas >= 1) texto = `${horas}h ${minutos % 60}min`
  else texto = `${Math.max(minutos, 1)}min`

  return { conhecido: true, expirado: false, ms, urgente: horas < HORAS_URGENTE, texto }
}

// "terça-feira, 12/08 às 23:59" — o prazo por extenso, no fuso da pelada.
export function prazoLegivel(deadlineISO) {
  if (!deadlineISO) return ''
  const d = new Date(deadlineISO)
  if (Number.isNaN(d.getTime())) return ''
  const dia = d.toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: TIMEZONE,
  })
  const hora = d.toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  })
  return `${dia} às ${hora}`
}

// O estado da votação de um jogo, já resolvido pelo prazo.
//
// O servidor é que manda (fecha sozinho na primeira leitura depois do prazo),
// mas entre a expiração e o próximo carregamento o ecrã não pode continuar a
// dizer "podes votar" — daí resolver-se também aqui.
export function estadoDaVotacao(jogo, agora = new Date()) {
  const bruto = jogo?.voting_status || VOTACAO.NONE
  const tempo = tempoAteFechar(jogo?.voting_deadline, agora)
  const estado = bruto === VOTACAO.OPEN && tempo.expirado ? VOTACAO.REVIEW : bruto
  return {
    estado,
    aberta: estado === VOTACAO.OPEN,
    emRevisao: estado === VOTACAO.REVIEW,
    fechada: estado === VOTACAO.CLOSED,
    deadline: jogo?.voting_deadline || null,
    tempo,
    etiqueta: ETIQUETA_DA_VOTACAO[estado] || ETIQUETA_DA_VOTACAO[VOTACAO.NONE],
    votantes: Number(jogo?.voting_voters ?? 0),
    total: Number(jogo?.voting_total ?? 0),
    pct: Number(jogo?.voting_pct ?? 0),
  }
}

// O que ainda falta a este jogador nesta rodada, em texto curto para a faixa.
export function faltaVotarTexto(pendencia) {
  const partes = []
  if (pendencia?.falta_premio) partes.push('craque e bagre')
  const n = Number(pendencia?.falta_estrelas || 0)
  if (n > 0) partes.push(`${n} ${n === 1 ? 'avaliação' : 'avaliações'}`)
  if (!partes.length) return ''
  return partes.join(' · ')
}

// Uma pendência conta se houver mesmo alguma coisa por fazer. Sem isto, a
// faixa aparecia a quem já tinha votado em tudo só porque a rodada continua
// aberta.
export const temPendencia = (p) =>
  Boolean(p?.falta_premio) || Number(p?.falta_estrelas || 0) > 0

export const pendenciasReais = (lista) =>
  (Array.isArray(lista) ? lista : []).filter(temPendencia)
