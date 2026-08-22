import { Trophy } from 'lucide-react'
import { useMemo } from 'react'
import { distanceToTitle, titleStandings, type TitleStanding } from '../domain/player-overall'
import { useAuth } from '../lib/auth'
import { useCurrentPelada } from '../lib/current-pelada'
import { useI18n } from '../lib/i18n'
import { usePeladaPlayers, type PeladaPlayer } from '../lib/pelada-players'
import { useMyPlayerProfile } from '../lib/player-profile'
import { CARD_ICON, cardTitleKey } from './PlayerCards'
import { PlayerPhoto } from './PlayerPhoto'
import { Badge, Card } from './ui'

/**
 * Os títulos da pelada, com dono e com corrida.
 *
 * Uma conquista que só aparece a quem já a ganhou é um autocolante. O que a
 * torna interessante é a pergunta seguinte — *o que me falta para a tomar?* —
 * e é essa que esta secção responde, título a título.
 *
 * Os números vêm todos do mesmo sítio de onde vem o overall. Não há aqui uma
 * segunda contagem de golos: `titleStandings` partilha as métricas com o
 * `computeTitles`, senão a página podia dizer que faltavam dois golos a quem já
 * era artilheiro.
 *
 * A distância só se mostra a quem é candidato. Quem ainda não jogou as rodadas
 * mínimas de um título por taxa não está "três atrás" — está fora da corrida, e
 * dizer-lhe um número era mentir-lhe sobre o que lhe falta.
 */
function ordered(standings: readonly TitleStanding[]) {
  const rank = { ouro: 0, prata: 1, bronze: 2 } as const
  return [...standings].sort((a, b) => rank[a.tier] - rank[b.tier] || a.key.localeCompare(b.key))
}

export function AchievementsSection() {
  const { t, formatNumber } = useI18n()
  const { pelada } = useCurrentPelada()
  const { user } = useAuth()
  const { players } = usePeladaPlayers(pelada?.id)
  // Quem está a ver, do lado do jogador. O perfil próprio é que sabe qual das
  // pertenças é a desta pelada — o plantel só conhece pertenças, não contas.
  const me = useMyPlayerProfile(user?.id)

  const byId = useMemo(
    () => new Map<string, PeladaPlayer>(players.map((player) => [player.membershipId, player])),
    [players],
  )

  const standings = useMemo(() => ordered(titleStandings(players.map((player) => ({
    membershipId: player.membershipId,
    gamesPlayed: player.gamesPlayed,
    goals: player.goals,
    assists: player.assists,
    wins: player.wins,
    draws: player.draws,
    craques: player.craques,
    saves: player.saves,
    bestUnbeatenStreak: player.bestUnbeatenStreak,
    currentWinStreak: player.currentWinStreak,
    gkCleanSheets: player.gkCleanSheets,
  })))), [players])

  // Sem uma pertença nesta pelada não há corrida pessoal a mostrar — e a secção
  // continua a valer por quem tem cada título.
  const myMembershipId = me.data?.peladas.find((community) => community.id === pelada?.id)?.membershipId
  const mine = myMembershipId ? byId.get(myMembershipId) : undefined

  const value = (standing: TitleStanding, raw: number) => standing.format === 'rate'
    ? formatNumber(raw, { style: 'percent', maximumFractionDigits: 0 })
    : formatNumber(raw)

  return (
    <section className="achievements" aria-labelledby="achievements-title">
      <div className="section-title-row">
        <div>
          <span className="eyebrow dark-text">{t('achievements.eyebrow')}</span>
          <h2 id="achievements-title">{t('achievements.title')}</h2>
          <p>{t('achievements.subtitle')}</p>
        </div>
        <Badge tone="neutral">{standings.filter((s) => s.holders.length > 0).length}/{standings.length}</Badge>
      </div>

      <ul className="achievement-grid">
        {standings.map((standing) => {
          const holders = standing.holders.map((id) => byId.get(id)).filter(Boolean) as PeladaPlayer[]
          const gap = mine ? distanceToTitle(standing, mine.membershipId) : null

          return (
            <li key={standing.key}>
              <Card className="achievement-card" data-tier={standing.tier} data-mine={gap?.holding || undefined}>
                <header>
                  <span className="achievement-icon" aria-hidden="true">{CARD_ICON[standing.key]}</span>
                  <div>
                    <h3>{t(cardTitleKey(standing.key))}</h3>
                    <p>{t(`cards.${standing.key}Reason`, {
                      value: standing.leadingValue === null ? '—' : value(standing, standing.leadingValue),
                    })}</p>
                  </div>
                  <Badge tone="lime">+{standing.bonus}</Badge>
                </header>

                {holders.length > 0 ? (
                  <div className="achievement-holders">
                    {/* O empate premeia todos, e por isso podem ser vários. */}
                    {holders.map((holder) => (
                      <span key={holder.membershipId}>
                        <PlayerPhoto membershipId={holder.membershipId} name={holder.displayName} size="sm"/>
                        <b>{holder.displayName}</b>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="achievement-empty">{t('achievements.noHolder')}</p>
                )}

                {gap === null ? null : gap.holding ? (
                  <p className="achievement-gap achievement-gap-mine">{t('achievements.youHold')}</p>
                ) : gap.behind > 0 ? (
                  <p className="achievement-gap">
                    {t('achievements.behind', { count: value(standing, gap.behind) })}
                  </p>
                ) : (
                  <p className="achievement-gap">{t('achievements.tied')}</p>
                )}
              </Card>
            </li>
          )
        })}
      </ul>

      {!mine && (
        <p className="achievement-note"><Trophy size={14}/> {t('achievements.noPlayer')}</p>
      )}
    </section>
  )
}
