// Um jogo simulado como imagem, para o grupo do WhatsApp.
//
// Serve as Curiosidades (o melhor jogo possível, o Duelo dos Perebas) e o
// Simulador — são todos a mesma coisa: duas equipas, um placar e quem fez o
// quê. Um renderizador só evita três artes ligeiramente diferentes.
//
// Mesmo modelo do `selecaoImagem.js`: canvas puro, 1080×1350, e as fotos são
// data URLs guardadas na própria base, portanto não contaminam o canvas.

import { carregarImagem, roundRect } from './card'
import { siglaDaPosicao } from './positions'

const W = 1080
const H = 1350
const PAD = 56

const AZUL = '#0b1734'
const OURO = '#FFC531'
const CYAN = 'rgba(120,195,255,0.95)'

const FONTE = (peso, tam) =>
  `${peso} ${tam}px Oswald, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Arial Narrow', sans-serif`

function ajustar(ctx, texto, maxW, peso, tamInicial, tamMinimo = 11) {
  let t = tamInicial
  ctx.font = FONTE(peso, t)
  while (ctx.measureText(texto).width > maxW && t > tamMinimo) {
    t -= 1
    ctx.font = FONTE(peso, t)
  }
  return t
}

function comEspacamento(ctx, px, fn) {
  const antes = ctx.letterSpacing
  try {
    ctx.letterSpacing = `${px}px`
  } catch {
    /* browser antigo */
  }
  fn()
  try {
    ctx.letterSpacing = antes ?? '0px'
  } catch {
    /* idem */
  }
}

function fotoCover(ctx, img, x, y, w, h, r) {
  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.clip()
  const escala = Math.max(w / img.width, h / img.height)
  ctx.drawImage(img, x + (w - img.width * escala) / 2, y + (h - img.height * escala) / 2,
    img.width * escala, img.height * escala)
  ctx.restore()
}

const iniciais = (nome) =>
  (nome || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()

// Quebra um texto em linhas que cabem em maxW.
function quebrar(ctx, texto, maxW) {
  const palavras = String(texto || '').split(/\s+/)
  const linhas = []
  let atual = ''
  for (const p of palavras) {
    const t = atual ? `${atual} ${p}` : p
    if (ctx.measureText(t).width <= maxW || !atual) atual = t
    else {
      linhas.push(atual)
      atual = p
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

// Uma equipa em coluna: foto pequena, nome, posição e overall.
function desenharEquipa(ctx, { lineup, fotos, x, largura, y, cor, nome, golos }) {
  ctx.textAlign = 'center'
  ctx.fillStyle = cor
  const t = ajustar(ctx, nome.toUpperCase(), largura, 700, 26, 14)
  ctx.font = FONTE(700, t)
  ctx.fillText(nome.toUpperCase(), x + largura / 2, y)

  ctx.fillStyle = '#fff'
  ctx.font = FONTE(800, 54)
  ctx.fillText(String(golos), x + largura / 2, y + 60)

  let linha = y + 100
  const alturaLinha = 62
  const foto = 46

  lineup.forEach((j, i) => {
    const fy = linha + 6
    const img = fotos[i]
    if (img) {
      fotoCover(ctx, img, x, fy, foto, foto, 9)
    } else {
      ctx.fillStyle = '#16305c'
      roundRect(ctx, x, fy, foto, foto, 9)
      ctx.fill()
      ctx.fillStyle = 'rgba(200,225,250,0.9)'
      ctx.textAlign = 'center'
      ctx.font = FONTE(700, 18)
      ctx.fillText(iniciais(j.name), x + foto / 2, fy + foto / 2 + 7)
    }
    ctx.strokeStyle = 'rgba(120,200,255,0.35)'
    ctx.lineWidth = 1.2
    roundRect(ctx, x, fy, foto, foto, 9)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff'
    const tx = x + foto + 12
    const maxNome = largura - foto - 12 - 44
    const tn = ajustar(ctx, j.name, maxNome, 600, 22, 12)
    ctx.font = FONTE(600, tn)
    ctx.fillText(j.name, tx, fy + 21)

    ctx.fillStyle = CYAN
    ctx.font = FONTE(600, 15)
    ctx.fillText(siglaDaPosicao(j.slot), tx, fy + 41)

    const ovr = j.slot === 'GK' ? (j.gkOverall ?? j.overall) : j.overall
    if (ovr != null) {
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(225,235,250,0.85)'
      ctx.font = FONTE(800, 22)
      ctx.fillText(String(Math.round(ovr)), x + largura, fy + 30)
    }

    linha += alturaLinha
  })

  return linha
}

function barras(ctx, prob, { x, y, largura, nomeA, nomeB }) {
  const linhas = [
    [nomeA, prob.a, '#8A96A0'],
    ['Empate', prob.empate, 'rgba(140,190,240,0.8)'],
    [nomeB, prob.b, '#F2F5F2'],
  ]
  let yy = y
  for (const [rotulo, valor, cor] of linhas) {
    const pct = Math.round((valor ?? 0) * 100)
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(200,225,250,0.85)'
    ctx.font = FONTE(600, 18)
    ctx.fillText(rotulo, x, yy + 14)

    const bx = x + 210
    const bw = largura - 210 - 70
    ctx.fillStyle = 'rgba(255,255,255,0.09)'
    roundRect(ctx, bx, yy, bw, 16, 8)
    ctx.fill()
    ctx.fillStyle = cor
    roundRect(ctx, bx, yy, Math.max(4, (bw * pct) / 100), 16, 8)
    ctx.fill()

    ctx.textAlign = 'right'
    ctx.fillStyle = '#fff'
    ctx.font = FONTE(700, 18)
    ctx.fillText(`${pct}%`, x + largura, yy + 14)
    yy += 30
  }
  return yy
}

// Desenha um jogo simulado e devolve um data URL JPEG.
//
// JPEG e não PNG pela mesma razão do pôster da seleção: são fotos e
// gradientes, e o PNG dava seis vezes mais bytes sem diferença visível.
export async function renderJogoImagem({
  simulacao,
  lineupA = [],
  lineupB = [],
  titulo = 'Jogo simulado',
  subtitulo = '',
  marca = 'PELADA BROWNS',
} = {}) {
  try {
    await document.fonts.ready
  } catch {
    /* segue com as fontes por defeito */
  }
  if (!simulacao) return null

  const fotosA = await Promise.all(lineupA.map((j) => carregarImagem(j.photo)))
  const fotosB = await Promise.all(lineupB.map((j) => carregarImagem(j.photo)))

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, AZUL)
  bg.addColorStop(0.55, '#081029')
  bg.addColorStop(1, '#060b1d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const luz = ctx.createRadialGradient(W / 2, -40, 0, W / 2, -40, W * 0.85)
  luz.addColorStop(0, 'rgba(53,167,255,0.2)')
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
  ctx.font = FONTE(700, 22)
  comEspacamento(ctx, 6, () => ctx.fillText(marca.toUpperCase(), W / 2, 64))

  ctx.fillStyle = '#fff'
  // O til e a cedilha dos títulos portugueses sobem e descem mais do que a
  // caixa alta sugere — daí a folga entre estas três linhas de base.
  const tt = ajustar(ctx, titulo.toUpperCase(), W - PAD * 2, 800, 62, 30)
  ctx.font = FONTE(800, tt)
  ctx.fillText(titulo.toUpperCase(), W / 2, 136)

  if (subtitulo) {
    ctx.fillStyle = OURO
    ctx.font = FONTE(700, 22)
    comEspacamento(ctx, 3, () => ctx.fillText(subtitulo.toUpperCase(), W / 2, 176))
  }

  // ---- placar ----
  ctx.fillStyle = '#fff'
  ctx.font = FONTE(800, 96)
  ctx.textAlign = 'center'
  ctx.fillText(`${simulacao.golosA} × ${simulacao.golosB}`, W / 2, 280)

  // ---- probabilidades ----
  let y = barras(ctx, simulacao.probabilidades, {
    x: PAD,
    y: 320,
    largura: W - PAD * 2,
    nomeA: simulacao.nomeA,
    nomeB: simulacao.nomeB,
  })

  // ---- as duas equipas, lado a lado ----
  const col = (W - PAD * 2 - 40) / 2
  desenharEquipa(ctx, {
    lineup: lineupA, fotos: fotosA, x: PAD, largura: col, y: y + 46,
    cor: '#B9C4CC', nome: simulacao.nomeA, golos: simulacao.golosA,
  })
  const fimB = desenharEquipa(ctx, {
    lineup: lineupB, fotos: fotosB, x: PAD + col + 40, largura: col, y: y + 46,
    cor: '#F2F5F2', nome: simulacao.nomeB, golos: simulacao.golosB,
  })

  // ---- destaques ----
  y = Math.max(fimB + 24, 1120)
  ctx.textAlign = 'center'
  const linhas = []
  const lista = (arr) =>
    arr.map((x) => `${x.name}${x.total > 1 ? ` (${x.total})` : ''}`).join(', ')
  const gols = [...simulacao.marcadores.a, ...simulacao.marcadores.b]
  if (gols.length) linhas.push(`⚽ ${lista(gols)}`)
  const destaques = []
  if (simulacao.craque) destaques.push(`⭐ ${simulacao.craque.name}`)
  if (simulacao.melhorGoleiro) destaques.push(`🧤 ${simulacao.melhorGoleiro.name}`)
  if (destaques.length) linhas.push(destaques.join('   '))

  ctx.font = FONTE(600, 20)
  for (const l of linhas) {
    for (const parte of quebrar(ctx, l, W - PAD * 2)) {
      ctx.fillStyle = 'rgba(225,235,250,0.9)'
      ctx.font = FONTE(600, 20)
      ctx.fillText(parte, W / 2, y)
      y += 27
    }
  }

  // ---- rodapé ----
  ctx.fillStyle = 'rgba(140,190,240,0.55)'
  ctx.font = FONTE(600, 17)
  comEspacamento(ctx, 1, () =>
    ctx.fillText('Simulação — não decide nada', W / 2, H - 34)
  )

  return canvas.toDataURL('image/jpeg', 0.92)
}

// A tabela do campeonatinho como imagem.
export async function renderCampeonatoImagem({ campeonato, marca = 'PELADA BROWNS' } = {}) {
  try {
    await document.fonts.ready
  } catch {
    /* segue */
  }
  if (!campeonato?.completo) return null

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, AZUL)
  bg.addColorStop(1, '#060b1d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(90,200,255,0.22)'
  ctx.lineWidth = 3
  roundRect(ctx, 8, 8, W - 16, H - 16, 26)
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(140,190,240,0.8)'
  ctx.font = FONTE(700, 22)
  comEspacamento(ctx, 6, () => ctx.fillText(marca.toUpperCase(), W / 2, 64))
  ctx.fillStyle = '#fff'
  ctx.font = FONTE(800, 60)
  ctx.fillText('CAMPEONATINHO', W / 2, 136)

  // campeão
  ctx.fillStyle = OURO
  ctx.font = FONTE(700, 26)
  comEspacamento(ctx, 3, () => ctx.fillText('CAMPEÃO', W / 2, 200))
  ctx.fillStyle = '#fff'
  ctx.font = FONTE(800, 68)
  ctx.fillText(campeonato.campeao.nome.toUpperCase(), W / 2, 268)
  ctx.fillStyle = 'rgba(200,225,250,0.8)'
  ctx.font = FONTE(600, 22)
  ctx.fillText(
    `Final: ${campeonato.final.nomeA} ${campeonato.final.golosA}–${campeonato.final.golosB} ${campeonato.final.nomeB}`,
    W / 2, 310
  )

  // tabela
  let y = 400
  const cols = ['J', 'V', 'E', 'D', 'GM', 'GS', 'PTS']
  const x0 = PAD
  const largura = W - PAD * 2
  const colX = cols.map((_, i) => x0 + largura - 60 - (cols.length - 1 - i) * 78)

  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(140,190,240,0.8)'
  ctx.font = FONTE(600, 18)
  ctx.fillText('EQUIPA', x0, y)
  ctx.textAlign = 'center'
  cols.forEach((c, i) => ctx.fillText(c, colX[i], y))
  y += 16

  for (const l of campeonato.tabela) {
    ctx.strokeStyle = 'rgba(90,200,255,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + largura, y)
    ctx.stroke()
    y += 44

    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff'
    ctx.font = FONTE(700, 26)
    ctx.fillText(l.nome, x0, y)
    ctx.textAlign = 'center'
    ctx.font = FONTE(600, 24)
    ctx.fillStyle = 'rgba(225,235,250,0.9)'
    ;[l.j, l.v, l.e, l.d, l.gm, l.gs, l.pts].forEach((v, i) => {
      ctx.fillStyle = i === 6 ? '#fff' : 'rgba(225,235,250,0.9)'
      ctx.font = FONTE(i === 6 ? 800 : 600, 24)
      ctx.fillText(String(v), colX[i], y)
    })
    y += 14
  }

  // prémios
  y += 60
  const p = campeonato.premios
  const premios = [
    ['⚽ Artilheiro', p.artilheiro],
    ['🎯 Assistências', p.reiDasAssistencias],
    ['👑 Melhor jogador', p.melhorJogador],
  ].filter(([, v]) => v)

  ctx.textAlign = 'center'
  for (const [rotulo, v] of premios) {
    ctx.fillStyle = 'rgba(140,190,240,0.8)'
    ctx.font = FONTE(600, 20)
    ctx.fillText(rotulo, W / 2, y)
    ctx.fillStyle = '#fff'
    ctx.font = FONTE(700, 30)
    ctx.fillText(`${v.name} — ${v.total}`, W / 2, y + 36)
    y += 84
  }

  ctx.fillStyle = 'rgba(140,190,240,0.55)'
  ctx.font = FONTE(600, 17)
  comEspacamento(ctx, 1, () => ctx.fillText('Simulação — não decide nada', W / 2, H - 34))

  return canvas.toDataURL('image/jpeg', 0.92)
}
