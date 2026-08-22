import { ImageDown } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { shareCardImage, type ShareCardSpec } from '../lib/share-image'
import { Button } from './ui'

/**
 * Partilhar como imagem.
 *
 * Fica ao lado do "Partilhar" que já existe e não o substitui: um envia texto e
 * uma ligação, este envia um cartão. São coisas diferentes — o texto serve para
 * quem quer abrir a app, o cartão serve para quem só quer ver.
 *
 * O desenho só acontece ao carregar. Gerar a imagem à cabeça, para o caso de
 * alguém a querer, era desenhar mil por cento das vezes para um por cento dos
 * cliques.
 */
export function ShareImageButton({ spec, filename, text, size = 'md' }: {
  spec: () => ShareCardSpec
  filename: string
  text?: string
  size?: 'sm' | 'md'
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const run = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await shareCardImage(spec(), filename, text)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={run} disabled={busy}>
        <ImageDown/> {busy ? t('share.rendering') : t('share.asImage')}
      </Button>
      {failed && <p className="form-error" role="alert">{t('share.imageError')}</p>}
    </>
  )
}
