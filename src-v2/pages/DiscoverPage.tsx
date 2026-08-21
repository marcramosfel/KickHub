import { ArrowRight, Check, Clock3, LayoutList, LocateFixed, Map, MapPin, Search, Send, SlidersHorizontal, UsersRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DiscoveryMap } from '../components/DiscoveryMap'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import {
  FORMAT_OPTIONS, isFull, RADIUS_OPTIONS, SKILL_LEVELS, useDiscovery, usePeladaRegions,
  requestPosition, WEEKDAYS,
  type DiscoveredPelada, type DiscoveryFilters, type SkillLevel,
} from '../lib/discovery'
import { useI18n, type TranslationKey } from '../lib/i18n'
import type { Pelada } from '../lib/pelada-types'
import { useOnboarding } from '../lib/onboarding'

const messageLimit = 500
const accents = ['#d8ff45', '#72d8ff', '#ff8657', '#c8a8ff']

const weekdayKeys: Record<number, TranslationKey> = {
  1: 'discover.mon', 2: 'discover.tue', 3: 'discover.wed', 4: 'discover.thu',
  5: 'discover.fri', 6: 'discover.sat', 7: 'discover.sun',
}
const skillKeys: Record<SkillLevel, TranslationKey> = {
  casual: 'discover.skillCasual', mixed: 'discover.skillMixed', competitive: 'discover.skillCompetitive',
}

/**
 * O pedido de entrada continua a falar em `Pelada`, que é o resumo que a app
 * usa em todo o lado. A descoberta traz mais campos do que isso — converter
 * aqui evita que o resto do produto passe a conhecer o formato da descoberta.
 */
function toSummary(pelada: DiscoveredPelada, index: number): Pelada {
  return {
    id: pelada.id, slug: pelada.slug, name: pelada.name, city: pelada.city,
    country: pelada.countryCode, membership: 'none', joinMode: pelada.joinMode,
    members: pelada.members, nextMatch: '', accent: accents[index % accents.length],
    visibility: 'public', description: pelada.description,
  }
}

export function DiscoverPage() {
  const { t, formatNumber } = useI18n()
  // As páginas de região (§24) são esta mesma página com o filtro já posto.
  const { country, region } = useParams()
  const [query, setQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [centre, setCentre] = useState<{ lat: number; lon: number } | null>(null)
  const [locating, setLocating] = useState<'idle' | 'asking' | 'denied' | 'unsupported'>('idle')
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [weekday, setWeekday] = useState<number | null>(null)
  const [format, setFormat] = useState<string | null>(null)
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(null)
  const [onlyWithRoom, setOnlyWithRoom] = useState(false)

  const [selected, setSelected] = useState<Pelada | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const { joinStates, requestJoin } = useOnboarding()

  const filters = useMemo<DiscoveryFilters>(() => ({
    query, countryCode: country?.toUpperCase(), region,
    centre, radiusKm, weekday, format, skillLevel, onlyWithRoom,
  }), [centre, country, format, onlyWithRoom, query, radiusKm, region, skillLevel, weekday])

  const discovery = useDiscovery(filters)
  const results = discovery.data ?? []
  // Quantos filtros estão mesmo a filtrar, para o botão o dizer sem os abrir.
  const activeFilters = [radiusKm, weekday, format, skillLevel, onlyWithRoom || null]
    .filter((value) => value !== null).length

  const locate = async () => {
    setLocating('asking')
    try {
      setCentre(await requestPosition())
      setRadiusKm((current) => current ?? 25)
      setLocating('idle')
      setShowFilters(true)
    } catch (error) {
      setLocating(error instanceof Error && error.message === 'UNSUPPORTED' ? 'unsupported' : 'denied')
    }
  }

  const submitRequest = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const status = await requestJoin(selected, message.trim())
      setNotice(t(status === 'active' ? 'discover.noticeAlreadyMember' : 'discover.noticeRequestSent', { name: selected.name }))
      setSelected(null)
      setMessage('')
    } catch {
      setNotice(t('discover.noticeError'))
    } finally {
      setBusy(false)
    }
  }

  return <div className="page discover-page">
    <header className="page-heading">
      <span className="eyebrow dark-text">{t('discover.eyebrow')}</span>
      <h1>{region ? t('discover.regionTitle', { region }) : t('discover.title')}</h1>
      <p>{t('discover.subtitle')}</p>
    </header>

    <div className="search-panel">
      <label><span className="sr-only">{t('discover.searchLabel')}</span><Search/>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('discover.searchPlaceholder')}/>
      </label>
      <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((open) => !open)}>
        <SlidersHorizontal/> {t('discover.filters')}{activeFilters > 0 && <b>{formatNumber(activeFilters)}</b>}
      </button>
      <button type="button" aria-pressed={view === 'map'} onClick={() => setView(view === 'map' ? 'list' : 'map')}>
        {view === 'map' ? <LayoutList/> : <Map/>} {t(view === 'map' ? 'discover.viewList' : 'discover.map')}
      </button>
    </div>

    {showFilters && <FilterPanel
      centre={centre} locating={locating} onLocate={locate} onClearCentre={() => { setCentre(null); setRadiusKm(null) }}
      radiusKm={radiusKm} setRadiusKm={setRadiusKm}
      weekday={weekday} setWeekday={setWeekday}
      format={format} setFormat={setFormat}
      skillLevel={skillLevel} setSkillLevel={setSkillLevel}
      onlyWithRoom={onlyWithRoom} setOnlyWithRoom={setOnlyWithRoom}
    />}

    <div className="discover-summary" aria-live="polite">
      <strong>{discovery.isPending ? t('discover.searching') : t('discover.resultCountPlain', { count: results.length })}</strong>
      <span>{centre && radiusKm
        ? t('discover.radius', { distance: formatNumber(radiusKm, { style: 'unit', unit: 'kilometer' }) })
        : t('discover.noRadius')}</span>
    </div>

    {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}

    {discovery.isError ? (
      <Card className="dashboard-data-state" role="alert"><Search/>
        <div><h2>{t('discover.loadErrorTitle')}</h2><p>{t('discover.loadErrorBody')}</p></div>
        <Button variant="outline" onClick={() => void discovery.refetch()}>{t('dashboard.retry')}</Button>
      </Card>
    ) : view === 'map' && results.length ? (
      <DiscoveryMap peladas={results} onSelect={(pelada) => {
        setSelected(toSummary(pelada, results.indexOf(pelada)))
        setNotice('')
      }}/>
    ) : results.length ? (
      <div className="discover-grid" aria-busy={discovery.isFetching}>
        {results.map((pelada, index) => (
          <ResultCard
            key={pelada.id}
            pelada={pelada}
            accent={accents[index % accents.length]}
            state={joinStates[pelada.id] ?? 'idle'}
            onRequest={() => { setSelected(toSummary(pelada, index)); setNotice('') }}
          />
        ))}
      </div>
    ) : !discovery.isPending ? (
      <EmptyState icon={<Search/>} title={t('discover.emptyTitle')} body={t('discover.emptyBody')}/>
    ) : null}

    <RegionLinks countryCode={country?.toUpperCase()}/>

    {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
      <section className="join-dialog" role="dialog" aria-modal="true" aria-labelledby="join-title">
        <button className="dialog-close" type="button" onClick={() => setSelected(null)} aria-label={t('discover.close')}><X/></button>
        <span className="pelada-monogram" style={{ background: selected.accent }}>{initials(selected.name)}</span>
        <p className="eyebrow dark-text">{t('discover.dialogEyebrow')}</p><h2 id="join-title">{t('discover.dialogTitle', { name: selected.name })}</h2>
        {selected.joinMode === 'open' ? <p>{t('discover.dialogOpenBody')}</p> : <label htmlFor="join-message">{t('discover.messageLabel')}<textarea id="join-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={messageLimit} placeholder={t('discover.messagePlaceholder')}/><small>{t('discover.messageCounter', { used: message.length, max: messageLimit })}</small></label>}
        <div className="dialog-actions"><Button variant="ghost" onClick={() => setSelected(null)}>{t('discover.cancel')}</Button><Button disabled={busy} onClick={submitRequest}>{busy ? t('discover.sending') : selected.joinMode === 'open' ? t('discover.confirmJoin') : t('discover.sendRequest')} <ArrowRight/></Button></div>
      </section>
    </div>}
  </div>
}

function FilterPanel({
  centre, locating, onLocate, onClearCentre, radiusKm, setRadiusKm, weekday, setWeekday,
  format, setFormat, skillLevel, setSkillLevel, onlyWithRoom, setOnlyWithRoom,
}: {
  centre: { lat: number; lon: number } | null
  locating: 'idle' | 'asking' | 'denied' | 'unsupported'
  onLocate: () => void
  onClearCentre: () => void
  radiusKm: number | null
  setRadiusKm: (value: number | null) => void
  weekday: number | null
  setWeekday: (value: number | null) => void
  format: string | null
  setFormat: (value: string | null) => void
  skillLevel: SkillLevel | null
  setSkillLevel: (value: SkillLevel | null) => void
  onlyWithRoom: boolean
  setOnlyWithRoom: (value: boolean) => void
}) {
  const { t, formatNumber } = useI18n()
  return (
    <Card className="filter-panel">
      <fieldset>
        <legend>{t('discover.filterDistance')}</legend>
        {centre ? (
          <>
            <div className="filter-chips">
              {RADIUS_OPTIONS.map((option) => (
                <button
                  key={option} type="button" aria-pressed={radiusKm === option}
                  className={radiusKm === option ? 'filter-chip filter-chip-active' : 'filter-chip'}
                  onClick={() => setRadiusKm(radiusKm === option ? null : option)}
                >{formatNumber(option, { style: 'unit', unit: 'kilometer' })}</button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClearCentre}>{t('discover.clearLocation')}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={onLocate} disabled={locating === 'asking'}>
              <LocateFixed/> {t(locating === 'asking' ? 'discover.locating' : 'discover.useMyLocation')}
            </button>
            {locating === 'denied' && <p className="filter-note">{t('discover.locationDenied')}</p>}
            {locating === 'unsupported' && <p className="filter-note">{t('discover.locationUnsupported')}</p>}
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>{t('discover.filterDay')}</legend>
        <div className="filter-chips">
          {WEEKDAYS.map((day) => (
            <button
              key={day} type="button" aria-pressed={weekday === day}
              className={weekday === day ? 'filter-chip filter-chip-active' : 'filter-chip'}
              onClick={() => setWeekday(weekday === day ? null : day)}
            >{t(weekdayKeys[day])}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('discover.filterFormat')}</legend>
        <div className="filter-chips">
          {FORMAT_OPTIONS.map((option) => (
            <button
              key={option} type="button" aria-pressed={format === option}
              className={format === option ? 'filter-chip filter-chip-active' : 'filter-chip'}
              onClick={() => setFormat(format === option ? null : option)}
            >{option}</button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('discover.filterLevel')}</legend>
        <div className="filter-chips">
          {SKILL_LEVELS.map((level) => (
            <button
              key={level} type="button" aria-pressed={skillLevel === level}
              className={skillLevel === level ? 'filter-chip filter-chip-active' : 'filter-chip'}
              onClick={() => setSkillLevel(skillLevel === level ? null : level)}
            >{t(skillKeys[level])}</button>
          ))}
        </div>
      </fieldset>

      <label className="filter-toggle">
        <input type="checkbox" checked={onlyWithRoom} onChange={(event) => setOnlyWithRoom(event.target.checked)}/>
        {t('discover.filterWithRoom')}
      </label>
    </Card>
  )
}

function ResultCard({ pelada, accent, state, onRequest }: {
  pelada: DiscoveredPelada
  accent: string
  state: string
  onRequest: () => void
}) {
  const { t, formatNumber } = useI18n()
  const full = isFull(pelada)
  return (
    <Card className="discover-card" style={{ '--accent': accent } as React.CSSProperties}>
      <div className="discover-card-head">
        <span className="pelada-monogram">{initials(pelada.name)}</span>
        <Badge tone={state === 'active' ? 'blue' : state === 'pending' ? 'orange' : 'lime'}>
          {state === 'active' ? t('discover.badgeMember')
            : state === 'pending' ? t('discover.badgePending')
              : pelada.joinMode === 'open' ? t('discover.badgeOpen') : t('discover.badgeApproval')}
        </Badge>
      </div>
      <h2>{pelada.name}</h2>
      <p>{pelada.description}</p>
      <div className="discover-meta">
        <span><MapPin/> {[pelada.city, pelada.region].filter(Boolean).join(' · ')}</span>
        <span><UsersRound/> {t('dashboard.membersCount', { count: pelada.members })}</span>
        {pelada.distanceKm !== null && <span><LocateFixed/> {formatNumber(pelada.distanceKm, { style: 'unit', unit: 'kilometer' })}</span>}
      </div>
      <div className="discover-tags">
        {pelada.defaultFormat && <span>{pelada.defaultFormat}</span>}
        {pelada.matchWeekday && <span>{t(weekdayKeys[pelada.matchWeekday])}{pelada.matchTime ? ` · ${pelada.matchTime}` : ''}</span>}
        {pelada.skillLevel && <span>{t(skillKeys[pelada.skillLevel])}</span>}
        {full && <span className="discover-tag-full">{t('discover.full')}</span>}
      </div>
      <div className="discover-foot">
        <Link to={`/p/${pelada.slug}`}>{t('discover.viewPelada')} <ArrowRight/></Link>
      </div>
      <div className="discover-actions">
        {state === 'active' ? <Link className="btn btn-secondary btn-md" to={`/p/${pelada.slug}`}>{t('discover.openCommunity')}</Link>
          : state === 'pending' ? <span className="pending-label"><Clock3/> {t('discover.awaitingApproval')}</span>
            : <Button onClick={onRequest}><Send/> {pelada.joinMode === 'open' ? t('discover.joinNow') : t('discover.requestJoin')}</Button>}
      </div>
    </Card>
  )
}

/**
 * As páginas por região de §24. São links e não um menu: o objectivo delas é
 * existir um endereço próprio para "peladas em Lisboa" que se possa partilhar
 * e indexar, e um menu não deixa nada indexado.
 */
function RegionLinks({ countryCode }: { countryCode?: string }) {
  const { t, formatNumber } = useI18n()
  const regions = usePeladaRegions(countryCode)
  if (!regions.data?.length) return null
  return (
    <section className="region-links" aria-labelledby="regions-title">
      <h2 id="regions-title">{t('discover.regionsTitle')}</h2>
      <ul>
        {regions.data.map((region) => (
          <li key={`${region.countryCode}-${region.region}-${region.city}`}>
            <Link to={`/descobrir/${region.countryCode.toLowerCase()}/${encodeURIComponent(region.region)}`}>
              {t('discover.regionLink', { region: region.region })}
              <b>{formatNumber(region.count)}</b>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('')
}
