// O estado ATUAL da pelada, numa coisa só.
//
// A Home mostrava tudo ao mesmo tempo: o feed, o último resultado, o último
// sorteio, os campeões da semana, os líderes de cada categoria. Metade
// falava do MESMO jogo por outras palavras — quem abria a app via cinco
// blocos e não sabia qual era o que importava.
//
// A pergunta que a Home tem de responder é uma: "o que é que aconteceu de
// último, e o que é que tenho de fazer agora?". Esta função responde-a.
//
// A ordem é por URGÊNCIA para quem está a ler, não por cronologia:
//
//   1. VOTAR      há uma votação aberta em que eu ainda não votei. É a única
//                 coisa com prazo — perde-se se não se fizer.
//   2. AVALIAR    faltam-me avaliações do grupo (só se não houver votação).
//   3. SORTEIO    as equipas do próximo jogo já estão publicadas.
//   4. AGENDADO   há jogo marcado, ainda sem equipas.
//   5. RESULTADO  o último jogo já tem resultado e não há nada por fazer.
//   6. NADA       pelada parada.
//
// O histórico não entra aqui de propósito: vive no Ranking, nas Rodadas e
// nas Estatísticas, que é onde se vai à procura dele.

export const ESTADO_PELADA = {
  VOTAR: 'VOTAR',
  AVALIAR: 'AVALIAR',
  SORTEIO: 'SORTEIO',
  AGENDADO: 'AGENDADO',
  RESULTADO: 'RESULTADO',
  NADA: 'NADA',
}

const temEquipas = (jogo) => Array.isArray(jogo?.lineup) && jogo.lineup.length > 0

export function estadoDaPelada({
  proximoJogo,
  latestMatch,
  porVotar = [],
  faltamAvaliar = 0,
} = {}) {
  if (porVotar.length > 0) {
    return {
      tipo: ESTADO_PELADA.VOTAR,
      icone: '⭐',
      titulo: 'Avalia a última partida',
      texto: 'Dá as notas dos jogadores e escolhe o teu craque e o teu bagre.',
      acao: 'Votar agora',
      matchId: porVotar[0].match_id,
      deadline: porVotar[0].deadline || null,
      urgente: true,
    }
  }

  if (faltamAvaliar > 0) {
    return {
      tipo: ESTADO_PELADA.AVALIAR,
      icone: '📝',
      titulo: `Falta avaliares ${faltamAvaliar} ${faltamAvaliar === 1 ? 'jogador' : 'jogadores'}`,
      texto: 'É a nota que equilibra os sorteios — e faz-se uma vez só.',
      acao: 'Avaliar agora',
      urgente: true,
    }
  }

  if (proximoJogo && temEquipas(proximoJogo)) {
    return {
      tipo: ESTADO_PELADA.SORTEIO,
      icone: '🎲',
      titulo: 'Sorteio publicado',
      texto: 'As equipas do próximo jogo já estão feitas.',
      acao: 'Ver sorteio',
      destino: 'next',
      urgente: false,
    }
  }

  if (proximoJogo) {
    return {
      tipo: ESTADO_PELADA.AGENDADO,
      icone: '📅',
      titulo: 'Jogo marcado',
      texto: 'Ainda sem equipas — o sorteio sai antes do jogo.',
      acao: 'Ver detalhes',
      destino: 'next',
      urgente: false,
    }
  }

  // Sem nada por fazer e sem jogo à frente, o que interessa é como acabou o
  // último. `score_a` a null é uma rodada sem placar gravado — não é notícia.
  if (latestMatch?.id && latestMatch.score_a != null) {
    return {
      tipo: ESTADO_PELADA.RESULTADO,
      icone: '🏆',
      titulo: 'Resultado publicado',
      texto: null, // o placar desenha-se, não se escreve
      acao: 'Ver resultado',
      destino: 'history',
      matchId: latestMatch.id,
      urgente: false,
    }
  }

  return {
    tipo: ESTADO_PELADA.NADA,
    icone: '⚽',
    titulo: 'Ainda não há jogo marcado',
    texto: 'Quando o admin marcar o próximo, aparece aqui.',
    acao: null,
    urgente: false,
  }
}
