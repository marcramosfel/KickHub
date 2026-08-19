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
cutover aprovado. Não usar produção como destino de `db reset`, seed ou testes pgTAP.

### Identidades no staging

PINs, senha administrativa e tokens de dispositivo **nunca** atravessam para staging, em modo nenhum.
Não são conteúdo do produto: o acesso ao KickHub passa por Supabase Auth e pelo claim de uso único, e
uma credencial antiga copiada para outro ambiente é apenas mais um sítio de onde pode fugir.

Nomes e fotos são outra decisão, e é do dono da pelada. O exportador tem dois modos:

| Modo | Nomes e fotos | Quando |
| --- | --- | --- |
| `pseudonymized` (omissão) | `Jogador Browns NNN`, sem fotos | Validar lógica, ranking, sorteio, RLS |
| `real` | como estão na Browns | Ver o KickHub igual à app original antes do cutover |

O modo real exige as duas variáveis, para que ninguém lá caia por engano:

```bash
BROWNS_STAGING_IDENTITIES=real \
BROWNS_STAGING_CONFIRM=REAL-DATA \
npm run data:export-browns-staging
```

O ficheiro gerado passa a conter nomes e fotos de pessoas reais. É gravado com permissões `0600`,
`artifacts/` está no `.gitignore`, e deve ser apagado depois de importar. O staging que o recebe passa
a ser um ambiente com dados pessoais: quem tem acesso ao projeto Supabase de staging passa a ter
acesso a eles.

### Recarregar o staging de uma vez

Os quatro passos — exportar, importar, projetar e migrar as fotos — têm de acontecer por esta ordem, e
nenhum deles serve sozinho. Uma importação sem a migração de mídia deixa as fotos como
`data:image/...` dentro das linhas e o plantel continua a mostrar iniciais.

```bash
BROWNS_SERVICE_ROLE_KEY=... KICKHUB_STAGING_SERVICE_ROLE_KEY=... BROWNS_STAGING_IDENTITIES=real BROWNS_STAGING_CONFIRM=REAL-DATA npm run data:refresh-browns-staging
```

O script recusa arrancar se o staging ainda não tiver as migrations aplicadas — falhar antes de
escrever custa nada, falhar a meio custa uma limpeza à mão. O arquivo intermédio vive num diretório
temporário fora do repositório e é apagado no fim, com ou sem falha. As chaves vêm do ambiente e não
são escritas em lado nenhum.

A reimportação usa `--overwrite`: os upserts reescrevem cada linha pela chave dela, e `match_activity`
— que tem chave gerada e não casa por upsert — é limpa antes de recarregar. Nada é truncado. Um
`truncate` em `public.players` arrastaria `pelada_memberships` inteira pela restrição
`pelada_memberships_legacy_player_id_fkey`, levando com ela as outras peladas do staging.

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
