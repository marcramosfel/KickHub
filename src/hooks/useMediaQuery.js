import { useCallback, useSyncExternalStore } from 'react'

// Media query em JS, para as decisões de layout que não dão para fazer só com
// CSS (por exemplo, montar componentes diferentes no telemóvel e no computador
// em vez de os esconder com display:none — esconder obrigaria a desenhar os
// dois).
//
// Usa useSyncExternalStore em vez de useState+useEffect: o matchMedia é uma
// fonte de verdade externa, e assim o valor lido no render já é o certo — sem
// o render extra (e sem o setState dentro do efeito, que o React 19 desaconselha).
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query]
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }, [query])

  // No servidor não há ecrã: assume o telemóvel (mobile-first).
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

// Os mesmos pontos de corte do layout.css — se mudarem lá, mudam aqui.
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)')
export const useIsWide = () => useMediaQuery('(min-width: 1024px)')
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')
