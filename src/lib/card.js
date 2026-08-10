// Card do jogador estilo "Ultimate Team", desenhado em canvas (sem
// dependências) para poder ser partilhado como imagem no grupo.

import { calcularOverall } from './overall'
import { raridade } from './cards'

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
//
// `perfil.card` é o card ESCOLHIDO pelo jogador (de `lib/cards.js`). Sem ele
// desenha-se o card genérico de sempre — é o que acontece a quem ainda não
// conquistou nada, e mantém as chamadas antigas a funcionar.
//
// Isto faltava por completo: a imagem partilhada tinha uma moldura verde fixa
// e nenhum título, portanto era igual para o Rei da Pelada, o Rei dos Craques
// e o Garçom. Escolher um card mudava o ecrã e não mudava o que se mandava
// para o grupo — que é precisamente a parte que as pessoas veem.
export async function renderPlayerCard(perfil) {
  const card = perfil?.card || null
  const r = card ? raridade(card.raridade) : null
  // A cor do card manda na moldura, no overall e no rodapé. Sem card, o
  // verde de sempre.
  const corPrincipal = card?.moldura?.borda || '#34D058'
  const corBrilho = r?.cor || '#FFC531'
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

  // ---- moldura, com as cores do card escolhido ----
  const frame = ctx.createLinearGradient(0, 0, W, H)
  frame.addColorStop(0, corPrincipal)
  frame.addColorStop(0.5, '#1E7A3C')
  frame.addColorStop(1, corBrilho)
  ctx.strokeStyle = frame
  // um lendário merece uma borda mais grossa do que um comum
  ctx.lineWidth = r && r.peso >= 4 ? 8 : 5
  roundRect(ctx, 3, 3, W - 6, H - 6, 26)
  ctx.stroke()

  // ---- faixa do título (só quando há card conquistado) ----
  // Vai no topo, como nas molduras do ecrã: é a primeira coisa que se lê
  // num print mandado para o grupo.
  let topo = 0
  if (card) {
    const faixaH = 62
    ctx.fillStyle = corPrincipal
    roundRect(ctx, 8, 8, W - 16, faixaH, 22)
    ctx.fill()
    // o texto tem de se ler em cima da cor da faixa, que varia muito
    ctx.fillStyle = card.moldura?.corTexto || '#0A1512'
    ctx.textAlign = 'left'
    ctx.font = "700 30px Oswald, 'Arial Narrow', sans-serif"
    ctx.fillText(card.icon || '', 30, 50)
    ctx.font = "700 27px Oswald, 'Arial Narrow', sans-serif"
    let titulo = String(card.titulo || '').toUpperCase()
    while (ctx.measureText(titulo).width > W - 190 && parseInt(ctx.font) > 15) {
      ctx.font = `700 ${parseInt(ctx.font) - 1}px Oswald, 'Arial Narrow', sans-serif`
    }
    ctx.fillText(titulo, 78, 49)
    // raridade no canto direito da faixa
    ctx.textAlign = 'right'
    ctx.font = "600 17px Oswald, sans-serif"
    ctx.fillText(String(r?.nome || '').toUpperCase(), W - 30, 48)
    topo = faixaH
  }

  // ---- overall (canto superior esquerdo) ----
  const { overall } = calcularOverall(perfil)
  ctx.textAlign = 'center'
  ctx.fillStyle = corPrincipal
  ctx.font = "700 92px Oswald, 'Arial Narrow', sans-serif"
  ctx.fillText(overall == null ? '—' : String(overall), 96, 128 + topo)
  ctx.fillStyle = '#7FA090'
  ctx.font = "600 20px Oswald, sans-serif"
  ctx.fillText('OVERALL', 96, 158 + topo)

  // pequena linha decorativa
  ctx.strokeStyle = 'rgba(127,160,144,0.35)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(52, 178 + topo)
  ctx.lineTo(140, 178 + topo)
  ctx.stroke()

  // a média 0–5 continua à vista — o overall é uma leitura extra
  ctx.fillStyle = '#7FA090'
  ctx.font = "600 18px Oswald, sans-serif"
  ctx.fillText(
    perfil.avg == null ? 'SEM NOTAS' : `MÉDIA ${Number(perfil.avg).toFixed(2)}`,
    96,
    202 + topo
  )

  // ---- foto (círculo) ----
  const cx = 340
  const cy = 210 + topo
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
  ctx.strokeStyle = corPrincipal
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
  ctx.fillText(nome, W / 2, 400 + topo)

  ctx.fillStyle = '#7FA090'
  ctx.font = "400 20px Inter, sans-serif"
  ctx.fillText(`@${perfil.user_id || ''}`, W / 2, 430 + topo)

  // separador
  ctx.strokeStyle = 'rgba(127,160,144,0.25)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(60, 466 + topo)
  ctx.lineTo(W - 60, 466 + topo)
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
  const rowY = [545 + topo, 668 + topo]
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
  ctx.fillStyle = corPrincipal
  ctx.font = "600 22px Oswald, sans-serif"
  ctx.textAlign = 'center'
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
