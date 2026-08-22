import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { computeAttributes, savePercentage } from '../domain/player-attributes'
import { computeCards, mainCard, RARITY_ACCENT, type CardKey, type Rarity } from '../domain/player-cards'
import { PlayerCardModal, type PlayerCardEntry } from '../components/PlayerCardModal'
import type { OriginRect } from '../components/PlayerCardModal/useFlip'
import { CARD_ICON, cardTitleKey } from '../components/PlayerCards'
import { useSignedAvatars } from './avatars'
import { useCurrentPelada } from './current-pelada'
import type { TranslationKey } from './i18n'
import { usePeladaPlayers, type PeladaPlayer } from './pelada-players'
import { usePeladaTotals } from './ranking'

/**
 * Abrir o card de um jogador a partir de qualquer sítio.
 *
 * É um contexto e não uma prop porque a foto de um jogador aparece no ranking,
 * no plantel, na escalação, no resultado e no campo da Seleção — passar o
 * plantel inteiro por cada um desses caminhos era carregar cinco componentes
 * com dados de que não precisam.
 *
 * O plantel é carregado uma vez aqui, e é o mesmo que alimenta o overall e as
 * conquistas. Um segundo carregamento seria um segundo sítio onde os números
 * podem divergir.
 */
type PlayerCardValue = {
  open: (membershipId: string, origin?: OriginRect) => void
  /** Puxa a foto antes de o card abrir; ele nunca deve abrir a carregá-la. */
  prefetch: (membershipId: string) => void
  /** `false` enquanto o plantel não chegou: a foto não deve fingir que abre. */
  ready: boolean
}

const PlayerCardContext = createContext<PlayerCardValue>({
  open: () => {}, prefetch: () => {}, ready: false,
})

/** Todas as conquistas do catálogo, para as bloqueadas aparecerem a cinzento. */
const CATALOGUE: CardKey[] = [
  'kingOfPelada', 'keeperKing', 'legend',
  'topScorer', 'topAssists', 'mostWins', 'mostCraques', 'mostGames',
  'winStreak', 'accuracy', 'unbeaten', 'wall', 'saves',
  'unbeaten5', 'winStreak4', 'playmaker10', 'cleanSheets3', 'everPresent', 'joker',
]

/** A posição que o card mostra. O plantel guarda linhas, não lugares nomeados. */
const POSITION_LABEL: Record<string, string> = {
  GK: 'GOL', DEF: 'DEF', MID: 'MEI', ATT: 'ATA',
}

function toEntry(
  player: PeladaPlayer,
  cards: readonly ReturnType<typeof mainCard>[],
  photo: string | undefined,
  totalRounds: number,
): PlayerCardEntry {
  const list = cards.filter(Boolean) as NonNullable<ReturnType<typeof mainCard>>[]
  const featured = list[0] ?? null
  const rarity: Rarity = featured?.rarity ?? 'common'
  const keeper = player.playerType === 'GOALKEEPER' || player.primaryPosition === 'GK'

  return {
    card: {
      id: player.membershipId,
      name: player.displayName,
      photo: photo ?? null,
      position: POSITION_LABEL[player.primaryPosition ?? ''] ?? (keeper ? 'GOL' : 'MEI'),
      overall: player.overall,
      provisional: player.provisional,
      rarity,
      titleKey: featured && featured.key !== 'base' ? cardTitleKey(featured.key) : null,
      icon: featured ? CARD_ICON[featured.key] : null,
      attributes: computeAttributes({
        playerType: player.playerType,
        primaryPosition: player.primaryPosition,
        gamesPlayed: player.gamesPlayed,
        goals: player.goals,
        assists: player.assists,
        craques: player.craques,
        saves: player.saves,
        wins: player.wins,
        draws: player.draws,
        losses: player.losses,
        gkCleanSheets: player.gkCleanSheets,
        gkSaves: player.saves,
        gkConceded: player.concededPerMatch === null
          ? 0
          : Math.round(player.concededPerMatch * player.gamesPlayed),
        postRatingAvg: player.postRatingAvg,
        postRatingCount: player.postRatingCount,
      }, totalRounds),
    },
    stats: {
      gamesPlayed: player.gamesPlayed,
      goals: player.goals,
      assists: player.assists,
      craques: player.craques,
      bagres: player.bagres,
      wins: player.wins,
      draws: player.draws,
      losses: player.losses,
      saves: keeper ? player.saves : null,
      goalsConceded: player.concededPerMatch === null
        ? null
        : Math.round(player.concededPerMatch * player.gamesPlayed),
      cleanSheets: keeper ? player.gkCleanSheets : null,
      savePercentage: keeper
        ? savePercentage({
          gkSaves: player.saves,
          gkConceded: player.concededPerMatch === null
            ? 0
            : Math.round(player.concededPerMatch * player.gamesPlayed),
        })
        : null,
      groupRating: player.overall,
      postRating: player.postRatingAvg,
    },
    // Sem parcelas a secção some. É a regra de §8.2: não inventar decomposição.
    breakdown: player.overallParts.map((part) => ({
      key: part.key, value: part.value, weight: part.weight,
    })),
    achievements: list,
    locked: CATALOGUE.map((key) => ({
      key,
      icon: CARD_ICON[key],
      label: cardTitleKey(key) as TranslationKey,
    })),
  }
}

export function PlayerCardProvider({ children }: { children: ReactNode }) {
  const { pelada } = useCurrentPelada()
  const { players, avatarSources } = usePeladaPlayers(pelada?.id)
  const totals = usePeladaTotals(pelada?.id, true)
  const avatars = useSignedAvatars(avatarSources)
  const [openId, setOpenId] = useState<string | null>(null)
  const [origin, setOrigin] = useState<OriginRect | null>(null)

  const cardsByMember = useMemo(() => computeCards({
    rows: players.map((player) => ({
      membershipId: player.membershipId,
      displayName: player.displayName,
      playerType: player.playerType,
      primaryPosition: player.primaryPosition,
      secondaryPosition: player.secondaryPosition,
      acceptsOtherPositions: player.acceptsOtherPositions,
      overall: player.overall,
      provisional: player.provisional,
      titles: player.titles,
      gamesPlayed: player.gamesPlayed,
      goals: player.goals,
      assists: player.assists,
      wins: player.wins,
      saves: player.saves,
      craques: player.craques,
      currentWinStreak: player.currentWinStreak,
      bestUnbeatenStreak: player.bestUnbeatenStreak,
      gkCleanSheets: player.gkCleanSheets,
    })),
    totalRounds: totals.data?.gamesPlayed,
  }), [players, totals.data?.gamesPlayed])

  // As setas ‹ › percorrem a lista pela ordem em que ela é mostrada.
  const entries = useMemo(
    () => players.map((player) => toEntry(
      player,
      cardsByMember.get(player.membershipId) ?? [],
      avatars.get(player.membershipId),
      totals.data?.gamesPlayed ?? 0,
    )),
    [avatars, cardsByMember, players, totals.data?.gamesPlayed],
  )

  const value = useMemo<PlayerCardValue>(() => ({
    open: (membershipId: string, from?: OriginRect) => {
      setOrigin(from ?? null)
      setOpenId(membershipId)
    },
    prefetch: (membershipId: string) => {
      const url = avatars.get(membershipId)
      // Descarregar a foto ao passar por cima: o card não deve abrir com ela
      // ainda a chegar. O browser guarda-a e a abertura já a encontra.
      if (url) { const image = new Image(); image.src = url }
    },
    ready: players.length > 0,
  }), [avatars, players.length])

  // Estáveis: um modal não deve remontar efeitos por causa de quem o monta.
  const close = useCallback(() => { setOpenId(null); setOrigin(null) }, [])
  const goTo = useCallback((next: number) => {
    setOpenId(entries[next]?.card.id ?? null)
  }, [entries])

  const index = openId ? entries.findIndex((entry) => entry.card.id === openId) : -1

  return (
    <PlayerCardContext.Provider value={value}>
      {children}
      {index >= 0 && (
        <PlayerCardModal
          entries={entries}
          index={index}
          origin={origin}
          onIndex={goTo}
          onClose={close}
        />
      )}
    </PlayerCardContext.Provider>
  )
}

export function usePlayerCard() {
  return useContext(PlayerCardContext)
}

export { RARITY_ACCENT }
