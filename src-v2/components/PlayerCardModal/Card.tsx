import { useEffect, useState } from 'react'
import { bandOf, type PlayerAttribute } from '../../domain/player-attributes'
import type { Rarity } from '../../domain/player-cards'
import { useI18n, type TranslationKey } from '../../lib/i18n'
import { Particles } from './Particles'
import { rarityVars, themeOf } from './rarity'
import { prefersReducedMotion, useCountUp } from './useCountUp'
import { useCardTilt } from './useCardTilt'
import { useGyroTilt } from './useGyroTilt'

/**
 * O card do jogador.
 *
 * Recebe números já calculados e não recalcula nada: quem os produz é o
 * `player-attributes` e o `player-overall`. Um card que fizesse contas seria um
 * segundo sítio onde o overall pode divergir.
 *
 * Funciona fora do modal — é para isso que existe como componente próprio.
 */
export type CardPlayer = {
  id: string
  name: string
  /** Se existir, é o nome grande do card. */
  surname?: string | null
  photo?: string | null
  position: string
  overall: number | null
  provisional: boolean
  rarity: Rarity
  /** Chave i18n do título, quando o jogador tem um. */
  titleKey?: TranslationKey | null
  icon?: string | null
  attributes: PlayerAttribute[]
}

export type CardSize = 'sm' | 'md' | 'lg'

const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

export function Card({ player, size = 'md', interactive = true, animate = true }: {
  player: CardPlayer
  size?: CardSize
  interactive?: boolean
  animate?: boolean
}) {
  const { t, formatNumber } = useI18n()
  const theme = themeOf(player.rarity)
  const reduced = prefersReducedMotion()
  const tilt = useCardTilt<HTMLDivElement>({ enabled: interactive })
  const gyro = useGyroTilt<HTMLDivElement>(tilt)
  const overall = useCountUp(player.overall, { delay: 320, duration: 900, enabled: animate })
  // Só depois do remate é que o número toma a cor da raridade; durante a
  // contagem fica branco, e é a mudança que faz o fim parecer um fim.
  const [settled, setSettled] = useState(reduced || !animate)
  const [seenId, setSeenId] = useState(player.id)

  // Reiniciar ao mudar de jogador, durante o render — ver `useCountUp`.
  if (seenId !== player.id) {
    setSeenId(player.id)
    setSettled(reduced || !animate)
  }

  useEffect(() => {
    if (reduced || !animate) return
    const timer = window.setTimeout(() => setSettled(true), 1220)
    return () => window.clearTimeout(timer)
  }, [animate, player.id, reduced])

  const bigName = (player.surname || player.name).toUpperCase()

  return (
    <div
      ref={tilt}
      className={`fifa-card fifa-card-${size} fifa-card-${player.rarity}`}
      style={rarityVars(player.rarity)}
      data-texture={theme.texture}
      data-animate={animate && !reduced ? 'true' : undefined}
      data-settled={settled ? 'true' : undefined}
    >
      <div className="fifa-card-face">
        <header className="fifa-card-head">
          <div className="fifa-card-rating">
            <strong aria-live="polite">
              {overall.value === null ? '—' : formatNumber(overall.value)}
            </strong>
            <span className="fifa-card-position">{player.position}</span>
            {player.provisional && (
              <span className="fifa-card-provisional" title={t('card.provisionalHint')}>
                ⏳ {t('card.provisional')}
              </span>
            )}
            {player.overall === null && !player.provisional && (
              <span className="fifa-card-provisional">{t('card.noOverall')}</span>
            )}
          </div>
          {player.icon && <span className="fifa-card-crest" aria-hidden="true">{player.icon}</span>}
        </header>

        <div className="fifa-card-photo">
          {player.photo
            ? <img src={player.photo} alt="" loading="eager" decoding="async"/>
            : <span className="fifa-card-initials" aria-hidden="true">{initialsOf(player.name)}</span>}
        </div>

        <div className="fifa-card-name">{bigName}</div>

        <div className="fifa-card-attributes">
          {player.attributes.map((attribute, index) => (
            <AttributeCell key={attribute.id} attribute={attribute} index={index} animate={animate && !reduced}/>
          ))}
        </div>

        <footer className="fifa-card-foot">
          {player.titleKey && <span className="fifa-card-title">{t(player.titleKey)}</span>}
          <span className="fifa-card-rarity">{t(`card.rarity${player.rarity}` as TranslationKey)}</span>
        </footer>

        {/* Só decoração: nada aqui recebe eventos. */}
        <span className="fifa-card-shine" aria-hidden="true"/>
        {theme.holographic && <span className="fifa-card-holo" aria-hidden="true"/>}
        {theme.particles && !reduced && <Particles color={theme.accent}/>}
        <span className="fifa-card-grain" aria-hidden="true"/>
        <span className="fifa-card-vignette" aria-hidden="true"/>
      </div>
      {/* A permissão do giroscópio pede-se com um gesto e nunca sozinha. */}
      {interactive && gyro.permission === 'idle' && (
        <button type="button" className="fifa-card-gyro" onClick={() => void gyro.enable()}>
          {t('card.enable3d')}
        </button>
      )}
    </div>
  )
}

function AttributeCell({ attribute, index, animate }: {
  attribute: PlayerAttribute
  index: number
  animate: boolean
}) {
  const { t, formatNumber } = useI18n()
  // 55ms entre cada um, na ordem de leitura. A cascata é o que faz a grelha
  // parecer preencher-se em vez de aparecer.
  const delay = 520 + index * 55
  const counted = useCountUp(attribute.value, { delay, duration: 450, enabled: animate })
  const band = bandOf(attribute.value)

  return (
    <div
      className="fifa-attr"
      data-band={band ?? undefined}
      style={animate ? { '--delay': `${delay}ms` } as React.CSSProperties : undefined}
      title={t(attribute.descKey as TranslationKey)}
    >
      <span className="fifa-attr-id">{attribute.id}</span>
      <b className="fifa-attr-value">
        {counted.value === null ? '—' : formatNumber(counted.value)}
      </b>
      {/* Sem barra quando não há dados: uma barra a zero lê-se como "é mau". */}
      {attribute.value !== null && (
        <span className="fifa-attr-bar" aria-hidden="true">
          <i style={{ '--fill': attribute.value / 99 } as React.CSSProperties}/>
        </span>
      )}
    </div>
  )
}
