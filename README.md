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

## Pôr a base de dados de pé

Há **um ficheiro só**: [`supabase/migrations/esquema.sql`](supabase/migrations/esquema.sql).
Tabelas, views, funções RPC, índices, triggers e permissões — tudo o que a app precisa.

Abre o dashboard do Supabase → *SQL Editor* → cola o ficheiro inteiro → *Run*. Ou, com a CLI:

```bash
supabase link --project-ref gfowkkchpqoirubumnau
supabase db push
```

Corre numa base vazia (cria tudo) e numa base já a trabalhar (põe as definições em dia sem tocar
em nenhuma linha). Correr duas vezes é inofensivo.

Até há pouco isto eram 28 ficheiros numerados, aplicados por ordem, que ao longo do tempo
reescreveram as mesmas funções 179 vezes. Foram colapsados na última versão de cada coisa; o
histórico continua no git. O [`supabase/APLICAR.md`](supabase/APLICAR.md) explica o que cada uma
trouxe e as decisões que ficaram pelo caminho — e é lá que estão as poucas operações sobre dados
que **não** entraram no ficheiro, de propósito.

## Qualidade

```bash
npm run lint   # eslint 9 (flat config)
npm test       # vitest — motor de sorteio, overall, rankings, conquistas, contagem regressiva
npm run build
```

O `esquema.sql` cria as tabelas, ativa RLS sem políticas (tabelas fechadas — o browser só fala por RPC) e cria as funções `security definer` que a app chama.

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
supabase/migrations/esquema.sql     schema + funções RPC (a "API")
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
