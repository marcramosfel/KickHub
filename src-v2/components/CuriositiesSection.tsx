import { Dices, Shuffle, ShieldCheck, Sparkles, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SimPosition, SimulatedMatch } from '../domain/match-simulator'
import {
  buildChampionship,
  buildDuel,
  type Championship,
  type ChampionshipMatch,
  type ChampionshipTeamId,
  type CuriosityPlayer,
  type Duel,
} from '../domain/pelada-curiosities'
import { DEFAULT_TEAM_SIZE, formationOf } from '../domain/pelada-selection'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n, type Translate, type TranslationKey } from '../lib/i18n'
import { usePeladaPlayers, type PeladaPlayer } from '../lib/pelada-players'
import { usePeladaSettings } from '../lib/pelada-settings'
import { ShareButton } from './ShareButton'
import { TeamSimulator } from './TeamSimulator'
import { Badge, Card, EmptyState } from './ui'

const teamNames: Record<ChampionshipTeamId, TranslationKey> = {
  BLACK: 'curiosities.teamBLACK', WHITE: 'curiosities.teamWHITE',
  BLUE: 'curiosities.teamBLUE', RED: 'curiosities.teamRED',
}

const storyKeys: Record<SimulatedMatch['narrative']['key'], TranslationKey> = {
  draw: 'curiosities.storyDraw', narrow: 'curiosities.storyNarrow',
  rout: 'curiosities.storyRout', open: 'curiosities.storyOpen',
}

/**
 * O simulador precisa de um lugar por jogador, e o plantel guarda linhas. Quem
 * não declarou posição entra ao meio, que é o lugar neutro — não a inventar
 * um avançado nem a esconder alguém na defesa.
 */
function toCuriosityPlayer(player: PeladaPlayer): CuriosityPlayer {
  return {
    id: player.membershipId,
    name: player.displayName,
    slot: (player.primaryPosition ?? (player.playerType === 'GOALKEEPER' ? 'GK' : 'MID')) as SimPosition,
    overall: player.overall,
    gamesPlayed: player.gamesPlayed,
    goals: player.goals,
    assists: player.assists,
    craques: player.craques,
    bagres: player.bagres,
    concededPerMatch: player.concededPerMatch,
    playerType: player.playerType,
    provisional: player.provisional,
  }
}

export function CuriositiesSection() {
  const { t } = useI18n()
  const { pelada } = useCurrentPelada()
  const settings = usePeladaSettings(pelada?.id, true)
  const { players, isPending, isError, refetch } = usePeladaPlayers(pelada?.id)
  // A semente é estado: "imaginar outra vez" muda-a, e é isso que faz os jogos
  // mudarem sem deixarem de ser reproduzíveis enquanto o ecrã está aberto.
  const [round, setRound] = useState(1)

  const teamSize = settings.data?.defaultTeamSize ?? DEFAULT_TEAM_SIZE
  const seed = `${pelada?.id ?? 'pelada'}-${round}`

  const pool = useMemo(() => players.map(toCuriosityPlayer), [players])
  const eligible = pool.filter((player) => player.overall !== null && !player.provisional).length

  const best = useMemo(() => buildDuel({
    players: pool, teamSize, seed: `${seed}-melhor`, best: true,
    nameA: t('curiosities.bestTeamA'), nameB: t('curiosities.bestTeamB'),
  }), [pool, seed, t, teamSize])
  const worst = useMemo(() => buildDuel({
    players: pool, teamSize, seed: `${seed}-perebas`, best: false,
    nameA: t('curiosities.worstTeamA'), nameB: t('curiosities.worstTeamB'),
  }), [pool, seed, t, teamSize])
  const championship = useMemo(() => buildChampionship({
    players: pool, teamSize, seed: `${seed}-copa`,
  }), [pool, seed, teamSize])

  if (isPending) {
    return <div className="curiosities-state" role="status" aria-busy="true"><Sparkles/><p>{t('curiosities.loading')}</p></div>
  }
  if (isError) {
    return (
      <Card className="dashboard-data-state" role="alert">
        <ShieldCheck/>
        <div><h3>{t('curiosities.errorTitle')}</h3><p>{t('curiosities.errorBody')}</p></div>
        <button type="button" className="btn btn-outline btn-md" onClick={refetch}>{t('dashboard.retry')}</button>
      </Card>
    )
  }
  if (eligible === 0) {
    return <EmptyState icon={<Dices/>} title={t('curiosities.emptyTitle')} body={t('curiosities.emptyBody')}/>
  }

  const needed = formationOf(teamSize).teamSize * 2
  return (
    <div className="curiosities-page">
      <header className="page-heading split-heading">
        <div>
          <span className="eyebrow dark-text">{t('curiosities.eyebrow')}</span>
          <h1>{t('curiosities.title')}</h1>
          <p>{t('curiosities.subtitle')}</p>
        </div>
        <button type="button" className="btn btn-outline btn-md" onClick={() => setRound((value) => value + 1)}>
          <Shuffle/> {t('curiosities.shuffle')}
        </button>
      </header>

      <DuelCard duel={best} title={t('curiosities.bestTitle')} body={t('curiosities.bestBody')} needed={needed} have={eligible}/>
      <DuelCard duel={worst} title={t('curiosities.worstTitle')} body={t('curiosities.worstBody')} needed={needed} have={eligible}/>
      <ChampionshipCard championship={championship} needed={needed} have={eligible}/>
      <TeamSimulator players={pool} teamNameA={t('simulator.teamA')} teamNameB={t('simulator.teamB')}/>
    </div>
  )
}

/** O aviso partilhado por quem não tem gente que chegue para o seu jogo. */
function NotEnough({ title, body, needed, have }: { title: string; body: string; needed: number; have: number }) {
  const { t } = useI18n()
  return (
    <Card className="curiosity-card curiosity-card-short">
      <header><h2>{title}</h2><p>{body}</p></header>
      <p className="curiosity-missing">{t('curiosities.needMore', { count: needed, have })}</p>
    </Card>
  )
}

function DuelCard({ duel, title, body, needed, have }: {
  duel: Duel | null
  title: string
  body: string
  needed: number
  have: number
}) {
  const { t, formatNumber } = useI18n()
  if (!duel) return <NotEnough title={title} body={body} needed={needed} have={have}/>

  const { match } = duel
  const percent = (value: number) => formatNumber(Math.round(value * 100))
  return (
    <Card className="curiosity-card">
      <header>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="curiosity-meta">
          <Badge tone="lime">{t('curiosities.formation', { name: duel.formation })}</Badge>
          <Badge tone="neutral">{t('curiosities.balance', { value: formatNumber(Math.round(duel.balance.percentage * 10) / 10) })}</Badge>
        </div>
      </header>

      <div className="curiosity-scoreline">
        <span>{match.nameA}</span>
        <strong>{formatNumber(match.goalsA)}<i>·</i>{formatNumber(match.goalsB)}</strong>
        <span>{match.nameB}</span>
      </div>

      <ul className="curiosity-chances">
        <li>{t('curiosities.chanceA', { name: match.nameA, value: percent(match.probabilities.a) })}</li>
        <li>{t('curiosities.chanceDraw', { value: percent(match.probabilities.draw) })}</li>
        <li>{t('curiosities.chanceA', { name: match.nameB, value: percent(match.probabilities.b) })}</li>
      </ul>

      <p className="curiosity-story">{t(storyKeys[match.narrative.key], match.narrative.params)}</p>

      <div className="curiosity-sides">
        <MatchSide name={match.nameA} scorers={match.scorers.a} assists={match.assists.a}/>
        <MatchSide name={match.nameB} scorers={match.scorers.b} assists={match.assists.b}/>
      </div>

      <dl className="curiosity-highlights">
        <div><dt>{t('curiosities.possession')}</dt><dd>{formatNumber(match.possession.a)}% · {formatNumber(match.possession.b)}%</dd></div>
        {match.star && <div><dt>{t('curiosities.star')}</dt><dd>{match.star.name}</dd></div>}
        {match.flop && <div><dt>{t('curiosities.flop')}</dt><dd>{match.flop.name}</dd></div>}
      </dl>

      <ShareButton content={() => ({
        title,
        text: t('curiosities.shareDuel', {
          title, a: match.nameA, b: match.nameB, goalsA: match.goalsA, goalsB: match.goalsB,
        }),
      })}/>
    </Card>
  )
}

function MatchSide({ name, scorers, assists }: {
  name: string
  scorers: SimulatedMatch['scorers']['a']
  assists: SimulatedMatch['assists']['a']
}) {
  const { t, formatNumber } = useI18n()
  const line = (entries: SimulatedMatch['scorers']['a']) => entries.length
    ? entries.map((entry) => `${entry.name}${entry.total > 1 ? ` ×${formatNumber(entry.total)}` : ''}`).join(', ')
    : t('curiosities.noScorers')
  return (
    <section className="curiosity-side">
      <h3>{name}</h3>
      <p><span>{t('curiosities.scorers')}</span>{line(scorers)}</p>
      <p><span>{t('curiosities.assists')}</span>{line(assists)}</p>
    </section>
  )
}

function ChampionshipCard({ championship, needed, have }: {
  championship: Championship | null
  needed: number
  have: number
}) {
  const { t, formatNumber } = useI18n()
  if (!championship) {
    return <NotEnough title={t('curiosities.cupTitle')} body={t('curiosities.cupBody', { count: 2 })} needed={needed} have={have}/>
  }

  const awards: [TranslationKey, Championship['awards']['topScorer'], boolean][] = [
    ['curiosities.cupTopScorer', championship.awards.topScorer, false],
    ['curiosities.cupTopAssists', championship.awards.topAssists, false],
    ['curiosities.cupMostStars', championship.awards.mostStars, true],
  ]

  return (
    <Card className="curiosity-card">
      <header>
        <h2>{t('curiosities.cupTitle')}</h2>
        <p>{t('curiosities.cupBody', { count: championship.teamCount })}</p>
        <div className="curiosity-meta">
          <Badge tone="lime"><Trophy/> {t('curiosities.cupChampion', { name: t(teamNames[championship.champion]) })}</Badge>
        </div>
      </header>

      <h3 className="curiosity-subhead">{t('curiosities.cupTable')}</h3>
      <table className="curiosity-table">
        <thead>
          <tr>
            <th scope="col">{t('curiosities.colTeam')}</th>
            <th scope="col">{t('curiosities.colPlayed')}</th>
            <th scope="col">{t('curiosities.colWon')}</th>
            <th scope="col">{t('curiosities.colDrawn')}</th>
            <th scope="col">{t('curiosities.colLost')}</th>
            <th scope="col">{t('curiosities.colScored')}</th>
            <th scope="col">{t('curiosities.colConceded')}</th>
            <th scope="col">{t('curiosities.colPoints')}</th>
          </tr>
        </thead>
        <tbody>
          {championship.standings.map((row) => (
            <tr key={row.id}>
              <th scope="row"><span className="curiosity-dot" style={{ background: row.accent }} aria-hidden="true"/>{t(teamNames[row.id])}</th>
              <td>{formatNumber(row.played)}</td>
              <td>{formatNumber(row.won)}</td>
              <td>{formatNumber(row.drawn)}</td>
              <td>{formatNumber(row.lost)}</td>
              <td>{formatNumber(row.scored)}</td>
              <td>{formatNumber(row.conceded)}</td>
              <td><b>{formatNumber(row.points)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="curiosity-subhead">{t('curiosities.cupFixtures')}</h3>
      <ol className="curiosity-fixtures">
        {championship.matches.map((match) => <FixtureRow key={`${match.teamA}-${match.teamB}`} match={match} t={t}/>)}
        <FixtureRow match={championship.final} t={t} final/>
      </ol>
      {championship.decidedOnTable && <p className="curiosity-note">{t('curiosities.cupOnTable')}</p>}

      <h3 className="curiosity-subhead">{t('curiosities.cupAwards')}</h3>
      <dl className="curiosity-highlights">
        {awards.map(([key, award, counted]) => award && (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd>{award.name} <small>{counted ? t('curiosities.cupTimes', { count: award.total }) : formatNumber(award.total)}</small></dd>
          </div>
        ))}
      </dl>

      {championship.leftOut > 0 && <p className="curiosity-note">{t('curiosities.cupLeftOut', { count: championship.leftOut })}</p>}

      <ShareButton content={() => ({
        title: t('curiosities.cupTitle'),
        text: t('curiosities.shareCup', { name: t(teamNames[championship.champion]) }),
      })}/>
    </Card>
  )
}

function FixtureRow({ match, t, final = false }: { match: ChampionshipMatch; t: Translate; final?: boolean }) {
  return (
    <li className={final ? 'curiosity-fixture curiosity-fixture-final' : 'curiosity-fixture'}>
      {final && <span className="curiosity-fixture-tag">{t('curiosities.cupFinal')}</span>}
      <span>{t(teamNames[match.teamA])}</span>
      <strong>{match.goalsA} · {match.goalsB}</strong>
      <span>{t(teamNames[match.teamB])}</span>
    </li>
  )
}
