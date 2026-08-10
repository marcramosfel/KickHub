import { describe, it, expect } from 'vitest'
import { ICONE } from './icones.js'

describe('tabela de ícones', () => {
  // A razão de esta tabela existir: o 🥅 significava ao mesmo tempo
  // "autogolo" e "gol sofrido", e no formato de rodízio as duas coisas
  // aparecem na mesma linha do formulário de resultado.
  it('nenhum ícone quer dizer duas coisas', () => {
    const usados = Object.values(ICONE)
    const repetidos = usados.filter((v, i) => usados.indexOf(v) !== i)
    expect(repetidos).toEqual([])
  })

  it('autogolo e gol sofrido são distintos — era este o bug', () => {
    expect(ICONE.autogolos).not.toBe(ICONE.golsSofridos)
  })

  it('autogolo também não se confunde com um gol', () => {
    expect(ICONE.autogolos).not.toBe(ICONE.gols)
  })

  it('todas as estatísticas mostradas têm ícone', () => {
    for (const chave of [
      'jogos',
      'gols',
      'assistencias',
      'autogolos',
      'golsSofridos',
      'defesas',
      'semSofrer',
      'craque',
      'bagre',
      'vitorias',
      'empates',
      'derrotas',
    ]) {
      expect(ICONE[chave], chave).toBeTruthy()
    }
  })
})
