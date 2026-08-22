/**
 * Cartões de partilha, desenhados em canvas.
 *
 * O que se partilha no grupo não deve parecer uma captura de ecrã. Uma captura
 * traz a barra de navegação, o menu e a bateria do telemóvel de quem a tirou;
 * um cartão traz só o que interessa, no formato certo, e com a marca discreta
 * de quem o gerou.
 *
 * **Canvas e não uma biblioteca.** Converter DOM em imagem obriga a arrastar
 * uma dependência que reimplementa meio motor de layout, e a apanhar
 * exactamente os mesmos problemas de fontes e de imagens de outra origem. Aqui
 * desenham-se as poucas formas de que precisamos, e o resultado é o mesmo em
 * todos os browsers porque não depende de nenhum.
 *
 * **Sem rede.** Tudo o que entra já está carregado — as fotos vêm de URLs
 * assinados que a página já usa, e passam pelo mesmo `crossOrigin` que o
 * `<img>` usa, senão o canvas fica marcado e o `toBlob` recusa-se a exportar.
 * Uma foto que não carregue não impede o cartão: sai a inicial, como na app.
 */
export type ShareStat = { label: string; value: string }

export type ShareCardSpec = {
  /** A linha pequena por cima do título — "Sorteio", "Resultado", "Card". */
  eyebrow: string
  title: string
  subtitle?: string
  /** Até seis; acima disso deixam de se ler no telemóvel de quem recebe. */
  stats?: readonly ShareStat[]
  /** Duas colunas de nomes, para escalações. */
  columns?: readonly { heading: string; items: readonly string[] }[]
  photo?: string
  /** O número grande, quando existe: o overall. */
  highlight?: string
  footer?: string
}

const W = 1080
const H = 1350
const INK = '#0a1710'
const BRAND = '#d8ff45'
const MUTED = 'rgba(255,255,255,.62)'

/** Carrega a foto sem deixar o canvas marcado. Falhar é aceitável; bloquear não. */
function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function roundedRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Corta um nome comprido em vez de o deixar sair do cartão. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** O símbolo da marca, desenhado à mão: o mesmo K no círculo central. */
function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale / 32, scale / 32)
  ctx.translate(-16, -16)
  ctx.strokeStyle = BRAND
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2.6
  ctx.setLineDash([52, 17])
  ctx.lineDashOffset = -9
  ctx.beginPath()
  ctx.arc(16, 16, 11, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineWidth = 2.8
  ctx.beginPath()
  ctx.moveTo(11.6, 8.6); ctx.lineTo(11.6, 23.4)
  ctx.moveTo(21.4, 8.6); ctx.lineTo(13.6, 16); ctx.lineTo(21.4, 23.4)
  ctx.stroke()
  ctx.restore()
}

export async function renderShareCard(spec: ShareCardSpec): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Fundo: o verde do relvado a esbater para o escuro da marca.
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#123825')
  sky.addColorStop(1, INK)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // As riscas do relvado, muito ténues: dão textura sem competir com o texto.
  ctx.fillStyle = 'rgba(255,255,255,.028)'
  for (let y = 0; y < H; y += 120) ctx.fillRect(0, y, W, 60)

  let y = 120
  ctx.textAlign = 'left'
  ctx.fillStyle = BRAND
  ctx.font = '700 34px Manrope, system-ui, sans-serif'
  ctx.fillText(spec.eyebrow.toUpperCase(), 80, y)

  y += 86
  ctx.fillStyle = '#fff'
  ctx.font = '800 78px "Space Grotesk", Manrope, system-ui, sans-serif'
  ctx.fillText(fit(ctx, spec.title, W - 160), 80, y)

  if (spec.subtitle) {
    y += 56
    ctx.fillStyle = MUTED
    ctx.font = '500 34px Manrope, system-ui, sans-serif'
    ctx.fillText(fit(ctx, spec.subtitle, W - 160), 80, y)
  }

  let drewPhoto = false
  if (spec.photo) {
    const image = await loadPhoto(spec.photo)
    if (image) {
      drewPhoto = true
      const size = 380
      const x = W - size - 80
      const top = y + 60
      ctx.save()
      roundedRect(ctx, x, top, size, size, 40)
      ctx.clip()
      // `cover`: recorta o lado maior em vez de espalmar a cara de alguém.
      const ratio = Math.max(size / image.width, size / image.height)
      const dw = image.width * ratio
      const dh = image.height * ratio
      ctx.drawImage(image, x + (size - dw) / 2, top + (size - dh) / 2, dw, dh)
      ctx.restore()
    }
  }

  // Sem foto sobrava um buraco no meio do cartão. Em vez de subir tudo — o que
  // daria dois cartões diferentes conforme o jogador tivesse ou não retrato — o
  // espaço leva o símbolo em marca de água, ténue o suficiente para não competir
  // com o número.
  if (!drewPhoto) {
    ctx.save()
    ctx.globalAlpha = 0.06
    drawMark(ctx, W - 300, y + 300, 420)
    ctx.restore()
  }

  if (spec.highlight) {
    ctx.fillStyle = BRAND
    ctx.font = '800 210px "Space Grotesk", Manrope, system-ui, sans-serif'
    ctx.fillText(spec.highlight, 80, y + 260)
  }

  if (spec.stats?.length) {
    const top = H - 420
    const columns = 3
    spec.stats.slice(0, 6).forEach((stat, index) => {
      const cx = 80 + (index % columns) * ((W - 160) / columns)
      const cy = top + Math.floor(index / columns) * 130
      ctx.fillStyle = MUTED
      ctx.font = '700 26px Manrope, system-ui, sans-serif'
      ctx.fillText(stat.label.toUpperCase(), cx, cy)
      ctx.fillStyle = '#fff'
      ctx.font = '800 62px "Space Grotesk", Manrope, system-ui, sans-serif'
      ctx.fillText(stat.value, cx, cy + 62)
    })
  }

  if (spec.columns?.length) {
    const top = y + 120
    spec.columns.slice(0, 2).forEach((column, index) => {
      const cx = 80 + index * ((W - 160) / 2)
      ctx.fillStyle = BRAND
      ctx.font = '800 34px Manrope, system-ui, sans-serif'
      ctx.fillText(fit(ctx, column.heading, (W - 200) / 2), cx, top)
      ctx.fillStyle = '#fff'
      ctx.font = '600 32px Manrope, system-ui, sans-serif'
      column.items.slice(0, 12).forEach((item, line) => {
        ctx.fillText(fit(ctx, item, (W - 200) / 2), cx, top + 60 + line * 48)
      })
    })
  }

  // A marca fica em baixo e discreta: o cartão é do jogador, não nosso.
  drawMark(ctx, 104, H - 96, 48)
  ctx.fillStyle = '#fff'
  ctx.font = '800 34px "Space Grotesk", Manrope, system-ui, sans-serif'
  ctx.fillText('KickHub', 142, H - 84)
  if (spec.footer) {
    ctx.fillStyle = MUTED
    ctx.font = '500 26px Manrope, system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(fit(ctx, spec.footer, 520), W - 80, H - 84)
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}

/**
 * Entrega a imagem. Partilha nativa quando existe — é ela que abre o WhatsApp —
 * e descarregar quando não existe, porque um botão que não faz nada é pior do
 * que um botão que faz o segundo melhor.
 */
export async function shareCardImage(spec: ShareCardSpec, filename: string, text?: string) {
  const blob = await renderShareCard(spec)
  if (!blob) return false

  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text })
      return true
    } catch {
      // Cancelar não é falhar: quem fechou a folha de partilha não quer o
      // descarregamento a acontecer-lhe a seguir sem ter pedido.
      return false
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return true
}
