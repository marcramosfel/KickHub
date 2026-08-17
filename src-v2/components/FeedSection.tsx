import { CalendarPlus, CircleX, GitCompareArrows, Image, LoaderCircle, Shuffle, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCurrentPelada } from '../lib/current-pelada'
import { usePeladaFeed, type FeedEvent, type FeedKind } from '../lib/feed'
import { useI18n, type Translate, type TranslationKey } from '../lib/i18n'
import { Button, Card, EmptyState } from './ui'

const titleKeys: Record<FeedKind, TranslationKey> = {
  scheduled: 'feed.kindScheduled', draw: 'feed.kindDraw', result: 'feed.kindResult',
  cancellation: 'feed.kindCancellation', substitution: 'feed.kindSubstitution',
}
const icons: Record<FeedKind, ReactNode> = {
  scheduled: <CalendarPlus/>, draw: <Shuffle/>, result: <Trophy/>,
  cancellation: <CircleX/>, substitution: <GitCompareArrows/>,
}

function payloadSummary(event: FeedEvent, t: Translate) {
  if (event.kind === 'result' && Number.isFinite(Number(event.payload.score_a)) && Number.isFinite(Number(event.payload.score_b))) {
    return t('feed.score', { a: Number(event.payload.score_a), b: Number(event.payload.score_b) })
  }
  if (event.kind === 'scheduled' && event.payload.location) return String(event.payload.location)
  return ''
}

export function FeedSection() {
  const { t, formatDate } = useI18n()
  const { pelada } = useCurrentPelada()
  const feed = usePeladaFeed(pelada?.id, true)
  if (feed.isPending) return <div className="feed-state" role="status"><LoaderCircle className="spin"/><p>{t('feed.loading')}</p></div>
  if (feed.isError) return <div className="feed-state" role="alert"><CircleX/><h2>{t('feed.errorTitle')}</h2><p>{t('feed.errorBody')}</p><Button variant="outline" onClick={() => void feed.refetch()}>{t('dashboard.retry')}</Button></div>
  if (!feed.data?.length) return <EmptyState icon={<Image/>} title={t('feed.emptyTitle')} body={t('feed.emptyBody')}/>

  return <div className="feed-page"><header className="page-heading"><span className="eyebrow dark-text">{t('feed.eyebrow')}</span><h1>{t('feed.title')}</h1><p>{t('feed.subtitle')}</p></header><ol className="feed-timeline">{feed.data.map((event) => {
    const summary = payloadSummary(event, t)
    return <li key={event.id}><span className={`feed-icon feed-icon-${event.kind}`}>{icons[event.kind]}</span><Card className="feed-card"><header><div><span>{t(titleKeys[event.kind])}</span><time dateTime={event.publishedAt}>{formatDate(event.publishedAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></div><h2>{event.title || t(titleKeys[event.kind])}</h2>{summary && <strong>{summary}</strong>}</header>{event.body && <p>{event.body}</p>}{event.media.length > 0 && <div className="feed-gallery">{event.media.map((media) => <a key={media.id} href={media.url} target="_blank" rel="noreferrer"><img src={media.url} alt={media.alt} loading="lazy"/></a>)}</div>}</Card></li>
  })}</ol></div>
}
