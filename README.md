# ⚖️ Pelada Browns

Webapp mobile-first para a pelada do **Browns** sortear equipas de futebol **equilibradas**, com base na nota (0–5) que cada jogador dá aos outros — uma única vez. Organizada por **Wallace Chagas**.

**Stack:** Vite + React (JavaScript) · Supabase (Postgres) · deploy na Vercel como site estático.

## Como funciona

1. **Registo** — nome, data de nascimento, foto e PIN de 4 dígitos (tudo obrigatório). A conta fica *pendente*.
2. **Aprovação** — o admin (área com senha própria) aprova ou rejeita cada pedido.
3. **Avaliação** — ao entrar pela primeira vez, o jogador dá nota de 0 a 5 a todos os outros aprovados. Só se faz uma vez.
4. **Sorteio** — quando todos avaliaram, o admin marca as presenças e sorteia. O motor agrupa por faixas de nota, embaralha e distribui pelo time com menor soma — nunca sai um time "empilhado". Dá para re-sortear e trocar jogadores manualmente antes de publicar.
5. **Publicação** — o sorteio publicado aparece na Home de todos.
6. **Rodadas e estatísticas** — depois de cada jogo, o admin regista quem jogou, os gols ⚽ e as assistências 🅰️ (separador *Jogos*). A página *Estatísticas* mostra os totais de todos (jogos, gols, assistências, craques e bagres) e o histórico das rodadas.
7. **Craque & bagre da rodada** — cada rodada registada abre uma votação: quem jogou elege o 👑 craque e o 🐟 bagre (uma vez por rodada, sem votar em si próprio). Empates no topo contam para todos os empatados.

Toda a lógica sensível vive no Postgres em funções `SECURITY DEFINER` (PINs com hash bcrypt, senha de admin validada no servidor). As tabelas estão fechadas por RLS — o browser só chama RPC.

## Rodar localmente

Pré-requisitos: Node 18+.

```bash
npm install
npm run dev
```

O `.env` já contém as variáveis necessárias:

```
VITE_SUPABASE_URL=https://gfowkkchpqoirubumnau.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...
```

> A chave `sb_publishable_...` é **pública por design** — pode ir no repo. **Nunca** commitar chaves `sb_secret_...` nem a connection string do Postgres.

## Aplicar a migração no Supabase

O schema está em `supabase/migrations/`, por ordem:

- [`0001_init.sql`](supabase/migrations/0001_init.sql) — jogadores, avaliações, sorteios, admin.
- [`0002_estatisticas.sql`](supabase/migrations/0002_estatisticas.sql) — rodadas, gols/assistências e votação de craque/bagre.
- [`0003_seguranca_pin.sql`](supabase/migrations/0003_seguranca_pin.sql) — correção de segurança: torna a verificação do PIN em `login`/`submit_ratings` imune a `p_pin = null`. **Aplicar sempre.**
- [`0004_trocar_foto.sql`](supabase/migrations/0004_trocar_foto.sql) — permite ao jogador trocar a própria foto (função `update_photo`, validada por PIN).
- [`0005_avaliacoes_incrementais.sql`](supabase/migrations/0005_avaliacoes_incrementais.sql) — avaliação passa a ser por lacunas (novos jogadores são avaliados pelos veteranos); admin pode reiniciar avaliações de todos ou de um jogador.
- [`0006_fix_pending_ratings.sql`](supabase/migrations/0006_fix_pending_ratings.sql) — corrige `get_pending_ratings` (coluna `id` ambígua na 0005). **Aplicar se já aplicaste a 0005.**
- [`0007_fix_reset_all.sql`](supabase/migrations/0007_fix_reset_all.sql) — corrige "reiniciar avaliações de todos" (`DELETE` sem `WHERE` era bloqueado pelo Supabase). **Aplicar se já aplicaste a 0005.**

Duas formas de aplicar:

**Opção A — Supabase CLI:**

```bash
supabase link --project-ref gfowkkchpqoirubumnau
supabase db push
```

**Opção B — SQL Editor:** abre o dashboard do Supabase → *SQL Editor* → cola o conteúdo de cada ficheiro (pela ordem 0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007) → *Run*.

A migração cria as tabelas (`players`, `ratings`, `draws`, `app_config`), ativa RLS sem políticas (tabelas fechadas) e cria as funções RPC que a app usa.

## Senha de admin

A senha inicial é **`pelada2026`**. Para trocar, corre no SQL Editor:

```sql
update app_config set admin_pw_hash = crypt('NOVA_SENHA', gen_salt('bf')) where id = 1;
```

(Se der erro de `crypt`, usa `extensions.crypt` e `extensions.gen_salt`.)

## Deploy na Vercel

1. Faz push do projeto para um repositório (GitHub/GitLab).
2. Na Vercel: **Add New Project** → importa o repo.
3. Framework preset: **Vite** (build `npm run build`, output `dist` — a Vercel deteta sozinha).
4. Em **Settings → Environment Variables**, define:
   - `VITE_SUPABASE_URL` = `https://gfowkkchpqoirubumnau.supabase.co`
   - `VITE_SUPABASE_KEY` = `sb_publishable_VZ5IVCvVxrKDwLeZq912bg_ZeEriLqr`
5. Deploy. 🎉

## Estrutura

```
supabase/migrations/0001_init.sql   schema + funções RPC (a "API")
src/
  api.js            wrappers das RPC + tradução dos erros para PT
  supabaseClient.js cliente único do Supabase
  theme.js          cores e estilos partilhados (tema "placar noturno")
  lib/draw.js       motor de sorteio equilibrado
  lib/image.js      redução da foto no browser (canvas → JPEG base64)
  components/       LoginScreen, RateScreen, HomeScreen, AdminScreen, DrawView, Avatar
```

## Notas de segurança

- As tabelas têm RLS ativo **sem políticas** — nenhuma leitura/escrita direta passa, nem com a chave pública.
- PINs e senha de admin guardados com hash bcrypt (`pgcrypto`), validados no servidor.
- O PIN do jogador e a senha do admin ficam apenas em memória durante a sessão — nada é persistido no browser.
