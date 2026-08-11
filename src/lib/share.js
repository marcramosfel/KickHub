// Partilhar o resumo de uma rodada no grupo: como texto pronto a colar
// ou como imagem (canvas, sem dependências — mesmo modelo do card.js).

import { APP_NAME } from '../config'
import { carregarImagem, roundRect } from './card'
import { formatarDataDoJogo } from './countdown'
import { nomeDaEquipa, vantagem } from './substitutions'
import { prazoLegivel } from './voting'
import { assisters, awardWinners, formatDia, matchWinner, scorers } from './format'

// "Marcos Felipe (2), Wallace" — o número só aparece quando é mais que 1.
const listaComContagem = (lista, campo) =>
  lista.map((p) => (Number(p[campo]) > 1 ? `${p.name} (${p[campo]})` : p.name)).join(', ')

// ---------- TEXTO ----------

// Resumo pronto a colar no WhatsApp.
export function resumoRodada(m) {
  if (!m) return ''
  const win = matchWinner(m)
  const gols = scorers(m)
  const assist = assisters(m)
  const craque = awardWinners(m.craque)
  const bagre = awardWinners(m.bagre)

  const linhas = [
    `🏆 ${APP_NAME.main} ${APP_NAME.accent} — ${formatDia(m.played_at)}`,
    '',
    `${m.team_a_name || 'Time A'} ${m.score_a ?? 0} x ${m.score_b ?? 0} ${m.team_b_name || 'Time B'}`,
    win.isDraw ? '🤝 Empate' : `🥇 Venceu: ${win.name}`,
    '',
  ]

  if (gols.length) linhas.push(`⚽ Gols: ${listaComContagem(gols, 'goals')}`)
  if (assist.length) linhas.push(`🅰️ Assistências: ${listaComContagem(assist, 'assists')}`)
  if (gols.length || assist.length) linhas.push('')

  if (craque) linhas.push(`👑 Craque da rodada: ${craque.names} (${craque.votes} votos)`)
  if (bagre) linhas.push(`🐟 Bagre da rodada: ${bagre.names} (${bagre.votes} votos)`)
  if (m.notes) {
    linhas.push('')
    linhas.push(`📝 ${m.notes}`)
  }

  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// A ordem do rodízio de uma equipa, em texto: "🧤 João → Pedro → Rui".
// Devolve '' quando o jogo não tem rodízio — quem chama não precisa de saber
// em que formato está.
export function ordemDoRodizioTexto(jogo, lado) {
  if (jogo?.gk_mode !== 'ROTATING') return ''
  const fila = (jogo.lineup || [])
    .filter((l) => l.team === lado && l.gk_order != null)
    .sort((a, b) => a.gk_order - b.gk_order)
  if (fila.length < 2) return ''
  return fila.map((l, i) => (i === 0 ? `🧤 ${l.name}` : l.name)).join(' → ')
}

// Escalação do sorteio pronta a colar no WhatsApp. `resenha` (opcional) vai
// no fim, uma frase por linha.
export function resumoSorteio(jogo, resenha = '') {
  if (!jogo) return ''
  const d = formatarDataDoJogo(jogo.kickoff_at)
  const rodizio = jogo.gk_mode === 'ROTATING'
  const lados = { A: [], B: [] }
  for (const l of jogo.lineup || []) {
    if (l.team !== 'A' && l.team !== 'B') continue
    // No rodízio, o 🧤 diz "começa no gol" e não "é o goleiro" — a diferença
    // importa a quem lê o texto no grupo sem abrir a app.
    lados[l.team].push(`${l.is_goalkeeper ? '🧤 ' : ''}${l.name}`)
  }
  const v = vantagem(jogo.team_a_overall, jogo.team_b_overall)

  const linhas = [
    `🎲 ${APP_NAME.main} ${APP_NAME.accent} — Sorteio`,
    d.hora ? `📅 ${d.diaDaSemana}, ${d.data} às ${d.hora}` : '',
    jogo.location ? `📍 ${jogo.location}` : '',
    '',
    `${nomeDaEquipa('A')}${jogo.team_a_overall ? ` (${jogo.team_a_overall})` : ''}`,
    ...lados.A.map((n) => `• ${n}`),
    '',
    `${nomeDaEquipa('B')}${jogo.team_b_overall ? ` (${jogo.team_b_overall})` : ''}`,
    ...lados.B.map((n) => `• ${n}`),
    '',
    v.nivel !== 'desconhecido'
      ? `⚖️ Equilíbrio: ${v.rotulo} (${v.pct.toFixed(1)}%)${v.lado ? ` · ${v.texto}` : ''}`
      : '',
  ]

  if (rodizio) {
    const minutos = jogo.gk_rotation_minutes
    linhas.push(
      '',
      `🔄 Goleiro rotativo${minutos ? ` — troca a cada ${minutos} min` : ''}`,
      ...['A', 'B']
        .map((lado) => {
          const ordem = ordemDoRodizioTexto(jogo, lado)
          return ordem ? `${nomeDaEquipa(lado)}: ${ordem}` : ''
        })
        .filter(Boolean)
    )
  }

  if (resenha) {
    linhas.push('', resenha)
  }
  return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------- convite para votar ----------
//
// A mensagem que o admin cola no grupo quando encerra o jogo. É o objeto
// mais importante deste redesenho: é ela que leva o link direto à cédula, e
// era exatamente ela que não existia — o link não existia de todo.
export function mensagemDeVotacao(jogo, url) {
  if (!jogo) return ''
  const a = jogo.team_a_name || nomeDaEquipa('A')
  const b = jogo.team_b_name || nomeDaEquipa('B')
  const placar =
    jogo.score_a == null || jogo.score_b == null
      ? ''
      : `${a} ${jogo.score_a} x ${jogo.score_b} ${b}`
  const prazo = prazoLegivel(jogo.voting_deadline)

  return [
    '⚽ O jogo terminou!',
    placar,
    '',
    'Agora é hora de votar:',
    '⭐ Avalia quem jogou contigo',
    '👑 Craque do jogo',
    '😂 Bagre do jogo',
    '',
    prazo ? `⏰ A votação encerra ${prazo}.` : '',
    'Leva menos de um minuto.',
    '',
    url ? `👉 ${url}` : '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Lembrete a meio do prazo, com os nomes de quem falta. Sai do painel do
// admin ("lembrar quem falta") já pronto a colar.
export function mensagemDeLembrete(jogo, url, quemFalta = []) {
  const prazo = prazoLegivel(jogo?.voting_deadline)
  const nomes = (quemFalta || []).map((p) => p.name).filter(Boolean)
  return [
    '🗳️ Falta o voto de alguns!',
    nomes.length ? `Ainda não votaram: ${nomes.join(', ')}.` : '',
    prazo ? `⏰ Fecha ${prazo}.` : '',
    '',
    url ? `👉 ${url}` : '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Partilha nativa (telemóvel) → WhatsApp Web (desktop) → área de transferência.
// Devolve 'partilhado' | 'cancelado' | 'whatsapp' | 'copiado' | 'manual'.
export async function partilharTexto(texto) {
  if (navigator.share) {
    try {
      await navigator.share({ text: texto })
      return 'partilhado'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelado'
      // qualquer outra falha cai para as alternativas
    }
  }
  const janela = window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  if (janela) return 'whatsapp'
  return copiarTexto(texto)
}

export async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return 'copiado'
  } catch {
    window.prompt('Copia manualmente:', texto)
    return 'manual'
  }
}

// ---------- IMAGEM ----------

const W = 900
const PAD = 52
const SCALE = 2

const F = {
  app: "700 40px Oswald, 'Arial Narrow', sans-serif",
  data: "400 24px Inter, sans-serif",
  time: "600 34px Oswald, 'Arial Narrow', sans-serif",
  placar: "700 104px Oswald, 'Arial Narrow', sans-serif",
  vencedor: "600 30px Oswald, 'Arial Narrow', sans-serif",
  label: "600 24px Oswald, sans-serif",
  texto: "400 27px Inter, sans-serif",
  rodape: "600 24px Oswald, sans-serif",
}

// Encolhe a fonte até o texto caber em maxW (para nomes de time compridos).
function ajustar(ctx, texto, maxW, tamanho, peso, familia) {
  let t = tamanho
  ctx.font = `${peso} ${t}px ${familia}`
  while (ctx.measureText(texto).width > maxW && t > 14) {
    t -= 2
    ctx.font = `${peso} ${t}px ${familia}`
  }
  return ctx.font
}

// Parte um texto em linhas que cabem em maxW.
function quebrar(ctx, texto, maxW, font) {
  ctx.font = font
  const palavras = String(texto).split(/\s+/)
  const linhas = []
  let atual = ''
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (ctx.measureText(tentativa).width <= maxW || !atual) atual = tentativa
    else {
      linhas.push(atual)
      atual = palavra
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

// Desenha o resumo da rodada e devolve um data URL PNG.
export async function renderRoundCard(m) {
  try {
    await document.fonts.ready
  } catch {
    /* segue com as fontes por defeito */
  }

  const maxW = W - PAD * 2
  const medir = document.createElement('canvas').getContext('2d')
  const foto = await carregarImagem(m.winner_photo)

  const win = matchWinner(m)
  const gols = scorers(m)
  const assist = assisters(m)
  const craque = awardWinners(m.craque)
  const bagre = awardWinners(m.bagre)

  // secções de texto (label + linhas quebradas), só as que têm conteúdo
  const seccoes = []
  const add = (label, texto) => {
    if (!texto) return
    seccoes.push({ label, linhas: quebrar(medir, texto, maxW, F.texto) })
  }
  // o sufixo de votos só quando há contagem: o feed conhece o vencedor mas
  // não os votos, e "undefined votos" no card seria pior do que nada
  const comVotos = (w) => (w.votes != null ? `${w.names} — ${w.votes} votos` : w.names)
  add('⚽ GOLS', gols.length ? listaComContagem(gols, 'goals') : null)
  add('🅰️ ASSISTÊNCIAS', assist.length ? listaComContagem(assist, 'assists') : null)
  add('👑 CRAQUE DA RODADA', craque ? comVotos(craque) : null)
  add('🐟 BAGRE DA RODADA', bagre ? comVotos(bagre) : null)
  const notas = m.notes ? quebrar(medir, `📝 ${m.notes}`, maxW, F.texto) : null

  // altura total, somando bloco a bloco
  const alturaFoto = foto ? Math.round(maxW * 0.5625) : 0
  let H = PAD + 52 + 34 // cabeçalho (app + data)
  if (foto) H += alturaFoto + 28
  H += 150 // placar
  H += 44 // linha do vencedor
  for (const s of seccoes) H += 34 + s.linhas.length * 38 + 16
  if (notas) H += notas.length * 38 + 10
  H += 60 + PAD // rodapé

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)

  // fundo + moldura (igual ao card do jogador, para ficarem da mesma família)
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#123227')
  bg.addColorStop(0.5, '#0C1D17')
  bg.addColorStop(1, '#08130F')
  ctx.fillStyle = bg
  roundRect(ctx, 0, 0, W, H, 28)
  ctx.fill()
  const frame = ctx.createLinearGradient(0, 0, W, H)
  frame.addColorStop(0, '#34D058')
  frame.addColorStop(0.5, '#1E7A3C')
  frame.addColorStop(1, '#FFC531')
  ctx.strokeStyle = frame
  ctx.lineWidth = 5
  roundRect(ctx, 3, 3, W - 6, H - 6, 26)
  ctx.stroke()

  let y = PAD + 30

  // cabeçalho
  ctx.textAlign = 'center'
  ctx.fillStyle = '#EAF2EC'
  ctx.font = F.app
  ctx.fillText(`${APP_NAME.main} ${APP_NAME.accent}`.toUpperCase(), W / 2, y)
  y += 34
  ctx.fillStyle = '#7FA090'
  ctx.font = F.data
  ctx.fillText(formatDia(m.played_at), W / 2, y)
  y += 34

  // foto do vencedor (recortada em 16:9)
  if (foto) {
    ctx.save()
    roundRect(ctx, PAD, y, maxW, alturaFoto, 16)
    ctx.clip()
    const escala = Math.max(maxW / foto.width, alturaFoto / foto.height)
    const lw = foto.width * escala
    const lh = foto.height * escala
    ctx.drawImage(foto, PAD + (maxW - lw) / 2, y + (alturaFoto - lh) / 2, lw, lh)
    ctx.restore()
    ctx.strokeStyle = 'rgba(127,160,144,0.35)'
    ctx.lineWidth = 2
    roundRect(ctx, PAD, y, maxW, alturaFoto, 16)
    ctx.stroke()
    y += alturaFoto + 28
  }

  // placar: "Pretos  3 × 1  Brancos" — nomes encostados às margens, com a
  // fonte a encolher se forem compridos (assim nunca chocam com os números)
  const nomeA = (m.team_a_name || 'Time A').toUpperCase()
  const nomeB = (m.team_b_name || 'Time B').toUpperCase()
  const larguraNome = W / 2 - 140 - PAD
  const baseline = y + 84

  ctx.textAlign = 'center'
  ctx.fillStyle = '#EAF2EC'
  ctx.font = F.placar
  ctx.fillText(`${m.score_a ?? 0}`, W / 2 - 78, baseline)
  ctx.fillText(`${m.score_b ?? 0}`, W / 2 + 78, baseline)
  ctx.fillStyle = '#7FA090'
  ctx.font = "700 56px Oswald, 'Arial Narrow', sans-serif"
  ctx.fillText('×', W / 2, baseline - 12)

  ctx.fillStyle = '#EAF2EC'
  ctx.textAlign = 'right'
  ctx.font = ajustar(ctx, nomeA, larguraNome, 36, 600, "Oswald, 'Arial Narrow', sans-serif")
  ctx.fillText(nomeA, W / 2 - 140, baseline - 16)
  ctx.textAlign = 'left'
  ctx.font = ajustar(ctx, nomeB, larguraNome, 36, 600, "Oswald, 'Arial Narrow', sans-serif")
  ctx.fillText(nomeB, W / 2 + 140, baseline - 16)
  y += 150

  // vencedor
  ctx.textAlign = 'center'
  ctx.fillStyle = win.isDraw ? '#7FA090' : '#34D058'
  const linhaVencedor = win.isDraw ? '🤝 EMPATE' : `🥇 VENCEU: ${win.name.toUpperCase()}`
  ctx.font = ajustar(ctx, linhaVencedor, maxW, 30, 600, "Oswald, 'Arial Narrow', sans-serif")
  ctx.fillText(linhaVencedor, W / 2, y + 30)
  y += 44

  // secções
  ctx.textAlign = 'left'
  for (const s of seccoes) {
    ctx.fillStyle = '#FFC531'
    ctx.font = F.label
    ctx.fillText(s.label, PAD, y + 24)
    y += 34
    ctx.fillStyle = '#EAF2EC'
    ctx.font = F.texto
    for (const linha of s.linhas) {
      ctx.fillText(linha, PAD, y + 26)
      y += 38
    }
    y += 16
  }

  if (notas) {
    ctx.fillStyle = '#7FA090'
    ctx.font = F.texto
    for (const linha of notas) {
      ctx.fillText(linha, PAD, y + 26)
      y += 38
    }
    y += 10
  }

  // rodapé
  ctx.textAlign = 'center'
  ctx.fillStyle = '#34D058'
  ctx.font = F.rodape
  ctx.fillText(`${APP_NAME.main} ${APP_NAME.accent}`.toUpperCase(), W / 2, H - PAD)

  return canvas.toDataURL('image/png')
}

// O `renderLineupCard` viveu aqui e saiu para o `jogoImagem.js`, refeito no
// molde das outras artes (1080x1350, JPEG, o mesmo azul). O que estava aqui era
// de outra geracao: 1800x1728, PNG, 930 KB e uma paleta verde que ja nao e a de
// mais nenhuma imagem da app.


const nomeFicheiro = (m) => `rodada-${(m?.played_at || '').slice(0, 10) || 'pelada'}.png`

// --- genéricos: servem qualquer imagem, venha de que composição vier ---

export function descarregarDataUrl(dataUrl, ficheiro = 'pelada.png') {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = ficheiro
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// Partilha a imagem (telemóvel); se não der, descarrega-a.
//
// Devolve 'partilhado' | 'cancelado' | 'descarregado', porque quem chama
// precisa de distinguir: dizer "partilhado!" a quem carregou em cancelar é
// mentira, e dizer "descarregado" quando o ficheiro foi mesmo partilhado
// manda a pessoa procurar nos downloads uma coisa que já está no WhatsApp.
export async function partilharDataUrl(dataUrl, { ficheiro = 'pelada.png', titulo } = {}) {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    // O tipo vem do próprio data URL: quem chama pode mandar PNG ou JPEG, e
    // anunciar o tipo errado deixa algumas apps a recusar o ficheiro.
    const file = new File([blob], ficheiro, { type: blob.type || 'image/png' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: titulo || APP_NAME.main })
      return 'partilhado'
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelado'
  }
  descarregarDataUrl(dataUrl, ficheiro)
  return 'descarregado'
}

// --- os de sempre, agora só a dar o nome do ficheiro aos genéricos ---

export function descarregarImagem(dataUrl, m) {
  descarregarDataUrl(dataUrl, nomeFicheiro(m))
}

export async function partilharImagem(dataUrl, m) {
  return partilharDataUrl(dataUrl, {
    ficheiro: nomeFicheiro(m),
    titulo: `${APP_NAME.main} — ${formatDia(m.played_at)}`,
  })
}
