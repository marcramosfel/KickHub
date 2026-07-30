// Sequências e fases de cada jogador, lidas do histórico de rodadas.
//
// É o combustível das resenhas: "há 4 jogos sem perder", "marca há 3
// rodadas", "dois jogos sem sofrer gol". Tudo é derivado na leitura, ao
// estilo de achievements.js — nada disto vive na base de dados.
//
// Recebe a lista de `get_matches()` (match_json), que já vem só com rodadas
// que contam e ordenada da mais recente para a mais antiga. As sequências
// "atuais" contam a partir da rodada mais recente para trás; as melhores
// marcas varrem o histórico todo.

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Resultado de um jogador numa rodada: 'V' | 'E' | 'D' | null (sem equipa).
function resultadoDe(linha, rodada) {
  const team = linha?.team
  if (team !== 'A' && team !== 'B') return null
  const a = num(rodada.score_a)
  const b = num(rodada.score_b)
  const meu = team === 'A' ? a : b
  const dele = team === 'A' ? b : a
  if (meu > dele) return 'V'
  if (meu < dele) return 'D'
  return 'E'
}

function novaEntrada() {
  return {
    jogos: 0,
    vitorias: 0,
    empates: 0,
    derrotas: 0,
    // sequências atuais (a contar da rodada mais recente para trás)
    seqVitorias: 0,
    seqSemPerder: 0,
    seqDerrotas: 0,
    seqMarcando: 0,
    seqAssistindo: 0,
    seqSemMarcar: 0,
    seqSemSofrer: 0, // goleiros: rodadas seguidas com 0 gols sofridos
    // melhores marcas de sempre
    melhorSeqVitorias: 0,
    melhorSeqSemPerder: 0,
    // interno: as sequências atuais fecham no primeiro jogo que as quebra
    _abertas: { vit: true, semPerder: true, der: true, marcando: true, assistindo: true, semMarcar: true, semSofrer: true },
    _runVit: 0,
    _runSemPerder: 0,
  }
}

// Sequências de todos os jogadores: { [playerId]: entrada }.
// `rodadas` na ordem de get_matches (recente → antiga); a ordem é respeitada,
// não re-ordenada — é o contrato de quem chama.
export function calcularSequencias(rodadas) {
  const lista = Array.isArray(rodadas) ? rodadas : []
  const mapa = {}
  const entrada = (id) => (mapa[id] ||= novaEntrada())

  // ---- passagem 1: da mais recente para a mais antiga (sequências atuais) ----
  for (const rodada of lista) {
    const idsNaRodada = new Set()
    for (const linha of rodada?.players || []) {
      const id = linha?.player_id
      if (!id) continue
      idsNaRodada.add(id)
      const e = entrada(id)
      e.jogos += 1

      const res = resultadoDe(linha, rodada)
      if (res === 'V') e.vitorias += 1
      else if (res === 'E') e.empates += 1
      else if (res === 'D') e.derrotas += 1

      const gols = num(linha.goals)
      const assists = num(linha.assists)
      const a = e._abertas

      // cada sequência atual cresce enquanto ninguém a quebrar; um jogo sem
      // equipa (rodada antiga sem times registados) quebra as de resultado,
      // porque "não sei" não pode contar como vitória nem como derrota
      if (a.vit) {
        if (res === 'V') e.seqVitorias += 1
        else a.vit = false
      }
      if (a.semPerder) {
        if (res === 'V' || res === 'E') e.seqSemPerder += 1
        else a.semPerder = false
      }
      if (a.der) {
        if (res === 'D') e.seqDerrotas += 1
        else a.der = false
      }
      if (a.marcando) {
        if (gols > 0) e.seqMarcando += 1
        else a.marcando = false
      }
      if (a.assistindo) {
        if (assists > 0) e.seqAssistindo += 1
        else a.assistindo = false
      }
      if (a.semMarcar) {
        if (gols === 0) e.seqSemMarcar += 1
        else a.semMarcar = false
      }
    }

    // goleiros: sofrer 0 na rodada mantém a sequência. O registo do goleiro
    // não vale sozinho: se a equipa dele sofreu gols no placar, o "0" é um
    // formulário por preencher (o admin grava 0 por omissão), não um clean
    // sheet — o placar manda.
    const comRegistoDeGk = new Set()
    for (const g of rodada?.gk_stats || []) {
      const id = g?.goalkeeper_id
      if (!id) continue
      comRegistoDeGk.add(id)
      const e = entrada(id)
      if (e._abertas.semSofrer) {
        const sofridosNoPlacar =
          g.team === 'A' ? num(rodada.score_b) : g.team === 'B' ? num(rodada.score_a) : 0
        if (num(g.goals_conceded) === 0 && sofridosNoPlacar === 0) e.seqSemSofrer += 1
        else e._abertas.semSofrer = false
      }
    }
    // quem jogou a rodada sem registo de baliza não pode manter a sequência
    // a crescer por omissão — "não sei" quebra, como nas de resultado
    for (const id of idsNaRodada) {
      const e = mapa[id]
      if (e && e._abertas.semSofrer && !comRegistoDeGk.has(id)) e._abertas.semSofrer = false
    }
  }

  // ---- passagem 2: da mais antiga para a mais recente (melhores marcas) ----
  for (let i = lista.length - 1; i >= 0; i--) {
    const rodada = lista[i]
    for (const linha of rodada?.players || []) {
      const id = linha?.player_id
      if (!id) continue
      const e = entrada(id)
      const res = resultadoDe(linha, rodada)

      e._runVit = res === 'V' ? e._runVit + 1 : 0
      e._runSemPerder = res === 'V' || res === 'E' ? e._runSemPerder + 1 : 0
      if (e._runVit > e.melhorSeqVitorias) e.melhorSeqVitorias = e._runVit
      if (e._runSemPerder > e.melhorSeqSemPerder) e.melhorSeqSemPerder = e._runSemPerder
    }
  }

  // limpeza dos campos internos
  for (const e of Object.values(mapa)) {
    delete e._abertas
    delete e._runVit
    delete e._runSemPerder
  }
  return mapa
}

// Aproveitamento (0–100). O denominador são as rodadas de resultado
// CONHECIDO (V+E+D) — `jogos` conta também rodadas antigas sem equipa
// registada, e essas não podem baixar a percentagem de ninguém.
export function aproveitamento(e) {
  if (!e) return null
  const conhecidos = (e.vitorias || 0) + (e.empates || 0) + (e.derrotas || 0)
  if (!conhecidos) return null
  return Math.round(((e.vitorias * 3 + e.empates) / (conhecidos * 3)) * 100)
}

// A fase de um jogador, em linguagem de resenha. `null` quando não há nada
// digno de nota — a resenha salta-o em vez de inventar.
export function faseDoJogador(e) {
  if (!e) return null
  if (e.seqVitorias >= 3) return { tipo: 'boa', texto: `${e.seqVitorias} vitórias seguidas` }
  if (e.seqSemPerder >= 4) return { tipo: 'boa', texto: `${e.seqSemPerder} jogos sem perder` }
  if (e.seqMarcando >= 3) return { tipo: 'boa', texto: `marca há ${e.seqMarcando} jogos` }
  if (e.seqAssistindo >= 3) return { tipo: 'boa', texto: `assiste há ${e.seqAssistindo} jogos` }
  if (e.seqSemSofrer >= 2) return { tipo: 'boa', texto: `${e.seqSemSofrer} jogos sem sofrer gol` }
  if (e.seqDerrotas >= 3) return { tipo: 'ma', texto: `${e.seqDerrotas} derrotas seguidas` }
  if (e.seqSemMarcar >= 5 && e.jogos >= 5) return { tipo: 'ma', texto: `${e.seqSemMarcar} jogos sem marcar` }
  return null
}
