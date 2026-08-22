import { Check, Copy, KeyRound, RefreshCw, ShieldAlert, UserCheck, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useI18n, type TranslationKey } from '../lib/i18n'
import {
  useLegacyClaimCandidates,
  claimUrl,
  useIssueLegacyClaim,
  useIssueLegacyClaimsForPelada,
  type IssuedClaim,
  useRevokeLegacyClaim,
  type LegacyClaimCandidate,
  type LegacyClaimState,
} from '../lib/legacy-claim'
import { Badge, Button, Card } from './ui'

const stateKeys: Record<LegacyClaimState, TranslationKey> = {
  none: 'legacyClaims.stateNone',
  active: 'legacyClaims.stateActive',
  expired: 'legacyClaims.stateExpired',
  revoked: 'legacyClaims.stateRevoked',
  claimed: 'legacyClaims.stateClaimed',
}

function ClaimStateBadge({ state }: { state: LegacyClaimState }) {
  const { t } = useI18n()
  const tone = state === 'claimed' ? 'lime' : state === 'active' ? 'orange' : 'neutral'
  return <Badge tone={tone}>{state === 'claimed' ? <UserCheck/> : <KeyRound/>} {t(stateKeys[state])}</Badge>
}

export function LegacyClaimsPanel({ peladaId }: { peladaId: string }) {
  const { t, formatDate } = useI18n()
  const candidates = useLegacyClaimCandidates(peladaId)
  const issue = useIssueLegacyClaim(peladaId)
  const issueAll = useIssueLegacyClaimsForPelada(peladaId)
  const [links, setLinks] = useState<IssuedClaim[]>([])
  const revoke = useRevokeLegacyClaim(peladaId)
  const [membershipId, setMembershipId] = useState('')
  const [reason, setReason] = useState('')
  const [issuedCode, setIssuedCode] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<LegacyClaimCandidate | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const unclaimed = useMemo(
    () => (candidates.data ?? []).filter((candidate) => !candidate.hasAccount),
    [candidates.data],
  )

  if (candidates.isPending) {
    return <Card className="claim-admin-card" role="status"><RefreshCw className="spin"/><p>{t('legacyClaims.loading')}</p></Card>
  }

  if (candidates.isError) {
    return <Card className="claim-admin-card claim-admin-error" role="alert"><ShieldAlert/><div><h2>{t('legacyClaims.loadErrorTitle')}</h2><p>{t('legacyClaims.loadErrorBody')}</p></div><Button variant="outline" onClick={() => void candidates.refetch()}>{t('dashboard.retry')}</Button></Card>
  }

  if (!candidates.data?.length) return null

  const submitIssue = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice(''); setIssuedCode('')
    if (!membershipId || reason.trim().length < 8) {
      setError(t('legacyClaims.validation'))
      return
    }
    try {
      const code = await issue.mutateAsync({ membershipId, reason: reason.trim() })
      setIssuedCode(code)
      setNotice(t('legacyClaims.issuedNotice'))
    } catch { setError(t('legacyClaims.issueError')) }
  }

  const copyCode = async () => {
    // O link, e não o código: é o link que se envia, e colar o código é
    // exactamente o passo que este ecrã existe para poupar a quem o recebe.
    await navigator.clipboard.writeText(claimUrl(issuedCode))
    setNotice(t('legacyClaims.copiedNotice'))
  }

  const submitBulk = async () => {
    setError(''); setNotice(''); setIssuedCode('')
    try {
      const issued = await issueAll.mutateAsync(t('legacyClaims.bulkTitle'))
      setLinks(issued)
      setNotice(t('legacyClaims.bulkDone', { count: issued.length }))
    } catch { setError(t('legacyClaims.issueError')) }
  }

  const copyAll = async () => {
    // Uma linha por pessoa, para se cortar e colar à vontade. Sem cabeçalhos
    // nem separadores: isto vai parar a uma janela de conversa, não a um Excel.
    await navigator.clipboard.writeText(links.map((row) => `${row.displayName}: ${row.url}`).join('\n'))
    setNotice(t('legacyClaims.copiedAll'))
  }

  const submitRevoke = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('')
    if (!revokeTarget || revokeReason.trim().length < 8) {
      setError(t('legacyClaims.validation'))
      return
    }
    try {
      await revoke.mutateAsync({ membershipId: revokeTarget.membershipId, reason: revokeReason.trim() })
      setNotice(t('legacyClaims.revokedNotice'))
      setRevokeTarget(null); setRevokeReason(''); setIssuedCode('')
    } catch { setError(t('legacyClaims.revokeError')) }
  }

  return <section className="legacy-claims" aria-labelledby="legacy-claims-title">
    <div className="section-title-row"><div><span className="eyebrow dark-text">{t('legacyClaims.eyebrow')}</span><h2 id="legacy-claims-title">{t('legacyClaims.title')}</h2><p>{t('legacyClaims.subtitle')}</p></div><Badge tone="neutral">{candidates.data.length}</Badge></div>
    {(notice || error) && <p className={error ? 'inline-error' : 'inline-notice'} role={error ? 'alert' : 'status'}>{error ? <ShieldAlert/> : <Check/>} {error || notice}</p>}
    <Card className="claim-issuer">
      <form onSubmit={submitIssue}>
        <label htmlFor="legacy-member">{t('legacyClaims.memberLabel')}</label>
        <select id="legacy-member" value={membershipId} onChange={(event) => setMembershipId(event.target.value)} required>
          <option value="">{t('legacyClaims.memberPlaceholder')}</option>
          {unclaimed.map((candidate) => <option key={candidate.membershipId} value={candidate.membershipId}>{candidate.nickname || candidate.displayName}</option>)}
        </select>
        <label htmlFor="legacy-reason">{t('legacyClaims.reasonLabel')}</label>
        <input id="legacy-reason" value={reason} maxLength={240} minLength={8} onChange={(event) => setReason(event.target.value)} placeholder={t('legacyClaims.reasonPlaceholder')} required/>
        <Button disabled={issue.isPending || !unclaimed.length}><KeyRound/> {issue.isPending ? t('legacyClaims.issuing') : t('legacyClaims.issue')}</Button>
      </form>
      {issuedCode && <div className="claim-code" role="status"><div><strong>{t('legacyClaims.linkLabel')}</strong><code>{claimUrl(issuedCode)}</code><small>{t('legacyClaims.codeWarning')}</small></div><Button size="icon" variant="outline" onClick={copyCode} aria-label={t('legacyClaims.copyCode')}><Copy/></Button></div>}
    </Card>

    <Card className="claim-bulk">
      <div><h3>{t('legacyClaims.bulkTitle')}</h3><p>{t('legacyClaims.bulkBody')}</p></div>
      {links.length === 0
        ? <Button variant="secondary" onClick={submitBulk} disabled={issueAll.isPending || !unclaimed.length}>
            <KeyRound/> {issueAll.isPending ? t('legacyClaims.bulkIssuing') : t('legacyClaims.bulkIssue')}
          </Button>
        : <>
            <p className="claim-bulk-warning"><ShieldAlert/> {t('legacyClaims.bulkWarning')}</p>
            <ul className="claim-bulk-list">
              {links.map((row) => <li key={row.membershipId}><strong>{row.displayName}</strong><code>{row.url}</code></li>)}
            </ul>
            <Button variant="outline" onClick={copyAll}><Copy/> {t('legacyClaims.copyAll')}</Button>
          </>}
    </Card>
    <div className="claim-candidate-list">
      {candidates.data.map((candidate) => <Card className="claim-candidate" key={candidate.membershipId}>
        <div><strong>{candidate.nickname || candidate.displayName}</strong>{candidate.nickname && <small>{candidate.displayName}</small>}</div>
        <ClaimStateBadge state={candidate.state}/>
        <small>{candidate.expiresAt && candidate.state === 'active' ? t('legacyClaims.expires', { date: formatDate(candidate.expiresAt, { dateStyle: 'short', timeStyle: 'short' }) }) : candidate.reason || t('legacyClaims.noClaim')}</small>
        {candidate.state === 'active' && <Button variant="outline" onClick={() => { setRevokeTarget(candidate); setRevokeReason(''); setError('') }}><X/> {t('legacyClaims.revoke')}</Button>}
      </Card>)}
    </div>
    {revokeTarget && <Card className="claim-revoke"><form onSubmit={submitRevoke}><div><strong>{t('legacyClaims.revokeTitle', { name: revokeTarget.nickname || revokeTarget.displayName })}</strong><p>{t('legacyClaims.revokeBody')}</p></div><label htmlFor="legacy-revoke-reason">{t('legacyClaims.reasonLabel')}</label><input id="legacy-revoke-reason" value={revokeReason} minLength={8} maxLength={240} onChange={(event) => setRevokeReason(event.target.value)} required/><div><Button type="button" variant="outline" onClick={() => setRevokeTarget(null)}>{t('legacyClaims.cancel')}</Button><Button disabled={revoke.isPending}>{t('legacyClaims.confirmRevoke')}</Button></div></form></Card>}
  </section>
}
