import { supabase } from './supabaseClient'

// Códigos de erro lançados pelas funções do Postgres → mensagens em português.
const ERROS = {
  PENDENTE: 'A tua conta ainda não foi aprovada pelo admin.',
  JAVOTOU: 'Já submeteste as tuas avaliações — só se avalia uma vez.',
  EXISTE: 'Já existe um jogador com esse nome.',
  CRED: 'Nome ou PIN incorretos.',
  ADMIN: 'Senha de admin incorreta.',
  SCORE: 'As notas têm de estar entre 0 e 5.',
  SCOREDECIMAL: 'A nota tem de ser um número entre 0 e 5 (por exemplo 3.7).',
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
  // desistências e trocas
  SEMLINEUP: 'Esse jogador não está na escalação deste jogo.',
  JAESCALADO: 'Esse jogador já está escalado neste jogo.',
  MESMOJOGADOR: 'Quem sai e quem entra não podem ser o mesmo jogador.',
  SUBTROCADA: 'Já houve outra troca neste lugar — desfaz primeiro a mais recente.',
  APELIDO: 'O apelido tem de ter no máximo 18 caracteres.',
  MESMAEQUIPA: 'Os dois jogadores estão na mesma equipa — a troca é entre equipas.',
  TROCAGK: 'Um goleiro só pode trocar com o outro goleiro.',
  JOGOMEXIDO: 'A escalação mudou entretanto (outra pessoa mexeu). Recarrega e tenta outra vez.',
  // ciclo de vida do resultado (migração 0019)
  SEMRESULTADO: 'Ainda não há resultado preenchido para publicar.',
  RESPUBLICADO: 'O resultado deste jogo já está publicado.',
  JOGOCANCELADO: 'Este jogo foi cancelado — não recebe resultado.',
  // avaliação pós-jogo e elegibilidade de craque/bagre (migração 0023)
  VOTACAOFECHADA: 'A votação deste jogo ainda não abriu — falta publicar o resultado.',
  CRAQUEPERDEDOR: 'Só quem venceu o jogo pode ser craque.',
  BAGREVENCEDOR: 'Só quem perdeu o jogo pode ser bagre.',
  VERSAOANTIGA: 'Este jogo é anterior à avaliação pós-jogo — só contam os jogos novos.',
  AVFECHADA: 'A avaliação pós-jogo deste jogo está encerrada.',
  ESTRELAS: 'As estrelas têm de ser um número inteiro de 0 a 5.',
  SEMCOMPANHEIRO: 'Só podes avaliar quem jogou no teu time.',
  SEMEQUIPAS: 'Este jogo não tem equipas registadas — não dá para avaliar companheiros.',
  // formato do jogo e rodízio de goleiro (migração 0024)
  FORMATOINVALIDO: 'Esse formato de jogo não existe.',
  TAMANHOEQUIPA: 'O número de jogadores não bate certo com o formato escolhido.',
  ORDEMRODIZIO: 'A ordem do rodízio tem de cobrir todos os jogadores da equipa.',
  SEMRODIZIO: 'Este jogo não tem rodízio de goleiro.',
  // votação com prazo (migração 0025)
  PRAZOVOTACAO: 'A votação desta rodada já fechou.',
  VOTACAOREVISAO: 'Esta votação está em revisão pelo admin — aguarda o resultado final.',
  TOKENINVALIDO: 'Esta ligação expirou. Entra com o teu PIN.',
}

export class ApiError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

// Códigos do mais comprido para o mais curto.
//
// A procura é por `includes`, e há códigos que são sufixo de outros:
// `FORMATOINVALIDO` contém `INVALIDO`, `TAMANHOEQUIPA` contém `EQUIPA`. Pela
// ordem de declaração ganhava o mais curto e o admin lia uma mensagem sobre
// craques quando o problema era o formato do jogo. Ordenar por comprimento
// faz sempre ganhar o código mais específico — e resolve a classe toda, não
// só os casos de hoje.
const CODIGOS = Object.keys(ERROS).sort((a, b) => b.length - a.length)

function traduz(error) {
  const msg = error?.message || ''
  for (const codigo of CODIGOS) {
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

// ---------- Avaliação do grupo, ronda 2 (migração 0027) ----------
//
// As notas que um jogador recebeu. Antes de a ronda fechar vêm sem nome
// (só a lista de valores); depois de todos entregarem, cada nota traz
// quem a deu — foi decisão do grupo, e o momento é o que a torna honesta.
export const getRatingsReceived = (playerId) =>
  rpc('get_ratings_received', { p_id: playerId })

// Já toda a gente entregou? Alimenta o aviso "ainda anónimo".
export const avaliacoesReveladas = () => rpc('avaliacoes_reveladas')

// Progresso da ronda e quem falta (admin).
export const adminRatingsProgress = (pw) => rpc('admin_ratings_progress', { p_pw: pw })

// Abrir à força: um jogador que nunca vote não pode trancar o grupo todo.
export const adminRevealRatings = (pw) => rpc('admin_reveal_ratings', { p_pw: pw })

export const updatePhoto = (id, pin, photo) =>
  rpc('update_photo', { p_id: id, p_pin: pin, p_photo: photo })

// O jogador muda o próprio PIN (tem de provar o atual)
export const changePin = (id, pin, novo) =>
  rpc('change_pin', { p_id: id, p_pin: pin, p_new: novo })

export const getPublishedDraw = () => rpc('get_published_draw')

// ---------- Cards (migração 0022) ----------
// Só o próprio jogador escolhe o seu card e o seu apelido — daí o PIN.
// `card` a null volta ao automático (o mais raro que ele tiver).
export const setMyPrimaryCard = (id, pin, card) =>
  rpc('set_my_primary_card', { p_id: id, p_pin: pin, p_card: card || null })

export const setMyNickname = (id, pin, nickname) =>
  rpc('set_my_nickname', { p_id: id, p_pin: pin, p_nickname: nickname || null })

// Correção do admin: só LIMPA (card atribuído por engano, apelido impróprio).
export const adminClearCardChoices = (pw, playerId, { card = false, nickname = false } = {}) =>
  rpc('admin_clear_card_choices', {
    p_pw: pw,
    p_id: playerId,
    p_card: card,
    p_nickname: nickname,
  })

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

// ---------- Avaliação pós-jogo (migração 0023) ----------
// Jogos com a avaliação ABERTA em que este jogador jogou, já com os
// companheiros de equipa e as notas que ele lhes deu (para o ecrã abrir
// preenchido e ele poder corrigir enquanto a votação estiver aberta).
export const getMyPostRatings = (voterId, pin) =>
  rpc('get_my_post_ratings', { p_voter: voterId, p_pin: pin })

// ratings: [{ player_id, stars: 0..5 }] — aceita avaliações parciais.
export const submitPostMatchRatings = (voterId, pin, matchId, ratings) =>
  rpc('submit_post_match_ratings', {
    p_voter: voterId,
    p_pin: pin,
    p_match: matchId,
    p_ratings: ratings,
  })

// O admin abre, encerra ou reabre a avaliação de um jogo.
export const adminSetPostRatingStatus = (pw, matchId, aberta) =>
  rpc('admin_set_post_rating_status', { p_pw: pw, p_match: matchId, p_open: !!aberta })

// ---------- Votação da rodada (migração 0025) ----------
//
// Uma cédula só: estrelas nos companheiros + craque + bagre, numa leitura e
// num envio. `token` é o do dispositivo ("lembrar-me neste telemóvel") e
// dispensa o PIN — quando existe, `pin` vai a null.

// Tudo o que o ecrã de votação precisa, numa chamada.
export const getRoundBallot = (voterId, pin, matchId, token = null) =>
  rpc('get_round_ballot', {
    p_voter: voterId,
    p_pin: token ? null : pin,
    p_match: matchId,
    p_token: token,
  })

// Aceita votos parciais: só estrelas, só craque/bagre, ou tudo.
// ratings: [{ player_id, stars: 0..5 }]
export const submitRoundVote = (voterId, pin, matchId, v = {}, token = null) =>
  rpc('submit_round_vote', {
    p_voter: voterId,
    p_pin: token ? null : pin,
    p_match: matchId,
    p_craque: v.craqueId || null,
    p_bagre: v.bagreId || null,
    p_ratings: v.ratings || null,
    p_token: token,
  })

// Rodadas em que joguei com a votação aberta, e o que me falta em cada uma.
// Alimenta a faixa de lembrete.
export const getMyOpenVotes = (voterId, pin, token = null) =>
  rpc('get_my_open_votes', { p_voter: voterId, p_pin: token ? null : pin, p_token: token })

// ---------- Sessão por dispositivo (migração 0025) ----------
//
// O que fica guardado no telemóvel é este token, NUNCA o PIN. Autoriza ler e
// votar; trocar PIN, trocar foto e entrar no admin continuam a exigir o PIN.
export const issueDeviceToken = (id, pin, label = null) =>
  rpc('issue_device_token', { p_id: id, p_pin: pin, p_label: label })

export const loginWithDevice = (token) => rpc('login_with_device', { p_token: token })

export const revokeDevice = (token) => rpc('revoke_device', { p_token: token })

export const adminRevokeDevices = (pw, playerId) =>
  rpc('admin_revoke_devices', { p_pw: pw, p_id: playerId })

// ---------- Encerrar o jogo e gerir a votação (migração 0025) ----------
//
// `adminCloseGame` é o botão único: grava o resultado, publica-o, abre a
// votação com prazo e cria o post do feed — tudo numa transação.
export const adminCloseGame = (pw, matchId, r) =>
  rpc('admin_close_game', {
    p_pw: pw,
    p_match: matchId,
    p_score_a: r.scoreA,
    p_score_b: r.scoreB,
    p_stats: r.stats,
    p_gk_stats: r.gkStats || null,
    p_notes: r.notes || null,
    p_resenha: r.resenha || null,
    p_deadline: r.deadline || null,
  })

// Mexer no prazo, no quórum ou no estado (reabrir, pôr em revisão, fechar).
export const adminSetVoting = (pw, matchId, v = {}) =>
  rpc('admin_set_voting', {
    p_pw: pw,
    p_match: matchId,
    p_status: v.status || null,
    p_deadline: v.deadline || null,
    p_quorum: v.quorum ?? null,
  })

// Todos os números da votação para o ecrã de revisão (as estrelas só como
// médias — nem o admin vê quem deu que nota).
export const adminVotingReview = (pw, matchId) =>
  rpc('admin_voting_review', { p_pw: pw, p_match: matchId })

// Confirma o resultado final. craque/bagre a null = aceitar quem a votação
// elegeu.
export const adminFinalizeVoting = (pw, matchId, craqueId = null, bagreId = null) =>
  rpc('admin_finalize_voting', {
    p_pw: pw,
    p_match: matchId,
    p_craque: craqueId,
    p_bagre: bagreId,
  })

// ---------- Rodízio de goleiro (migração 0024) ----------
// O jogador diz se aceita ir à baliza quando o rodízio lhe calhar.
export const setMyGkRotation = (id, pin, ok) =>
  rpc('set_my_gk_rotation', { p_id: id, p_pin: pin, p_ok: !!ok })

export const adminSetGkRotation = (pw, playerId, ok) =>
  rpc('admin_set_gk_rotation', { p_pw: pw, p_id: playerId, p_ok: !!ok })

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

// `gkMode` ('FIXED' | 'ROTATING'), `teamSize` (5–8) e `rotationMinutes`
// definem o FORMATO do jogo (migração 0024). Sem eles o servidor assume o
// de sempre: goleiros fixos, 7×7.
export const adminSaveSchedule = (pw, id, m) =>
  rpc('admin_save_schedule', {
    p_pw: pw,
    p_id: id,
    p_kickoff: m.kickoffAt,
    p_location: m.location || null,
    p_map_url: m.mapUrl || null,
    p_gk_mode: m.gkMode || 'FIXED',
    p_team_size: m.teamSize || 7,
    p_gk_rotation_minutes: m.rotationMinutes || null,
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

// A resenha (opcional) segue com a publicação e vira o corpo do post no feed.
export const adminPublishMatch = (pw, matchId, resenha) =>
  rpc('admin_publish_match', { p_pw: pw, p_match: matchId, p_resenha: resenha || null })

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
// A resenha (opcional) vira o corpo do post de resultado no feed.
export const adminPublishResult = (pw, matchId, resenha) =>
  rpc('admin_publish_result', { p_pw: pw, p_match: matchId, p_resenha: resenha || null })

// ---------- Feed de publicações (migração 0020) ----------
// Mais recente primeiro; `before` (timestamptz) pagina para trás;
// `matchId` filtra as publicações de um só jogo (gestão no admin).
export const getFeed = (limit = 20, before = null, matchId = null) =>
  rpc('get_feed', { p_limit: limit, p_before: before, p_match: matchId })

export const adminUpdatePost = (pw, postId, title, body) =>
  rpc('admin_update_post', { p_pw: pw, p_post: postId, p_title: title || null, p_body: body || null })

export const adminDeletePost = (pw, postId) =>
  rpc('admin_delete_post', { p_pw: pw, p_post: postId })

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

// ---------- Desistências / substituições (migrações 0018 e 0021) ----------
// Troca quem sai por outro jogador, no mesmo lugar e na mesma equipa.
// `kind` distingue a história: 'DESISTENCIA' (não podia ir) ou 'TROCA'
// (opção do admin). `inOverall` é o overall de quem entra, calculado no
// frontend (src/lib/overall.js) e congelado na escalação.
export const adminSubstitutePlayer = (pw, matchId, outId, inId, inOverall, reason, kind = 'DESISTENCIA') =>
  rpc('admin_substitute_player', {
    p_pw: pw,
    p_match: matchId,
    p_out: outId,
    p_in: inId,
    p_in_overall: inOverall ?? null,
    p_reason: reason || null,
    p_kind: kind,
  })

// Troca dois jogadores de equipa (um de cada lado, cada um herda o lugar
// do outro). Livre e sem justificação obrigatória — mas fica na auditoria
// e no feed. Goleiro só troca com goleiro.
export const adminSwapPlayers = (pw, matchId, idA, idB, reason) =>
  rpc('admin_swap_players', {
    p_pw: pw,
    p_match: matchId,
    p_a: idA,
    p_b: idB,
    p_reason: reason || null,
  })

// Desfaz uma troca (só se ninguém mexeu naqueles dois lugares entretanto).
export const adminUndoSwap = (pw, swapId) =>
  rpc('admin_undo_swap', { p_pw: pw, p_swap: swapId })

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
