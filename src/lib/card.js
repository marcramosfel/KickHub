// Card do jogador estilo "Ultimate Team", desenhado em canvas (sem
// dependências) para poder ser partilhado como imagem no grupo.
//
// O DESENHO É O DE UM CARD DE FUTEBOL, e não uma ficha de estatísticas: o
// escudo, o overall e a POSIÇÃO em cima à esquerda, e os SEIS ATRIBUTOS em
// duas colunas de três.
//
// A versão anterior tinha um retângulo, o overall e seis contadores (jogos,
// gols, votos). Os números estavam certos, mas nenhum deles é o que faz um
// card parecer um card — e os atributos já existiam (`lib/attributes.js`) e
// já apareciam no ecrã. Só nunca tinham chegado à imagem.

import { calcularOverall } from './overall'
import { raridade } from './cards'
import { calcularAtributos, ehGoleiro } from './attributes'
import { estadoVisivel, etiquetaDoEstado } from './plantel'
import { nomeDaPosicao } from './positions'
import { ICONE } from './icones'
import fundoComum from '../assets/cards/comum.jpg'
import fundoEspecial from '../assets/cards/especial.jpg'
import fundoRaro from '../assets/cards/raro.jpg'
import fundoEpico from '../assets/cards/epico.jpg'
import fundoLendario from '../assets/cards/lendario.jpg'

// A textura de fundo de cada raridade.
//
// São ficheiros à parte (o Vite emite-os com hash, fora do bundle de JS), por
// isso só são descarregados quando alguém gera mesmo um card — quem nunca
// abre um card não paga nada por eles.
const FUNDO = {
  comum: fundoComum,
  especial: fundoEspecial,
  raro: fundoRaro,
  epico: fundoEpico,
  lendario: fundoLendario,
}

const W = 600
const H = 840
const SCALE = 2 // exporta a 2x para ficar nítido

// Emoji em canvas precisa de uma fonte que os tenha. A Oswald não tem, e sem
// estas alternativas ficava um retângulo vazio no lugar do ⚽.
const FONTE = (peso, tam, base = 'Oswald') =>
  `${peso} ${tam}px ${base}, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Arial Narrow', sans-serif`

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// A silhueta: cantos arredondados em cima, um bico raso em baixo.
//
// Raso de propósito. Um bico a sério (o do FIFA) deixa os últimos 100px com
// 80px de largura — e é aí que fica o rodapé, que não caberia lá. Assim
// lê-se como escudo e continua a haver sítio para escrever.
function escudo(ctx, x, y, w, h, r = 30) {
  const d = h * 0.075 // profundidade do bico
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - d - r)
  ctx.quadraticCurveTo(x + w, y + h - d, x + w - r * 1.6, y + h - d + r * 0.5)
  ctx.lineTo(x + w / 2, y + h)
  ctx.lineTo(x + r * 1.6, y + h - d + r * 0.5)
  ctx.quadraticCurveTo(x, y + h - d, x, y + h - d - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
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

// Escreve encolhendo a fonte até caber. Devolve o tamanho usado.
function ajustar(ctx, texto, maxLargura, peso, tamInicial, tamMinimo = 14) {
  let tam = tamInicial
  ctx.font = FONTE(peso, tam)
  while (ctx.measureText(texto).width > maxLargura && tam > tamMinimo) {
    tam -= 1
    ctx.font = FONTE(peso, tam)
  }
  return tam
}

// Desenha o card e devolve um data URL PNG.
//
// O que `perfil` aceita além dos números: `card` (o escolhido, de
// lib/cards.js — dá título, raridade e cores), `posicao` (a sigla),
// `atributos` (os seis de lib/attributes.js) e `estado` (lesionado, a
// viajar…). Tudo opcional: sem eles desenha-se o que houver.
export async function renderPlayerCard(perfil) {
  try {
    await document.fonts.ready
  } catch {
    /* segue com as fontes por defeito */
  }

  const card = perfil?.card || null
  const r = card ? raridade(card.raridade) : null

  // DUAS cores, e a distinção importa. `moldura.borda` foi escolhida para
  // desenhar uma borda sobre um fundo escuro, e há molduras (a do card base
  // é #1E3A2E) que são quase pretas: usá-la também no texto dava um card
  // ilegível, com o overall a desaparecer no fundo. A cor da RARIDADE é que
  // foi feita para se ler — é a que os chips do ecrã usam.
  const acento = r?.cor || '#34D058'
  const molduraCor = card?.moldura?.borda || '#34D058'
  const gk = ehGoleiro(perfil)

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)

  // ---- corpo ----
  const fundo = ctx.createLinearGradient(0, 0, 0, H)
  fundo.addColorStop(0, '#16382B')
  fundo.addColorStop(0.45, '#0C1D17')
  fundo.addColorStop(1, '#08130F')
  escudo(ctx, 10, 10, W - 20, H - 20)
  ctx.fillStyle = fundo
  ctx.fill()

  // ---- textura da raridade ----
  //
  // Recortada pelo escudo e por baixo de um véu que escurece de cima para
  // baixo. O véu não é decoração: os cristais são o mais claro da imagem e
  // ficam exatamente onde vai o overall e a foto. Sem ele, o número deixava
  // de se ler — e um card bonito que não se lê não serve para nada.
  const textura = await carregarImagem(FUNDO[card?.raridade || 'comum'])
  ctx.save()
  escudo(ctx, 10, 10, W - 20, H - 20)
  ctx.clip()

  if (textura) {
    const escalaT = Math.max(W / textura.width, H / textura.height)
    const tw = textura.width * escalaT
    const th = textura.height * escalaT
    ctx.globalAlpha = 0.5
    ctx.drawImage(textura, (W - tw) / 2, (H - th) / 2, tw, th)
    ctx.globalAlpha = 1

    const veu = ctx.createLinearGradient(0, 0, 0, H)
    veu.addColorStop(0, 'rgba(8,19,15,0.46)')
    veu.addColorStop(0.34, 'rgba(8,19,15,0.55)')
    // a partir daqui vêm o nome e os atributos: quase opaco
    veu.addColorStop(0.55, 'rgba(8,19,15,0.86)')
    veu.addColorStop(1, 'rgba(8,19,15,0.95)')
    ctx.fillStyle = veu
    ctx.fillRect(0, 0, W, H)
  }

  // Halo da cor da raridade: é o que separa um lendário de um comum sem ser
  // preciso escrever "lendário".
  const halo = ctx.createRadialGradient(W / 2, 150, 40, W / 2, 320, 460)
  halo.addColorStop(0, `${acento}2E`)
  halo.addColorStop(1, 'transparent')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  escudo(ctx, 10, 10, W - 20, H - 20)
  const borda = ctx.createLinearGradient(0, 0, W, H)
  borda.addColorStop(0, molduraCor)
  borda.addColorStop(0.5, acento)
  borda.addColorStop(1, molduraCor)
  ctx.strokeStyle = borda
  ctx.lineWidth = r && r.peso >= 4 ? 7 : 4
  ctx.stroke()

  // ---- faixa do título ----
  let topo = 40
  if (card) {
    roundRect(ctx, 30, 30, W - 60, 58, 20)
    ctx.fillStyle = acento
    ctx.fill()

    // A cor da raridade é sempre clara (foi feita para se ler sobre o fundo
    // escuro da app), por isso o texto por cima dela é sempre escuro.
    ctx.fillStyle = '#0A1512'
    ctx.textAlign = 'left'
    ctx.font = FONTE(700, 27)
    ctx.fillText(card.icon || '', 48, 69)

    ctx.textAlign = 'right'
    ctx.font = FONTE(600, 15)
    const rar = String(r?.nome || '').toUpperCase()
    ctx.fillText(rar, W - 48, 68)
    const larguraRaridade = ctx.measureText(rar).width

    ctx.textAlign = 'left'
    const titulo = String(card.titulo || '').toUpperCase()
    ajustar(ctx, titulo, W - 160 - larguraRaridade, 700, 26, 13)
    ctx.fillText(titulo, 90, 69)
    topo = 106
  }

  // ---- overall + posição: a coluna da esquerda, como no FIFA ----
  const { overall } = calcularOverall(perfil)
  const colX = 112
  ctx.textAlign = 'center'
  ctx.fillStyle = acento
  ctx.font = FONTE(700, 92)
  ctx.fillText(overall == null ? '—' : String(overall), colX, topo + 92)

  // O NOME da posição, não a sigla. A sigla de atacante é "ATA" — e "ATA" é
  // também o atributo de ataque, logo ali em baixo. O card ficava a dizer
  // ATA duas vezes, a significar coisas diferentes.
  ctx.fillStyle = '#EAF2EC'
  const posicao = String(perfil.posicao || '').toUpperCase()
  if (posicao) {
    ajustar(ctx, posicao, 168, 700, 26, 14)
    ctx.fillText(posicao, colX, topo + 130)
  }

  ctx.strokeStyle = `${acento}66`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(colX - 42, topo + 152)
  ctx.lineTo(colX + 42, topo + 152)
  ctx.stroke()

  ctx.fillStyle = '#7FA090'
  ctx.font = FONTE(600, 17)
  ctx.fillText(
    perfil.avg == null ? 'SEM NOTAS' : `MÉDIA ${Number(perfil.avg).toFixed(2)}`,
    colX,
    topo + 180
  )

  // ---- estado ----
  // 🟢 disponível é toda a gente e não vale um selo. Lesionado ou a viajar é
  // precisamente o que falta a quem olha para o card e quer saber se conta
  // com ele na sexta.
  if (perfil.estado?.mostrar) {
    // O emoji e o rótulo são medidos e desenhados SEPARADAMENTE, e o emoji
    // tem uma casa de largura fixa.
    //
    // Medir `"✈️ A VIAJAR"` de uma vez parecia funcionar — e funcionava no
    // Chrome. No Safari do iPhone o ✈️ sai do 'Apple Color Emoji', que
    // desenha mais largo do que o `measureText` tinha dito: a pílula ficava
    // curta e a borda cortava o texto ao meio ("A VIA|JAR").
    //
    // Medir um emoji é sempre uma aposta na fonte que o sistema vai escolher.
    // Assim só se mede texto latino, que é fiável, e o emoji vive numa casa
    // sua: se render mais largo do que a casa, encosta-se ao rótulo em vez de
    // rebentar a pílula.
    const CASA_EMOJI = 26
    const PADDING = 15
    const rotulo = String(perfil.estado.rotulo).toUpperCase()

    ctx.font = FONTE(600, 15)
    const largRotulo = ctx.measureText(rotulo).width
    const larg = PADDING + CASA_EMOJI + largRotulo + PADDING
    const x0 = colX - larg / 2
    const yPill = topo + 200

    roundRect(ctx, x0, yPill, larg, 30, 15)
    ctx.fillStyle = 'rgba(8,19,15,0.8)'
    ctx.fill()
    roundRect(ctx, x0, yPill, larg, 30, 15)
    ctx.strokeStyle = perfil.estado.cor || '#7FA090'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = perfil.estado.cor || '#7FA090'
    ctx.textAlign = 'center'
    ctx.fillText(perfil.estado.icone, x0 + PADDING + CASA_EMOJI / 2, yPill + 21)
    ctx.textAlign = 'left'
    ctx.fillText(rotulo, x0 + PADDING + CASA_EMOJI, yPill + 21)
    ctx.textAlign = 'center'
  }

  // ---- foto ----
  const cx = 390
  const cy = topo + 118
  const raio = 118
  const foto = await carregarImagem(perfil.photo)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, raio, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (foto) {
    const escala = Math.max((raio * 2) / foto.width, (raio * 2) / foto.height)
    const lw = foto.width * escala
    const lh = foto.height * escala
    ctx.drawImage(foto, cx - lw / 2, cy - lh / 2, lw, lh)
  } else {
    ctx.fillStyle = '#16261F'
    ctx.fillRect(cx - raio, cy - raio, raio * 2, raio * 2)
    ctx.fillStyle = '#7FA090'
    ctx.font = FONTE(700, 84)
    ctx.textAlign = 'center'
    ctx.fillText((perfil.name || '?').trim().charAt(0).toUpperCase(), cx, cy + 30)
  }
  ctx.restore()
  ctx.strokeStyle = acento
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, raio, 0, Math.PI * 2)
  ctx.stroke()

  // ---- nome ----
  const yNome = topo + 302
  ctx.textAlign = 'center'
  ctx.fillStyle = '#EAF2EC'
  const nome = (perfil.name || '').toUpperCase()
  ajustar(ctx, nome, W - 90, 700, 46, 22)
  ctx.fillText(nome, W / 2, yNome)

  if (perfil.user_id) {
    ctx.fillStyle = '#7FA090'
    ctx.font = FONTE(400, 19, 'Inter')
    ctx.fillText(`@${perfil.user_id}`, W / 2, yNome + 29)
  }

  ctx.strokeStyle = `${acento}44`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(70, yNome + 56)
  ctx.lineTo(W - 70, yNome + 56)
  ctx.stroke()

  // ---- os seis atributos, em duas colunas de três ----
  //
  // É este bloco que faz o card parecer um card. Um atributo sem dados
  // mostra "—": inventar um 50 seria dizer que o jogador é mediano quando o
  // que se passa é que ainda não se sabe.
  const atributos = (perfil.atributos || []).slice(0, 6)
  const yBase = yNome + 116
  const linhaAltura = 62
  const colunas = [W / 2 - 104, W / 2 + 104]
  atributos.forEach((a, i) => {
    const x = colunas[Math.floor(i / 3)]
    const y = yBase + (i % 3) * linhaAltura
    ctx.textAlign = 'right'
    ctx.fillStyle = a.valor == null ? '#3C5A4C' : '#EAF2EC'
    ctx.font = FONTE(700, 38)
    ctx.fillText(a.valor == null ? '—' : String(a.valor), x + 4, y)
    ctx.textAlign = 'left'
    ctx.fillStyle = acento
    ctx.font = FONTE(600, 24)
    ctx.fillText(a.id, x + 18, y)
  })

  if (atributos.length > 3) {
    ctx.strokeStyle = `${acento}33`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(W / 2, yBase - 32)
    ctx.lineTo(W / 2, yBase + 2 * linhaAltura + 12)
    ctx.stroke()
  }

  // ---- a fila dos números, com emoji ----
  // Os atributos dizem COMO ele joga; isto diz o que ele fez.
  const conta = []
  if (gk) {
    conta.push([ICONE.defesas, perfil.saves ?? 0])
    conta.push([ICONE.semSofrer, perfil.cleanSheets ?? 0])
  } else {
    conta.push([ICONE.gols, perfil.goals ?? 0])
    conta.push([ICONE.assistencias, perfil.assists ?? 0])
    if ((perfil.own_goals ?? 0) > 0) conta.push([ICONE.autogolos, perfil.own_goals])
  }
  conta.push([ICONE.craque, perfil.craques ?? 0])
  if ((perfil.bagres ?? 0) > 0) conta.push([ICONE.bagre, perfil.bagres])
  conta.push([ICONE.jogos, perfil.matches ?? 0])

  // Mesma regra da pílula do estado: casa de largura fixa para o emoji, e
  // só o número é medido. Aqui o erro não cortava nada — encolhia os espaços
  // entre os pares até eles se tocarem —, mas a causa é a mesma e não vale a
  // pena deixar duas formas de fazer isto no mesmo ficheiro.
  const yConta = yBase + 2 * linhaAltura + 60
  const CASA = 26
  const GAP = 5
  const ESPACO = 20
  ctx.font = FONTE(600, 22)
  const itens = conta.map(([ic, v]) => ({
    ic,
    v: String(v),
    largura: CASA + GAP + ctx.measureText(String(v)).width,
  }))
  const total =
    itens.reduce((a, b) => a + b.largura, 0) + ESPACO * (itens.length - 1)
  let xConta = (W - total) / 2
  ctx.fillStyle = '#EAF2EC'
  for (const item of itens) {
    ctx.textAlign = 'center'
    ctx.fillText(item.ic, xConta + CASA / 2, yConta)
    ctx.textAlign = 'left'
    ctx.fillText(item.v, xConta + CASA + GAP, yConta)
    xConta += item.largura + ESPACO
  }
  ctx.textAlign = 'center'

  // ---- rodapé ----
  ctx.textAlign = 'center'
  ctx.fillStyle = acento
  ctx.font = FONTE(600, 20)
  ctx.fillText('PELADA BROWNS', W / 2, H - 46)

  return canvas.toDataURL('image/png')
}

// O payload do card, a partir de um jogador já fundido (`juntarEstatisticas`).
//
// Existe para os dois sítios que geram a imagem — o modal e o perfil — não
// voltarem a divergir. Foi assim que o card escolhido deixou de aparecer no
// ranking: a mesma pergunta respondida em quatro sítios, com regras
// diferentes.
export function dadosDoCard({ jogador, card, totalRodadas = 0, perfil = null } = {}) {
  if (!jogador) return null
  const estado = etiquetaDoEstado(jogador.availabilityStatus)
  return {
    // os números vêm do perfil quando ele existe (tem o histórico completo),
    // senão da linha já fundida
    name: jogador.name,
    user_id: jogador.nickname || perfil?.user_id || '',
    photo: jogador.photo ?? perfil?.photo ?? null,
    avg: jogador.avg ?? perfil?.avg ?? null,
    votes: jogador.votes ?? perfil?.votes ?? 0,
    matches: jogador.matches ?? perfil?.matches ?? 0,
    goals: jogador.goals ?? perfil?.goals ?? 0,
    assists: jogador.assists ?? perfil?.assists ?? 0,
    own_goals: jogador.ownGoals ?? perfil?.own_goals ?? 0,
    craques: jogador.craques ?? perfil?.craques ?? 0,
    bagres: jogador.bagres ?? perfil?.bagres ?? 0,
    saves: jogador.saves ?? null,
    cleanSheets: jogador.cleanSheets ?? null,
    playerType: jogador.playerType,
    primaryPosition: jogador.primaryPosition,
    // o que o desenho novo acrescenta
    card,
    posicao: jogador.primaryPosition ? nomeDaPosicao(jogador.primaryPosition) : '',
    atributos: calcularAtributos(jogador, totalRodadas),
    estado: {
      mostrar: estadoVisivel(jogador.availabilityStatus),
      icone: estado.icone,
      rotulo: estado.rotulo,
      cor: TOM_DO_ESTADO[estado.tom] || '#7FA090',
    },
  }
}

// As mesmas cores que os chips do ecrã usam.
const TOM_DO_ESTADO = {
  ok: '#34D058',
  info: '#35A7FF',
  aviso: '#FFC531',
  erro: '#FF5A5A',
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
