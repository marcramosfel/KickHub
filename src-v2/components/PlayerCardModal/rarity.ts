import type { Rarity } from '../../domain/player-cards'

/**
 * O tema visual de cada raridade, num sítio só.
 *
 * A cor nunca é o único sinal: cada raridade tem também o nome escrito no
 * rodapé do card e uma textura de fundo diferente. Quem não separa cores
 * continua a distinguir um lendário de um comum.
 */
export type RarityTheme = {
  /** Cor de destaque: borda, divisória, número do overall no fim da contagem. */
  accent: string
  /** O centro do gradiente radial, atrás da foto. */
  glow: string
  /** O fundo, para onde o radial desvanece. */
  base: string
  /** Textura sobreposta. `none` deixa o fundo liso. */
  texture: 'none' | 'diagonal' | 'hex' | 'carbon' | 'rays'
  /** Camada holográfica que segue o ponteiro. */
  holographic: boolean
  /** Quantas vezes a faixa de luz atravessa o card na entrada. */
  sweeps: 1 | 2
  /** Partículas a subir por trás. Só o lendário as tem. */
  particles: boolean
}

export const RARITY_THEME: Readonly<Record<Rarity, RarityTheme>> = {
  common: {
    accent: '#7fa090', glow: '#20342a', base: '#131f19',
    texture: 'none', holographic: false, sweeps: 1, particles: false,
  },
  special: {
    accent: '#5cd1f5', glow: '#123449', base: '#0b1b26',
    texture: 'diagonal', holographic: false, sweeps: 1, particles: false,
  },
  rare: {
    accent: '#c99bff', glow: '#2e1a48', base: '#170e24',
    texture: 'hex', holographic: true, sweeps: 1, particles: false,
  },
  epic: {
    accent: '#ff9e3d', glow: '#4a2410', base: '#24120a',
    texture: 'carbon', holographic: true, sweeps: 1, particles: false,
  },
  legendary: {
    accent: '#ffc531', glow: '#3d3a12', base: '#12240f',
    texture: 'rays', holographic: true, sweeps: 2, particles: true,
  },
}

/**
 * As variáveis CSS de um tema.
 *
 * Vão como `style` em vez de uma classe por raridade porque a cor entra em
 * gradientes e sombras compostas — declarar cinco variantes de cada regra era
 * multiplicar a folha de estilos por cinco.
 */
export function rarityVars(rarity: Rarity) {
  const theme = RARITY_THEME[rarity]
  return {
    '--rarity-accent': theme.accent,
    '--rarity-glow': theme.glow,
    '--rarity-base': theme.base,
  } as React.CSSProperties
}

export const themeOf = (rarity: Rarity) => RARITY_THEME[rarity]
