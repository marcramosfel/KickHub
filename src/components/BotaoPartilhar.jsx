import { useState } from 'react'
import { partilharDataUrl } from '../lib/share'

// Botão que gera uma imagem e a entrega ao WhatsApp.
//
// Existe porque esta lógica ia ficar em quatro sítios (seleção, os dois duelos,
// campeonato, simulador) e é toda igual: gerar, entregar, e dizer o que
// aconteceu. A única coisa que muda é `gerar`.
//
// Os três desfechos são distintos de propósito: dizer "partilhado" a quem
// carregou em cancelar é mentira, e mandar procurar nos downloads algo que já
// foi para o WhatsApp é pior.

const slug = (t) =>
  String(t || 'pelada')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export default function BotaoPartilhar({
  gerar,
  nome,
  titulo,
  rotulo = '📲 Partilhar imagem',
  ghost = true,
}) {
  const [estado, setEstado] = useState('parado')
  const [recado, setRecado] = useState('')

  const clicar = async () => {
    setRecado('')
    setEstado('a-gerar')
    try {
      const dataUrl = await gerar()
      if (!dataUrl) {
        setRecado('Não há nada para partilhar ainda.')
        return
      }
      const r = await partilharDataUrl(dataUrl, {
        ficheiro: `${slug(nome || titulo)}.jpg`,
        titulo: titulo || 'Pelada Browns',
      })
      if (r === 'descarregado') setRecado('Imagem guardada nos teus downloads.')
      else if (r === 'cancelado') setRecado('')
      else setRecado('Boa — agora é só colar no grupo. 🔥')
    } catch {
      setRecado('Não consegui montar a imagem. Tenta outra vez.')
    } finally {
      setEstado('parado')
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={clicar}
        disabled={estado === 'a-gerar'}
        className={ghost ? 'pb-tap' : 'pb-sp-btn'}
        style={
          ghost
            ? {
                width: '100%',
                minHeight: 44,
                padding: '11px 16px',
                borderRadius: 12,
                border: '1px solid var(--pb-line)',
                background: 'transparent',
                color: 'var(--pb-text)',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                cursor: estado === 'a-gerar' ? 'wait' : 'pointer',
                opacity: estado === 'a-gerar' ? 0.65 : 1,
              }
            : undefined
        }
      >
        {estado === 'a-gerar' ? '⏳ A montar a arte…' : rotulo}
      </button>
      {recado && (
        <p
          role="status"
          style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--pb-muted)', textAlign: 'center' }}
        >
          {recado}
        </p>
      )}
    </div>
  )
}
