function withAbsoluteSocialImages(html, origin) {
  return html.replaceAll('content="/og-kickhub.png"', `content="${origin}/og-kickhub.png"`)
}

function withSecurityHeaders(headers) {
  const nextHeaders = new Headers(headers)
  nextHeaders.set('content-security-policy', "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self' data:; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  nextHeaders.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  nextHeaders.set('referrer-policy', 'strict-origin-when-cross-origin')
  nextHeaders.set('x-content-type-options', 'nosniff')
  nextHeaders.set('x-frame-options', 'DENY')
  return nextHeaders
}

async function serveHtml(request, env, path = '/index.html') {
  const assetUrl = new URL(path, request.url)
  const response = await env.ASSETS.fetch(new Request(assetUrl, request))
  if (!response.ok) return response
  const headers = withSecurityHeaders(response.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  const html = withAbsoluteSocialImages(await response.text(), new URL(request.url).origin)
  return new Response(html, { status: response.status, headers })
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }
    const response = await env.ASSETS.fetch(request)
    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? ''
      return contentType.includes('text/html') ? serveHtml(request, env, new URL(request.url).pathname) : response
    }
    const acceptsHtml = request.headers.get('accept')?.includes('text/html')
    return acceptsHtml ? serveHtml(request, env) : response
  },
}
