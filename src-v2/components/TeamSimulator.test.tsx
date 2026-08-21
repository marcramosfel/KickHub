import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CuriosityPlayer } from '../domain/pelada-curiosities'
import { I18nProvider } from '../lib/i18n'
import { TeamSimulator } from './TeamSimulator'

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))

function player(id: string, overall: number | null, overrides: Partial<CuriosityPlayer> = {}): CuriosityPlayer {
  return {
    id, name: id, slot: 'MID', overall,
    gamesPlayed: 20, goals: 8, assists: 4, craques: 1, bagres: 1, concededPerMatch: null,
    playerType: 'FIELD', provisional: false,
    ...overrides,
  }
}

function renderSimulator(players: CuriosityPlayer[]) {
  localStorage.setItem('kickhub-locale', 'pt')
  return render(
    <I18nProvider>
      <TeamSimulator players={players} teamNameA="Equipa A" teamNameB="Equipa B"/>
    </I18nProvider>,
  )
}

const squad = () => ['Ana', 'Bea', 'Caio', 'Dina', 'Elsa', 'Fábio']
  .map((name, index) => player(name, 60 + index * 5))

/** Põe `count` jogadores de um lado, pela ordem em que aparecem na lista. */
function pick(side: 'Equipa A' | 'Equipa B', count: number) {
  const buttons = screen.getAllByRole('button', { name: side })
  for (let index = 0; index < count; index += 1) fireEvent.click(buttons[index])
}

describe('TeamSimulator', () => {
  it('só simula depois de haver dois de cada lado', () => {
    const { container } = renderSimulator(squad())
    expect(screen.getByText(/pelo menos dois de cada lado/)).toBeInTheDocument()

    pick('Equipa A', 2)
    expect(screen.getByText(/pelo menos dois de cada lado/)).toBeInTheDocument()

    // Os dois primeiros já estão na A; os seguintes vão para a B.
    const bButtons = screen.getAllByRole('button', { name: 'Equipa B' })
    fireEvent.click(bButtons[2])
    fireEvent.click(bButtons[3])
    expect(container.querySelector('.curiosity-scoreline')).toBeInTheDocument()
  })

  it('não põe o mesmo jogador nas duas equipas', () => {
    renderSimulator(squad())
    const aButtons = screen.getAllByRole('button', { name: 'Equipa A' })
    const bButtons = screen.getAllByRole('button', { name: 'Equipa B' })
    fireEvent.click(aButtons[0])
    expect(aButtons[0]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(bButtons[0])
    expect(screen.getAllByRole('button', { name: 'Equipa A' })[0]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button', { name: 'Equipa B' })[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('carregar outra vez no mesmo lado tira o jogador de campo', () => {
    renderSimulator(squad())
    const first = screen.getAllByRole('button', { name: 'Equipa A' })[0]
    fireEvent.click(first)
    fireEvent.click(screen.getAllByRole('button', { name: 'Equipa A' })[0])
    expect(screen.getAllByRole('button', { name: 'Equipa A' })[0]).toHaveAttribute('aria-pressed', 'false')
  })

  it('as mesmas equipas dão sempre o mesmo jogo', () => {
    const { container, unmount } = renderSimulator(squad())
    pick('Equipa A', 2)
    const bButtons = screen.getAllByRole('button', { name: 'Equipa B' })
    fireEvent.click(bButtons[2]); fireEvent.click(bButtons[3])
    const first = container.querySelector('.curiosity-scoreline > strong')?.textContent
    unmount()

    const second = renderSimulator(squad())
    pick('Equipa A', 2)
    const otherB = screen.getAllByRole('button', { name: 'Equipa B' })
    fireEvent.click(otherB[2]); fireEvent.click(otherB[3])
    expect(second.container.querySelector('.curiosity-scoreline > strong')?.textContent).toBe(first)
  })

  it('deixa de fora quem ainda não tem overall calculado', () => {
    renderSimulator([...squad(), player('Novato', 90, { provisional: true }), player('Sem nota', null)])
    expect(screen.queryByText('Novato')).not.toBeInTheDocument()
    expect(screen.queryByText('Sem nota')).not.toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  it('diz quantos faltam quando o plantel não chega', () => {
    renderSimulator([player('Ana', 70), player('Bea', 65)])
    expect(screen.getByText(/São precisos 4 jogadores/)).toBeInTheDocument()
  })

  it('limpar tira toda a gente de campo', () => {
    const { container } = renderSimulator(squad())
    pick('Equipa A', 2)
    const bButtons = screen.getAllByRole('button', { name: 'Equipa B' })
    fireEvent.click(bButtons[2]); fireEvent.click(bButtons[3])
    expect(container.querySelector('.curiosity-scoreline')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Limpar/ }))
    expect(container.querySelector('.curiosity-scoreline')).not.toBeInTheDocument()
  })
})
