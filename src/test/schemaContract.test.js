import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEGACY_TABLES } from '../../scripts/lib/brownsSnapshot.mjs'

const projectRoot = resolve(process.cwd())
const read = (projectPath) => readFileSync(join(projectRoot, projectPath), 'utf8')

const api = read('src/api.js')
const baseline = read('supabase/migrations/20260811000000_browns_baseline.sql')
const hardening = read('supabase/migrations/20260812000000_security_hardening.sql')
const foundation = read('supabase/migrations/20260813000000_multitenant_foundation.sql')
const onboarding = read('supabase/migrations/20260814000000_onboarding_workflows.sql')
const edgeFunction = read('supabase/functions/secure-rpc/index.ts')
const vercelConfig = read('vercel.json')
const envPath = join(projectRoot, '.env')
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const migrationsDirectory = join(projectRoot, 'supabase', 'migrations')
const allMigrations = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(join(migrationsDirectory, name), 'utf8'))
  .join('\n')

function readBrowserSources(directoryPath) {
  return readdirSync(directoryPath, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(directoryPath, entry.name)
      if (entry.isDirectory()) return readBrowserSources(entryPath)
      if (!/\.(?:js|jsx|ts|tsx)$/.test(entry.name) || entry.name.includes('.test.')) return []
      return [readFileSync(entryPath, 'utf8')]
    })
    .join('\n')
}

const browserSources = `${readBrowserSources(join(projectRoot, 'src'))}\n${readBrowserSources(join(projectRoot, 'src-v2'))}`

const uniqueMatches = (text, pattern, group = 1) =>
  [...new Set([...text.matchAll(pattern)].map((match) => match[group]))].sort()

const functionNames = uniqueMatches(
  allMigrations,
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi,
)
const rpcNames = uniqueMatches(`${api}\n${browserSources}`, /\brpc\(\s*['"]([a-z_][a-z0-9_]*)['"]/gi)
const tableNames = uniqueMatches(
  allMigrations,
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi,
)
const baselineTableNames = uniqueMatches(
  baseline,
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi,
)
const rlsTables = uniqueMatches(
  allMigrations,
  /alter\s+table\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi,
)

function permissionList(blockName) {
  const block = baseline.match(new RegExp(`do \\$${blockName}\\$([\\s\\S]*?)\\$${blockName}\\$;`, 'i'))?.[1]
  if (!block) return []
  const list = block.match(/proname\s*=\s*any\s*\(array\[([\s\S]*?)\]\)/i)?.[1] ?? ''
  return uniqueMatches(list, /'([a-z_][a-z0-9_]*)'/gi)
}

const internalFunctions = permissionList('internas')
const browserFunctions = permissionList('publicas')
const explicitBrowserGrants = uniqueMatches(
  allMigrations,
  /grant\s+execute\s+on\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([\s\S]*?\)\s+to\s+(?:anon\s*,\s*)?authenticated\s*;/gi,
)
const exposedFunctions = [...new Set([...browserFunctions, ...explicitBrowserGrants])].sort()
const isSecureRpc = (name) =>
  ['register', 'login', 'publish_draw', 'update_photo', 'issue_device_token'].includes(name)
  || (name.startsWith('admin_') && name !== 'admin_ok')
const secureRpcNames = rpcNames.filter(isSecureRpc)
const directRpcNames = rpcNames.filter((name) => !isSecureRpc(name))
const hardenedPrivateFunctions = [
  'api_rate_limit_status',
  'consume_api_rate_limit',
  'validar_imagem_data_url',
  'validar_imagem_guardada',
  'touch_updated_at',
  'handle_new_auth_user',
  'generate_profile_username',
  'upsert_profile_for_auth_user',
  // Contam os votos de toda a gente para apurar craque e bagre. Ao alcance do
  // cliente devolveriam contagens erradas em silêncio, porque a RLS só lhe
  // mostra os votos próprios; só são alcançáveis de dentro de `get_game_awards`
  // e `get_pelada_ranking`, que verificam pertença.
  'game_team_outcome',
  'tally_game_awards',
  'pelada_award_winners',
]

describe('contrato frontend ↔ Supabase', () => {
  it('mantém cada RPC usada pelo frontend definida nas migrations', () => {
    expect(rpcNames.length).toBeGreaterThan(50)
    expect(rpcNames.filter((name) => !functionNames.includes(name))).toEqual([])
  })

  it('mantém RPCs comuns diretas e roteia operações sensíveis pela Edge', () => {
    expect(directRpcNames.filter((name) => !exposedFunctions.includes(name))).toEqual([])
    expect(secureRpcNames.length).toBeGreaterThan(40)
    expect(edgeFunction).toContain("operation !== 'admin_ok'")
    for (const name of ['register', 'login', 'publish_draw', 'update_photo', 'issue_device_token']) {
      expect(edgeFunction).toContain(`'${name}'`)
    }
    expect(hardening).toContain("p.proname like 'admin\\_%'")
    expect(hardening).toContain('to service_role')
  })

  it('não permite que o gateway encaminhe helper admin sem senha', () => {
    const definitions = [...allMigrations.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*(?:returns|\nreturns)/gi,
    )]
    const unsafeAdminFunctions = definitions
      .filter((match) => match[1].startsWith('admin_') && match[1] !== 'admin_ok')
      .filter((match) => !/\bp_pw\s+text\b/i.test(match[2]))
      .map((match) => match[1])
    expect(unsafeAdminFunctions).toEqual([])
  })
})

describe('fronteira de segurança do baseline', () => {
  it('habilita RLS em todas as tabelas públicas', () => {
    expect(tableNames.length).toBeGreaterThan(0)
    expect(tableNames.filter((name) => !rlsTables.includes(name))).toEqual([])
  })

  it('mantém helpers sensíveis fora da API do browser', () => {
    const expectedInternal = ['admin_ok', 'autenticar_votante', 'gen_user_id', 'slugify']
    expect(expectedInternal.filter((name) => !internalFunctions.includes(name))).toEqual([])
    expect(expectedInternal.filter((name) => exposedFunctions.includes(name))).toEqual([])
  })

  it('classifica todas as funções como internas, públicas ou exclusivas da Edge', () => {
    const classified = new Set([
      ...internalFunctions,
      ...exposedFunctions,
      ...secureRpcNames,
      ...hardenedPrivateFunctions,
    ])
    expect(functionNames.filter((name) => !classified.has(name))).toEqual([])
    for (const name of hardenedPrivateFunctions) {
      expect(allMigrations).toMatch(new RegExp(`revoke all on function public\\.${name}\\(`, 'i'))
    }
  })

  it('não contém a senha previsível do baseline antigo', () => {
    expect(baseline).not.toContain('pelada2026')
  })

  it('protege drops de trigger quando o banco ainda está vazio', () => {
    expect(baseline).toContain("to_regclass('public.match_lineup') is not null")
    expect(baseline).toContain("to_regclass('public.matches') is not null")
    expect(baseline).not.toMatch(/drop trigger if exists match_lineup_gk_order_trg on match_lineup;/i)
    expect(baseline).not.toMatch(/drop trigger if exists matches_voting_sync_trg on matches;/i)
  })

  it('não inclui credencial privilegiada no código do browser', () => {
    const browserSource = `${browserSources}\n${env}`
    expect(browserSource).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i)
  })

  it('armazena tokens persistentes como hash e remove DOB do DTO público', () => {
    expect(hardening).toContain("digest(v_token::text, 'sha256')")
    expect(hardening).toContain('update public.player_devices set token = null')
    const publicPlayers = hardening.match(/create function public\.get_players\(\)([\s\S]*?)\$\$;/i)?.[1] ?? ''
    expect(publicPlayers).not.toMatch(/\bdob\b/i)
  })

  it('define CSP sem unsafe-eval e restringe framing', () => {
    const config = JSON.parse(vercelConfig)
    const csp = config.headers[0].headers.find((header) =>
      header.key === 'Content-Security-Policy'
    )?.value
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co")
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('inclui todas as tabelas legadas no manifesto Browns', () => {
    expect(LEGACY_TABLES.map(({ name }) => name).sort()).toEqual(baselineTableNames)
  })

  it('define a Foundation multi-tenant com tenant explícito e RLS', () => {
    const coreTables = ['profiles', 'peladas', 'pelada_memberships', 'pelada_settings', 'pelada_invites', 'pelada_join_requests', 'notifications', 'tenant_audit_log']
    expect(coreTables.filter((name) => !tableNames.includes(name))).toEqual([])
    expect(coreTables.filter((name) => !rlsTables.includes(name))).toEqual([])
    expect(foundation).toContain("'00000000-0000-4000-8000-000000000101', 'browns'")
    expect(foundation).toContain("values (v_pelada.id, v_profile, 'owner', 'active'")
    expect(foundation).toContain('public.has_pelada_role(pelada_id')
    expect(foundation).toContain('auth_user_id uuid unique references auth.users(id)')
  })

  it('move o onboarding para transações autorizadas e auditáveis', () => {
    for (const name of ['request_pelada_membership', 'review_pelada_join_request', 'create_pelada_invite', 'accept_pelada_invite', 'discover_public_peladas']) {
      expect(functionNames).toContain(name)
      expect(exposedFunctions).toContain(name)
    }
    expect(onboarding).toContain("revoke update on public.pelada_memberships from authenticated")
    expect(onboarding).toContain("'join_request.' || p_decision")
    expect(onboarding).toContain("where token_hash = digest(p_token, 'sha256')")
    expect(onboarding).not.toContain('grant select on public.peladas to anon')
  })
})
