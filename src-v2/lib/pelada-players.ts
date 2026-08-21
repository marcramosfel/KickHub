import { useMemo } from 'react'
import { explainSquadOverall } from '../domain/player-overall'
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
  playerType: PlayerType | null
  primaryPosition: Position | null
  secondaryPosition: Position | null
  acceptsOtherPositions: boolean
  /** O overall calculado. `null` = ninguém o sabe ainda. */
  overall: number | null
  /** O número ainda é um palpite que a própria app diz não ser de confiança. */
  provisional: boolean
  gamesPlayed: number
  goals: number
  assists: number
  craques: number
  bagres: number
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
    const statsByMember = new Map(rows.map((row) => [row.membershipId, row]))
    return (squad.data ?? []).map((member) => {
      const breakdown = overallByMember.get(member.membershipId)
      const stats = statsByMember.get(member.membershipId)
      return {
        membershipId: member.membershipId,
        displayName: member.displayName,
        playerType: member.playerType,
        primaryPosition: member.primaryPosition,
        secondaryPosition: member.secondaryPosition,
        acceptsOtherPositions: member.acceptsOtherPositions,
        overall: breakdown?.overall ?? null,
        provisional: breakdown?.provisional ?? true,
        gamesPlayed: stats?.gamesPlayed ?? 0,
        goals: stats?.goals ?? 0,
        assists: stats?.assists ?? 0,
        craques: stats?.craques ?? 0,
        bagres: stats?.bagres ?? 0,
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
