// Gerador pseudo-aleatório com semente.
//
// O sorteio precisa de desempate aleatório (para não dar sempre o mesmo
// resultado) mas também de ser reproduzível: com a mesma semente — derivada
// do ID do jogo — o mesmo sorteio volta a sair igual.

// Hash de uma string para um inteiro de 32 bits (xfnv1a).
export function hashSemente(texto) {
  let h = 2166136261 >>> 0
  const s = String(texto ?? '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

// mulberry32: pequeno, rápido e com distribuição boa que chegue para isto.
export function criarRandom(semente) {
  let a = (typeof semente === 'number' ? semente : hashSemente(semente)) >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Baralha uma cópia da lista, sem tocar na original.
export function baralhar(lista, random = Math.random) {
  const out = [...lista]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Escolhe um elemento ao acaso.
export const escolher = (lista, random = Math.random) =>
  lista.length ? lista[Math.floor(random() * lista.length)] : undefined
