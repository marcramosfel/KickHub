import { ArrowLeft, Check, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Button } from '../components/ui'
import { sendMagicLink } from '../lib/supabase'

export function AuthPage() {
  const navigate = useNavigate()
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Brand inverse />
        <div><span className="eyebrow">JOGA. ORGANIZA. PERTENCE.</span><h1>O teu futebol não termina no apito.</h1><p>Leva a tua pelada contigo: jogos, amigos, estatísticas e histórias.</p></div>
        <small>KickHub · Zürich</small>
      </section>
      <section className="auth-form-panel">
        <Link to="/" className="back-link"><ArrowLeft size={17}/> Voltar</Link>
        <div className="auth-form-wrap">
          {sent ? <div className="auth-success" aria-live="polite"><span><Check/></span><h2>Confere o teu email</h2><p>Enviámos um link seguro para <strong>{email}</strong>.</p><Button variant="outline" onClick={() => setSent(false)}>Usar outro email</Button><Button onClick={() => navigate('/app')}>Entrar na demonstração</Button></div> : <>
            <span className="eyebrow dark-text">BEM-VINDO AO KICKHUB</span><h1>Entra em campo.</h1><p className="form-intro">Usa o teu email. Sem passwords para decorar.</p>
            <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await sendMagicLink(email); setSent(true) } catch { setError('Não foi possível enviar o link. Tenta novamente.') } finally { setBusy(false) } }}>
              <label htmlFor="email">Email</label><div className="input-with-icon"><Mail size={19}/><input id="email" name="email" type="email" required autoComplete="email" placeholder="tu@email.com" value={email} onChange={(event) => setEmail(event.target.value)}/></div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button type="submit" size="lg" disabled={busy}>{busy ? 'A enviar…' : 'Enviar link de acesso'} {!busy && <ArrowRightIcon/>}</Button>
            </form>
            <div className="auth-divider"><span>ou</span></div>
            <Button variant="outline" size="lg" onClick={() => navigate('/app')}>Explorar com dados de demonstração</Button>
            <p className="legal-copy">Ao continuar, aceitas os Termos e a Política de Privacidade.</p>
          </>}
        </div>
      </section>
    </main>
  )
}

function ArrowRightIcon() { return <span aria-hidden="true">→</span> }
