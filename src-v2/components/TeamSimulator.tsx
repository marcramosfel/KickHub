import { RotateCcw, Swords } from 'lucide-react'
import { useMemo, useState } from 'react'
import { simulateMatch } from '../domain/match-simulator'
import { assignSlots, type CuriosityPlayer } from '../domain/pelada-curiosities'
import { useI18n } from '../lib/i18n'
import { Badge, Card } from './ui'
import { ShareButton } from './ShareButton'

/**
 * O simulador manual: monta-se as duas equipas à mão e vê-se o que daria.
 *
 * É a única curiosidade em que as equipas não são calculadas — e é esse o
 * ponto. As outras respondem "quem ganha se o sorteio for justo"; esta responde
 * "e se eu puser o Rui e o Malik do mesmo lado?", que é a pergunta que se faz
 * mesmo no grupo.
 *
 * O motor é o mesmo dos duelos e do campeonato. Um segundo motor daria uma
 * resposta diferente à mesma pergunta.
 */
type Side = 'A' | 'B' | null

export function TeamSimulator({ players, teamNameA, teamNameB }: {
  players: readonly CuriosityPlayer[]
  teamNameA: string
  teamNameB: string
}) {
  const { t, formatNumber } = useI18n()
  const [sides, setSides] = useState<Record<string, Side>>({})

  // Sem overall calculado não há nada para simular com honestidade: o motor
  // trataria toda a gente como média e o resultado dizia mais sobre o número
  // neutro do que sobre os jogadores.
  const pool = useMemo(
    () => players.filter((player) => player.overall !== null && !player.provisional),
    [players],
  )

  const teamA = pool.filter((player) => sides[player.id] === 'A')
  const teamB = pool.filter((player) => sides[player.id] === 'B')
  const ready = teamA.length >= 2 && teamB.length >= 2

  // As equipas repetem-se aqui dentro de propósito: derivá-las fora tornava-as
  // referências novas a cada render, e o `useMemo` deixava de memorizar nada.
  const match = useMemo(() => {
    const first = pool.filter((player) => sides[player.id] === 'A')
    const second = pool.filter((player) => sides[player.id] === 'B')
    if (first.length < 2 || second.length < 2) return null
    // A semente vem de quem está em campo: mexer nas equipas dá outro jogo, e
    // não lhes mexer dá sempre o mesmo — que é o que se espera de um simulador.
    const seed = [...first, ...second].map((player) => player.id).join('|')
    return simulateMatch({
      teamA: assignSlots(first), teamB: assignSlots(second),
      seed, nameA: teamNameA, nameB: teamNameB,
    })
  }, [sides, pool, teamNameA, teamNameB])

  const move = (id: string, side: Side) =>
    setSides((current) => ({ ...current, [id]: current[id] === side ? null : side }))

  const strength = (team: readonly CuriosityPlayer[]) =>
    team.reduce((total, player) => total + (player.overall ?? 0), 0)

  const share = () => ({
    title: t('simulator.title'),
    text: match
      ? t('simulator.shareText', {
        a: teamNameA, b: teamNameB, goalsA: match.goalsA, goalsB: match.goalsB,
      })
      : t('simulator.title'),
  })

  if (pool.length < 4) {
    return (
      <Card className="curiosity-card curiosity-card-short">
        <header><h2>{t('simulator.title')}</h2><p>{t('simulator.body')}</p></header>
        <p className="curiosity-missing">{t('simulator.needMore', { count: 4, have: pool.length })}</p>
      </Card>
    )
  }

  return (
    <Card className="curiosity-card simulator-card">
      <header>
        <h2>{t('simulator.title')}</h2>
        <p>{t('simulator.body')}</p>
        <div className="curiosity-meta">
          <Badge tone="neutral">{teamNameA} {formatNumber(strength(teamA))}</Badge>
          <Badge tone="neutral">{teamNameB} {formatNumber(strength(teamB))}</Badge>
          {Object.values(sides).some(Boolean) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSides({})}>
              <RotateCcw/> {t('simulator.clear')}
            </button>
          )}
        </div>
      </header>

      <ul className="simulator-pool">
        {pool.map((player) => (
          <li key={player.id} className={sides[player.id] ? `simulator-row simulator-row-${sides[player.id]?.toLowerCase()}` : 'simulator-row'}>
            <span className="simulator-name">{player.name}</span>
            <b>{formatNumber(player.overall ?? 0)}</b>
            <span className="simulator-picks">
              <button
                type="button"
                aria-pressed={sides[player.id] === 'A'}
                className={sides[player.id] === 'A' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                onClick={() => move(player.id, 'A')}
              >{teamNameA}</button>
              <button
                type="button"
                aria-pressed={sides[player.id] === 'B'}
                className={sides[player.id] === 'B' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                onClick={() => move(player.id, 'B')}
              >{teamNameB}</button>
            </span>
          </li>
        ))}
      </ul>

      {ready && match ? (
        <>
          <div className="curiosity-scoreline">
            <span>{match.nameA}</span>
            <strong>{formatNumber(match.goalsA)}<i>·</i>{formatNumber(match.goalsB)}</strong>
            <span>{match.nameB}</span>
          </div>
          <ul className="curiosity-chances">
            <li>{t('curiosities.chanceA', { name: match.nameA, value: formatNumber(Math.round(match.probabilities.a * 100)) })}</li>
            <li>{t('curiosities.chanceDraw', { value: formatNumber(Math.round(match.probabilities.draw * 100)) })}</li>
            <li>{t('curiosities.chanceA', { name: match.nameB, value: formatNumber(Math.round(match.probabilities.b * 100)) })}</li>
          </ul>
          <dl className="curiosity-highlights">
            <div><dt>{t('simulator.attack')}</dt><dd>{formatNumber(Math.round(match.strength.a.attack))} · {formatNumber(Math.round(match.strength.b.attack))}</dd></div>
            <div><dt>{t('simulator.defence')}</dt><dd>{formatNumber(Math.round(match.strength.a.defence))} · {formatNumber(Math.round(match.strength.b.defence))}</dd></div>
            <div><dt>{t('curiosities.possession')}</dt><dd>{formatNumber(match.possession.a)}% · {formatNumber(match.possession.b)}%</dd></div>
          </dl>
          <ShareButton content={share} label={t('simulator.share')}/>
        </>
      ) : (
        <p className="curiosity-missing"><Swords/> {t('simulator.pickMore')}</p>
      )}
    </Card>
  )
}
