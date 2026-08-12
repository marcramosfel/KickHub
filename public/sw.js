// Service worker da Pelada Browns.
//
// Faz UMA coisa: guarda a casca da app (o HTML, o JS, o CSS, os ícones) para
// ela abrir sem rede. Os DADOS nunca são guardados — nem o Supabase, nem
// nada que venha de fora.
//
// A razão é simples: um sorteio, um resultado ou uma votação em cache é pior
// do que não ter nada. Alguém abriria a app no campo, veria as equipas da
// semana passada e não teria como saber que estava a ver o passado. Sem
// rede, a app abre e diz que não conseguiu carregar — que é a verdade.

const VERSAO = 'kickhub-v2-foundation-1'

// A casca mínima. O resto (os pedaços com hash do Vite) entra em cache à
// medida que for pedido, e sai quando a versão mudar.
const ESSENCIAL = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      // `addAll` falha inteiro se um só falhar — daí o addAll dos essenciais
      // ficar tolerante: uma app que não instala é pior do que uma sem cache.
      .then((cache) => cache.addAll(ESSENCIAL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (evento) => {
  const { request } = evento

  // Só GET e só o nosso próprio domínio. Tudo o que vai ao Supabase passa
  // ao lado disto — ver o comentário do topo.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegação: rede primeiro, cache como rede de segurança. Assim uma versão
  // nova chega no primeiro arranque com rede, em vez de ficar presa até o
  // cache expirar.
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((resposta) => {
          const copia = resposta.clone()
          caches.open(VERSAO).then((c) => c.put('/index.html', copia))
          return resposta
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    )
    return
  }

  // Ficheiros com hash no nome (o que o Vite emite): o conteúdo nunca muda
  // para o mesmo URL, por isso cache primeiro é seguro e instantâneo.
  evento.respondWith(
    caches.match(request).then(
      (emCache) =>
        emCache ||
        fetch(request).then((resposta) => {
          if (resposta.ok && resposta.type === 'basic') {
            const copia = resposta.clone()
            caches.open(VERSAO).then((c) => c.put(request, copia))
          }
          return resposta
        })
    )
  )
})
