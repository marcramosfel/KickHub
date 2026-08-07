# Redesenho: configuração do jogo, rodízio de goleiro e fluxo de votação

> Proposta de produto + arquitetura. Nada aqui está implementado — é o plano
> para decidir antes de mexer no código.
> Base analisada: `master` @ `src/` + `supabase/migrations/0001…0023`.

---

## 0. Auditoria do que existe hoje

### 0.1 Criação do jogo

`src/components/admin/MatchWizard.jsx` (1357 linhas) — assistente de **7 passos**:

| Passo | O que faz | Problema |
|---|---|---|
| 1 | data/hora/local | ok, mas é o único sítio com decisões e mistura-se com "jogos já marcados" |
| 2 | escolher **exatamente 2 goleiros** | **não há alternativa**: `N_GOLEIROS = 2` está fixo em `drawEngine.js:32` |
| 3 | confirmar **exatamente 12 de campo** | idem, `N_CAMPO = 12` |
| 4 | verificar posições | ecrã só de leitura — um passo inteiro para mostrar avisos |
| 5 | ecrã só com o botão "Sortear" | passo vazio: um botão a ocupar um passo |
| 6 | rever equilíbrio, trocar à mão | o passo que interessa |
| 7 | publicar + resenha | ok |

**O que falta e o utilizador sente:**

- **Não existe escolha de formato.** Se no dia não há dois goleiros fixos, o
  admin é obrigado a marcar dois jogadores de linha como goleiros no passo 2
  (com a caixa perigosa "goleiro fixo", que os transforma em goleiros
  permanentes no ranking — `MatchWizard.jsx:870-893`).
- **A saída de emergência é o "rachão"** (`QuickDraw.jsx` → `escalarEquipasFixas`),
  que resolve por acidente: nesse caminho o goleiro **sai à sorte**
  (`drawEngine.js:534`), sem histórico, sem justiça, sem o dizer ao grupo.
- **Nem tamanho de equipa nem formação são configuráveis.** `FIELD_SLOTS` tem
  6 lugares fixos (2-3-1) em `positions.js:25`.
- **7 passos para 3 decisões reais** (quando, quem, confirmar).

### 0.2 Balanceamento

`sortearEquipas()` — busca exaustiva: 462 divisões × 2 atribuições de goleiro,
com algoritmo húngaro 6×6 por equipa. É bom código e é exacto. Duas observações:

1. **O goleiro entra na força da equipa** (`montarEquipa`, `strength = gk.overall + …`)
   e o overall de goleiro vem de `calculateGoalkeeperOverall` — escala diferente,
   puxada para 50 por confiança. Somar as duas escalas é discutível, mas é o
   comportamento atual e o pedido é explícito: **em goleiros fixos nada muda**.
2. Quem vai à baliza **fica fora de `outOfPosition`** de propósito
   (`drawEngine.js:305`). Num rodízio isso deixa de ser verdade — é preciso
   dizer que aquele jogador de linha vai começar no gol.

### 0.3 Votação — a raiz do problema de participação

Existem **duas votações independentes**, submetidas em sítios diferentes:

| Votação | Tabela | Onde se vota |
|---|---|---|
| 👑 Craque / 🐟 Bagre | `award_votes` | `StatsScreen` → aba **Rodadas** → `VoteCard` |
| ⭐ Estrelas nos companheiros | `post_match_ratings` (0023) | `StatsScreen` → aba **Rodadas** → `PostMatchRatingCard` |

Caminho real de um jogador para votar hoje:

```
abrir app → login (nome + PIN) → Home → menu → Estatísticas
          → aba "Rodadas" → rolar até ao cartão → votar → rolar → avaliar 6 pessoas
```

**Seis navegações e dois submits.** E ainda:

- **Não há link.** `src/App.jsx` não tem router nenhum: zero `location.hash`,
  zero `URLSearchParams`, zero `history.pushState` (verificado em todo o `src/`).
  Um link partilhado no WhatsApp cai no ecrã de login e perde-se aí.
- **Não há sessão persistida.** Sem `localStorage`/`sessionStorage` — é decisão
  de segurança documentada no README, mas o custo é: **PIN outra vez, sempre**.
- **Não há prazo.** `post_rating_status` é `OPEN`/`CLOSED` mudado à mão pelo
  admin (`GameDetail.jsx:355-363`). O craque/bagre nem isso tem — fica aberto
  para sempre.
- **Não há lembrete.** A Home só mostra o aviso do craque/bagre
  (`HomeScreen.jsx:255-267`); a avaliação por estrelas **não tem aviso nenhum
  na Home** — `App.jsx:103` só conta `award_votes`. Quem não for à aba Rodadas
  nunca sabe que ela existe.
- **Não há mensagem pronta.** `share.js` gera texto do sorteio e do resultado,
  mas nada para "vem votar".
- **Não há incentivo.** Os resultados da rodada ficam visíveis sem votar.

### 0.4 Overall e qualidade dos dados

`overall.js` v2: 50% opinião do grupo + 25% desempenho + 25% avaliação pós-jogo.
A parcela pós-jogo entra **com uma única avaliação** (`avaliacoes > 0`, linha 81) —
sinaliza-se `posJogoProvisorio`, mas o peso já é os 25% inteiros. Com a
participação baixa de hoje, **um 5★ de um amigo mexe 25% do overall de alguém**.
Craque/bagre entram por taxa sobre rodadas jogadas, sem olhar a quantos votaram.

---

## 1. O novo fluxo do administrador

### 1.1 Princípio

> Uma decisão por ecrã, a decisão mais estruturante primeiro, e o assistente
> reconfigura-se a partir dela.

**Desvio consciente ao pedido:** foi pedido "Etapa 1 selecionar jogadores,
Etapa 2 escolher formato". Recomendo o **inverso**. O formato decide quantos
jogadores são precisos e se há goleiros a marcar — escolhê-lo depois obriga a
revalidar a seleção já feita e a mostrar erros do género "escolheste 12, agora
são 14". Com formato primeiro, o ecrã de seleção já nasce com o contador certo
e a lista certa, e é impossível errar. Se preferires a ordem original, o passo 2
tem de ganhar um estado de "seleção invalidada" — dá mais código e pior UX.

### 1.2 Os 4 passos

```
┌─ 1. O JOGO ──────────────────────────────────────────────────┐
│  📅 Data e hora        [ 08/08/2026  21:00 ]                 │
│  📍 Local              [ Browns Sports Resort ]              │
│  🔗 Mapa (opcional)    [ …                    ]              │
│                                                              │
│  FORMATO DO JOGO                                             │
│  ┌────────────────────────┐  ┌────────────────────────┐      │
│  │ 🧤  COM GOLEIROS FIXOS │  │ 🔄  GOLEIRO ROTATIVO   │  ●   │
│  │                        │  │                        │      │
│  │  [minicampo: 1 chip    │  │  [minicampo: 7 chips   │      │
│  │   amarelo no gol +     │  │   iguais + seta        │      │
│  │   6 cinzentos]         │  │   circular no gol]     │      │
│  │                        │  │                        │      │
│  │ Dois jogadores ficam   │  │ Toda a gente joga na   │      │
│  │ na baliza o jogo todo. │  │ linha; o gol roda      │      │
│  │ Precisas de 2 goleiros │  │ durante a partida.     │      │
│  │ + 12 de linha.         │  │ Precisas de 14 de      │      │
│  │                        │  │ linha.                 │      │
│  └────────────────────────┘  └────────────────────────┘      │
│                                                              │
│  TAMANHO DA EQUIPA   ( 5 )( 6 )(•7•)( 8 )   → 7 x 7 · 2-3-1  │
│                                                              │
│  ▸ Opções avançadas                                          │
│    Rodízio a cada [ 10 ] min  ·  Votação fecha [ terça 23:59 ]│
│                                                              │
│                                      [ Continuar → ]         │
└──────────────────────────────────────────────────────────────┘
```

- Cada cartão de formato tem **ícone + minicampo ilustrativo + explicação em
  duas linhas** — é o pedido literal e é o que torna a escolha inequívoca.
- O tamanho da equipa mapeia para uma formação (§6.4). No arranque só 6 e 7
  ficam ativos; 5 e 8 aparecem desativados com "em breve" — melhor do que
  esconder e melhor do que prometer.
- **Rodízio a cada N minutos** só aparece no formato rotativo.
- **Prazo da votação** com valor por omissão calculado (§7.3), editável aqui e
  depois no detalhe do jogo.

```
┌─ 2. QUEM JOGA ───────────────────────────────────────────────┐
│  🔄 Goleiro rotativo · 7 x 7          [ mudar formato ]       │
│                                                              │
│  ●●●●●●●●●●●●○○   12 de 14 escolhidos   (faltam 2)           │
│  🔎 [ procurar…                                     ]        │
│                                                              │
│  ☑ 🖼 Wallace Chagas       MEIA   ✅ validada          78     │
│  ☑ 🖼 Marcos Felipe        ATA    ✅ validada          74     │
│  ☐ 🖼 Diogo Capitão        —      ⚠️ sem posição       50*    │
│  …                                                           │
│                                                              │
│  ⚠️ Diogo Capitão e mais 1 não têm posição definida — o       │
│     sorteio coloca-os, mas ao calhas.  [ definir agora ]     │
│                                                              │
│                        [ ← Voltar ]  [ 🎲 Sortear equipas ]  │
└──────────────────────────────────────────────────────────────┘
```

- **Uma lista só.** Em goleiros fixos, a mesma lista ganha um cabeçalho
  "🧤 Baliza (0 de 2)" no topo com os candidatos sugeridos, e marcar alguém aí
  tira-o automaticamente da contagem de linha (o comportamento já existe em
  `alternarGoleiro`, agora sem mudar de ecrã).
- O passo 4 de hoje (verificar posições) **desaparece como passo** — os avisos
  passam a viver aqui, em linha, resolvíveis sem sair.
- O passo 5 de hoje (só um botão) **desaparece**: sortear é o botão primário
  deste ecrã.

```
┌─ 3. SORTEIO ─────────────────────────────────────────────────┐
│              [ CAMPO 2-3-1 com as duas equipas ]             │
│         🧤 badge "INICIA NO GOL" nos dois escolhidos          │
│                                                              │
│  ⚫ Pretos 512   ⚪ Brancos 509   Δ 3   ⚖️ Excelente · 0,6%    │
│                                                              │
│  🔄 RODÍZIO DE GOLEIRO (equilíbrio calculado sem contar isto) │
│  ⚫ Pretos:  🧤 João  →  Pedro  →  Rui  →  …   [ trocar ▾ ]   │
│      João nunca foi ao gol nas últimas 8 rodadas             │
│  ⚪ Brancos: 🧤 Lucas →  Tiago →  André →  …   [ trocar ▾ ]   │
│                                                              │
│  ▸ Fora da posição principal (2)                             │
│  ▸ Ajustar lugares sem arrastar                              │
│                                                              │
│      [ 🔄 Sortear de novo ]        [ Continuar → ]           │
└──────────────────────────────────────────────────────────────┘
```

```
┌─ 4. PUBLICAR ────────────────────────────────────────────────┐
│  Resumo (quando · onde · formato · forças · equilíbrio)      │
│  📝 Resenha  [ gerada automaticamente, editável ]            │
│  ⚠️ Depois de publicado o sorteio não é recalculado.          │
│              [ 📢 Publicar e partilhar no grupo ]            │
└──────────────────────────────────────────────────────────────┘
```

Publicar passa a **publicar + copiar a mensagem + abrir a partilha** num toque
(hoje são dois ecrãs e o admin tem de ir buscar o texto a outro sítio).

### 1.3 Depois do jogo: um botão, não sete

Hoje, fechar uma rodada é: preencher resultado → guardar rascunho → publicar
resultado → ir à secção "Avaliação pós-jogo" → abrir → e a votação de
craque/bagre nem tem interruptor.

Passa a ser **"⏹ Encerrar jogo"**, que numa transação faz:

1. grava o resultado e publica-o;
2. abre **as duas votações** com o prazo já calculado;
3. cria o post no feed;
4. devolve o **link** e a **mensagem pronta** para o WhatsApp, com botão
   "copiar" e "partilhar" já no ecrã de sucesso.

```
✅ Jogo encerrado — votação aberta até terça, 23:59

┌────────────────────────────────────────────┐
│ ⚽ O jogo terminou!  Pretos 4 x 3 Brancos   │
│ Agora é hora de votar:                     │
│ ⭐ Avalia quem jogou contigo                │
│ 👑 Craque do jogo                          │
│ 😂 Bagre do jogo                           │
│ ⏰ A votação encerra terça-feira às 23:59   │
│ 👉 https://…/#/votar/7f3a…                 │
└────────────────────────────────────────────┘
   [ 📋 Copiar ]  [ 🟢 Enviar no WhatsApp ]
```

### 1.4 Estado da votação, à vista

No painel "Jogos" e na visão geral, cada jogo mostra uma barra:

```
🗳️  9/14 votaram   ▓▓▓▓▓▓▓▓▓░░░░░   fecha em 1d 4h   [ lembrar quem falta ]
```

"Lembrar quem falta" gera a mensagem com os nomes em falta pronta a colar
(aproveita o `FaltasPanel`/`admin_pending_votes` que já existe).

---

## 2. O novo fluxo do jogador

### 2.1 Ver o sorteio (com rodízio)

Quando abre o sorteio publicado, o jogador tem de perceber em **três segundos**
quem começa no gol.

- **No campo:** o chip de quem inicia no gol ganha moldura amarela, ícone 🧤 e
  a etiqueta `INICIA NO GOL` por baixo do nome. No formato rotativo, o chip
  ganha ainda o símbolo 🔄 e o número da ordem.
- **Faixa da equipa:** `⚫ Pretos · 🔄 rodízio a cada 10 min`.
- **Timeline por equipa** (novo bloco, por baixo do campo):

```
⚫ PRETOS — rodízio de goleiro
  🧤 João        0' → 10'   ← começa
     Pedro      10' → 20'
     Rui        20' → 30'
     …
```

- **Destaque pessoal:** se o jogador autenticado estiver na escalação,
  aparece-lhe uma faixa própria: `🧤 Começas no gol` ou `🔄 Vais ao gol aos 20'`.
- **Sem rodízio:** exactamente o que há hoje, mais o badge 🧤 "Goleiro" —
  a diferença entre os dois formatos tem de ser óbvia sem ler texto.
- **Imagem de partilha** (`renderLineupCard`) e **texto** (`resumoSorteio`)
  passam a incluir a ordem do rodízio.

### 2.2 Votar

**Um link → uma cédula → um envio.**

```
Toca no link do WhatsApp
        ↓
┌────────────────────────────────┐
│  🗳️ Votação — Pretos 4 x 3      │
│  És tu?                        │
│  [🖼 Wallace] [🖼 Marcos] …     │  ← só quem jogou este jogo
│  PIN [ • • • • ]               │
│  ☑ Lembrar-me neste telemóvel  │
└────────────────────────────────┘
        ↓  (nas vezes seguintes este ecrã não aparece)
┌────────────────────────────────┐
│  1 de 3 · ⭐ O teu time         │
│  🖼 Pedro    ☆☆☆☆☆              │
│  🖼 Rui      ☆☆☆☆☆              │
│  … (6 pessoas, um scroll)      │
│                    [ Seguinte ]│
├────────────────────────────────┤
│  2 de 3 · 👑 Craque            │
│  (chips só dos vencedores)     │
├────────────────────────────────┤
│  3 de 3 · 😂 Bagre             │
│  (chips só dos derrotados)     │
│         [ ✅ Enviar o meu voto ]│
└────────────────────────────────┘
        ↓
🎉 Votado! + resultados desbloqueados + "faltam 5 votos para fechar"
```

Decisões desenhadas para a taxa de participação:

| Decisão | Porquê |
|---|---|
| **Uma cédula, um submit** | duas votações em dois sítios é a razão nº1 do abandono |
| **Escolher o nome em vez de o escrever** | a lista já é só quem jogou; poupa teclado |
| **"Lembrar-me neste telemóvel"** (token, não o PIN — §5.5) | tira o PIN do caminho a partir da 2ª vez |
| **Sem menus, sem Home pelo meio** | o link entra direto na cédula |
| **Guardar parcial** | quem sai a meio não perde o que já fez (o servidor já aceita parciais) |
| **Resultados só depois de votar** | o incentivo mais barato e mais eficaz que existe aqui |
| **Contador social** | "faltam 5 para fechar" transforma o voto em ação coletiva |
| **Badge "Votante fiel"** | a infra de conquistas já existe (`achievements.js`) |

### 2.3 Lembretes dentro da app

Enquanto houver voto pendente e a votação estiver aberta, uma **faixa fixa no
topo de qualquer ecrã** (não um cartão a meio da Home):

```
🗳️ Falta o teu voto — fecha em 1d 4h        [ Votar (40s) ]
```

Nas últimas 6 horas fica cor de aviso: `⏰ Fecha hoje às 23:59`.

---

## 3. Alterações na interface

| Ficheiro | Alteração |
|---|---|
| `src/components/admin/MatchWizard.jsx` | reescrever para 4 passos; extrair `PassoFormato`, `PassoElenco`, `PassoSorteio`, `PassoPublicar` para ficheiros próprios (1357 linhas num ficheiro é o que torna cada mudança arriscada) |
| `src/components/admin/FormatoPicker.jsx` **novo** | cartões de formato + tamanho de equipa + minicampo ilustrativo |
| `src/components/admin/RodizioPanel.jsx` **novo** | ordem do rodízio no passo 3, com justificação ("nunca foi ao gol nas últimas 8") e troca manual |
| `src/components/admin/GameDetail.jsx` | botão único **Encerrar jogo**; painel de votação com barra de progresso, prazo, "lembrar quem falta"; estado **Revisão do admin** (§8) |
| `src/components/FootballPitch.jsx` | badge 🧤 `INICIA NO GOL`, marca 🔄 + ordem, faixa de rodízio no cabeçalho da equipa |
| `src/components/RodizioTimeline.jsx` **novo** | timeline por equipa (usada no sorteio, na Home e no detalhe do jogo) |
| `src/components/NextMatch.jsx` | inclui a timeline + destaque pessoal |
| `src/components/BallotScreen.jsx` **novo** | a cédula única (3 passos, um submit) |
| `src/components/QuickLogin.jsx` **novo** | escolher-se na lista do jogo + PIN + "lembrar-me" |
| `src/components/VotingBanner.jsx` **novo** | faixa fixa com prazo e contagem |
| `src/components/StatsScreen.jsx` | deixa de hospedar votação; `VoteCard` e `PostMatchRatingCard` são absorvidos pelo `BallotScreen` |
| `src/components/HomeScreen.jsx` | cartões de voto substituídos pela faixa; resultados da rodada tapados até votar |
| `src/App.jsx` | **router por hash** (`#/votar/:id`, `#/jogo/:id`, `#/perfil/:id`) + arranque de sessão por token de dispositivo |
| `src/lib/share.js` | `mensagemDeVotacao(jogo, url)`; rodízio no `resumoSorteio` e no `renderLineupCard` |
| `src/lib/formacoes.js` **novo** | registo de formações por tamanho de equipa |
| `src/theme.js` | tokens para os estados de votação (aberta / a fechar / em revisão / fechada) |

**Consistência visual** — três regras a aplicar de uma vez, já que se mexe em
tudo isto: (1) 🧤 é sempre goleiro e 🔄 é sempre rodízio, em qualquer ecrã;
(2) o par verde/amarelo já significa "feito/pendente" em `chip()` — a votação
usa o mesmo e não inventa cores; (3) todo o estilo novo passa por `theme.js`,
sem literais novos espalhados (há ~40 cores literais em `MatchWizard.jsx` que
esta reescrita é a oportunidade de eliminar).

---

## 4. Alterações na base de dados

Migração nova, aditiva e idempotente, no estilo das anteriores.

### `0024_formato_e_rodizio.sql`

```sql
-- FORMATO DO JOGO -------------------------------------------------------
alter table matches add column if not exists gk_mode text not null default 'FIXED';
alter table matches add column if not exists team_size int not null default 7;
alter table matches add column if not exists gk_rotation_minutes int;

alter table matches add constraint matches_gk_mode_chk
  check (gk_mode in ('FIXED','ROTATING'));
alter table matches add constraint matches_team_size_chk
  check (team_size between 5 and 8);

-- ORDEM DO RODÍZIO ------------------------------------------------------
-- 1 = inicia no gol, 2 = entra a seguir, … ; null no formato FIXED.
alter table match_lineup add column if not exists gk_order int;

create unique index if not exists match_lineup_gk_order_uidx
  on match_lineup (match_id, team, gk_order) where gk_order is not null;

-- QUEM ACEITA IR À BALIZA ----------------------------------------------
alter table players add column if not exists gk_rotation_ok boolean not null default true;

-- HISTÓRICO DE QUEM COMEÇOU NO GOL (para a justiça do rodízio) ----------
-- Não é tabela nova: deriva-se de match_lineup. Só falta o índice.
create index if not exists match_lineup_gk_starts_idx
  on match_lineup (player_id, is_goalkeeper) where is_goalkeeper;
```

> **Nota importante:** `match_lineup_slot_uidx` já garante um jogador por
> `(match_id, team, assigned_position)`. No rodízio 7×7 continuam a ser 7
> lugares por equipa (GK + 6 de campo) — **o número de jogadores não muda**, só
> muda quem é considerado goleiro e como o equilíbrio é calculado. Nenhuma
> restrição existente é violada.

### `0025_votacao.sql`

```sql
-- ESTADO ÚNICO DA VOTAÇÃO ----------------------------------------------
alter table matches add column if not exists voting_status text not null default 'NONE';
alter table matches add column if not exists voting_deadline timestamptz;
alter table matches add column if not exists voting_closed_at timestamptz;
alter table matches add column if not exists voting_quorum_pct int not null default 50;

alter table matches add constraint matches_voting_status_chk
  check (voting_status in ('NONE','OPEN','REVIEW','CLOSED'));

-- Resultado congelado no fecho (hoje é recalculado a cada leitura, o que
-- faz o passado mudar quando alguém edita um jogo antigo).
alter table matches add column if not exists craque_final uuid references players(id) on delete set null;
alter table matches add column if not exists bagre_final  uuid references players(id) on delete set null;

-- `post_rating_status` (0023) fica sincronizada por trigger durante uma
-- versão, para não partir o que já lê essa coluna.

-- SESSÃO PERSISTENTE SEM GUARDAR O PIN ----------------------------------
create table if not exists player_devices (
  token        uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '180 days',
  revoked_at   timestamptz
);
alter table player_devices enable row level security;
create index if not exists player_devices_player_idx on player_devices (player_id);
```

**Decisões de modelo, explicadas:**

- `voting_status` é **um eixo só**. Hoje há `post_rating_status` para as
  estrelas e nada para o craque/bagre — dois comportamentos, duas UIs, uma
  votação a menos na cabeça do admin.
- `craque_final`/`bagre_final` congelam o vencedor no fecho. Hoje
  `get_player_stats` recalcula o craque de **todas** as rodadas a cada
  chamada; editar uma rodada de há seis meses reescreve a história e os títulos.
- `player_devices` guarda um token, **nunca o PIN**. Mantém a promessa do
  README ("o PIN só existe em memória durante a sessão") e mesmo assim tira o
  PIN do caminho a partir do segundo voto. Revogável pelo próprio e pelo admin.

---

## 5. Alterações nas APIs (RPC)

### 5.1 Agendamento com formato

```sql
admin_save_schedule(p_pw, p_id, p_kickoff, p_location, p_map_url,
                    p_gk_mode text default 'FIXED',
                    p_team_size int default 7,
                    p_gk_rotation_minutes int default null,
                    p_voting_deadline timestamptz default null)
```
Parâmetros novos com default ⇒ as chamadas atuais continuam a funcionar.

### 5.2 Escalação com rodízio

`admin_save_lineup` não muda de assinatura: lê `gk_order` de cada linha do
`p_lineup` (o corpo já lê chave a chave — `0016`, linhas 160-205). Validações
novas: em `ROTATING`, `gk_order` tem de cobrir `1..team_size` sem buracos em
cada equipa; em `FIXED` tem de vir nulo.

### 5.3 Encerrar o jogo num só passo

```sql
admin_close_game(p_pw, p_match, p_score_a, p_score_b, p_stats, p_gk_stats,
                 p_notes, p_resenha, p_deadline timestamptz default null)
  returns json  -- { match, voting_deadline, share_url, share_text }
```
Faz `admin_save_result` + `admin_publish_result` + abre a votação + calcula o
prazo + publica no feed, **numa transação**. Os RPC antigos ficam (o admin
continua a poder fazer passo a passo), mas o botão grande chama este.

### 5.4 A cédula única

```sql
get_round_ballot(p_voter, p_pin, p_match)   -- ou p_token, ver 5.5
  returns json -- { match, my_team, teammates[{id,name,photo,stars}],
                 --   craque_candidates[], bagre_candidates[],
                 --   deadline, already_voted, voters_count, total_players }

submit_round_vote(p_voter, p_pin, p_match, p_craque, p_bagre, p_ratings jsonb)
  returns json -- { ok, voters_count, total_players }
```

`submit_round_vote` reaproveita, em transação, os corpos de `vote_award` e
`submit_post_match_ratings` (§9 e §4 da `0023`), mais:

- **prazo:** `if now() > m.voting_deadline then raise exception 'PRAZOVOTACAO'`;
- **estado:** só com `voting_status = 'OPEN'`;
- **parcial:** aceita `p_craque`/`p_bagre` nulos (só estrelas) e `p_ratings`
  vazio (só craque/bagre) — quem sai a meio não perde o que fez.

### 5.5 Sessão por dispositivo

```sql
issue_device_token(p_id, p_pin, p_label text)  returns uuid   -- valida o PIN
login_with_device(p_token uuid)                returns json   -- sessão, sem PIN
revoke_device(p_id, p_pin, p_token uuid)       returns void
```

**Limite de privilégio, de propósito:** um token de dispositivo autentica
**leitura e voto**. Trocar PIN, trocar foto ou entrar no admin continuam a
exigir o PIN escrito. O risco de um telemóvel emprestado fica contido em
"votou por ti", não em "mudou-te a conta".

### 5.6 Fecho e revisão

```sql
fechar_votacoes_expiradas()      -- interna; idempotente
admin_voting_review(p_pw, p_match)                    returns json
admin_finalize_voting(p_pw, p_match, p_craque, p_bagre) returns json
```

`fechar_votacoes_expiradas()` é chamada no início de `get_matches`,
`get_next_match` e `get_round_ballot`. **Fecho preguiçoso, sem infraestrutura
nova** — o estado converge na primeira leitura depois do prazo. Se quiseres
fecho pontual ao segundo, acrescenta-se `pg_cron` a chamar a mesma função de
15 em 15 minutos; a função é a mesma e é idempotente.

Ao fechar:
- **quórum atingido e sem empate relevante** → `voting_status = 'CLOSED'`,
  grava `craque_final`/`bagre_final`, publica no feed;
- **caso contrário** → `voting_status = 'REVIEW'` e o jogo aparece no painel do
  admin com um badge vermelho.

### 5.7 Justiça do rodízio

```sql
get_gk_rotation_stats(p_player_ids uuid[])
  returns table(player_id uuid, starts int, last_start date, rounds_since int)
```
Uma chamada no passo 2 do assistente alimenta o motor de sorteio. Alternativa
com menos código: acrescentar `gk_starts` e `last_gk_start` a `get_players()` —
recomendo esta, porque o assistente já carrega `get_players`.

### 5.8 Erros novos (para `src/api.js`)

| Código | Mensagem |
|---|---|
| `PRAZOVOTACAO` | A votação desta rodada já fechou. |
| `VOTACAOREVISAO` | Esta votação está em revisão pelo admin. |
| `FORMATOINVALIDO` | Esse formato de jogo não existe. |
| `TAMANHOEQUIPA` | O número de jogadores não bate certo com o formato escolhido. |
| `ORDEMRODIZIO` | A ordem do rodízio tem de cobrir todos os jogadores da equipa. |
| `TOKENINVALIDO` | Esta ligação expirou — entra com o teu PIN. |
| `SEMGOLEIROS` | Ninguém neste jogo aceita ir à baliza. |

---

## 6. Alterações no algoritmo de balanceamento

### 6.1 Com goleiros fixos — **nada muda**

`sortearEquipas()` fica byte a byte como está. É o pedido e é a decisão certa:
os testes em `drawEngine.test.js` (930 linhas) continuam verdes e nenhum
sorteio histórico deixa de ser reproduzível pela sua semente.

### 6.2 Sem goleiros fixos — função nova

```js
export function sortearEquipasRotativo({ jogadores, seed, historicoGol, tamanho = 7 })
```

**Fase 1 — equilibrar, ignorando quem vai ao gol.**

Os 14 são todos jogadores de linha. Divide-se em 7+7 (com o índice 0 fixo na
equipa A ⇒ `C(13,6) = 1716` divisões reais, contra 462 no modo fixo).

O custo de cada divisão é:

```
custo = |ΣA − ΣB| · PESO_DIFERENCA
      + (penalizacaoEstrutural(A) + penalizacaoEstrutural(B)) · PESO_PENALIZACAO
      + |médiaA − médiaB| · PESO_MEDIA
```

`penalizacaoEstrutural(equipa)` = **um húngaro 7×7** em que:
- a coluna `GK` custa **0 para toda a gente**;
- as outras 6 colunas são os `FIELD_SLOTS` com `penalizacaoDe()` de sempre.

Uma coluna de custo zero faz o húngaro escolher sozinho **o jogador cuja saída
para a baliza custa menos** e distribuir optimamente os outros 6. O resultado é,
por construção, `min` sobre todas as escolhas possíveis de goleiro — ou seja,
**a qualidade posicional da equipa não depende de quem for escolhido para o gol**.
É exactamente a garantia pedida, e sai de graça: 3432 subconjuntos distintos ×
1 húngaro 7×7, em vez de × 7 húngaros 6×6. Custo comparável ao sorteio de hoje.

**Fase 2 — só agora se escolhe quem começa no gol.**

Para cada equipa, ordena-se os 7 por um **score de justiça** (nada de custo
posicional aqui — a fase 1 já garantiu que qualquer escolha é aceitável):

```
score = 1000 × (aceita ir à baliza ? 0 : 1)      // opt-out manda
      +  100 × vezes_que_iniciou_no_gol           // menos vezes, primeiro
      -    5 × rodadas_desde_a_última_vez         // há mais tempo, primeiro
      +    2 × (posição principal = ATA ? 1 : 0)  // desempate suave
      +        random() // semeado, para não ser sempre o mesmo a empatar
```

O **menor score inicia no gol**; a ordem completa dá o rodízio (`gk_order`
1..7). Depois corre-se um húngaro 6×6 sobre os restantes para os lugares de
campo.

**Consequências assumidas, e como se mostram:**

- A colocação final pode ficar ligeiramente pior do que o óptimo estrutural da
  fase 1 (o goleiro escolhido por justiça pode não ser o que o húngaro
  escolheria). O ecrã mostra sempre a lista "fora da posição" e o admin troca
  se quiser — o rodízio faz isto voltar ao lugar em minutos, de qualquer forma.
- **A força da equipa é a soma dos 7 overalls de linha.** Não há mistura de
  escalas: `calculateGoalkeeperOverall` não entra no formato rotativo. Isto
  torna o equilíbrio rotativo **mais** fiável do que o fixo, não menos.
- Se ninguém na equipa aceitar ir à baliza, o `1000` aplica-se a todos e a
  ordenação continua a funcionar; o admin recebe o aviso `SEMGOLEIROS` a dizer
  que a regra foi ignorada por falta de voluntários.

### 6.3 Rachão (`escalarEquipasFixas`) passa a usar a mesma justiça

Hoje o goleiro do rachão **sai à sorte** (`drawEngine.js:534`). Passa a usar o
mesmo score da fase 2. Um ficheiro, uma função, uma régua.

### 6.4 Formações por tamanho de equipa

`src/lib/formacoes.js`:

```js
export const FORMACOES = {
  6: { nome: '2-2-1', slots: ['DEF-L','DEF-R','MID-L','MID-R','ST'] },
  7: { nome: '2-3-1', slots: ['DEF-L','DEF-R','MID-L','MID-C','MID-R','ST'] }, // hoje
  // 5 e 8 desenhados, desativados no arranque
}
```

`FIELD_SLOTS` deixa de ser importado directamente pelo motor: passa a vir de
`formacaoDe(tamanho).slots`. É a mudança que abre 6×6 e 8×8 sem tocar no
algoritmo — o húngaro é n×n, não 6×6.

---

## 7. Alterações no cálculo do Overall

O pedido era aumentar a participação; a consequência inevitável é que **o
overall tem de ser honesto sobre quantos dados tem**. Três alterações,
por ordem de importância.

### 7.1 A média é a média de quem votou — **decidido**

Chegou a existir aqui uma proposta de amortecer a parcela até seis avaliações
(`AVALIACOES_CONFIANCA`), para um voto isolado não decidir um quarto do
overall. Foi implementada e depois **retirada por decisão do grupo**.

A regra que vale: **a parcela dos companheiros pesa os 25% a partir da
primeira nota.** Quem não vota dentro do prazo não influencia a nota de quem
foi avaliado, e o jogador avaliado não fica pendurado na participação dos
outros.

O argumento contra o amortecimento, e é bom: o jogador não escolhe quem vota
nele. Amortecer transferia o custo da falta de participação para quem não
teve culpa dela.

O risco que se assume em troca: com uma avaliação só, um 5,0 vale tanto como
um 5,0 de sete pessoas. As defesas que ficam são as outras — o prazo, o
quórum nos prémios (§7.2) e a transparência (o painel diz sempre de quantas
notas vem a média).

O que sobreviveu da ideia é `pesosEfetivos`: os pesos **depois** de as
parcelas em falta saírem da conta. São os únicos que explicam o número, e sem
eles o painel "Como se calcula o overall?" mostrava linhas que não somavam ao
total.

### 7.2 Quórum nos prémios

`taxaCraque`/`taxaBagre` contam hoje todas as rodadas. Passam a contar só as
rodadas **fechadas com quórum** (`voting_status = 'CLOSED'`). Uma rodada em que
votaram 3 de 14 não deve valer o mesmo que uma com 12 de 14.

Implementação: `get_player_stats` filtra `matches_validas` por
`voting_status = 'CLOSED'` no cálculo de craque/bagre (as restantes colunas
ficam iguais).

### 7.3 Média aparada (opcional, recomendado)

Com ≥5 avaliadores, descarta-se a estrela mais alta e a mais baixa antes da
média. Elimina o "5★ do melhor amigo" e o "0★ da picuinha" sem acusar ninguém.
Uma linha na view `post_ratings_validas` (percentis) ou no `avg` da
`get_player_stats`.

### 7.4 Rodízio e estatísticas de goleiro

`goalkeeper_match_stats` tem PK `(match_id, goalkeeper_id)` — **suporta já 7
goleiros por jogo**. Mas se as passagens de rodízio entrarem no ranking de
goleiros, ele deixa de significar alguma coisa (um atacante com 10 minutos no
gol e uma defesa ficaria com 100% de eficácia).

Regra proposta:

- **Ranking e overall de goleiro contam só jogos `gk_mode = 'FIXED'`.**
- Passagens de rodízio ficam registadas e aparecem **no perfil** ("🧤 12
  minutos no gol · 3 defesas"), sem entrar no ranking.
- No formulário de resultado, em modo rotativo, os campos de defesas/gols
  sofridos são **opcionais e agrupados por equipa** — ninguém vai cronometrar
  sete turnos, e pedir isso é a forma mais rápida de o admin deixar de
  preencher resultados.

### 7.5 O que **não** muda

`OVERALL_VERSION`, os pesos 50/25/25 e todo o ramo v1. Jogos com
`overall_version = 1` continuam intocados — a promessa da `0023` mantém-se.

---

## 8. Casos de borda a tratar antes de implementar

### Formato e sorteio

1. **Número de jogadores não bate com o formato.** 13 para um 7×7. Bloquear com
   mensagem accionável ("faltam 1 — muda para 6×6 ou usa o sorteio rápido"),
   nunca com "erro".
2. **Mudar de formato a meio do assistente** com jogadores já escolhidos:
   manter a seleção e revalidar o contador; nunca limpar em silêncio.
3. **Retomar um rascunho criado noutro formato.** `retomar()` tem de ler
   `gk_mode`/`team_size` do jogo e reconfigurar o assistente — hoje limpa
   escolhas por id de jogo (`MatchWizard.jsx:360-384`), agora também por formato.
4. **Jogo publicado em modo fixo, editado para rotativo** (ou o inverso): só
   permitido enquanto `status = 'DRAFT'`. Depois de publicado, `JOGOFECHADO`.
5. **Toda a gente com `gk_rotation_ok = false`.** Não bloquear: avisar e
   ignorar a regra (§6.2).
6. **Um único goleiro registado no grupo** e formato fixo escolhido: o passo 2
   tem de o dizer antes de deixar avançar, não no passo do sorteio.
7. **Substituição depois de publicado** (`admin_substitute_player`) de quem
   tinha `gk_order = 1`: quem entra herda a ordem; se entrar alguém com
   `gk_rotation_ok = false`, avisar e recalcular a ordem da equipa.
8. **`match_lineup_gk_order_uidx`** impede duas ordens iguais na mesma equipa —
   a troca manual de ordem tem de ser feita como *swap*, nunca como dois
   updates independentes (senão colide a meio).
9. **Jogos antigos** têm `gk_mode = 'FIXED'` por default e `gk_order` nulo: toda
   a UI de rodízio tem de desaparecer, não mostrar-se vazia.
10. **Reprodutibilidade da semente.** A semente atual é `matchId#tentativa`. O
    score de justiça depende do **histórico**, que muda com o tempo — o mesmo
    sorteio repetido daqui a um mês dá outro goleiro inicial. Guardar
    `gk_order` na escalação (é o que a `0024` faz) resolve: o histórico
    reconstitui-se, o rodízio não.

### Votação

11. **Prazo por omissão em jogos fora de sexta.** A regra "sexta → terça 23:59"
    não pode ser literal. Proposta: `kickoff + 4 dias, arredondado para as
    23:59 desse dia, no fuso `Europe/Lisbon`` — coincide com terça para os
    jogos de sexta e faz sentido para todos os outros. Sempre editável.
12. **Fuso horário.** `countdown.js` já fixa `Europe/Lisbon`. O prazo tem de ser
    calculado nesse fuso e **guardado em `timestamptz`** — um jogador em viagem
    tem de ver o mesmo instante, não a mesma hora local.
13. **Voto a chegar no segundo do fecho.** O servidor decide (`now() > deadline`),
    não o browser. O contador do ecrã é decoração.
14. **Resultado editado depois de a votação abrir.** `limpar_votos_invalidos`
    (0023) já apaga votos que o novo placar invalidou — mas agora tem de
    **reabrir** a votação para quem perdeu o voto e **avisar** essas pessoas,
    senão ficam com "já votei" e sem voto contado.
15. **Empate no craque/bagre.** Regra explícita: empate no topo com ≥2 nomes
    → `REVIEW`. Se o admin não desempatar até X dias, todos os empatados contam
    (é o comportamento de hoje, `get_player_stats`) — mas isso passa a ser uma
    decisão registada, não um acidente.
16. **Quórum não atingido.** `REVIEW`. O admin pode: (a) validar assim mesmo,
    (b) estender o prazo, (c) anular a votação da rodada (conta o jogo, não
    conta o prémio). As três têm de estar no ecrã — a ausência da (c) é o que
    leva a inventar resultados.
17. **Empate no jogo (0×0, 3×3).** `elegiveis_premio` já resolve (toda a gente
    concorre). A cédula tem de o **explicar**, não só permitir.
18. **Jogo sem equipas atribuídas** (rodadas antigas): sem estrelas possíveis
    (`SEMEQUIPAS`), só craque/bagre. A cédula mostra 2 passos em vez de 3.
19. **Jogador removido do plantel** com voto dado: `on delete cascade` já
    limpa. Confirmar que o contador de participação não fica a dizer "9/14"
    quando o total baixou para 13.
20. **Anonimato.** As estrelas são anónimas por promessa explícita
    (`PostMatchRating.jsx:66`). O ecrã de **Revisão do admin** não pode mostrar
    quem deu que estrela — só médias e contagens. O craque/bagre, esse, tem
    `voter_id` visível ao admin desde a `0002`; decidir e **escrever no ecrã**
    qual das duas regras vale para cada bloco.
21. **Reabrir uma votação fechada** recalcula prémios já congelados em
    `craque_final`. Permitir só em `REVIEW`, ou exigir dupla confirmação com
    aviso de que títulos e conquistas mudam.

### Link e sessão

22. **Link aberto sem sessão** → `QuickLogin` com a lista **daquele jogo**.
23. **Link aberto por quem não jogou** → ecrã explicativo com o resultado, não
    um erro.
24. **Link aberto depois do prazo** → resultados + "a votação fechou terça".
25. **Link de um jogo cancelado ou apagado** → mensagem, não ecrã em branco.
26. **Token de dispositivo em telemóvel partilhado.** Mitigações: token só
    autoriza ler e votar (§5.5); "sair deste telemóvel" visível no perfil;
    expiração de 180 dias; admin pode revogar todos os tokens de um jogador.
27. **Router por hash e o admin.** O painel de admin **não pode** ganhar rota
    própria — hoje só se lá chega por senha em memória, e um `#/admin` daria a
    ilusão de um sítio bookmarkável que pede senha na mesma. Manter fora do router.
28. **WhatsApp e o `#`.** Alguns clientes cortam links no `#`. Testar; se
    falhar, usar `?m=<id>` e converter para hash no arranque.

### Migração e dados existentes

29. **`post_rating_status` vs `voting_status`.** Durante uma versão os dois
    coexistem sincronizados por trigger; a `0026` remove o antigo. Nunca os
    dois como fonte de verdade ao mesmo tempo.
30. **Jogos abertos no momento do deploy.** O backfill tem de dar
    `voting_status = 'OPEN'` a quem tem `post_rating_status = 'OPEN'` e
    `deadline = now() + 3 dias`, senão fecham todos de uma vez na primeira
    leitura.
31. **`overall_version = 1`** não abre votação nenhuma — a `0023` já garante;
    a `0025` não pode desfazer isso.

---

## Sequência de implementação sugerida

Quatro entregas independentes, cada uma com valor por si:

| # | Entrega | Porquê primeiro |
|---|---|---|
| **1** | Router por hash + token de dispositivo + `BallotScreen` (cédula única) | é aqui que está o problema de participação; funciona **sem** nenhuma mudança no sorteio |
| **2** | `admin_close_game` + prazo + mensagem/link partilháveis + faixa de lembrete | fecha o ciclo do voto; mede-se logo na rodada seguinte |
| **3** | Formato no assistente (4 passos) + `sortearEquipasRotativo` + rodízio na UI | a maior mudança de código; entra com o problema de UX já resolvido |
| **4** | Quórum nos prémios, revisão do admin, formações 6×6 | afinação, com dados reais das entregas 1-3 |

A entrega 1 sozinha deve dar o maior salto de participação: passa de
**seis navegações + PIN** para **um toque no link**.
