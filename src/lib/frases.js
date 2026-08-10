// As provocações da entrada.
//
// A app sabe coisas engraçadas sobre o grupo e nunca as dizia: que os Pretos
// vão 5-3 no confronto de sempre, que há uma dupla que ganhou as cinco vezes
// que jogou junta, que alguém, algures, deu um 0,1 a outra pessoa. São
// números que já lá estavam — só faltava alguém dizê-los em voz alta.
//
// Os factos vêm crus do `get_curiosidades()`; a redação é toda daqui. Uma
// frase escrita em SQL é uma frase que ninguém consegue testar.
//
// SOBRE AS NOTAS, e é de propósito: usa-se o VALOR (0,1) e nunca os nomes.
// "Alguém deu um 0,1" é uma piada de grupo; "o X deu um 0,1 ao Y" é uma
// acusação, e num grupo de trinta pessoas isso estraga uma sexta-feira. A app
// já tem a regra certa para as notas com nome (`avaliacoes_reveladas`), que
// só as mostra a quem as recebeu.

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// 0.1 → "0,1" (e 4 → "4"). Vírgula decimal, que é como se lê em português.
const dec = (v) => {
  const n = num(v)
  if (n == null) return null
  return (Math.round(n * 10) / 10).toString().replace('.', ',')
}

const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`

// Cada frase é `{ id, icone, texto }`. `null` = não há dados para ela, e
// nesse caso simplesmente não entra no sorteio — nunca se inventa um número.
function todas(c) {
  if (!c) return []

  const f = []
  const eq = c.equipas || {}
  const a = num(eq.a) ?? 0
  const b = num(eq.b) ?? 0
  const empates = num(eq.empates) ?? 0

  // ---- o confronto de sempre ----
  if (a + b + empates >= 3) {
    if (a === b) {
      f.push({
        id: 'equipas-empate',
        icone: '⚖️',
        texto: `⚫ ${a} — ${b} ⚪. Empate técnico na história da pelada. O próximo sorteio desempata.`,
      })
    } else {
      const lidera = a > b ? 'Pretos' : 'Brancos'
      const icone = a > b ? '⚫' : '⚪'
      f.push({
        id: 'equipas-lidera',
        icone,
        texto: `Os ${lidera} lideram o confronto de sempre: ${a}-${b}${
          empates ? ` (e ${plural(empates, 'empate', 'empates')})` : ''
        }. Vais mudar isso hoje?`,
      })
    }
  }

  // ---- a dupla que não perde ----
  const d = c.dupla
  if (d?.a && d?.b && num(d.jogos)) {
    const pct = num(d.pct) ?? 0
    if (pct >= 100) {
      f.push({
        id: 'dupla-invicta',
        icone: '🤝',
        texto: `${d.a} e ${d.b} jogaram ${plural(d.jogos, 'vez', 'vezes')} no mesmo time e ganharam todas. Tomem cuidado com essa dupla.`,
      })
    } else if (pct >= 70) {
      f.push({
        id: 'dupla-forte',
        icone: '🤝',
        texto: `Quando ${d.a} e ${d.b} calham no mesmo time, ganham ${pct}% das vezes (${d.vitorias} em ${d.jogos}). Coincidência?`,
      })
    }
  }

  // ---- os extremos das notas (sem nomes — ver o cabeçalho) ----
  const notas = c.notas || {}
  const min = num(notas.min)
  if (min != null && min <= 1) {
    f.push({
      id: 'nota-minima',
      icone: '😬',
      texto: `A nota mais baixa alguma vez dada nesta pelada foi ${dec(min)}. Alguém ali não estava a gostar do jogo…`,
    })
  }
  const max = num(notas.max)
  if (max != null && max >= 5) {
    f.push({
      id: 'nota-maxima',
      icone: '🌟',
      texto: `Já houve quem desse um ${dec(max)} redondo a um companheiro. Ou é amizade, ou é mesmo bom.`,
    })
  }

  // ---- a goleada ----
  const g = c.goleada
  if (g && num(g.diferenca) >= 4) {
    f.push({
      id: 'goleada',
      icone: '💥',
      texto: `A maior goleada da história: ${g.score_a}–${g.score_b}. ${plural(num(g.diferenca), 'gol', 'gols')} de diferença. Alguém ainda deve estar a pensar nisso.`,
    })
  }

  // ---- o artilheiro ----
  const art = c.artilheiro
  if (art?.nome && num(art.gols)) {
    f.push({
      id: 'artilheiro',
      icone: '🥅',
      texto: `${art.nome} leva ${plural(art.gols, 'gol', 'gols')} na artilharia. Alguém vai ter de fazer alguma coisa quanto a isso.`,
    })
  }

  // ---- autogolos ----
  const ag = num(c.autogolos)
  if (ag != null && ag > 0) {
    f.push({
      id: 'autogolos',
      icone: '🙈',
      texto: `Já se marcaram ${plural(ag, 'autogolo', 'autogolos')} nesta pelada. Contam na mesma — só não para o artilheiro.`,
    })
  }

  // ---- o número redondo ----
  const rodadas = num(c.rodadas)
  if (rodadas != null && rodadas >= 5) {
    f.push({
      id: 'rodadas',
      icone: '📅',
      texto: `${plural(rodadas, 'rodada jogada', 'rodadas jogadas')} e registadas. Tudo isto já está no teu perfil.`,
    })
  }

  return f
}

export const frasesDaPelada = todas

// Hash estável de uma string (djb2). Não é criptografia — é só uma forma de
// transformar "id do jogador + dia" num número sempre igual.
function semente(texto) {
  let h = 5381
  for (let i = 0; i < texto.length; i += 1) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0
  return h
}

// A frase de hoje para ESTE jogador.
//
// Determinística de propósito: a mesma pessoa vê a mesma frase o dia todo
// (recarregar a página não a troca, o que seria irritante e faria as pessoas
// recarregarem só para "puxar" outra), mas amanhã é outra — e duas pessoas
// diferentes no mesmo dia veem coisas diferentes, que é o que faz o grupo
// comentar.
//
// `dia` entra por parâmetro para os testes não dependerem do relógio.
export function fraseDoDia(curiosidades, playerId, dia) {
  const lista = todas(curiosidades)
  if (!lista.length) return null
  const chave = `${playerId || 'anon'}|${dia || ''}`
  return lista[semente(chave) % lista.length]
}

// 'YYYY-MM-DD' local — o mesmo formato do `hojeLocal()` do format.js, e pela
// mesma razão: `toISOString()` daria a data UTC, que à noite no Brasil já é
// amanhã e trocava a frase a meio do serão.
export function diaLocal(agora = new Date()) {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(
    agora.getDate()
  ).padStart(2, '0')}`
}
