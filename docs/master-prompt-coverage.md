# Cobertura do master prompt

Estado de cada secção do
`MASTER PROMPT — TRANSFORMAR PELADA BROWNS EM UMA PLATAFORMA ESCALÁVEL MULTI-PELADA.md`
face ao código em `test`.

Três estados, e a diferença entre eles importa:

- **Feito** — está implementado e tem testes.
- **Estrutura** — a arquitetura existe e não tem fornecedor, ecrã ou dados
  ligados, porque o master prompt pede a preparação e não a implementação.
- **Por fazer** — reconhecido e não construído. A lista está no fim.

## Fundação e domínio

| § | Assunto | Estado | Onde |
|---|---|---|---|
| 1 | Code review inicial | Feito | `docs/auditoria-foundation-multi-pelada.md` |
| 2 | Não quebrar o legado | Feito | `src/` intacto; todas as funcionalidades portadas |
| 3–6 | Visão, multi-tenant, utilizador global, papéis | Feito | `20260813000000_multitenant_foundation.sql` |
| 7–12 | Supabase, schema, membership, migração Browns, RLS | Feito | migrations 0813–0817 |
| 13–14 | Perfil global e estatísticas por pelada | Feito | `lib/player-profile.ts`, `lib/ranking.ts` |
| 15–18 | Criação, convites, pedidos, Minhas Peladas | Feito | `CreatePeladaPage`, `lib/onboarding*` |
| 19–20 | Contexto activo e rotas | Feito | `lib/current-pelada.tsx`, `App.tsx` |
| 66–69 | Domínio, sorteio, modos de guarda-redes, config | Feito | `domain/team-draw.ts`, `domain/player-overall.ts` |

## Descoberta

| § | Assunto | Estado | Onde |
|---|---|---|---|
| 21 | Filtros de descoberta | Feito | `discover_peladas`, `DiscoverPage` |
| 22 | Proximidade com PostGIS | Feito | `20260822000000_geographic_discovery.sql` |
| 23 | Mapa e precisão da morada | Feito (sem mosaicos) | `DiscoveryMap`, `public_pelada_point` |
| 24 | Páginas por região | Feito | `/descobrir/:country/:region` |

## Internacionalização

| § | Assunto | Estado | Onde |
|---|---|---|---|
| 25–29 | PT/EN/ES/FR/DE, catálogos, selector, datas, fuso | Feito | `src-v2/i18n/`, `lib/i18n.tsx` |
| 50 | hreflang | Feito | `lib/seo.ts` |

## Design e marca

| § | Assunto | Estado | Onde |
|---|---|---|---|
| 30–33 | Arquitectura de frontend, tokens, componentes | Feito | `docs/design-system.md` |
| 34–35 | Branding ready e brand config | Feito | `lib/brand.ts` |
| 36–38 | Dark mode, mobile first, PWA | Feito | `styles.css`, `manifest.webmanifest` |
| 79 | Acessibilidade | Feito | `docs/design-system.md` |

## Marketing

| § | Assunto | Estado | Onde |
|---|---|---|---|
| 39–42 | Landing, posicionamento, públicos | Feito | `LandingPage`, `i18n/landing.ts` |
| 43 | Partilha social | Feito | `ShareButton` em resultado, Seleção, Curiosidades, simulador, card |
| 44 | Open Graph | Feito | `lib/seo.ts` |
| 45–46 | Imagens sociais dinâmicas, Instagram | Estrutura | §45 pede preparação; ver "Por fazer" |
| 49 | SEO, robots, sitemap, dados estruturados | Feito | `lib/seo.ts`, `public/robots.txt`, `public/sitemap.xml` |
| 51–54 | Analytics, funil, referral, UTM | Estrutura | `lib/analytics.ts` — sem fornecedor ligado, por decisão |
| 88–89 | Momentos partilháveis e loop de crescimento | Feito | partilha + convites + atribuição |

## Plataforma

| § | Assunto | Estado | Onde |
|---|---|---|---|
| 55 | Canais e preferências de notificação | Estrutura | `20260822020000_notification_preferences.sql` — só in-app entrega |
| 56 | Índices e paginação | Feito | índices nas migrations; `limit/offset` nos RPC de lista |
| 57 | Cache | Feito | React Query com `staleTime` por tipo de dado |
| 58 | Realtime | Por fazer | ver lista final |
| 59 | Storage multi-tenant | Feito | `20260818020000_player_avatars.sql` |
| 60–62 | Segurança, rate limiting, audit log | Feito | `20260812000000_security_hardening.sql`, `tenant_audit_log` |
| 63 | Observabilidade | Estrutura | `lib/telemetry.ts` — sem Sentry ligado |
| 64 | Estados de erro, vazio e carregamento | Feito | padrão em `docs/design-system.md` |
| 65 | TypeScript estrito | Feito | `tsconfig.json`, `npm run typecheck` |
| 70 | Feature flags | Feito | `platform_flags`, `feature_enabled` |
| 71–74 | Testes, CI/CD, ambientes, seed | Feito | vitest + pgTAP, `.github/`, `docs/deployment-environments.md` |
| 75 | Admin da plataforma | Estrutura | `profiles.platform_role`, `is_platform_admin()` — sem consola |
| 76 | Moderação | Estrutura | `content_reports`, `report_content()` — sem ecrã |
| 77 | Privacidade | Feito | `AccountPage`, `update_my_privacy` |
| 78 | GDPR | Feito | `export_my_data`, `request_account_deletion` |
| 80–84 | Home, experiência na pelada, navegação, busca, slugs | Feito | `AppShell`, `PeladaPage` |
| 85 | Deleção suave | Feito | `archive_pelada`, `status`, `archived_at` |
| 86–87 | Escalabilidade sem optimização prematura | Feito | índices onde há consulta, e não onde há receio |
| 90–91 | Monetização e entitlements | Estrutura | `peladas.plan`, `pelada_entitlements()` — sem paywall, por §90 |
| 93–95 | Documentação e decisões | Feito | `docs/` e ADR |

## Funcionalidades do produto

| Assunto | Estado | Onde |
|---|---|---|
| Jogos, presenças, lista de espera | Feito | `GamesSection` |
| Sorteio equilibrado e escalação | Feito | `domain/team-draw.ts`, `GameDraw` |
| Resultado, golos, assistências, defesas | Feito | `GameResult` |
| Avaliações e prémios | Feito | `GameRatings`, `GameAwards` |
| Overall, ranking, estatísticas | Feito | `domain/player-overall.ts`, `RankingSection` |
| Seleção da Pelada e anti-seleção | Feito | `domain/pelada-selection.ts` |
| Curiosidades e campeonato | Feito | `domain/pelada-curiosities.ts` |
| Simulador manual | Feito | `TeamSimulator` |
| Cards e conquistas | Feito | `domain/player-cards.ts` |
| Feed | Feito | `FeedSection` |
| Notificações in-app | Feito | `NotificationBell` |

## Por fazer

O que fica, e porquê:

1. **Pré-renderização para SEO.** `lib/seo.ts` escreve os metadados no browser.
   Um robot que não execute JavaScript continua a ver o `index.html`. Resolver
   isto é servir HTML por rota — mudança de infraestrutura, não uma função.
2. **Sitemap dinâmico.** O ficheiro é estático e cobre a landing e a descoberta.
   Listar peladas exige gerá-lo no servidor a partir do que é mesmo público.
3. **Mosaicos de mapa (§23).** O mapa projecta os pontos autorizados sem tiles.
   Tiles exigem um fornecedor, uma chave e pedidos que saem do browser de quem
   procura — decisões de produto e de privacidade por tomar.
4. **Imagens sociais dinâmicas (§45).** A partilha entrega texto e link. Gerar
   arte por resultado ou por card precisa de renderização no servidor.
5. **Realtime (§58).** Tudo é obtido por pedido. §58 avisa para não subscrever
   por subscrever; as confirmações de presença são o primeiro candidato real.
6. **Entrega por email e push (§55).** As preferências existem e só o canal
   in-app entrega. Um canal novo nasce desligado, de propósito.
7. **Consola de plataforma (§75) e ecrã de moderação (§76).** Os papéis, a
   tabela e o RPC existem; o ecrã de staff não.
8. **Fornecedor de analytics (§51) e Sentry (§63).** As camadas estão prontas e
   sem destino: escolher um é uma decisão de privacidade que não se toma de
   passagem.
9. **Cutover de produção da Browns.** Continua condicionado aos gates de
   `docs/foundation-gates.md` e ao procedimento de `docs/browns-data-migration.md`.
10. **Storybook e auditoria de contraste em CI.** `docs/design-system.md` é a
    documentação; falta o catálogo navegável e a verificação automática.
