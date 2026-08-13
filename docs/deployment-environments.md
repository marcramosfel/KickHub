# Ambientes e promoção

## Fluxo permanente

```text
feature/* → pull request → test → pull request → main
```

- Todo trabalho começa a partir de `test`.
- Pull requests de feature têm `test` como destino.
- Um push/merge em `test` cria um Preview da Vercel e, após todos os gates do CI, aplica migrations e Edge Functions no Supabase staging.
- Somente um pull request de `test` para `main` promove o código.
- Um push/merge em `main` publica na Vercel Production e, após os gates do CI, aplica o mesmo histórico de migrations no Supabase production.
- `test` e `main` são branches permanentes e nunca devem ser apagadas.

## Vercel

O projeto Vercel `kick-hub` usa a integração Git nativa:

- `main`: Production;
- `test`: Preview persistente;
- outras branches: Preview efêmero.

As variáveis de Preview da branch `test` devem apontar para o Supabase staging. As variáveis de Production devem apontar para o Supabase production:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_KEY
```

Nunca configure o Supabase production como fallback de Preview.

## GitHub Environments

Crie dois environments em `Settings → Environments`:

```text
staging
production
```

Em cada environment, cadastre secrets com os mesmos nomes, mas valores do projeto correspondente:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
SUPABASE_DB_PASSWORD
```

O environment `production` deve exigir aprovação antes do deploy. Os secrets são lidos somente pelos jobs associados ao environment correto.

## Supabase

Use dois projetos hospedados independentes:

```text
KickHub Staging     ← test
KickHub Production  ← main
```

Migrations são append-only. Nunca edite uma migration já aplicada. O seed local não é aplicado pelo `supabase db push` e dados de produção não devem ser copiados para staging.

No Auth de cada projeto, configure apenas as URLs do respectivo ambiente como Site URL e Redirect URLs.

## Recuperação

- Falha nos testes: nenhum deploy Supabase é iniciado.
- Falha na migration staging: corrigir com uma nova migration e enviar novamente para `test`.
- Falha na production: não editar migration aplicada; criar uma migration corretiva a partir de `test`.
- Vercel permite rollback do frontend, mas rollback do banco deve ser sempre uma nova migration compatível com dados existentes.
