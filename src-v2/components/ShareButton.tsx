import { Check, Share2 } from 'lucide-react'
import { useState } from 'react'
import { track } from '../lib/analytics'
import { useI18n } from '../lib/i18n'

/**
 * O botão de partilhar, num sítio só.
 *
 * Esta lógica ia ficar em cinco ecrãs — resultado, seleção, curiosidades,
 * ranking, card — e é toda igual: entregar ao sistema, e se ele não existir,
 * copiar. O que muda é o texto.
 *
 * Os desfechos são distintos de propósito. Dizer "partilhado" a quem carregou
 * em cancelar é mentira; e mandar procurar no clipboard o que já foi para o
 * WhatsApp é pior ainda.
 *
 * Não gera imagens. O master prompt pede a arquitetura de imagens dinâmicas
 * como trabalho FUTURO (§45), e um botão que promete uma arte e entrega texto
 * seria pior do que um botão honesto que entrega texto.
 */
export type ShareContent = {
  title: string
  /** O corpo da partilha. Já traduzido — quem chama é que sabe a língua. */
  text: string
  /** Por omissão, o endereço da página onde o botão está. */
  url?: string
}

type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Separado do componente para poder ser testado sem montar um ecrã. */
export async function shareContent({ title, text, url }: ShareContent): Promise<ShareOutcome> {
  const target = url ?? (typeof window === 'undefined' ? '' : window.location.href)
  const payload = { title, text, url: target }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(payload)
      return 'shared'
    } catch (error) {
      // Cancelar não é falhar. O `AbortError` é como o browser diz "mudei de
      // ideias", e tratá-lo como erro punia quem simplesmente desistiu.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${target}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function ShareButton({ content, label, variant = 'outline', size = 'sm' }: {
  content: () => ShareContent
  label?: string
  variant?: 'outline' | 'ghost' | 'primary'
  size?: 'sm' | 'md'
}) {
  const { t } = useI18n()
  const [notice, setNotice] = useState<ShareOutcome | ''>('')
  const [busy, setBusy] = useState(false)

  const click = async () => {
    setBusy(true)
    setNotice('')
    const payload = content()
    const outcome = await shareContent(payload)
    setBusy(false)
    // Só conta quem chegou ao fim. Contar a intenção inflaciona o funil com
    // partilhas que ninguém recebeu.
    if (outcome === 'shared' || outcome === 'copied') {
      track('share_clicked', { title: payload.title, outcome })
    }
    // Cancelar não deixa recado: não aconteceu nada que valha a pena contar.
    setNotice(outcome === 'cancelled' ? '' : outcome)
  }

  return (
    <span className="share-action">
      <button type="button" className={`btn btn-${variant} btn-${size}`} onClick={click} disabled={busy}>
        {notice === 'shared' || notice === 'copied' ? <Check/> : <Share2/>}
        {label ?? t('share.action')}
      </button>
      {notice && (
        <small role="status" className={notice === 'failed' ? 'share-notice share-notice-failed' : 'share-notice'}>
          {t(notice === 'shared' ? 'share.shared' : notice === 'copied' ? 'share.copied' : 'share.failed')}
        </small>
      )}
    </span>
  )
}
