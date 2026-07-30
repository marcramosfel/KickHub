import { useCallback, useEffect, useRef } from 'react'

// Comportamento de um diálogo modal (folha do telemóvel, modal do desktop).
//
// Havia três coisas em falta na folha "Mais" e que qualquer modal desta app
// vai precisar, por isso vivem aqui em vez de serem copiadas:
//   1. o conteúdo por trás continuava a deslizar quando se arrastava a folha;
//   2. o foco ficava no `body`, logo quem usa teclado ou leitor de ecrã abria a
//      folha e continuava a tabular na página escondida atrás dela;
//   3. ao fechar, o foco não voltava ao botão que a abriu — perdia-se o lugar.
//
// Devolve a `ref` para pôr no contentor do diálogo.

const SELETOR_FOCAVEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// ---------- trancar o scroll do fundo ----------
// Contado, e não um booleano: com dois modais abertos (a folha abre um card),
// fechar o de cima destrancava o scroll com o de baixo ainda aberto.
let abertos = 0
let anterior = null

function trancarScroll() {
  if (typeof document === 'undefined') return
  abertos += 1
  if (abertos > 1) return
  const html = document.documentElement
  anterior = { body: document.body.style.overflow, html: html.style.overflow }
  // Nos dois elementos: o `overflow-x: clip` do layout.css está no `html` e no
  // `body`, e trancar só um deixava o outro a deslizar no iOS.
  document.body.style.overflow = 'hidden'
  html.style.overflow = 'hidden'
}

function destrancarScroll() {
  if (typeof document === 'undefined') return
  abertos = Math.max(0, abertos - 1)
  if (abertos > 0 || !anterior) return
  // Reposto ao que estava (string vazia = volta a manda o CSS), nunca a um
  // valor inventado: o layout.css tem `overflow-x: clip` e escrevê-lo à mão
  // aqui era mais uma cópia para dessincronizar.
  document.body.style.overflow = anterior.body
  document.documentElement.style.overflow = anterior.html
  anterior = null
}

export function useModal(aberto, onClose) {
  const ref = useRef(null)
  const focoAnterior = useRef(null)

  // `onClose` numa ref para o efeito de baixo não voltar a correr (e a
  // re-trancar o scroll, e a roubar o foco) sempre que o componente pai recria
  // a função. A ref já nasce com o valor certo, por isso a sincronização num
  // efeito à parte chega — escrevê-la durante o render é que não.
  const fechar = useRef(onClose)
  useEffect(() => {
    fechar.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!aberto) return undefined

    focoAnterior.current = document.activeElement
    trancarScroll()

    // O primeiro elemento focável de dentro, ou o próprio contentor. Sem
    // `requestAnimationFrame`: o efeito já corre com o diálogo montado, e o rAF
    // nem sequer dispara com o separador em segundo plano — o foco ficava no
    // `body` e a armadilha não tinha por onde começar.
    const caixa = ref.current
    if (caixa) {
      const alvo = caixa.querySelector(SELETOR_FOCAVEL)
      if (alvo) alvo.focus()
      else {
        caixa.setAttribute('tabindex', '-1')
        caixa.focus()
      }
    }

    const naTecla = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        fechar.current?.()
        return
      }
      if (e.key !== 'Tab') return
      // Armadilha de foco: o Tab dá a volta dentro do diálogo em vez de sair
      // para a página que está escondida atrás.
      const caixa = ref.current
      if (!caixa) return
      const focaveis = [...caixa.querySelectorAll(SELETOR_FOCAVEL)].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      )
      if (!focaveis.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      } else if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      }
    }

    document.addEventListener('keydown', naTecla)
    return () => {
      document.removeEventListener('keydown', naTecla)
      destrancarScroll()
      // Devolver o foco a quem abriu, se esse botão ainda existir no DOM.
      const volta = focoAnterior.current
      if (volta && typeof volta.focus === 'function' && document.contains(volta)) volta.focus()
    }
  }, [aberto])

  // Fecha ao tocar no fundo, mas nunca por um clique que começou dentro do
  // diálogo (arrastar o dedo de dentro para fora fechava a folha sem querer).
  const aoClicarNoFundo = useCallback((e) => {
    if (e.target === e.currentTarget) fechar.current?.()
  }, [])

  return { ref, aoClicarNoFundo }
}
