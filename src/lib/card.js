// Card do jogador estilo "Ultimate Team", desenhado em canvas (sem
// dependências) para poder ser partilhado como imagem no grupo.

import { calcularOverall } from './overall'

const W = 600
const H = 840
const SCALE = 2 // exporta a 2x para ficar nítido

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function carregarImagem(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Desenha o card e devolve um data URL PNG.
export async function renderPlayerCard(perfil) {
  // garante que as fontes (Oswald/Inter) já estão prontas para o canvas
  try {
    await document.fonts.ready
  } catch {
    /* segue com as fontes por defeito */
  }

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)

  // ---- fundo ----
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#123227')
  bg.addColorStop(0.5, '#0C1D17')
  bg.addColorStop(1, '#08130F')
  ctx.fillStyle = bg
  roundRect(ctx, 0, 0, W, H, 28)
  ctx.fill()

  // moldura com brilho verde
  const frame = ctx.createLinearGradient(0, 0, W, H)
  frame.addColorStop(0, '#34D058')
  frame.addColorStop(0.5, '#1E7A3C')
  frame.addColorStop(1, '#FFC531')
  ctx.strokeStyle = frame
  ctx.lineWidth = 5
  roundRect(ctx, 3, 3, W - 6, H - 6, 26)
  ctx.stroke()

  // ---- overall (canto superior esquerdo) ----
  const { overall, provisorio } = calcularOverall(perfil)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#34D058'
  ctx.font = "700 92px Oswald, 'Arial Narrow', sans-serif"
  ctx.fillText(overall == null ? '—' : String(overall), 96, 128)
  ctx.fillStyle = '#7FA090'
  ctx.font = "600 20px Oswald, sans-serif"
  ctx.fillText('OVERALL', 96, 158)

  // pequena linha decorativa
  ctx.strokeStyle = 'rgba(127,160,144,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(52, 178)
  ctx.lineTo(140, 178)
  ctx.stroke()

  // a média 0–5 continua à vista — o overall é uma leitura extra
  ctx.fillStyle = '#7FA090'
  ctx.font = "600 18px Oswald, sans-serif"
  ctx.fillText(
    perfil.avg == null ? 'SEM NOTAS' : `MÉDIA ${Number(perfil.avg).toFixed(2)}`,
    96,
    202
  )
  if (provisorio) {
    ctx.fillStyle = '#FFC531'
    ctx.font = "600 15px Oswald, sans-serif"
    ctx.fillText('PROVISÓRIO', 96, 224)
  }

  // ---- foto (círculo) ----
  const cx = 340
  const cy = 210
  const raio = 118
  const foto = await carregarImagem(perfil.photo)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, raio, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (foto) {
    // cobre o círculo mantendo a proporção
    const escala = Math.max((raio * 2) / foto.width, (raio * 2) / foto.height)
    const lw = foto.width * escala
    const lh = foto.height * escala
    ctx.drawImage(foto, cx - lw / 2, cy - lh / 2, lw, lh)
  } else {
    ctx.fillStyle = '#16261F'
    ctx.fillRect(cx - raio, cy - raio, raio * 2, raio * 2)
    ctx.fillStyle = '#7FA090'
    ctx.font = "700 84px Oswald, sans-serif"
    ctx.textAlign = 'center'
    ctx.fillText((perfil.name || '?').trim().charAt(0).toUpperCase(), cx, cy + 30)
  }
  ctx.restore()
  ctx.strokeStyle = '#34D058'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, raio, 0, Math.PI * 2)
  ctx.stroke()

  // ---- nome ----
  ctx.textAlign = 'center'
  ctx.fillStyle = '#EAF2EC'
  let nome = (perfil.name || '').toUpperCase()
  ctx.font = "700 46px Oswald, 'Arial Narrow', sans-serif"
  // encolhe se for muito comprido
  while (ctx.measureText(nome).width > W - 80 && parseInt(ctx.font) > 22) {
    const tam = parseInt(ctx.font) - 2
    ctx.font = `700 ${tam}px Oswald, 'Arial Narrow', sans-serif`
  }
  ctx.fillText(nome, W / 2, 400)

  ctx.fillStyle = '#7FA090'
  ctx.font = "400 20px Inter, sans-serif"
  ctx.fillText(`@${perfil.user_id || ''}`, W / 2, 430)

  // separador
  ctx.strokeStyle = 'rgba(127,160,144,0.25)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(60, 466)
  ctx.lineTo(W - 60, 466)
  ctx.stroke()

  // ---- estatísticas (2 linhas × 3 colunas) ----
  const stats = [
    ['JOGOS', perfil.matches ?? 0],
    ['GOLS', perfil.goals ?? 0],
    ['ASSIST', perfil.assists ?? 0],
    ['CRAQUE', perfil.craques ?? 0],
    ['BAGRE', perfil.bagres ?? 0],
    ['VOTOS', perfil.votes ?? 0],
  ]
  const colX = [W / 2 - 170, W / 2, W / 2 + 170]
  const rowY = [545, 675]
  stats.forEach((s, i) => {
    const x = colX[i % 3]
    const y = rowY[Math.floor(i / 3)]
    ctx.fillStyle = '#EAF2EC'
    ctx.font = "700 52px Oswald, 'Arial Narrow', sans-serif"
    ctx.fillText(String(s[1]), x, y)
    ctx.fillStyle = '#7FA090'
    ctx.font = "600 18px Oswald, sans-serif"
    ctx.fillText(s[0], x, y + 28)
  })

  // ---- rodapé ----
  ctx.fillStyle = '#34D058'
  ctx.font = "600 22px Oswald, sans-serif"
  ctx.fillText('PELADA BROWNS', W / 2, H - 46)

  return canvas.toDataURL('image/png')
}

// Descarrega o card como PNG.
export function descarregarCard(dataUrl, nome) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `card-${(nome || 'jogador').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// Tenta partilhar (telemóvel); se não der, descarrega.
export async function partilharCard(dataUrl, nome) {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], `card-${nome || 'jogador'}.png`, { type: 'image/png' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${nome} — Pelada Browns` })
      return 'partilhado'
    }
  } catch {
    /* cai para o download */
  }
  descarregarCard(dataUrl, nome)
  return 'descarregado'
}
