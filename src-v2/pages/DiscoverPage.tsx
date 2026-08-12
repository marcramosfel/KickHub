import { ArrowRight, Map, MapPin, Search, SlidersHorizontal, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, EmptyState } from '../components/ui'
import { discoverPeladas } from '../data/demo'

export function DiscoverPage() {
  const [query, setQuery] = useState('')
  const results = useMemo(() => discoverPeladas.filter((pelada) => `${pelada.name} ${pelada.city}`.toLowerCase().includes(query.toLowerCase())), [query])
  return <div className="page discover-page">
    <header className="page-heading"><span className="eyebrow dark-text">ENCONTRA O TEU PRÓXIMO JOGO</span><h1>Descobrir peladas</h1><p>Comunidades abertas perto de ti, com o ritmo e formato que procuras.</p></header>
    <div className="search-panel"><label><span className="sr-only">Pesquisar por nome ou cidade</span><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, cidade ou região…"/></label><button><SlidersHorizontal/> Filtros</button><button><Map/> Mapa</button></div>
    <div className="discover-summary"><strong>{results.length} peladas perto de Zürich</strong><span>Localização aproximada · raio de 30 km</span></div>
    {results.length ? <div className="discover-grid">{results.map((pelada) => <Card key={pelada.id} className="discover-card" style={{ '--accent': pelada.accent } as React.CSSProperties}><div className="discover-card-head"><span className="pelada-monogram">{pelada.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><Badge tone="lime">ACEITA PEDIDOS</Badge></div><h2>{pelada.name}</h2><p>{pelada.description}</p><div className="discover-meta"><span><MapPin/> {pelada.city}</span><span><UsersRound/> {pelada.members} jogadores</span></div><div className="discover-foot"><span>Próximo: <strong>{pelada.nextMatch}</strong></span><Link to={`/p/${pelada.slug}`}>Ver pelada <ArrowRight/></Link></div></Card>)}</div> : <EmptyState icon={<Search/>} title="Nenhuma pelada encontrada" body="Tenta pesquisar outra cidade ou remove os filtros."/>}
  </div>
}
