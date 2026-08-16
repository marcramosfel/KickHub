import { ShieldCheck, Trophy } from 'lucide-react'
import { Badge, Card, EmptyState } from '../components/ui'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n } from '../lib/i18n'
import { contribution, usePeladaRanking, usePeladaTotals, winRate, type RankingRow } from '../lib/ranking'

/**
 * Serve as duas secções: o ranking por jogador e o resumo da comunidade. Os
 * números saem já agregados do servidor — somá-los no cliente obrigaria a
 * trazer todos os jogos para o browser.
 */
export function RankingSection({ variant }: { variant: 'ranking' | 'stats' }) {
  const { t } = useI18n()
  const { pelada, isDemo } = useCurrentPelada()
  const ranking = usePeladaRanking(pelada?.id, !isDemo)
  const totals = usePeladaTotals(pelada?.id, !isDemo && variant === 'stats')

  if (isDemo) {
    return (
      <div className="ranking-section">
        <Heading variant={variant}/>
        <p className="inline-notice" role="status"><ShieldCheck/> {t('ranking.demoNotice')}</p>
      </div>
    )
  }

  const rows = ranking.data ?? []
  const played = rows.some((row) => row.gamesPlayed > 0)

  return (
    <div className="ranking-section">
      <Heading variant={variant}/>

      {ranking.isPending ? (
        <div className="ranking-list" aria-label={t('ranking.loading')} aria-busy="true">
          {[0, 1, 2].map((item) => <div className="ranking-row ranking-row-skeleton" key={item} aria-hidden="true"><i/><b/></div>)}
        </div>
      ) : ranking.isError ? (
        <Card className="dashboard-data-state" role="alert">
          <ShieldCheck/>
          <div><h3>{t('ranking.errorTitle')}</h3><p>{t('ranking.errorBody')}</p></div>
          <button type="button" className="btn btn-outline btn-md" onClick={() => void ranking.refetch()}>{t('dashboard.retry')}</button>
        </Card>
      ) : !played ? (
        <EmptyState icon={<Trophy/>} title={t('ranking.emptyTitle')} body={t('ranking.emptyBody')}/>
      ) : variant === 'stats' ? (
        <StatsOverview rows={rows} totals={totals.data ?? null}/>
      ) : (
        <RankingTable rows={rows}/>
      )}
    </div>
  )
}

function Heading({ variant }: { variant: 'ranking' | 'stats' }) {
  const { t } = useI18n()
  return (
    <header className="page-heading">
      <span className="eyebrow dark-text">{t('ranking.eyebrow')}</span>
      <h1>{t(variant === 'stats' ? 'ranking.statsTitle' : 'ranking.title')}</h1>
      <p>{t(variant === 'stats' ? 'ranking.statsSubtitle' : 'ranking.subtitle')}</p>
    </header>
  )
}

function RankingTable({ rows }: { rows: RankingRow[] }) {
  const { t, formatNumber } = useI18n()
  return (
    <table className="ranking-table">
      <thead>
        <tr>
          <th scope="col"><span className="sr-only">{t('ranking.player')}</span>#</th>
          <th scope="col">{t('ranking.player')}</th>
          <th scope="col" title={t('ranking.games')}>{t('ranking.gamesShort')}</th>
          <th scope="col" title={t('ranking.goals')}>{t('ranking.goalsShort')}</th>
          <th scope="col" title={t('ranking.assists')}>{t('ranking.assistsShort')}</th>
          <th scope="col" title={t('ranking.saves')}>{t('ranking.savesShort')}</th>
          <th scope="col">{t('ranking.record')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const rate = winRate(row)
          return (
            <tr key={row.membershipId}>
              <td>{formatNumber(index + 1)}</td>
              <th scope="row">
                <strong>{row.displayName}</strong>
                <small>{rate === null
                  ? t('ranking.noDecided')
                  : t('ranking.winRate', { value: formatNumber(rate, { style: 'percent' }) })}</small>
              </th>
              <td>{formatNumber(row.gamesPlayed)}</td>
              <td><b>{formatNumber(row.goals)}</b></td>
              <td>{formatNumber(row.assists)}</td>
              <td>{formatNumber(row.saves)}</td>
              <td className="ranking-record">
                {formatNumber(row.wins)}-{formatNumber(row.draws)}-{formatNumber(row.losses)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function StatsOverview({ rows, totals }: { rows: RankingRow[]; totals: { gamesPlayed: number; goals: number; assists: number; activeMembers: number } | null }) {
  const { t, formatNumber } = useI18n()
  const topScorer = rows.find((row) => row.goals > 0)
  const topAssists = [...rows].sort((a, b) => b.assists - a.assists).find((row) => row.assists > 0)

  return (
    <>
      {totals ? (
        <div className="stats-grid">
          <Card><strong>{formatNumber(totals.gamesPlayed)}</strong><span>{t('ranking.totalGames', { count: totals.gamesPlayed })}</span></Card>
          <Card><strong>{formatNumber(totals.goals)}</strong><span>{t('ranking.totalGoals', { count: totals.goals })}</span></Card>
          <Card><strong>{formatNumber(totals.assists)}</strong><span>{t('ranking.totalAssists', { count: totals.assists })}</span></Card>
          <Card><strong>{formatNumber(totals.activeMembers)}</strong><span>{t('ranking.totalMembers', { count: totals.activeMembers })}</span></Card>
        </div>
      ) : null}

      <div className="stats-highlights">
        <Card>
          <Badge tone="lime">{t('ranking.topScorer')}</Badge>
          <strong>{topScorer?.displayName ?? t('ranking.noneYet')}</strong>
          {topScorer ? <small>{formatNumber(topScorer.goals)} {t('ranking.goals')}</small> : null}
        </Card>
        <Card>
          <Badge tone="blue">{t('ranking.topAssists')}</Badge>
          <strong>{topAssists?.displayName ?? t('ranking.noneYet')}</strong>
          {topAssists ? <small>{formatNumber(topAssists.assists)} {t('ranking.assists')}</small> : null}
        </Card>
        <Card>
          <Badge tone="orange">{t('ranking.contribution')}</Badge>
          <strong>{rows[0] ? formatNumber(contribution(rows[0])) : t('ranking.noneYet')}</strong>
          {rows[0] ? <small>{rows[0].displayName}</small> : null}
        </Card>
      </div>
    </>
  )
}
