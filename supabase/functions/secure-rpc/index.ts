import { createClient } from 'npm:@supabase/supabase-js@2.110.7'

type JsonObject = Record<string, unknown>
type LimitResult = { allowed: boolean; attempts: number; retry_after: number }
type LimitRule = { scope: string; limit: number; window: number; subject: string }

const SPECIAL_OPERATIONS = new Set([
  'register',
  'login',
  'publish_draw',
  'update_photo',
  'issue_device_token',
])

const KNOWN_CODES = [
  'ADMIN', 'CRED', 'PENDENTE', 'TOKENINVALIDO', 'NOME', 'PIN', 'FOTO',
  'FOTOGRANDE', 'FOTOTIPO', 'INVALIDO', 'SEMMIGRACAO',
]

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const allowed = configured.length === 0 || configured.includes(origin)

  return {
    allowed,
    headers: {
      'Access-Control-Allow-Origin': configured.length === 0 ? '*' : (allowed ? origin : 'null'),
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  }
}

function response(req: Request, status: number, payload: JsonObject, extraHeaders: HeadersInit = {}) {
  const cors = corsHeaders(req)
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...cors.headers,
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function clientFingerprint(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? forwarded
    ?? 'unknown'
  const agent = req.headers.get('user-agent')?.slice(0, 240) ?? 'unknown'
  return `${ip}|${agent}`
}

function isAllowedOperation(operation: string) {
  return SPECIAL_OPERATIONS.has(operation)
    || (/^admin_[a-z0-9_]+$/.test(operation) && operation !== 'admin_ok')
}

function semanticCode(error: { message?: string; code?: string } | null) {
  const message = (error?.message ?? '').trim()
  const exactCode = /^[A-Z][A-Z0-9_]{2,40}$/.test(message) ? message : ''
  return KNOWN_CODES.find((code) => message.includes(code))
    ?? exactCode
    ?? error?.code
    ?? 'DESCONHECIDO'
}

async function rateCall(name: 'api_rate_limit_status' | 'consume_api_rate_limit', rule: LimitRule, fingerprintHash: string) {
  const { data, error } = await supabase.rpc(name, {
    p_scope: rule.scope,
    p_fingerprint_hash: fingerprintHash,
    p_subject_hash: await sha256(rule.subject),
    p_limit: rule.limit,
    p_window_seconds: rule.window,
  })
  if (error) throw new Error(`RATE_BACKEND:${error.code ?? 'unknown'}`)
  return data as LimitResult
}

async function ensureAvailable(rules: LimitRule[], fingerprintHash: string) {
  for (const rule of rules) {
    const result = await rateCall('api_rate_limit_status', rule, fingerprintHash)
    if (!result.allowed) return result
  }
  return null
}

async function consume(rules: LimitRule[], fingerprintHash: string) {
  for (const rule of rules) {
    const result = await rateCall('consume_api_rate_limit', rule, fingerprintHash)
    if (!result.allowed) return result
  }
  return null
}

function policies(operation: string, args: JsonObject) {
  const global = 'global'
  const player = String(args.p_id ?? args.p_name ?? global).trim().toLowerCase().slice(0, 160)

  if (operation === 'login') {
    return {
      volume: [{ scope: 'login:volume', limit: 60, window: 900, subject: global }],
      failures: [
        { scope: 'login:fail:ip', limit: 30, window: 900, subject: global },
        { scope: 'login:fail:subject', limit: 8, window: 900, subject: player },
      ],
      failureCode: 'CRED',
    }
  }

  if (operation === 'register') {
    return {
      volume: [{ scope: 'register:volume', limit: 5, window: 3600, subject: global }],
      failures: [],
      failureCode: '',
    }
  }

  if (operation.startsWith('admin_') || operation === 'publish_draw') {
    const volume: LimitRule[] = [
      { scope: 'admin:volume', limit: 300, window: 600, subject: global },
    ]
    if (operation === 'admin_add_media') {
      volume.push({ scope: 'upload:volume', limit: 30, window: 3600, subject: global })
    }
    return {
      volume,
      failures: [{ scope: 'admin:fail', limit: 8, window: 900, subject: global }],
      failureCode: 'ADMIN',
    }
  }

  return {
    volume: [{ scope: 'player-sensitive:volume', limit: 20, window: 3600, subject: global }],
    failures: [
      { scope: 'player-sensitive:fail:ip', limit: 30, window: 900, subject: global },
      { scope: 'player-sensitive:fail:subject', limit: 8, window: 900, subject: player },
    ],
    failureCode: 'CRED',
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') {
    return response(req, cors.allowed ? 200 : 403, { ok: cors.allowed })
  }
  if (req.method !== 'POST' || !cors.allowed) {
    return response(req, 405, { error: { code: 'METHOD', message: 'METHOD' } })
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return response(req, 503, { error: { code: 'CONFIG', message: 'CONFIG' } })
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 4_500_000) {
    return response(req, 413, { error: { code: 'FOTOGRANDE', message: 'FOTOGRANDE' } })
  }

  try {
    const body = await req.json() as { operation?: unknown; args?: unknown }
    const operation = typeof body.operation === 'string' ? body.operation : ''
    const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args)
      ? body.args as JsonObject
      : {}

    if (!isAllowedOperation(operation)) {
      return response(req, 404, { error: { code: 'OPERATION', message: 'OPERATION' } })
    }

    const fingerprintHash = await sha256(clientFingerprint(req))
    const policy = policies(operation, args)
    const blockedFailure = await ensureAvailable(policy.failures, fingerprintHash)
    if (blockedFailure) {
      return response(req, 429, {
        error: { code: 'RATELIMIT', message: 'RATELIMIT' },
        retry_after: blockedFailure.retry_after,
      }, { 'Retry-After': String(blockedFailure.retry_after) })
    }

    const blockedVolume = await consume(policy.volume, fingerprintHash)
    if (blockedVolume) {
      return response(req, 429, {
        error: { code: 'RATELIMIT', message: 'RATELIMIT' },
        retry_after: blockedVolume.retry_after,
      }, { 'Retry-After': String(blockedVolume.retry_after) })
    }

    const { data, error } = await supabase.rpc(operation, args)
    if (error) {
      const code = semanticCode(error)
      if (code === policy.failureCode) {
        const blocked = await consume(policy.failures, fingerprintHash)
        if (blocked) {
          return response(req, 429, {
            error: { code: 'RATELIMIT', message: 'RATELIMIT' },
            retry_after: blocked.retry_after,
          }, { 'Retry-After': String(blocked.retry_after) })
        }
      }
      return response(req, 400, { error: { code, message: code } })
    }

    return response(req, 200, { data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN'
    console.error('secure-rpc failure', message.split(':')[0])
    return response(req, 500, { error: { code: 'DESCONHECIDO', message: 'DESCONHECIDO' } })
  }
})
