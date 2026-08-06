// Formações por tamanho de equipa.
//
// Até aqui a pelada era 7×7 e só 7×7: `FIELD_SLOTS` (positions.js) tinha os
// seis lugares do 2-3-1 escritos à mão e o motor de sorteio importava-os
// diretamente. Bastava faltar gente para o assistente bloquear.
//
// Este ficheiro é o registo dos formatos possíveis. O motor passa a receber
// os lugares daqui em vez de os importar — o algoritmo húngaro é n×n, não
// 6×6, por isso abrir 6×6 é só declarar os lugares.
//
// Os `id` dos lugares são os mesmos de sempre (`positions.js`), porque são
// os valores gravados em `match_lineup.assigned_position`. Nenhum formato
// pode inventar um lugar novo sem uma migração.

import { FIELD_SLOTS } from './positions.js'

// `slots` são os lugares de CAMPO (o goleiro é tratado à parte, como no
// resto do projeto). `tamanho` = slots + 1.
export const FORMACOES = {
  5: {
    tamanho: 5,
    nome: '1-2-1',
    rotulo: '5 x 5',
    slots: ['DEF-C', 'MID-L', 'MID-R', 'ST'],
    ativa: false, // precisa de um lugar 'DEF-C' que ainda não existe
  },
  6: {
    tamanho: 6,
    nome: '2-2-1',
    rotulo: '6 x 6',
    slots: ['DEF-L', 'DEF-R', 'MID-L', 'MID-R', 'ST'],
    ativa: true,
  },
  7: {
    tamanho: 7,
    nome: '2-3-1',
    rotulo: '7 x 7',
    slots: [...FIELD_SLOTS],
    ativa: true,
  },
  8: {
    tamanho: 8,
    nome: '2-3-2',
    rotulo: '8 x 8',
    slots: ['DEF-L', 'DEF-R', 'MID-L', 'MID-C', 'MID-R', 'ST', 'ST-L'],
    ativa: false, // precisa de um segundo lugar de ataque
  },
}

export const TAMANHO_PADRAO = 7

// Só os formatos que a app sabe mesmo sortear hoje. Os outros aparecem no
// assistente desativados: escondê-los fazia parecer que não existiam;
// mostrá-los ativos era prometer o que a base ainda não aceita.
export const FORMACOES_ATIVAS = Object.values(FORMACOES).filter((f) => f.ativa)

export function formacaoDe(tamanho) {
  return FORMACOES[Number(tamanho)] || FORMACOES[TAMANHO_PADRAO]
}

// Os lugares de campo de um formato. É isto que o motor de sorteio usa.
export const lugaresDe = (tamanho) => formacaoDe(tamanho).slots

// Quantos jogadores são precisos ao todo, por formato.
//
//   FIXED    → 2 goleiros + 2 × (tamanho − 1) de campo
//   ROTATING → 2 × tamanho, todos de linha (o gol roda)
//
// Repare-se que o total é o mesmo nos dois: 14 para 7×7. O que muda é
// quem conta como goleiro, não quantas pessoas jogam.
export function elencoNecessario(tamanho = TAMANHO_PADRAO, gkMode = 'FIXED') {
  const f = formacaoDe(tamanho)
  const total = f.tamanho * 2
  if (gkMode === 'ROTATING') return { total, goleiros: 0, campo: total }
  return { total, goleiros: 2, campo: total - 2 }
}

export const GK_MODE = { FIXED: 'FIXED', ROTATING: 'ROTATING' }

export const ehModoValido = (m) => m === GK_MODE.FIXED || m === GK_MODE.ROTATING
