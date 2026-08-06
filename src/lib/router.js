// Encaminhamento por hash — o mínimo que faz um link funcionar.
//
// A app não tinha router nenhum: nem `location.hash`, nem `pushState`, nem
// query string. Isso não era uma omissão de estilo, era o que tornava
// IMPOSSÍVEL partilhar a votação no grupo — qualquer link caía no ecrã de
// login e morria aí. Era essa a razão nº 1 de ninguém votar.
//
// Hash e não History API de propósito: o site é estático (Vercel, `dist/`) e
// um `/votar/<id>` exigiria uma reescrita no servidor para não dar 404 num
// refresh. Com `#/votar/<id>` funciona em qualquer alojamento, incluindo o
// `file://` de um teste rápido.
//
// A área de admin fica FORA do router de propósito: a senha vive em memória
// e um `#/admin` prometia um sítio guardável nos favoritos que ia pedir a
// senha na mesma — a ilusão custava mais do que valia.

export const ROTAS = {
  VOTAR: 'votar',
  JOGO: 'jogo',
  PERFIL: 'perfil',
}

// '#/votar/abc' → { rota: 'votar', id: 'abc' }
export function lerHash(hash) {
  const cru = String(hash ?? (typeof window === 'undefined' ? '' : window.location.hash))
  const limpo = cru.replace(/^#\/?/, '').trim()
  if (!limpo) return { rota: null, id: null }
  const [rota, id] = limpo.split('/').map((p) => decodeURIComponent(p || ''))
  if (!Object.values(ROTAS).includes(rota)) return { rota: null, id: null }
  return { rota, id: id || null }
}

export const escreverHash = (rota, id) =>
  rota ? `#/${rota}${id ? `/${encodeURIComponent(id)}` : ''}` : '#/'

// URL absoluto de uma rota, para colar no WhatsApp.
export function urlDaRota(rota, id, base) {
  const raiz =
    base ||
    (typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${window.location.pathname}`)
  return `${raiz}${escreverHash(rota, id)}`
}

export const urlDaVotacao = (matchId, base) => urlDaRota(ROTAS.VOTAR, matchId, base)

// Muda a rota sem recarregar. `substituir` troca a entrada atual do
// histórico em vez de criar uma nova — é o que se quer depois de votar,
// para o botão "voltar" não trazer o utilizador de novo para a cédula.
export function navegarPara(rota, id, { substituir = false } = {}) {
  if (typeof window === 'undefined') return
  const alvo = escreverHash(rota, id)
  if (window.location.hash === alvo) return
  if (substituir && window.history?.replaceState) {
    window.history.replaceState(null, '', alvo)
    // replaceState não dispara hashchange: quem estiver a ouvir tem de ser
    // avisado à mão, senão a app fica na rota antiga com o URL novo
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = alvo
  }
}

export function limparHash() {
  if (typeof window === 'undefined') return
  if (!window.location.hash) return
  if (window.history?.replaceState) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  } else {
    window.location.hash = ''
  }
}

// ---------- token do dispositivo ----------
//
// O que fica no telemóvel é um TOKEN emitido pelo servidor, nunca o PIN. É
// isso que permite manter a promessa do README ("o PIN só vive em memória
// durante a sessão") e mesmo assim tirar o PIN do caminho a partir da
// segunda votação.
//
// O token autoriza ler e votar — e mais nada: trocar PIN, trocar foto e
// entrar no admin continuam a exigir o PIN escrito.

const CHAVE_TOKEN = 'pb.device'

// `localStorage` pode não existir (modo privado antigo do Safari, iframes
// com cookies bloqueados). Nesse caso a app funciona na mesma, só sem o
// "lembrar-me" — nunca deve rebentar por causa disto.
const armazem = () => {
  try {
    const s = typeof window === 'undefined' ? null : window.localStorage
    if (!s) return null
    const teste = '__pb__'
    s.setItem(teste, '1')
    s.removeItem(teste)
    return s
  } catch {
    return null
  }
}

export function lerToken() {
  const s = armazem()
  if (!s) return null
  try {
    return s.getItem(CHAVE_TOKEN) || null
  } catch {
    return null
  }
}

export function guardarToken(token) {
  const s = armazem()
  if (!s || !token) return false
  try {
    s.setItem(CHAVE_TOKEN, token)
    return true
  } catch {
    return false
  }
}

export function esquecerToken() {
  const s = armazem()
  if (!s) return
  try {
    s.removeItem(CHAVE_TOKEN)
  } catch {
    /* nada a fazer — o token expira sozinho no servidor */
  }
}

// Etiqueta do dispositivo, para o jogador reconhecer a sessão na lista.
// Sem `userAgent` legível não vale a pena inventar: fica sem etiqueta.
export function etiquetaDoDispositivo() {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad/i.test(ua)) return 'iPhone'
  if (/Android/i.test(ua)) return 'Android'
  if (/Macintosh/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  return null
}
