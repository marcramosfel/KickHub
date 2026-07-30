// O gerador de resenhas da pelada.
//
// Frases leves, de grupo de futebol, geradas a partir de dados REAIS:
// sequências (streaks.js), lideranças (achievements.js) e os números do
// próprio jogo. Regras da casa:
//   - nunca humilhar: a provocação é sobre o jogo, não sobre a pessoa;
//   - nada se inventa: sem dados para uma categoria, a categoria fica fora;
//   - o mesmo jogador não protagoniza duas frases na mesma resenha;
//   - reproduzível: a mesma semente dá a mesma resenha, e "gerar outra vez"
//     muda a tentativa (o mesmo truque do sorteio, seed.js).
//
// O admin edita/remove frases antes de publicar — isto é um rascunho bom,
// não a palavra final.

import { criarRandom, escolher, baralhar } from './seed.js'
import { EQUIPAS, nomeDaEquipa, vantagem } from './substitutions.js'
import { faseDoJogador } from './streaks.js'

// ---------------------------------------------------------------- helpers

const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || 'alguém'

// Substitui {x} pelos valores; um placeholder sem valor invalida o template
// (é sinal de que faltam dados — a frase não sai coxa, não sai de todo).
function preencher(template, valores) {
  let falhou = false
  const texto = template.replace(/\{(\w+)\}/g, (_, chave) => {
    const v = valores[chave]
    if (v == null || v === '') {
      falhou = true
      return ''
    }
    return String(v)
  })
  return falhou ? null : texto
}

// ---------------------------------------------------------------- templates
// Vários por categoria para não sair sempre a mesma piada. {lider} etc. são
// preenchidos na geração; um template pode falhar se faltar um dado.

const T = {
  // -------- pré-jogo / análise do sorteio --------
  // {pct} é a DIFERENÇA percentual entre as forças (0 = perfeito) — nenhuma
  // frase pode chamar-lhe "equilíbrio de X%", senão 0,6% lê-se ao contrário.
  equilibrio_bom: [
    'O sorteio ficou tão equilibrado que qualquer reclamação será encaminhada diretamente ao departamento do chororô.',
    'Só {pct}% de diferença entre os times — o algoritmo jura que foi imparcial, e desta vez os números concordam.',
    'Times separados por {diff} {pontinhos} de overall. Vai decidir quem correr mais (ou reclamar menos).',
  ],
  equilibrio_mau: [
    'O {forte} chega mais forte no papel ({diff} {pontos} de overall). O {fraco} chega com fé — estatisticamente, uma dessas coisas vale alguma coisa.',
    'O papel diz {forte} por {diff} de overall. O campo costuma ter opinião própria.',
    '{forte} favorito pelo overall. O {fraco} que trate de transformar isso em assunto de resenha.',
  ],
  duelo_artilheiro_paredao: [
    'Hoje teremos o artilheiro {artilheiro} contra o paredão {paredao}. Alguém vai perder o título ou a paciência.',
    '{artilheiro} de um lado, {paredao} embaixo do gol do outro. O confronto que o grupo pediu.',
  ],
  titulo_no_time: [
    'O {time} chega com {lider}, o {titulo} da pelada. O {outro} chega com coragem.',
    'O {titulo} caiu no {time}. A defesa do {outro} já solicitou reforço.',
  ],
  boa_fase: [
    '{nome} está numa fase em que até o GPS confia: {fase}.',
    'Atenção ao {nome}: {fase}. A defesa adversária que estude o vídeo.',
    '{nome} vem embalado — {fase}. Parar isso é o trabalho de hoje do {timeAdversario}.',
  ],
  pressionado: [
    '{nome} está há {n} jogos sem marcar. Hoje será que sai o gol ou mais uma coleção de "quase"?',
    '{nome} não marca há {n} jogos. O grupo garante que segue acreditando. O grupo é educado.',
  ],
  goleiro_seguro: [
    'O goleiro {nome} vem de {n} jogos sem sofrer gol. O ataque adversário tem uma missão e um problema.',
    '{n} jogos sem sofrer: o {nome} anda fechando o gol. Hoje o cadeado joga de novo.',
  ],
  invicto_em_risco: [
    'Será que o {timeAdversario} consegue acabar com a invencibilidade de {nome}, que está há {n} jogos sem perder?',
    '{nome} não perde há {n} jogos e o {timeAdversario} foi informado. A pressão mudou de lado.',
  ],
  pre_jogo_generico: [
    'Bola marcada, times definidos, desculpas oficialmente encerradas.',
    'O aquecimento é opcional; a resenha do fim é obrigatória.',
  ],

  // -------- pós-jogo --------
  pos_placar: [
    '{vencedor} levou por {placar}. O troféu é imaginário, a moral no grupo é bem real.',
    '{placar} para o {vencedor}. O jogo teve dono e o dono deixou recado.',
  ],
  pos_empate: [
    'Empate em {placar}: ninguém perdeu, ninguém cala a boca na resenha.',
    '{placar} no fim — o único resultado em que os dois times saem dizendo que "faltou capricho".',
  ],
  pos_zebra: [
    'O {vencedor} tinha {diff} {pontos} de overall CONTRA e venceu mesmo assim. O algoritmo pediu revisão da partida.',
    'Zebra confirmada: o {vencedor} bateu o favorito. O papel aceita tudo, o campo não.',
  ],
  quebra_sequencia: [
    'Acabou a invencibilidade de {nome}: {n} jogos sem perder, até hoje. O grupo agradece o conteúdo.',
    '{nome} vinha há {n} jogos sem perder. Vinha.',
  ],
  pos_artilheiro_dia: [
    '{nome} marcou {n} e saiu com a bola debaixo do braço — figurativamente, esperamos.',
    '{n} gols de {nome}. A defesa adversária chama isso de "problema administrativo".',
  ],
  pos_garcom: [
    '{nome} distribuiu {n} assistências. Entrega o gol pronto e ainda quer agradecimento.',
  ],
  pos_paredao: [
    '{nome} fez {n} defesas. As traves mandaram flores.',
  ],
}

// ---------------------------------------------------------------- geração

// Junta a escalação por id → linha ({name, team, is_goalkeeper}). O
// is_goalkeeper importa: a resenha não pode gozar com o goleiro por "não
// marcar há N jogos", nem chamar "goleiro" a quem hoje joga na linha.
function linhasDaEscalacao(jogo) {
  const mapa = new Map()
  for (const l of jogo?.lineup || []) mapa.set(l.player_id, l)
  return mapa
}

// plural simples para os placeholders numéricos
const plural = (n, singular, plurais) => (Number(n) === 1 ? singular : plurais)

// Lado adversário de um jogador na escalação (para "o time adversário").
function ladoDe(jogo, playerId) {
  const l = (jogo?.lineup || []).find((x) => x.player_id === playerId)
  return l?.team === 'A' || l?.team === 'B' ? l.team : null
}

const outroLado = (lado) => (lado === 'A' ? 'B' : lado === 'B' ? 'A' : null)

// Uma frase por categoria; devolve {categoria, texto} ou null.
function frase(random, categoria, valores) {
  const pool = T[categoria] || []
  // baralha para a ordem de tentativa variar; o primeiro template que
  // conseguir preencher todos os placeholders ganha
  for (const t of baralhar(pool, random)) {
    const texto = preencher(t, valores)
    if (texto) return { categoria, texto }
  }
  return null
}

// ---------------------------------------------------------------- API

// Resenha de SORTEIO (pré-jogo). `tentativa` muda a semente — é o botão
// "gerar outra vez".
export function gerarResenhaSorteio({ jogo, sequencias, liderancas, tentativa = 0 } = {}) {
  if (!jogo) return []
  const random = criarRandom(`${jogo.id || 'jogo'}#resenha${tentativa ? `#${tentativa}` : ''}`)
  const linhas = linhasDaEscalacao(jogo)
  const nomes = new Map([...linhas].map(([id, l]) => [id, l.name]))
  const usados = new Set() // um protagonista por resenha
  const out = []
  const marcar = (id) => id && usados.add(id)
  const livre = (id) => id && nomes.has(id) && !usados.has(id)

  // 1) equilíbrio / vantagem — há sempre números para isto
  const v = vantagem(jogo.team_a_overall, jogo.team_b_overall)
  if (v.nivel !== 'desconhecido') {
    const f = v.equilibrado
      ? frase(random, 'equilibrio_bom', {
          pct: v.pct.toFixed(1),
          diff: v.diff,
          pontinhos: plural(v.diff, 'pontinho', 'pontinhos'),
        })
      : frase(random, 'equilibrio_mau', {
          forte: nomeDaEquipa(v.lado),
          fraco: nomeDaEquipa(outroLado(v.lado)),
          diff: v.diff,
          pontos: plural(v.diff, 'ponto', 'pontos'),
        })
    if (f) out.push(f)
  }

  // 2) duelo artilheiro × paredão, se estiverem em lados opostos
  const artilheiroId = liderancas?.artilheiro?.playerIds?.[0]
  const paredaoId = liderancas?.paredao?.playerIds?.[0]
  if (livre(artilheiroId) && livre(paredaoId)) {
    const la = ladoDe(jogo, artilheiroId)
    const lp = ladoDe(jogo, paredaoId)
    if (la && lp && la !== lp) {
      const f = frase(random, 'duelo_artilheiro_paredao', {
        artilheiro: primeiroNome(nomes.get(artilheiroId)),
        paredao: primeiroNome(nomes.get(paredaoId)),
      })
      if (f) {
        out.push(f)
        marcar(artilheiroId)
        marcar(paredaoId)
      }
    }
  }

  // 3) um título em campo (rei da pelada / craques / vitórias), escolhido à sorte
  const titulos = [
    ['rei-da-pelada', 'Rei da Pelada'],
    ['rei-craques', 'Rei dos Craques'],
    ['rei-vitorias', 'Rei das Vitórias'],
    ['rei-assistencias', 'Rei das Assistências'],
  ].filter(([id]) => livre(liderancas?.[id]?.playerIds?.[0]))
  if (titulos.length) {
    const [id, rotulo] = escolher(titulos, random)
    const dono = liderancas[id].playerIds[0]
    const lado = ladoDe(jogo, dono)
    if (lado) {
      const f = frase(random, 'titulo_no_time', {
        time: nomeDaEquipa(lado),
        outro: nomeDaEquipa(outroLado(lado)),
        lider: primeiroNome(nomes.get(dono)),
        titulo: rotulo,
      })
      if (f) {
        out.push(f)
        marcar(dono)
      }
    }
  }

  // 4) fases: um em alta, um em baixa, um invicto, um goleiro seguro —
  // percorre a escalação por ordem baralhada para variar quem sai
  const ids = baralhar([...nomes.keys()], random)
  let temBoa = false
  let temMa = false
  let temInvicto = false
  let temGoleiro = false
  for (const id of ids) {
    if (out.length >= 5) break
    if (!livre(id)) continue
    const e = sequencias?.[id]
    if (!e) continue
    const linha = linhas.get(id)
    const ehGoleiroHoje = linha?.is_goalkeeper === true
    const nome = primeiroNome(nomes.get(id))
    const adversario = nomeDaEquipa(outroLado(ladoDe(jogo, id)))

    if (!temInvicto && e.seqSemPerder >= 4) {
      const f = frase(random, 'invicto_em_risco', { nome, n: e.seqSemPerder, timeAdversario: adversario })
      if (f) {
        out.push(f)
        marcar(id)
        temInvicto = true
        continue
      }
    }
    // só quem vai MESMO à baliza hoje: chamar "goleiro" a quem joga na
    // linha promete um duelo que não existe
    if (!temGoleiro && ehGoleiroHoje && e.seqSemSofrer >= 2) {
      const f = frase(random, 'goleiro_seguro', { nome, n: e.seqSemSofrer })
      if (f) {
        out.push(f)
        marcar(id)
        temGoleiro = true
        continue
      }
    }
    const fase = faseDoJogador(e)
    if (!temBoa && fase?.tipo === 'boa') {
      const f = frase(random, 'boa_fase', { nome, fase: fase.texto, timeAdversario: adversario })
      if (f) {
        out.push(f)
        marcar(id)
        temBoa = true
        continue
      }
    }
    // goleiros ficam de fora da "seca de gols": não marcar é o emprego deles
    if (!temMa && !ehGoleiroHoje && e.seqSemMarcar >= 5 && e.jogos >= 5) {
      const f = frase(random, 'pressionado', { nome, n: e.seqSemMarcar })
      if (f) {
        out.push(f)
        marcar(id)
        temMa = true
      }
    }
  }

  // 5) sem nada para dizer, diz-se pouco — mas diz-se
  if (out.length === 0) {
    const f = frase(random, 'pre_jogo_generico', {})
    if (f) out.push(f)
  }

  return out.slice(0, 5)
}

// Resenha de RESULTADO (pós-jogo). `resultado` traz o que o formulário tem:
// { scoreA, scoreB, stats: [{player_id, goals, assists}], gkStats: [{goalkeeper_id, saves}] }.
// As sequências são as de ANTES desta rodada (get_matches ainda não a inclui),
// que é exatamente o que "quebrou a sequência" precisa.
export function gerarResenhaResultado({ jogo, resultado, sequencias, tentativa = 0 } = {}) {
  if (!jogo || !resultado) return []
  const random = criarRandom(`${jogo.id || 'jogo'}#pos${tentativa ? `#${tentativa}` : ''}`)
  const linhas = linhasDaEscalacao(jogo)
  const nomes = new Map([...linhas].map(([id, l]) => [id, l.name]))
  const usados = new Set()
  const out = []

  const a = Number(resultado.scoreA) || 0
  const b = Number(resultado.scoreB) || 0
  const empate = a === b
  const ladoVencedor = empate ? null : a > b ? 'A' : 'B'
  const placar = `${Math.max(a, b)}–${Math.min(a, b)}`

  // 1) o placar
  if (empate) {
    const f = frase(random, 'pos_empate', { placar: `${a}–${b}` })
    if (f) out.push(f)
  } else {
    // zebra: o vencedor tinha menos overall no papel
    const v = vantagem(jogo.team_a_overall, jogo.team_b_overall)
    const foiZebra = v.lado && !v.equilibrado && v.lado !== ladoVencedor
    const f = foiZebra
      ? frase(random, 'pos_zebra', {
          vencedor: nomeDaEquipa(ladoVencedor),
          diff: v.diff,
          pontos: plural(v.diff, 'ponto', 'pontos'),
        })
      : frase(random, 'pos_placar', { vencedor: nomeDaEquipa(ladoVencedor), placar })
    if (f) out.push(f)
  }

  // 2) quebra de invencibilidade: alguém do lado derrotado vinha sem perder
  if (ladoVencedor) {
    const derrotados = (jogo.lineup || []).filter((l) => l.team === outroLado(ladoVencedor))
    const quebrado = baralhar(derrotados, random).find(
      (l) => (sequencias?.[l.player_id]?.seqSemPerder || 0) >= 4 && !usados.has(l.player_id)
    )
    if (quebrado) {
      const f = frase(random, 'quebra_sequencia', {
        nome: primeiroNome(quebrado.name),
        n: sequencias[quebrado.player_id].seqSemPerder,
      })
      if (f) {
        out.push(f)
        usados.add(quebrado.player_id)
      }
    }
  }

  // 3) destaques individuais do jogo: artilheiro do dia, garçom, paredão
  // Os destaques exigem que o jogador ESTEJA na escalação: um rascunho de
  // resultado gravado antes de uma substituição podia trazer um id que já
  // saiu — sem esta guarda, `primeiroNome(undefined)` dava "alguém" e a
  // frase saía com um protagonista fantasma.
  const stats = Array.isArray(resultado.stats) ? resultado.stats : []
  const maisGols = [...stats].sort((x, y) => (y.goals || 0) - (x.goals || 0))[0]
  if (maisGols && (maisGols.goals || 0) >= 2 && nomes.has(maisGols.player_id) && !usados.has(maisGols.player_id)) {
    const f = frase(random, 'pos_artilheiro_dia', {
      nome: primeiroNome(nomes.get(maisGols.player_id)),
      n: maisGols.goals,
    })
    if (f) {
      out.push(f)
      usados.add(maisGols.player_id)
    }
  }
  const maisAssist = [...stats].sort((x, y) => (y.assists || 0) - (x.assists || 0))[0]
  if (maisAssist && (maisAssist.assists || 0) >= 2 && nomes.has(maisAssist.player_id) && !usados.has(maisAssist.player_id)) {
    const f = frase(random, 'pos_garcom', {
      nome: primeiroNome(nomes.get(maisAssist.player_id)),
      n: maisAssist.assists,
    })
    if (f) {
      out.push(f)
      usados.add(maisAssist.player_id)
    }
  }
  const gks = Array.isArray(resultado.gkStats) ? resultado.gkStats : []
  const maisDefesas = [...gks].sort((x, y) => (y.saves || 0) - (x.saves || 0))[0]
  if (maisDefesas && (maisDefesas.saves || 0) >= 5 && nomes.has(maisDefesas.goalkeeper_id) && !usados.has(maisDefesas.goalkeeper_id)) {
    const f = frase(random, 'pos_paredao', {
      nome: primeiroNome(nomes.get(maisDefesas.goalkeeper_id)),
      n: maisDefesas.saves,
    })
    if (f) {
      out.push(f)
      usados.add(maisDefesas.goalkeeper_id)
    }
  }

  return out.slice(0, 5)
}

// As frases escolhidas viram o corpo do post: uma por linha.
export const juntarResenha = (frases) =>
  (frases || [])
    .map((f) => (typeof f === 'string' ? f : f?.texto))
    .filter(Boolean)
    .join('\n')

export { EQUIPAS }
