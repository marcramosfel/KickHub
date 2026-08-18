# Cutover dos dados da Pelada Browns

Este procedimento move o histórico real para o KickHub sem misturar ambientes e sem transformar
credenciais antigas em credenciais da plataforma. A migration `20260817000000_browns_history_backfill.sql`
faz a projeção relacional; ela **não** busca dados noutro projeto e não substitui backup.

## O que é preservado

- os 22 conjuntos legados usados pelo manifesto, incluindo jogadores, jogos, escalações,
  estatísticas, avaliações, votos, mídia, feed, previsões, trocas e auditoria;
- UUIDs dos jogadores e jogos;
- gols, assistências, autogols, defesas, placares, notas e decisões de craque/bagre;
- fotos e publicações, depois do inventário de tamanho e da migração aprovada para Storage;
- a tabela original como fonte de reconciliação durante a janela expand/contract.

PIN hashes, senha administrativa, tokens de dispositivo e connection strings não são conteúdo do
produto e não atravessam o cutover. O acesso passa para Supabase Auth e para o claim de uso único.

## Ensaio seguro

1. Fazer backup atual de Postgres e Storage e guardar os hashes no registro da mudança.
2. Em uma máquina operacional isolada, restaurar o backup e escolher o modo de identidade. Por
   omissão, nomes, datas de nascimento e fotos são substituídos por pseudónimos, mantendo chaves e
   distribuições esportivas. Com `BROWNS_STAGING_IDENTITIES=real` e `BROWNS_STAGING_CONFIRM=REAL-DATA`,
   nomes e fotos atravessam como estão — é a única forma de ver o KickHub igual à app original antes
   do cutover, e transforma o staging num ambiente com dados pessoais. Ver
   `docs/foundation-gates.md`.
3. Remover `app_config.admin_pw_hash`, `players.pin_hash`, tokens/hashes de `player_devices` e segredos.
   Onde uma coluna legada `not null` exigir valor, usar um marcador desativado que jamais autentique.
4. Restaurar **somente a cópia sanitizada** no Supabase staging.
5. Aplicar migrations, executar o pgTAP e chamar `backfill_browns_history()` e
   `backfill_browns_content()` com `service_role`.
6. Na cópia sanitizada, migrar as imagens para o bucket privado com
   `BROWNS_MEDIA_MODE=staging-sanitized` e `npm run data:migrate-media`.
7. Comparar manifestos before/after e fazer smoke test com contas exclusivamente de staging.

Credenciais reais nunca entram no staging, em modo nenhum. Dados pessoais entram apenas quando o
dono da pelada o pede explicitamente pelas duas variáveis acima.

## Cutover real

1. Comunicar a janela e congelar escritas na Browns.
2. Capturar o manifesto before com `scripts/capture-browns-snapshot.mjs`.
3. Gerar o transporte final a partir do backup congelado, excluindo as credenciais antigas.
4. Restaurar as tabelas legadas no Supabase **production do KickHub** dentro da mudança aprovada.
5. Aplicar a migration append-only e executar, como `service_role`:

```sql
select public.backfill_browns_history();
select public.backfill_browns_content();
```

6. Migrar os binários das fotos para o bucket privado. Os segredos são injetados somente na
   sessão operacional e nunca entram no `.env` do frontend:

```bash
BROWNS_MEDIA_SUPABASE_URL=https://PROJECT.supabase.co \
BROWNS_MEDIA_SERVICE_ROLE_KEY=... \
BROWNS_MEDIA_MODE=production-approved \
BROWNS_MEDIA_CONFIRM=UPLOAD \
npm run data:migrate-media
```

O migrador trata duas famílias de imagens no mesmo passo:

- **fotos de jogo**, de `match_media` para `game_media` no bucket `game-media`;
- **fotos de jogador**, de `players.photo_url` para o bucket privado `player-avatars`.

Em ambas valida MIME e tamanho, calcula SHA-256, faz upload idempotente e só então marca cada objeto
como `ready`. Fotos pendentes ou falhadas nunca aparecem no feed nem no plantel.

O backfill **não** copia a foto legada para `profiles.avatar_path`: um `data:image/...` guardado ali
seria base64 dentro da linha do perfil, servido ao browser sem passar por Storage nenhum. O perfil
fica `avatar_status = 'pending'` sem caminho, e só este migrador o promove a `ready`. Enquanto isso,
o plantel mostra as iniciais.

O caminho de cada avatar é `<profile_id>/avatar.<ext>`. O primeiro segmento não é decoração: é sobre
ele que a policy do Storage decide quem pode ler o objeto — só quem partilha uma pelada ativa com o
dono da foto.

7. Conferir os JSONs devolvidos. A própria função aborta se jogadores/jogos, gols, assistências,
   avaliações ou votos não reconciliarem.
8. Capturar o manifesto after e executar `npm run data:compare`.
9. Validar amostras de goleiro e jogador de linha: perfil, jogos, placar, gols, assistências,
   Overall, estrelas, craques e bagres.
10. Validar feed e fotos por uma conta Browns de teste e só então liberar login/claim.

## Repetição e rollback

O backfill usa chaves determinísticas e upserts; pode ser repetido durante a janela congelada. Cada
execução material gera auditoria. Antes de liberar novas escritas, rollback é restaurar o backup do
KickHub e manter a Browns ativa. Depois do cutover, correções são migrations novas: nunca editar uma
migration já aplicada nem reativar claims consumidas.

O arquivo `⚽ Pelada.md` é documentação de produto mantida pelo owner e não faz parte deste
procedimento operacional.
