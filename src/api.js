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
  VOTOFEITO: 'Já votaste no craque e no bagre desta rodada.',
  NAOJOGOU: 'Só quem jogou esta rodada pode votar.',
  PROPRIO: 'Não podes votar em ti próprio. 😄',
  IGUAL: 'O craque e o bagre não podem ser o mesmo jogador.',
  INVALIDO: 'O craque e o bagre têm de ter jogado esta rodada.',
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
  console.error('Erro Supabase não traduzido:', error)
  return new ApiError('Ocorreu um erro de ligação. Tenta novamente.', 'DESCONHECIDO')
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw traduz(error)
  return data
}

// ---------- Jogador ----------
export const register = (name, dob, photo, pin) =>
  rpc('register', { p_name: name, p_dob: dob, p_photo: photo, p_pin: pin })

export const login = (name, pin) => rpc('login', { p_name: name, p_pin: pin })

export const getPlayers = () => rpc('get_players')

export const getStats = () => rpc('get_stats')

export const submitRatings = (raterId, pin, scores) =>
  rpc('submit_ratings', { p_rater: raterId, p_pin: pin, p_scores: scores })

export const getPublishedDraw = () => rpc('get_published_draw')

// ---------- Estatísticas / rodadas ----------
export const getMatches = () => rpc('get_matches')

export const getPlayerStats = () => rpc('get_player_stats')

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

export const publishDraw = (pw, teamA, teamB) =>
  rpc('publish_draw', { p_pw: pw, p_a: teamA, p_b: teamB })

export const adminAddMatch = (pw, playedAt, stats) =>
  rpc('admin_add_match', { p_pw: pw, p_played_at: playedAt, p_stats: stats })

export const adminDeleteMatch = (pw, id) =>
  rpc('admin_delete_match', { p_pw: pw, p_id: id })
