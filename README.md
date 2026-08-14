# KickHub

A casa digital das peladas: organização de jogos, equipas equilibradas, perfis globais, rankings e
histórias de várias comunidades na mesma conta.

## Estado atual

A V2 é o ponto de entrada ativo e foi reconstruída com arquitetura multi-pelada desde a Foundation.
O produto inclui:

- landing, cadastro/login por Google, magic link e demonstração navegável;
- dashboard global “Minhas Peladas” alimentado pelas memberships ativas do utilizador;
- descoberta por nome/localização;
- pedidos de entrada, aprovação administrativa e convites privados de uso limitado;
- wizard acessível de criação em seis etapas, com formato e frequência persistidos;
- perfil global do jogador;
- contexto `/p/:slug` com jogos, plantel, ranking, estatísticas e administração;
- tema claro/escuro, PWA, mobile navigation e base i18n para PT/EN/ES/FR/DE;
- schema Supabase multi-tenant com Auth, roles, RLS, convites, pedidos, notificações e auditoria;
- Browns preservada como tenant #1 e segundo tenant no seed local.

O código Browns anterior permanece em `src/` como referência de domínio e rollback. O app ativo vive
em `src-v2/`; nenhuma regra esportiva histórica foi apagada.

## Desenvolvimento

Requisitos: Node.js 20.19+.

```bash
npm install
npm run dev
```

Sem sessão Supabase, a interface abre com dados de demonstração. Para autenticação real, copie
`.env.example` para `.env` e informe somente a URL e a chave publishable do projeto.

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Banco

As migrations são append-only:

1. `20260811000000_browns_baseline.sql` — baseline legado;
2. `20260812000000_security_hardening.sql` — gateway/rate limiting/tokens;
3. `20260813000000_multitenant_foundation.sql` — profiles, peladas, memberships, settings e RLS.
4. `20260814000000_onboarding_workflows.sql` — entrada aberta, pedidos, aprovação, convites e auditoria.
5. `20260814010000_my_peladas_vertical_slice.sql` — read model “Minhas Peladas” e criação completa com settings.

Com Docker disponível:

```bash
npm run db:start
npm run db:reset
npm run db:test
```

Não aplique migrations diretamente no SQL Editor remoto. O cutover do legado continua exigindo
staging e os gates de `docs/foundation-gates.md`.

## Estrutura

```text
src-v2/
  components/       UI, marca e shell responsivo
  data/             fixtures demonstrativas não autoritativas
  lib/              i18n, Supabase e utilitários
  pages/            rotas globais e contexto da pelada

src/                 produto Browns legado e regras esportivas preservadas
supabase/
  migrations/        histórico reproduzível do banco
  functions/         gateway seguro
  tests/database/    pgTAP de grants, RLS e tenancy
```

Decisões e limites da arquitetura: `docs/architecture-v2.md`.

Configuração e fluxo de autenticação: `docs/authentication.md`.

Pipeline `feature → test → main`, ambientes Vercel e Supabase: `docs/deployment-environments.md`.
