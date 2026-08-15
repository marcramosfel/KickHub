import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Globe2, Lock, MapPin, ShieldCheck, UsersRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useI18n, type TranslationKey } from '../lib/i18n'
import { createPelada, createPeladaSlug, type CreatePeladaInput } from '../lib/peladas'
import { isSupabaseConfigured } from '../lib/supabase'

type FormState = {
  name: string
  description: string
  city: string
  country: string
  timezone: string
  format: CreatePeladaInput['defaultFormat']
  frequency: CreatePeladaInput['frequency']
  joinMode: CreatePeladaInput['joinMode']
  visibility: CreatePeladaInput['visibility']
}

const frequencyKeys: Record<FormState['frequency'], TranslationKey> = {
  weekly: 'create.frequency.weekly', fortnightly: 'create.frequency.fortnightly',
  monthly: 'create.frequency.monthly', irregular: 'create.frequency.irregular',
}
const joinModeKeys: Record<FormState['joinMode'], TranslationKey> = {
  approval: 'create.joinMode.approval', invite: 'create.joinMode.invite', open: 'create.joinMode.open',
}
const visibilityKeys: Record<FormState['visibility'], TranslationKey> = {
  private: 'create.visibility.private', unlisted: 'create.visibility.unlisted', public: 'create.visibility.public',
}

export function CreatePeladaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, loading } = useAuth()
  const { t, formatNumber } = useI18n()
  const steps = [
    t('create.steps.identity'), t('create.steps.location'), t('create.steps.rules'),
    t('create.steps.entry'), t('create.steps.visibility'), t('create.steps.review'),
  ]
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>({
    name: '', description: '', city: 'Zürich', country: 'CH', timezone: 'Europe/Zurich',
    format: '7x7', frequency: 'weekly', joinMode: 'approval', visibility: 'private',
  })

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const next = async () => {
    // O guard usa a forma funcional: ler `step` do closure deixava dois cliques
    // rápidos passarem ambos pela verificação antes do re-render, somando dois
    // avanços e ultrapassando o último passo.
    if (step < steps.length - 1) {
      setStep((current) => Math.min(current + 1, steps.length - 1))
      return
    }

    setBusy(true)
    setError('')
    try {
      let createdName = form.name.trim()
      if (user) {
        const created = await createPelada({
          name: createdName, slug: createPeladaSlug(createdName), description: form.description.trim(),
          countryCode: form.country, city: form.city.trim(), timezone: form.timezone,
          visibility: form.visibility, joinMode: form.joinMode, defaultFormat: form.format, frequency: form.frequency,
        })
        createdName = created.name
        await queryClient.invalidateQueries({ queryKey: ['my-peladas', user.id] })
      }
      const params = new URLSearchParams({ created: createdName })
      if (!user) params.set('demo', '1')
      navigate(`/app?${params.toString()}`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : ''
      setError(t(message.includes('duplicate') || message.includes('slug') ? 'create.duplicateError' : 'create.genericError'))
    } finally {
      setBusy(false)
    }
  }

  if (isSupabaseConfigured && loading) {
    return <CreateAccessState title={t('create.loadingTitle')} body={t('create.loadingBody')}/>
  }

  if (isSupabaseConfigured && !user) {
    return <CreateAccessState title={t('create.authTitle')} body={t('create.authBody')} action={
      <Link className="btn btn-primary btn-lg" to="/entrar">{t('create.authAction')} <ArrowRight/></Link>
    }/>
  }

  return (
    <div className="page create-page">
      <header className="page-heading">
        <span className="eyebrow dark-text">{t('create.pageEyebrow')}</span>
        <h1>{t('create.pageTitle')}</h1><p>{t('create.pageBody')}</p>
      </header>
      <div className="wizard-layout">
        <aside className="wizard-steps" aria-label={t('create.progressLabel')}>
          {steps.map((label, index) => (
            <button key={label} type="button" className={index === step ? 'active' : index < step ? 'done' : ''}
              onClick={() => index <= step && setStep(index)} aria-current={index === step ? 'step' : undefined}>
              <span>{index < step ? <Check/> : index + 1}</span><b>{label}</b>
            </button>
          ))}
        </aside>
        <Card className="wizard-card">
          <div className="wizard-progress">
            <span>{t('create.stepProgress', { step: step + 1, total: steps.length })}</span>
            <i><b style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></i>
          </div>
          {step === 0 ? <fieldset>
            <legend>{t('create.identityLegend')}</legend><p>{t('create.identityBody')}</p>
            <label>{t('create.name')}<input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder={t('create.namePlaceholder')} maxLength={60}/></label>
            <label>{t('create.description')}<textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder={t('create.descriptionPlaceholder')} maxLength={280}/><small>{formatNumber(form.description.length)}/{formatNumber(280)}</small></label>
          </fieldset> : null}
          {step === 1 ? <fieldset>
            <legend>{t('create.locationLegend')}</legend><p>{t('create.locationBody')}</p>
            <div className="field-grid">
              <label>{t('create.country')}<select value={form.country} onChange={(event) => update('country', event.target.value)}><option value="CH">{t('create.country.CH')}</option><option value="PT">{t('create.country.PT')}</option><option value="BR">{t('create.country.BR')}</option><option value="DE">{t('create.country.DE')}</option></select></label>
              <label>{t('create.city')}<div className="input-with-icon"><MapPin/><input value={form.city} onChange={(event) => update('city', event.target.value)}/></div></label>
            </div>
            <label>{t('create.timezone')}<select value={form.timezone} onChange={(event) => update('timezone', event.target.value)}><option>Europe/Zurich</option><option>Europe/Lisbon</option><option>America/Sao_Paulo</option></select></label>
          </fieldset> : null}
          {step === 2 ? <fieldset>
            <legend>{t('create.rulesLegend')}</legend><p>{t('create.rulesBody')}</p>
            <div className="choice-grid">
              <Choice active={form.format === '5x5'} onClick={() => update('format', '5x5')} icon={<UsersRound/>} title="5 × 5" body={t('create.shortField')}/>
              <Choice active={form.format === '7x7'} onClick={() => update('format', '7x7')} icon={<UsersRound/>} title="7 × 7" body={t('create.society')}/>
              <Choice active={form.format === '11x11'} onClick={() => update('format', '11x11')} icon={<UsersRound/>} title="11 × 11" body={t('create.fullField')}/>
            </div>
            <label>{t('create.frequency')}<select value={form.frequency} onChange={(event) => update('frequency', event.target.value as FormState['frequency'])}>
              {(Object.keys(frequencyKeys) as FormState['frequency'][]).map((value) => <option key={value} value={value}>{t(frequencyKeys[value])}</option>)}
            </select></label>
          </fieldset> : null}
          {step === 3 ? <fieldset>
            <legend>{t('create.entryLegend')}</legend><p>{t('create.entryBody')}</p>
            <div className="choice-stack">
              <Choice active={form.joinMode === 'approval'} onClick={() => update('joinMode', 'approval')} icon={<ShieldCheck/>} title={t('create.approvalTitle')} body={t('create.approvalBody')}/>
              <Choice active={form.joinMode === 'invite'} onClick={() => update('joinMode', 'invite')} icon={<Lock/>} title={t('create.inviteTitle')} body={t('create.inviteBody')}/>
              <Choice active={form.joinMode === 'open'} onClick={() => update('joinMode', 'open')} icon={<Globe2/>} title={t('create.openTitle')} body={t('create.openBody')}/>
            </div>
          </fieldset> : null}
          {step === 4 ? <fieldset>
            <legend>{t('create.visibilityLegend')}</legend><p>{t('create.visibilityBody')}</p>
            <div className="choice-stack">
              <Choice active={form.visibility === 'private'} onClick={() => update('visibility', 'private')} icon={<Lock/>} title={t('create.privateTitle')} body={t('create.privateBody')}/>
              <Choice active={form.visibility === 'unlisted'} onClick={() => update('visibility', 'unlisted')} icon={<ShieldCheck/>} title={t('create.unlistedTitle')} body={t('create.unlistedBody')}/>
              <Choice active={form.visibility === 'public'} onClick={() => update('visibility', 'public')} icon={<Globe2/>} title={t('create.publicTitle')} body={t('create.publicBody')}/>
            </div>
          </fieldset> : null}
          {step === 5 ? <fieldset>
            <legend>{t('create.reviewLegend')}</legend><p>{t('create.reviewBody')}</p>
            <dl className="review-list">
              <div><dt>{t('create.reviewName')}</dt><dd>{form.name || t('create.defaultName')}</dd></div>
              <div><dt>{t('create.reviewLocation')}</dt><dd>{form.city}, {form.country}</dd></div>
              <div><dt>{t('create.reviewFormat')}</dt><dd>{form.format} · {t(frequencyKeys[form.frequency])}</dd></div>
              <div><dt>{t('create.reviewEntry')}</dt><dd>{t(joinModeKeys[form.joinMode])}</dd></div>
              <div><dt>{t('create.reviewVisibility')}</dt><dd>{t(visibilityKeys[form.visibility])}</dd></div>
            </dl>
            <div className="secure-note"><ShieldCheck/><p><strong>{t('create.ownerTitle')}</strong><br/>{t('create.ownerBody')}</p></div>
          </fieldset> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="wizard-actions">
            <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}><ArrowLeft/> {t('create.back')}</Button>
            <Button onClick={next} disabled={busy || (step === 0 && form.name.trim().length < 3) || !form.city.trim()}>
              {busy ? t('create.submitting') : step === steps.length - 1 ? t('create.submit') : t('create.continue')} {!busy ? <ArrowRight/> : null}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function CreateAccessState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const { t } = useI18n()
  return <div className="page create-page"><Card className="create-access-state">
    <span><ShieldCheck/></span><p className="eyebrow dark-text">{t('create.identityEyebrow')}</p><h1>{title}</h1><p>{body}</p>{action}
  </Card></div>
}

function Choice({ active, onClick, icon, title, body }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; body: string }) {
  return <button type="button" className={active ? 'choice active' : 'choice'} onClick={onClick} aria-pressed={active}><span>{icon}</span><div><strong>{title}</strong><small>{body}</small></div><i>{active ? <Check/> : null}</i></button>
}
