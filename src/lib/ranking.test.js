import { describe, it, expect } from 'vitest'
import {
  RANKING_TABS,
  contarResultados,
  juntarEstatisticas,
  mediaGolsSofridos,
  ordenarGoleiros,
  ordenarJogadoresDeCampo,
  ordenarPor,
} from './ranking.js'
import { PLAYER_TYPE } from './positions.js'

const campo = (extra) => ({ playerType: PLAYER_TYPE.FIELD, matches: 0, goals: 0, assists: 0, ...extra })

describe('ordenarJogadoresDeCampo', () => {
  it('ordena por overall desc', () => {
    const lista = [campo({ id: 'a', name: 'Ana', overall: 70 }), campo({ id: 'b', name: 'Bruno', overall: 90 })]
    expect(ordenarJogadoresDeCampo(lista).map((j) => j.id)).toEqual(['b', 'a'])
  })

  it('desempata por jogos, participações, vitórias e nome — por esta ordem', () => {
    const lista = [
      campo({ id: 'nome-z', name: 'Zeca', overall: 80, matches: 10, goals: 5, assists: 5, wins: 4 }),
      campo({ id: 'nome-a', name: 'Alberto', overall: 80, matches: 10, goals: 5, assists: 5, wins: 4 }),
      campo({ id: 'vitorias', name: 'Vítor', overall: 80, matches: 10, goals: 5, assists: 5, wins: 9 }),
      campo({ id: 'participacoes', name: 'Paulo', overall: 80, matches: 10, goals: 20, assists: 0, wins: 0 }),
      campo({ id: 'jogos', name: 'João', overall: 80, matches: 30, goals: 0, assists: 0, wins: 0 }),
    ]
    expect(ordenarJogadoresDeCampo(lista).map((j) => j.id)).toEqual([
      'jogos', // mais jogos
      'participacoes', // mesmos jogos, mais gols+assistências
      'vitorias', // mesmas participações, mais vitórias
      'nome-a', // por fim o nome
      'nome-z',
    ])
  })

  it('põe quem não tem overall no fim, mesmo com muitos jogos', () => {
    const lista = [
      campo({ id: 'sem', name: 'Sem nota', overall: null, matches: 50 }),
      campo({ id: 'com', name: 'Com nota', overall: 12, matches: 1 }),
    ]
    expect(ordenarJogadoresDeCampo(lista).map((j) => j.id)).toEqual(['com', 'sem'])
  })

  it('deixa os goleiros de fora e não mexe na lista original', () => {
    const lista = [
      campo({ id: 'a', name: 'Ana', overall: 50 }),
      { id: 'g', name: 'Gil', playerType: PLAYER_TYPE.GOALKEEPER, gkOverall: 99 },
    ]
    const copia = [...lista]
    expect(ordenarJogadoresDeCampo(lista).map((j) => j.id)).toEqual(['a'])
    expect(lista).toEqual(copia)
  })
})

describe('ordenarGoleiros', () => {
  const gk = (extra) => ({ playerType: PLAYER_TYPE.GOALKEEPER, saves: 0, ...extra })

  it('ordena por overall de goleiro e depois pelos desempates certos', () => {
    const lista = [
      gk({ id: 'nome-z', name: 'Zé', gkOverall: 70, savePct: 60, goalsConcededPerMatch: 2, saves: 30 }),
      gk({ id: 'nome-a', name: 'Abel', gkOverall: 70, savePct: 60, goalsConcededPerMatch: 2, saves: 30 }),
      gk({ id: 'defesas', name: 'Dario', gkOverall: 70, savePct: 60, goalsConcededPerMatch: 2, saves: 99 }),
      gk({ id: 'sofridos', name: 'Sérgio', gkOverall: 70, savePct: 60, goalsConcededPerMatch: 0.5, saves: 1 }),
      gk({ id: 'pct', name: 'Pedro', gkOverall: 70, savePct: 90, goalsConcededPerMatch: 9, saves: 1 }),
      gk({ id: 'topo', name: 'Tiago', gkOverall: 88, savePct: 10, goalsConcededPerMatch: 9, saves: 1 }),
    ]
    expect(ordenarGoleiros(lista).map((j) => j.id)).toEqual([
      'topo', // maior overall
      'pct', // maior % de defesas
      'sofridos', // menor média de gols sofridos
      'defesas', // mais defesas
      'nome-a',
      'nome-z',
    ])
  })

  it('overall nulo vai para o fim', () => {
    const lista = [gk({ id: 'sem', name: 'Sem', gkOverall: null, savePct: 99 }), gk({ id: 'com', name: 'Com', gkOverall: 40 })]
    expect(ordenarGoleiros(lista).map((j) => j.id)).toEqual(['com', 'sem'])
  })

  it('aceita listas já filtradas que não trazem playerType', () => {
    const lista = [{ id: 'x', name: 'Xico', gkOverall: 60, saves: 4 }]
    expect(ordenarGoleiros(lista)).toHaveLength(1)
    // sem a chave `gkOverall` de todo, o overall da linha serve
    expect(ordenarGoleiros([{ id: 'y', name: 'Yuri', overall: 60, saves: 4 }])).toHaveLength(1)
  })

  it('jogador de campo com passagem na baliza não entra pelo overall de campo', () => {
    // Escalas diferentes: 88 de campo à frente de um goleiro de 55 era mentira.
    const lista = [
      { id: 'f', name: 'Filipe', playerType: PLAYER_TYPE.FIELD, overall: 88, gkOverall: null, saves: 3 },
      gk({ id: 'g', name: 'Gil', gkOverall: 55, saves: 20 }),
    ]
    expect(ordenarGoleiros(lista).map((j) => j.id)).toEqual(['g', 'f'])
  })
})

describe('ordenarPor', () => {
  it('ordena desc pelo campo, desempata por jogos e nome, e corta os zeros', () => {
    const lista = [
      { id: 'zero', name: 'Zero', goals: 0, matches: 20 },
      { id: 'nome-b', name: 'Bento', goals: 5, matches: 3 },
      { id: 'nome-a', name: 'Artur', goals: 5, matches: 3 },
      { id: 'jogos', name: 'Jorge', goals: 5, matches: 10 },
      { id: 'topo', name: 'Tomás', goals: 12, matches: 1 },
    ]
    expect(ordenarPor(lista, 'goals').map((j) => j.id)).toEqual(['topo', 'jogos', 'nome-a', 'nome-b'])
  })

  it('vitórias a null dão lista vazia (empty state, não zeros inventados)', () => {
    const lista = [
      { id: 'a', name: 'Ana', wins: null, matches: 9 },
      { id: 'b', name: 'Bruno', wins: null, matches: 4 },
    ]
    expect(ordenarPor(lista, 'wins')).toEqual([])
  })
})

describe('contarResultados', () => {
  it('conta vitórias, empates e derrotas a partir do histórico', () => {
    const rodadas = [
      { score_a: 3, score_b: 1, players: [{ player_id: 'a', team: 'A' }, { player_id: 'b', team: 'B' }] },
      { score_a: 2, score_b: 2, players: [{ player_id: 'a', team: 'A' }, { player_id: 'b', team: 'B' }] },
      { score_a: 0, score_b: 4, players: [{ player_id: 'a', team: 'A' }, { player_id: 'b', team: 'B' }] },
    ]
    expect(contarResultados(rodadas)).toEqual({
      a: { wins: 1, draws: 1, losses: 1 },
      b: { wins: 1, draws: 1, losses: 1 },
    })
  })

  it('ignora rodadas sem times atribuídos', () => {
    const rodadas = [{ score_a: 3, score_b: 0, players: [{ player_id: 'a', team: null }] }]
    expect(contarResultados(rodadas)).toEqual({})
  })

  it('ignora rodadas por jogar — um rascunho a 0-0 não é empate de ninguém', () => {
    const jogadores = [{ player_id: 'a', team: 'A' }, { player_id: 'b', team: 'B' }]
    expect(contarResultados([{ status: 'DRAFT', score_a: 0, score_b: 0, players: jogadores }])).toEqual({})
    expect(contarResultados([{ status: 'CANCELLED', score_a: 2, score_b: 1, players: jogadores }])).toEqual({})
    // rodada antiga, sem placar registado
    expect(contarResultados([{ players: jogadores }])).toEqual({})
    // mas um 0-0 mesmo jogado continua a valer empate
    expect(contarResultados([{ status: 'COMPLETED', score_a: 0, score_b: 0, players: jogadores }])).toEqual({
      a: { wins: 0, draws: 1, losses: 0 },
      b: { wins: 0, draws: 1, losses: 0 },
    })
  })
})

describe('juntarEstatisticas', () => {
  const players = [
    { id: 'g1', name: 'Gil', photo_url: 'g.png', avg: 3, player_type: 'GOALKEEPER' },
    { id: 'p1', name: 'Ana', photo_url: 'a.png', avg: 4, player_type: 'FIELD', primary_position: 'ST' },
  ]
  const playerStats = [
    { id: 'p1', name: 'Ana', matches: 10, goals: 12, assists: 4, craques: 3, bagres: 0 },
    { id: 'g1', name: 'Gil', matches: 10, goals: 0, assists: 0, craques: 1, bagres: 2 },
  ]
  const goalkeeperStats = [{ player_id: 'g1', matches: 10, saves: 40, goals_conceded: 20, clean_sheets: 2 }]

  it('funde as três fontes e escolhe o overall pelo tipo de jogador', () => {
    const [ana, gil] = juntarEstatisticas({ players, playerStats, goalkeeperStats })
    expect(ana.name).toBe('Ana')
    expect(ana.goals).toBe(12)
    expect(ana.primaryPosition).toBe('ST')
    expect(ana.overall).toBe(ana.fieldOverall)
    expect(ana.gkOverall).toBeNull()

    expect(gil.name).toBe('Gil')
    expect(gil.saves).toBe(40)
    expect(gil.savePct).toBe(66.7) // 40 defesas em 60 finalizações
    expect(gil.goalsConcededPerMatch).toBe(2)
    expect(gil.overall).toBe(gil.gkOverall)
    expect(gil.gkOverall).not.toBeNull()
  })

  it('deixa as vitórias a null quando não há histórico', () => {
    const [ana] = juntarEstatisticas({ players, playerStats, goalkeeperStats })
    expect(ana.wins).toBeNull()
    expect(ana.draws).toBeNull()
    expect(ana.losses).toBeNull()
  })

  it('usa as vitórias do histórico quando existem', () => {
    const resultados = contarResultados([
      { score_a: 2, score_b: 1, players: [{ player_id: 'p1', team: 'A' }, { player_id: 'g1', team: 'B' }] },
    ])
    const lista = juntarEstatisticas({ players, playerStats, goalkeeperStats, resultados })
    expect(lista.find((j) => j.id === 'p1').wins).toBe(1)
    expect(lista.find((j) => j.id === 'g1').losses).toBe(1)
  })

  it('aguenta jogadores sem estatísticas nenhumas', () => {
    const lista = juntarEstatisticas({ players: [{ id: 'novo', name: 'Novo', avg: null }] })
    expect(lista[0].matches).toBe(0)
    expect(lista[0].overall).toBeNull()
    expect(lista[0].playerType).toBe(PLAYER_TYPE.FIELD)
  })

  it('sem argumentos devolve lista vazia', () => {
    expect(juntarEstatisticas()).toEqual([])
  })

  it('a média de gols sofridos da pelada sai da soma de todos os goleiros', () => {
    expect(mediaGolsSofridos(goalkeeperStats)).toBe(2)
    expect(mediaGolsSofridos([])).toBeNull()
  })
})

// O get_goalkeeper_stats() não devolve um array: devolve
// `{ league: { avg_goals_conceded }, goalkeepers: [...] }`. Passar o resultado
// do RPC diretamente tem de funcionar — é o que qualquer página vai fazer.
describe('juntarEstatisticas com o payload real do get_goalkeeper_stats', () => {
  const rpc = {
    league: { avg_goals_conceded: 2 },
    goalkeepers: [
      {
        id: 'g1',
        name: 'Gil',
        photo: null,
        player_type: 'GOALKEEPER',
        matches: 10,
        saves: 40,
        goals_conceded: 20,
        clean_sheets: 2,
        wins: 5,
        draws: 1,
        losses: 4,
      },
    ],
  }
  const players = [
    { id: 'g1', name: 'Gil', avg: 3, player_type: 'GOALKEEPER' },
    { id: 'p1', name: 'Ana', avg: 4, player_type: 'FIELD' },
  ]
  // o goleiro não tem linhas em match_stats: aparece aqui com tudo a zero
  const playerStats = [
    { id: 'g1', name: 'Gil', matches: 0, goals: 0, assists: 0, craques: 0, bagres: 0 },
    { id: 'p1', name: 'Ana', matches: 8, goals: 5, assists: 1, craques: 0, bagres: 0 },
  ]

  it('não rebenta com o objeto e lê os goleiros lá de dentro', () => {
    const lista = juntarEstatisticas({ players, playerStats, goalkeeperStats: rpc })
    const gil = lista.find((j) => j.id === 'g1')
    expect(gil.saves).toBe(40)
    expect(gil.gkOverall).not.toBeNull()
    expect(gil.overall).toBe(gil.gkOverall)
  })

  it('as rodadas do goleiro vêm da baliza, não do get_player_stats a zero', () => {
    const gil = juntarEstatisticas({ players, playerStats, goalkeeperStats: rpc }).find((j) => j.id === 'g1')
    expect(gil.matches).toBe(10)
    expect(gil.wins).toBe(5)
    expect(gil.losses).toBe(4)
    expect(gil.gkParts.winRate).toBeCloseTo(0.5, 9)
  })

  it('a média da pelada também sai do objeto', () => {
    expect(mediaGolsSofridos(rpc)).toBe(2)
    // sem rodadas no array vale a média que a base já calculou
    expect(mediaGolsSofridos({ league: { avg_goals_conceded: 1.5 }, goalkeepers: [] })).toBe(1.5)
    // ...mas o coalesce(...,0) do SQL não é uma média a sério
    expect(mediaGolsSofridos({ league: { avg_goals_conceded: 0 }, goalkeepers: [] })).toBeNull()
  })

  it('as vitórias da baliza podem vir do histórico quando a linha não as traz', () => {
    const semVitorias = {
      league: { avg_goals_conceded: 2 },
      goalkeepers: [{ id: 'g1', name: 'Gil', matches: 4, saves: 10, goals_conceded: 5, clean_sheets: 1 }],
    }
    const resultados = { g1: { wins: 2, draws: 0, losses: 2 } }
    const gil = juntarEstatisticas({ players, playerStats, goalkeeperStats: semVitorias, resultados }).find(
      (j) => j.id === 'g1',
    )
    expect(gil.gkParts.winRate).toBeCloseTo(0.5, 9)
  })

  it('só com goleiros ainda monta a lista', () => {
    const lista = juntarEstatisticas({ goalkeeperStats: rpc })
    expect(lista).toHaveLength(1)
    expect(lista[0].name).toBe('Gil')
    expect(lista[0].matches).toBe(10)
  })
})

describe('RANKING_TABS', () => {
  it('tem as seis abas pela ordem combinada', () => {
    expect(RANKING_TABS.map((t) => t.id)).toEqual([
      'campo',
      'goleiros',
      'artilheiros',
      'assistencias',
      'craques',
      'vitorias',
    ])
    expect(RANKING_TABS.every((t) => t.label && t.icon)).toBe(true)
  })
})
