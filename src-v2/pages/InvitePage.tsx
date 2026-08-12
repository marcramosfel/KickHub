import { ArrowRight, Check, Clock3, LockKeyhole, MapPin, ShieldCheck, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Badge, Button, Card } from '../components/ui'
import { peladas } from '../data/demo'
import { useOnboarding } from '../lib/onboarding'

export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { acceptInvite } = useOnboarding()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pelada = peladas[0]

  const accept = async () => {
    setBusy(true); setError('')
    try { navigate(`/p/${await acceptInvite(token)}`) }
    catch { setError('Este convite expirou, foi revogado ou já atingiu o limite de utilizações.') }
    finally { setBusy(false) }
  }

  return <main id="main-content" className="invite-page">
    <header><Link to="/"><Brand inverse/></Link><Badge tone="lime"><LockKeyhole/> CONVITE PRIVADO</Badge></header>
    <Card className="invite-card"><span className="pelada-monogram large">PB</span><p className="eyebrow dark-text">FOSTE CONVOCADO</p><h1>Entra na {pelada.name}.</h1><p>{pelada.description}</p>
      <dl><div><MapPin/><dt>Local</dt><dd>{pelada.city}, {pelada.country}</dd></div><div><UsersRound/><dt>Comunidade</dt><dd>{pelada.members} jogadores</dd></div><div><Clock3/><dt>Próximo jogo</dt><dd>{pelada.nextMatch}</dd></div></dl>
      <div className="secure-note"><ShieldCheck/><p><strong>Entrada segura</strong><br/>O convite concede acesso como jogador. As permissões administrativas continuam protegidas.</p></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button size="lg" disabled={busy || !token} onClick={accept}>{busy ? 'A entrar…' : 'Aceitar convite'} {!busy && <ArrowRight/>}</Button>
      <small><Check/> Ao aceitar, esta pelada aparece em “Minhas peladas”.</small>
    </Card>
  </main>
}
