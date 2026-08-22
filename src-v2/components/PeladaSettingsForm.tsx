import { Check, Settings } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n, type TranslationKey } from '../lib/i18n'
import {
  formats, frequencies, goalkeeperModes, joinModes, usePeladaAdminSettings,
  useSavePeladaAdminSettings, visibilities, type PeladaAdminSettings,
} from '../lib/pelada-admin'
import { Button, Card } from './ui'

/**
 * Os fusos que aparecem na lista. Não são todos os do mundo — são os que uma
 * pelada destas usa, mais o do próprio navegador, que é quase sempre o certo
 * para quem está a preencher. Escrever outro continua a ser possível.
 */
const TIMEZONES = [...new Set([
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  'Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores',
  'Europe/Madrid', 'Europe/Zurich', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/Sao_Paulo', 'America/New_York', 'UTC',
].filter(Boolean))]

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
  const { pelada } = useCurrentPelada()
  const query = usePeladaAdminSettings(pelada?.id, true)

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

        {/* Onde se joga. A pelada tinha coordenadas e não tinha morada: dava
            para pôr o ponto no mapa certo e continuava a dizer a cidade errada
            no cabeçalho, porque nenhum campo lhe chegava. */}
        <div className="field-grid">
          <label htmlFor="pelada-city">{t('peladaAdmin.city')}
            <input id="pelada-city" value={form.city} maxLength={80}
              onChange={(event) => update('city', event.target.value)}/>
          </label>
          <label htmlFor="pelada-country">{t('peladaAdmin.country')}
            <input id="pelada-country" value={form.countryCode} maxLength={2}
              placeholder="PT" autoCapitalize="characters" spellCheck={false}
              onChange={(event) => update('countryCode', event.target.value.toUpperCase())}/>
          </label>
        </div>

        <label htmlFor="pelada-timezone">{t('peladaAdmin.timezone')}
          <input id="pelada-timezone" value={form.timezone} list="pelada-timezones"
            spellCheck={false} aria-describedby="pelada-timezone-hint"
            onChange={(event) => update('timezone', event.target.value)}/>
        </label>
        {/* Uma lista curta com os fusos plausíveis, e o campo continua livre:
            o servidor recusa o que não existir, e adivinhar os 400 do mundo
            numa caixa era pior do que deixar escrever. */}
        <datalist id="pelada-timezones">
          {TIMEZONES.map((zone) => <option key={zone} value={zone}/>)}
        </datalist>
        <small id="pelada-timezone-hint">{t('peladaAdmin.timezoneHint')}</small>

        <div className="field-grid">
          <label htmlFor="pelada-visibility">{t('peladaAdmin.visibility')}
            <select id="pelada-visibility" value={form.visibility}
              onChange={(event) => update('visibility', event.target.value as PeladaAdminSettings['visibility'])}>
              {visibilities.map((value) => <option key={value} value={value}>{t(visibilityKey(value))}</option>)}
            </select>
          </label>
          {/* Uma pelada privada não aparece na Descoberta, e quem a procura
              pelo nome conclui que a busca está partida. Dizê-lo aqui, ao lado
              da decisão, é mais barato do que o descobrir do outro lado. */}
          <label htmlFor="pelada-join">{t('peladaAdmin.joinMode')}
            <select id="pelada-join" value={form.joinMode}
              onChange={(event) => update('joinMode', event.target.value as PeladaAdminSettings['joinMode'])}>
              {joinModes.map((value) => <option key={value} value={value}>{t(joinModeKey(value))}</option>)}
            </select>
          </label>
          {form.visibility === 'private' && (
            <p className="settings-hint" role="note">{t('peladaAdmin.privateNotDiscoverable')}</p>
          )}
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
