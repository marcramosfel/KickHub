# KickHub repository workflow

## Branches and remotes

- `origin` is `marcramosfel/KickHub` and is the active product repository.
- `legacy` is the preserved Pelada Browns repository. Do not push new KickHub platform work there.
- `test` is the permanent integration/staging branch.
- `main` is the permanent production branch.

## Required delivery flow

For normal implementation work:

1. Start from an up-to-date `test` branch.
2. Use a `codex/*` or `feature/*` branch when the change benefits from review; otherwise commit directly to `test` only when the user explicitly asked Codex to continue autonomous implementation.
3. Run lint, typecheck, tests and build in proportion to the change.
4. Push the validated result to `test`.
5. Never push or merge into `main` unless the user explicitly asks to promote the tested release to production.

A push to `test` triggers Vercel Preview and the staging Supabase pipeline. A push to `main` triggers production. Do not bypass these branch gates with a direct production deployment.

## Database safety

- Supabase migrations are append-only. Never edit a migration that has already been applied remotely.
- Never point Preview/Test at the production Supabase project.
- Never copy production credentials or user data into staging.
- Do not commit `.env`, database passwords, access tokens, service-role keys or connection strings.
- The browser may use only the Supabase URL and publishable/anon key for its environment.

## User-owned content

- Preserve `⚽ Pelada.md` unless the user explicitly asks to edit it.
