import { ArrowRight, BarChart3, CalendarDays, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { LocaleSelect, useI18n } from '../lib/i18n'

export function LandingPage() {
  const { t, formatNumber } = useI18n()
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand inverse ariaLabel={t('common.brandHome')} />
        <nav aria-label={t('landing.pageNavigation')}>
          <a href="#produto">{t('landing.product')}</a><a href="#comunidade">{t('landing.community')}</a><a href="#seguranca">{t('landing.security')}</a>
        </nav>
        <div className="landing-actions"><LocaleSelect compact /><Link className="btn btn-ghost btn-sm" to="/entrar">{t('common.signIn')}</Link><Link className="btn btn-primary btn-sm" to="/app">{t('landing.start')}</Link></div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={15}/> {t('landing.heroEyebrow')}</span>
            <h1>{t('landing.hero')}</h1>
            <p>{t('landing.heroBody')}</p>
            <div className="hero-actions"><Link className="btn btn-primary btn-lg" to="/entrar">{t('landing.start')} <ArrowRight size={19}/></Link><Link className="btn btn-hero-secondary btn-lg" to="/app">{t('landing.explore')}</Link></div>
            <div className="trust-row"><span><ShieldCheck size={17}/> {t('landing.privacy')}</span><span><UsersRound size={17}/> {t('landing.roles')}</span></div>
          </div>
          <div className="hero-visual" aria-label={t('landing.preview')}>
            <div className="pitch-lines" aria-hidden="true"><i/><b/></div>
            <div className="floating-card next-game-card">
              <span className="mini-label">{t('landing.nextMatch')}</span><strong>{t('landing.fridayTime')}</strong><small>Sportanlage Hardhof</small>
              <div className="player-stack"><i>TR</i><i>MR</i><i>RF</i><i>+11</i></div>
            </div>
            <div className="floating-card balance-card"><span className="mini-label">{t('landing.balance')}</span><strong>96%</strong><div className="balance-bar"><i/></div><small>{t('landing.teamsReady')}</small></div>
            <div className="score-orbit"><span>AMR</span><strong>5 : 4</strong><span>AZL</span></div>
          </div>
        </section>

        <section id="produto" className="landing-section">
          <div className="section-heading"><span className="eyebrow">{t('landing.productEyebrow')}</span><h2>{t('landing.productTitle')}</h2></div>
          <div className="feature-grid">
            <article><CalendarDays/><span>01</span><h3>{t('landing.organizeTitle')}</h3><p>{t('landing.organizeBody')}</p></article>
            <article><Sparkles/><span>02</span><h3>{t('landing.balanceTitle')}</h3><p>{t('landing.balanceBody')}</p></article>
            <article><BarChart3/><span>03</span><h3>{t('landing.historyTitle')}</h3><p>{t('landing.historyBody')}</p></article>
          </div>
        </section>

        <section id="comunidade" className="community-band">
          <div><span className="eyebrow">{t('landing.worldEyebrow')}</span><h2>{t('landing.identityTitle')}</h2></div>
          <div className="metric"><strong>{formatNumber(2)}</strong><span>{t('landing.demoGroups')}</span></div>
          <div className="metric"><strong>{formatNumber(5)}</strong><span>{t('landing.languages')}</span></div>
          <div className="metric"><strong>{formatNumber(1, { style: 'percent' })}</strong><span>{t('landing.mobileFirst')}</span></div>
        </section>
      </main>
      <footer id="seguranca"><Brand inverse ariaLabel={t('common.brandHome')}/><p>{t('landing.footer')}</p><small>© 2026 KickHub</small></footer>
    </div>
  )
}
