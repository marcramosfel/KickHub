import { AlertTriangle, Check, Download, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import {
  DEFAULT_PRIVACY, exportFileName, exportMyData, requestAccountDeletion,
  useSavePrivacy, VISIBILITIES, type PrivacySettings, type Visibility,
} from '../lib/account'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { Button, Card } from './ui'

/**
 * As definições de conta: privacidade, exportação e apagamento.
 *
 * O apagamento pede confirmação escrita e não um segundo botão. Um clique
 * duplo desfaz-se por engano; escrever a palavra não.
 */
const visibilityKey = (value: Visibility) => `account.visibility${value.charAt(0).toUpperCase()}${value.slice(1)}` as TranslationKey

export function PrivacyPanel({ initial = DEFAULT_PRIVACY }: { initial?: PrivacySettings }) {
  const { t } = useI18n()
  const save = useSavePrivacy()
  const [form, setForm] = useState<PrivacySettings>(initial)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const update = <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const submit = async () => {
    setNotice(''); setError('')
    try {
      await save.mutateAsync(form)
      setNotice(t('account.privacySaved'))
    } catch {
      setError(t('account.privacyError'))
    }
  }

  return (
    <Card className="settings-card privacy-panel">
      <header><ShieldCheck/><div>
        <p className="eyebrow dark-text">{t('account.privacyEyebrow')}</p>
        <h2>{t('account.privacyTitle')}</h2>
        <p>{t('account.privacyBody')}</p>
      </div></header>

      <div className="privacy-fields">
        <VisibilityField id="privacy-profile" label={t('account.profileVisibility')} value={form.profile} onChange={(value) => update('profile', value)}/>
        <VisibilityField id="privacy-stats" label={t('account.statsVisibility')} value={form.stats} onChange={(value) => update('stats', value)}/>
        <VisibilityField id="privacy-peladas" label={t('account.peladasVisibility')} value={form.showPeladas} onChange={(value) => update('showPeladas', value)}/>

        <label className="filter-toggle">
          <input type="checkbox" checked={form.showCity} onChange={(event) => update('showCity', event.target.checked)}/>
          {t('account.showCity')}
        </label>
        <label className="filter-toggle">
          <input type="checkbox" checked={form.acceptInvites} onChange={(event) => update('acceptInvites', event.target.checked)}/>
          {t('account.acceptInvites')}
        </label>
      </div>

      {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <Button onClick={submit} disabled={save.isPending}>{save.isPending ? t('account.saving') : t('account.save')}</Button>
    </Card>
  )
}

function VisibilityField({ id, label, value, onChange }: {
  id: string
  label: string
  value: Visibility
  onChange: (value: Visibility) => void
}) {
  const { t } = useI18n()
  return (
    <label htmlFor={id}>{label}
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as Visibility)}>
        {VISIBILITIES.map((option) => <option key={option} value={option}>{t(visibilityKey(option))}</option>)}
      </select>
    </label>
  )
}

export function DataPanel() {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const download = async () => {
    setBusy(true); setNotice(''); setError('')
    try {
      const data = await exportMyData()
      // O ficheiro monta-se no browser a partir do que o servidor devolveu:
      // não há um endpoint que sirva ficheiros nem um link a expirar.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = exportFileName(new Date())
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice(t('account.exported'))
    } catch {
      setError(t('account.exportError'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true); setNotice(''); setError('')
    try {
      await requestAccountDeletion()
      setNotice(t('account.deleted'))
    } catch (cause) {
      // Um dono de pelada activa não pode desaparecer e deixar a comunidade sem
      // ninguém. O servidor recusa, e a recusa merece a sua própria frase.
      setError(String(cause).includes('OWNS_ACTIVE_PELADA')
        ? t('account.deleteOwnerError')
        : t('account.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const confirmWord = t('account.deleteConfirmWord')

  return (
    <Card className="settings-card data-panel">
      <header><Download/><div>
        <p className="eyebrow dark-text">{t('account.dataEyebrow')}</p>
        <h2>{t('account.dataTitle')}</h2>
        <p>{t('account.dataBody')}</p>
      </div></header>

      <Button variant="outline" onClick={download} disabled={busy}><Download/> {t('account.exportData')}</Button>

      <div className="danger-zone">
        <h3><AlertTriangle/> {t('account.deleteTitle')}</h3>
        <p>{t('account.deleteBody')}</p>
        <label htmlFor="delete-confirm">{t('account.deleteConfirmLabel', { word: confirmWord })}
          <input id="delete-confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off"/>
        </label>
        <Button variant="outline" onClick={remove} disabled={busy || confirmation.trim().toUpperCase() !== confirmWord}>
          {t('account.deleteAction')}
        </Button>
      </div>

      {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </Card>
  )
}
