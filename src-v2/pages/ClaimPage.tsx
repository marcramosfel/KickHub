import { Check, KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { normalizeClaimCode, toClaimFailure, useClaimLegacyProfile } from '../lib/legacy-claim'

/**
 * Onde quem vem da Pelada Browns recupera o seu histórico.
 *
 * O código chega pela Browns, já autenticada — é lá que a pessoa prova ser quem
 * diz, com o PIN que já tem. Aqui só se cola, e o servidor faz o resto numa só
 * transação.
 */
export function ClaimPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const claim = useClaimLegacyProfile()
  const [code, setCode] = useState('')
  const [failure, setFailure] = useState<TranslationKey | ''>('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFailure('')
    if (normalizeClaimCode(code).replace(/-/g, '').length !== 32) {
      setFailure('claim.errorINVALID_CLAIM')
      return
    }
    try {
      await claim.mutateAsync(code)
      navigate('/app', { replace: true })
    } catch (error) {
      setFailure(`claim.error${toClaimFailure(error)}` as TranslationKey)
    }
  }

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

          {failure ? <p className="form-error" role="alert">{t(failure)}</p> : null}

          <Button type="submit" disabled={claim.isPending}>
            {claim.isPending ? t('claim.claiming') : t('claim.submit')}
          </Button>
        </form>

        <p className="claim-foot"><Check size={14}/> {t('claim.privacy')}</p>
      </Card>
    </div>
  )
}
