import { useEffect, type RefObject } from 'react'
import { prefersReducedMotion } from './useCountUp'

/**
 * O card cresce a partir da foto que foi clicada (§6.1).
 *
 * FLIP: o card já está no sítio final quando isto corre, por isso mede-se onde
 * ele ficou, calcula-se a transformação que o levaria de volta à foto, aplica-se
 * essa transformação sem transição, e num frame seguinte remove-se. O browser
 * anima a diferença — e anima só `transform`, que é o que a regra 2 exige.
 *
 * O contrário — animar de um sítio para outro mexendo em `top`/`width` — obriga
 * o browser a refazer o layout a cada frame, e é exactamente o que faz isto
 * engasgar num telemóvel.
 *
 * Sem `origin` (aberto pelo teclado, por exemplo) não há de onde crescer, e a
 * entrada normal do CSS toma conta.
 */
export type OriginRect = { top: number; left: number; width: number; height: number }

export function useFlip<T extends HTMLElement>(ref: RefObject<T | null>, origin: OriginRect | null) {
  useEffect(() => {
    const node = ref.current
    if (!node || !origin || prefersReducedMotion()) return

    const target = node.getBoundingClientRect()
    if (!target.width || !target.height) return

    const scale = Math.max(origin.width / target.width, 0.08)
    const dx = (origin.left + origin.width / 2) - (target.left + target.width / 2)
    const dy = (origin.top + origin.height / 2) - (target.top + target.height / 2)

    node.style.willChange = 'transform, opacity'
    node.style.transition = 'none'
    node.style.transformOrigin = 'center'
    node.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
    node.style.opacity = '0.4'

    // Dois frames: o primeiro deixa o browser assentar o estado inicial, e o
    // segundo dispara a transição. Com um só, há browsers que juntam as duas
    // escritas e não animam nada.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        node.style.transition = 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease-out'
        node.style.transform = ''
        node.style.opacity = ''
      })
    })

    // `will-change` fica na memória do compositor enquanto lá estiver; sai
    // assim que a entrada acaba.
    const cleanup = window.setTimeout(() => {
      node.style.willChange = ''
      node.style.transition = ''
      node.style.transformOrigin = ''
    }, 480)

    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      window.clearTimeout(cleanup)
    }
  }, [origin, ref])
}
