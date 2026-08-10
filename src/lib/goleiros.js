// Quem é goleiro NESTE jogo — e quem só começou no gol.
//
// A distinção existe porque a app tem dois formatos (migração 0024) e eles
// não querem dizer a mesma coisa:
//
//   FIXED     dois goleiros escolhidos à mão. Ficam na baliza o jogo todo e
//             medem-se por 🧤 defesas e 🥅 gols sofridos — não por gols.
//
//   ROTATING  não há goleiro nenhum. Há uma ORDEM: o `gk_order = 1` de cada
//             equipa começa no gol e daí a dez minutos entra o nº 2. O
//             servidor marca `is_goalkeeper = true` a quem tem a vez 1
//             (`corrigir_ordem_rodizio`), e essa marca é o registo da
//             rotação inicial — nada mais.
//
// Tratar as duas iguais foi a regressão: o formulário do resultado filtrava
// `!is_goalkeeper` e o Marcos, que começou no gol e passou o resto do jogo
// na linha, não tinha onde levar os gols que marcou.
//
// A régua é `gk_mode`, nunca a posição no sorteio.

import { GK_MODE } from './formacoes.js'

// Sem `gk_mode` assume-se FIXED: é o default da coluna e o que todas as
// rodadas anteriores à 0024 são.
export function temGoleiroFixo(jogo) {
  return (jogo?.gk_mode || GK_MODE.FIXED) !== GK_MODE.ROTATING
}

// Este jogador é goleiro para efeitos de estatística?
// Só num jogo COM goleiro fixo é que começar no gol o torna goleiro.
export function ehGoleiroFixo(jogo, linha) {
  return temGoleiroFixo(jogo) && !!linha?.is_goalkeeper
}

// Pode receber gols, assistências e autogolos?
// Toda a gente menos o goleiro fixo. Quem começa no gol num jogo de rodízio
// entra aqui como qualquer outro.
export function contaComoJogadorDeLinha(jogo, linha) {
  return !ehGoleiroFixo(jogo, linha)
}

// As duas listas do formulário de resultado.
//
// `baliza` é só quem tem números de baliza garantidos (os goleiros fixos).
// No rodízio ninguém entra aqui por omissão: passar pela baliza dez minutos
// não é uma rodada de goleiro, e criar-lhe uma linha em
// `goalkeeper_match_stats` metia meia pelada no ranking de goleiros com
// zero defesas. Quem quiser registar defesas de um jogo de rodízio marca-o
// à mão — e o que já estiver gravado continua a aparecer.
export function separarEscalacao(jogo, escalacao) {
  const lista = Array.isArray(escalacao) ? escalacao : []
  const fixo = temGoleiroFixo(jogo)
  return {
    rotativo: !fixo,
    linha: lista.filter((l) => !(fixo && l.is_goalkeeper)),
    baliza: fixo ? lista.filter((l) => l.is_goalkeeper) : [],
  }
}
