import { Check, KeyRound, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { useI18n, type TranslationKey } from '../lib/i18n'
import {
  normalizeClaimCode,
  toClaimFailure,
  useAbsorbLegacyClaim,
  useClaimLegacyProfile,
  type ClaimFailure,
} from '../lib/legacy-claim'

/**
 * Onde quem vem da Pelada Browns recupera o seu histórico.
 *
 * O código chega pela Browns, já autenticada — é lá que a pessoa prova ser quem
 * diz, com o PIN que já tem. Aqui só se cola, e o servidor faz o resto numa só
 * transação.
 *
 * Há duas maneiras de o histórico chegar à conta, e a diferença não é detalhe:
 * quem ainda não tem perfil fica a ser o perfil antigo; quem já tem — porque se
 * registou primeiro e só depois soube que o seu passado lá estava — junta os
 * dois. O servidor recusa a primeira via nesse caso, e é dessa recusa que nasce
 * a proposta de juntar, em vez de um beco sem saída.
 */
export function ClaimPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const claim = useClaimLegacyProfile()
  const absorb = useAbsorbLegacyClaim()
  const [code, setCode] = useState('')
  const [failure, setFailure] = useState<ClaimFailure | ''>('')

  const message = (reason: ClaimFailure): TranslationKey => `claim.error${reason}` as TranslationKey

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFailure('')
    if (normalizeClaimCode(code).replace(/-/g, '').length !== 32) {
      setFailure('INVALID_CLAIM')
      return
    }
    try {
      await claim.mutateAsync(code)
      navigate('/app', { replace: true })
    } catch (error) {
      setFailure(toClaimFailure(error))
    }
  }

  const merge = async () => {
    setFailure('')
    try {
      await absorb.mutateAsync(code)
      navigate('/app', { replace: true })
    } catch (error) {
      setFailure(toClaimFailure(error))
    }
  }

  const busy = claim.isPending || absorb.isPending

  // Sem `<main id="main-content">`: esta página vive dentro do AppShell, que já
  // tem o seu. Dois com o mesmo id são HTML inválido e mandam a ligação de
  // saltar para o conteúdo para o sítio errado.
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
            <Button type="button" variant="secondary" onClick={merge} disabled={busy}>
              {absorb.isPending ? t('claim.merging') : t('claim.mergeSubmit')}
            </Button>
          </div>
        ) : null}

        <p className="claim-foot"><Check size={14}/> {t('claim.privacy')}</p>
      </Card>
    </div>
  )
}
