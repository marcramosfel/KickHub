import { CalendarDays, Check, Clock3, MapPin, Plus, ShieldCheck, UsersRound, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { GameDraw } from '../components/GameDraw'
import { GameAwards } from '../components/GameAwards'
import { GameRatings } from '../components/GameRatings'
import { GameResult } from '../components/GameResult'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import { useCurrentPelada } from '../lib/current-pelada'
import { remainingSeats, useGameMutations, usePeladaGames, type Game } from '../lib/games'
import { useI18n } from '../lib/i18n'

export function GamesSection() {
  const { t } = useI18n()
  const { pelada, canAdmin } = useCurrentPelada()
  const games = usePeladaGames(pelada?.id, true)
  const [composing, setComposing] = useState(false)
  const [notice, setNotice] = useState('')

  return (
    <div className="games-section">
      <GamesHeading canAdmin={canAdmin} onCompose={() => { setComposing(true); setNotice('') }}/>

      {notice ? <p className="inline-notice" role="status"><Check/> {notice}</p> : null}

      {composing ? (
        <CreateGameForm
          onClose={() => setComposing(false)}
          onCreated={() => { setComposing(false); setNotice(t('games.createdNotice')) }}
        />
      ) : null}

      {games.isPending ? (
        <div className="game-list" aria-label={t('games.loading')} aria-busy="true">
          {[0, 1].map((item) => <div className="game-card game-card-skeleton" key={item} aria-hidden="true"><span/><i/><b/></div>)}
        </div>
      ) : games.isError ? (
        <Card className="dashboard-data-state" role="alert">
          <ShieldCheck/>
          <div><h3>{t('games.errorTitle')}</h3><p>{t('games.errorBody')}</p></div>
          <button type="button" className="btn btn-outline btn-md" onClick={() => void games.refetch()}>{t('dashboard.retry')}</button>
        </Card>
      ) : (games.data ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarDays/>}
          title={t('games.emptyTitle')}
          body={t(canAdmin ? 'games.emptyAdminBody' : 'games.emptyPlayerBody')}
          action={canAdmin ? <Button onClick={() => setComposing(true)}><Plus/> {t('games.newGame')}</Button> : undefined}
        />
      ) : (
        <div className="game-list">
          {(games.data ?? []).map((game) => <GameCard key={game.id} game={game}/>)}
        </div>
      )}
    </div>
  )
}

function GamesHeading({ canAdmin, onCompose }: { canAdmin: boolean; onCompose: () => void }) {
  const { t } = useI18n()
  return (
    <header className="page-heading split-heading">
      <div>
        <span className="eyebrow dark-text">{t('games.eyebrow')}</span>
        <h1>{t('games.title')}</h1>
        <p>{t('games.subtitle')}</p>
      </div>
      {canAdmin ? <Button onClick={onCompose}><Plus size={18}/> {t('games.newGame')}</Button> : null}
    </header>
  )
}

function GameCard({ game }: { game: Game }) {
  const { t, formatDate } = useI18n()
  const { pelada, canAdmin } = useCurrentPelada()
  const { attend, cancel } = useGameMutations(pelada?.id)
  const [error, setError] = useState('')
  const seats = remainingSeats(game)
  const open = game.status === 'scheduled'

  const respond = async (status: 'confirmed' | 'declined') => {
    setError('')
    try { await attend.mutateAsync({ gameId: game.id, status }) }
    catch { setError(t('games.attendanceError')) }
  }

  const drop = async () => {
    setError('')
    try { await cancel.mutateAsync(game.id) }
    catch { setError(t('games.cancelError')) }
  }

  return (
    <Card className="game-card">
      <div className="game-card-head">
        <div className="game-date">
          <strong>{formatDate(game.scheduledAt, { day: 'numeric' })}</strong>
          <span>{formatDate(game.scheduledAt, { month: 'short' }).toLocaleUpperCase()}</span>
        </div>
        <div className="game-headline">
          <h2>{formatDate(game.scheduledAt, { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</h2>
          <div className="game-meta">
            <span><Clock3/> {t('games.duration', { minutes: game.durationMinutes })}</span>
            <span><UsersRound/> {t('games.formatLabel', { format: game.format })}</span>
            {game.location ? <span><MapPin/> {game.location}</span> : null}
          </div>
        </div>
        {open ? null : <Badge tone="neutral">{t(game.status === 'cancelled' ? 'games.cancelled' : 'games.played')}</Badge>}
      </div>

      {game.notes ? <p className="game-notes">{game.notes}</p> : null}

      <div className="game-attendance">
        <strong>
          {game.maxPlayers === null
            ? t('games.confirmedOpen', { confirmed: game.confirmedCount, count: game.confirmedCount })
            : t('games.confirmedOf', { confirmed: game.confirmedCount, total: game.maxPlayers, count: game.confirmedCount })}
        </strong>
        {seats !== null ? <span>{seats === 0 ? t('games.full') : t('games.seatsLeft', { count: seats })}</span> : null}
        {game.waitlistCount > 0 ? <span>{t('games.waitlistCount', { count: game.waitlistCount })}</span> : null}
        {game.maxPlayers !== null ? (
          <progress
            max={game.maxPlayers}
            value={game.confirmedCount}
            aria-label={t('games.confirmedOf', { confirmed: game.confirmedCount, total: game.maxPlayers, count: game.confirmedCount })}
          />
        ) : null}
      </div>

      {game.myStatus === 'waitlist' ? <p className="game-status waitlist"><Clock3/> {t('games.onWaitlist')}</p> : null}
      {game.myStatus === 'confirmed' ? <p className="game-status confirmed"><Check/> {t('games.confirmed')}</p> : null}
      {game.myStatus === 'declined' ? <p className="game-status declined"><X/> {t('games.declined')}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <GameDraw game={game}/>
      <GameResult game={game}/>
      <GameRatings game={game}/>
      <GameAwards game={game}/>

      {open ? (
        <div className="game-actions">
          <Button
            variant={game.myStatus === 'declined' ? 'primary' : 'outline'}
            disabled={attend.isPending}
            onClick={() => respond('declined')}
          >
            <X size={16}/> {t('games.decline')}
          </Button>
          <Button
            disabled={attend.isPending}
            onClick={() => respond('confirmed')}
          >
            <Check size={16}/> {attend.isPending ? t('games.saving') : t('games.confirm')}
          </Button>
          {canAdmin ? (
            <Button variant="ghost" disabled={cancel.isPending} onClick={drop}>{t('games.cancelGame')}</Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function CreateGameForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n()
  const { pelada } = useCurrentPelada()
  const { create } = useGameMutations(pelada?.id)
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState('90')
  const [location, setLocation] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    const when = new Date(scheduledAt)
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setError(t('games.pastDateError'))
      return
    }
    try {
      await create.mutateAsync({
        peladaId: pelada!.id,
        scheduledAt: when.toISOString(),
        durationMinutes: Number(duration) || 90,
        location,
        format: '7x7',
        teamSize: 7,
        maxPlayers: maxPlayers ? Number(maxPlayers) : null,
        notes,
      })
      onCreated()
    } catch {
      setError(t('games.createError'))
    }
  }

  return (
    <Card className="game-form">
      <h2>{t('games.createTitle')}</h2>
      <form onSubmit={submit}>
        <div className="field-grid">
          <label htmlFor="game-date">{t('games.dateLabel')}
            <input id="game-date" type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)}/>
          </label>
          <label htmlFor="game-duration">{t('games.durationLabel')}
            <input id="game-duration" type="number" min={15} max={300} step={5} value={duration} onChange={(event) => setDuration(event.target.value)}/>
          </label>
        </div>
        <label htmlFor="game-location">{t('games.locationLabel')}
          <input id="game-location" maxLength={160} placeholder={t('games.locationPlaceholder')} value={location} onChange={(event) => setLocation(event.target.value)}/>
        </label>
        {/* A dica fica fora do label: dentro dele passaria a fazer parte do
            nome acessível do campo, em vez de ser apenas a sua descrição. */}
        <div className="game-max-field">
          <label htmlFor="game-max">{t('games.maxPlayersLabel')}
            <input id="game-max" type="number" min={4} max={60} value={maxPlayers} onChange={(event) => setMaxPlayers(event.target.value)} aria-describedby="game-max-hint"/>
          </label>
          <small id="game-max-hint">{t('games.maxPlayersHint')}</small>
        </div>
        <label htmlFor="game-notes">{t('games.notesLabel')}
          <textarea id="game-notes" maxLength={500} placeholder={t('games.notesPlaceholder')} value={notes} onChange={(event) => setNotes(event.target.value)}/>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="game-form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>{t('games.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? t('games.creating') : t('games.submit')}</Button>
        </div>
      </form>
    </Card>
  )
}
