import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n'
import { ShareButton, shareContent } from './ShareButton'

vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: null }) }))

const original = {
  share: Object.getOwnPropertyDescriptor(navigator, 'share'),
  clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
}

function stubNavigator({ share, writeText }: { share?: unknown; writeText?: unknown }) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeText ?? vi.fn().mockResolvedValue(undefined) },
    configurable: true, writable: true,
  })
}

const content = { title: 'Resultado', text: 'Equipa A 7 · 5 Equipa B', url: 'https://kickhub.test/p/browns' }

describe('shareContent', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => {
    if (original.share) Object.defineProperty(navigator, 'share', original.share)
    if (original.clipboard) Object.defineProperty(navigator, 'clipboard', original.clipboard)
  })

  it('entrega ao sistema quando o sistema sabe partilhar', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share })
    await expect(shareContent(content)).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(content)
  })

  it('copia quando o sistema não sabe partilhar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share: undefined, writeText })
    await expect(shareContent(content)).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith(`${content.text}\n${content.url}`)
  })

  it('cancelar não é falhar, e não copia nada por trás', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const writeText = vi.fn()
    stubNavigator({ share: vi.fn().mockRejectedValue(abort), writeText })
    await expect(shareContent(content)).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('um erro a sério cai para o clipboard em vez de desistir', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share: vi.fn().mockRejectedValue(new Error('boom')), writeText })
    await expect(shareContent(content)).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalled()
  })

  it('assume a falha quando nem copiar dá', async () => {
    stubNavigator({ share: undefined, writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    await expect(shareContent(content)).resolves.toBe('failed')
  })
})

describe('ShareButton', () => {
  afterEach(() => {
    if (original.share) Object.defineProperty(navigator, 'share', original.share)
    if (original.clipboard) Object.defineProperty(navigator, 'clipboard', original.clipboard)
  })

  const renderButton = () => {
    localStorage.setItem('kickhub-locale', 'pt')
    return render(<I18nProvider><ShareButton content={() => content}/></I18nProvider>)
  }

  it('diz o que aconteceu quando copia', async () => {
    stubNavigator({ share: undefined })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Partilhar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Copiado')
  })

  it('não deixa recado nenhum a quem cancelou', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    stubNavigator({ share: vi.fn().mockRejectedValue(abort) })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Partilhar' }))
    await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
