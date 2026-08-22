import { Check, Shuffle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../components/ui'
import { MatchField, type FieldTeam } from './MatchField'
import { explainSquadOverall } from '../domain/player-overall'
import { DrawError, generateBalancedTeams, type DrawResult } from '../domain/team-draw'
import { useSignedAvatars, type AvatarSource } from '../lib/avatars'
import { useCurrentPelada } from '../lib/current-pelada'
import type { Game } from '../lib/games'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { listConfirmedPlayers, useGameLineup, useLineupMutations, type LineupEntry } from '../lib/lineups'
import { usePeladaPlayers } from '../lib/pelada-players'
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
  // As fotos do pré-sorteio vêm da mesma leitura das presenças; as das equipas
  // já guardadas vêm da escalação. Assinam-se juntas para não fazer duas voltas
  // ao Storage quando as duas listas estão no ecrã.
  const [previewAvatars, setPreviewAvatars] = useState<AvatarSource[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const teamSize = teamSizeOf(game)
  const missing = teamSize * 2 - game.confirmedCount
  const savedTeams = saved.data ?? []
  const avatars = useSignedAvatars([
    ...previewAvatars,
    ...savedTeams.map((entry) => ({
      id: entry.membershipId, path: entry.avatarPath, bucket: entry.avatarBucket,
    })),
  ])

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
      const [attendance, settings, ranking] = await Promise.all([
        listConfirmedPlayers(game.id),
        pelada ? getPeladaSettings(pelada.id) : Promise.resolve(null),
        pelada ? getPeladaRanking(pelada.id) : Promise.resolve([]),
      ])
      // Duas passagens, como no plantel: os títulos dependem do plantel inteiro.
      const { players, avatars } = attendance
      setPreviewAvatars(avatars)
      const overallByMember = explainSquadOverall(ranking)
      // A semente inclui a hora para que voltar a sortear dê equipas novas; a
      // semente usada fica gravada, portanto o resultado continua reproduzível.
      const result = generateBalancedTeams({
        players: players.map((player) => ({
          ...player,
          overall: overallByMember.get(player.id)?.overall ?? null,
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
          {/* O campo **em vez** das listas, e não por cima delas. Repetir os
              mesmos trinta nomes logo a seguir duplicava a altura da página no
              telemóvel e não acrescentava nada: a posição, o overall e quem vai
              à baliza já estão todos no campo. */}
          <MatchField
            teams={[
              {
                key: 'A', label: t('games.teamA'),
                players: preview.teams[0].players.map((p) => ({ ...p, photo: avatars.get(p.id) })),
                meta: t('games.teamStrength', { value: formatNumber(preview.teams[0].strength) }),
              },
              {
                key: 'B', label: t('games.teamB'),
                players: preview.teams[1].players.map((p) => ({ ...p, photo: avatars.get(p.id) })),
                meta: t('games.teamStrength', { value: formatNumber(preview.teams[1].strength) }),
              },
            ]}
          />
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
        <SavedTeams entries={savedTeams} avatars={avatars}/>
      ) : null}
    </div>
  )
}

function SavedTeams({ entries, avatars }: { entries: LineupEntry[]; avatars: Map<string, string> }) {
  const { t } = useI18n()
  const { pelada } = useCurrentPelada()
  // A escalação guardada não traz a posição de cada um — guarda quem jogou e de
  // que lado. A posição vem do plantel, que já está em memória para o card do
  // jogador: procurá-la aqui não custa um pedido, e inventá-la custava a
  // credibilidade do campo inteiro.
  const { players: squad } = usePeladaPlayers(pelada?.id)
  const positionOf = useMemo(
    () => new Map(squad.map((player) => [player.membershipId, player.primaryPosition])),
    [squad],
  )
  const fieldTeams = useMemo<[FieldTeam, FieldTeam]>(() => {
    const build = (key: 'A' | 'B'): FieldTeam => ({
      key,
      label: key === 'A' ? t('games.teamA') : t('games.teamB'),
      players: entries.filter((entry) => entry.team === key).map((entry) => ({
        id: entry.membershipId,
        name: entry.displayName,
        photo: avatars.get(entry.membershipId),
        // Um overall estimado não é um overall: no campo aparece "—", como em
        // todo o resto da app, em vez de um número que ninguém votou.
        overall: entry.overallEstimated ? null : entry.overallAtDraw,
        isGoalkeeper: entry.isGoalkeeper,
        primaryPosition: positionOf.get(entry.membershipId) ?? null,
      })),
    })
    return [build('A'), build('B')]
  }, [avatars, entries, positionOf, t])

  return (
    <>
    <MatchField teams={fieldTeams}/>
    </>
  )
}
