// Troféus e sequências, calculados a partir do histórico do perfil
// (não precisa de queries extra — o histórico já vem no get_player_profile).

// Resultado de uma rodada para este jogador: 'V' | 'E' | 'D' (ou null se
// a rodada não tiver times atribuídos).
export function resultadoDe(h) {
  if (!h.team) return null
  const meu = h.team === 'A' ? Number(h.score_a || 0) : Number(h.score_b || 0)
  const dele = h.team === 'A' ? Number(h.score_b || 0) : Number(h.score_a || 0)
  if (meu > dele) return 'V'
  if (meu < dele) return 'D'
  return 'E'
}

// Sequência atual (a contar da rodada mais recente) e a melhor de sempre.
function sequencias(historico, condicao) {
  let atual = 0
  for (const h of historico) {
    if (condicao(h)) atual++
    else break
  }
  let melhor = 0
  let corrida = 0
  for (const h of historico) {
    if (condicao(h)) {
      corrida++
      melhor = Math.max(melhor, corrida)
    } else corrida = 0
  }
  return { atual, melhor }
}

export function calcularSequencias(perfil) {
  const h = perfil.history || [] // já vem da mais recente para a mais antiga
  return {
    marcando: sequencias(h, (x) => Number(x.goals) > 0),
    vitorias: sequencias(h, (x) => resultadoDe(x) === 'V'),
    participando: sequencias(h, (x) => Number(x.goals) > 0 || Number(x.assists) > 0),
  }
}

// Vitórias / empates / derrotas
export function balanco(perfil) {
  const r = { V: 0, E: 0, D: 0 }
  for (const h of perfil.history || []) {
    const res = resultadoDe(h)
    if (res) r[res]++
  }
  return r
}

// Conquistas desbloqueadas. `totalRodadas` permite a "presença perfeita".
export function calcularConquistas(perfil, totalRodadas = 0) {
  const h = perfil.history || []
  const gols = Number(perfil.goals || 0)
  const assist = Number(perfil.assists || 0)
  const jogos = Number(perfil.matches || 0)
  const craques = Number(perfil.craques || 0)
  const bagres = Number(perfil.bagres || 0)
  const media = perfil.avg == null ? null : Number(perfil.avg)
  const seq = calcularSequencias(perfil)
  const maiorNumaRodada = h.reduce((max, x) => Math.max(max, Number(x.goals) || 0), 0)

  const todas = [
    {
      id: 'hattrick',
      icon: '🎩',
      titulo: 'Hat-trick',
      desc: '3+ gols numa só rodada',
      ok: maiorNumaRodada >= 3,
      detalhe: maiorNumaRodada >= 3 ? `melhor: ${maiorNumaRodada} gols` : null,
    },
    { id: 'poker', icon: '🔥', titulo: 'Endiabrado', desc: '5+ gols numa só rodada', ok: maiorNumaRodada >= 5 },
    { id: 'gols10', icon: '⚽', titulo: 'Artilheiro', desc: '10+ gols no total', ok: gols >= 10, detalhe: `${gols} gols` },
    { id: 'gols25', icon: '💣', titulo: 'Matador', desc: '25+ gols no total', ok: gols >= 25 },
    { id: 'ass10', icon: '🅰️', titulo: 'Garçom', desc: '10+ assistências', ok: assist >= 10, detalhe: `${assist} assist.` },
    {
      id: 'craque',
      icon: '👑',
      titulo: craques >= 3 ? 'Craque em série' : 'Craque da rodada',
      desc: craques >= 3 ? '3+ vezes craque' : 'eleito craque',
      ok: craques >= 1,
      detalhe: craques > 0 ? `${craques}×` : null,
    },
    {
      id: 'bagre',
      icon: '🐟',
      titulo: bagres >= 3 ? 'Bagre lendário' : 'Bagre da rodada',
      desc: bagres >= 3 ? '3+ vezes bagre 😅' : 'eleito bagre',
      ok: bagres >= 1,
      detalhe: bagres > 0 ? `${bagres}×` : null,
    },
    {
      id: 'sequencia',
      icon: '🔥',
      titulo: 'Em brasa',
      desc: '3 rodadas seguidas a marcar',
      ok: seq.marcando.melhor >= 3,
      detalhe: seq.marcando.melhor >= 3 ? `${seq.marcando.melhor} seguidas` : null,
    },
    { id: 'presenca', icon: '🎯', titulo: 'Presença', desc: '5+ peladas jogadas', ok: jogos >= 5, detalhe: `${jogos} jogos` },
    {
      id: 'perfeita',
      icon: '🧱',
      titulo: 'Presença perfeita',
      desc: 'jogou todas as rodadas',
      ok: totalRodadas > 0 && jogos >= totalRodadas,
    },
    { id: 'nota4', icon: '⭐', titulo: 'Bola de ouro', desc: 'média 4.0 ou mais', ok: media != null && media >= 4, detalhe: media != null ? media.toFixed(2) : null },
  ]

  return {
    desbloqueadas: todas.filter((t) => t.ok),
    bloqueadas: todas.filter((t) => !t.ok),
  }
}

// Líderes do grupo (a partir do get_player_stats), para o quadro de troféus.
export function liderancas(stats) {
  const top = (campo) => {
    const lista = (stats || []).filter((p) => Number(p[campo]) > 0)
    if (!lista.length) return null
    const max = Math.max(...lista.map((p) => Number(p[campo])))
    return { valor: max, jogadores: lista.filter((p) => Number(p[campo]) === max) }
  }
  return {
    artilheiro: top('goals'),
    garcom: top('assists'),
    craque: top('craques'),
    bagre: top('bagres'),
  }
}
