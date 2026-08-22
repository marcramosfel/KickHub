import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { attributesWithData } from '../../domain/player-attributes'
import { unlockedCards, type PlayerCard } from '../../domain/player-cards'
import { useI18n, type TranslationKey } from '../../lib/i18n'
import { Card, type CardPlayer } from './Card'
import { prefersReducedMotion } from './useCountUp'
import { useFlip, type OriginRect } from './useFlip'
import './card.css'

/**
 * O pop-up do card.
 *
 * Trata do que um modal tem de tratar e nada mais: foco, teclado, histórico,
 * scroll e navegação entre jogadores. Os números chegam prontos — quem os
 * calcula é o domínio, e um modal que fizesse contas seria um segundo sítio
 * onde o overall pode divergir.
 */
export type PlayerCardStats = {
  gamesPlayed: number
  goals: number
  assists: number
  craques: number
  bagres: number
  wins: number | null
  draws: number | null
  losses: number | null
  saves: number | null
  goalsConceded: number | null
  cleanSheets: number | null
  savePercentage: number | null
  groupRating: number | null
  postRating: number | null
}

export type OverallPartRow = { key: string; value: number; weight: number }

export type PlayerCardEntry = {
  card: CardPlayer
  /** A decomposição do overall, quando o servidor a manda. Sem ela, some. */
  breakdown?: readonly OverallPartRow[]
  stats: PlayerCardStats
  /** As conquistas desta pelada, para a terceira aba. */
  achievements: readonly PlayerCard[]
  /** Todas as do catálogo, para as bloqueadas aparecerem a cinzento. */
  locked: readonly { key: string; icon: string; label: TranslationKey }[]
}

type Tab = 'card' | 'stats' | 'achievements'

const TABS: [Tab, TranslationKey][] = [
  ['card', 'card.tabCard'], ['stats', 'card.tabStats'], ['achievements', 'card.tabAchievements'],
]

/** A largura da scrollbar, para a página não saltar ao bloquear o scroll. */
function lockScroll() {
  const gap = window.innerWidth - document.documentElement.clientWidth
  const previous = { overflow: document.body.style.overflow, padding: document.body.style.paddingRight }
  document.body.style.overflow = 'hidden'
  if (gap > 0) document.body.style.paddingRight = `${gap}px`
  return () => {
    document.body.style.overflow = previous.overflow
    document.body.style.paddingRight = previous.padding
  }
}

export function PlayerCardModal({ entries, index, origin, onIndex, onClose }: {
  entries: readonly PlayerCardEntry[]
  index: number
  /** De onde o card cresce: o rectângulo da foto clicada. */
  origin?: OriginRect | null
  onIndex: (next: number) => void
  onClose: () => void
}) {
  const { t, formatNumber } = useI18n()
  const dialog = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [tab, setTab] = useState<Tab>('card')
  const touchStart = useRef<number | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  // A flutuação só começa depois da coreografia de entrada; a sobrepor-se a ela
  // as duas transformações lutavam pelo mesmo eixo.
  const [resting, setResting] = useState(prefersReducedMotion())
  const entry = entries[index]
  useFlip(stage, origin ?? null)

  /**
   * O fecho é o inverso e mais rápido (§6.5). A foto de origem só volta a
   * aparecer no último frame — antes disso via-se a duplicar.
   */
  const close = useCallback(() => {
    if (prefersReducedMotion()) { onClose(); return }
    setClosing(true)
    window.setTimeout(onClose, 220)
  }, [onClose])

  const go = useCallback((step: number) => {
    if (entries.length < 2) return
    onIndex((index + step + entries.length) % entries.length)
    setTab('card')
  }, [entries.length, index, onIndex])

  useEffect(() => { closeButton.current?.focus() }, [])
  useEffect(() => {
    if (prefersReducedMotion()) return
    const timer = window.setTimeout(() => setResting(true), 1400)
    return () => window.clearTimeout(timer)
  }, [index])
  useEffect(lockScroll, [])

  // O botão "voltar" do telemóvel fecha o card em vez de sair do ecrã.
  useEffect(() => {
    window.history.pushState({ playerCard: true }, '')
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (window.history.state?.playerCard) window.history.back()
    }
  }, [onClose])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return }
      if (event.key === 'ArrowLeft') { go(-1); return }
      if (event.key === 'ArrowRight') { go(1); return }
      if (event.key !== 'Tab' || !dialog.current) return
      // O Tab fica preso dentro do diálogo enquanto ele estiver aberto.
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, go])

  if (!entry) return null

  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStart.current === null) return
    const delta = event.changedTouches[0].clientY - touchStart.current
    touchStart.current = null
    if (delta > 80) close()
  }

  return (
    <div
      className={closing ? 'card-backdrop card-backdrop-closing' : 'card-backdrop'}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
      onTouchStart={(event) => { touchStart.current = event.touches[0].clientY }}
      onTouchEnd={onTouchEnd}
    >
      <div className="card-dialog" role="dialog" aria-modal="true" aria-labelledby="card-name" ref={dialog}>
        <button ref={closeButton} className="card-close" type="button" onClick={close} aria-label={t('discover.close')}>
          <X/>
        </button>
        <h2 id="card-name" className="sr-only">{entry.card.name}</h2>

        <div className="card-stage" ref={stage} data-rest={resting ? 'true' : undefined}>
          {entries.length > 1 && (
            <button className="card-arrow card-arrow-prev" type="button" onClick={() => go(-1)} aria-label={t('card.previous')}>
              <ChevronLeft/>
            </button>
          )}

          <div className="card-halo" aria-hidden="true"/>
          {/* A `key` refaz a entrada ao mudar de jogador; o backdrop fica. */}
          {tab === 'card' && <Card key={entry.card.id} player={entry.card} size="md"/>}
          {tab === 'stats' && <StatsPanel entry={entry}/>}
          {tab === 'achievements' && <AchievementsPanel entry={entry}/>}

          {entries.length > 1 && (
            <button className="card-arrow card-arrow-next" type="button" onClick={() => go(1)} aria-label={t('card.next')}>
              <ChevronRight/>
            </button>
          )}
        </div>

        {tab === 'card' && attributesWithData(entry.card.attributes) === 0 && (
          <p className="card-note">{t('card.noAttributes')}</p>
        )}

        <nav className="card-tabs" aria-label={t('card.sections')}>
          {TABS.map(([id, label]) => (
            <button
              key={id} type="button" aria-pressed={tab === id}
              className={tab === id ? 'card-tab card-tab-active' : 'card-tab'}
              onClick={() => setTab(id)}
            >{t(label)}</button>
          ))}
        </nav>

        <p className="card-hint">{formatNumber(index + 1)}/{formatNumber(entries.length)}</p>
      </div>
    </div>
  )
}

function StatsPanel({ entry }: { entry: PlayerCardEntry }) {
  const { t, formatNumber } = useI18n()
  const { stats, card } = entry
  const keeper = card.attributes.some((attribute) => attribute.id === 'DEF')

  const show = (value: number | null) => (value === null ? '—' : formatNumber(value))
  const rows: [TranslationKey, string][] = keeper
    ? [
      ['card.games', show(stats.gamesPlayed)],
      ['card.saves', show(stats.saves)],
      ['card.conceded', show(stats.goalsConceded)],
      ['card.cleanSheets', show(stats.cleanSheets)],
      ['card.savePct', stats.savePercentage === null ? '—' : `${formatNumber(stats.savePercentage)}%`],
      ['card.record', stats.wins === null ? '—' : `${formatNumber(stats.wins)}-${formatNumber(stats.draws ?? 0)}-${formatNumber(stats.losses ?? 0)}`],
    ]
    : [
      ['card.games', show(stats.gamesPlayed)],
      ['card.goals', show(stats.goals)],
      ['card.assists', show(stats.assists)],
      ['card.stars', show(stats.craques)],
      ['card.flops', show(stats.bagres)],
      ['card.record', stats.wins === null ? '—' : `${formatNumber(stats.wins)}-${formatNumber(stats.draws ?? 0)}-${formatNumber(stats.losses ?? 0)}`],
    ]

  return (
    <div className="card-panel">
      <dl className="card-stat-grid">
        {rows.map(([label, value]) => (
          <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <dl className="card-stat-grid">
        <div><dt>{t('card.groupRating')}</dt><dd>{stats.groupRating === null ? '—' : formatNumber(stats.groupRating)}</dd></div>
        <div><dt>{t('card.postRating')}</dt><dd>{stats.postRating === null ? '—' : formatNumber(stats.postRating, { maximumFractionDigits: 1 })}</dd></div>
      </dl>
      {/* Sem decomposição a secção some inteira. Inventar parcelas para ter uma
          lista bonita era mentir sobre como o número foi feito. */}
      {entry.breakdown && entry.breakdown.length > 0 && (
        <section className="card-breakdown">
          <h3>{t('card.howOverall')}</h3>
          <ul>
            {entry.breakdown.map((part) => (
              <li key={part.key}>
                <span>{t(`card.part${part.key}` as TranslationKey)}</span>
                <b>{formatNumber(Math.round(part.value))}</b>
                <small>{formatNumber(Math.round(part.weight * 100))}%</small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function AchievementsPanel({ entry }: { entry: PlayerCardEntry }) {
  const { t } = useI18n()
  const unlocked = useMemo(
    () => new Set(unlockedCards(entry.achievements).map((card) => card.key)),
    [entry.achievements],
  )
  return (
    <div className="card-panel">
      <ul className="card-achievements">
        {entry.locked.map((item) => (
          <li
            key={item.key}
            className={unlocked.has(item.key as never) ? 'card-achievement' : 'card-achievement card-achievement-locked'}
            title={t(item.label)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <small>{t(item.label)}</small>
          </li>
        ))}
      </ul>
      {unlocked.size === 0 && <p className="card-note">{t('cards.emptyBody')}</p>}
    </div>
  )
}

export { Card, prefersReducedMotion }
export type { CardPlayer }
