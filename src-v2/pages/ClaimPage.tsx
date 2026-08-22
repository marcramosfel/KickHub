import { Check, KeyRound, UserCheck, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { useI18n, type TranslationKey } from '../lib/i18n'
import {
  normalizeClaimCode,
  toClaimFailure,
  useAbsorbLegacyClaim,
  useClaimLegacyProfile,
  usePeekLegacyClaim,
  type ClaimFailure,
} from '../lib/legacy-claim'

/**
 * Onde quem vem da Pelada Browns recupera o seu histórico.
 *
 * Duas portas para o mesmo sítio. Pelo link — `/reclamar/<código>` — o código já
 * vem no endereço e a página só pergunta se é mesmo a pessoa certa. À mão, para
 * quem recebeu o código por outra via, o formulário continua lá.
 *
 * A pergunta antes de ligar não é cerimónia. O código gasta-se uma vez, e quem
 * abrir o link com a sessão errada aberta queimava-o na conta errada — sem
 * volta. Perguntar custa um clique; enganar-se custa o histórico.
 *
 * E há duas maneiras de o histórico chegar à conta: quem ainda não tem nada
 * passa a ser o perfil antigo; quem já tem — porque se registou primeiro e só
 * depois soube que o seu passado lá estava — funde os dois.
 */
export function ClaimPage() {
  const { t, formatDate } = useI18n()
  const navigate = useNavigate()
  const { code: codeFromUrl = '' } = useParams()
  const claim = useClaimLegacyProfile()
  const absorb = useAbsorbLegacyClaim()
  const peek = usePeekLegacyClaim(codeFromUrl)
  const [code, setCode] = useState('')
  const [failure, setFailure] = useState<ClaimFailure | ''>('')

  const message = (reason: ClaimFailure): TranslationKey => `claim.error${reason}` as TranslationKey

  const run = async (value: string, merge: boolean) => {
    setFailure('')
    try {
      await (merge ? absorb : claim).mutateAsync(value)
      navigate('/app', { replace: true })
    } catch (error) {
      setFailure(toClaimFailure(error))
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFailure('')
    if (normalizeClaimCode(code).replace(/-/g, '').length !== 32) {
      setFailure('INVALID_CLAIM')
      return
    }
    await run(code, false)
  }

  const busy = claim.isPending || absorb.isPending

  // Sem `<main id="main-content">`: esta página vive dentro do AppShell, que já
  // tem o seu. Dois com o mesmo id são HTML inválido e mandam a ligação de
  // saltar para o conteúdo para o sítio errado.
  if (codeFromUrl) {
    const failed = failure || (peek.error ? toClaimFailure(peek.error) : '')
    return (
      <div className="page claim-page">
        <Card className="claim-card">
          <span className="claim-icon" aria-hidden="true"><UserCheck size={22}/></span>
          {peek.isPending ? <h1>{t('claim.linkChecking')}</h1> : null}

          {peek.data ? (<>
            <h1>{t('claim.linkTitle')}</h1>
            <p>{t('claim.linkBody', {
              player: peek.data.playerName, pelada: peek.data.peladaName,
            })}</p>
            {peek.data.needsMerge ? (
              <p className="claim-merge-note"><Users size={14}/> {t('claim.linkMergeNote')}</p>
            ) : null}

            {failed ? <p className="form-error" role="alert">{t(message(failed))}</p> : null}

            <Button
              type="button"
              disabled={busy}
              onClick={() => run(codeFromUrl, peek.data.needsMerge)}
            >
              {busy ? t('claim.claiming') : t('claim.linkConfirm')}
            </Button>
            <p className="claim-foot"><Check size={14}/> {t('claim.linkExpiry', {
              date: formatDate(peek.data.expiresAt, { dateStyle: 'medium' }),
            })}</p>
          </>) : null}

          {failed && !peek.data ? (
            <><h1>{t('claim.title')}</h1>
            <p className="form-error" role="alert">{t(message(failed))}</p></>
          ) : null}
        </Card>
      </div>
    )
  }

  return (
    <div className="page claim-page">
      <Card className="claim-card">
        <span className="claim-icon" aria-hidden="true"><KeyRound size={22}/></span>
        <h1>{t('claim.title')}</h1>
        <p>{t('claim.body')}</p>

        <form onSubmit={submit}>
          <label htmlFor="claim-code">{t('claim.label')}</label>
          <input
            id="claim-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="claim-hint"
          />
          <small id="claim-hint">{t('claim.hint')}</small>

          {failure ? <p className="form-error" role="alert">{t(message(failure))}</p> : null}

          <Button type="submit" disabled={busy}>
            {claim.isPending ? t('claim.claiming') : t('claim.submit')}
          </Button>
        </form>

        {/* O código continua no campo, e é o mesmo que se envia: quem chega aqui
            já provou tê-lo, e mandá-lo colar outra vez não provava mais nada. */}
        {failure === 'ACCOUNT_ALREADY_LINKED' ? (
          <div className="claim-merge">
            <h2><Users size={16}/> {t('claim.mergeTitle')}</h2>
            <p>{t('claim.mergeBody')}</p>
            <Button type="button" variant="secondary" onClick={() => run(code, true)} disabled={busy}>
              {absorb.isPending ? t('claim.merging') : t('claim.mergeSubmit')}
            </Button>
          </div>
        ) : null}

        <p className="claim-foot"><Check size={14}/> {t('claim.privacy')}</p>
      </Card>
    </div>
  )
}
