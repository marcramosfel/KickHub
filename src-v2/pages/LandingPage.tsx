import { ArrowRight, BarChart3, CalendarDays, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { LocaleSelect, useI18n } from '../lib/i18n'

export function LandingPage() {
  const { t } = useI18n()
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand inverse />
        <nav aria-label="Navegação da página">
          <a href="#produto">Produto</a><a href="#comunidade">Comunidade</a><a href="#seguranca">Segurança</a>
        </nav>
        <div className="landing-actions"><LocaleSelect compact /><Link className="btn btn-ghost btn-sm" to="/entrar">{t('signIn')}</Link><Link className="btn btn-primary btn-sm" to="/app">{t('start')}</Link></div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={15}/> Feito para quem organiza e para quem joga</span>
            <h1>{t('hero')}</h1>
            <p>{t('heroBody')}</p>
            <div className="hero-actions"><Link className="btn btn-primary btn-lg" to="/entrar">{t('start')} <ArrowRight size={19}/></Link><Link className="btn btn-hero-secondary btn-lg" to="/app">{t('explore')}</Link></div>
            <div className="trust-row"><span><ShieldCheck size={17}/> Privacidade por pelada</span><span><UsersRound size={17}/> Papéis e permissões</span></div>
          </div>
          <div className="hero-visual" aria-label="Prévia do painel KickHub">
            <div className="pitch-lines" aria-hidden="true"><i/><b/></div>
            <div className="floating-card next-game-card">
              <span className="mini-label">PRÓXIMO JOGO</span><strong>Sexta · 20:30</strong><small>Sportanlage Hardhof</small>
              <div className="player-stack"><i>TR</i><i>MR</i><i>RF</i><i>+11</i></div>
            </div>
            <div className="floating-card balance-card"><span className="mini-label">EQUILÍBRIO</span><strong>96%</strong><div className="balance-bar"><i/></div><small>Equipas prontas para jogar</small></div>
            <div className="score-orbit"><span>AMR</span><strong>5 : 4</strong><span>AZL</span></div>
          </div>
        </section>

        <section id="produto" className="landing-section">
          <div className="section-heading"><span className="eyebrow">UM JOGO. UMA COMUNIDADE.</span><h2>Tudo o que acontece antes, durante e depois do apito.</h2></div>
          <div className="feature-grid">
            <article><CalendarDays/><span>01</span><h3>Organize sem caos</h3><p>Convocatória, disponibilidade, local e horário num único lugar.</p></article>
            <article><Sparkles/><span>02</span><h3>Equilibre de verdade</h3><p>Sorteios consideram Overall, posição e modos de goleiro.</p></article>
            <article><BarChart3/><span>03</span><h3>Construa a história</h3><p>Resultados, rankings, conquistas e resenha que ficam para sempre.</p></article>
          </div>
        </section>

        <section id="comunidade" className="community-band">
          <div><span className="eyebrow">DE ZÜRICH PARA O MUNDO</span><h2>A mesma pessoa. Várias peladas. Uma identidade.</h2></div>
          <div className="metric"><strong>2</strong><span>peladas no perfil demo</span></div>
          <div className="metric"><strong>5</strong><span>idiomas preparados</span></div>
          <div className="metric"><strong>100%</strong><span>mobile-first</span></div>
        </section>
      </main>
      <footer id="seguranca"><Brand inverse/><p>O futebol amador merece produto profissional.</p><small>© 2026 KickHub</small></footer>
    </div>
  )
}
