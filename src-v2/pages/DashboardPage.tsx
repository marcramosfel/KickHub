import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Clock3, MapPin, Plus, Shield, UsersRound } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, Card, EmptyState } from '../components/ui'
import { peladas as demoPeladas, type Pelada } from '../data/demo'
import { getAuthDisplayName, useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useMyPeladas } from '../lib/peladas'

export function DashboardPage() {
  const { t, locale } = useI18n()
  const { user, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const myPeladas = useMyPeladas(user?.id)
  const isDemo = !user
  const peladas = isDemo ? demoPeladas : (myPeladas.data ?? [])
  const firstName = getAuthDisplayName(user, profile).split(' ')[0]
  const createdName = searchParams.get('created')
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' })
    .format(new Date())
    .toLocaleUpperCase(locale)

  return (
    <div className="page page-dashboard">
      <header className="page-heading split-heading">
        <div>
          <span className="eyebrow dark-text">{dateLabel}</span>
          <h1>Bom dia, {firstName}.</h1>
          <p>{isDemo ? 'Duas peladas, uma semana cheia de futebol.' : dashboardSummary(peladas.length)}</p>
        </div>
        <Link className="btn btn-primary btn-md" to="/criar"><Plus size={18}/> Nova pelada</Link>
      </header>

      {createdName && (
        <p className="inline-notice" role="status">
          <CheckCircle2/> {searchParams.get('demo') ? `${createdName} foi criada na demonstração.` : `${createdName} já faz parte das tuas peladas.`}
        </p>
      )}

      {isDemo ? <DemoNextMatch t={t}/> : peladas.length > 0 ? <RealNextStep pelada={peladas[0]}/> : null}

      <section aria-labelledby="groups-title">
        <div className="section-title-row">
          <div><span className="eyebrow dark-text">AS TUAS COMUNIDADES</span><h2 id="groups-title">{t('myGroups')}</h2></div>
          {!myPeladas.isPending || isDemo ? <span className="muted-count">{peladas.length} {peladas.length === 1 ? 'pelada' : 'peladas'}</span> : null}
        </div>

        {!isDemo && myPeladas.isPending ? (
          <div className="pelada-grid" aria-label="A carregar as tuas peladas" aria-busy="true">
            {[0, 1].map((item) => <div className="pelada-card pelada-card-skeleton" key={item} aria-hidden="true"><span/><i/><i/><b/></div>)}
          </div>
        ) : !isDemo && myPeladas.isError ? (
          <Card className="dashboard-data-state" role="alert">
            <Shield/>
            <div><h3>Não conseguimos carregar as tuas peladas.</h3><p>A sessão continua segura. Tenta novamente dentro de alguns segundos.</p></div>
            <button type="button" className="btn btn-outline btn-md" onClick={() => void myPeladas.refetch()}>Tentar novamente</button>
          </Card>
        ) : peladas.length === 0 ? (
          <EmptyState
            icon={<UsersRound/>}
            title="A tua primeira pelada começa aqui."
            body="Cria a comunidade, define as regras e convida os jogadores sem misturar dados entre grupos."
            action={<Link className="btn btn-primary btn-md" to="/criar"><Plus/> Criar primeira pelada</Link>}
          />
        ) : (
          <div className="pelada-grid">
            {peladas.map((pelada) => <PeladaCard key={pelada.id} pelada={pelada} membersLabel={t('members')} openLabel={t('viewGroup')}/>) }
            <Link to="/criar" className="pelada-card pelada-card-new"><span><Plus/></span><h3>Cria a tua pelada</h3><p>Configura regras, convida jogadores e marca o primeiro jogo.</p></Link>
          </div>
        )}
      </section>

      {isDemo && <DemoLowerGrid/>}
    </div>
  )
}

function dashboardSummary(count: number) {
  if (count === 0) return 'Ainda não participas em nenhuma pelada.'
  if (count === 1) return 'Uma comunidade pronta para entrar em campo.'
  return `${count} comunidades, uma só identidade.`
}

function PeladaCard({ pelada, membersLabel, openLabel }: { pelada: Pelada; membersLabel: string; openLabel: string }) {
  return (
    <Link to={`/p/${pelada.slug}`} className="pelada-card" style={{ '--accent': pelada.accent } as React.CSSProperties}>
      <div className="pelada-cover">
        <span className="pelada-monogram">{pelada.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
        <Badge tone={pelada.role === 'owner' ? 'lime' : pelada.role === 'admin' ? 'orange' : 'blue'}>{roleLabel(pelada.role)}</Badge>
      </div>
      <div className="pelada-content">
        <h3>{pelada.name}</h3>
        <p><MapPin size={15}/>{pelada.city}, {pelada.country}</p>
        <div className="pelada-stats"><span><UsersRound/> {pelada.members} {membersLabel}</span><span><CalendarDays/> {pelada.nextMatch}</span></div>
        <span className="text-link">{openLabel} <ArrowRight size={16}/></span>
      </div>
    </Link>
  )
}

function roleLabel(role: Pelada['role']) {
  if (role === 'owner') return 'OWNER'
  if (role === 'admin') return 'ADMIN'
  return 'JOGADOR'
}

function RealNextStep({ pelada }: { pelada: Pelada }) {
  return (
    <section aria-labelledby="next-step-title">
      <div className="section-title-row"><div><span className="eyebrow dark-text">PRÓXIMO PASSO</span><h2 id="next-step-title">Põe a bola a rolar</h2></div></div>
      <Card className="dashboard-next-step">
        <span><CalendarDays/></span>
        <div><Badge tone="lime">{pelada.role === 'owner' ? 'OWNER' : 'MEMBRO'}</Badge><h3>{pelada.name}</h3><p>Cria o primeiro jogo ou abre a comunidade para acompanhar as próximas atividades.</p></div>
        <Link className="btn btn-secondary btn-md" to={`/p/${pelada.slug}`}>Abrir pelada <ChevronRight/></Link>
      </Card>
    </section>
  )
}

function DemoNextMatch({ t }: { t: (key: 'nextMatch') => string }) {
  return (
    <section aria-labelledby="next-title">
      <div className="section-title-row"><div><span className="eyebrow dark-text">EM DESTAQUE</span><h2 id="next-title">{t('nextMatch')}</h2></div><Link to="/p/browns/jogos">Ver calendário <ArrowRight size={16}/></Link></div>
      <Card className="next-match-feature">
        <div className="match-date"><span>AGO</span><strong>14</strong><small>SEX</small></div>
        <div className="match-main"><Badge tone="lime">CONFIRMADO</Badge><h3>Pelada Browns · Jogo #87</h3><div className="match-meta"><span><Clock3/>20:30–22:00</span><span><MapPin/>Sportanlage Hardhof</span><span><UsersRound/>14 de 16 confirmados</span></div></div>
        <div className="attendance-ring" aria-label="14 de 16 jogadores confirmados"><strong>14</strong><span>/ 16</span></div>
        <Link className="btn btn-secondary btn-md" to="/p/browns">Abrir jogo <ChevronRight size={18}/></Link>
      </Card>
    </section>
  )
}

function DemoLowerGrid() {
  return (
    <section className="dashboard-lower-grid">
      <Card><div className="section-title-row compact"><div><span className="eyebrow dark-text">ATIVIDADE</span><h2>Esta semana</h2></div></div><ol className="activity-list"><li><i className="activity-dot lime"/><div><strong>Confirmaste presença</strong><span>Pelada Browns · há 2 h</span></div></li><li><i className="activity-dot blue"/><div><strong>Subiste para 2.º no ranking</strong><span>Limmat United · ontem</span></div></li><li><i className="activity-dot orange"/><div><strong>Recebeste a conquista “Muralha”</strong><span>Pelada Browns · há 3 dias</span></div></li></ol></Card>
      <Card className="profile-completion"><Shield/><div><span className="eyebrow dark-text">PERFIL GLOBAL</span><h2>80% completo</h2><p>Adiciona a tua posição secundária para melhorar os sorteios.</p><Link to="/u/marcos">Completar perfil <ArrowRight size={16}/></Link></div></Card>
    </section>
  )
}
