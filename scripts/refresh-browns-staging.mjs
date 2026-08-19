/**
 * Recarrega o staging do KickHub com o histórico da Pelada Browns, do princípio
 * ao fim: exporta da Browns, importa no staging, projeta o modelo multi-pelada e
 * põe as fotos no bucket privado.
 *
 * Existe porque os quatro passos têm de acontecer por esta ordem e nenhum deles
 * faz sentido sozinho. Uma importação sem a migração de mídia deixa as fotos
 * como `data:image/...` dentro das linhas, e o plantel continua a mostrar
 * iniciais — que foi exatamente o que aconteceu da primeira vez.
 *
 * As chaves vêm do ambiente e nunca são escritas em lado nenhum: passam para os
 * processos filhos por `env` e o arquivo intermédio é apagado no fim, mesmo
 * quando algum passo falha.
 *
 *   BROWNS_SERVICE_ROLE_KEY=...            # origem: Pelada Browns
 *   KICKHUB_STAGING_SERVICE_ROLE_KEY=...   # destino: KickHub staging
 *   npm run data:refresh-browns-staging
 *
 * Por omissão o staging fica pseudonimizado. Para o carregar com os nomes e as
 * fotos verdadeiros — decisão do dono da pelada, ver `docs/foundation-gates.md`:
 *
 *   BROWNS_STAGING_IDENTITIES=real BROWNS_STAGING_CONFIRM=REAL-DATA \
 *   BROWNS_SERVICE_ROLE_KEY=... KICKHUB_STAGING_SERVICE_ROLE_KEY=... \
 *   npm run data:refresh-browns-staging
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertServiceRoleKey } from './lib/brownsSnapshot.mjs'
import { KICKHUB_STAGING_PROJECT_REF } from './lib/brownsStagingImport.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const TARGET_URL = `https://${KICKHUB_STAGING_PROJECT_REF}.supabase.co`

const brownsKey = process.env.BROWNS_SERVICE_ROLE_KEY ?? ''
const stagingKey = process.env.KICKHUB_STAGING_SERVICE_ROLE_KEY ?? ''
const identities = process.env.BROWNS_STAGING_IDENTITIES ?? 'pseudonymized'

/**
 * Os dois passos interativos pedem a chave por `readHidden`, e isso exige um TTY
 * que um processo filho não tem. Aqui elas têm de vir do ambiente — é a única
 * forma de encadear os quatro sem parar a meio a pedir uma senha.
 */
function assertKeys() {
  if (!brownsKey || !stagingKey) {
    throw new Error(
      'Defina BROWNS_SERVICE_ROLE_KEY e KICKHUB_STAGING_SERVICE_ROLE_KEY no ambiente da sessão.\n'
      + 'Este script encadeia quatro passos e não pode parar a meio a pedir uma senha.',
    )
  }
  assertServiceRoleKey(brownsKey)
  assertServiceRoleKey(stagingKey)
}

/**
 * Sem as migrations aplicadas, a importação com fotos rebenta a meio — depois de
 * já ter escrito metade das tabelas. Falhar aqui custa nada; falhar lá custa uma
 * limpeza à mão.
 */
async function assertMigrationsApplied() {
  const supabase = createClient(TARGET_URL, stagingKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'kickhub-staging-refresh/1' } },
  })

  const { error: reachable } = await supabase.from('peladas').select('id').limit(1)
  if (reachable) throw new Error(`A chave não pertence ao KickHub staging: ${reachable.message}`)

  // Pergunta pela coluna em vez de chamar a função: uma coluna que não existe dá
  // erro no PostgREST sem depender de quem tem `execute` no quê.
  const { error: missing } = await supabase.from('profiles').select('avatar_status').limit(1)
  if (missing) {
    throw new Error(
      'O staging ainda não tem as migrations das fotos e dos guarda-redes rotativos.\n'
      + 'Faça merge do branch para o CI correr `supabase db push` e tente de novo.\n'
      + `Detalhe: ${missing.message}`,
    )
  }
}

function run(script, args, env) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n$ node ${script} ${args.join(' ')}\n`)
    const child = spawn(process.execPath, [path.join(here, script), ...args], {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${script} terminou com código ${code}.`))
    })
  })
}

async function main() {
  assertKeys()
  process.stdout.write(`Destino: ${TARGET_URL}\nModo de identidade: ${identities}\n`)
  process.stdout.write('\n[1/4] Conferindo se o staging já tem as migrations…\n')
  await assertMigrationsApplied()
  process.stdout.write('✓ migrations aplicadas\n')

  // Fora do repositório de propósito: em modo real este arquivo tem nomes e
  // fotos de pessoas reais, e não deve ficar ao lado do código nem sequer por
  // engano. É apagado no `finally`, aconteça o que acontecer.
  const workDir = await mkdtemp(path.join(tmpdir(), 'browns-refresh-'))
  const exportPath = path.join(workDir, 'browns-staging-export.json')

  try {
    process.stdout.write('\n[2/4] Exportando da Pelada Browns…\n')
    await run('export-browns-staging.mjs', ['--output', exportPath], {
      BROWNS_SERVICE_ROLE_KEY: brownsKey,
    })

    process.stdout.write('\n[3/4] Importando no KickHub staging…\n')
    await run('import-browns-staging.mjs', ['--input', exportPath, '--overwrite'], {
      KICKHUB_STAGING_SERVICE_ROLE_KEY: stagingKey,
    })

    process.stdout.write('\n[4/4] Migrando as fotos para o bucket privado…\n')
    await run('migrate-browns-media.mjs', [], {
      BROWNS_MEDIA_SUPABASE_URL: TARGET_URL,
      BROWNS_MEDIA_SERVICE_ROLE_KEY: stagingKey,
      // O modo diz qual é o ambiente, não o que está lá dentro: `staging-*` é o
      // que separa isto de `production-approved`, e é isso que o gate verifica.
      BROWNS_MEDIA_MODE: 'staging-sanitized',
      BROWNS_MEDIA_CONFIRM: 'UPLOAD',
    })

    process.stdout.write('\nStaging recarregado.\n')
    if (identities === 'real') {
      process.stdout.write(
        'Este staging passou a conter nomes e fotos de pessoas reais.\n',
      )
    }
  } finally {
    // Nem o arquivo nem o diretório sobrevivem ao processo, com ou sem falha.
    await rm(workDir, { recursive: true, force: true })
    process.stdout.write('✓ arquivo intermédio apagado\n')
  }
}

main().catch((error) => {
  process.stderr.write(`\nFalha ao recarregar o staging: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
