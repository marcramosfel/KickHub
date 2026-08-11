// Repartir um lote de jogadores em duas equipas equilibradas.
//
// Estava dentro das Curiosidades e saiu para aqui quando o Simulador passou a
// precisar do mesmo ("sugerir equipas"). É a mesma decisão nos dois sítios, e
// duas cópias eram duas para divergir.
//
// O que isto tem de próprio — e a razão de existir em vez de se chamar o
// `drawEngine` diretamente — é ESCOLHER O MODO:
//
//   - com dois goleiros ou mais, usa-se o sorteio de goleiros fixos;
//   - sem eles, o de goleiro rotativo.
//
// Não é um detalhe: esta pelada joga com a baliza a rodar e tem UMA pessoa
// registada como goleiro. A primeira versão das Curiosidades exigia dois
// goleiros fixos e o ecrã aparecia permanentemente vazio.

import { N_GOLEIROS, sortearEquipas, sortearEquipasRotativo } from './drawEngine.js'
import { FORMACOES } from './formacoes.js'
import { PLAYER_TYPE } from './positions.js'

export const ehGoleiro = (j) =>
  Boolean(j) && (j.playerType === PLAYER_TYPE.GOALKEEPER || j.primaryPosition === 'GK')

// Quantos jogadores são precisos, em cada modo.
export function requisitos(tamanho = 7) {
  const formacao = FORMACOES[tamanho] || FORMACOES[7]
  return {
    formacao,
    // goleiros fixos: N goleiros + os lugares de campo a dobrar
    campoFixo: formacao.slots.length * 2,
    goleirosFixos: N_GOLEIROS,
    // rodízio: um lote só, com a baliza a rodar lá dentro
    rodizio: (formacao.slots.length + 1) * 2,
  }
}

// Reparte `jogadores` (já filtrados por quem chama) em duas equipas
// equilibradas. Devolve `{ ok: false, motivo }` quando não há gente que chegue
// — um grupo pequeno é uma situação normal, não um erro.
export function repartirEquilibrado({ jogadores, tamanho = 7, seed = '' } = {}) {
  const lista = Array.isArray(jogadores) ? jogadores : []
  const req = requisitos(tamanho)

  const gks = lista.filter(ehGoleiro)
  const campo = lista.filter((j) => !ehGoleiro(j))

  const modoFixo = gks.length >= req.goleirosFixos && campo.length >= req.campoFixo
  const modoRodizio = !modoFixo && lista.length >= req.rodizio

  if (!modoFixo && !modoRodizio) {
    return {
      ok: false,
      motivo: `São precisos ${req.rodizio} jogadores e há ${lista.length}.`,
    }
  }

  const usados = modoFixo
    ? { goleiros: gks.slice(0, req.goleirosFixos), campo: campo.slice(0, req.campoFixo) }
    : { goleiros: [], campo: lista.slice(0, req.rodizio) }

  try {
    const sorteio = modoFixo
      ? sortearEquipas({
          goalkeepers: usados.goleiros,
          fieldPlayers: usados.campo,
          seed,
          tamanho,
        })
      : sortearEquipasRotativo({ jogadores: usados.campo, seed, tamanho })

    return {
      ok: true,
      sorteio,
      gkMode: sorteio.gkMode,
      usados: [...usados.goleiros, ...usados.campo],
    }
  } catch (err) {
    return { ok: false, motivo: err?.message || 'Não foi possível montar as equipas.' }
  }
}

// O sorteio devolve jogadores normalizados (id, nome, overall, posições) e
// deixa cair as estatísticas — que é precisamente do que o simulador precisa.
// Isto volta a colar cada um ao seu registo completo, com o lugar que levou.
export function comEstatisticas(jogadores, originais) {
  const porId = new Map((originais || []).map((j) => [j.id, j]))
  return (jogadores || []).map((j) => ({
    ...(porId.get(j.id) || {}),
    id: j.id,
    name: j.name,
    photo: j.photo ?? porId.get(j.id)?.photo ?? null,
    slot: j.assignedPosition,
  }))
}
