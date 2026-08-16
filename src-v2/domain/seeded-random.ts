/**
 * Aleatoriedade reproduzível.
 *
 * O sorteio precisa de variar entre execuções — repetir sempre as mesmas
 * equipas tira-lhe a graça — mas também precisa de ser auditável: dado o mesmo
 * jogo e o mesmo plantel, quem contestar o resultado tem de poder reproduzi-lo.
 * `Math.random()` não permite isso.
 */

/** Converte uma string arbitrária num inteiro de 32 bits (xmur3). */
export function hashSeed(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let index = 0; index < seed.length; index += 1) {
    h = Math.imul(h ^ seed.charCodeAt(index), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return (h ^= h >>> 16) >>> 0
}

/** mulberry32: pequeno, rápido e com distribuição suficiente para um sorteio. */
export function createRandom(seed: string) {
  let state = hashSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates com o gerador semeado. Não altera a lista recebida. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const swap = result[index]
    result[index] = result[target]
    result[target] = swap
  }
  return result
}
