import { ArrowLeft, ArrowRight, Check, Globe2, Lock, MapPin, ShieldCheck, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { createPelada, supabase } from '../lib/supabase'

const steps = ['Identidade', 'Localização', 'Regras', 'Entrada', 'Visibilidade', 'Revisão']

export function CreatePeladaPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', description: '', city: 'Zürich', country: 'CH', timezone: 'Europe/Zurich', format: '7x7', frequency: 'Semanal', joinMode: 'approval', visibility: 'private' })
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const next = async () => {
    if (step < steps.length - 1) { setStep(step + 1); return }
    setBusy(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const slug = form.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42)
        await createPelada({ name: form.name, slug, description: form.description, countryCode: form.country, city: form.city, timezone: form.timezone, visibility: form.visibility, joinMode: form.joinMode })
      }
      navigate('/app?created=1')
    } catch {
      setError('Não foi possível criar a pelada. Confirma o nome e tenta novamente.')
    } finally { setBusy(false) }
  }
  return <div className="page create-page">
    <header className="page-heading"><span className="eyebrow dark-text">NOVA COMUNIDADE</span><h1>Cria a tua pelada.</h1><p>Começa pelo essencial. Podes ajustar tudo depois.</p></header>
    <div className="wizard-layout">
      <aside className="wizard-steps" aria-label="Progresso">{steps.map((label, index) => <button key={label} className={index === step ? 'active' : index < step ? 'done' : ''} onClick={() => index <= step && setStep(index)}><span>{index < step ? <Check/> : index + 1}</span><b>{label}</b></button>)}</aside>
      <Card className="wizard-card">
        <div className="wizard-progress"><span>PASSO {step + 1} DE {steps.length}</span><i><b style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></i></div>
        {step === 0 && <fieldset><legend>Dá personalidade à comunidade</legend><p>Este nome e descrição aparecem nos convites e no perfil público.</p><label>Nome da pelada<input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Ex.: Futebol das Sextas" maxLength={60}/></label><label>Descrição<textarea value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Conta o que torna esta pelada especial…" maxLength={280}/><small>{form.description.length}/280</small></label></fieldset>}
        {step === 1 && <fieldset><legend>Onde vocês jogam?</legend><p>A localização exata nunca é mostrada publicamente.</p><div className="field-grid"><label>País<select value={form.country} onChange={(e) => update('country', e.target.value)}><option value="CH">Suíça</option><option value="PT">Portugal</option><option value="BR">Brasil</option><option value="DE">Alemanha</option></select></label><label>Cidade<div className="input-with-icon"><MapPin/><input value={form.city} onChange={(e) => update('city', e.target.value)}/></div></label></div><label>Fuso horário<select value={form.timezone} onChange={(e) => update('timezone', e.target.value)}><option>Europe/Zurich</option><option>Europe/Lisbon</option><option>America/Sao_Paulo</option></select></label></fieldset>}
        {step === 2 && <fieldset><legend>Como é o vosso futebol?</legend><p>Estas definições orientam jogos e sorteios.</p><div className="choice-grid"><Choice active={form.format === '5x5'} onClick={() => update('format','5x5')} icon={<UsersRound/>} title="5 × 5" body="Campo curto"/><Choice active={form.format === '7x7'} onClick={() => update('format','7x7')} icon={<UsersRound/>} title="7 × 7" body="Society"/><Choice active={form.format === '11x11'} onClick={() => update('format','11x11')} icon={<UsersRound/>} title="11 × 11" body="Campo completo"/></div><label>Frequência<select value={form.frequency} onChange={(e) => update('frequency',e.target.value)}><option>Semanal</option><option>Quinzenal</option><option>Mensal</option><option>Sem frequência fixa</option></select></label></fieldset>}
        {step === 3 && <fieldset><legend>Quem pode entrar?</legend><p>Tu manténs o controlo sobre quem participa.</p><div className="choice-stack"><Choice active={form.joinMode === 'approval'} onClick={() => update('joinMode','approval')} icon={<ShieldCheck/>} title="Pedido com aprovação" body="Recomendado para a maioria das comunidades."/><Choice active={form.joinMode === 'invite'} onClick={() => update('joinMode','invite')} icon={<Lock/>} title="Somente por convite" body="Novos jogadores precisam de um link privado."/><Choice active={form.joinMode === 'open'} onClick={() => update('joinMode','open')} icon={<Globe2/>} title="Entrada aberta" body="Qualquer pessoa pode participar imediatamente."/></div></fieldset>}
        {step === 4 && <fieldset><legend>Como a pelada aparece?</legend><p>Mesmo pública, dados pessoais e locais exatos continuam protegidos.</p><div className="choice-stack"><Choice active={form.visibility === 'private'} onClick={() => update('visibility','private')} icon={<Lock/>} title="Privada" body="Só membros veem jogos, plantel e estatísticas."/><Choice active={form.visibility === 'public'} onClick={() => update('visibility','public')} icon={<Globe2/>} title="Descobrível" body="A página básica aparece na pesquisa e pode receber pedidos."/></div></fieldset>}
        {step === 5 && <fieldset><legend>Pronta para entrar em campo</legend><p>Confirma os detalhes antes de criar.</p><dl className="review-list"><div><dt>Nome</dt><dd>{form.name || 'A tua nova pelada'}</dd></div><div><dt>Local</dt><dd>{form.city}, {form.country}</dd></div><div><dt>Formato</dt><dd>{form.format} · {form.frequency}</dd></div><div><dt>Entrada</dt><dd>{form.joinMode}</dd></div><div><dt>Visibilidade</dt><dd>{form.visibility}</dd></div></dl><div className="secure-note"><ShieldCheck/><p><strong>Tu serás o owner.</strong><br/>Papéis, convites e dados ficam isolados nesta pelada.</p></div></fieldset>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="wizard-actions"><Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}><ArrowLeft/> Voltar</Button><Button onClick={next} disabled={busy || (step === 0 && form.name.trim().length < 3)}>{busy ? 'A criar…' : step === steps.length - 1 ? 'Criar pelada' : 'Continuar'} {!busy && <ArrowRight/>}</Button></div>
      </Card>
    </div>
  </div>
}

function Choice({ active, onClick, icon, title, body }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; body: string }) {
  return <button type="button" className={active ? 'choice active' : 'choice'} onClick={onClick} aria-pressed={active}><span>{icon}</span><div><strong>{title}</strong><small>{body}</small></div><i>{active && <Check/>}</i></button>
}
