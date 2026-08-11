// A Seleção da Pelada como imagem, para o grupo do WhatsApp.
//
// Composição própria e não uma fotografia do ecrã: a página é responsiva e
// muda de forma entre um telemóvel de 320px e um monitor, e uma captura
// herdava essa forma — mais a barra de navegação, o fundo da app e o que
// estivesse a meio de uma animação. Aqui o resultado é sempre o mesmo,
// 1080×1350, venha de onde vier.
//
// Mesmo modelo do `card.js` e do `share.js`: canvas puro, sem dependências.
// As fotos dos jogadores são data URLs guardadas na própria base, portanto
// desenhá-las não contamina o canvas e o `toDataURL` funciona.

import { POSITIONS, siglaDaPosicao } from './positions'
import { carregarImagem, roundRect } from './card'

// 1080×1350 é 4:5 — o retrato que o WhatsApp mostra inteiro na conversa sem
// recortar, e que serve igualmente para o Instagram.
const W = 1080
const H = 1350
const PAD = 56

// Geometria, herdada do pôster do ecrã e com a mesma justificação.
//
// As filas do 2-3-1 dão duas distâncias apertadas: GK↔DEF (20% da largura,
// 20% da altura) e ala↔DEF (13% da largura, 27% da altura).
//
// Aqui o campo é MAIS LARGO do que alto (968×936), ao contrário do ecrã, e por
// isso o par que manda é outro: com 968px de largura, os 20% que separam o
// goleiro dos defesas são 194px — muito mais do que os 131px do cartão —
// portanto esse par resolve-se sozinho na horizontal. Quem fixa o tamanho do
// cartão é o ala↔DEF: 27% de 936 = 253px, e o cartão inteiro (foto 164 + texto
// 79 = 243px) tem de caber lá.
//
// Verificado por cálculo e não a olho: o `GEOMETRIA` exportado no fim do
// ficheiro existe para se poder repetir essa conta de fora.
const CAMPO = { x: PAD, y: 214, w: W - PAD * 2, h: 936 }
const CARTAO_W = Math.round(CAMPO.w * 0.135) // 131px — cabe nos 253px com folga
const FOTO_H = Math.round(CARTAO_W * 1.25) // retrato 4/5, como no ecrã
// Altura do bloco de texto por baixo da foto (folga + nome + posição + stat).
// Sai daqui e não de números soltos porque entra na conta das colisões.
const TEXTO_H = 6 + 30 + 22 + 21

// Linhas de base do cabeçalho.
//
// O título desce mais do que parece preciso por causa do til do Ã de
// "SELEÇÃO": ele sobe acima da altura das maiúsculas e, com o título a 148,
// entrava por cima do "PELADA BROWNS". O subtítulo desce pela razão simétrica
// — a cedilha do Ç desce abaixo da linha de base.
const Y_MARCA = 66
const Y_TITULO = 158
const Y_SUB = 202

const AZUL = '#0b1734'
const AZUL_FUNDO = '#060b1d'
const LINHA = 'rgba(90,200,255,0.45)'
const CYAN = 'rgba(120,195,255,0.95)'
const OURO = '#FFC531'

const FONTE = (peso, tam) =>
  `${peso} ${tam}px Oswald, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Arial Narrow', sans-serif`

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

// Encolhe até caber. Devolve o tamanho usado.
function ajustar(ctx, texto, maxW, peso, tamInicial, tamMinimo = 12) {
  let t = tamInicial
  ctx.font = FONTE(peso, t)
  while (ctx.measureText(texto).width > maxW && t > tamMinimo) {
    t -= 1
    ctx.font = FONTE(peso, t)
  }
  return t
}

// `letterSpacing` do canvas não existe em toda a parte; onde não existir o
// texto sai sem espaçamento em vez de rebentar.
function comEspacamento(ctx, px, fn) {
  const antes = ctx.letterSpacing
  try {
    ctx.letterSpacing = `${px}px`
  } catch {
    /* browser antigo: segue sem espaçamento */
  }
  fn()
  try {
    ctx.letterSpacing = antes ?? '0px'
  } catch {
    /* idem */
  }
}

// A foto recortada como `object-fit: cover`, dentro de um retângulo redondo.
function fotoCover(ctx, img, x, y, w, h, r) {
  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.clip()
  const escala = Math.max(w / img.width, h / img.height)
  const lw = img.width * escala
  const lh = img.height * escala
  ctx.drawImage(img, x + (w - lw) / 2, y + (h - lh) / 2, lw, lh)
  ctx.restore()
}

function iniciaisDe(nome) {
  return (nome || '?')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// As linhas do campo. Só linhas: a relva competia com as fotos, que são o que
// esta imagem tem para mostrar.
function desenharCampo(ctx, { x, y, w, h }) {
  const brilho = ctx.createLinearGradient(0, y, 0, y + h)
  brilho.addColorStop(0, 'rgba(53,167,255,0.16)')
  brilho.addColorStop(0.55, 'rgba(53,167,255,0.03)')
  brilho.addColorStop(1, 'rgba(53,167,255,0)')
  ctx.fillStyle = brilho
  roundRect(ctx, x, y, w, h, 18)
  ctx.fill()

  ctx.strokeStyle = LINHA
  ctx.lineWidth = 2.5
  const m = 14
  roundRect(ctx, x + m, y + m, w - m * 2, h - m * 2, 6)
  ctx.stroke()

  // meio-campo
  ctx.beginPath()
  ctx.moveTo(x + m, y + h / 2)
  ctx.lineTo(x + w - m, y + h / 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x + w / 2, y + h / 2, w * 0.115, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x + w / 2, y + h / 2, 4, 0, Math.PI * 2)
  ctx.fillStyle = LINHA
  ctx.fill()

  // grandes áreas e balizas, em cima e em baixo
  const areaW = w * 0.44
  const areaH = h * 0.14
  const balizaW = w * 0.2
  const balizaH = h * 0.055
  ctx.strokeStyle = LINHA
  ;[
    [y + m, 1],
    [y + h - m - areaH, 1],
  ].forEach(([ay]) => {
    ctx.strokeRect(x + (w - areaW) / 2, ay, areaW, areaH)
  })
  ctx.strokeRect(x + (w - balizaW) / 2, y + m, balizaW, balizaH)
  ctx.strokeRect(x + (w - balizaW) / 2, y + h - m - balizaH, balizaW, balizaH)
}

// A estatística de destaque, igual à do pôster do ecrã.
function destaqueDe(j) {
  const gols = num(j.goals)
  const assist = num(j.assists)
  const vit = num(j.wins)
  const jogos = num(j.matches)
  if (j.slot === 'GK') return jogos ? `${jogos} jogos` : ''
  if (gols) return `${gols} ${gols === 1 ? 'gol' : 'gols'}`
  if (assist) return `${assist} assist.`
  if (vit) return `${vit} ${vit === 1 ? 'vitória' : 'vitórias'}`
  return jogos ? `${jogos} jogos` : ''
}

function desenharJogador(ctx, jogador, foto, { mvp }) {
  const p = POSITIONS.find((x) => x.id === jogador.slot)
  if (!p) return

  const cx = CAMPO.x + (p.x / 100) * CAMPO.w
  const cy = CAMPO.y + (p.y / 100) * CAMPO.h
  const total = FOTO_H + TEXTO_H
  const x = Math.round(cx - CARTAO_W / 2)
  let y = Math.round(cy - total / 2)

  // moldura
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 5
  ctx.fillStyle = '#0c1c3c'
  roundRect(ctx, x, y, CARTAO_W, FOTO_H, 12)
  ctx.fill()
  ctx.restore()

  if (foto) {
    fotoCover(ctx, foto, x, y, CARTAO_W, FOTO_H, 12)
  } else {
    ctx.fillStyle = 'rgba(200,225,250,0.9)'
    ctx.textAlign = 'center'
    ctx.font = FONTE(700, 44)
    ctx.fillText(iniciaisDe(jogador.name), x + CARTAO_W / 2, y + FOTO_H / 2 + 15)
  }

  ctx.strokeStyle = mvp ? OURO : 'rgba(120,200,255,0.45)'
  ctx.lineWidth = mvp ? 3 : 1.6
  roundRect(ctx, x, y, CARTAO_W, FOTO_H, 12)
  ctx.stroke()

  // overall, no canto de baixo da foto
  const overall = jogador.slot === 'GK' ? (jogador.gkOverall ?? jogador.overall) : jogador.overall
  if (overall != null) {
    const txt = String(Math.round(overall))
    ctx.font = FONTE(800, 22)
    const larg = Math.max(38, ctx.measureText(txt).width + 16)
    const bx = x + CARTAO_W - larg - 6
    const by = y + FOTO_H - 34
    ctx.fillStyle = 'rgba(6,19,13,0.86)'
    roundRect(ctx, bx, by, larg, 28, 7)
    ctx.fill()
    ctx.strokeStyle = 'rgba(120,200,255,0.5)'
    ctx.lineWidth = 1.2
    roundRect(ctx, bx, by, larg, 28, 7)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText(txt, bx + larg / 2, by + 21)
  }

  // coroa do craque, assente na borda de cima
  if (mvp) {
    ctx.font = FONTE(400, 34)
    ctx.textAlign = 'center'
    ctx.fillText('👑', x + CARTAO_W / 2, y - 4)
  }

  y += FOTO_H + 6

  ctx.textAlign = 'center'
  ctx.fillStyle = '#fff'
  const tamNome = ajustar(ctx, jogador.name, CARTAO_W + 26, 700, 26, 14)
  ctx.font = FONTE(700, tamNome)
  ctx.fillText(jogador.name, x + CARTAO_W / 2, y + 23)
  y += 30

  ctx.fillStyle = CYAN
  ctx.font = FONTE(700, 18)
  ctx.fillText(siglaDaPosicao(jogador.slot), x + CARTAO_W / 2, y + 16)
  y += 22

  const destaque = destaqueDe(jogador)
  if (destaque) {
    ctx.fillStyle = 'rgba(225,235,250,0.72)'
    ctx.font = FONTE(600, 17)
    ctx.fillText(destaque, x + CARTAO_W / 2, y + 15)
  }
}

function desenharNumeros(ctx, numeros, y) {
  const caixas = [
    ['OVERALL MÉDIO', numeros.media ?? '—'],
    ['GOLS', numeros.gols],
    ['ASSISTÊNCIAS', numeros.assistencias],
    ['VITÓRIAS', numeros.vitorias],
  ]
  const gap = 14
  const larg = (CAMPO.w - gap * (caixas.length - 1)) / caixas.length
  const alt = 86

  caixas.forEach(([rotulo, valor], i) => {
    const x = CAMPO.x + i * (larg + gap)
    ctx.fillStyle = 'rgba(255,255,255,0.045)'
    roundRect(ctx, x, y, larg, alt, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(90,200,255,0.16)'
    ctx.lineWidth = 1.2
    roundRect(ctx, x, y, larg, alt, 12)
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(140,190,240,0.85)'
    const t = ajustar(ctx, rotulo, larg - 16, 600, 16, 10)
    ctx.font = FONTE(600, t)
    comEspacamento(ctx, 1, () => ctx.fillText(rotulo, x + larg / 2, y + 28))

    ctx.fillStyle = '#fff'
    ctx.font = FONTE(800, 38)
    ctx.fillText(String(valor), x + larg / 2, y + 70)
  })
}

// Desenha a seleção e devolve um data URL PNG de 1080×1350.
//
// `numeros` chega de fora (do `SelecaoPoster`) para a imagem e o ecrã dizerem
// exatamente o mesmo: duas contas separadas eram duas contas para divergir.
// Exposto para o teste de colisoes: a verificacao usa a MESMA geometria que
// o desenho, senao estava a validar outra imagem.
export const GEOMETRIA = { W, H, CAMPO, CARTAO_W, FOTO_H, TEXTO_H }

export async function renderSelecaoImagem({
  selecao,
  numeros,
  titulo = 'SELEÇÃO DA PELADA',
  subtitulo = '',
  marca = 'PELADA BROWNS',
} = {}) {
  try {
    await document.fonts.ready
  } catch {
    /* segue com as fontes por defeito */
  }

  const lineup = selecao?.lineup || []
  const fotos = await Promise.all(lineup.map((j) => carregarImagem(j.photo)))

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // fundo: azul muito escuro com uma luz no topo, como o pôster do ecrã
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, AZUL)
  bg.addColorStop(0.55, '#081029')
  bg.addColorStop(1, AZUL_FUNDO)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const luz = ctx.createRadialGradient(W / 2, -40, 0, W / 2, -40, W * 0.85)
  luz.addColorStop(0, 'rgba(53,167,255,0.22)')
  luz.addColorStop(1, 'rgba(53,167,255,0)')
  ctx.fillStyle = luz
  ctx.fillRect(0, 0, W, H * 0.6)

  ctx.strokeStyle = 'rgba(90,200,255,0.22)'
  ctx.lineWidth = 3
  roundRect(ctx, 8, 8, W - 16, H - 16, 26)
  ctx.stroke()

  // ---- cabeçalho ----
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(140,190,240,0.8)'
  ctx.font = FONTE(700, 24)
  comEspacamento(ctx, 6, () => ctx.fillText(marca.toUpperCase(), W / 2, Y_MARCA))

  ctx.fillStyle = '#fff'
  const tamTitulo = ajustar(ctx, titulo.toUpperCase(), W - PAD * 2, 800, 82, 40)
  ctx.font = FONTE(800, tamTitulo)
  ctx.fillText(titulo.toUpperCase(), W / 2, Y_TITULO)

  if (subtitulo) {
    ctx.fillStyle = OURO
    ctx.font = FONTE(700, 26)
    comEspacamento(ctx, 4, () => ctx.fillText(subtitulo.toUpperCase(), W / 2, Y_SUB))
  }

  // ---- campo e jogadores ----
  desenharCampo(ctx, CAMPO)
  lineup.forEach((j, i) => {
    desenharJogador(ctx, j, fotos[i], { mvp: numeros?.craqueId === j.id && j.slot !== 'GK' })
  })

  // ---- números ----
  if (numeros) desenharNumeros(ctx, numeros, 1212)

  // ---- rodapé ----
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(140,190,240,0.6)'
  ctx.font = FONTE(600, 19)
  const decisivo = numeros?.decisivo?.name
  comEspacamento(ctx, 2, () =>
    ctx.fillText(
      decisivo ? `MAIS DECISIVO: ${decisivo.toUpperCase()}` : marca.toUpperCase(),
      W / 2,
      1330
    )
  )

  // JPEG e não PNG: medido nesta composição, o PNG dava 1331 KB e o JPEG a
  // 0.92 dá 204 KB — seis vezes e meia menos, sem diferença visível. São fotos
  // e gradientes, que é onde o JPEG ganha; num cartaz de linhas e texto chapado
  // a escolha seria a contrária.
  // WebP dava ainda menos (102 KB) mas o WhatsApp trata ficheiros .webp de
  // forma inconsistente — às vezes como autocolante — e isto existe para ir
  // para o grupo.
  return canvas.toDataURL('image/jpeg', 0.92)
}
