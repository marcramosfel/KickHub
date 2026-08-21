import { useQuery } from '@tanstack/react-query'
import type { OverallPlayerType } from '../domain/player-overall'
import { isSupabaseConfigured, supabase } from './supabase'

export type RankingRow = {
  membershipId: string
  displayName: string
  gamesPlayed: number
  goals: number
  assists: number
  ownGoals: number
  saves: number
  wins: number
  draws: number
  losses: number
  /** Já não pertence à pelada, mas o que fez em campo continua a contar. */
  isFormer: boolean
  /**
   * A nota que o grupo dá ao jogador. `null` é "ainda ninguém avaliou", nunca
   * zero — a parcela sai da conta em vez de o castigar.
   */
  baseRating: number | null
  /**
   * Média das estrelas que os companheiros lhe deram, de 1 a 5. `null` = nunca
   * foi avaliado. A contagem, essa, é mesmo zero quando não há avaliações.
   */
  postRatingAvg: number | null
  postRatingCount: number
  /** Quantas vezes levou cada prémio. Zero é um facto, não uma ausência. */
  craques: number
  bagres: number
  /** Saldo acumulado acima do esperado. `null` = nenhuma rodada medida. */
  waeSaldo: number | null
  waeMatches: number
  /** Vitórias seguidas até agora. Zero é um facto. */
  currentWinStreak: number
  /** Maior sequência sem perder de sempre. É um recorde, não um estado. */
  bestUnbeatenStreak: number
  /**
   * O que a pelada o inscreveu para ser. Numa pelada de goleiros rotativos é o
   * que distingue o guarda-redes de quem apenas começou a rodada na baliza.
   */
  playerType: OverallPlayerType | null
  /** Caminho no bucket privado, ou `null` enquanto a foto nao estiver pronta. */
  avatarPath: string | null
  avatarBucket: string | null
  /** O que fez nas rodadas em que foi escalado como guarda-redes. */
  gkMatches: number
  gkSaves: number
  gkConceded: number
  gkCleanSheets: number
  /** Vitórias com ele na baliza. Um empate não é meia vitória. */
  gkWins: number
}

export type PeladaTotals = {
  gamesPlayed: number
  goals: number
  assists: number
  activeMembers: number
}

type RankingApiRow = Record<string, unknown>

const toNumber = (value: unknown) => Number(value) || 0

/** Como `toNumber`, mas preserva a ausência em vez de a converter em zero. */
const toOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const playerTypes: readonly OverallPlayerType[] = ['FIELD', 'GOALKEEPER', 'HYBRID']

/** Um valor que o servidor não reconheça vale o mesmo que nenhum. */
const toPlayerType = (value: unknown) =>
  playerTypes.includes(value as OverallPlayerType) ? value as OverallPlayerType : null

export function toRankingRow(row: RankingApiRow): RankingRow {
  return {
    membershipId: String(row.membership_id ?? ''),
    displayName: String(row.display_name ?? 'Jogador'),
    gamesPlayed: toNumber(row.games_played),
    goals: toNumber(row.goals),
    assists: toNumber(row.assists),
    ownGoals: toNumber(row.own_goals),
    saves: toNumber(row.saves),
    wins: toNumber(row.wins),
    draws: toNumber(row.draws),
    losses: toNumber(row.losses),
    isFormer: row.is_former === true,
    // Deliberadamente fora do `toNumber`: aqui `null` tem de sobreviver como
    // `null`. `Number(null) || 0` transformaria "não avaliado" em "zero".
    baseRating: toOptionalNumber(row.base_rating),
    postRatingAvg: toOptionalNumber(row.post_rating_avg),
    postRatingCount: toNumber(row.post_rating_count),
    craques: toNumber(row.craques),
    bagres: toNumber(row.bagres),
    waeSaldo: toOptionalNumber(row.wae_saldo),
    waeMatches: toNumber(row.wae_matches),
    currentWinStreak: toNumber(row.current_win_streak),
    bestUnbeatenStreak: toNumber(row.best_unbeaten_streak),
    playerType: toPlayerType(row.player_type),
    avatarPath: typeof row.avatar_path === 'string' && row.avatar_path ? row.avatar_path : null,
    avatarBucket: typeof row.avatar_bucket === 'string' && row.avatar_bucket ? row.avatar_bucket : null,
    gkMatches: toNumber(row.gk_matches),
    gkSaves: toNumber(row.gk_saves),
    gkConceded: toNumber(row.gk_conceded),
    gkCleanSheets: toNumber(row.gk_clean_sheets),
    gkWins: toNumber(row.gk_wins),
  }
}

/** Golos + assistências: o contributo direto para os golos da equipa. */
export function contribution(row: Pick<RankingRow, 'goals' | 'assists'>) {
  return row.goals + row.assists
}

/**
 * Percentagem de vitórias sobre jogos com resultado conhecido. Devolve null
 * quando não há nenhum: mostrar 0% a quem nunca teve um jogo decidido leria
 * como se tivesse perdido sempre.
 */
export function winRate(row: Pick<RankingRow, 'wins' | 'draws' | 'losses'>) {
  const decided = row.wins + row.draws + row.losses
  return decided === 0 ? null : row.wins / decided
}

export async function getPeladaRanking(peladaId: string) {
  const { data, error } = await supabase.rpc('get_pelada_ranking', { p_pelada_id: peladaId })
  if (error) throw error
  return ((data ?? []) as RankingApiRow[]).map(toRankingRow)
}

export async function getPeladaTotals(peladaId: string) {
  const { data, error } = await supabase.rpc('get_pelada_totals', { p_pelada_id: peladaId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as RankingApiRow | undefined
  if (!row) return null
  return {
    gamesPlayed: toNumber(row.games_played),
    goals: toNumber(row.goals),
    assists: toNumber(row.assists),
    activeMembers: toNumber(row.active_members),
  } satisfies PeladaTotals
}

export function usePeladaRanking(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-ranking', peladaId],
    queryFn: () => getPeladaRanking(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}

export function usePeladaTotals(peladaId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['pelada-totals', peladaId],
    queryFn: () => getPeladaTotals(peladaId!),
    enabled: Boolean(peladaId) && enabled && isSupabaseConfigured,
    staleTime: 30_000,
  })
}
