import { useState } from 'react'
import { unlockedCards, type CardKey, type PlayerCard, type Rarity } from '../domain/player-cards'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { Avatar, Card } from './ui'
import { ShareButton } from './ShareButton'

/**
 * O card e a colecção.
 *
 * O ícone e o texto acompanham sempre a cor da raridade — a cor sozinha não
 * distingue nada para quem não a separa, e é por isso que cada card tem também
 * o seu emblema e o nome da raridade escrito.
 */
export const CARD_ICON: Readonly<Record<CardKey, string>> = {
  kingOfPelada: '👑', keeperKing: '🧤', legend: '🏛️',
  topScorer: '🔥', topAssists: '🅰️', mostWins: '🏆', mostCraques: '⭐', mostGames: '📅',
  winStreak: '🔗', accuracy: '🎯', unbeaten: '🛡️',
  wall: '🧱', saves: '🙌',
  unbeaten5: '🛡️', winStreak4: '🔗', playmaker10: '🅰️', cleanSheets3: '🧱',
  everPresent: '🔋', joker: '🃏', base: '⚽',
}

const rarityLabel: Record<Rarity, TranslationKey> = {
  common: 'cards.rarityCommon', special: 'cards.raritySpecial', rare: 'cards.rarityRare',
  epic: 'cards.rarityEpic', legendary: 'cards.rarityLegendary',
}

export const cardTitleKey = (key: CardKey) => `cards.${key}Title` as TranslationKey
const titleKey = cardTitleKey
const reasonKey = (key: CardKey) => `cards.${key}Reason` as TranslationKey

/** O card de um jogador, no formato de cromo. */
export function PlayerCardArt({ card, name, overall, avatar, size = 'md' }: {
  card: PlayerCard
  name: string
  overall: number | null
  avatar?: string
  size?: 'sm' | 'md'
}) {
  const { t, formatNumber } = useI18n()
  return (
    <article
      className={`player-card player-card-${size} player-card-${card.rarity}`}
      style={{ '--card-accent': card.accent } as React.CSSProperties}
    >
      <header>
        <span className="player-card-icon" aria-hidden="true">{CARD_ICON[card.key]}</span>
        <span className="player-card-rarity">{t(rarityLabel[card.rarity])}</span>
      </header>
      <Avatar name={name} size={size === 'sm' ? 'md' : 'lg'} src={avatar}/>
      <strong className="player-card-name">{name}</strong>
      <span className="player-card-title">{t(titleKey(card.key))}</span>
      {overall !== null && <b className="player-card-overall">{formatNumber(overall)}</b>}
    </article>
  )
}

/**
 * A colecção de um jogador numa pelada.
 *
 * O card de toda a gente não aparece na lista: é o fundo, não uma conquista, e
 * mostrá-lo a par dos outros dizia que ter jogado era um feito.
 */
export function CardCollection({ cards, name, overall, avatar, peladaName }: {
  cards: readonly PlayerCard[]
  name: string
  overall: number | null
  avatar?: string
  peladaName: string
}) {
  const { t, formatNumber } = useI18n()
  const unlocked = unlockedCards(cards)
  const [selected, setSelected] = useState(0)
  const featured = unlocked[selected] ?? cards[cards.length - 1]

  if (!featured) return null

  const share = () => ({
    title: t(titleKey(featured.key)),
    text: t('cards.shareText', {
      name,
      card: t(titleKey(featured.key)),
      rarity: t(rarityLabel[featured.rarity]),
      pelada: peladaName,
    }),
  })

  return (
    <div className="card-collection">
      <PlayerCardArt card={featured} name={name} overall={overall} avatar={avatar}/>
      <div className="card-collection-side">
        <p className="card-collection-reason">
          {t(reasonKey(featured.key), featured.params)}
          {featured.sharedWith > 0 && <> {t('cards.sharedWith', { count: featured.sharedWith })}</>}
        </p>
        {unlocked.length > 0 ? (
          <>
            <p className="eyebrow dark-text">{t('cards.collectionCount', { count: unlocked.length })}</p>
            <ul className="card-chips">
              {unlocked.map((entry, index) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    className={index === selected ? 'card-chip card-chip-active' : 'card-chip'}
                    style={{ '--card-accent': entry.accent } as React.CSSProperties}
                    aria-pressed={index === selected}
                    onClick={() => setSelected(index)}
                  >
                    <span aria-hidden="true">{CARD_ICON[entry.key]}</span>
                    {t(titleKey(entry.key))}
                    {entry.params.value ? <b>{formatNumber(entry.params.value)}</b> : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="card-collection-empty">{t('cards.emptyBody')}</p>
        )}
        <ShareButton content={share} label={t('cards.share')}/>
      </div>
    </div>
  )
}

/** O emblema que acompanha um nome numa lista — plantel, ranking, escalação. */
export function CardBadge({ card }: { card: PlayerCard | null }) {
  const { t } = useI18n()
  if (!card || card.key === 'base') return null
  return (
    <span
      className="card-badge"
      style={{ '--card-accent': card.accent } as React.CSSProperties}
      title={t(titleKey(card.key))}
    >
      <span aria-hidden="true">{CARD_ICON[card.key]}</span>
      <span className="sr-only">{t(titleKey(card.key))}</span>
    </span>
  )
}

export function EmptyCollection() {
  const { t } = useI18n()
  return <Card className="profile-empty"><p>{t('cards.emptyBody')}</p></Card>
}
