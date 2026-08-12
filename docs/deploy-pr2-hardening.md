# Deploy coordenado — PR2 hardening

Este PR altera a fronteira de segurança. Depois da migration, login, cadastro, administração e
uploads deixam de aceitar chamadas PostgREST feitas diretamente com a chave publishable. O
frontend passa a chamar a Edge Function `secure-rpc`.

## Pré-requisitos

- backup atual do Postgres;
- schema remoto comparado ao baseline;
- staging restaurado e smoke tests concluídos;
- `ALLOWED_ORIGINS` definido com as origens do frontend, separadas por vírgula;
- acesso confirmado ao dashboard e à CLI Supabase;
- janela curta de manutenção comunicada aos administradores.

## Ordem do cutover

1. Execute os checks locais/CI e `supabase db push --dry-run` no projeto correto.
2. Faça deploy de `secure-rpc` antes da migration. A função ficará sem uso pelo frontend antigo.
3. Pause ações administrativas e novos cadastros.
4. Aplique as migrations pendentes via CLI. Não use copiar/colar no SQL Editor.
5. Publique imediatamente o frontend que contém o novo `src/api.js`.
6. Na aba **Admin → Acessos**, altere a senha administrativa para uma senha exclusiva de pelo
   menos 12 caracteres.
7. Faça smoke test de cadastro, login correto/incorreto, login por dispositivo, abertura do admin,
   troca de foto, upload de mídia e uma leitura pública.
8. Confirme nos logs da Edge Function que não há `RATE_BACKEND`, `CONFIG` ou erros 5xx.
9. Encerre a janela de manutenção.

Comandos de referência, depois de conferir o projeto vinculado:

```bash
supabase functions deploy secure-rpc --no-verify-jwt
supabase db push --dry-run
supabase db push
```

O deploy do frontend continua pelo pipeline normal da Vercel. Não coloque a service role em
variáveis `VITE_*`; a Edge Function recebe `SUPABASE_SERVICE_ROLE_KEY` do próprio ambiente
Supabase.

## Rollback

Não restaure tokens brutos: a migration os substitui deliberadamente por hashes. Se o gateway
falhar durante o cutover, reverta o frontend e os grants somente durante a janela controlada,
investigue a Edge Function e revogue novamente o acesso direto assim que ela estiver saudável.
O rollback completo de schema deve usar o backup validado, não SQL improvisado.
