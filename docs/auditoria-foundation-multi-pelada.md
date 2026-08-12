# Auditoria da Foundation Multi-Pelada

Data: 11 de agosto de 2026  
Escopo: frontend React, regras de domínio, testes, integração Supabase, schema PostgreSQL, PWA e validação visual pública.

## Status de execução

PR0, a camada de characterization do PR1 e o hardening local do PR2 foram implementados neste workspace: o schema foi
congelado como baseline timestamped, Supabase local e seed seguro foram configurados, a senha
previsível foi removida de instalações novas, foram adicionados contract tests, testes pgTAP e CI.
O PR2 adiciona gateway Edge com rate limiting, tokens hashed, DTO público sem DOB, limites de
imagem, CSP e rotação de senha pela interface. Deploy/rotação remotos, `pg_dump`, reparo do
histórico e E2E continuam pendentes porque exigem acesso controlado ao ambiente remoto e,
localmente, um runtime Docker.

## Resumo executivo

A Pelada Browns já é um produto funcional e rico. O código tem bons sinais de engenharia: regras de futebol foram extraídas para `src/lib`, há 597 testes unitários passando, o acesso ao Supabase passa por um wrapper central, o schema protege helpers internos e várias race conditions foram tratadas deliberadamente.

O sistema, porém, foi desenhado para uma única comunidade confiável. O obstáculo principal para a plataforma multi-pelada é a fronteira de identidade/autorização:

- `players` mistura conta, perfil e participação na Browns;
- não existe `pelada_id` em nenhuma tabela;
- Supabase Auth não identifica o usuário da aplicação;
- PIN de quatro dígitos e senha compartilhada de admin são as credenciais reais;
- RLS fecha as tabelas, mas não existem policies por usuário/tenant;
- 120 funções `SECURITY DEFINER` atravessam RLS e fazem autorização manual;
- dados de jogadores, perfis, jogos e rankings são acessíveis por RPCs concedidas a `anon`.

A Foundation não deve começar com um rewrite. O caminho seguro é preservar os IDs e regras Browns, introduzir `profiles`, `peladas` e `pelada_memberships`, carimbar todo o histórico com o UUID da Browns, migrar identidade gradualmente para Supabase Auth e só então abrir um segundo tenant.

## Resultado dos checks

| Check | Resultado |
|---|---|
| Testes | 33 arquivos, 618 testes, todos passaram após a Foundation V2 |
| Lint | passou sem erros |
| Build | passou; Vite alertou para chunk JS de 871,97 KB |
| Contrato frontend/schema | 88 RPCs chamadas; todas existem no baseline |
| RLS | habilitado nas 22 tabelas; zero policies |
| Funções | 119 nomes; 120 definições `SECURITY DEFINER` |
| UI pública | 390×844 e 1440×900 sem overflow/erros de console |

---

## A. CURRENT STATE

### A.1 Stack e estrutura

- React 18 + Vite 7 (atualizado no PR0 para eliminar vulnerabilidades conhecidas do tooling);
- JavaScript/JSX, sem TypeScript;
- Supabase JS 2;
- Vitest + Testing Library;
- CSS global e estilos inline via `theme.js`;
- hash router próprio para `#/votar/:id`, `#/jogo/:id` e `#/perfil/:id`;
- PWA com manifest e service worker;
- um schema consolidado em `supabase/migrations/20260811000000_browns_baseline.sql`;
- sem framework de cache/query, biblioteca i18n ou E2E no repositório; CI adicionado no PR0.

Estrutura atual:

```text
src/
  App.jsx
  api.js
  components/
  components/admin/
  hooks/
  lib/
  styles/
  theme.js
  config.js
  supabaseClient.js

supabase/
  config.toml
  migrations/20260811000000_browns_baseline.sql
  tests/database/
  APLICAR.md
```

### A.2 Arquitetura frontend

`App.jsx` funciona como orchestrator global: sessão, token persistido, roteamento, carregamento de dados, navegação, PIN sob demanda, modais e seleção das páginas. A carga autenticada executa dez RPCs em paralelo. Existe proteção explícita contra respostas fora de ordem com `cargaRef` e cleanup de efeitos.

`api.js` centraliza 88 RPCs e converte códigos PostgreSQL em mensagens para o usuário. Isso é uma boa fronteira para a futura separação por domínio, embora o arquivo já tenha 631 linhas.

As regras mais sensíveis do futebol estão em módulos testáveis:

- `drawEngine.js`: sorteio e invariantes;
- `overall.js`: cálculo e transição de pesos;
- `ranking.js`: junção de estatísticas/ranking;
- `goleiros.js` e `positions.js`: posições/goleiros;
- `voting.js` e `awards.js`: votação/elegibilidade;
- `lifecycle.js`: ciclo do jogo;
- `achievements.js`, `cards.js`, `streaks.js`;
- `simulador.js`, `campeonato.js`, `selecao.js`;
- geração de cards/imagens sociais no cliente.

Há componentes excessivamente grandes:

| Arquivo | Linhas aproximadas |
|---|---:|
| `components/admin/MatchWizard.jsx` | 1.667 |
| `components/admin/GameDetail.jsx` | 1.318 |
| `lib/drawEngine.js` | 1.089 |
| `components/FootballPitch.jsx` | 935 |
| `lib/jogoImagem.js` | 874 |
| `components/PlayerProfile.jsx` | 804 |
| `components/admin/SubstitutionsPanel.jsx` | 738 |
| `components/StatsScreen.jsx` | 696 |
| `App.jsx` | 649 |

O build produz um único chunk de 875,91 KB minificado/255,73 KB gzip; não há lazy loading por feature.

### A.3 Backend e autorização atuais

O banco usa um modelo de “tabelas fechadas + API RPC”:

1. RLS é habilitado em todas as 22 tabelas;
2. não há policies;
3. acesso direto pelas roles do browser é negado;
4. funções `SECURITY DEFINER` leem/escrevem como owner;
5. cada função pública valida PIN, token de dispositivo ou senha de admin quando necessário.

O schema consolidado corrige um risco importante do histórico: `admin_ok`, `slugify`, `gen_user_id` e demais helpers internos recebem `REVOKE EXECUTE FROM public, anon, authenticated`. Todas as 88 RPCs atuais existem no schema.

Esse desenho é defensável para uma pelada pequena, mas não fornece identidade JWT nem autorização relacional por tenant. RLS não consegue distinguir jogador A, admin B ou usuário externo porque todas as chamadas chegam como `anon/authenticated` e a identidade real vai em parâmetros.

### A.4 Modelo de dados atual

Tabelas:

1. `players`
2. `ratings`
3. `draws`
4. `app_config`
5. `matches`
6. `match_stats`
7. `award_votes`
8. `player_position_history`
9. `match_lineup`
10. `goalkeeper_match_stats`
11. `match_substitutions`
12. `match_media`
13. `match_activity`
14. `match_publications`
15. `match_swaps`
16. `post_match_ratings`
17. `player_devices`
18. `ratings_arquivo`
19. `match_predictions`
20. `draw_disputes`
21. `match_availability`
22. `match_forecasts`

Pontos positivos do schema:

- PKs e FKs para a maioria dos relacionamentos;
- checks para scores, posições, estados e placares;
- unicidade de jogador/slot em escalações;
- snapshots de Overall e payloads de feed;
- `FOR UPDATE` em substituições concorrentes;
- paginação cursor-based no feed, limitada a 50;
- índices para feed, kickoff/status, votação, mídias e tabelas de histórico;
- helpers internos explicitamente fechados.

Limitações estruturais:

- nenhuma tabela possui `pelada_id`;
- `players` contém credencial, perfil e atributos da membership;
- `app_config` é singleton (`id = 1`);
- `is_admin` no player é global;
- `draws` guarda times como JSON sem relações;
- `match_activity.actor` é texto “admin”, não uma identidade;
- perfis, estatísticas e ratings pressupõem um único grupo.

### A.5 Inventário funcional a preservar

Confirmado no fonte/schema:

- cadastro, login por nome/ID, aprovação e rejeição;
- PIN, troca/recuperação e sessão lembrada por dispositivo;
- foto, nickname, ID público, posição e preferência de goleiro;
- estado de disponibilidade, membership atual e solicitações;
- avaliação do grupo por rodada, anonimato/revelação e reset;
- Overall com transição de pesos e vitórias acima do esperado;
- criação de jogo, formato, tamanho, local, mapa e horário;
- presença/convocatória e palpites;
- sorteio equilibrado, rachão, simulador e campeonato;
- goleiro fixo/rotativo e ordem de rodízio;
- escalações, trocas, desistências e substituições;
- resultado, gols, assistências, autogols, defesas e gols sofridos;
- votação pós-jogo, craque, bagre, ratings, prazo, quórum e revisão;
- rankings, estatísticas por período, química e histórico;
- cards, conquistas, sequências e Seleção da Pelada;
- feed, resenha, mídia, curiosidades e previsões;
- compartilhamento e geração de cards/imagens;
- administração, export e audit trail parcial;
- PWA instalável e shell offline.

### A.6 Qualidade UI/UX observada

Pontos positivos:

- mobile-first real, sem overflow em 390 px;
- controles principais de 44–52 px;
- layout desktop centralizado e legível;
- `focus-visible` global;
- suporte a `prefers-reduced-motion`;
- skeletons, erros e estados vazios em várias features;
- linguagem de futebol consistente e personalidade Browns preservada.

Problemas observados na tela pública:

- campos usam `<label>`, mas sem `htmlFor/id` e sem nesting;
- inputs não têm `name`/`required` nativo;
- não existem landmarks `main/header/nav/footer` nessa tela;
- “Área do admin” fica com alvo visual de 16 px de altura;
- `autocomplete="off"` impede ajuda do navegador onde ela seria útil.

---

## B. PROBLEMS

### CRITICAL

#### C1. Não existe fronteira de tenant

- **Problema:** nenhuma entidade possui `pelada_id`; configurações, jogos, jogadores, ratings, rankings e feed são globais.
- **Impacto:** um segundo grupo misturaria dados, papéis e estatísticas; qualquer isolamento implementado só no frontend seria IDOR.
- **Arquivo/componente afetado:** todas as 22 tabelas, 88 RPCs, `App.jsx`, `api.js` e agregadores.
- **Solução recomendada:** criar `peladas`, profile global, membership e `pelada_id` explícito; constraints compostas e RLS tenant-aware.
- **Prioridade:** P0 Foundation.
- **Risco da alteração:** alto; exige expand/contract e reconciliação de todos os dados Browns.

#### C2. PIN de quatro dígitos é a credencial de conta sem rate limiting

- **Problema:** IDs de jogadores são consultáveis por RPC pública e o PIN possui somente 10.000 combinações. Login, emissão de token e mutations dependem desse segredo, sem rate limiting no projeto.
- **Impacto:** brute force pode assumir uma conta, votar/alterar dados e emitir token de 180 dias.
- **Arquivo/componente afetado:** `login`, `issue_device_token`, funções `set_my_*`, `players.pin_hash`, endpoints públicos.
- **Solução recomendada:** migrar para Supabase Auth; imediatamente adicionar rate limiting/monitoramento, lockout progressivo e reduzir privilégios do token legado.
- **Prioridade:** P0 segurança.
- **Risco da alteração:** médio-alto; pode bloquear usuários reais e requer fluxo de recuperação.

#### C3. O modelo `SECURITY DEFINER` não escala para autorização por membership

- **Problema:** 120 funções atravessam RLS e reimplementam autorização com parâmetros. Não existe `auth.uid()` nem policy que prove a membership.
- **Impacto:** cada nova RPC vira uma nova fronteira manual; uma validação esquecida pode ler/escrever outro tenant inteiro.
- **Arquivo/componente afetado:** baseline Supabase, especialmente funções públicas.
- **Solução recomendada:** Supabase Auth + policies; manter `SECURITY DEFINER` apenas em operações transacionais específicas, com helpers em schema privado e revoke-by-default.
- **Prioridade:** P0 Foundation.
- **Risco da alteração:** alto; rollout em etapas e testes com JWT real são obrigatórios.

### HIGH

#### H1. Dados pessoais e esportivos são acessíveis por RPCs anônimas

- **Problema:** `get_players`, `get_player_profile`, `get_matches`, rankings e feed são concedidas a `anon`. `get_players` inclui DOB/foto e IDs.
- **Impacto:** scraping de fotos, datas de nascimento e histórico; incompatível com privacy-by-default e com peladas privadas.
- **Arquivo/componente afetado:** RPCs públicas de leitura e seus DTOs.
- **Solução recomendada:** DTO público/membro/admin; remover DOB de listas; privacy settings; RLS e views públicas mínimas.
- **Prioridade:** P1 segurança/GDPR.
- **Risco da alteração:** médio; telas atuais dependem dos payloads amplos.

#### H2. Senha compartilhada de admin (default conhecido corrigido no PR0)

- **Problema:** toda administração ainda usa uma senha global; não há rate limiting nem identidade do ator. O PR0 removeu a senha default previsível de bancos novos.
- **Impacto:** vazamento compromete toda a Browns; ações são indistinguíveis; instalação nova pode ficar com senha previsível.
- **Arquivo/componente afetado:** `app_config.admin_pw_hash`, `admin_ok`, `AdminScreen.jsx`, `match_activity.actor`.
- **Solução recomendada:** owner/admin por membership e Auth; nunca seedar senha operacional; rotacionar a atual e registrar ator real.
- **Prioridade:** P1.
- **Risco da alteração:** médio-alto.

#### H3. Fotos/mídias em base64 sem limite server-side

- **Problema:** perfil e mídia usam `text/data_url`; SQL valida presença, não MIME/tamanho/dimensão. Cadastro é público.
- **Impacto:** abuso, payloads enormes, crescimento do Postgres e backups lentos; feed pode transferir megabytes.
- **Arquivo/componente afetado:** `players.photo_url`, `match_media.data_url`, `register`, `update_photo`, `admin_add_media`.
- **Solução recomendada:** Supabase Storage, allowlist MIME, limites e policies; banco guarda somente object key/metadata.
- **Prioridade:** P1.
- **Risco da alteração:** médio-alto por migração dos assets existentes.

#### H4. Migrations não eram append-only (corrigido no PR0)

- **Problema original:** havia um único schema regenerado que derrubava/recriava views, triggers e funções, aplicado manualmente via SQL Editor.
- **Impacto:** drift entre ambientes, rollback difícil e menor auditabilidade. Um erro no baseline afeta grande parte da API.
- **Arquivo/componente afetado:** baseline timestamped, `supabase/config.toml`, `supabase/APLICAR.md`.
- **Solução recomendada:** congelar o arquivo como baseline inicial e criar migrations timestamped append-only; validar `db reset`/diff em CI.
- **Prioridade:** P1 antes do schema multi-tenant.
- **Risco da alteração:** baixo se o baseline não for reaplicado destrutivamente.

#### H5. Cobertura forte no domínio; banco/RLS/CI adicionados, E2E pendente

- **Problema original:** 597 testes protegiam principalmente funções JS. PR0/PR1 adicionaram contrato de RPC, pgTAP para migrations/RLS e CI; Storage e E2E de fluxos continuam pendentes.
- **Impacto:** segurança e integração podem quebrar apesar da suíte unitária verde.
- **Arquivo/componente afetado:** banco, `api.js`, autenticação, admin e deploy.
- **Solução recomendada:** Supabase local + testes SQL/JWT; contract tests das 88 RPCs; E2E de login/jogo/voto/admin; CI.
- **Prioridade:** P1 antes de backfill.
- **Risco da alteração:** baixo.

#### H6. Hard delete e auditoria incompleta

- **Problema:** rejeitar jogador/apagar jogo remove dados em cascade; audit log usa ator textual; ações administrativas não têm `user_id/pelada_id`.
- **Impacto:** perda histórica, baixa rastreabilidade e dificuldade de suporte/GDPR.
- **Arquivo/componente afetado:** `admin_reject`, deletes de jogo, FKs cascade, `match_activity`.
- **Solução recomendada:** status/soft delete para memberships/jogos; audit log imutável com ator, tenant e metadata segura.
- **Prioridade:** P1.
- **Risco da alteração:** médio.

### MEDIUM

#### M1. Componentes e serviços excessivamente grandes

- **Problema:** componentes de 700–1.667 linhas e `api.js` com 631 linhas acumulam muitos motivos de mudança.
- **Impacto:** revisão difícil, testes de UI custosos e maior chance de regressões.
- **Arquivo/componente afetado:** `MatchWizard`, `GameDetail`, `FootballPitch`, `PlayerProfile`, `StatsScreen`, `App.jsx`, `api.js`.
- **Solução recomendada:** separar por feature/use case, sem mudar comportamento; extrair hooks/state machines e services por domínio.
- **Prioridade:** P2 incremental.
- **Risco da alteração:** médio; fazer após characterization tests.

#### M2. Um único chunk e ausência de lazy loading

- **Problema:** build JS de 875,91 KB em um único chunk.
- **Impacto:** custo inicial em redes móveis, inclusive para quem só quer votar por link.
- **Arquivo/componente afetado:** entrypoint e imports de admin/cards/simulador.
- **Solução recomendada:** rotas semânticas e `React.lazy` para admin, stats, simulador e geradores de imagem.
- **Prioridade:** P2.
- **Risco da alteração:** baixo-médio.

#### M3. Sem cache/query layer explícita

- **Problema:** `App.jsx` dispara dez RPCs por carga e várias telas gerem seus próprios efeitos/refetch.
- **Impacto:** round-trips repetidos, invalidation manual e duplicação de loading/error.
- **Arquivo/componente afetado:** `App.jsx`, `StatsScreen`, admin e componentes com `useEffect`.
- **Solução recomendada:** camada de queries por domínio, com keys contendo `peladaId`, cancellation e política de stale time.
- **Prioridade:** P2.
- **Risco da alteração:** médio.

#### M4. TypeScript e tipos Supabase ausentes

- **Problema:** projeto inteiro é JS/JSX; contratos RPC/JSON não têm checagem estática.
- **Impacto:** mudanças de schema podem quebrar payloads apenas em runtime.
- **Arquivo/componente afetado:** `api.js`, componentes e módulos de domínio.
- **Solução recomendada:** gerar tipos Supabase e migrar por fronteiras, começando em domain/services; ativar strict gradualmente.
- **Prioridade:** P2.
- **Risco da alteração:** médio.

#### M5. Internacionalização inexistente

- **Problema:** textos, erros, plurais, datas e timezone estão hardcoded em PT; timezone é `Europe/Lisbon`.
- **Impacto:** internacionalização exigirá tocar UI e lógica; horários de outra pelada serão errados.
- **Arquivo/componente afetado:** componentes, `api.js`, `format.js`, `countdown.js`, manifest/HTML.
- **Solução recomendada:** i18n por namespaces, erros como keys, `Intl`, locale/timezone no profile/pelada.
- **Prioridade:** P2 iniciado junto da Foundation.
- **Risco da alteração:** médio.

#### M6. Design system parcial e Browns hardcoded

- **Problema:** `theme.js` centraliza parte da identidade, mas há muitos estilos inline, cores diretas, `Browns Sports Resort` e títulos “Pelada Browns”.
- **Impacto:** rebranding, light/dark e cards de outros tenants exigem mudanças distribuídas.
- **Arquivo/componente afetado:** `theme.js`, `config.js`, CSS, componentes e geradores sociais.
- **Solução recomendada:** primitive/semantic/component tokens, brand config e dados da pelada injetados.
- **Prioridade:** P2.
- **Risco da alteração:** médio.

#### M7. Listas históricas sem paginação

- **Problema:** `get_matches()` agrega todas as partidas e chama `match_json` para cada uma; players/stats também retornam coleções completas.
- **Impacto:** payload e CPU crescem linearmente; efeito equivalente a N+1 dentro do banco para históricos grandes.
- **Arquivo/componente afetado:** `get_matches`, `match_json`, `get_players`, `get_player_stats`.
- **Solução recomendada:** cursor pagination e queries resumidas/detalhe sob demanda; índices compostos por tenant/data.
- **Prioridade:** P2.
- **Risco da alteração:** médio por mudança de contrato.

#### M8. Acessibilidade estrutural incompleta

- **Problema:** labels sem associação, landmarks ausentes, algumas ações com alvo pequeno e formulários sem atributos nativos.
- **Impacto:** leitor de tela, teclado, autofill e toque são prejudicados.
- **Arquivo/componente afetado:** `LoginScreen.jsx` e provável padrão em outros formulários.
- **Solução recomendada:** auditoria axe/E2E; `htmlFor/id`, `name`, `required`, landmarks e alvo mínimo de 44×44.
- **Prioridade:** P2.
- **Risco da alteração:** baixo.

### LOW

#### L1. Metadata e PWA são específicas da Browns

- **Problema:** title, description, manifest e cache version usam marca fixa; não há OG dinâmico por jogo/pelada.
- **Impacto:** previews e instalação não representam a plataforma/tenant.
- **Arquivo/componente afetado:** `index.html`, `public/manifest.webmanifest`, `public/sw.js`.
- **Solução recomendada:** metadata/OG por rota e brand config; versão de cache gerada pelo build.
- **Prioridade:** P3.
- **Risco da alteração:** baixo.

#### L2. Nomenclatura técnica é mista

- **Problema:** tabelas em inglês; funções/views auxiliares em português; enums mistos.
- **Impacto:** custo cognitivo para equipe internacional.
- **Arquivo/componente afetado:** schema e nomes de domínio.
- **Solução recomendada:** inglês para novas entidades; aliases/migrations de compatibilidade para legado.
- **Prioridade:** P3.
- **Risco da alteração:** médio se feito como rename amplo; não priorizar.

---

## C. TARGET ARCHITECTURE

### C.1 Princípios

- uma aplicação e um projeto Supabase;
- identidade global independente de membership;
- autorização derivada de JWT + membership;
- `pelada_id` explícito em todo registro do tenant;
- UUID interno; slug somente para URL;
- Browns como tenant #1, sem branches especiais;
- regras de futebol puras/testáveis preservadas;
- expand/contract em vez de big-bang.

### C.2 Frontend alvo

```text
src/
  app/                 providers, routing, bootstrap
  features/
    auth/
    peladas/
    memberships/
    discovery/
    games/
    teams/
    players/
    ratings/
    stats/
    rankings/
    achievements/
    feed/
    notifications/
    admin/
  domain/
    balancing/
    overall/
    ranking/
    permissions/
    achievements/
  components/ui/
  components/layout/
  services/supabase/
  i18n/
  types/
```

`PeladaProvider/useCurrentPelada()` resolve `/p/:slug` para UUID e fornece `{ pelada, membership, permissions }`. Toda query key e mutation inclui `peladaId`.

Rotas:

```text
/
/app
/discover
/create
/p/:slug
/p/:slug/games
/p/:slug/players
/p/:slug/ranking
/p/:slug/stats
/p/:slug/admin
/join/:token
/u/:username
```

### C.3 Segurança alvo

- `auth.users`: autenticação;
- `profiles`: identidade global;
- `pelada_memberships`: role/status por pelada;
- policies RLS por entidade;
- helpers internos em schema privado;
- RPC `SECURITY DEFINER` somente para transações complexas;
- revoke-by-default e grants explícitos;
- DTOs público/membro/admin;
- Storage com paths/policies multi-tenant;
- testes com JWTs de owner/admin/player/externo A/B.

---

## D. DATABASE MIGRATION

### D.1 Modelo inicial

```text
profiles
  id uuid PK
  auth_user_id uuid UNIQUE NULL -> auth.users
  username citext UNIQUE
  display_name, avatar_path, bio
  country_code, city, locale, timezone
  privacy jsonb
  created_at, updated_at, deleted_at

peladas
  id uuid PK
  slug citext UNIQUE
  name, description, logo_path
  owner_profile_id -> profiles
  visibility, join_mode, status
  country_code, region, city
  location geography(Point,4326)
  public_location_precision
  timezone
  created_at, updated_at, archived_at

pelada_memberships
  id uuid PK
  pelada_id -> peladas
  profile_id -> profiles NULL durante claim legado
  role owner|admin|player
  status pending|active|rejected|suspended|removed
  legacy_player_id uuid UNIQUE NULL
  player settings/positions/nickname/card
  joined_at, approved_at, approved_by, removed_at
  UNIQUE (pelada_id, profile_id) WHERE profile_id IS NOT NULL

pelada_settings
pelada_invites
join_requests
games
game_availability
game_lineups
match_stats
goalkeeper_match_stats
ratings
award_votes
feed_events
notifications
audit_log
```

### D.2 Estratégia Browns sem quebra

Não renomear `players` no primeiro passo. Preservar seus UUIDs e FKs:

1. congelar o schema consolidado como baseline;
2. criar uma migration append-only com `profiles`, `peladas`, memberships e settings;
3. inserir Browns com UUID constante e slug `browns`;
4. adicionar `pelada_id` nullable às entidades atuais;
5. preencher todas com Browns;
6. criar membership por player com `legacy_player_id`;
7. validar contagens/agregados;
8. criar índices e constraints;
9. tornar `pelada_id NOT NULL` onde aplicável;
10. introduzir views/RPCs compatíveis;
11. migrar frontend;
12. só depois renomear/substituir entidades legadas.

Constraints devem impedir relações cross-tenant, idealmente com FKs compostas `(pelada_id, id)`.

### D.3 Claim de identidade Browns

Não inventar emails para jogadores existentes:

1. criar profiles legados sem `auth_user_id`;
2. gerar claim code de uso único, hash no banco;
3. jogador autentica/cria Supabase Auth;
4. transação valida claim + vínculo legado;
5. liga `profile.auth_user_id`;
6. revoga PIN/token legado ao fim da transição;
7. trata merges quando a mesma pessoa tiver memberships duplicadas.

### D.4 Verificação before/after

Por tabela:

- contagem total e por pelada;
- zero `pelada_id` nulo;
- zero FK órfã/cross-tenant;
- hashes determinísticos de linhas históricas;
- soma de gols, assistências, autogols, defesas e votos;
- rankings/Overalls de amostra idênticos;
- quantidade/tamanho de mídias;
- grants, functions e policies efetivas.

Os backups JSON de 28/07/2026 ajudam, mas cobrem somente 34 players, 1.033 ratings, 2 matches, 29 stats e 22 votes. O rollback real precisa de backup atual de Postgres + Storage.

### D.5 RLS obrigatório

- player A não lê dados privados da pelada B;
- admin A não administra B;
- player não chama mutation admin;
- owner promove admin somente na própria pelada;
- membership suspensa perde acesso;
- externo lê somente DTO público;
- join request não ativa membership sem aprovação;
- Storage repete a mesma fronteira;
- service role nunca chega ao browser.

---

## E. IMPLEMENTATION PLAN

### PR 0 — Baseline e CI

- comparar o baseline com `pg_dump --schema-only` do banco real;
- congelar baseline e iniciar migrations timestamped;
- criar Supabase local/staging;
- CI: lint, tests, build, schema reset/diff.

### PR 1 — Characterization de integração

- manter os 597 testes existentes;
- contract tests das 88 RPCs;
- testes de banco/RLS;
- E2E de login, sorteio, resultado, voto e admin;
- snapshot de agregados Browns.

### PR 2 — Hardening imediato

- [x] gateway e rate limiting em login/signup/admin/uploads;
- [x] eliminar default operacional e oferecer rotação segura na interface;
- [x] DTO de jogadores sem DOB público;
- [x] hashear tokens legados;
- [x] limites de upload e CSP;
- [ ] deploy remoto coordenado e rotação efetiva da senha atual.

### PR 3 — Core tenant schema

- `profiles`, `peladas`, memberships e settings;
- Browns como tenant #1;
- índices, constraints e helpers RLS.

### PR 4 — Browns backfill

- `pelada_id` em todas as entidades;
- memberships legadas;
- relatório automatizado before/after;
- tenant #2 de teste.

### PR 5 — Auth, roles e RLS

- Supabase Auth + claim legado;
- owner/admin/player por membership;
- policies completas e testes A/B.

### PR 6 — Contexto/routing multi-pelada

- `/app`, `/p/:slug/*`, `useCurrentPelada`;
- services/query keys tenant-aware;
- Browns sem hardcode.

### PR 7 — Minhas Peladas e criação

- dashboard global, switcher, wizard e settings.

### PR 8 — Convites, pedidos e notificações

- invite token hash, validade, origem/UTM;
- join request/aprovação;
- notifications e audit log.

### PR 9 — I18n Foundation

- `pt`, `en`, `es`, `fr`, `de`;
- namespaces, `Intl`, locale/timezone e persistência.

A infraestrutura i18n deve começar nos PRs 3–6 para não criar novos hardcodes.

### PR 10 — Discovery/PostGIS

- visibilidade/localização aproximada;
- filtros/distância/mapa;
- índices GiST e proteção de endereço.

### PR 11 — Brand, landing e sharing

- tokens em três camadas e brand config;
- landing localizada;
- metadata/OG dinâmica;
- analytics/UTM abstraction;
- social cards tenant-aware.

---

## F. RISKS

| Risco | Mitigação |
|---|---|
| Banco real divergir do baseline | `pg_dump`, catalog diff e reset local antes da primeira migration |
| Usuários Browns não terem Auth/email | profile legado + claim code de uso único |
| Escritas durante backfill criarem linhas sem tenant | migration transacional, defaults temporários e janela curta de write freeze |
| RLS causar vazamento/lockout | matriz JWT A/B/owner/admin/player/externo |
| FKs permitirem cruzamento de tenant | constraints compostas e testes negativos |
| Overall/ranking mudar | golden dataset e snapshot dos agregados Browns |
| Fotos base64 tornarem migração pesada | inventário e migração em lotes para Storage |
| Timezone alterar histórico | preservar `played_at`; documentar timezone Browns e converter kickoff conscientemente |
| Frontend e banco ficarem incompatíveis | expand/contract em dois ou mais deploys |
| Hard deletes durante transição | freeze de operações destrutivas e archive/status |
| PIN legado continuar indefinidamente | data de sunset, telemetria de claims e revogação progressiva |

---

## G. ONLY THEN IMPLEMENT

### Go/no-go para PR 3

- [x] fonte e dependências versionados;
- [x] lint/test/build verdes;
- [x] 88 RPCs alinhadas estaticamente ao schema;
- [ ] schema real exportado e comparado ao baseline;
- [ ] staging restaurado de backup atual;
- [x] migrations append-only configuradas;
- [x] contract tests estáticos verdes; pgTAP configurado no CI;
- [ ] senha admin rotacionada e rate limiting ativo;
- [ ] estratégia de claim Browns aprovada; ADR 0001 proposto para decisão;
- [x] coletor/comparador de contagem, hash e agregados implementado; captura remota ainda pendente.

### Próxima ação segura

Executar os gates de `docs/foundation-gates.md`. Nenhuma migration multi-tenant deve tocar produção
antes de o schema real, os contratos RPC e os agregados Browns serem reproduzidos em staging.
