import { ArrowLeft, Check, Mail } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Button } from '../components/ui'
import { useAuth } from '../lib/auth'
import { sendMagicLink } from '../lib/supabase'

export function AuthPage() {
  const navigate = useNavigate()
  const { user, loading, signInWithGoogle } = useAuth()
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && user) navigate('/app', { replace: true })
  }, [loading, navigate, user])

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true)
    setError('')
    try {
      const started = await signInWithGoogle()
      if (!started) {
        setError('Não foi possível entrar com o Google. Tenta novamente.')
        setGoogleBusy(false)
      }
    } catch {
      setError('Não foi possível entrar com o Google. Tenta novamente.')
      setGoogleBusy(false)
    }
  }

  const handleMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await sendMagicLink(email)
      setSent(true)
    } catch {
      setError('Não foi possível enviar o link. Tenta novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Brand inverse />
        <div>
          <span className="eyebrow">JOGA. ORGANIZA. PERTENCE.</span>
          <h1>O teu futebol não termina no apito.</h1>
          <p>Leva a tua pelada contigo: jogos, amigos, estatísticas e histórias.</p>
        </div>
        <small>KickHub · Zürich</small>
      </section>
      <section className="auth-form-panel">
        <Link to="/" className="back-link"><ArrowLeft size={17}/> Voltar</Link>
        <div className="auth-form-wrap">
          {sent ? (
            <div className="auth-success" aria-live="polite">
              <span><Check/></span>
              <h2>Confere o teu email</h2>
              <p>Enviámos um link seguro para <strong>{email}</strong>.</p>
              <Button variant="outline" onClick={() => setSent(false)}>Usar outro email</Button>
              <Button onClick={() => navigate('/app')}>Entrar na demonstração</Button>
            </div>
          ) : (
            <>
              <span className="eyebrow dark-text">BEM-VINDO AO KICKHUB</span>
              <h1>Entra em campo.</h1>
              <p className="form-intro">Uma conta para todas as tuas peladas.</p>
              <Button
                className="google-auth-button"
                variant="outline"
                size="lg"
                disabled={loading || googleBusy}
                onClick={handleGoogleSignIn}
              >
                <GoogleMark /> {googleBusy ? 'A abrir o Google…' : 'Continuar com Google'}
              </Button>
              <p className="oauth-caption">
                Na primeira entrada, a tua conta e o perfil global são criados automaticamente.
              </p>
              <div className="auth-divider"><span>ou por email</span></div>
              <form onSubmit={handleMagicLink}>
                <label htmlFor="email">Email</label>
                <div className="input-with-icon">
                  <Mail size={19}/>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                {error && <p className="form-error" role="alert">{error}</p>}
                <Button type="submit" size="lg" disabled={busy}>
                  {busy ? 'A enviar…' : 'Enviar link de acesso'} {!busy && <ArrowRightIcon/>}
                </Button>
              </form>
              <div className="auth-divider"><span>ou</span></div>
              <Button variant="outline" size="lg" onClick={() => navigate('/app')}>
                Explorar com dados de demonstração
              </Button>
              <p className="legal-copy">Ao continuar, aceitas os Termos e a Política de Privacidade.</p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function ArrowRightIcon() {
  return <span aria-hidden="true">→</span>
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="google-mark">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"/>
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.61A10 10 0 0 0 12 22Z"/>
      <path fill="#FBBC05" d="M6.41 13.94A6.02 6.02 0 0 1 6.1 12c0-.67.12-1.32.31-1.94V7.45H3.07A10 10 0 0 0 2 12c0 1.64.39 3.2 1.07 4.55l3.34-2.61Z"/>
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.93 5.45l3.34 2.61C7.2 7.7 9.4 5.94 12 5.94Z"/>
    </svg>
  )
}
