import { Activity, ArrowRight, CalendarDays, Check, ChevronRight, ClipboardList, Copy, Crown, Inbox, Link2, MapPin, Settings, ShieldCheck, Sparkles, Trophy, UserCheck, UsersRound, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { Avatar, Badge, Button, Card } from '../components/ui'
import { peladas, rankings, upcomingPlayers } from '../data/demo'
import { useOnboarding } from '../lib/onboarding'

const memberTabs = [
  ['', 'Visão geral'], ['jogos', 'Jogos'], ['jogadores', 'Plantel'], ['ranking', 'Ranking'], ['estatisticas', 'Estatísticas'], ['admin', 'Admin'],
]

export function PeladaPage() {
  const { slug = 'browns', section } = useParams()
  const pelada = peladas.find((item) => item.slug === slug) ?? peladas[0]
  const tabs = pelada.role === 'owner' || pelada.role === 'admin' ? memberTabs : memberTabs.filter(([path]) => path !== 'admin')
  return <div className="pelada-page">
    <header className="pelada-hero" style={{ '--accent': pelada.accent } as React.CSSProperties}>
      <div className="pelada-hero-inner"><span className="pelada-monogram large">{pelada.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><div className="pelada-title-line"><h1>{pelada.name}</h1><Badge tone={pelada.visibility === 'private' ? 'neutral' : 'lime'}>{pelada.visibility === 'private' ? 'PRIVADA' : 'PÚBLICA'}</Badge></div><p><MapPin/> {pelada.city}, {pelada.country} · {pelada.members} jogadores</p></div><div className="pelada-actions"><Button variant="outline"><Settings/> Definições</Button><Button><CalendarDays/> Novo jogo</Button></div></div>
      <nav aria-label="Secções da pelada">{tabs.map(([path, label]) => <NavLink key={path} end={!path} to={`/p/${slug}${path ? `/${path}` : ''}`}>{label}</NavLink>)}</nav>
    </header>
    <main id="main-content" className="page pelada-content">{section === 'admin' ? <AdminPanel peladaId={pelada.id} canAdmin={pelada.role === 'owner' || pelada.role === 'admin'}/> : section ? <SectionPlaceholder section={section} slug={slug}/> : <Overview slug={slug}/>}</main>
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
  }
  const [title, body, icon] = content[section] ?? content.jogos
  return <div className="section-placeholder"><span>{icon}</span><p className="eyebrow dark-text">MÓDULO FOUNDATION</p><h2>{title}</h2><p>{body}</p><div><Button>Começar tarefa</Button><Link className="btn btn-outline btn-md" to={`/p/${slug}`}>Voltar à visão geral</Link></div></div>
}

function AdminPanel({ peladaId, canAdmin }: { peladaId: string; canAdmin: boolean }) {
  const { requests, loadRequests, reviewRequest, createInvite } = useOnboarding()
  const [busyId, setBusyId] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteExpiry, setInviteExpiry] = useState('')
  const [notice, setNotice] = useState('')
  const pending = requests.filter((request) => request.peladaId === peladaId && request.status === 'pending')

  useEffect(() => { if (canAdmin) void loadRequests(peladaId) }, [canAdmin, loadRequests, peladaId])

  if (!canAdmin) return <div className="section-placeholder"><span><ShieldCheck/></span><p className="eyebrow dark-text">ÁREA PROTEGIDA</p><h2>Só para a equipa de organização.</h2><p>Owners e administradores gerem membros, convites e regras. Jogadores não recebem estas permissões.</p></div>

  const decide = async (requestId: string, decision: 'approved' | 'rejected') => {
    setBusyId(requestId); setNotice('')
    try {
      await reviewRequest(requestId, decision)
      setNotice(decision === 'approved' ? 'Jogador aprovado e adicionado ao plantel.' : 'Pedido rejeitado.')
    } catch { setNotice('Não foi possível rever o pedido. Tenta novamente.') }
    finally { setBusyId('') }
  }

  const generateInvite = async () => {
    setBusyId('invite'); setNotice('')
    try {
      const invite = await createInvite(peladaId)
      setInviteUrl(invite.url)
      setInviteExpiry(new Intl.DateTimeFormat('pt', { dateStyle: 'medium' }).format(new Date(invite.expiresAt)))
      setNotice('Convite criado. O token só é mostrado nesta sessão.')
    } catch { setNotice('Não foi possível criar o convite. Tenta novamente.') }
    finally { setBusyId('') }
  }

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setNotice('Link copiado para a área de transferência.')
  }

  return <div className="admin-page">
    <header className="page-heading split-heading"><div><span className="eyebrow dark-text">CENTRO DE ADMINISTRAÇÃO</span><h1>Organiza o balneário.</h1><p>Aprova jogadores e cria convites sem expor permissões sensíveis.</p></div><Badge tone="lime"><ShieldCheck/> OWNER</Badge></header>
    {notice && <p className="inline-notice" role="status"><Check/> {notice}</p>}
    <div className="admin-grid">
      <section aria-labelledby="requests-title"><div className="section-title-row"><div><span className="eyebrow dark-text">FILA DE ENTRADA</span><h2 id="requests-title">Pedidos pendentes</h2></div><Badge tone={pending.length ? 'orange' : 'neutral'}>{pending.length}</Badge></div>
        {pending.length ? <div className="request-list">{pending.map((request) => <Card className="request-card" key={request.id}><div className="request-person"><span className="avatar avatar-md">{request.playerName.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><strong>{request.playerName}</strong><small>@{request.username} · {request.createdAt}</small></div></div><blockquote>{request.message || 'Sem mensagem de apresentação.'}</blockquote><div className="request-actions"><Button variant="outline" disabled={busyId === request.id} onClick={() => decide(request.id, 'rejected')}><UserX/> Rejeitar</Button><Button disabled={busyId === request.id} onClick={() => decide(request.id, 'approved')}><UserCheck/> Aprovar</Button></div></Card>)}</div> : <Card className="empty-state compact"><span className="empty-icon"><Inbox/></span><h2>Fila limpa</h2><p>Não existem pedidos aguardando revisão.</p></Card>}
      </section>
      <aside><Card className="invite-builder"><span className="invite-icon"><Link2/></span><p className="eyebrow dark-text">CONVITE CONTROLADO</p><h2>Chama a equipa.</h2><p>Cria um link válido por 7 dias e até 25 utilizações. Novos membros entram como jogadores.</p>{inviteUrl ? <div className="invite-result"><label htmlFor="invite-url">Link privado</label><div><input id="invite-url" readOnly value={inviteUrl}/><Button size="icon" variant="outline" onClick={copyInvite} aria-label="Copiar convite"><Copy/></Button></div><small>Expira em {inviteExpiry}. Podes gerar outro link quando necessário.</small></div> : <Button onClick={generateInvite} disabled={busyId === 'invite'}>{busyId === 'invite' ? 'A criar…' : 'Criar convite'} <ArrowRight/></Button>}</Card>
        <Card className="permission-card"><ShieldCheck/><div><strong>Permissões no servidor</strong><p>Pedidos, convites e memberships são validados pelas regras da pelada, não apenas pela interface.</p></div></Card>
      </aside>
    </div>
  </div>
}
