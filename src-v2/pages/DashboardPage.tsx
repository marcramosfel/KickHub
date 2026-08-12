import { ArrowRight, CalendarDays, ChevronRight, Clock3, MapPin, Plus, Shield, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card } from '../components/ui'
import { currentProfile, peladas } from '../data/demo'
import { useI18n } from '../lib/i18n'

export function DashboardPage() {
  const { t } = useI18n()
  return (
    <div className="page page-dashboard">
      <header className="page-heading split-heading"><div><span className="eyebrow dark-text">QUARTA-FEIRA · 12 AGO</span><h1>Bom dia, {currentProfile.name.split(' ')[0]}.</h1><p>Duas peladas, uma semana cheia de futebol.</p></div><Link className="btn btn-primary btn-md" to="/criar"><Plus size={18}/> Nova pelada</Link></header>

      <section aria-labelledby="next-title">
        <div className="section-title-row"><div><span className="eyebrow dark-text">EM DESTAQUE</span><h2 id="next-title">{t('nextMatch')}</h2></div><Link to="/p/browns/jogos">Ver calendário <ArrowRight size={16}/></Link></div>
        <Card className="next-match-feature">
          <div className="match-date"><span>AGO</span><strong>14</strong><small>SEX</small></div>
          <div className="match-main"><Badge tone="lime">CONFIRMADO</Badge><h3>Pelada Browns · Jogo #87</h3><div className="match-meta"><span><Clock3/>20:30–22:00</span><span><MapPin/>Sportanlage Hardhof</span><span><UsersRound/>14 de 16 confirmados</span></div></div>
          <div className="attendance-ring" aria-label="14 de 16 jogadores confirmados"><strong>14</strong><span>/ 16</span></div>
          <Link className="btn btn-secondary btn-md" to="/p/browns">Abrir jogo <ChevronRight size={18}/></Link>
        </Card>
      </section>

      <section aria-labelledby="groups-title">
        <div className="section-title-row"><div><span className="eyebrow dark-text">AS TUAS COMUNIDADES</span><h2 id="groups-title">{t('myGroups')}</h2></div><span className="muted-count">{peladas.length} peladas</span></div>
        <div className="pelada-grid">
          {peladas.map((pelada) => <Link to={`/p/${pelada.slug}`} className="pelada-card" key={pelada.id} style={{ '--accent': pelada.accent } as React.CSSProperties}>
            <div className="pelada-cover"><span className="pelada-monogram">{pelada.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><Badge tone={pelada.role === 'owner' ? 'lime' : 'blue'}>{pelada.role === 'owner' ? 'OWNER' : 'JOGADOR'}</Badge></div>
            <div className="pelada-content"><h3>{pelada.name}</h3><p><MapPin size={15}/>{pelada.city}, {pelada.country}</p><div className="pelada-stats"><span><UsersRound/> {pelada.members} {t('members')}</span><span><CalendarDays/> {pelada.nextMatch}</span></div><span className="text-link">{t('viewGroup')} <ArrowRight size={16}/></span></div>
          </Link>)}
          <Link to="/criar" className="pelada-card pelada-card-new"><span><Plus/></span><h3>Cria a tua pelada</h3><p>Configura regras, convida jogadores e marca o primeiro jogo.</p></Link>
        </div>
      </section>

      <section className="dashboard-lower-grid">
        <Card><div className="section-title-row compact"><div><span className="eyebrow dark-text">ATIVIDADE</span><h2>Esta semana</h2></div></div><ol className="activity-list"><li><i className="activity-dot lime"/><div><strong>Confirmaste presença</strong><span>Pelada Browns · há 2 h</span></div></li><li><i className="activity-dot blue"/><div><strong>Subiste para 2.º no ranking</strong><span>Limmat United · ontem</span></div></li><li><i className="activity-dot orange"/><div><strong>Recebeste a conquista “Muralha”</strong><span>Pelada Browns · há 3 dias</span></div></li></ol></Card>
        <Card className="profile-completion"><Shield/><div><span className="eyebrow dark-text">PERFIL GLOBAL</span><h2>80% completo</h2><p>Adiciona a tua posição secundária para melhorar os sorteios.</p><Link to="/u/marcos">Completar perfil <ArrowRight size={16}/></Link></div></Card>
      </section>
    </div>
  )
}
