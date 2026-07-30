// O ciclo de vida de um jogo, num sítio só.
//
// A base de dados guarda dois eixos (`status` do jogo e `result_status` do
// resultado) porque são coisas que mudam em momentos diferentes. Mas o admin
// pensa numa linha só — "em que pé está este jogo?" — e é esta lib que faz a
// tradução. Nenhum ecrã deve voltar a comparar `status === 'PUBLISHED'` à mão.
//
//   RASCUNHO            → marcado, ainda sem equipas publicadas
//   SORTEIO_CRIADO      → rascunho já com escalação gravada
//   SORTEIO_PUBLICADO   → o grupo já vê as equipas; jogo ainda por acontecer
//   AGUARDA_RESULTADO   → a hora do jogo já passou e não há resultado
//   RESULTADO_RASCUNHO  → resultado preenchido mas invisível (não conta)
//   RESULTADO_PUBLICADO → fechado; conta nas estatísticas
//   CANCELADO           → fora das estatísticas, guardado no histórico

export const FASES = {
  RASCUNHO: 'RASCUNHO',
  SORTEIO_CRIADO: 'SORTEIO_CRIADO',
  SORTEIO_PUBLICADO: 'SORTEIO_PUBLICADO',
  AGUARDA_RESULTADO: 'AGUARDA_RESULTADO',
  RESULTADO_RASCUNHO: 'RESULTADO_RASCUNHO',
  RESULTADO_PUBLICADO: 'RESULTADO_PUBLICADO',
  CANCELADO: 'CANCELADO',
}

// Ordem para linhas do tipo "passo 3 de 6" (o cancelado fica fora da régua).
export const ORDEM_DAS_FASES = [
  FASES.RASCUNHO,
  FASES.SORTEIO_CRIADO,
  FASES.SORTEIO_PUBLICADO,
  FASES.AGUARDA_RESULTADO,
  FASES.RESULTADO_RASCUNHO,
  FASES.RESULTADO_PUBLICADO,
]

// Etiqueta, ícone e tom de cada fase — a UI pinta o que está aqui.
// `tom` liga às cores do tema: ok=grass, aviso=gold, erro=error, neutro=muted.
export const ETIQUETA_DA_FASE = {
  [FASES.RASCUNHO]: { texto: 'Rascunho', icone: '📝', tom: 'neutro' },
  [FASES.SORTEIO_CRIADO]: { texto: 'Sorteio criado', icone: '🎲', tom: 'aviso' },
  [FASES.SORTEIO_PUBLICADO]: { texto: 'Sorteio publicado', icone: '📢', tom: 'ok' },
  [FASES.AGUARDA_RESULTADO]: { texto: 'Aguarda resultado', icone: '⏳', tom: 'aviso' },
  [FASES.RESULTADO_RASCUNHO]: { texto: 'Resultado em rascunho', icone: '🗒️', tom: 'aviso' },
  [FASES.RESULTADO_PUBLICADO]: { texto: 'Resultado publicado', icone: '✅', tom: 'ok' },
  [FASES.CANCELADO]: { texto: 'Cancelado', icone: '🚫', tom: 'erro' },
}

const temEscalacao = (jogo) => Array.isArray(jogo?.lineup) && jogo.lineup.length > 0

// A hora já passou? Sem kickoff não se sabe — e "não sei" nunca pode virar
// "já passou", senão um rascunho sem data aparecia como jogo em atraso.
function jaPassou(jogo, agora) {
  if (!jogo?.kickoff_at) return false
  const t = new Date(jogo.kickoff_at).getTime()
  if (Number.isNaN(t)) return false
  return t < (agora instanceof Date ? agora.getTime() : Date.now())
}

// A fase única de um jogo. `agora` é injetável para os testes não dependerem
// do relógio.
export function faseDoJogo(jogo, agora = new Date()) {
  if (!jogo) return null
  if (jogo.status === 'CANCELLED') return FASES.CANCELADO

  // O resultado manda a partir do momento em que existe: um jogo COMPLETED
  // com resultado publicado está fechado independentemente da hora.
  if (jogo.result_status === 'PUBLISHED') return FASES.RESULTADO_PUBLICADO
  if (jogo.result_status === 'DRAFT') return FASES.RESULTADO_RASCUNHO

  // Rodadas antigas (pré-0016/0019 sem backfill aplicado): COMPLETED sem
  // result_status é história fechada, não um jogo por preencher.
  if (jogo.status === 'COMPLETED' && jogo.result_status == null) return FASES.RESULTADO_PUBLICADO

  if (jogo.status === 'PUBLISHED' || jogo.status === 'IN_PROGRESS') {
    return jaPassou(jogo, agora) || jogo.status === 'IN_PROGRESS'
      ? FASES.AGUARDA_RESULTADO
      : FASES.SORTEIO_PUBLICADO
  }

  // status DRAFT (ou COMPLETED com resultado por publicar, que volta a ser
  // um jogo "aberto" para o admin)
  if (jogo.status === 'COMPLETED') return FASES.AGUARDA_RESULTADO
  return temEscalacao(jogo) ? FASES.SORTEIO_CRIADO : FASES.RASCUNHO
}

// O que o admin pode fazer a um jogo nesta fase. É a régua única dos botões:
// a página de detalhe mostra o que está aqui e nada mais.
export function acoesDoJogo(jogo, agora = new Date()) {
  const fase = faseDoJogo(jogo, agora)
  return {
    fase,
    editarAgenda: fase === FASES.RASCUNHO || fase === FASES.SORTEIO_CRIADO || fase === FASES.SORTEIO_PUBLICADO,
    sortear: fase === FASES.RASCUNHO || fase === FASES.SORTEIO_CRIADO,
    publicarSorteio: fase === FASES.SORTEIO_CRIADO,
    substituir: fase === FASES.SORTEIO_PUBLICADO || fase === FASES.AGUARDA_RESULTADO,
    preencherResultado:
      fase === FASES.SORTEIO_PUBLICADO ||
      fase === FASES.AGUARDA_RESULTADO ||
      fase === FASES.RESULTADO_RASCUNHO ||
      fase === FASES.RESULTADO_PUBLICADO, // editar é o mesmo formulário
    publicarResultado: fase === FASES.RESULTADO_RASCUNHO,
    cancelar:
      fase !== FASES.CANCELADO &&
      fase !== FASES.RESULTADO_PUBLICADO, // com resultado publicado não se cancela
    apagar: fase === FASES.RASCUNHO || fase === FASES.SORTEIO_CRIADO || fase === FASES.CANCELADO,
  }
}

// Jogos cuja hora já passou e continuam sem resultado publicado — é isto que
// alimenta o lembrete "Como terminou o jogo de quarta?".
export function jogosComResultadoPendente(jogos, agora = new Date()) {
  return (Array.isArray(jogos) ? jogos : []).filter((j) => {
    const fase = faseDoJogo(j, agora)
    return fase === FASES.AGUARDA_RESULTADO || fase === FASES.RESULTADO_RASCUNHO
  })
}

// ---------- histórico ----------
// Tradução das ações da tabela match_activity para linguagem de ecrã.
export const ACAO_LEGIVEL = {
  SORTEIO_PUBLICADO: { texto: 'Sorteio publicado', icone: '📢' },
  JOGADOR_SUBSTITUIDO: { texto: 'Jogador substituído', icone: '🔄' },
  RESULTADO_GRAVADO: { texto: 'Resultado guardado em rascunho', icone: '🗒️' },
  RESULTADO_EDITADO: { texto: 'Resultado editado', icone: '✏️' },
  RESULTADO_PUBLICADO: { texto: 'Resultado publicado', icone: '✅' },
  JOGO_CANCELADO: { texto: 'Jogo cancelado', icone: '🚫' },
  FOTO_ADICIONADA: { texto: 'Foto adicionada', icone: '📷' },
}

export function atividadeLegivel(a) {
  const base = ACAO_LEGIVEL[a?.action] || { texto: a?.action || 'Atividade', icone: '•' }
  return { ...base, detail: a?.detail || null, quando: a?.created_at || null, actor: a?.actor || 'admin' }
}
