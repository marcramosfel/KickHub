// Partilhar o resumo de uma rodada no grupo: como texto pronto a colar
// ou como imagem (canvas, sem dependências — mesmo modelo do card.js).

import { APP_NAME } from '../config'
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
//
// O desenho vive todo em `jogoImagem.js`, no molde comum das artes da app.
// Aqui ficou so a ENTREGA: pegar num data URL e po-lo nas maos do sistema.

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
