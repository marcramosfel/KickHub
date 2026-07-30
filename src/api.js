import { supabase } from './supabaseClient'

// Códigos de erro lançados pelas funções do Postgres → mensagens em português.
const ERROS = {
  PENDENTE: 'A tua conta ainda não foi aprovada pelo admin.',
  JAVOTOU: 'Já submeteste as tuas avaliações — só se avalia uma vez.',
  EXISTE: 'Já existe um jogador com esse nome.',
  CRED: 'Nome ou PIN incorretos.',
  ADMIN: 'Senha de admin incorreta.',
  SCORE: 'As notas têm de estar entre 0 e 5.',
  NOME: 'O nome é obrigatório.',
  FOTO: 'A foto é obrigatória.',
  PIN: 'O PIN tem de ter exatamente 4 dígitos.',
  DATA: 'A data do jogo é obrigatória.',
  JOGADORES: 'Marca pelo menos 3 jogadores que jogaram.',
  STATS: 'Gols e assistências têm de estar entre 0 e 99.',
  PLACAR: 'O placar tem de estar entre 0 e 99.',
  VOTOFEITO: 'Já votaste no craque e no bagre desta rodada.',
  NAOJOGOU: 'Só quem jogou esta rodada pode votar.',
  PROPRIO: 'Não podes votar em ti próprio. 😄',
  IGUAL: 'O craque e o bagre não podem ser o mesmo jogador.',
  INVALIDO: 'O craque e o bagre têm de ter jogado esta rodada.',
  AMBIGUO: 'Encontrámos mais de um jogador com esse nome. Entra com o teu ID de utilizador.',
  IDVAZIO: 'Esse ID fica vazio depois de limpo — usa letras ou números.',
  IDEXISTE: 'Esse ID já está a ser usado por outro jogador.',
  SEMJOGADOR: 'Esse jogador já não existe.',
  // posições
  POSFIXA: 'A tua posição já está definida. Fala com um administrador para a alterar.',
  POSINVALIDA: 'Essa posição não existe.',
  POSIGUAL: 'A posição secundária tem de ser diferente da principal.',
  // jogos agendados
  JOGOFECHADO: 'Este jogo já não pode ser alterado.',
  JAPUBLICADO: 'Este sorteio já foi publicado.',
  SEMESCALACAO: 'Sorteia as equipas antes de publicar.',
  POSDUPLICADA: 'Há dois jogadores no mesmo lugar da mesma equipa.',
  JOGADORDUP: 'O mesmo jogador aparece duas vezes na escalação.',
  // desistências
  SEMLINEUP: 'Esse jogador não está na escalação deste jogo.',
  JAESCALADO: 'Esse jogador já está escalado neste jogo.',
  MESMOJOGADOR: 'Quem sai e quem entra não podem ser o mesmo jogador.',
  SUBTROCADA: 'Já houve outra troca neste lugar — desfaz primeiro a mais recente.',
  // ciclo de vida do resultado (migração 0019)
  SEMRESULTADO: 'Ainda não há resultado preenchido para publicar.',
  RESPUBLICADO: 'O resultado deste jogo já está publicado.',
  JOGOCANCELADO: 'Este jogo foi cancelado — não recebe resultado.',
}

export class ApiError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

function traduz(error) {
  const msg = error?.message || ''
  for (const codigo of Object.keys(ERROS)) {
    if (msg.includes(codigo)) return new ApiError(ERROS[codigo], codigo)
  }
  // PGRST202 = a função não existe no Postgres. Na prática significa sempre a
  // mesma coisa neste projeto: falta aplicar uma migração. Dizê-lo poupa uma
  // caça ao "erro de ligação" que não é de ligação nenhuma.
  if (error?.code === 'PGRST202' || /Could not find the function/i.test(msg)) {
    return new ApiError(
      'Esta funcionalidade ainda não está ativa na base de dados — falta aplicar uma migração no Supabase.',
      'SEMMIGRACAO'
    )
  }
  console.error('Erro Supabase não traduzido:', error)
  return new ApiError('Ocorreu um erro de ligação. Tenta novamente.', 'DESCONHECIDO')
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw traduz(error)
  return data
}

// ---------- Jogador ----------
// register devolve o user_id único gerado pelo servidor.
export const register = (name, dob, photo, pin) =>
  rpc('register', { p_name: name, p_dob: dob, p_photo: photo, p_pin: pin })

// nomeOuId: aceita o nome OU o user_id único.
export const login = (nomeOuId, pin) => rpc('login', { p_name: nomeOuId, p_pin: pin })

export const getPlayers = () => rpc('get_players')

export const getStats = () => rpc('get_stats')

export const submitRatings = (raterId, pin, scores) =>
  rpc('submit_ratings', { p_rater: raterId, p_pin: pin, p_scores: scores })

// Jogadores que este avaliador ainda tem de avaliar (as suas lacunas)
export const getPendingRatings = (raterId, pin) =>
  rpc('get_pending_ratings', { p_rater: raterId, p_pin: pin })

export const updatePhoto = (id, pin, photo) =>
  rpc('update_photo', { p_id: id, p_pin: pin, p_photo: photo })

// O jogador muda o próprio PIN (tem de provar o atual)
export const changePin = (id, pin, novo) =>
  rpc('change_pin', { p_id: id, p_pin: pin, p_new: novo })

export const getPublishedDraw = () => rpc('get_published_draw')

// ---------- Estatísticas / rodadas ----------
export const getMatches = () => rpc('get_matches')

// rodada mais recente com fotos (destaque "Campeões da semana")
export const getLatestMatch = () => rpc('get_latest_match')

// uma rodada específica com fotos (ver detalhes)
export const getMatch = (id) => rpc('get_match', { p_id: id })

export const getPlayerStats = () => rpc('get_player_stats')

// Perfil completo de um jogador (médias, totais e histórico rodada a rodada)
export const getPlayerProfile = (id) => rpc('get_player_profile', { p_id: id })

// Totais filtrados por período (null/null = desde sempre)
export const getPlayerStatsRange = (de, ate) =>
  rpc('get_player_stats_range', { p_from: de, p_to: ate })

// Com quem ganha mais (mesmo time) e contra quem se dá melhor
export const getPlayerChemistry = (id) => rpc('get_player_chemistry', { p_id: id })

export const getMyAwardVotes = (voterId, pin) =>
  rpc('get_my_award_votes', { p_voter: voterId, p_pin: pin })

export const voteAward = (voterId, pin, matchId, craqueId, bagreId) =>
  rpc('vote_award', {
    p_voter: voterId,
    p_pin: pin,
    p_match: matchId,
    p_craque: craqueId,
    p_bagre: bagreId,
  })

// ---------- Admin ----------
export const adminPending = (pw) => rpc('admin_pending', { p_pw: pw })

export const adminApprove = (pw, id) => rpc('admin_approve', { p_pw: pw, p_id: id })

export const adminReject = (pw, id) => rpc('admin_reject', { p_pw: pw, p_id: id })

// Quem ainda não votou (craque/bagre da última rodada) e quem tem notas por dar
export const adminPendingVotes = (pw) => rpc('admin_pending_votes', { p_pw: pw })

// Snapshot dos dados para backup (comFotos = true fica bem maior)
export const adminExport = (pw, comFotos = false) =>
  rpc('admin_export', { p_pw: pw, p_photos: comFotos })

// ---------- Admin: gestão de IDs de utilizador ----------
export const adminUsers = (pw) => rpc('admin_users', { p_pw: pw })

export const adminRegenUserId = (pw, id) =>
  rpc('admin_regen_user_id', { p_pw: pw, p_id: id })

export const adminSetUserId = (pw, id, newId) =>
  rpc('admin_set_user_id', { p_pw: pw, p_id: id, p_new: newId })

// Define um PIN novo para quem se esqueceu do seu (não precisa do antigo)
export const adminSetPin = (pw, id, novo) =>
  rpc('admin_set_pin', { p_pw: pw, p_id: id, p_new: novo })

export const publishDraw = (pw, teamA, teamB) =>
  rpc('publish_draw', { p_pw: pw, p_a: teamA, p_b: teamB })

export const adminAddMatch = (pw, playedAt, stats) =>
  rpc('admin_add_match', { p_pw: pw, p_played_at: playedAt, p_stats: stats })

// Cria (id=null) ou edita uma rodada completa.
// stats: [{ player_id, team: 'A'|'B'|null, goals, assists }]
export const adminSaveMatch = (pw, id, m) =>
  rpc('admin_save_match', {
    p_pw: pw,
    p_id: id,
    p_played_at: m.playedAt,
    p_team_a_name: m.teamAName,
    p_team_b_name: m.teamBName,
    p_score_a: m.scoreA,
    p_score_b: m.scoreB,
    p_winner_photo: m.winnerPhoto || null,
    p_location_photo: m.locationPhoto || null,
    p_notes: m.notes || null,
    p_stats: m.stats,
  })

export const adminDeleteMatch = (pw, id) =>
  rpc('admin_delete_match', { p_pw: pw, p_id: id })

// Reiniciar avaliações — de todos, ou só de um jogador (todos reavaliam-no)
export const adminResetRatings = (pw) => rpc('admin_reset_ratings', { p_pw: pw })

export const adminResetRatingsFor = (pw, targetId) =>
  rpc('admin_reset_ratings_for', { p_pw: pw, p_target: targetId })

// ---------- Posições (migração 0015) ----------
// O jogador só pode gravar enquanto o estado for NOT_SELECTED — depois disso
// o servidor recusa (POSFIXA) e só o admin altera.
export const setMyPositions = (id, pin, primary, secondary, acceptsOther) =>
  rpc('set_my_positions', {
    p_id: id,
    p_pin: pin,
    p_primary: primary,
    p_secondary: secondary || null,
    p_accepts: acceptsOther !== false,
  })

// Marca como lido o aviso de que o admin mudou a posição
export const ackPositionNotice = (id, pin) =>
  rpc('ack_position_notice', { p_id: id, p_pin: pin })

export const adminPositionsOverview = (pw) => rpc('admin_positions_overview', { p_pw: pw })

export const adminSetPositions = (pw, playerId, m) =>
  rpc('admin_set_positions', {
    p_pw: pw,
    p_id: playerId,
    p_type: m.playerType,
    p_primary: m.primary,
    p_secondary: m.secondary || null,
    p_accepts: m.acceptsOther !== false,
    p_reason: m.reason || null,
  })

export const adminApprovePositions = (pw, playerId) =>
  rpc('admin_approve_positions', { p_pw: pw, p_id: playerId })

export const adminPositionHistory = (pw, playerId) =>
  rpc('admin_position_history', { p_pw: pw, p_id: playerId })

// ---------- Jogos agendados / próximo jogo (migração 0016) ----------
// O próximo jogo publicado, com a escalação já sorteada. Público.
export const getNextMatch = () => rpc('get_next_match')

export const adminSaveSchedule = (pw, id, m) =>
  rpc('admin_save_schedule', {
    p_pw: pw,
    p_id: id,
    p_kickoff: m.kickoffAt,
    p_location: m.location || null,
    p_map_url: m.mapUrl || null,
  })

// lineup: [{ player_id, team, assigned_position, preferred_position,
//            was_out_of_position, overall_at_draw, is_goalkeeper }]
export const adminSaveLineup = (pw, matchId, d) =>
  rpc('admin_save_lineup', {
    p_pw: pw,
    p_match: matchId,
    p_lineup: d.lineup,
    p_a_overall: d.teamAOverall,
    p_b_overall: d.teamBOverall,
    p_balance: d.balancePct,
    p_seed: d.seed || null,
  })

export const adminPublishMatch = (pw, matchId) =>
  rpc('admin_publish_match', { p_pw: pw, p_match: matchId })

export const adminMatchesUpcoming = (pw) => rpc('admin_matches_upcoming', { p_pw: pw })

export const adminSetMatchStatus = (pw, matchId, status) =>
  rpc('admin_set_match_status', { p_pw: pw, p_match: matchId, p_status: status })

// Só apaga jogos em rascunho/cancelados — rodadas já jogadas ficam protegidas
export const adminDeleteSchedule = (pw, matchId) =>
  rpc('admin_delete_schedule', { p_pw: pw, p_match: matchId })

// ---------- Ciclo de vida do resultado (migração 0019) ----------
// Grava o resultado do PRÓPRIO jogo (rascunho invisível, ou edição de um já
// publicado — as linhas são regravadas, nunca duplicadas).
// stats: [{player_id, team, goals, assists}]
// gkStats: [{goalkeeper_id, team, saves, goals_conceded}]
export const adminSaveResult = (pw, matchId, r) =>
  rpc('admin_save_result', {
    p_pw: pw,
    p_match: matchId,
    p_score_a: r.scoreA,
    p_score_b: r.scoreB,
    p_stats: r.stats,
    p_gk_stats: r.gkStats || null,
    p_notes: r.notes || null,
    p_craque: r.craqueId || null,
    p_bagre: r.bagreId || null,
  })

// Publicar é o que fecha o jogo e o faz contar nas estatísticas.
export const adminPublishResult = (pw, matchId) =>
  rpc('admin_publish_result', { p_pw: pw, p_match: matchId })

// Cancela (sai das estatísticas, fica no histórico). A dupla confirmação é
// responsabilidade da UI.
export const adminCancelMatch = (pw, matchId, reason) =>
  rpc('admin_cancel_match', { p_pw: pw, p_match: matchId, p_reason: reason || null })

// Fotos do jogo (N por jogo, uma principal)
export const adminAddMedia = (pw, matchId, kind, dataUrl, isPrimary) =>
  rpc('admin_add_media', {
    p_pw: pw,
    p_match: matchId,
    p_kind: kind || 'PHOTO',
    p_data: dataUrl,
    p_primary: !!isPrimary,
  })

export const adminSetPrimaryMedia = (pw, mediaId) =>
  rpc('admin_set_primary_media', { p_pw: pw, p_media: mediaId })

export const adminDeleteMedia = (pw, mediaId) =>
  rpc('admin_delete_media', { p_pw: pw, p_media: mediaId })

// Histórico de atividades de um jogo (auditoria)
export const adminMatchActivity = (pw, matchId) =>
  rpc('admin_match_activity', { p_pw: pw, p_match: matchId })

// ---------- Desistências / substituições (migração 0018) ----------
// Troca quem desistiu por outro jogador, no mesmo lugar e na mesma equipa.
// `inOverall` é o overall de quem entra, calculado no frontend como o do
// sorteio (a fórmula vive em src/lib/overall.js) e congelado na escalação.
// Devolve o jogo já com as forças e o equilíbrio recalculados.
export const adminSubstitutePlayer = (pw, matchId, outId, inId, inOverall, reason) =>
  rpc('admin_substitute_player', {
    p_pw: pw,
    p_match: matchId,
    p_out: outId,
    p_in: inId,
    p_in_overall: inOverall ?? null,
    p_reason: reason || null,
  })

// Desfaz uma troca (só se quem entrou ainda estiver no mesmo lugar).
export const adminUndoSubstitution = (pw, subId) =>
  rpc('admin_undo_substitution', { p_pw: pw, p_sub: subId })

// ---------- Goleiros (migração 0017) ----------
// Números crus dos goleiros + a média da pelada; o overall é calculado
// no frontend (src/lib/overall.js) para viver num só sítio.
export const getGoalkeeperStats = () => rpc('get_goalkeeper_stats')

// stats: [{ goalkeeper_id, team, saves, goals_conceded }]
export const adminSaveGkStats = (pw, matchId, stats) =>
  rpc('admin_save_gk_stats', { p_pw: pw, p_match: matchId, p_stats: stats })

export const getMatchGkStats = (matchId) => rpc('get_match_gk_stats', { p_match: matchId })
