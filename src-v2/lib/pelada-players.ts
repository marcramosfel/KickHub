import { useMemo } from 'react'
import { computeTitles, explainSquadOverall, type OverallAdjustment, type OverallPart, type TitleKey } from '../domain/player-overall'
import { usePeladaRanking } from './ranking'
import { usePeladaSquad, type PlayerType, type Position } from './squad'

/**
 * O plantel e o ranking dizem coisas diferentes, e as duas são precisas.
 *
 * As posições e as fotos vivem no plantel; o overall só existe depois de
 * comparar toda a gente, porque os títulos dependem do plantel inteiro — não
 * há forma correcta de calcular o overall de alguém isoladamente. Quem está no
 * plantel sem linha no ranking não tem overall, e é isso que `provisional`
 * marca.
 *
 * A Seleção e as Curiosidades precisavam ambas deste cruzamento; tê-lo em dois
 * sítios era tê-lo a divergir.
 */
export type PeladaPlayer = {
  membershipId: string
  displayName: string
  /** Já não joga aqui. Um destaque tem de o dizer: apresentar alguém como
   *  artilheiro da pelada sem mencionar que saiu é apresentar mal. */
  isFormer: boolean
  playerType: PlayerType | null
  primaryPosition: Position | null
  secondaryPosition: Position | null
  acceptsOtherPositions: boolean
  /** O overall calculado. `null` = ninguém o sabe ainda. */
  overall: number | null
  /** O número ainda é um palpite que a própria app diz não ser de confiança. */
  provisional: boolean
  /** As parcelas que fizeram o overall. Vazio quando ele ainda não existe. */
  overallParts: OverallPart[]
  /** Prémios e títulos, somados depois da média. Sem isto a decomposição não
   *  fecha: o número mostrado não é a soma das parcelas que se veem. */
  overallAdjustments: OverallAdjustment[]
  /** Os títulos que o plantel lhe deu. Só existem comparando toda a gente. */
  titles: TitleKey[]
  gamesPlayed: number
  goals: number
  assists: number
  wins: number
  draws: number
  losses: number
  saves: number
  craques: number
  bagres: number
  currentWinStreak: number
  bestUnbeatenStreak: number
  gkCleanSheets: number
  /** Média das estrelas dos companheiros, 0–5. `null` = nunca foi avaliado. */
  postRatingAvg: number | null
  postRatingCount: number
  /** Golos sofridos por rodada de baliza. `null` = nunca lá esteve. */
  concededPerMatch: number | null
  avatarPath: string | null
  avatarBucket: string | null
}

export function usePeladaPlayers(peladaId: string | undefined, enabled = true) {
  const squad = usePeladaSquad(peladaId, enabled)
  const ranking = usePeladaRanking(peladaId, enabled)

  const players = useMemo<PeladaPlayer[]>(() => {
    const rows = ranking.data ?? []
    const overallByMember = explainSquadOverall(rows)
    const titlesByMember = computeTitles(rows)
    const statsByMember = new Map(rows.map((row) => [row.membershipId, row]))
    return (squad.data ?? []).map((member) => {
      const breakdown = overallByMember.get(member.membershipId)
      const stats = statsByMember.get(member.membershipId)
      return {
        membershipId: member.membershipId,
        displayName: member.displayName,
        isFormer: stats?.isFormer ?? false,
        playerType: member.playerType,
        primaryPosition: member.primaryPosition,
        secondaryPosition: member.secondaryPosition,
        acceptsOtherPositions: member.acceptsOtherPositions,
        overall: breakdown?.overall ?? null,
        provisional: breakdown?.provisional ?? true,
        overallParts: breakdown?.parts ?? [],
        overallAdjustments: breakdown?.adjustments ?? [],
        titles: titlesByMember.get(member.membershipId) ?? [],
        gamesPlayed: stats?.gamesPlayed ?? 0,
        goals: stats?.goals ?? 0,
        assists: stats?.assists ?? 0,
        wins: stats?.wins ?? 0,
        draws: stats?.draws ?? 0,
        losses: stats?.losses ?? 0,
        saves: stats?.saves ?? 0,
        craques: stats?.craques ?? 0,
        bagres: stats?.bagres ?? 0,
        currentWinStreak: stats?.currentWinStreak ?? 0,
        bestUnbeatenStreak: stats?.bestUnbeatenStreak ?? 0,
        gkCleanSheets: stats?.gkCleanSheets ?? 0,
        postRatingAvg: stats?.postRatingAvg ?? null,
        postRatingCount: stats?.postRatingCount ?? 0,
        concededPerMatch: stats && stats.gkMatches > 0 ? stats.gkConceded / stats.gkMatches : null,
        avatarPath: member.avatarPath,
        avatarBucket: member.avatarBucket,
      }
    })
  }, [ranking.data, squad.data])

  // As fotos vivem no plantel: assinar o plantel inteiro custa uma chamada.
  const avatarSources = useMemo(() => (squad.data ?? []).map((member) => ({
    id: member.membershipId, path: member.avatarPath, bucket: member.avatarBucket,
  })), [squad.data])

  return {
    players,
    avatarSources,
    isPending: squad.isPending || ranking.isPending,
    isError: squad.isError || ranking.isError,
    refetch: () => { void squad.refetch(); void ranking.refetch() },
  }
}
