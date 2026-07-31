// Legendas da avaliação pós-jogo (0 a 5 estrelas). Aparecem à medida que
// o jogador escolhe a nota. O tom é o da pelada, mas o teto está aqui: são
// notas com nome e apelido do lado de quem dá — só o alvo é anónimo — e a
// piada não pode passar a ofensa.
export const STAR_LABELS = [
  'Foi só para completar o time.',
  'Hoje a bola queimou no pé.',
  'Tentou, mas sofreu.',
  'Fez o básico sem inventar.',
  'Jogou muito e ajudou o time.',
  'Deitou e deu aula.',
]

export const legendaDaEstrela = (n) =>
  Number.isInteger(n) && n >= 0 && n < STAR_LABELS.length ? STAR_LABELS[n] : ''

// Guia humorístico das notas 0–5 — ajuda a calibrar a avaliação.
export const RATING_LABELS = [
  { nota: 0, titulo: 'Bagre extremo', desc: 'não sabe chutar uma bola' },
  { nota: 1, titulo: 'Bagre com noção', desc: 'é ruim, mas ao menos sabe que é' },
  { nota: 2, titulo: 'Perna de pau', desc: 'raça de sobra, bola de menos' },
  { nota: 3, titulo: 'Operário da pelada', desc: 'faz o simples e não estraga' },
  { nota: 4, titulo: 'Craque da vila', desc: 'carrega o time nas costas' },
  { nota: 5, titulo: 'Craque absoluto', desc: 'profissional infiltrado na pelada' },
]
