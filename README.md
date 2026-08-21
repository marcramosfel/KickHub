# KickHub

A casa digital das peladas: organização de jogos, equipas equilibradas, perfis globais, rankings e
histórias de várias comunidades na mesma conta.

## Estado atual

A V2 é o ponto de entrada ativo e foi reconstruída com arquitetura multi-pelada desde a Foundation.
O produto inclui:

- landing e autenticação única por Google ou magic link, obrigatória em todas as áreas privadas;
- dashboard global “Minhas Peladas” alimentado pelas memberships ativas do utilizador;
- descoberta com PostGIS: busca por proximidade no servidor, filtros de distância, dia,
  formato, nível e vagas, alternância lista/mapa e páginas por região;
- pedidos de entrada, aprovação administrativa e convites privados de uso limitado;
- wizard acessível de criação em seis etapas, com formato e frequência persistidos;
- perfil global autenticado com números reais por pelada e o mesmo Overall do ranking;
- contexto `/p/:slug` com jogos, plantel, ranking, estatísticas e administração;
- `useCurrentPelada()` como fonte única do contexto ativo e troca rápida entre comunidades;
- calendário de jogos com convocatória, confirmação de presença e lista de espera automática;
- plantel com posições, tipo de jogador e overall por pelada;
- sorteio equilibrado reproduzível, com escalação persistida e overall congelado;
- resultado do jogo com placar, golos, assistências e defesas por jogador;
- ranking e estatísticas por pelada, agregados no banco;
- Seleção da Pelada e anti-seleção: o melhor (e o pior) de cada posição na formação da
  comunidade, só com quem já tem Overall calculado;
- Curiosidades: o melhor jogo possível, o duelo dos perebas, um campeonato imaginário e um
  simulador manual de equipas, todos com o mesmo motor de Poisson reproduzível sobre os
  números reais da pelada;
- cards e conquistas derivados dos números do momento — lideranças vindas dos títulos do
  Overall, marcos pessoais, cinco raridades — no perfil e como emblema no ranking;
- partilha nativa (Web Share, com o clipboard como recurso) no resultado, na Seleção, nas
  Curiosidades, no simulador e no card;
- overall calculado a partir das estatísticas, sugerido a quem organiza;
- notificações in-app de convocatória, cancelamento e resposta a pedidos;
- tema claro/escuro, PWA, mobile navigation e i18n tipado para PT/EN/ES/FR/DE em toda a experiência
  global: landing, autenticação, convite, dashboard, criação, descoberta, perfil e contexto da pelada;
- schema Supabase multi-tenant com Auth, roles, RLS, convites, pedidos, notificações e auditoria;
- Browns modelada como tenant #1, com backfill idempotente do legado; o cutover dos dados reais
  continua condicionado aos gates operacionais e ao backup aprovado.

O código Browns anterior permanece em `src/` como referência de domínio e rollback. O app ativo vive
em `src-v2/`; nenhuma regra esportiva histórica foi apagada.

## Desenvolvimento

Requisitos: Node.js 20.19+.

```bash
npm install
npm run dev
```

Sem sessão Supabase, qualquer rota privada redireciona para `/entrar`. O ambiente precisa de uma
configuração Supabase válida: copie `.env.example` para `.env` e informe somente a URL e a chave
publishable do projeto. Não existe fallback local com dados fictícios.

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
6. `20260815000000_game_scheduling.sql` — jogos, presenças, lista de espera e chaves compostas anti-cross-tenant.
7. `20260815010000_profile_self_healing.sql` — criação idempotente de perfis e recuperação de contas órfãs.
8. `20260815020000_squad_attributes.sql` — atributos desportivos do plantel e overall por pelada.
9. `20260816000000_game_lineups.sql` — escalação sorteada, semente reproduzível e validação server-side.
10. `20260816010000_game_results.sql` — placar e estatísticas por jogador.
11. `20260816020000_pelada_ranking.sql` — ranking acumulado e totais da comunidade.
12. `20260816030000_pelada_settings_read.sql` — leitura das definições desportivas.
13. `20260816040000_language_neutral_notifications.sql` — notificações sem texto traduzido e aviso de cancelamento.
14. `20260816050000_pelada_administration.sql` — identidade, definições e papéis administráveis.
15. `20260816060000_ranking_keeps_former_members.sql` — histórico de quem saiu continua no ranking.
16. `20260816070000_ranking_exposes_base_rating.sql` — nota do grupo como parcela do Overall único.
17. `20260816080000_post_game_ratings.sql` — estrelas privadas entre companheiros.
18. `20260816090000_game_awards.sql` — craque e bagre com votação e decisão congelada.
19. `20260816100000_expected_win_balance.sql` — vitórias acima do esperado.
20. `20260816110000_win_streak.sql` — sequência atual de vitórias.
21. `20260816120000_goalkeeper_scale.sql` — métricas próprias de guarda-redes.
22. `20260816130000_legacy_claim.sql` + `20260816140000_restore_legacy_player_fk.sql` — claim Browns e vínculo auditável ao legado.
23. `20260817000000_browns_history_backfill.sql` — projeção reconciliada do histórico Browns e perfil real do jogador.
24. `20260822000000_geographic_discovery.sql` — PostGIS, filtros de descoberta, páginas por
    região e precisão da morada por pelada.

Com Docker disponível:

```bash
npm run db:start
npm run db:reset
npm run db:test
```

Não aplique migrations diretamente no SQL Editor remoto. O cutover do legado continua exigindo
os gates de `docs/foundation-gates.md` e o procedimento de `docs/browns-data-migration.md`.

## Estrutura

```text
src-v2/
  components/       UI, marca e shell responsivo
  lib/              i18n, Supabase, tipos e utilitários
  pages/            rotas globais e contexto da pelada

src/                 produto Browns legado e regras esportivas preservadas
supabase/
  migrations/        histórico reproduzível do banco
  functions/         gateway seguro
  tests/database/    pgTAP de grants, RLS e tenancy
```

Decisões e limites da arquitetura: `docs/architecture-v2.md`.

Configuração e fluxo de autenticação: `docs/authentication.md`.

Catálogos, prioridade de locale e formatação internacional: `docs/i18n.md`.

Pipeline `feature → test → main`, ambientes Vercel e Supabase: `docs/deployment-environments.md`.
