import { Activity, ArrowRight, CalendarDays, ChevronRight, ClipboardList, Crown, MapPin, Settings, ShieldCheck, Sparkles, Trophy, UsersRound } from 'lucide-react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Card } from '../components/ui'
import { peladas, rankings, upcomingPlayers } from '../data/demo'

const tabs = [
  ['', 'Visão geral'], ['jogos', 'Jogos'], ['jogadores', 'Plantel'], ['ranking', 'Ranking'], ['estatisticas', 'Estatísticas'], ['admin', 'Admin'],
]

export function PeladaPage() {
  const { slug = 'browns', section } = useParams()
  const pelada = peladas.find((item) => item.slug === slug) ?? peladas[0]
  return <div className="pelada-page">
    <header className="pelada-hero" style={{ '--accent': pelada.accent } as React.CSSProperties}>
      <div className="pelada-hero-inner"><span className="pelada-monogram large">{pelada.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><div className="pelada-title-line"><h1>{pelada.name}</h1><Badge tone={pelada.visibility === 'private' ? 'neutral' : 'lime'}>{pelada.visibility === 'private' ? 'PRIVADA' : 'PÚBLICA'}</Badge></div><p><MapPin/> {pelada.city}, {pelada.country} · {pelada.members} jogadores</p></div><div className="pelada-actions"><Button variant="outline"><Settings/> Definições</Button><Button><CalendarDays/> Novo jogo</Button></div></div>
      <nav aria-label="Secções da pelada">{tabs.map(([path, label]) => <NavLink key={path} end={!path} to={`/p/${slug}${path ? `/${path}` : ''}`}>{label}</NavLink>)}</nav>
    </header>
    <main id="main-content" className="page pelada-content">{section ? <SectionPlaceholder section={section} slug={slug}/> : <Overview slug={slug}/>}</main>
  </div>
}

function Overview({ slug }: { slug: string }) {
  return <>
    <section className="pelada-welcome"><div><span className="eyebrow dark-text">SEXTA-FEIRA É DIA</span><h2>O próximo capítulo começa em 2 dias.</h2></div><Button>Confirmar presença <ArrowRight/></Button></section>
    <div className="pelada-overview-grid">
      <Card className="game-card-feature"><div className="game-card-top"><Badge tone="lime">JOGO ABERTO</Badge><span>14/16 confirmados</span></div><h2>Jogo #87</h2><div className="big-date"><strong>14</strong><span>AGO<br/>SEX</span></div><div className="match-meta vertical"><span><CalendarDays/> Sexta, 20:30–22:00</span><span><MapPin/> Sportanlage Hardhof</span></div><div className="attendance-avatars">{upcomingPlayers.slice(0,7).map(([name]) => <Avatar key={name} name={name} size="sm"/>)}<span>+7</span></div><Link to={`/p/${slug}/jogos`}>Ver convocatória <ChevronRight/></Link></Card>
      <Card className="balance-preview"><div className="card-head"><div><span className="eyebrow dark-text">SORTEIO INTELIGENTE</span><h2>Equipas projetadas</h2></div><Sparkles/></div><div className="teams-preview"><div><span>AMARELOS</span><strong>4.38</strong><div className="mini-team">{upcomingPlayers.slice(0,5).map(([name,pos]) => <p key={name}><Avatar name={name} size="sm"/><b>{name}</b><small>{pos}</small></p>)}</div></div><div className="versus"><span>96%</span><small>equilíbrio</small><i>VS</i></div><div><span>AZUIS</span><strong>4.32</strong><div className="mini-team">{upcomingPlayers.slice(5,10).map(([name,pos]) => <p key={name}><Avatar name={name} size="sm"/><b>{name}</b><small>{pos}</small></p>)}</div></div></div><Button variant="secondary">Abrir simulador</Button></Card>
      <Card className="ranking-card"><div className="card-head"><div><span className="eyebrow dark-text">RANKING ATUAL</span><h2>Top Overall</h2></div><Trophy/></div><ol>{rankings.map((player) => <li key={player.name}><span>{player.rank}</span><Avatar name={player.name} size="sm"/><strong>{player.name}</strong><b>{player.value.toFixed(2)}</b><small>{player.trend}</small></li>)}</ol><Link to={`/p/${slug}/ranking`}>Ver ranking completo <ArrowRight/></Link></Card>
      <Card className="pulse-card"><div className="card-head"><div><span className="eyebrow dark-text">PULSO DA COMUNIDADE</span><h2>Últimas histórias</h2></div><Activity/></div><div className="story"><span className="story-icon lime"><Crown/></span><p><strong>Tiago foi o craque</strong><small>Jogo #86 · 8 votos</small></p></div><div className="story"><span className="story-icon blue"><ShieldCheck/></span><p><strong>Bruno fez 12 defesas</strong><small>Novo recorde da época</small></p></div><div className="story"><span className="story-icon orange"><ClipboardList/></span><p><strong>A resenha do jogo saiu</strong><small>“Noite de reviravolta…”</small></p></div></Card>
    </div>
  </>
}

function SectionPlaceholder({ section, slug }: { section: string; slug: string }) {
  const content: Record<string, [string,string,React.ReactNode]> = {
    jogos: ['Calendário e jogos', 'Cria convocatórias, acompanha presenças e guarda cada resultado.', <CalendarDays key="jogos"/>],
    jogadores: ['Plantel', 'Perfis, posições, disponibilidade e papéis desta comunidade.', <UsersRound key="jogadores"/>],
    ranking: ['Ranking', 'Overall, forma recente e evolução dos jogadores da pelada.', <Trophy key="ranking"/>],
    estatisticas: ['Estatísticas', 'Gols, assistências, defesas, química e recordes por período.', <Activity key="estatisticas"/>],
    admin: ['Centro de administração', 'Membros, regras, convites, jogos e permissões num único lugar.', <Settings key="admin"/>],
  }
  const [title, body, icon] = content[section] ?? content.jogos
  return <div className="section-placeholder"><span>{icon}</span><p className="eyebrow dark-text">MÓDULO FOUNDATION</p><h2>{title}</h2><p>{body}</p><div><Button>Começar tarefa</Button><Link className="btn btn-outline btn-md" to={`/p/${slug}`}>Voltar à visão geral</Link></div></div>
}
