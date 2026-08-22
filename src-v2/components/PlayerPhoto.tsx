import { useI18n } from '../lib/i18n'
import { usePlayerCard } from '../lib/player-card'
import { Avatar } from './ui'

/**
 * A foto de um jogador, que abre o card dele.
 *
 * Substitui o `<Avatar>` em todo o lado onde a foto representa uma pessoa da
 * pelada — ranking, plantel, escalação, resultado, campo da Seleção. Onde a
 * foto é a do próprio utilizador na barra lateral continua a ser um `<Avatar>`:
 * abrir o teu próprio card a partir do canto da aplicação não é um gesto que
 * alguém faça.
 *
 * É um `<button>` e não uma `<div>` com onClick: assim chega-lhe o Tab, o Enter
 * e o leitor de ecrã, sem `tabindex` inventado.
 *
 * Sem plantel carregado não vira botão. Uma foto que parece clicável e não
 * abre nada é pior do que uma foto que não parece clicável.
 */
export function PlayerPhoto({ membershipId, name, src, size = 'sm', className }: {
  membershipId: string
  name: string
  src?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { t } = useI18n()
  const { open, ready } = usePlayerCard()

  if (!ready) return <Avatar name={name} size={size} src={src}/>

  return (
    <button
      type="button"
      className={className ? `player-photo ${className}` : 'player-photo'}
      onClick={() => open(membershipId)}
      aria-label={t('card.openFor', { name })}
      data-player={membershipId}
    >
      <Avatar name={name} size={size} src={src}/>
    </button>
  )
}
