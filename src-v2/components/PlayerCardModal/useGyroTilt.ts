import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { prefersReducedMotion } from './useCountUp'

/**
 * Inclinação pelo giroscópio, no telemóvel (§6.4).
 *
 * A permissão **nunca** se pede sozinha. No iOS pedir sem um gesto é recusado
 * pelo próprio sistema, e mesmo onde é permitido uma caixa de permissão que
 * aparece sem se ter pedido nada é o género de coisa que faz fechar a página.
 * Por isso existe um botão "ativar 3D", e só ele pede.
 *
 * Escreve as mesmas variáveis que o `useCardTilt`, e num `requestAnimationFrame`
 * pela mesma razão: um evento de orientação dispara dezenas de vezes por
 * segundo.
 */
const MAX_TILT = 10

type Permission = 'unsupported' | 'idle' | 'granted' | 'denied'

type OrientationEventConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export function useGyroTilt<T extends HTMLElement>(ref: RefObject<T | null>) {
  // O suporte é uma propriedade do ambiente e não muda a meio: lê-se uma vez,
  // na inicialização do estado, e não num efeito que escreve estado.
  const [permission, setPermission] = useState<Permission>(() => (
    typeof window === 'undefined' || !('DeviceOrientationEvent' in window) || prefersReducedMotion()
      ? 'unsupported'
      : 'idle'
  ))
  const frame = useRef(0)
  const pending = useRef<{ beta: number; gamma: number } | null>(null)

  const enable = useCallback(async () => {
    const constructor = window.DeviceOrientationEvent as OrientationEventConstructor | undefined
    if (!constructor) { setPermission('unsupported'); return }
    // Só o iOS tem `requestPermission`; onde não existe, ouvir já é permitido.
    if (typeof constructor.requestPermission === 'function') {
      try {
        setPermission(await constructor.requestPermission() === 'granted' ? 'granted' : 'denied')
      } catch {
        setPermission('denied')
      }
      return
    }
    setPermission('granted')
  }, [])

  useEffect(() => {
    const node = ref.current
    if (!node || permission !== 'granted') return

    const apply = () => {
      frame.current = 0
      const next = pending.current
      if (!next) return
      // `beta` é a inclinação para a frente e para trás; `gamma` de lado. O
      // travão em ±MAX_TILT é o mesmo do ponteiro, para o gesto ser o mesmo.
      const x = Math.max(-1, Math.min(1, (next.beta - 45) / 45))
      const y = Math.max(-1, Math.min(1, next.gamma / 45))
      node.style.setProperty('--tilt-x', `${(-x * MAX_TILT).toFixed(2)}deg`)
      node.style.setProperty('--tilt-y', `${(y * MAX_TILT).toFixed(2)}deg`)
      node.style.setProperty('--mx', `${((y + 1) * 50).toFixed(1)}%`)
      node.style.setProperty('--my', `${((x + 1) * 50).toFixed(1)}%`)
    }

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return
      pending.current = { beta: event.beta, gamma: event.gamma }
      if (!frame.current) frame.current = requestAnimationFrame(apply)
    }

    window.addEventListener('deviceorientation', onOrientation)
    return () => {
      window.removeEventListener('deviceorientation', onOrientation)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [permission, ref])

  return { permission, enable }
}
