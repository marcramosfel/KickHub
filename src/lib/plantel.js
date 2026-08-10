// O estado de um jogador no plantel — e o que ele NÃO é.
//
// São dois conceitos, e o pedido foi explícito em não os misturar:
//
//   ESTADO (aqui)      é geral e dura: 🟢 disponível, ✈️ a viajar,
//                      🤕 lesionado, 🔴 indisponível. Quem o muda é o admin.
//   PRÓXIMO JOGO       é a resposta a UMA rodada, dada pelo próprio jogador
//                      ("vou" / "não vou"). Vive na tabela
//                      `match_availability` e não passa por aqui.
//
// Um 🟢 disponível pode dizer que não vai a esta sexta; um ✈️ a viajar pode
// chegar a tempo. Cruzá-los numa coluna só perdia as duas informações.

export const ESTADO = {
  DISPONIVEL: 'AVAILABLE',
  VIAGEM: 'TRAVELING',
  LESIONADO: 'INJURED',
  INDISPONIVEL: 'UNAVAILABLE',
}

export const ESTADOS = [
  { id: ESTADO.DISPONIVEL, icone: '🟢', rotulo: 'Disponível', tom: 'ok' },
  { id: ESTADO.VIAGEM, icone: '✈️', rotulo: 'A viajar', tom: 'info' },
  { id: ESTADO.LESIONADO, icone: '🤕', rotulo: 'Lesionado', tom: 'aviso' },
  { id: ESTADO.INDISPONIVEL, icone: '🔴', rotulo: 'Indisponível', tom: 'erro' },
]

const POR_ID = Object.fromEntries(ESTADOS.map((e) => [e.id, e]))

// Um estado desconhecido (ou em falta) lê-se como disponível: é o default da
// coluna e o que toda a gente era antes de isto existir.
export const etiquetaDoEstado = (id) => POR_ID[id] || ESTADOS[0]

// Só vale a pena mostrar o chip quando ele diz alguma coisa. "🟢 Disponível"
// em 30 cartões é ruído — o que interessa é quem NÃO está.
export const estadoVisivel = (id) => !!id && id !== ESTADO.DISPONIVEL

// ---------- ordem da lista de seleção ----------
// Mensalistas primeiro (pagam o mensal, têm prioridade), depois o resto do
// plantel. Dentro de cada grupo, por nome. É ORDEM, não seleção: quem escolhe
// os jogadores continua a ser o admin, e nada aqui marca ninguém.
export function ordenarPorMensalista(jogadores) {
  return [...(jogadores || [])].sort((a, b) => {
    const ma = a?.isMember ? 0 : 1
    const mb = b?.isMember ? 0 : 1
    if (ma !== mb) return ma - mb
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt', {
      sensitivity: 'base',
    })
  })
}

// Separa em dois blocos, para a lista de seleção os poder intitular.
export function separarMensalistas(jogadores) {
  const lista = ordenarPorMensalista(jogadores)
  return {
    mensalistas: lista.filter((j) => j?.isMember),
    restantes: lista.filter((j) => !j?.isMember),
  }
}

// ---------- convocatória ----------
// Índice `{ [playerId]: true|false }` a partir do `get_match_call()`. Só quem
// respondeu entra: ausência é "ainda não disse", não é um "não".
export function indiceDeRespostas(convocatoria) {
  const mapa = {}
  for (const r of convocatoria?.answers || []) {
    if (r?.player_id != null) mapa[r.player_id] = !!r.available
  }
  return mapa
}

// "Mensalistas — 12/14 disponíveis": conta quem NÃO disse que falta, porque
// silêncio de um mensalista costuma querer dizer que vem como sempre.
export function contarDisponiveis(jogadores, respostas) {
  const lista = jogadores || []
  return {
    total: lista.length,
    disponiveis: lista.filter((j) => respostas?.[j.id] !== false).length,
    confirmados: lista.filter((j) => respostas?.[j.id] === true).length,
    ausentes: lista.filter((j) => respostas?.[j.id] === false).length,
  }
}
