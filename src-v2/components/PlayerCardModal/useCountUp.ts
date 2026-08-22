import { useEffect, useRef, useState } from 'react'

/**
 * Contagem de um número de 0 até ao valor.
 *
 * Respeita `prefers-reduced-motion`: com ele ligado, o número **aparece já no
 * valor final**. Não é uma versão mais rápida da animação — é a ausência dela,
 * que é o que a preferência pede.
 *
 * `null` nunca conta. Um overall por calcular não sobe de zero até ao nada.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** `easeOutExpo`: nos últimos 15% desacelera muito, e é isso que cria a espera. */
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

export function useCountUp(target: number | null, {
  duration = 900,
  delay = 0,
  enabled = true,
}: { duration?: number; delay?: number; enabled?: boolean } = {}) {
  const reduced = prefersReducedMotion()
  const skip = reduced || !enabled || target === null
  const [value, setValue] = useState(() => (skip ? target : 0))
  const [seen, setSeen] = useState(target)
  const frame = useRef(0)
  const timer = useRef(0)

  // Ajustar o estado DURANTE o render é o padrão que o React recomenda para
  // "reiniciar quando a prop muda". Um efeito a escrever estado em síncrono
  // provoca um render em cascata e é exactamente o que o lint recusa.
  if (seen !== target) {
    setSeen(target)
    setValue(skip ? target : 0)
  }

  useEffect(() => {
    if (skip) return
    let start = 0
    const step = (now: number) => {
      if (!start) start = now
      const progress = Math.min((now - start) / duration, 1)
      setValue(Math.round(target * easeOutExpo(progress)))
      if (progress < 1) frame.current = requestAnimationFrame(step)
    }
    timer.current = window.setTimeout(() => { frame.current = requestAnimationFrame(step) }, delay)

    return () => {
      window.clearTimeout(timer.current)
      cancelAnimationFrame(frame.current)
    }
  }, [delay, duration, skip, target])

  /**
   * Saltar para o fim. A coreografia não pode prender ninguém: quem clica
   * durante a animação quer o resultado, não o espectáculo.
   */
  const finish = () => {
    window.clearTimeout(timer.current)
    cancelAnimationFrame(frame.current)
    setValue(target)
  }

  return { value, finish, reduced }
}
