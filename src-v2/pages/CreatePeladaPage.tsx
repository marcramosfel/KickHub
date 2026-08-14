import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Globe2, Lock, MapPin, ShieldCheck, UsersRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { useAuth } from '../lib/auth'
import { createPelada, createPeladaSlug, type CreatePeladaInput } from '../lib/peladas'
import { isSupabaseConfigured } from '../lib/supabase'

const steps = ['Identidade', 'Localização', 'Regras', 'Entrada', 'Visibilidade', 'Revisão']
const frequencyLabels: Record<CreatePeladaInput['frequency'], string> = {
  weekly: 'Semanal',
  fortnightly: 'Quinzenal',
  monthly: 'Mensal',
  irregular: 'Sem frequência fixa',
}

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

export function CreatePeladaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, loading } = useAuth()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    city: 'Zürich',
    country: 'CH',
    timezone: 'Europe/Zurich',
    format: '7x7',
    frequency: 'weekly',
    joinMode: 'approval',
    visibility: 'private',
  })

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const next = async () => {
    if (step < steps.length - 1) {
      setStep((current) => current + 1)
      return
    }

    setBusy(true)
    setError('')
    try {
      let createdName = form.name.trim()
      if (user) {
        const created = await createPelada({
          name: createdName,
          slug: createPeladaSlug(createdName),
          description: form.description.trim(),
          countryCode: form.country,
          city: form.city.trim(),
          timezone: form.timezone,
          visibility: form.visibility,
          joinMode: form.joinMode,
          defaultFormat: form.format,
          frequency: form.frequency,
        })
        createdName = created.name
        await queryClient.invalidateQueries({ queryKey: ['my-peladas', user.id] })
      }
      const params = new URLSearchParams({ created: createdName })
      if (!user) params.set('demo', '1')
      navigate(`/app?${params.toString()}`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : ''
      setError(message.includes('duplicate') || message.includes('slug')
        ? 'Já existe uma pelada com um endereço parecido. Diferencia um pouco o nome e tenta novamente.'
        : 'Não foi possível criar a pelada. Confirma os dados e tenta novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (isSupabaseConfigured && loading) {
    return <CreateAccessState title="A preparar o teu perfil…" body="Estamos a confirmar a sessão antes de criar a comunidade."/>
  }

  if (isSupabaseConfigured && !user) {
    return (
      <CreateAccessState
        title="Entra para criar uma pelada."
        body="A tua conta global será a owner da nova comunidade e manterá os dados isolados."
        action={<Link className="btn btn-primary btn-lg" to="/entrar">Entrar ou criar conta <ArrowRight/></Link>}
      />
    )
  }

  return (
    <div className="page create-page">
      <header className="page-heading">
        <span className="eyebrow dark-text">NOVA COMUNIDADE</span>
        <h1>Cria a tua pelada.</h1>
        <p>Começa pelo essencial. Podes ajustar tudo depois.</p>
      </header>
      <div className="wizard-layout">
        <aside className="wizard-steps" aria-label="Progresso">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              className={index === step ? 'active' : index < step ? 'done' : ''}
              onClick={() => index <= step && setStep(index)}
              aria-current={index === step ? 'step' : undefined}
            >
              <span>{index < step ? <Check/> : index + 1}</span><b>{label}</b>
            </button>
          ))}
        </aside>
        <Card className="wizard-card">
          <div className="wizard-progress">
            <span>PASSO {step + 1} DE {steps.length}</span>
            <i><b style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></i>
          </div>
          {step === 0 && (
            <fieldset>
              <legend>Dá personalidade à comunidade</legend>
              <p>Este nome e descrição aparecem nos convites e no perfil público.</p>
              <label>Nome da pelada<input required value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex.: Futebol das Sextas" maxLength={60}/></label>
              <label>Descrição<textarea value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Conta o que torna esta pelada especial…" maxLength={280}/><small>{form.description.length}/280</small></label>
            </fieldset>
          )}
          {step === 1 && (
            <fieldset>
              <legend>Onde vocês jogam?</legend>
              <p>A localização exata nunca é mostrada publicamente.</p>
              <div className="field-grid">
                <label>País<select value={form.country} onChange={(event) => update('country', event.target.value)}><option value="CH">Suíça</option><option value="PT">Portugal</option><option value="BR">Brasil</option><option value="DE">Alemanha</option></select></label>
                <label>Cidade<div className="input-with-icon"><MapPin/><input value={form.city} onChange={(event) => update('city', event.target.value)}/></div></label>
              </div>
              <label>Fuso horário<select value={form.timezone} onChange={(event) => update('timezone', event.target.value)}><option>Europe/Zurich</option><option>Europe/Lisbon</option><option>America/Sao_Paulo</option></select></label>
            </fieldset>
          )}
          {step === 2 && (
            <fieldset>
              <legend>Como é o vosso futebol?</legend>
              <p>Estas definições orientam jogos e sorteios.</p>
              <div className="choice-grid">
                <Choice active={form.format === '5x5'} onClick={() => update('format', '5x5')} icon={<UsersRound/>} title="5 × 5" body="Campo curto"/>
                <Choice active={form.format === '7x7'} onClick={() => update('format', '7x7')} icon={<UsersRound/>} title="7 × 7" body="Society"/>
                <Choice active={form.format === '11x11'} onClick={() => update('format', '11x11')} icon={<UsersRound/>} title="11 × 11" body="Campo completo"/>
              </div>
              <label>Frequência<select value={form.frequency} onChange={(event) => update('frequency', event.target.value as FormState['frequency'])}><option value="weekly">Semanal</option><option value="fortnightly">Quinzenal</option><option value="monthly">Mensal</option><option value="irregular">Sem frequência fixa</option></select></label>
            </fieldset>
          )}
          {step === 3 && (
            <fieldset>
              <legend>Quem pode entrar?</legend>
              <p>Tu manténs o controlo sobre quem participa.</p>
              <div className="choice-stack">
                <Choice active={form.joinMode === 'approval'} onClick={() => update('joinMode', 'approval')} icon={<ShieldCheck/>} title="Pedido com aprovação" body="Recomendado para a maioria das comunidades."/>
                <Choice active={form.joinMode === 'invite'} onClick={() => update('joinMode', 'invite')} icon={<Lock/>} title="Somente por convite" body="Novos jogadores precisam de um link privado."/>
                <Choice active={form.joinMode === 'open'} onClick={() => update('joinMode', 'open')} icon={<Globe2/>} title="Entrada aberta" body="Qualquer pessoa pode participar imediatamente."/>
              </div>
            </fieldset>
          )}
          {step === 4 && (
            <fieldset>
              <legend>Como a pelada aparece?</legend>
              <p>Mesmo pública, dados pessoais e locais exatos continuam protegidos.</p>
              <div className="choice-stack">
                <Choice active={form.visibility === 'private'} onClick={() => update('visibility', 'private')} icon={<Lock/>} title="Privada" body="Só membros veem a comunidade e entram por convite."/>
                <Choice active={form.visibility === 'unlisted'} onClick={() => update('visibility', 'unlisted')} icon={<ShieldCheck/>} title="Não listada" body="Quem tiver o link encontra a comunidade, mas ela não aparece na busca."/>
                <Choice active={form.visibility === 'public'} onClick={() => update('visibility', 'public')} icon={<Globe2/>} title="Descobrível" body="A página básica aparece na pesquisa e pode receber pedidos."/>
              </div>
            </fieldset>
          )}
          {step === 5 && (
            <fieldset>
              <legend>Pronta para entrar em campo</legend>
              <p>Confirma os detalhes antes de criar.</p>
              <dl className="review-list">
                <div><dt>Nome</dt><dd>{form.name || 'A tua nova pelada'}</dd></div>
                <div><dt>Local</dt><dd>{form.city}, {form.country}</dd></div>
                <div><dt>Formato</dt><dd>{form.format} · {frequencyLabels[form.frequency]}</dd></div>
                <div><dt>Entrada</dt><dd>{form.joinMode}</dd></div>
                <div><dt>Visibilidade</dt><dd>{form.visibility}</dd></div>
              </dl>
              <div className="secure-note"><ShieldCheck/><p><strong>Tu serás a owner.</strong><br/>Papéis, convites e dados ficam isolados nesta pelada.</p></div>
            </fieldset>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="wizard-actions">
            <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}><ArrowLeft/> Voltar</Button>
            <Button onClick={next} disabled={busy || (step === 0 && form.name.trim().length < 3) || !form.city.trim()}>{busy ? 'A criar…' : step === steps.length - 1 ? 'Criar pelada' : 'Continuar'} {!busy && <ArrowRight/>}</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function CreateAccessState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="page create-page">
      <Card className="create-access-state">
        <span><ShieldCheck/></span>
        <p className="eyebrow dark-text">IDENTIDADE GLOBAL</p>
        <h1>{title}</h1>
        <p>{body}</p>
        {action}
      </Card>
    </div>
  )
}

function Choice({ active, onClick, icon, title, body }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; body: string }) {
  return <button type="button" className={active ? 'choice active' : 'choice'} onClick={onClick} aria-pressed={active}><span>{icon}</span><div><strong>{title}</strong><small>{body}</small></div><i>{active && <Check/>}</i></button>
}
