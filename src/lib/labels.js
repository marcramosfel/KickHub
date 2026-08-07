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
// `ate` é o limite SUPERIOR da faixa (inclusivo). Uma faixa a cada 0,2, e
// o passo da barra é 0,1 — ou seja, a reação muda a cada dois toques. Foi
// escolhido assim: a cada 0,1 o texto piscava e não se lia; a cada 0,5 a
// barra parecia encravada metade do caminho.
export const FAIXAS_DA_NOTA = [
  // O zero redondo tem reação própria: sem ela, 0,0 / 0,1 / 0,2 caíam todos
  // na mesma faixa e o arranque da barra ficava morto.
  { ate: 0.0, emoji: '💀', titulo: 'Zero absoluto', frase: 'Nem o nome na súmula justifica.' },
  { ate: 0.2, emoji: '🪵', titulo: 'Tronco', frase: 'Foi ao campo. Ficou no campo.' },
  { ate: 0.4, emoji: '🧱', titulo: 'Poste', frase: 'Ao menos não sai do lugar.' },
  { ate: 0.6, emoji: '🚧', titulo: 'Obstáculo', frase: 'Atrapalha os dois times por igual.' },
  { ate: 0.8, emoji: '🐟', titulo: 'Bagre autêntico', frase: 'Não sabe chutar uma bola. Mas aparece sempre.' },
  { ate: 1.0, emoji: '🐌', titulo: 'Chega tarde', frase: 'A bola passa, ele acena.' },
  { ate: 1.2, emoji: '🥴', titulo: 'Bagre com noção', frase: 'É ruim, e o melhor é que sabe que é.' },
  { ate: 1.4, emoji: '🙈', titulo: 'Perigo em casa', frase: 'Já fez gol contra. E comemorou.' },
  { ate: 1.6, emoji: '🦵', titulo: 'Perna de pau', frase: 'Raça de sobra, bola de menos.' },
  { ate: 1.8, emoji: '🪃', titulo: 'Chuta e volta', frase: 'Toda bola dele volta para o adversário.' },
  { ate: 2.0, emoji: '😵‍💫', titulo: 'Tonto de bola', frase: 'Corre muito, entende pouco.' },
  { ate: 2.2, emoji: '🫠', titulo: 'Vai levando', frase: 'Uma boa por jogo, e sai feliz.' },
  { ate: 2.4, emoji: '🚶', titulo: 'Passeador', frase: 'Anda mais do que corre.' },
  { ate: 2.6, emoji: '🧢', titulo: 'Figura da pelada', frase: 'Vale metade pelo futebol, metade pela presença.' },
  { ate: 2.8, emoji: '🔧', titulo: 'Operário', frase: 'Faz o simples e não estraga.' },
  { ate: 3.0, emoji: '🧰', titulo: 'Quebra-galho', frase: 'Joga onde faltar, sem reclamar.' },
  { ate: 3.2, emoji: '🙂', titulo: 'Dá conta do recado', frase: 'Ninguém reclama de o ter no time.' },
  { ate: 3.4, emoji: '🎯', titulo: 'Passe certo', frase: 'Não inventa — e é por isso que funciona.' },
  { ate: 3.6, emoji: '🏃', titulo: 'Motorzinho', frase: 'Não para nunca. Cansa só de olhar.' },
  { ate: 3.8, emoji: '⚽', titulo: 'Bom de bola', frase: 'Resolve quando precisa.' },
  { ate: 4.0, emoji: '🎩', titulo: 'Tem categoria', frase: 'Faz parecer fácil.' },
  { ate: 4.2, emoji: '🔥', titulo: 'Craque da vila', frase: 'Carrega o time nas costas.' },
  { ate: 4.4, emoji: '🚀', titulo: 'Desequilibra', frase: 'Quando arranca, ninguém pega.' },
  { ate: 4.6, emoji: '🪄', titulo: 'Mágico', frase: 'Inventa passe que ninguém tinha visto.' },
  { ate: 4.8, emoji: '🌟', titulo: 'Decide sozinho', frase: 'Quando entra, o jogo muda.' },
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
