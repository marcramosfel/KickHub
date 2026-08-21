import { Check, Globe2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentPelada } from '../lib/current-pelada'
import { SKILL_LEVELS, type LocationPrecision, type SkillLevel } from '../lib/discovery'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { Button, Card } from './ui'

/**
 * Como a pelada aparece na descoberta — e quanto dela deixa ver.
 *
 * Está separado das definições desportivas de propósito: a precisão da morada
 * é uma decisão de privacidade, e enterrá-la entre o formato do jogo e o modo
 * dos guarda-redes fazia-a parecer mais uma preferência.
 */
const precisions: readonly LocationPrecision[] = ['hidden', 'city', 'approximate', 'exact']

const precisionKey = (value: LocationPrecision) => `peladaAdmin.precision${value.charAt(0).toUpperCase()}${value.slice(1)}` as TranslationKey
const skillKey = (value: SkillLevel) => `discover.skill${value.charAt(0).toUpperCase()}${value.slice(1)}` as TranslationKey
const weekdayKeys: TranslationKey[] = [
  'discover.mon', 'discover.tue', 'discover.wed', 'discover.thu', 'discover.fri', 'discover.sat', 'discover.sun',
]

export type DiscoverySettings = {
  region: string
  latitude: string
  longitude: string
  precision: LocationPrecision
  weekday: string
  time: string
  skillLevel: SkillLevel
  maxPlayers: string
}

const empty: DiscoverySettings = {
  region: '', latitude: '', longitude: '', precision: 'city',
  weekday: '', time: '', skillLevel: 'mixed', maxPlayers: '',
}

/** Um campo em branco é "não mexas neste", e não "apaga o que lá está". */
const optional = (value: string) => {
  const clean = value.trim()
  return clean === '' ? null : clean
}
const optionalNumber = (value: string) => {
  const clean = optional(value)
  if (clean === null) return null
  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : null
}

export async function saveDiscoverySettings(peladaId: string, form: DiscoverySettings) {
  const { error } = await supabase.rpc('update_pelada_discovery', {
    p_pelada_id: peladaId,
    p_region: optional(form.region),
    p_latitude: optionalNumber(form.latitude),
    p_longitude: optionalNumber(form.longitude),
    p_location_precision: form.precision,
    p_match_weekday: optionalNumber(form.weekday),
    p_match_time: optional(form.time),
    p_skill_level: form.skillLevel,
    p_max_players: optionalNumber(form.maxPlayers),
  })
  if (error) throw error
}

export function DiscoverySettingsForm() {
  const { t } = useI18n()
  const { pelada } = useCurrentPelada()
  const client = useQueryClient()
  const [form, setForm] = useState<DiscoverySettings>(empty)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () => saveDiscoverySettings(pelada!.id, form),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['discover-peladas'] }) },
  })

  const update = <K extends keyof DiscoverySettings>(key: K, value: DiscoverySettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice(''); setError('')
    if (!pelada) return
    try {
      await save.mutateAsync()
      setNotice(t('peladaAdmin.discoverySaved'))
    } catch {
      setError(t('peladaAdmin.discoveryError'))
    }
  }

  return (
    <Card className="settings-card discovery-settings">
      <header><Globe2/><div>
        <p className="eyebrow dark-text">{t('peladaAdmin.discoveryEyebrow')}</p>
        <h2>{t('peladaAdmin.discoveryTitle')}</h2>
        <p>{t('peladaAdmin.discoveryBody')}</p>
      </div></header>

      <form onSubmit={submit}>
        <label htmlFor="discovery-region">{t('peladaAdmin.region')}
          <input id="discovery-region" value={form.region} onChange={(event) => update('region', event.target.value)} placeholder={t('peladaAdmin.regionPlaceholder')}/>
        </label>

        <div className="field-grid">
          <label htmlFor="discovery-lat">{t('peladaAdmin.latitude')}
            <input id="discovery-lat" inputMode="decimal" value={form.latitude} onChange={(event) => update('latitude', event.target.value)} placeholder="37.08"/>
          </label>
          <label htmlFor="discovery-lon">{t('peladaAdmin.longitude')}
            <input id="discovery-lon" inputMode="decimal" value={form.longitude} onChange={(event) => update('longitude', event.target.value)} placeholder="-8.11"/>
          </label>
        </div>

        <label htmlFor="discovery-precision">{t('peladaAdmin.precision')}
          <select id="discovery-precision" value={form.precision} onChange={(event) => update('precision', event.target.value as LocationPrecision)}>
            {precisions.map((value) => <option key={value} value={value}>{t(precisionKey(value))}</option>)}
          </select>
          <small>{t('peladaAdmin.precisionHint')}</small>
        </label>

        <div className="field-grid">
          <label htmlFor="discovery-weekday">{t('peladaAdmin.matchDay')}
            <select id="discovery-weekday" value={form.weekday} onChange={(event) => update('weekday', event.target.value)}>
              <option value="">{t('peladaAdmin.notSet')}</option>
              {weekdayKeys.map((key, index) => <option key={key} value={index + 1}>{t(key)}</option>)}
            </select>
          </label>
          <label htmlFor="discovery-time">{t('peladaAdmin.matchTime')}
            <input id="discovery-time" type="time" value={form.time} onChange={(event) => update('time', event.target.value)}/>
          </label>
        </div>

        <div className="field-grid">
          <label htmlFor="discovery-skill">{t('peladaAdmin.skillLevel')}
            <select id="discovery-skill" value={form.skillLevel} onChange={(event) => update('skillLevel', event.target.value as SkillLevel)}>
              {SKILL_LEVELS.map((value) => <option key={value} value={value}>{t(skillKey(value))}</option>)}
            </select>
          </label>
          <label htmlFor="discovery-max">{t('peladaAdmin.maxPlayers')}
            <input id="discovery-max" inputMode="numeric" value={form.maxPlayers} onChange={(event) => update('maxPlayers', event.target.value)} placeholder="30"/>
          </label>
        </div>

        {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('peladaAdmin.saving') : t('peladaAdmin.save')}</Button>
      </form>
    </Card>
  )
}
