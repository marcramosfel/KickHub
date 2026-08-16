import { Check, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card } from '../components/ui'
import { computePlayerOverall } from '../domain/player-overall'
import { DrawError, generateBalancedTeams, type DrawResult } from '../domain/team-draw'
import { useCurrentPelada } from '../lib/current-pelada'
import type { Game } from '../lib/games'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { listConfirmedPlayers, useGameLineup, useLineupMutations, type LineupEntry } from '../lib/lineups'
import { getPeladaSettings } from '../lib/pelada-settings'
import { getPeladaRanking } from '../lib/ranking'

const balanceKey = (level: string) => `games.balance${level.charAt(0).toUpperCase()}${level.slice(1)}` as TranslationKey

/** Jogadores por equipa a partir do formato do jogo, com recurso ao team_size. */
function teamSizeOf(game: Game) {
  const parsed = Number(game.format.split('x')[0])
  return Number.isFinite(parsed) && parsed >= 3 ? parsed : game.teamSize
}

export function GameDraw({ game }: { game: Game }) {
  const { t, formatNumber } = useI18n()
  const { pelada, canAdmin } = useCurrentPelada()
  const saved = useGameLineup(game.id, true)
  const save = useLineupMutations(game.id, pelada?.id)
  const [preview, setPreview] = useState<DrawResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const teamSize = teamSizeOf(game)
  const missing = teamSize * 2 - game.confirmedCount
  const savedTeams = saved.data ?? []

  const draw = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      // As definições são lidas no momento do sorteio, e não de uma consulta em
      // segundo plano: se ainda não tivessem chegado, o sorteio caía no modo por
      // omissão e podia juntar os dois guarda-redes numa pelada que os separa.
      // O ranking entra na mesma leitura porque o sorteio tem de equilibrar
      // pelo mesmo overall que o ranking publica. Enquanto usou a nota escrita
      // à mão, o número que decidia as equipas não era o número que a pelada
      // via — a mesma jogadora valia 82 aqui e 53 na tabela.
      const [players, settings, ranking] = await Promise.all([
        listConfirmedPlayers(game.id),
        pelada ? getPeladaSettings(pelada.id) : Promise.resolve(null),
        pelada ? getPeladaRanking(pelada.id) : Promise.resolve([]),
      ])
      const statsByMember = new Map(ranking.map((row) => [row.membershipId, row]))
      // A semente inclui a hora para que voltar a sortear dê equipas novas; a
      // semente usada fica gravada, portanto o resultado continua reproduzível.
      const result = generateBalancedTeams({
        players: players.map((player) => ({
          ...player,
          overall: computePlayerOverall({
            gamesPlayed: statsByMember.get(player.id)?.gamesPlayed ?? 0,
            goals: statsByMember.get(player.id)?.goals ?? 0,
            assists: statsByMember.get(player.id)?.assists ?? 0,
            baseRating: player.overall,
          }),
        })),
        teamSize,
        goalkeeperMode: settings?.goalkeeperMode ?? 'rotating',
        seed: `${game.id}:${Date.now()}`,
      })
      setPreview(result)
    } catch (cause) {
      setError(cause instanceof DrawError ? t('games.drawError') : t('games.saveDrawError'))
    } finally {
      setBusy(false)
    }
  }

  const persist = async () => {
    if (!preview) return
    setError('')
    try {
      await save.mutateAsync(preview)
      setPreview(null)
      setNotice(t('games.drawSaved'))
    } catch {
      setError(t('games.saveDrawError'))
    }
  }

  if (!canAdmin && savedTeams.length === 0) return null

  return (
    <div className="game-draw">
      <div className="game-draw-head">
        <h3>{t('games.drawTitle')}</h3>
        {canAdmin && game.status === 'scheduled' ? (
          missing > 0 && savedTeams.length === 0 && !preview ? (
            <small>{t('games.notEnoughToDraw', { count: missing })}</small>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={draw}>
              <Shuffle size={14}/> {busy ? t('games.drawing') : savedTeams.length || preview ? t('games.redraw') : t('games.drawTeams')}
            </Button>
          )
        ) : null}
      </div>

      {notice ? <p className="inline-notice" role="status"><Check/> {notice}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {preview ? (
        <>
          <div className="draw-teams">
            {preview.teams.map((team) => (
              <Card key={team.key} className="draw-team">
                <header>
                  <strong>{t(team.key === 'A' ? 'games.teamA' : 'games.teamB')}</strong>
                  <span>{t('games.teamStrength', { value: formatNumber(team.strength) })}</span>
                </header>
                <ol>
                  {team.players.map((player) => (
                    <li key={player.id}>
                      <span>{player.name}</span>
                      {player.isGoalkeeper ? <Badge tone="blue">{t('games.goalkeeperShort')}</Badge> : null}
                      <b title={player.estimatedOverall ? t('games.estimatedOverall') : undefined}>
                        {formatNumber(player.effectiveOverall)}{player.estimatedOverall ? '*' : ''}
                      </b>
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
          <p className={`draw-balance draw-balance-${preview.balance.level}`}>
            {t('games.balancePrefix')}: {t(balanceKey(preview.balance.level))}
            {' · '}{formatNumber(preview.balance.percentage / 100, { style: 'percent', maximumFractionDigits: 1 })}
          </p>
          {preview.reserves.length > 0 ? (
            <p className="draw-reserves">{t('games.reserves')}: {preview.reserves.map((player) => player.name).join(', ')}</p>
          ) : null}
          <div className="draw-actions">
            <Button variant="ghost" onClick={() => setPreview(null)}>{t('games.discardDraw')}</Button>
            <Button disabled={save.isPending} onClick={persist}>{save.isPending ? t('games.savingDraw') : t('games.saveDraw')}</Button>
          </div>
        </>
      ) : savedTeams.length > 0 ? (
        <SavedTeams entries={savedTeams}/>
      ) : null}
    </div>
  )
}

function SavedTeams({ entries }: { entries: LineupEntry[] }) {
  const { t, formatNumber } = useI18n()
  const teams: Array<'A' | 'B'> = ['A', 'B']
  return (
    <div className="draw-teams">
      {teams.map((key) => {
        const players = entries.filter((entry) => entry.team === key)
        const strength = players.reduce((total, entry) => total + entry.overallAtDraw, 0)
        return (
          <Card key={key} className="draw-team">
            <header>
              <strong>{t(key === 'A' ? 'games.teamA' : 'games.teamB')}</strong>
              <span>{t('games.teamStrength', { value: formatNumber(strength) })}</span>
            </header>
            <ol>
              {players.map((entry) => (
                <li key={entry.membershipId}>
                  <span>{entry.displayName}</span>
                  {entry.isGoalkeeper ? <Badge tone="blue">{t('games.goalkeeperShort')}</Badge> : null}
                  <b title={entry.overallEstimated ? t('games.estimatedOverall') : undefined}>
                    {formatNumber(entry.overallAtDraw)}{entry.overallEstimated ? '*' : ''}
                  </b>
                </li>
              ))}
            </ol>
          </Card>
        )
      })}
    </div>
  )
}
