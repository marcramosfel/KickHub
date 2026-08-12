import { ArrowRight, Check, Clock3, Map, MapPin, Search, Send, SlidersHorizontal, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState } from '../components/ui'
import { discoverPeladas, type Pelada } from '../data/demo'
import { useOnboarding } from '../lib/onboarding'
import { discoverPublicPeladas } from '../lib/onboarding-api'

export function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Pelada | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [remoteResults, setRemoteResults] = useState<Pelada[] | null>(null)
  const [loading, setLoading] = useState(false)
  const { joinStates, requestJoin } = useOnboarding()
  const demoResults = useMemo(() => discoverPeladas.filter((pelada) => `${pelada.name} ${pelada.city}`.toLowerCase().includes(query.toLowerCase())), [query])
  const results = remoteResults ?? demoResults

  useEffect(() => {
    let active = true
    const timeout = window.setTimeout(async () => {
      setLoading(true)
      const result = await discoverPublicPeladas(query.trim())
      if (active) { setRemoteResults(result); setLoading(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [query])

  const submitRequest = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const status = await requestJoin(selected, message.trim())
      setNotice(status === 'active' ? `Já fazes parte da ${selected.name}.` : `Pedido enviado para ${selected.name}.`)
      setSelected(null)
      setMessage('')
    } catch {
      setNotice('Não foi possível enviar o pedido. Inicia sessão e tenta novamente.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="page discover-page">
    <header className="page-heading"><span className="eyebrow dark-text">ENCONTRA O TEU PRÓXIMO JOGO</span><h1>Descobrir peladas</h1><p>Comunidades abertas perto de ti, com o ritmo e formato que procuras.</p></header>
    <div className="search-panel"><label><span className="sr-only">Pesquisar por nome ou cidade</span><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, cidade ou região…"/></label><button type="button"><SlidersHorizontal/> Filtros</button><button type="button"><Map/> Mapa</button></div>
    <div className="discover-summary" aria-live="polite"><strong>{loading ? 'A procurar…' : `${results.length} peladas perto de Zürich`}</strong><span>Localização aproximada · raio de 30 km</span></div>
    {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}
    {results.length ? <div className="discover-grid" aria-busy={loading}>{results.map((pelada) => {
      const state = pelada.membership === 'active' ? 'active' : (joinStates[pelada.id] ?? 'idle')
      return <Card key={pelada.id} className="discover-card" style={{ '--accent': pelada.accent } as React.CSSProperties}>
        <div className="discover-card-head"><span className="pelada-monogram">{initials(pelada.name)}</span><Badge tone={state === 'active' ? 'blue' : state === 'pending' ? 'orange' : 'lime'}>{state === 'active' ? 'MEMBRO' : state === 'pending' ? 'PEDIDO PENDENTE' : pelada.joinMode === 'open' ? 'ENTRADA ABERTA' : 'ACEITA PEDIDOS'}</Badge></div>
        <h2>{pelada.name}</h2><p>{pelada.description}</p>
        <div className="discover-meta"><span><MapPin/> {pelada.city}</span><span><UsersRound/> {pelada.members} jogadores</span></div>
        <div className="discover-foot"><span>Próximo: <strong>{pelada.nextMatch}</strong></span><Link to={`/p/${pelada.slug}`}>Ver pelada <ArrowRight/></Link></div>
        <div className="discover-actions">{state === 'active' ? <Link className="btn btn-secondary btn-md" to={`/p/${pelada.slug}`}>Abrir comunidade</Link> : state === 'pending' ? <span className="pending-label"><Clock3/> Aguardando aprovação</span> : <Button onClick={() => { setSelected(pelada); setNotice('') }}><Send/> {pelada.joinMode === 'open' ? 'Entrar agora' : 'Pedir entrada'}</Button>}</div>
      </Card>
    })}</div> : <EmptyState icon={<Search/>} title="Nenhuma pelada encontrada" body="Tenta pesquisar outra cidade ou remove os filtros."/>}

    {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
      <section className="join-dialog" role="dialog" aria-modal="true" aria-labelledby="join-title">
        <button className="dialog-close" type="button" onClick={() => setSelected(null)} aria-label="Fechar"><X/></button>
        <span className="pelada-monogram" style={{ background: selected.accent }}>{initials(selected.name)}</span>
        <p className="eyebrow dark-text">NOVO VESTIÁRIO</p><h2 id="join-title">Entrar na {selected.name}</h2>
        {selected.joinMode === 'open' ? <p>A entrada é imediata. Vais passar a ver jogos, plantel e atividade desta comunidade.</p> : <label htmlFor="join-message">Mensagem para os administradores<textarea id="join-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} placeholder="Apresenta-te, diz como jogas ou quem te convidou…"/><small>{message.length}/500</small></label>}
        <div className="dialog-actions"><Button variant="ghost" onClick={() => setSelected(null)}>Cancelar</Button><Button disabled={busy} onClick={submitRequest}>{busy ? 'A enviar…' : selected.joinMode === 'open' ? 'Confirmar entrada' : 'Enviar pedido'} <ArrowRight/></Button></div>
      </section>
    </div>}
  </div>
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).slice(0, 2).join('')
}
