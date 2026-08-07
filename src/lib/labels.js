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

// ---------------------------------------------------------------- a barra
//
// As faixas que a barra de avaliação atravessa, de 0 a 5. Cada uma tem
// emoji, título e uma frase — é o que dá graça a arrastar a barra e o que
// ajuda a calibrar: "3,7" não diz nada a ninguém, "faz o simples e não
// estraga" diz.
//
// O tom é o da pelada, e o teto está aqui de propósito: **estas notas vão
// ser públicas no fim da ronda**, com o nome de quem as deu ao lado. Uma
// piada que passe a ofensa deixa de ser piada quando tem autor. Por isso
// nenhuma frase ataca a pessoa — todas falam do que ela faz com a bola.
//
// `ate` é o limite SUPERIOR da faixa (exclusivo, menos na última).
export const FAIXAS_DA_NOTA = [
  { ate: 0.5, emoji: '🪵', titulo: 'Tronco', frase: 'Ainda está a decidir de que lado joga.' },
  { ate: 1.0, emoji: '🐟', titulo: 'Bagre autêntico', frase: 'Não sabe chutar uma bola. Mas aparece sempre.' },
  { ate: 1.5, emoji: '🥴', titulo: 'Bagre com noção', frase: 'É ruim, e o melhor é que sabe que é.' },
  { ate: 2.0, emoji: '🦵', titulo: 'Perna de pau', frase: 'Raça de sobra, bola de menos.' },
  { ate: 2.5, emoji: '😅', titulo: 'Vai levando', frase: 'Uma boa por jogo, e sai feliz.' },
  { ate: 3.0, emoji: '🔧', titulo: 'Operário da pelada', frase: 'Faz o simples e não estraga.' },
  { ate: 3.5, emoji: '🙂', titulo: 'Dá conta do recado', frase: 'Ninguém reclama de o ter no time.' },
  { ate: 4.0, emoji: '⚽', titulo: 'Bom de bola', frase: 'Resolve quando precisa.' },
  { ate: 4.5, emoji: '🔥', titulo: 'Craque da vila', frase: 'Carrega o time nas costas.' },
  { ate: 4.9, emoji: '🌟', titulo: 'Decide sozinho', frase: 'Quando entra, o jogo muda.' },
  { ate: 5.0, emoji: '👑', titulo: 'Craque absoluto', frase: 'Profissional infiltrado na pelada.' },
]

// A faixa de uma nota. Fora de 0–5 (ou sem nota) devolve `null` — quem
// chama mostra o estado "por avaliar" em vez de inventar uma reação.
export function faixaDaNota(n) {
  // `Number(null)` é 0 — e 0 aqui não é "tronco", é ausência de nota. É a
  // mesma armadilha que já mordeu no overall de goleiro e no saldo das
  // vitórias; a diferença entre "avaliei com 0" e "não avaliei" é
  // precisamente o que esta ronda tem de respeitar.
  if (n == null || n === '') return null
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0 || v > 5) return null
  return FAIXAS_DA_NOTA.find((f) => v <= f.ate) || FAIXAS_DA_NOTA[FAIXAS_DA_NOTA.length - 1]
}

// Cor da nota, do vermelho ao verde. É contínua de propósito: a barra muda
// de tom à medida que sobe, em vez de saltar entre três cores fixas.
export function corDaNota(n) {
  const v = Math.max(0, Math.min(5, Number(n) || 0))
  // 0 → vermelho (0°), 2,5 → amarelo (48°), 5 → verde (130°)
  const matiz = v <= 2.5 ? (v / 2.5) * 48 : 48 + ((v - 2.5) / 2.5) * 82
  return `hsl(${Math.round(matiz)}, 78%, 55%)`
}

// "3,7" — com vírgula, que é como se escreve em português.
// `null` é "sem nota" e não 0 (ver `faixaDaNota`).
export const formatarNota = (n) =>
  n != null && n !== '' && Number.isFinite(Number(n))
    ? Number(n).toFixed(1).replace('.', ',')
    : '—'
