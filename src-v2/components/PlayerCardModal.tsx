import { X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { computeCards, mainCard, unlockedCards, type CardInput } from '../domain/player-cards'
import { useI18n } from '../lib/i18n'
import type { PeladaPlayer } from '../lib/pelada-players'
import { CardCollection } from './PlayerCards'

/**
 * O card de um jogador, aberto a partir de onde ele aparece.
 *
 * Faltava: no campo da Seleção dava para ver o nome e o número e não dava para
 * carregar em ninguém. Um cartaz de jogadores em que os jogadores não se abrem
 * é um cartaz, não um produto.
 *
 * Os cards calculam-se sobre o plantel INTEIRO e não sobre o jogador aberto:
 * metade deles são lideranças, e ninguém sabe quem é o artilheiro olhando para
 * uma linha só.
 */
function toCardInput(player: PeladaPlayer): CardInput {
  return {
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
  }
}

export function PlayerCardModal({ player, squad, avatars, peladaName, totalRounds, onClose }: {
  player: PeladaPlayer
  squad: readonly PeladaPlayer[]
  avatars: Map<string, string>
  peladaName: string
  totalRounds?: number
  onClose: () => void
}) {
  const { t, formatNumber } = useI18n()
  const closeButton = useRef<HTMLButtonElement>(null)

  const cards = useMemo(
    () => computeCards({ rows: squad.map(toCardInput), totalRounds }).get(player.membershipId) ?? [],
    [player.membershipId, squad, totalRounds],
  )

  useEffect(() => {
    // O foco entra no diálogo; sem isto quem navega por teclado continuava na
    // página por trás e o Escape não tinha onde ser ouvido.
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stats: [string, number][] = [
    [t('ranking.gamesShort'), player.gamesPlayed],
    [t('ranking.goalsShort'), player.goals],
    [t('ranking.assistsShort'), player.assists],
    [t('ranking.savesShort'), player.saves],
  ]

  return (
    <div className="dialog-backdrop" role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="player-modal" role="dialog" aria-modal="true" aria-labelledby="player-modal-title">
        <button ref={closeButton} className="dialog-close" type="button" onClick={onClose} aria-label={t('discover.close')}>
          <X/>
        </button>
        <h2 id="player-modal-title" className="sr-only">{player.displayName}</h2>

        <CardCollection
          cards={cards.length ? cards : [mainCard(cards)].filter(Boolean) as typeof cards}
          name={player.displayName}
          overall={player.overall}
          avatar={avatars.get(player.membershipId)}
          peladaName={peladaName}
        />

        <dl className="player-modal-stats">
          {stats.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{formatNumber(value)}</dd></div>
          ))}
        </dl>

        {player.provisional && <p className="player-modal-note">{t('ranking.provisionalHint')}</p>}
        {unlockedCards(cards).length === 0 && !player.provisional && (
          <p className="player-modal-note">{t('cards.emptyBody')}</p>
        )}
      </section>
    </div>
  )
}
