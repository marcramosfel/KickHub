import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { attributesWithData } from '../../domain/player-attributes'
import { unlockedCards, type PlayerCard } from '../../domain/player-cards'
import { ShareImageButton } from '../ShareImageButton'
import { useAuth } from '../../lib/auth'
import { useCurrentPelada } from '../../lib/current-pelada'
import { useI18n, type TranslationKey } from '../../lib/i18n'
import { useMyPlayerProfile } from '../../lib/player-profile'
import { useMyRatingHistory, usePlayerGameHistory } from '../../lib/ratings'
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
  /** Prémios e títulos, em pontos, somados depois da média ponderada. */
  adjustments?: readonly { key: string; points: number }[]
  stats: PlayerCardStats
  /** As conquistas desta pelada, para a terceira aba. */
  achievements: readonly PlayerCard[]
  /** Todas as do catálogo, para as bloqueadas aparecerem a cinzento. */
  locked: readonly { key: string; icon: string; label: TranslationKey }[]
}

type Tab = 'card' | 'stats' | 'achievements' | 'ratings' | 'history'

const TABS: [Tab, TranslationKey][] = [
  ['card', 'card.tabCard'], ['stats', 'card.tabStats'], ['achievements', 'card.tabAchievements'],
  ['history', 'card.tabHistory'],
]

/**
 * A aba das avaliações só existe no card de quem está a ver.
 *
 * As notas recebidas são anónimas por regra do produto — a política de leitura
 * só deixa alguém ler as que **deu** — e por isso não há aba nenhuma a mostrar
 * no card de outra pessoa. Não é uma omissão: é a regra.
 */
const OWN_TAB: [Tab, TranslationKey] = ['ratings', 'card.tabRatings']

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
  const { pelada } = useCurrentPelada()
  const { user } = useAuth()
  // Qual das pertenças é a de quem está a ver. O card aberto é identificado
  // pelo `membershipId`, e é o perfil próprio que sabe qual é o dele aqui.
  const me = useMyPlayerProfile(user?.id)
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
  const myMembershipId = me.data?.peladas.find((community) => community.id === pelada?.id)?.membershipId
  const isMine = Boolean(myMembershipId && myMembershipId === entry?.card.id)
  useFlip(stage, origin ?? null)

  /**
   * O fecho é o inverso e mais rápido (§6.5). A foto de origem só volta a
   * aparecer no último frame — antes disso via-se a duplicar.
   */
  const finish = useCallback(() => {
    // Consome a entrada que este modal criou, para o "voltar" do telemóvel não
    // ficar preso num passo que já não mostra nada.
    if (window.history.state?.playerCard) window.history.back()
    onClose()
  }, [onClose])

  const close = useCallback(() => {
    if (prefersReducedMotion()) { finish(); return }
    setClosing(true)
    window.setTimeout(finish, 220)
  }, [finish])

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

  /**
   * O botão "voltar" do telemóvel fecha o card em vez de sair do ecrã.
   *
   * O `cleanup` NÃO navega. Navegar ao desmontar parece inofensivo até ao
   * StrictMode, que em desenvolvimento corre efeito → cleanup → efeito: o
   * `history.back()` do cleanup disparava um `popstate` e o card fechava-se
   * sozinho vinte milissegundos depois de abrir. Quem volta atrás é o `close`,
   * de propósito e uma vez.
   */
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    // A marca é o próprio estado do histórico, e não uma variável nossa: assim
    // a segunda execução do StrictMode reconhece a entrada que a primeira criou
    // e não empurra outra por cima.
    if (!window.history.state?.playerCard) {
      window.history.pushState({ playerCard: true }, '')
    }
    const onPop = () => closeRef.current()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

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
          {tab === 'ratings' && <RatingsPanel/>}
          {tab === 'history' && <HistoryPanel membershipId={entry.card.id}/>}

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
          {(isMine ? [...TABS, OWN_TAB] : TABS).map(([id, label]) => (
            <button
              key={id} type="button" aria-pressed={tab === id}
              className={tab === id ? 'card-tab card-tab-active' : 'card-tab'}
              onClick={() => setTab(id)}
            >{t(label)}</button>
          ))}
        </nav>

        {/* Partilhar o card é metade da razão de ele existir: o jogador vê o
            número e quer mostrá-lo. Fica junto às abas, e não escondido no fim
            de uma delas. */}
        <div className="card-share">
          <ShareImageButton
            size="sm"
            filename={`kickhub-${entry.card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}
            text={entry.card.name}
            spec={() => ({
              eyebrow: t('card.shareEyebrow'),
              title: entry.card.name,
              subtitle: entry.card.position,
              photo: entry.card.photo ?? undefined,
              // Um overall por apurar não vira zero na imagem, tal como não
              // vira zero no card: sai o mesmo travessão.
              highlight: entry.card.overall === null ? '—' : String(entry.card.overall),
              stats: [
                { label: t('card.games'), value: formatNumber(entry.stats.gamesPlayed) },
                { label: t('card.goals'), value: formatNumber(entry.stats.goals) },
                { label: t('card.assists'), value: formatNumber(entry.stats.assists) },
              ],
            })}
          />
          <p className="card-hint">{formatNumber(index + 1)}/{formatNumber(entries.length)}</p>
        </div>
      </div>
    </div>
  )
}

/**
 * As notas que recebi, jogo a jogo.
 *
 * Um jogo com poucos avaliadores mostra a contagem e esconde a média: com dois,
 * numa pelada de dez, a média é praticamente uma assinatura de quem avaliou. É
 * o servidor que decide isso — aqui só se diz porquê a quem está a ler.
 */
function RatingsPanel() {
  const { t, formatNumber, formatDate } = useI18n()
  const { pelada } = useCurrentPelada()
  const history = useMyRatingHistory(pelada?.id)

  if (history.isPending) return <div className="card-panel"><p className="card-note">{t('card.ratingsLoading')}</p></div>
  if (history.isError) return <div className="card-panel"><p className="card-note" role="alert">{t('card.ratingsError')}</p></div>
  if (!history.data?.length) return <div className="card-panel"><p className="card-note">{t('card.ratingsEmpty')}</p></div>

  const rated = history.data.filter((entry) => entry.average !== null)
  const overall = rated.length
    ? rated.reduce((total, entry) => total + (entry.average ?? 0), 0) / rated.length
    : null

  return (
    <div className="card-panel"><div className="card-ratings">
      <p className="card-ratings-head">
        {overall === null
          ? t('card.ratingsNoAverage')
          : t('card.ratingsAverage', {
            value: formatNumber(overall, { maximumFractionDigits: 1 }),
            games: formatNumber(rated.length),
          })}
      </p>
      <ol>
        {history.data.map((entry) => (
          <li key={entry.gameId}>
            <span>{formatDate(entry.playedAt, { dateStyle: 'medium' })}</span>
            <b>
              {entry.average === null
                ? '—'
                : formatNumber(entry.average, { maximumFractionDigits: 1 })}
            </b>
            <small>{t('card.ratingsRaters', { count: entry.raters })}</small>
          </li>
        ))}
      </ol>
      <p className="card-note">{t('card.ratingsPrivacy')}</p>
    </div></div>
  )
}

/**
 * Jogo a jogo. Ao contrário das notas, isto não é privado: são as mesmas linhas
 * que o ranking já soma à vista de todos os membros, aqui apenas sem as somar.
 */
function HistoryPanel({ membershipId }: { membershipId: string }) {
  const { t, formatNumber, formatDate } = useI18n()
  const { pelada } = useCurrentPelada()
  const history = usePlayerGameHistory(pelada?.id, membershipId)

  if (history.isPending) return <div className="card-panel"><p className="card-note">{t('card.historyLoading')}</p></div>
  if (history.isError) return <div className="card-panel"><p className="card-note" role="alert">{t('card.historyError')}</p></div>
  if (!history.data?.length) return <div className="card-panel"><p className="card-note">{t('card.historyEmpty')}</p></div>

  return (
    <div className="card-panel"><ol className="card-history">
      {history.data.map((game) => (
        <li key={game.gameId} data-outcome={game.outcome ?? undefined}>
          <span>{formatDate(game.playedAt, { dateStyle: 'medium' })}</span>
          <b>{game.outcome ? t(`card.outcome${game.outcome}` as TranslationKey) : '—'}</b>
          <small>
            {game.goals > 0 && <>⚽ {formatNumber(game.goals)} </>}
            {game.assists > 0 && <>🅰️ {formatNumber(game.assists)} </>}
            {game.saves > 0 && <>🧤 {formatNumber(game.saves)} </>}
            {game.craque && <>👑</>}
          </small>
        </li>
      ))}
    </ol></div>
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
          {/* Sem isto a conta não fecha: a soma das parcelas não dá o número
              grande, e quem olha conclui que um dos dois está errado. */}
          {entry.adjustments && entry.adjustments.length > 0 && (
            <ul className="card-adjustments">
              {entry.adjustments.map((item) => (
                <li key={item.key}>
                  <span>{t(`card.adjust${item.key}` as TranslationKey)}</span>
                  <b>{item.points > 0 ? '+' : ''}{formatNumber(item.points, { maximumFractionDigits: 1 })}</b>
                </li>
              ))}
            </ul>
          )}
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
