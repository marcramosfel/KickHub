import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerAttribute } from '../../domain/player-attributes'
import { I18nProvider } from '../../lib/i18n'
import { Card, type CardPlayer } from './Card'

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))

const attribute = (id: string, value: number | null): PlayerAttribute => ({
  id: id as PlayerAttribute['id'],
  nameKey: `attr.${id}.name`,
  descKey: `attr.${id}.desc`,
  value,
})

function player(overrides: Partial<CardPlayer> = {}): CardPlayer {
  return {
    id: 'p-1', name: 'Marcos Ramos', photo: null, position: 'MEI',
    overall: 87, provisional: false, rarity: 'epic',
    titleKey: null, icon: '🔥',
    attributes: [
      attribute('ATA', 88), attribute('PAS', 91), attribute('DEC', 79),
      attribute('REG', 74), attribute('VIT', 66), attribute('TEC', 84),
    ],
    ...overrides,
  }
}

/** O card sem animação: é o estado final, que é o que se pode afirmar. */
function renderCard(overrides: Partial<CardPlayer> = {}) {
  localStorage.setItem('kickhub-locale', 'pt')
  return render(
    <I18nProvider><Card player={player(overrides)} animate={false} interactive={false}/></I18nProvider>,
  )
}

describe('Card', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('mostra o overall, a posição e os seis atributos', () => {
    const { container } = renderCard()
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(screen.getByText('MEI')).toBeInTheDocument()
    expect(container.querySelectorAll('.fifa-attr')).toHaveLength(6)
  })

  it('sem overall mostra travessão, e nunca zero', () => {
    renderCard({ overall: null })
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('um atributo sem dados mostra travessão e fica sem barra', () => {
    const { container } = renderCard({
      attributes: [attribute('ATA', null), attribute('PAS', 50)],
    })
    // Uma barra a zero lê-se como "é mau"; a ausência de barra lê-se como
    // ausência, que é o que se passa.
    expect(container.querySelectorAll('.fifa-attr-bar')).toHaveLength(1)
    expect(container.querySelectorAll('.fifa-attr')).toHaveLength(2)
  })

  it('assume que o número é um palpite quando o é', () => {
    renderCard({ provisional: true })
    expect(screen.getByText(/Provisório/)).toBeInTheDocument()
  })

  it('a raridade tem nome escrito, e não só cor', () => {
    renderCard({ rarity: 'legendary' })
    expect(screen.getByText('Lendário')).toBeInTheDocument()
  })

  it('sem foto usa as iniciais em vez de uma imagem partida', () => {
    const { container } = renderCard({ photo: null })
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('MR')).toBeInTheDocument()
  })

  it('a faixa de cor acompanha o valor, que está sempre escrito', () => {
    const { container } = renderCard({
      attributes: [attribute('ATA', 95), attribute('PAS', 30)],
    })
    const bands = [...container.querySelectorAll('.fifa-attr')].map((node) => node.getAttribute('data-band'))
    expect(bands).toEqual(['elite', 'low'])
    expect(screen.getByText('95')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('sem animação os números já estão no valor final', () => {
    renderCard()
    // Nada de contagem: o que se lê é o que vale.
    expect(screen.getByText('88')).toBeInTheDocument()
    expect(screen.getByText('91')).toBeInTheDocument()
  })

  it('a camada holográfica só existe a partir de raro', () => {
    expect(renderCard({ rarity: 'common' }).container.querySelector('.fifa-card-holo')).toBeNull()
    expect(renderCard({ rarity: 'rare' }).container.querySelector('.fifa-card-holo')).not.toBeNull()
  })
})
