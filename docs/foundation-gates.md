# Gates operacionais antes do PR3

O schema multi-tenant não deve ser iniciado nem aplicado em produção enquanto estes gates não forem
fechados. Os comandos abaixo são de leitura; os artefatos gerados ficam em `artifacts/`, ignorado pelo
Git.

## 1. Backup e staging

1. Criar backup atual de Postgres e Storage pelo processo operacional aprovado.
2. Criar, fora da nuvem, uma cópia sanitizada que preserve relações e agregados, mas remova dados
   pessoais e credenciais; somente essa cópia pode ser restaurada em staging.
3. Congelar escritas durante cada par de snapshots para evitar paginação sobre dados mutáveis.
4. Registrar data, responsável, project ref e hashes dos artefatos no ticket de mudança.

O backup real permanece no cofre de recuperação e só é restaurado no destino de produção durante o
cutover aprovado. Nunca copiar utilizadores, fotos, PINs, senha administrativa, tokens ou dados reais
da produção para staging. Não usar produção como destino de `db reset`, seed ou testes pgTAP.

## 2. Comparar schema real e migrations

Vincule conscientemente este checkout ao projeto de staging e defina
`SUPABASE_STAGING_PROJECT_REF` com o project ref esperado. O script recusa executar se o projeto
vinculado for diferente. Depois execute:

```bash
npm run schema:dump:linked
npm run schema:diff:linked
```

O primeiro comando salva um dump schema-only de `public`. O segundo compara o schema produzido pelas
migrations com o projeto vinculado. Ambos também geram um arquivo `.sha256`.

O diff precisa ser revisado linha a linha. Um arquivo vazio é o resultado esperado; divergência deve
virar migration append-only ou ser justificada antes do PR3.

## 3. Manifesto Browns before/after

O coletor exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` somente no processo de backend. Ele
recusa chaves anon/publishable e nunca grava as credenciais. Injete os segredos pelo secret manager
da sessão ou do CI; não os coloque em `.env`, argumentos de linha de comando ou logs.

Antes da migration de backfill:

```bash
npm run data:snapshot -- --output artifacts/data/before.json --label staging-before
```

Depois de `select public.backfill_browns_history()` no destino, ainda durante o write freeze:

```bash
npm run data:snapshot -- --output artifacts/data/after.json --label staging-after
npm run data:compare -- artifacts/data/before.json artifacts/data/after.json
```

O manifesto cobre as 22 tabelas legadas, contagens, SHA-256 determinístico e agregados de jogadores,
jogos, placares, gols, assistências, autogols, defesas, ratings, votos e mídias. `pelada_id` e hashes
de credenciais são deliberadamente excluídos para permitir o backfill e a rotação de segredos sem
mascarar alterações nos dados esportivos.

O coletor pagina cada tabela com ordenação por chave primária. Execute-o sem escritas concorrentes;
caso contrário, o resultado não constitui evidência de preservação.

## 4. Gates humanos/remotos restantes

- implantar o PR2 de forma coordenada e confirmar rate limiting;
- rotacionar a senha administrativa;
- aprovar [ADR 0001](adr/0001-legacy-identity-claim.md);
- executar pgTAP e smoke tests em staging;
- anexar dump, diff, snapshots e hashes ao registro da mudança.
- seguir `docs/browns-data-migration.md`, inclusive a sanitização de credenciais e a reconciliação
  transacional antes de abrir o KickHub aos jogadores Browns.
