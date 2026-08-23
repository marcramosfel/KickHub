import { ShieldCheck, Trophy } from 'lucide-react'
import { Card, EmptyState } from '../components/ui'
import { CardBadge } from './PlayerCards'
import { HeroLeaders } from './HeroLeaders'
import { PlayerPhoto } from './PlayerPhoto'
import { computeCards, mainCard } from '../domain/player-cards'
import { computeTitles, explainSquadOverall } from '../domain/player-overall'
import { useSignedAvatars } from '../lib/avatars'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n } from '../lib/i18n'
import { contribution, usePeladaRanking, usePeladaTotals, winRate, type RankingRow } from '../lib/ranking'

/**
 * Serve as duas secções: o ranking por jogador e o resumo da comunidade. Os
 * números saem já agregados do servidor — somá-los no cliente obrigaria a
 * trazer todos os jogos para o browser.
 */
/** Nome com a marca de ex-membro, para a tabela e os destaques concordarem. */
function PlayerName({ row }: { row: Pick<RankingRow, 'displayName' | 'isFormer'> }) {
  const { t } = useI18n()
  return <>{row.displayName}{row.isFormer ? <span className="ranking-former">{t('ranking.former')}</span> : null}</>
}

export function RankingSection({ variant }: { variant: 'ranking' | 'stats' }) {
  const { t } = useI18n()
  const { pelada } = useCurrentPelada()
  const ranking = usePeladaRanking(pelada?.id, true)
  const totals = usePeladaTotals(pelada?.id, variant === 'stats')

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
        <StatsOverview totals={totals.data ?? null}/>
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
  // Duas passagens: os títulos dependem de comparar o plantel inteiro, portanto
  // o overall de uma linha não se calcula a partir dessa linha sozinha.
  const overallByMember = explainSquadOverall(rows)
  // Os cards saem do mesmo plantel que o overall — a liderança de um título só
  // existe comparando toda a gente, e comparar duas vezes dava duas respostas.
  const titlesByMember = computeTitles(rows)
  const cardsByMember = computeCards({
    rows: rows.map((row) => ({
      ...row,
      primaryPosition: null, secondaryPosition: null, acceptsOtherPositions: false,
      overall: overallByMember.get(row.membershipId)?.overall ?? null,
      provisional: overallByMember.get(row.membershipId)?.provisional ?? true,
      titles: titlesByMember.get(row.membershipId) ?? [],
    })),
  })
  const avatars = useSignedAvatars(rows.map((row) => ({
    id: row.membershipId, path: row.avatarPath, bucket: row.avatarBucket,
  })))

  // A ordem é a do overall, e ele só existe aqui: o servidor não o calcula, e
  // por isso devolve as linhas por golos. Quem ainda não tem número fica no fim
  // — ordenar por um valor que não existe é inventá-lo.
  const ranked = [...rows].sort((left, right) => {
    const leftOverall = overallByMember.get(left.membershipId)?.overall
    const rightOverall = overallByMember.get(right.membershipId)?.overall
    if (leftOverall !== rightOverall) return (rightOverall ?? -1) - (leftOverall ?? -1)
    if (left.gamesPlayed !== right.gamesPlayed) return right.gamesPlayed - left.gamesPlayed
    if (contribution(left) !== contribution(right)) return contribution(right) - contribution(left)
    if (left.wins !== right.wins) return right.wins - left.wins
    return left.displayName.localeCompare(right.displayName)
  })
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
          <th scope="col" title={t('ranking.overall')}>{t('ranking.overallShort')}</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((row, index) => {
          const rate = winRate(row)
          const breakdown = overallByMember.get(row.membershipId)
          const overall = breakdown?.overall ?? null
          const provisional = breakdown?.provisional ?? false
          return (
            <tr key={row.membershipId}>
              <td>{formatNumber(index + 1)}</td>
              <th scope="row">
                <PlayerPhoto membershipId={row.membershipId} name={row.displayName} size="sm" src={avatars.get(row.membershipId)}/>
                <strong><PlayerName row={row}/><CardBadge card={mainCard(cardsByMember.get(row.membershipId))}/></strong>
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
              <td className="ranking-overall">
                {overall === null ? t('ranking.noneYet') : (
                  <span title={provisional ? t('ranking.provisionalHint') : undefined}>
                    {formatNumber(overall)}{provisional ? '*' : ''}
                  </span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function StatsOverview({ totals }: { totals: { gamesPlayed: number; goals: number; assists: number; activeMembers: number } | null }) {
  const { t, formatNumber } = useI18n()
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

      {/* Os destaques em cards, antes da tabela. Uma tabela responde quem marcou
          mais; um card responde a mesma coisa e ainda diz de quem se trata. */}
      <HeroLeaders/>

      {/* Os três cards antigos — artilheiro, assistências, participação — saíram
          daqui. Os destaques acima dizem exactamente o mesmo com a cara, o
          número e a frase, e a mesma informação duas vezes no mesmo ecrã não é
          ênfase: é o leitor a perguntar-se qual das duas está certa. */}
    </>
  )
}
