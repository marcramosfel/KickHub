import { Check, Settings } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n, type TranslationKey } from '../lib/i18n'
import {
  formats, frequencies, goalkeeperModes, joinModes, usePeladaAdminSettings,
  useSavePeladaAdminSettings, visibilities, type PeladaAdminSettings,
} from '../lib/pelada-admin'
import { Button, Card } from './ui'

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const visibilityKey = (value: string) => `peladaAdmin.visibility${capitalise(value)}` as TranslationKey
const joinModeKey = (value: string) => `peladaAdmin.joinMode${capitalise(value)}` as TranslationKey
const frequencyKey = (value: string) => `peladaAdmin.frequency${capitalise(value)}` as TranslationKey
const goalkeeperKey = (value: string) => `peladaAdmin.goalkeeper${capitalise(value)}` as TranslationKey

/**
 * Carrega e decide o que mostrar. Os campos vivem num componente à parte para
 * poderem arrancar já com os valores gravados: preencher o estado depois, num
 * efeito, deixava o formulário a saltar do vazio para o preenchido.
 */
export function PeladaSettingsForm() {
  const { t } = useI18n()
  const { pelada, isDemo } = useCurrentPelada()
  const query = usePeladaAdminSettings(pelada?.id, !isDemo)

  if (isDemo) return null

  // O erro é testado antes do estado vazio: numa leitura falhada não há dados,
  // e a ordem inversa deixava o cartão preso em "a carregar" sem nunca oferecer
  // a nova tentativa.
  if (query.isError) {
    return (
      <Card className="settings-card" role="alert">
        <p>{t('peladaAdmin.loadError')}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>{t('dashboard.retry')}</Button>
      </Card>
    )
  }
  if (query.isPending || !query.data) {
    return <Card className="settings-card" aria-busy="true"><p>{t('peladaAdmin.loading')}</p></Card>
  }

  return <SettingsFields initial={query.data} peladaId={pelada?.id}/>
}

function SettingsFields({ initial, peladaId }: { initial: PeladaAdminSettings; peladaId: string | undefined }) {
  const { t } = useI18n()
  const save = useSavePeladaAdminSettings(peladaId)
  const [form, setForm] = useState<PeladaAdminSettings>(initial)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const update = <K extends keyof PeladaAdminSettings>(key: K, value: PeladaAdminSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice(''); setError('')
    try {
      await save.mutateAsync(form)
      setNotice(t('peladaAdmin.saved'))
    } catch {
      setError(t('peladaAdmin.saveError'))
    }
  }

  return (
    <Card className="settings-card">
      <span className="invite-icon"><Settings/></span>
      <p className="eyebrow dark-text">{t('peladaAdmin.settingsEyebrow')}</p>
      <h2>{t('peladaAdmin.settingsTitle')}</h2>
      <p>{t('peladaAdmin.settingsBody')}</p>

      {notice ? <p className="inline-notice" role="status"><Check/> {notice}</p> : null}

      <form onSubmit={submit}>
        <label htmlFor="pelada-name">{t('peladaAdmin.name')}
          <input id="pelada-name" required minLength={3} maxLength={60} value={form.name}
            onChange={(event) => update('name', event.target.value)}/>
        </label>

        <label htmlFor="pelada-description">{t('peladaAdmin.description')}
          <textarea id="pelada-description" maxLength={280} value={form.description}
            onChange={(event) => update('description', event.target.value)}/>
        </label>

        {/* O endereço é mostrado mas não editável: mudá-lo partiria os convites
            já enviados, e nenhuma RPC o aceita como argumento. */}
        <div className="settings-readonly">
          <label htmlFor="pelada-slug">{t('peladaAdmin.link')}
            <input id="pelada-slug" readOnly value={`/p/${form.slug}`} aria-describedby="pelada-slug-hint"/>
          </label>
          <small id="pelada-slug-hint">{t('peladaAdmin.linkHint')}</small>
        </div>

        <div className="field-grid">
          <label htmlFor="pelada-visibility">{t('peladaAdmin.visibility')}
            <select id="pelada-visibility" value={form.visibility}
              onChange={(event) => update('visibility', event.target.value as PeladaAdminSettings['visibility'])}>
              {visibilities.map((value) => <option key={value} value={value}>{t(visibilityKey(value))}</option>)}
            </select>
          </label>
          <label htmlFor="pelada-join">{t('peladaAdmin.joinMode')}
            <select id="pelada-join" value={form.joinMode}
              onChange={(event) => update('joinMode', event.target.value as PeladaAdminSettings['joinMode'])}>
              {joinModes.map((value) => <option key={value} value={value}>{t(joinModeKey(value))}</option>)}
            </select>
          </label>
          <label htmlFor="pelada-format">{t('peladaAdmin.format')}
            <select id="pelada-format" value={form.defaultFormat}
              onChange={(event) => update('defaultFormat', event.target.value)}>
              {formats.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label htmlFor="pelada-team-size">{t('peladaAdmin.teamSize')}
            <input id="pelada-team-size" type="number" min={3} max={15} value={form.defaultTeamSize}
              onChange={(event) => update('defaultTeamSize', Number(event.target.value))}/>
          </label>
          <label htmlFor="pelada-frequency">{t('peladaAdmin.frequency')}
            <select id="pelada-frequency" value={form.frequency}
              onChange={(event) => update('frequency', event.target.value as PeladaAdminSettings['frequency'])}>
              {frequencies.map((value) => <option key={value} value={value}>{t(frequencyKey(value))}</option>)}
            </select>
          </label>
          <label htmlFor="pelada-goalkeepers">{t('peladaAdmin.goalkeeperMode')}
            <select id="pelada-goalkeepers" value={form.goalkeeperMode}
              onChange={(event) => update('goalkeeperMode', event.target.value as PeladaAdminSettings['goalkeeperMode'])}>
              {goalkeeperModes.map((value) => <option key={value} value={value}>{t(goalkeeperKey(value))}</option>)}
            </select>
          </label>
        </div>

        <label className="squad-accepts" htmlFor="pelada-ratings">
          <input id="pelada-ratings" type="checkbox" checked={form.ratingsEnabled}
            onChange={(event) => update('ratingsEnabled', event.target.checked)}/>
          {t('peladaAdmin.ratings')}
        </label>
        <label className="squad-accepts" htmlFor="pelada-awards">
          <input id="pelada-awards" type="checkbox" checked={form.awardsEnabled}
            onChange={(event) => update('awardsEnabled', event.target.checked)}/>
          {t('peladaAdmin.awards')}
        </label>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="squad-form-actions">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('peladaAdmin.saving') : t('peladaAdmin.save')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
