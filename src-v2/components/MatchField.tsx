import { useMemo } from 'react'
import { arrangeOnPitch, formationOf, type PitchSpot } from '../domain/pitch-layout'
import type { DrawPosition } from '../domain/team-draw'
import { useI18n } from '../lib/i18n'
import { usePlayerCard } from '../lib/player-card'
import { PlayerPhoto } from './PlayerPhoto'

/**
 * As duas equipas num campo, em vez de duas listas.
 *
 * Duas listas lado a lado dizem quem joga; não dizem nada sobre a equipa. Num
 * campo vê-se de relance que um lado tem três defesas e o outro um, e é essa a
 * conversa que se tem antes de um jogo entre amigos.
 *
 * **Uma orientação só.** O telemóvel não recebe um segundo componente: recebe o
 * mesmo campo virado ao alto, com a equipa A a atacar para baixo e a B para
 * cima. O cálculo é o do domínio — profundidade e faixa, ambos de 0 a 1 — e é
 * aqui que se decide se a profundidade vira `left` ou `top`. Duas versões eram
 * duas oportunidades de discordarem.
 *
 * O campo não decide nada. Recebe a escalação que o sorteio produziu e mostra-a;
 * quem não tem posição declarada aparece no meio, assinalado, porque inventar
 * um lugar era transformar uma ausência em informação.
 */
export type FieldPlayer = {
  id: string
  name: string
  overall: number | null
  isGoalkeeper: boolean
  primaryPosition: DrawPosition | null
  /** URL já assinado. Sem ele a foto não carrega: o `PlayerPhoto` não a vai
   *  buscar sozinho, recebe-a de quem já assinou o plantel todo de uma vez. */
  photo?: string
}

export type FieldTeam = {
  key: 'A' | 'B'
  label: string
  /** Uma linha por baixo do nome — a força da equipa, tipicamente. */
  meta?: string
  players: readonly FieldPlayer[]
}

const POSITION_LABEL: Record<string, string> = { GK: 'GOL', DEF: 'DEF', MID: 'MEI', ATT: 'ATA' }

function Spot({ spot, side }: { spot: PitchSpot<FieldPlayer>; side: 'A' | 'B' }) {
  const { t } = useI18n()
  const { ready } = usePlayerCard()
  const player = spot.player

  // A equipa A ocupa o meio-campo de baixo/esquerda e ataca para cima/direita;
  // a B é o espelho. Uma só conta, aplicada duas vezes.
  const own = spot.depth / 2
  const along = side === 'A' ? own : 1 - own
  const across = side === 'A' ? spot.lane : 1 - spot.lane

  return (
    <li
      className="field-spot"
      data-side={side}
      data-inferred={spot.inferred || undefined}
      style={{ '--along': `${(along * 100).toFixed(2)}%`, '--across': `${(across * 100).toFixed(2)}%` } as React.CSSProperties}
    >
      <PlayerPhoto membershipId={player.id} name={player.name} size="md" src={player.photo}/>
      <span className="field-spot-name">{player.name}</span>
      <span className="field-spot-meta">
        <span>{POSITION_LABEL[spot.line] ?? spot.line}</span>
        {/* Sem overall não se escreve zero: um jogador por avaliar não vale zero,
            vale "ainda não se sabe". */}
        {player.overall === null ? <b aria-hidden="true">—</b> : <b>{player.overall}</b>}
      </span>
      {spot.inferred && <span className="sr-only">{t('field.inferredPosition')}</span>}
      {!ready && <span className="sr-only">{t('field.loadingCards')}</span>}
    </li>
  )
}

export function MatchField({ teams, caption }: { teams: readonly [FieldTeam, FieldTeam]; caption?: string }) {
  const { t } = useI18n()
  const arranged = useMemo(
    () => teams.map((team) => ({ team, spots: arrangeOnPitch(team.players) })),
    [teams],
  )

  return (
    <figure className="match-field">
      <div className="match-field-head">
        {arranged.map(({ team }) => (
          <div key={team.key} className="match-field-team" data-side={team.key}>
            <strong>{team.label}</strong>
            <span>
              {t('field.formation', { formation: formationOf(team.players) })}
              {team.meta ? ` · ${team.meta}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="field-pitch" role="presentation">
        {/* As marcações são desenho, não conteúdo: quem ouve a página não ganha
            nada com "linha de meio-campo". */}
        <span className="field-halfway" aria-hidden="true"/>
        <span className="field-circle" aria-hidden="true"/>
        <span className="field-box field-box-a" aria-hidden="true"/>
        <span className="field-box field-box-b" aria-hidden="true"/>

        {arranged.map(({ team, spots }) => (
          <ul key={team.key} className="field-team" aria-label={team.label}>
            {spots.map((spot) => <Spot key={spot.player.id} spot={spot} side={team.key}/>)}
          </ul>
        ))}
      </div>

      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
