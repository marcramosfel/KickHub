import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from './useCountUp'

/**
 * As partículas do lendário (§7).
 *
 * Só o lendário as tem, e é a única raridade que as merece: se todas brilhassem
 * o brilho deixava de dizer alguma coisa.
 *
 * Em `<canvas>` e não em CSS porque são dezoito elementos a mover-se ao mesmo
 * tempo — dezoito nós no DOM a animar são dezoito coisas que o browser tem de
 * compor, e uma tela é uma.
 *
 * Param quando a aba deixa de estar visível. Um separador esquecido em segundo
 * plano não tem de gastar bateria a desenhar pontos que ninguém vê.
 */
const COUNT = 16

export function Particles({ color }: { color: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const node = canvas.current
    if (!node || prefersReducedMotion()) return
    const context = node.getContext('2d')
    if (!context) return

    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      node.width = node.offsetWidth * ratio
      node.height = node.offsetHeight * ratio
    }
    resize()

    const dots = Array.from({ length: COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 0.8 + Math.random() * 1.8,
      speed: 0.00018 + Math.random() * 0.00042,
      drift: (Math.random() - 0.5) * 0.00012,
      alpha: 0.25 + Math.random() * 0.45,
    }))

    let frame = 0
    let last = 0
    const draw = (now: number) => {
      const delta = last ? now - last : 16
      last = now
      context.clearRect(0, 0, node.width, node.height)
      for (const dot of dots) {
        dot.y -= dot.speed * delta
        dot.x += dot.drift * delta
        // Quem sai por cima volta a entrar por baixo, noutra coluna.
        if (dot.y < -0.05) { dot.y = 1.05; dot.x = Math.random() }
        context.globalAlpha = dot.alpha
        context.fillStyle = color
        context.beginPath()
        context.arc(dot.x * node.width, dot.y * node.height, dot.size * ratio, 0, Math.PI * 2)
        context.fill()
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else if (!frame) {
        last = 0
        frame = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', resize)
    }
  }, [color])

  return <canvas ref={canvas} className="card-particles" aria-hidden="true"/>
}
