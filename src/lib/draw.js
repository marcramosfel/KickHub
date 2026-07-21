// Motor de sorteio equilibrado.
// `present` é uma lista de { id, name, photo, avg } (avg já normalizada: 2.5 se sem notas).

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

export function drawTeams(present) {
  // 1. Agrupa em faixas arredondando avg ao 0,5 mais próximo
  const bands = new Map()
  for (const p of present) {
    const band = Math.round(p.avg * 2)
    if (!bands.has(band)) bands.set(band, [])
    bands.get(band).push(p)
  }

  // 2. Embaralha dentro de cada faixa (variedade a cada sorteio)
  for (const list of bands.values()) shuffle(list)

  // 3. Faixas da mais alta para a mais baixa, numa ordem única
  const order = [...bands.keys()]
    .sort((a, b) => b - a)
    .flatMap((band) => bands.get(band))

  // 4. Tamanhos: A leva o extra por defeito; 50% de hipótese de trocar (importa com n ímpar)
  const n = order.length
  let capA = Math.ceil(n / 2)
  let capB = n - capA
  if (Math.random() < 0.5) [capA, capB] = [capB, capA]

  // 5. Cada jogador vai para o time com menor soma atual, respeitando os limites
  const A = []
  const B = []
  let sumA = 0
  let sumB = 0
  for (const p of order) {
    let paraA
    if (A.length >= capA) paraA = false
    else if (B.length >= capB) paraA = true
    else if (sumA < sumB) paraA = true
    else if (sumB < sumA) paraA = false
    else paraA = Math.random() < 0.5 // empate de somas → aleatório
    if (paraA) {
      A.push(p)
      sumA += p.avg
    } else {
      B.push(p)
      sumB += p.avg
    }
  }

  // 6.
  return { A, B, sumA, sumB }
}

// Média de um time (0 se vazio)
export function teamAvg(team) {
  if (!team.length) return 0
  return team.reduce((s, p) => s + Number(p.avg), 0) / team.length
}
