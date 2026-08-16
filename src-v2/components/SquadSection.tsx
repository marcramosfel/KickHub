import { Check, Pencil, ShieldCheck, UsersRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Avatar, Badge, Button, Card, EmptyState } from '../components/ui'
import { computePlayerOverall, isProvisional } from '../domain/player-overall'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { usePeladaRanking, type RankingRow } from '../lib/ranking'
import { roleLabel } from '../lib/role-label'
import {
  canEditMember, canEditOverall, playerTypes, positions, usePeladaSquad, useSquadMutations,
  type PlayerType, type Position, type SquadMember,
} from '../lib/squad'

const positionKey = (value: Position) => `squad.pos${value}` as TranslationKey
const playerTypeKey = (value: PlayerType) => `squad.type${value}` as TranslationKey

export function SquadSection() {
  const { t } = useI18n()
  const { pelada, isDemo, canAdmin } = useCurrentPelada()
  const squad = usePeladaSquad(pelada?.id, !isDemo)
  const [editing, setEditing] = useState('')
  const [notice, setNotice] = useState('')

  if (isDemo) {
    return (
      <div className="squad-section">
        <SquadHeading count={null}/>
        <p className="inline-notice" role="status"><ShieldCheck/> {t('squad.demoNotice')}</p>
      </div>
    )
  }

  const members = squad.data ?? []

  return (
    <div className="squad-section">
      <SquadHeading count={squad.isPending ? null : members.length}/>

      {notice ? <p className="inline-notice" role="status"><Check/> {notice}</p> : null}

      {squad.isPending ? (
        <div className="squad-list" aria-label={t('squad.loading')} aria-busy="true">
          {[0, 1, 2].map((item) => <div className="squad-card squad-card-skeleton" key={item} aria-hidden="true"><span/><i/><b/></div>)}
        </div>
      ) : squad.isError ? (
        <Card className="dashboard-data-state" role="alert">
          <ShieldCheck/>
          <div><h3>{t('squad.errorTitle')}</h3><p>{t('squad.errorBody')}</p></div>
          <button type="button" className="btn btn-outline btn-md" onClick={() => void squad.refetch()}>{t('dashboard.retry')}</button>
        </Card>
      ) : members.length <= 1 && members.every((member) => member.isMe) ? (
        <>
          {members.map((member) => (
            <MemberCard
              key={member.membershipId}
              member={member}
              canAdmin={canAdmin}
              editing={editing === member.membershipId}
              onEdit={() => { setEditing(member.membershipId); setNotice('') }}
              onClose={() => setEditing('')}
              onSaved={(name) => { setEditing(''); setNotice(t('squad.savedNotice', { name })) }}
            />
          ))}
          <EmptyState icon={<UsersRound/>} title={t('squad.emptyTitle')} body={t('squad.emptyBody')}/>
        </>
      ) : (
        <div className="squad-list">
          {members.map((member) => (
            <MemberCard
              key={member.membershipId}
              member={member}
              canAdmin={canAdmin}
              editing={editing === member.membershipId}
              onEdit={() => { setEditing(member.membershipId); setNotice('') }}
              onClose={() => setEditing('')}
              onSaved={(name) => { setEditing(''); setNotice(t('squad.savedNotice', { name })) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SquadHeading({ count }: { count: number | null }) {
  const { t } = useI18n()
  return (
    <header className="page-heading">
      <span className="eyebrow dark-text">{t('squad.eyebrow')}</span>
      <h1>{t('squad.title')}</h1>
      <p>{t('squad.subtitle')}</p>
      {count === null ? null : <span className="muted-count">{t('squad.count', { count })}</span>}
    </header>
  )
}

function MemberCard({ member, canAdmin, editing, onEdit, onClose, onSaved }: {
  member: SquadMember
  canAdmin: boolean
  editing: boolean
  onEdit: () => void
  onClose: () => void
  onSaved: (name: string) => void
}) {
  const { t, formatNumber } = useI18n()

  if (editing) {
    return <MemberForm member={member} canAdmin={canAdmin} onClose={onClose} onSaved={onSaved}/>
  }

  return (
    <Card className="squad-card">
      <Avatar name={member.displayName} size="md"/>
      <div className="squad-identity">
        <strong>{member.displayName}{member.isMe ? <span className="squad-you">{t('squad.you')}</span> : null}</strong>
        <small>{member.username ? `@${member.username} · ` : ''}{roleLabel(member.role, t)}</small>
      </div>
      <div className="squad-attributes">
        {member.primaryPosition
          ? <Badge tone="lime">{t(positionKey(member.primaryPosition))}</Badge>
          : <span className="squad-missing">{t('squad.noPosition')}</span>}
        {member.secondaryPosition ? <Badge tone="neutral">{t(positionKey(member.secondaryPosition))}</Badge> : null}
      </div>
      <div className="squad-overall">
        {member.overall === null
          ? <small>{t('squad.noOverall')}</small>
          : <><strong>{formatNumber(member.overall)}</strong><small>{t('squad.overallLabel')}</small></>}
      </div>
      {canEditMember(member, canAdmin)
        ? <Button variant="outline" size="sm" onClick={onEdit}><Pencil size={14}/> {t('squad.edit')}</Button>
        : null}
    </Card>
  )
}

function MemberForm({ member, canAdmin, onClose, onSaved }: {
  member: SquadMember
  canAdmin: boolean
  onClose: () => void
  onSaved: (name: string) => void
}) {
  const { t, formatNumber } = useI18n()
  const { pelada } = useCurrentPelada()
  const save = useSquadMutations(pelada?.id)
  // A sugestão vem das estatísticas acumuladas; só quem administra a pode aplicar.
  const ranking = usePeladaRanking(pelada?.id, canAdmin)
  const stats: RankingRow | undefined = (ranking.data ?? []).find((row) => row.membershipId === member.membershipId)
  const suggestion = stats ? computePlayerOverall(stats) : null
  const [playerType, setPlayerType] = useState<PlayerType | ''>(member.playerType ?? '')
  const [primary, setPrimary] = useState<Position | ''>(member.primaryPosition ?? '')
  const [secondary, setSecondary] = useState<Position | ''>(member.secondaryPosition ?? '')
  const [accepts, setAccepts] = useState(member.acceptsOtherPositions)
  const [overall, setOverall] = useState(member.overall === null ? '' : String(member.overall))
  const [error, setError] = useState('')
  const editableOverall = canEditOverall(canAdmin)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      await save.mutateAsync({
        membershipId: member.membershipId,
        playerType: playerType || null,
        primaryPosition: primary || null,
        secondaryPosition: secondary || null,
        acceptsOtherPositions: accepts,
        // Reenviar o valor atual mantém a RPC a ver "sem alteração" e evita a
        // recusa por OVERALL_REQUIRES_ADMIN a quem edita o próprio perfil.
        overall: editableOverall ? (overall === '' ? null : Number(overall)) : member.overall,
      })
      onSaved(member.displayName)
    } catch {
      setError(t('squad.saveError'))
    }
  }

  return (
    <Card className="squad-card squad-card-editing">
      <form onSubmit={submit}>
        <h2>{member.displayName}</h2>
        <div className="field-grid">
          <label htmlFor={`type-${member.membershipId}`}>{t('squad.playerTypeLabel')}
            <select id={`type-${member.membershipId}`} value={playerType} onChange={(event) => setPlayerType(event.target.value as PlayerType | '')}>
              <option value="">{t('squad.none')}</option>
              {playerTypes.map((value) => <option key={value} value={value}>{t(playerTypeKey(value))}</option>)}
            </select>
          </label>
          <label htmlFor={`primary-${member.membershipId}`}>{t('squad.primaryLabel')}
            <select id={`primary-${member.membershipId}`} value={primary} onChange={(event) => setPrimary(event.target.value as Position | '')}>
              <option value="">{t('squad.none')}</option>
              {positions.map((value) => <option key={value} value={value}>{t(positionKey(value))}</option>)}
            </select>
          </label>
          <label htmlFor={`secondary-${member.membershipId}`}>{t('squad.secondaryLabel')}
            <select id={`secondary-${member.membershipId}`} value={secondary} onChange={(event) => setSecondary(event.target.value as Position | '')}>
              <option value="">{t('squad.none')}</option>
              {positions.map((value) => <option key={value} value={value}>{t(positionKey(value))}</option>)}
            </select>
          </label>
          {/* A dica fica fora do label: dentro dele passaria a fazer parte do
              nome acessível do campo, em vez de ser apenas a sua descrição. */}
          <div className="squad-overall-field">
            <label htmlFor={`overall-${member.membershipId}`}>{t('squad.overallLabel')}
              <input
                id={`overall-${member.membershipId}`}
                type="number"
                min={1}
                max={99}
                value={overall}
                disabled={!editableOverall}
                onChange={(event) => setOverall(event.target.value)}
                aria-describedby={`overall-hint-${member.membershipId}`}
              />
            </label>
            <small id={`overall-hint-${member.membershipId}`}>
              {editableOverall ? t('squad.overallHint') : t('squad.overallLocked')}
            </small>
            {editableOverall ? (
              <div className="squad-suggestion">
                {suggestion === null ? (
                  <small>{t('squad.noSuggestion')}</small>
                ) : (
                  <>
                    <small>{t('squad.suggestedOverall', { value: formatNumber(suggestion) })}</small>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setOverall(String(suggestion))}>
                      {t('squad.applySuggestion', { value: formatNumber(suggestion) })}
                    </Button>
                    {stats && isProvisional(stats) ? <small>{t('squad.suggestionProvisional')}</small> : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <label className="squad-accepts" htmlFor={`accepts-${member.membershipId}`}>
          <input id={`accepts-${member.membershipId}`} type="checkbox" checked={accepts} onChange={(event) => setAccepts(event.target.checked)}/>
          {t('squad.acceptsLabel')}
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="squad-form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>{t('squad.cancel')}</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? t('squad.saving') : t('squad.save')}</Button>
        </div>
      </form>
    </Card>
  )
}
