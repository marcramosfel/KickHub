import { Check, ClipboardList } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card } from '../components/ui'
import { useCurrentPelada } from '../lib/current-pelada'
import type { Game } from '../lib/games'
import { useI18n } from '../lib/i18n'
import { listConfirmedPlayers } from '../lib/lineups'
import { useGameResult, useResultMutations, type StatInput } from '../lib/results'

type StatDraft = StatInput & { displayName: string }

export function GameResult({ game }: { game: Game }) {
  const { t, formatNumber } = useI18n()
  const { canAdmin } = useCurrentPelada()
  const result = useGameResult(game.id, true)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')

  const recorded = result.data
  const canRecord = canAdmin && game.status !== 'cancelled'

  if (!recorded && !canRecord) return null

  return (
    <div className="game-result">
      <div className="game-result-head">
        <h3>{t('games.resultTitle')}</h3>
        {canRecord && !editing ? (
          <Button variant="outline" size="sm" onClick={() => { setEditing(true); setNotice('') }}>
            <ClipboardList size={14}/> {recorded ? t('games.editResult') : t('games.recordResult')}
          </Button>
        ) : null}
      </div>

      {notice ? <p className="inline-notice" role="status"><Check/> {notice}</p> : null}

      {editing ? (
        <ResultForm
          game={game}
          initial={recorded}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); setNotice(t('games.resultSaved')) }}
        />
      ) : recorded ? (
        <>
          <p className="final-score">{t('games.finalScore', { scoreA: formatNumber(recorded.scoreA), scoreB: formatNumber(recorded.scoreB) })}</p>
          {recorded.notes ? <p className="result-notes">{recorded.notes}</p> : null}
          {recorded.players.length === 0 ? (
            <p className="result-empty">{t('games.noStatsYet')}</p>
          ) : (
            <ul className="result-scorers">
              {recorded.players.map((player) => (
                <li key={player.membershipId}>
                  <span>{player.displayName}</span>
                  {player.goals > 0 ? <b>{t('games.goalsShort', { count: player.goals })}</b> : null}
                  {player.assists > 0 ? <i>{t('games.assistsShort', { count: player.assists })}</i> : null}
                  {player.saves > 0 ? <small>{t('games.savesShort', { count: player.saves })}</small> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}

function ResultForm({ game, initial, onClose, onSaved }: {
  game: Game
  initial: ReturnType<typeof useGameResult>['data']
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const { pelada } = useCurrentPelada()
  const save = useResultMutations(game.id, pelada?.id)
  const [scoreA, setScoreA] = useState(String(initial?.scoreA ?? 0))
  const [scoreB, setScoreB] = useState(String(initial?.scoreB ?? 0))
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [drafts, setDrafts] = useState<StatDraft[] | null>(null)
  const [error, setError] = useState('')

  // Os jogadores vêm dos confirmados: registar estatísticas de quem faltou é
  // exatamente o que o servidor recusa, portanto nem se oferece a linha.
  useEffect(() => {
    let active = true
    void listConfirmedPlayers(game.id)
      .then((players) => {
        if (!active) return
        const existing = new Map((initial?.players ?? []).map((player) => [player.membershipId, player]))
        setDrafts(players.map((player) => ({
          membershipId: player.id,
          displayName: player.name,
          goals: existing.get(player.id)?.goals ?? 0,
          assists: existing.get(player.id)?.assists ?? 0,
          ownGoals: existing.get(player.id)?.ownGoals ?? 0,
          saves: existing.get(player.id)?.saves ?? 0,
        })))
      })
      .catch(() => { if (active) setDrafts([]) })
    return () => { active = false }
    // `initial` só semeia os valores iniciais do formulário; recarregar a cada
    // mudança de referência apagaria o que o utilizador já escreveu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id])

  const update = (membershipId: string, field: keyof StatInput, value: string) => {
    setDrafts((current) => (current ?? []).map((draft) => (
      draft.membershipId === membershipId ? { ...draft, [field]: Math.max(Number(value) || 0, 0) } : draft
    )))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      await save.mutateAsync({
        scoreA: Number(scoreA) || 0,
        scoreB: Number(scoreB) || 0,
        notes,
        stats: drafts ?? [],
      })
      onSaved()
    } catch {
      setError(t('games.resultError'))
    }
  }

  return (
    <Card className="result-form">
      <form onSubmit={submit}>
        <div className="field-grid">
          <label htmlFor={`score-a-${game.id}`}>{t('games.scoreLabelA')}
            <input id={`score-a-${game.id}`} type="number" min={0} max={99} value={scoreA} onChange={(event) => setScoreA(event.target.value)}/>
          </label>
          <label htmlFor={`score-b-${game.id}`}>{t('games.scoreLabelB')}
            <input id={`score-b-${game.id}`} type="number" min={0} max={99} value={scoreB} onChange={(event) => setScoreB(event.target.value)}/>
          </label>
        </div>

        <h4>{t('games.statsHeading')}</h4>
        <div className="stat-rows">
          {(drafts ?? []).map((draft) => (
            <div className="stat-row" key={draft.membershipId}>
              <span>{draft.displayName}</span>
              <label>
                <small>{t('games.statGoals')}</small>
                <input type="number" min={0} max={99} value={draft.goals}
                  aria-label={`${t('games.statGoals')} — ${draft.displayName}`}
                  onChange={(event) => update(draft.membershipId, 'goals', event.target.value)}/>
              </label>
              <label>
                <small>{t('games.statAssists')}</small>
                <input type="number" min={0} max={99} value={draft.assists}
                  aria-label={`${t('games.statAssists')} — ${draft.displayName}`}
                  onChange={(event) => update(draft.membershipId, 'assists', event.target.value)}/>
              </label>
              <label>
                <small>{t('games.statSaves')}</small>
                <input type="number" min={0} max={99} value={draft.saves}
                  aria-label={`${t('games.statSaves')} — ${draft.displayName}`}
                  onChange={(event) => update(draft.membershipId, 'saves', event.target.value)}/>
              </label>
            </div>
          ))}
        </div>

        <label htmlFor={`notes-${game.id}`}>{t('games.resultNotesLabel')}
          <textarea id={`notes-${game.id}`} maxLength={500} placeholder={t('games.resultNotesPlaceholder')}
            value={notes} onChange={(event) => setNotes(event.target.value)}/>
        </label>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="result-form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>{t('games.cancel')}</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? t('games.savingResult') : t('games.saveResult')}</Button>
        </div>
      </form>
    </Card>
  )
}
