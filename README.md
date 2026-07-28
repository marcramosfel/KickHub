# ⚖️ Pelada Browns

Webapp mobile-first para a pelada do **Browns** sortear equipas de futebol **equilibradas**, com base na nota (0–5) que cada jogador dá aos outros — uma única vez. Organizada por **Wallace Chagas**.

**Stack:** Vite + React (JavaScript) · Supabase (Postgres) · deploy na Vercel como site estático.

## Como funciona

1. **Registo** — nome, data de nascimento, foto e PIN de 4 dígitos (tudo obrigatório). A conta fica *pendente*.
2. **Aprovação** — o admin (área com senha própria) aprova ou rejeita cada pedido.
3. **Avaliação** — ao entrar pela primeira vez, o jogador dá nota de 0 a 5 a todos os outros aprovados. Só se faz uma vez.
4. **Posição** — à primeira entrada, cada jogador escolhe onde joga (formação 2-3-1: goleiro, dois defesas, três do meio, um atacante), com uma secundária opcional. Escolhe-se **uma vez**; a partir daí só um administrador altera, e o servidor recusa qualquer tentativa do próprio.
5. **Marcar o jogo** — o admin usa o assistente de 7 passos (*Próximo jogo*): data/hora/local → escolher os 2 goleiros → confirmar os 12 jogadores de campo → verificar posições → sortear → rever o equilíbrio → publicar.
6. **Sorteio** — o motor testa todas as divisões possíveis das duas equipas e escolhe a que junta forças parecidas com o menor número de jogadores fora da posição. Dá para trocar jogadores à mão, mudar lugares e voltar a sortear antes de publicar.
7. **Publicação** — o jogo publicado aparece na Home de todos, com o campo, as equipas e a contagem regressiva.
8. **Rodadas e estatísticas** — depois de cada jogo, o admin regista quem jogou, os gols ⚽ e as assistências 🅰️ e, para quem esteve na baliza, as 🧤 defesas e os 🥅 gols sofridos (separador *Jogos*).
9. **Craque & bagre da rodada** — cada rodada registada abre uma votação: quem jogou elege o 👑 craque e o 🐟 bagre (uma vez por rodada, sem votar em si próprio). Empates no topo contam para todos os empatados.
10. **Ranking e títulos** — o *Ranking* ordena pelo **overall** (o mesmo número que equilibra o sorteio), com separadores para jogadores de campo, goleiros, artilheiros, assistências, craques e vitórias. Quem lidera uma categoria ganha moldura e badge automáticos (Rei da Pelada, Paredão, Artilheiro, …).

Os goleiros têm ranking e overall próprios — não se comparam por gols e assistências. A fórmula está em `src/lib/overall.js` e é explicada dentro da app, no separador *Goleiros*.

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
- [`0008_user_ids.sql`](supabase/migrations/0008_user_ids.sql) — `user_id` único por jogador (gerado do nome, com deduplicação), backfill dos existentes, login por **Nome ou ID**, e RPCs de gestão de IDs no admin.
- [`0009_login_ambiguidade.sql`](supabase/migrations/0009_login_ambiguidade.sql) — login mostra `AMBIGUO` (pede o ID) quando o nome é partilhado por vários jogadores. **Aplicar se já aplicaste a 0008.**
- [`0010_rodadas.sql`](supabase/migrations/0010_rodadas.sql) — resumo completo da rodada: nome/placar de cada time, time de cada jogador, foto do vencedor + foto do local + observações; RPCs `get_latest_match`/`get_match`/`admin_save_match` (criar/editar).
- [`0011_quem_falta.sql`](supabase/migrations/0011_quem_falta.sql) — painel "Faltas" no admin: quem ainda não votou no craque/bagre da última rodada e quem tem notas por dar (`admin_pending_votes`, só leitura).
- [`0012_perfil_export.sql`](supabase/migrations/0012_perfil_export.sql) — perfil do jogador com histórico rodada a rodada (`get_player_profile`) e exportação de dados para backup (`admin_export`). Ambas só de leitura.
- [`0013_temporadas_quimica.sql`](supabase/migrations/0013_temporadas_quimica.sql) — rankings por período/temporada (`get_player_stats_range`) e curiosidades de "química" entre jogadores (`get_player_chemistry`). Ambas só de leitura.
- [`0014_pin.sql`](supabase/migrations/0014_pin.sql) — o jogador muda o próprio PIN (`change_pin`) e o admin define um novo a quem se esqueceu (`admin_set_pin`).
- [`0015_posicoes.sql`](supabase/migrations/0015_posicoes.sql) — **posições dos jogadores** (formação 2-3-1), escolhidas uma vez pelo jogador e depois só alteráveis pelo admin, com histórico de auditoria. Estende `login` e `get_players`.
- [`0016_jogos_agendados.sql`](supabase/migrations/0016_jogos_agendados.sql) — **próximo jogo e escalação**: `matches` ganha data/hora, local, estado e forças das equipas; nova tabela `match_lineup` com o overall no momento do sorteio.
- [`0017_goleiros.sql`](supabase/migrations/0017_goleiros.sql) — **estatísticas de goleiro** (defesas e gols sofridos por rodada), base do ranking e do overall próprios da baliza.

> As três últimas ainda não estão aplicadas — ver [`supabase/APLICAR.md`](supabase/APLICAR.md) para o passo a passo e para o que muda em cada uma.

Duas formas de aplicar:

**Opção A — Supabase CLI:**

```bash
supabase link --project-ref gfowkkchpqoirubumnau
supabase db push
```

**Opção B — SQL Editor:** abre o dashboard do Supabase → *SQL Editor* → cola o conteúdo de cada ficheiro (pela ordem 0001 → 0002 → … → 0016 → 0017) → *Run*.

## Qualidade

```bash
npm run lint   # eslint 9 (flat config)
npm test       # vitest — motor de sorteio, overall, rankings, conquistas, contagem regressiva
npm run build
```

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
