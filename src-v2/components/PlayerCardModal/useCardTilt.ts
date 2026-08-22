import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from './useCountUp'

/**
 * Inclinação 3D e camada holográfica a seguir ao ponteiro.
 *
 * Escreve o estilo **uma vez por frame**, num `requestAnimationFrame`, e nunca
 * por evento: um `pointermove` dispara dezenas de vezes por segundo e escrever
 * `transform` em todas elas é o caminho mais curto para a coisa engasgar.
 *
 * Só `transform` e variáveis CSS. Nada de `box-shadow` nem `filter` animados.
 */
const MAX_TILT = 10

export function useCardTilt<T extends HTMLElement>({ enabled = true } = {}) {
  const ref = useRef<T>(null)
  const frame = useRef(0)
  const pending = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || !enabled || prefersReducedMotion()) return

    const apply = () => {
      frame.current = 0
      const next = pending.current
      if (!next) return
      node.style.setProperty('--tilt-x', `${(-next.y * 2 * MAX_TILT).toFixed(2)}deg`)
      node.style.setProperty('--tilt-y', `${(next.x * 2 * MAX_TILT).toFixed(2)}deg`)
      // O holográfico segue o mesmo ponto: é a luz a bater no plástico.
      node.style.setProperty('--mx', `${((next.x + 0.5) * 100).toFixed(1)}%`)
      node.style.setProperty('--my', `${((next.y + 0.5) * 100).toFixed(1)}%`)
    }

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      pending.current = {
        x: (event.clientX - rect.left) / rect.width - 0.5,
        y: (event.clientY - rect.top) / rect.height - 0.5,
      }
      node.dataset.tilting = 'true'
      if (!frame.current) frame.current = requestAnimationFrame(apply)
    }

    const onLeave = () => {
      pending.current = null
      if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 }
      // O `data-tilting` a sair devolve a transição lenta do repouso; durante o
      // movimento não há transição nenhuma, senão o card arrasta-se atrás do rato.
      delete node.dataset.tilting
      node.style.setProperty('--tilt-x', '0deg')
      node.style.setProperty('--tilt-y', '0deg')
      node.style.setProperty('--mx', '50%')
      node.style.setProperty('--my', '50%')
    }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    node.addEventListener('pointercancel', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
      node.removeEventListener('pointercancel', onLeave)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [enabled])

  return ref
}
