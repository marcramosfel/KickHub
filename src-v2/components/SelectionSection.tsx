import { Crown, ShieldCheck, Sparkles, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  buildSelections,
  DEFAULT_TEAM_SIZE,
  type Selection,
  type SelectionPosition,
} from '../domain/pelada-selection'
import { useSignedAvatars } from '../lib/avatars'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { usePeladaPlayers, type PeladaPlayer } from '../lib/pelada-players'
import { usePeladaSettings } from '../lib/pelada-settings'
import { usePeladaTotals } from '../lib/ranking'
import { PlayerCardModal } from './PlayerCardModal'
import { ShareButton } from './ShareButton'
import { Avatar, Badge, Card, EmptyState } from './ui'

const positionLabels: Record<SelectionPosition, TranslationKey> = {
  GK: 'selection.positionGK', DEF: 'selection.positionDEF',
  MID: 'selection.positionMID', ATT: 'selection.positionATT',
}

export function SelectionSection() {
  const { t } = useI18n()
  const { pelada } = useCurrentPelada()
  const settings = usePeladaSettings(pelada?.id, true)
  const { players, avatarSources, isPending, isError, refetch } = usePeladaPlayers(pelada?.id)
  // A anti-seleção começa fechada. É uma piada, mas é uma piada sobre pessoas
  // reais — quem a quiser ver, abre-a.
  const [showWorst, setShowWorst] = useState(false)
  const [openPlayer, setOpenPlayer] = useState<PeladaPlayer | null>(null)
  const totals = usePeladaTotals(pelada?.id, true)

  // O campo desenha `SelectedPlayer`, que é o jogador já colocado num lugar. O
  // card precisa do jogador inteiro — daí a volta pelo plantel.
  const openById = (membershipId: string) =>
    setOpenPlayer(players.find((entry) => entry.membershipId === membershipId) ?? null)

  const teamSize = settings.data?.defaultTeamSize ?? DEFAULT_TEAM_SIZE
  const { best, worst } = useMemo(
    () => buildSelections({ players, teamSize }),
    [players, teamSize],
  )

  const avatars = useSignedAvatars(avatarSources)

  if (isPending) {
    return <div className="selection-state" role="status" aria-busy="true"><Sparkles/><p>{t('selection.loading')}</p></div>
  }
  if (isError) {
    return (
      <Card className="dashboard-data-state" role="alert">
        <ShieldCheck/>
        <div><h3>{t('selection.errorTitle')}</h3><p>{t('selection.errorBody')}</p></div>
        <button type="button" className="btn btn-outline btn-md" onClick={refetch}>{t('dashboard.retry')}</button>
      </Card>
    )
  }
  if (!best.goalkeeper && !best.outfield.length) {
    return <EmptyState icon={<Trophy/>} title={t('selection.emptyTitle')} body={t('selection.emptyBody')}/>
  }

  return (
    <div className="selection-page">
      <header className="page-heading">
        <span className="eyebrow dark-text">{t('selection.eyebrow')}</span>
        <h1>{t('selection.title')}</h1>
        <p>{t('selection.subtitle')}</p>
      </header>

      <SelectionPoster
        selection={best}
        title={t('selection.title')}
        subtitle={t('selection.season', { year: new Date().getFullYear() })}
        avatars={avatars}
        onOpen={openById}
        crowned
      />
      <p className="selection-note">{t('selection.note')}</p>
      <span className="selection-toggle"><ShareButton content={() => ({
        title: t('selection.title'),
        text: t('selection.shareText', {
          formation: best.formation.name,
          names: [best.goalkeeper, ...best.outfield].filter(Boolean).map((player) => player!.displayName).join(', '),
        }),
      })}/></span>

      {showWorst ? (
        <>
          {/* Sem coroa: o "craque" da anti-seleção não é piada nenhuma para
              quem lá está. */}
          <SelectionPoster
            selection={worst}
            title={t('selection.antiTitle')}
            subtitle={t('selection.antiSubtitle')}
            avatars={avatars}
            onOpen={openById}
          />
          <p className="selection-note">{t('selection.antiNote')}</p>
          <button type="button" className="btn btn-ghost btn-sm selection-toggle" onClick={() => setShowWorst(false)}>
            {t('selection.antiHide')}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-outline btn-md selection-toggle" onClick={() => setShowWorst(true)}>
          😬 {t('selection.antiShow')}
        </button>
      )}

      {openPlayer && <PlayerCardModal
        player={openPlayer}
        squad={players}
        avatars={avatars}
        peladaName={pelada?.name ?? ''}
        totalRounds={totals.data?.gamesPlayed}
        onClose={() => setOpenPlayer(null)}
      />}
    </div>
  )
}

function SelectionPoster({ selection, title, subtitle, avatars, onOpen, crowned = false }: {
  selection: Selection
  title: string
  subtitle: string
  avatars: Map<string, string>
  onOpen: (membershipId: string) => void
  crowned?: boolean
}) {
  const { t, formatNumber } = useI18n()
  // A coroa fica no campo. O guarda-redes tem escala própria e coroá-lo era
  // dizer que 80 na baliza vale mais do que 78 no ataque — números que não se
  // comparam. É a mesma regra do cartaz da Browns.
  const starId = crowned
    ? selection.outfield.reduce<{ id: string; overall: number } | null>((star, player) =>
      !star || player.overall > star.overall ? { id: player.membershipId, overall: player.overall } : star, null)?.id
    : undefined

  return (
    <Card className="selection-poster">
      <header className="selection-poster-head">
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        <div className="selection-poster-meta">
          <Badge tone="lime">{t('selection.formation', { name: selection.formation.name })}</Badge>
          {selection.average !== null && <Badge tone="neutral">{t('selection.average', { value: formatNumber(selection.average) })}</Badge>}
        </div>
      </header>

      {/* Ordem de leitura de trás para a frente — guarda-redes, defesa, meio,
          ataque — e o campo desenha-se ao contrário (`column-reverse`), com a
          baliza em baixo, que é como se olha para um campo. */}
      <div className="selection-pitch">
        <div className="selection-line selection-line-gk">
          {selection.goalkeeper
            ? <PlayerSlot player={selection.goalkeeper} avatars={avatars} onOpen={onOpen} star={selection.goalkeeper.membershipId === starId}/>
            : <EmptySlot position="GK"/>}
        </div>
        {selection.formation.lines.map((line) => (
          <div className={`selection-line selection-line-${line.position.toLowerCase()}`} key={line.position}>
            {Array.from({ length: line.count }, (_, index) => {
              const player = selection.outfield.find((entry) => entry.slot === line.position && entry.slotIndex === index)
              return player
                ? <PlayerSlot key={`${line.position}-${index}`} player={player} avatars={avatars} onOpen={onOpen} star={player.membershipId === starId}/>
                : <EmptySlot key={`${line.position}-${index}`} position={line.position}/>
            })}
          </div>
        ))}
      </div>

      {!selection.complete && selection.missing.length > 0 && (
        <p className="selection-incomplete">{t('selection.incomplete', { count: selection.missing.length })}</p>
      )}
    </Card>
  )
}

function PlayerSlot({ player, avatars, onOpen, star }: {
  player: { membershipId: string; displayName: string; overall: number; slot: SelectionPosition }
  avatars: Map<string, string>
  onOpen: (membershipId: string) => void
  star: boolean
}) {
  const { t, formatNumber } = useI18n()
  // Um `<button>` e não uma `<div>` com onClick: assim chega-lhe o Tab, o
  // Enter e o leitor de ecrã, sem `tabindex` inventado.
  return (
    <button
      type="button"
      className={`selection-slot${star ? ' selection-slot-star' : ''}`}
      onClick={() => onOpen(player.membershipId)}
      aria-label={t('selection.openCard', { name: player.displayName })}
    >
      {star && <span className="selection-crown" aria-hidden="true"><Crown/></span>}
      <Avatar name={player.displayName} size="md" src={avatars.get(player.membershipId)}/>
      <strong>{player.displayName}</strong>
      <small>
        <span className="selection-slot-position">{t(positionLabels[player.slot])}</span>
        <b>{formatNumber(player.overall)}</b>
      </small>
    </button>
  )
}

function EmptySlot({ position }: { position: SelectionPosition }) {
  const { t } = useI18n()
  return (
    <div className="selection-slot selection-slot-empty">
      <span className="selection-slot-hole" aria-hidden="true"/>
      <strong>{t('selection.emptySlot')}</strong>
      <small><span className="selection-slot-position">{t(positionLabels[position])}</span></small>
    </div>
  )
}
