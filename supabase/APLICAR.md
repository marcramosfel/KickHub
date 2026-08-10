# Como pôr a base de dados em dia

Há **um ficheiro só**: [`migrations/esquema.sql`](migrations/esquema.sql). Abre-o, copia tudo,
cola no **SQL Editor** do Supabase (`gfowkkchpqoirubumnau` → SQL Editor → Run). Acabou.

> **Não apaga nem altera um único dado.** Cria o que falta, actualiza definições, e não toca em
> nenhuma linha das tabelas. Correr duas vezes é inofensivo. Serve tanto para uma base vazia como
> para a que está a trabalhar agora.

As 28 migrações numeradas (`0001` → `0028`) desapareceram desta pasta. Ao longo do tempo
reescreveram as mesmas funções 179 vezes — a `login` sete vezes, a `match_public_json` seis — e
para saber o que estava de pé era preciso ler as 28 por ordem. O `esquema.sql` tem só a última
versão de cada coisa. O que lá estava continua no histórico do git, se alguma vez for preciso.

**Duas coisas ficaram deliberadamente de fora**, no fim do ficheiro, comentadas e explicadas: as
operações que mexem em dados e que já correram uma vez. A principal é a limpeza da tabela
`ratings` da 0027 — se o ficheiro a corresse, aplicá-lo apagava as notas que o grupo está a dar
agora. Para recomeçar a avaliação usa-se o botão do admin, que arquiva antes de limpar.

**Antes de correr, faz o backup**: Admin → IDs → "💾 Backup dos dados" → "Exportar (leve)". Não é
por este ficheiro ser perigoso; é porque um backup antes de mexer na base custa dez segundos.

### A única coisa que muda de comportamento: a `admin_ok` fecha

`admin_ok(senha)` recebe a senha de admin e responde `true` ou `false`. Nunca teve um `revoke` —
é das primeiras migrações, de antes de existir essa disciplina — por isso ficou com o `EXECUTE`
que o Postgres dá ao `PUBLIC` por omissão. Na prática: **qualquer pessoa com a chave publishable
(que está no bundle, por desenho) podia adivinhar a senha de admin à velocidade de HTTP**, com
resposta limpa de sim/não, sem nada registado e sem limite de tentativas.

O `esquema.sql` fecha-a. Nada no frontend a chama — é o porteiro que as outras funções usam por
dentro, e por dentro continua a funcionar, porque são todas `security definer`. As mesmas duas
linhas fecham também a `gen_user_id` e a `slugify`, pela mesma razão.

**Se a senha de admin ainda for a inicial (`pelada2026`), troca-a.** Enquanto esteve aberta, o
custo de a adivinhar era baixo:

```sql
update app_config set admin_pw_hash = crypt('NOVA_SENHA', gen_salt('bf')) where id = 1;
```

### As permissões são escritas a partir do catálogo

Um `grant execute` tem de nomear a assinatura completa da função, e várias mudaram pelo caminho —
a `admin_save_schedule` passou de 5 argumentos para 8. Copiar as linhas antigas dava
`function ... does not exist` e o ficheiro parava. Em vez disso, os dois blocos de permissões
perguntam ao `pg_proc` qual é a assinatura que existe mesmo e aplicam-na. Não há como voltar a
ficar dessincronizado.

São dois grupos, e a fronteira entre eles é a segurança de toda a app: as **internas** perdem o
`EXECUTE` de toda a gente (só são chamadas de dentro de outra função que já validou quem fala), e
as **públicas** são a API, com a validação lá dentro.

### O que a última passagem acrescentou

Tudo aditivo — nenhuma linha existente é tocada, e uma rodada de 2024 continua a valer o que
valia.

| O quê | Onde | Nota |
| --- | --- | --- |
| `match_stats.own_goals` | coluna nova, `default 0` | Autogolos. As rodadas que já existem herdam o 0 no próprio `ADD COLUMN`. **Nunca** soma a `goals`: não entra no ranking de artilheiros nem em nenhuma parcela do overall. |
| `players.availability_status` | coluna nova, `default 'AVAILABLE'` | 🟢 disponível · ✈️ a viajar · 🤕 lesionado · 🔴 indisponível. Estado **geral**, mexido pelo admin. |
| `players.is_member` | coluna nova, `default false` | ⭐ mensalista. Dá prioridade na **ordem** da lista de seleção, nunca seleção automática. |
| `match_availability` | tabela nova | "Vou / não vou" a **um** jogo, respondido pelo próprio. Sem linha = ainda não respondeu, que não é o mesmo que "não vai". |
| `admin_get_match(pw, id)` | função nova | Devolve `match_admin_json` de **qualquer** jogo, não só dos abertos. É o que deixa as rodadas antigas abrirem na mesma página do pós-jogo em vez de terem um formulário próprio. |
| `get_match_call()` | função nova | A convocatória: o jogo mais próximo por acontecer (mesmo em rascunho) e quem já respondeu. Devolve **só** data, local e respostas — nunca a escalação, que continua invisível até ser publicada. |
| `set_my_availability(...)` | função nova | Autentica por PIN **ou** pelo token do telemóvel, como a votação. |
| `admin_set_player_status` / `admin_set_member` | funções novas | Só admin. |
| `draw_disputes` | tabela nova | "Não acho justo este sorteio": uma linha por (jogo, jogador), com um motivo opcional de 140 caracteres. Só se contesta um sorteio **publicado** — em rascunho o grupo nem o viu, e depois do jogo o placar já respondeu. |
| `set_my_dispute(...)` | função nova | Contesta e retira. O nome de quem contesta é público (contestar às escondidas não é contestar); o motivo vai junto. |
| `match_predictions` | tabela nova | Os palpites: `A`, `B` ou `EMPATE`, um por pessoa por jogo, aceites só enquanto o jogo está `PUBLISHED`/`IN_PROGRESS`. O acerto **não** se guarda — deriva-se do placar de agora, senão um resultado corrigido pelo admin deixava a tabela a mentir. |
| `set_my_prediction(...)` / `get_palpiteiros()` | funções novas | Dar o palpite e o ranking de quem mais acerta. |

O estado do jogador e a disponibilidade para um jogo são **conceitos separados na base de
dados**, e é para ficarem assim: um 🟢 disponível pode faltar a esta sexta, e um ✈️ a viajar pode
chegar a tempo da próxima. Cruzá-los numa coluna só perdia as duas informações.

`get_players()` passou a devolver mais colunas. O bloco de drops no topo das funções trata disso
sozinho — `create or replace` não muda tipos de retorno, e é essa a razão de esse bloco existir.

### Bug corrigido: escolher um card não fazia nada

`primary_card` e `nickname` eram **gravados** (`set_my_primary_card`, `set_my_nickname`) e lidos
só pelo `login`. Mas quem desenha os cards é o `juntarEstatisticas` do frontend, e esse come o
`get_players()` — que nunca devolveu nenhuma das duas colunas.

Resultado: `jogador.primaryCard` era sempre `null`, o `cardPrincipal()` caía sempre no card mais
raro, e escolher um card não mudava nada — nem para os outros, nem para o próprio depois de
recarregar a página. As duas colunas passam a sair do `get_players()`.

### Bug corrigido: o card escolhido não chegava ao ranking

`get_players()` já devolvia o `primary_card` (ver acima), mas o **ranking**
continuava a decidir a moldura noutro sítio: `molduraPrincipal()` de
`achievements.js`, que ordenava só por prioridade e nunca olhava para a
escolha. Quem escolhia "Rei dos Craques" via-se na mesma como "Rei da Pelada".

A decisão passou toda para `lib/cards.js` (`cardDoJogador` / `molduraDoJogador`),
que é agora a única porta — usada pelo ranking, pelo modal, pelo perfil e pela
imagem partilhada. Antes eram quatro sítios com três regras diferentes.

A **imagem** partilhada também não sabia que os cards existem: tinha uma
moldura verde fixa e nenhum título, portanto era igual para toda a gente.
Passa a desenhar a faixa do título, a raridade e as cores do card escolhido.

### E ainda

| O quê | Onde |
| --- | --- |
| `set_my_status(...)` | O **próprio jogador** muda o seu estado (🟢✈️🤕🔴). Mesma coluna que o `admin_set_player_status` escreve, por outra porta — autentica por PIN ou pelo token do telemóvel. O admin continua a poder corrigir. |
| `get_curiosidades()` | Números crus para as frases da entrada: confronto Pretos–Brancos, a dupla que mais ganha junta, a maior goleada, o artilheiro, os extremos das notas. A redação vive em `src/lib/frases.js`. |

Sobre as notas nas curiosidades: devolve-se o **valor** mais baixo e o mais alto alguma vez
dados, e mais nada — nem quem deu, nem a quem. "Alguém deu um 0,1" é uma piada de grupo; "o X deu
um 0,1 ao Y" é uma acusação. As notas com nome continuam a passar só pela `avaliacoes_reveladas`,
que as mostra a quem as recebeu.

---

# O que cada mudança trouxe

Daqui para baixo é **referência**, não instruções. Uma secção por migração antiga, na ordem em que
foram escritas, com o que cada uma resolveu e as decisões que ficaram pelo caminho. Nada disto é
preciso para aplicar o `esquema.sql` — serve para quando alguém (tu, daqui a seis meses) precisar
de perceber *porquê*.

---

## 0015 — Posições dos jogadores

**Colunas novas em `players`** (todos os jogadores existentes ficam com os valores por omissão,
nada muda para eles até escolherem):

| coluna | omissão | para quê |
|---|---|---|
| `player_type` | `'FIELD'` | jogador de campo ou `'GOALKEEPER'` |
| `primary_position` | `null` | `GK`, `DEF-L`, `DEF-R`, `MID-L`, `MID-C`, `MID-R`, `ST` |
| `secondary_position` | `null` | opcional |
| `accepts_other_positions` | `true` | aceita jogar noutras posições |
| `position_status` | `'NOT_SELECTED'` | `NOT_SELECTED` → `PENDING_REVIEW` → `APPROVED` / `ADJUSTED_BY_ADMIN` |
| `position_updated_at` / `position_updated_by` | `null` | quando e por quem |
| `position_notice` / `position_notice_at` | `null` | aviso por ler, quando o admin muda a posição |

**Tabela nova:** `player_position_history` — histórico de auditoria, só de leitura, com o antes e
o depois de cada alteração, quem a fez e o motivo.

**Funções novas:** `set_my_positions` (o jogador grava **uma vez**; a segunda tentativa é recusada
pelo servidor com `POSFIXA`), `admin_set_positions`, `admin_approve_positions`,
`ack_position_notice`, `admin_positions_overview`, `admin_position_history`.

**Funções alteradas:** `login` (passa a devolver também as posições e o aviso pendente) e
`get_players` (passa a devolver as colunas de posição). O `get_players` leva `drop` + `create`
porque muda o `returns table` — é a única forma no Postgres.

> **Depois de aplicar:** todos os ~30 jogadores ficam com `NOT_SELECTED` e, à próxima entrada,
> vão para o ecrã de escolha da posição antes de chegarem à Home. Foi a opção escolhida.

## 0016 — Jogos agendados e escalações

**Colunas novas em `matches`:** `kickoff_at`, `location`, `map_url`, `status`, `published_at`,
`team_a_overall`, `team_b_overall`, `balance_pct`, `created_by`, `draw_seed`.

O `status` tem omissão `'COMPLETED'`, por isso **as rodadas que já lá estão continuam a contar
como rodadas jogadas** e aparecem no histórico e nas estatísticas exatamente como antes.

**Tabela nova:** `match_lineup` — quem joga onde, em que equipa, e o **overall no momento do
sorteio** (`overall_at_draw`). É isto que faz o histórico não mudar quando as estatísticas forem
recalculadas. Tem um índice único `(match_id, team, assigned_position)`: é impossível haver dois
jogadores no mesmo lugar da mesma equipa.

**Funções novas:** `admin_save_schedule`, `admin_save_lineup`, `admin_publish_match`,
`get_next_match`, `match_public_json`, `admin_matches_upcoming`, `admin_set_match_status`,
`admin_delete_schedule`.

**Funções alteradas:** `get_matches`, `get_latest_match` e `admin_pending_votes` passam a filtrar
`status = 'COMPLETED'` — sem isto, um jogo agendado para a semana que vem aparecia no histórico e
em "Campeões da semana". `admin_save_match` (registo do resultado) passa a fechar o jogo com
`status = 'COMPLETED'`.

**Proteções:** `admin_delete_schedule` só apaga jogos em `DRAFT` ou `CANCELLED` — nunca uma rodada
já jogada. `admin_publish_match` recusa publicar duas vezes (`JAPUBLICADO`) e recusa publicar sem
escalação (`SEMESCALACAO`). `admin_save_lineup` só aceita jogos em `DRAFT`: um sorteio publicado
não se recalcula.

## 0017 — Estatísticas de goleiro

**Tabela nova:** `goalkeeper_match_stats` (`match_id`, `goalkeeper_id`, `team`, `saves`,
`goals_conceded`). As finalizações enfrentadas e os jogos sem sofrer gol **não** são guardados —
são derivados (`saves + goals_conceded` e `goals_conceded = 0`), para não haver duas versões da
verdade.

**Funções novas:** `admin_save_gk_stats`, `get_goalkeeper_stats` (devolve os números crus mais a
média de gols sofridos de toda a pelada), `get_match_gk_stats`.

O **overall de goleiro é calculado no frontend** (`src/lib/overall.js`), ao lado do overall de
campo — um só sítio, testado, e explicado ao utilizador num painel "Como é calculado o overall do
goleiro?".

## 0018 — Desistências de última hora

**Tabela nova:** `match_substitutions` — uma linha por desistência, com quem saiu, quem entrou, a
equipa, o lugar e os dois overalls. A equipa e o lugar são **copiados** no momento da troca: quem
entrou pode ele próprio desistir depois, e o histórico não pode mudar por isso.

**Funções novas:** `admin_substitute_player` (troca quem desistiu por outro jogador, no mesmo
lugar, e recalcula as forças e o equilíbrio), `admin_undo_substitution` (desfaz a última troca de
um lugar) e a interna `recalcular_forcas_do_jogo`.

**Função alterada:** `match_public_json` passa a devolver `substitutions` e, em cada linha da
escalação, `substitute_for` — é o que faz aparecer o 🔄 no campo e o aviso na página inicial.

**Proteções:** só de `PUBLISHED`/`IN_PROGRESS` (num rascunho volta-se a sortear, num jogo fechado
seria reescrever história); o mesmo jogador não pode ficar duas vezes em campo (`JAESCALADO`);
desfazer é recusado se já houve outra troca por cima (`SUBTROCADA`). `recalcular_forcas_do_jogo`
leva `revoke` do PUBLIC — não pede senha e não pode ser chamada de fora.

> **Nota de desenho:** substituir **não** reequilibra as equipas, de propósito. A troca serve para
> os times ficarem completos; o desequilíbrio que dela vier fica registado e aparece a todos, com
> a indicação de qual a equipa que ficou mais forte e porquê.

## 0019 — Ciclo de vida do jogo (resultado em rascunho, auditoria, fotos, cancelamento)

**Colunas novas em `matches`:** `result_status` (`NONE`/`DRAFT`/`PUBLISHED`), `result_published_at`,
`cancelled_at`, `cancel_reason`, `craque_override`, `bagre_override`.

**Backfill inofensivo:** todas as rodadas `COMPLETED` existentes ficam com `result_status =
'PUBLISHED'` — continuam a contar exatamente como contavam. Nada mais é alterado.

**View nova:** `matches_validas` = a definição ÚNICA de "jogo que conta nas estatísticas"
(`COMPLETED` + resultado publicado). **Todas** as funções de agregação (`get_player_stats`,
`get_player_stats_range`, `get_player_profile`, `get_player_chemistry`, `get_goalkeeper_stats`,
`get_matches`, `get_latest_match`) foram redefinidas em cima dela — um resultado em rascunho ou um
jogo cancelado nunca contamina rankings.

**Tabelas novas:** `match_media` (N fotos por jogo, uma principal — índice único parcial) e
`match_activity` (auditoria por jogo: quem fez o quê, quando).

**Funções novas:** `admin_save_result` (grava/edita o resultado do PRÓPRIO jogo — as linhas são
regravadas, nunca duplicadas; editar um publicado recalcula sem despublicar),
`admin_publish_result` (fecha o jogo e fá-lo contar), `admin_cancel_match` (sai das estatísticas,
fica no histórico com motivo), `admin_add_media` / `admin_set_primary_media` / `admin_delete_media`,
`admin_match_activity`, e a interna `registar_atividade` (com revoke).

**Funções alteradas:** `admin_publish_match` e `admin_substitute_player` passam a registar na
auditoria; `admin_save_match` (caminho antigo da aba "Rodadas antigas") passa a carimbar
`result_status = 'PUBLISHED'` — sem isso, uma rodada gravada por lá ficava invisível;
`match_public_json` devolve o ciclo completo (resultado, cancelamento, stats, fotos);
`admin_matches_upcoming` inclui jogos à espera de resultado e cancelados recentes.

**Craque/bagre:** a votação dos jogadores continua a decidir. Os `*_override` são a correção do
admin (empates, rodadas sem votos) — contam como vencedores nas agregações e ficam na auditoria.

## 0020 — O feed da pelada

**Tabela nova:** `match_publications` — uma linha por publicação (SORTEIO, RESULTADO,
CANCELAMENTO, SUBSTITUICAO), com `payload` = snapshot do que se publicou e `published_at` a
mandar na ordem do feed. O feed ordena pela data de **publicação**, não pela data do jogo.

**Função nova:** `get_feed(limit, before)` — pública, mais recente primeiro, com resumo do jogo e
foto principal. No post de RESULTADO, o craque e o bagre são lidos da votação **atual** (com o
override do admin a mandar): a votação acontece nos dias seguintes à publicação, congelá-los no
payload deixava o destaque sempre vazio.

**⚠️ Funções com assinatura NOVA:** `admin_publish_match` e `admin_publish_result` ganham
`p_resenha text default null` — as versões de 2 argumentos são **removidas** (`drop`), senão o
PostgREST recusava a chamada por ambiguidade. O frontend desta versão já envia o parâmetro; um
frontend antigo contra a base nova falha ao publicar (aplica migração + deploy juntos).

**Funções alteradas:** `admin_cancel_match` e `admin_substitute_player` passam a publicar no feed
(o cancelamento só se o jogo já estava publicado — cancelar um rascunho não é notícia);
`admin_undo_substitution` apaga o post da troca desfeita; `admin_save_result` refresca o payload
do post RESULTADO quando edita um resultado já publicado (o placar do feed nunca fica velho);
`admin_set_match_status` fica restrita a PUBLISHED↔IN_PROGRESS (publicar/fechar/cancelar têm os
seus caminhos próprios — por aqui saíam sem post e até duplicavam o post de sorteio);
`match_json` devolve `gk_stats` e respeita `craque_override`/`bagre_override` (o override manda,
como em todo o lado desde a 0019).

**🔒 Segurança:** `match_json` leva **revoke** do EXECUTE público — era chamável por qualquer
visitante desde a 0010 (default do Postgres) e deixava ler o placar de um resultado em rascunho e
as fotos antes da publicação. Os wrappers (`get_matches`, `get_match`, …) continuam a funcionar.

**Novas:** `admin_update_post` / `admin_delete_post` (editar/apagar publicações) e as internas
`publicar_no_feed` e `payload_resultado` (com revoke).

**Resenhas:** geradas no frontend (`src/lib/resenha.js`, com sequências de `src/lib/streaks.js` e
os títulos de `achievements.js`), com semente reproduzível. O admin corta/edita/regenera antes de
publicar; o texto final segue em `p_resenha` e vira o corpo do post.

## 0021 — Trocas livres na escalação publicada

**Coluna nova:** `match_substitutions.kind` — `DESISTENCIA` (não podia ir) ou `TROCA` (opção do
admin). As linhas que já existirem ficam `DESISTENCIA`, que é o que eram.

**Tabela nova:** `match_swaps` — trocar dois jogadores de time não cabe em `match_substitutions`
(ali há um que sai e um que entra; numa troca continuam os dois a jogar). É esta tabela que dá o
**Desfazer** e a explicação aos jogadores quando o equilíbrio muda sem ninguém ter desistido.

**⚠️ Assinatura NOVA:** `admin_substitute_player` ganha `p_kind` — a versão de 6 argumentos leva
**drop**. Aplica a migração e faz o deploy juntos: com esta versão do frontend contra a base
antiga, até a desistência que funcionava deixa de funcionar (PGRST202).

**Funções novas:** `admin_swap_players` (troca A↔B; goleiro só com goleiro) e `admin_undo_swap`.

**Função alterada:** `match_public_json` devolve `kind` em cada substituição e o array `swaps`.
Sem isto o frontend não distinguia desistência de troca (era a razão de ser da coluna) e uma
troca mudava o equilíbrio sem deixar rasto nenhum para os jogadores.

**Concorrência:** as duas funções trancam as linhas da escalação (`for update`) e verificam
quantas linhas mexeram. Sem isso, dois admins a confirmar em simultâneo gravavam substituições
fantasma ou desfaziam a troca um do outro em silêncio, com o feed a mostrar as duas.

**Códigos de erro novos:** `TROCAGK`, `MESMAEQUIPA`, `JOGOMEXIDO`.

## 0022 — Cards dos jogadores

**Colunas novas em `players`:** `primary_card` (qual o card que o jogador quer exibir) e
`nickname` (o apelido que aparece no card). Ambas `null` por omissão — ninguém fica diferente até
escolher.

**Os cards em si NÃO têm tabela, e é decisão, não esquecimento.** Continua a valer o que ficou
escrito na 0015: títulos derivados dos números do momento nunca se dessincronizam. Quem perde a
artilharia perde o card na mesma hora, sem job nem migração. A base só guarda o que o cálculo não
consegue adivinhar — a *escolha* do jogador. O catálogo e as regras vivem em `src/lib/cards.js`.

**Funções novas:** `set_my_primary_card` e `set_my_nickname` — só o **próprio jogador**, com o
PIN. O admin não escolhe cards por ninguém; `admin_clear_card_choices` apenas **limpa** (card
atribuído por engano, apelido impróprio) e o jogador volta a escolher.

**Funções alteradas:** `get_players` (drop + create, muda o `returns table`) e `login` passam a
devolver `primary_card` e `nickname`. Corpos iguais aos da 0015 — em especial o `voted` do login
continua a ser "já não tem ninguém por avaliar", não "já votou alguma vez".

**Se o card escolhido deixar de estar desbloqueado** (perdeu a artilharia), o frontend mostra o
mais raro que ele tenha e a escolha fica guardada: se voltar a conquistá-lo, volta sozinho. Por
isso a base **não valida** se o código do card existe — ela não conhece o catálogo, e não deve.

## 0023 — Avaliação pós-jogo, overall v2 e candidatos de craque/bagre

**A regra que manda nesta migração:** *nenhum overall pode mudar no dia em que os pesos mudam.*

**Coluna nova em `matches`:** `overall_version`. É acrescentada com omissão **1**, e é assim que
todos os jogos que já existem herdam a versão antiga sem um único `update` a mexer-lhes. Só
depois a omissão passa a **2**, para os jogos futuros. Os jogos já agendados mas ainda **por
jogar** são marcados como 2 (vão acontecer depois desta versão). Um jogo da versão 1 nunca abre
avaliação pós-jogo e nunca é recalculado.

**Como é que os overalls ficam quietos:** um jogador continua na fórmula antiga (70% grupo + 30%
campo) **até receber a primeira avaliação pós-jogo válida**. A partir daí passa a 50% grupo + 25%
campo + 25% companheiros. Quem nunca for avaliado nunca muda de fórmula — e a ausência de
avaliações **nunca** vale zero. Isto é decidido em `src/lib/overall.js` a partir da média e da
contagem que estas funções devolvem (`post_rating_avg` a `null` = ninguém o avaliou).

**Tabela nova:** `post_match_ratings` (jogo, quem avalia, quem é avaliado, 0–5 estrelas). A chave
primária **é** a regra "um voto por companheiro"; há um `check` que impede avaliar-se a si
próprio. Guarda quem votou — para bloquear voto duplo e deixar corrigir — mas **nenhuma leitura
pública devolve o `rater_id`**: só sai a média.

**Colunas novas em `matches`:** `post_rating_status` (`OPEN`/`CLOSED`), `post_rating_opened_at`,
`post_rating_closed_at`. Publicar o resultado abre a votação sozinha; o admin abre, encerra e
reabre em Jogos → o jogo → **Avaliação pós-jogo**.

**Funções novas:** `submit_post_match_ratings` (só companheiros da mesma equipa, só com a votação
aberta, aceita avaliações parciais e corrige as anteriores), `get_my_post_ratings` (o que falta
avaliar, já preenchido) e `admin_set_post_rating_status`.

**Craque e bagre passam a depender do resultado:** `vote_award` só aceita votos de jogos com o
resultado **publicado**, o craque tem de estar na equipa **vencedora** e o bagre na **derrotada**.
Num **empate** (ou numa rodada antiga sem equipas atribuídas) não há lados, e aí concorre toda a
gente que jogou — foi a decisão tomada, e é a mesma régua em `src/lib/awards.js` e em
`elegiveis_premio`. A correção do admin obedece à mesma regra: não se corrige à mão o que a
votação proíbe.

**Se o admin mudar o resultado depois de haver votos**, `admin_save_result` apaga os votos que
deixaram de ser válidos (craque que passou a perdedor, avaliação de quem já não é companheiro) e
regista quantos foram no histórico do jogo. São apagados e não anulados porque craque e bagre
vivem na **mesma linha**, com as duas colunas obrigatórias — não há meia votação. Quem perdeu o
voto volta a ver o cartão de votação.

**Funções alteradas:** `get_player_stats`, `get_player_stats_range` e `get_player_profile` passam
a devolver `post_rating_avg` (a `null` quando não há avaliações) e `post_rating_count`;
`match_json` devolve as médias por jogador daquela rodada e o estado da votação;
`match_public_json` devolve o estado e quantos já avaliaram. **`get_match` passa a filtrar por
jogo válido** — devolvia qualquer jogo com fotos a quem soubesse o id, incluindo resultados ainda
em rascunho (a 0020 fechou o acesso direto a `match_json` por esta mesma razão, mas esta porta
ficara aberta).

**A view `matches_validas` é recriada** — foi criada com `select m.*` antes de estas colunas
existirem, e sem isso as funções não veriam a `overall_version`.

**Códigos de erro novos:** `VOTACAOFECHADA`, `CRAQUEPERDEDOR`, `BAGREVENCEDOR`, `VERSAOANTIGA`,
`AVFECHADA`, `ESTRELAS`, `SEMCOMPANHEIRO`, `SEMEQUIPAS`.

---

## 0024 — Formato do jogo e rodízio de goleiro

Até aqui só existia um formato: 2 goleiros fixos + 12 de campo. Sem dois goleiros no dia, o
admin tinha de marcar jogadores de linha como goleiros (com uma caixa que os tornava goleiros
**permanentes** no ranking) ou fugir pelo rachão, onde o goleiro saía à sorte.

**Colunas novas em `matches`:**

| coluna | omissão | para quê |
|---|---|---|
| `gk_mode` | `'FIXED'` | `'FIXED'` (goleiros fixos) ou `'ROTATING'` (o gol roda) |
| `team_size` | `7` | 5 a 8; hoje só 6 e 7 estão ativos no assistente |
| `gk_rotation_minutes` | `null` | de quantos em quantos minutos troca, opcional |

**Coluna nova em `match_lineup`:** `gk_order` — 1 = começa no gol, 2 = entra a seguir. Fica
`null` no formato de goleiros fixos. É gravada (em vez de recalculada) porque o histórico de
quem foi ao gol muda com o tempo e a escalação publicada tem de continuar a dizer o que o grupo
viu.

**Coluna nova em `players`:** `gk_rotation_ok` (omissão `true`) — "aceitas ir ao gol quando o
rodízio te calhar?". Diferente de `accepts_other_positions`, que é sobre lugares de campo.

**O número de jogadores NÃO muda:** um 7×7 com rodízio usa as mesmas 14 pessoas de sempre. O que
muda é quem conta como goleiro e como o equilíbrio é calculado.

**`admin_save_schedule` é recriada com DROP + CREATE** — ganha parâmetros novos, e acrescentar
parâmetros cria uma *segunda* função em vez de substituir a primeira. As duas a coexistir
tornavam ambígua qualquer chamada antiga (PGRST203, que a app mostrava como "erro de ligação").

**`get_players` também é DROP + CREATE** (muda o `returns table`): passa a trazer `gk_starts` e
`last_gk_start`, que é o que torna a escolha do goleiro justa em vez de aleatória.

**Trigger novo** `match_lineup_gk_order_trg`: as trocas de equipa (0021) apagam e reinserem as
linhas sem conhecer o `gk_order`, e sem isto a ordem ficava com um buraco.

**Códigos de erro novos:** `FORMATOINVALIDO`, `TAMANHOEQUIPA`, `ORDEMRODIZIO`.

---

## 0025 — Votação com prazo, link e fecho

Havia duas votações independentes (craque/bagre e estrelas), sem prazo, sem lembrete e sem link.

**Colunas novas em `matches`:**

| coluna | omissão | para quê |
|---|---|---|
| `voting_status` | `'NONE'` | `NONE` → `OPEN` → `REVIEW` → `CLOSED` |
| `voting_deadline` | `null` | validado no **servidor** — o contador do ecrã é decoração |
| `voting_closed_at` | `null` | quando fechou |
| `voting_quorum_pct` | `50` | abaixo disto vai a `REVIEW` em vez de fechar |
| `craque_final` / `bagre_final` | `null` | vencedor congelado no fecho |

**Tabela nova `player_devices`** — o "lembrar-me neste telemóvel" guarda um **token**, nunca o
PIN. Autoriza ler e votar, e mais nada: trocar PIN, trocar foto e entrar no admin continuam a
exigir o PIN escrito.

**Dois UPDATE de dados** (os únicos de toda esta série, e são precisos):

1. Os jogos com a avaliação aberta passam a `OPEN` com **3 dias de prazo a contar de agora**. Sem
   isto, a primeira leitura depois do deploy fechava-as todas de uma vez (prazo nulo = expirado).
2. As rodadas já jogadas passam a `CLOSED`. **Consequência assumida: deixam de aceitar votos
   novos.** `craque_final` fica a `null` de propósito — quem ganhou nessas rodadas continua a ser
   decidido pela contagem de votos de sempre, para a régua nova não reescrever a história. Se
   faltar mesmo o voto de alguém, o admin reabre em Jogos → Votação.

**`get_matches` e `admin_matches_upcoming` passam a chamar `fechar_votacoes_expiradas()`** — o
fecho é preguiçoso e converge na primeira leitura depois do prazo, sem precisar de `pg_cron`. Se
quiseres fecho ao segundo, agenda a mesma função de 15 em 15 minutos; é idempotente.

**`admin_matches_upcoming` passa a trazer os jogos com votação a decorrer** — um jogo já jogado
saía da agenda do admin, e é precisamente esse que tem votos a contar.

**A view `matches_validas` é recriada** — nasceu com `select m.*` antes destas colunas
existirem, e sem isso as funções não veriam o `voting_status`.

**`vote_award` e `submit_post_match_ratings` passam a ser invólucros** de `submit_round_vote`,
para deixarem de ser uma porta lateral que ignora o prazo.

**Códigos de erro novos:** `PRAZOVOTACAO`, `VOTACAOREVISAO`, `TOKENINVALIDO`.

---

## 0026 — Vitórias acima do esperado

**A única desta série que não escreve nada.** Não cria colunas nem tabelas, não altera uma linha:
são duas views de leitura e dois campos novos nas funções de estatísticas. Aplicar duas vezes é
inofensivo, e desfazer é apagar as views.

A parcela responde a "ganhaste **mais do que era suposto**?" em vez de "ganhaste?". O sorteio já
gravou quem era favorito (`team_a_overall` / `team_b_overall` desde a 0016) e aqui mede-se o
desvio:

```
saldo = resultado_real − resultado_esperado
```

Ganhar sendo favorito a 93% vale +0,07. Ganhar sendo favorito a 74% vale +0,26. Perder como
azarão a 7% custa 0,07.

**Porque não a taxa de vitórias crua.** Foi medida no plantel real antes de se decidir: premiava
amostras de 1 e 2 jogos (uma vitória num jogo dava 100%) e tirava 21 pontos a quem tinha a melhor
avaliação do grupo e quatro derrotas. E luta contra o próprio sorteio — o motor existe para
igualar as equipas, por isso se ele funcionar as taxas convergem todas para 50% e a parcela passa
a medir ruído.

**Views novas:**

| view | o que faz |
|---|---|
| `resultados_esperados` | por rodada: probabilidade prevista (curva logística, escala 100) e resultado real |
| `saldo_esperado_por_jogador` | soma dos desvios e nº de rodadas, por jogador |

**Campos novos** em `get_player_stats` e `get_player_profile`: `wae_saldo` (numeric, `null` quando
não há rodadas medidas) e `wae_matches` (int). São os números **crus** — a conversão para nota e a
transição dos pesos vivem em `src/lib/overall.js`, como nos goleiros. Duas fórmulas em dois sítios
divergem sempre.

**Rodadas que NÃO contam:** as que não têm forças gravadas — ou seja, as anteriores à 0016 e as
criadas à mão no painel "Rodadas antigas". Sem sorteio não há expectativa, e inventar uma seria
pior do que não ter parcela. Hoje isso são 2 das 4 rodadas.

**Os pesos do overall TRANSITAM**, não saltam. À medida que um jogador acumula rodadas medidas,
deslizam da fórmula anterior para a nova (grupo / vitórias / campo / companheiros):

```
0 rodadas → 50 /  0 / 25 / 25    ← exatamente a fórmula anterior
2 rodadas → 46 /  6 / 23 / 25
5 rodadas → 40 / 15 / 20 / 25    ← a nova, completa
```

Somam sempre 100%, em qualquer ponto. **Quem não tem rodadas medidas fica com o overall
exatamente igual ao de antes** — a transição parte de lá.

A alternativa era ligar a parcela de uma vez às 5 rodadas. Mais simples de explicar, mas mediu-se
o custo: um jogador que rendeu **exatamente o esperado** perdia 5 pontos de um dia para o outro,
só por cruzar a fronteira. Um número que cai sem nada ter acontecido em campo é impossível de
explicar a quem o vê. Com a transição, o maior salto entre rodadas consecutivas é 1 ponto.

A incerteza vive no **peso**, não na nota: a nota é o desvio cru e é o peso que diz quanto ela
vale. Amortecer os dois seria contar a mesma coisa duas vezes.

Só na v2 — a v1 continua congelada nos 70/30.

**Sem códigos de erro novos.** Nenhuma função nova de escrita.

---

## 0027 — A avaliação do grupo, outra vez

**Esta apaga dados de propósito.** É a única de toda a série que o faz, e é o ponto do exercício:
o grupo recomeça a avaliação de raiz. **Faz o backup antes** — mas as notas antigas também vão
para `ratings_arquivo` automaticamente, com o número da ronda, antes de a tabela ser limpa.

**O que apaga, ao certo:** só a tabela `ratings` (a nota de 0 a 5 que cada um dá aos outros). Tem
exatamente dois `DELETE`, os dois sobre ela. **Nada mais é tocado** — e vale a pena ser explícito,
porque é a primeira pergunta que isto levanta:

| | tabela | a 0027 mexe? |
|---|---|---|
| 👑 Craques e 🐟 bagres | `award_votes` | **não** |
| ⚽ Gols e 🅰️ assistências | `match_stats` | **não** |
| Rodadas, placares, fotos | `matches`, `match_media` | **não** |
| ⭐ Notas pós-jogo | `post_match_ratings` | **não** |
| 🧤 Defesas e gols sofridos | `goalkeeper_match_stats` | **não** |
| Escalações e rodízio | `match_lineup` | **não** |

Não há cascata: as chaves estrangeiras da `ratings` apontam **para** `players`, não o contrário.

**Consequência imediata:** no dia em que aplicares, toda a gente fica sem a parcela da opinião do
grupo — a mais pesada do overall. As outras continuam a contar na mesma (desempenho em campo,
avaliação dos companheiros, vitórias acima do esperado, craques e bagres), e os pesos
renormalizam entre elas. O overall de toda a gente vai mexer até a ronda nova andar. Não há forma
de evitar isto — é o que "recomeçar" quer dizer.

**Três mudanças:**

| | |
|---|---|
| `score` passa de `int` a `numeric(2,1)` | 3,7 diz o que "3 ou 4" não diz. Com 30 jogadores, seis degraus empilhavam meio plantel no 3 e o sorteio ficava sem como os separar |
| `score` passa a aceitar `NULL` | é o "não conheço este jogador": a linha existe, sai dos pendentes, e não entra em média nenhuma |
| ronda + revelação | `app_config.ratings_round` e `ratings_revealed_at` |

O "não conheço" sai de graça: `avg()` e `count()` do Postgres já ignoram nulos, por isso
`round(avg(r.score))` e `count(r.score)` — que várias funções já usavam — passam a contar só quem
conhece, **sem uma linha de código novo**.

**As notas ficam anónimas até ao último jogador entregar.** Quando a ronda fecha, abre para todos
e cada um vê quem lhe deu o quê, no perfil. A ordem é o que torna isto honesto: revelar antes
faria os últimos votarem já a saber o que receberam, e a nota deixava de ser uma opinião para
passar a ser uma resposta.

Quem nunca votar tranca o grupo todo — daí **Admin → Quem falta votar → "Abrir as notas agora"**,
que força a revelação. A decisão é do admin, mas tem de ser possível tomá-la.

**`submit_ratings` e `admin_reset_ratings` são DROP + CREATE** — eram `returns void` e passam a
`returns json` (para o ecrã saber se a ronda fechou com aquele envio). `CREATE OR REPLACE` não
muda o tipo de retorno.

**Códigos de erro novos:** `SCOREDECIMAL`.

---

## 0028 — Limpeza do que ficou a duplicar

**Não apaga nem um dado.** Não toca em nenhuma linha de nenhuma tabela — só remove **funções**
que deixaram de ser chamadas. Todas as rodadas, notas, gols, votos e escalações ficam onde
estão. Correr duas vezes não faz nada.

Duas listas do painel do admin mostravam a mesma coisa:

| lista | o que era | destino |
|---|---|---|
| ⭐ "Falta dar notas" | corria sobre a tabela `ratings` — **a mesma query** da "Avaliação do grupo". O ⭐ e o nome enganavam: foi escrita na 0011, antes de existirem as estrelas pós-jogo | apagada |
| 🗳️ "Falta votar (craque/bagre)" | olhava para a rodada mais recente **sem olhar ao prazo**, que nem existia quando foi escrita. Desde a 0025 a votação fecha sozinha, por isso listava gente que já não pode votar | apagada — vive em Jogos → Votação da rodada |

A aba passa a chamar-se **"Avaliação do grupo"** e tem uma coisa só.

**Funções removidas** (todas substituídas e sem ninguém a chamá-las):

`admin_pending_votes` · `vote_award` · `submit_post_match_ratings` · `get_my_post_ratings` ·
`get_my_award_votes` · `admin_set_post_rating_status` · `get_stats` · `admin_add_match`

**O que NÃO se apagou, e porquê.** `matches.post_rating_status` (e as duas datas ao lado) é de
facto um espelho de `voting_status`, mantido por um trigger desde a 0025 — estado duplicado.
Fica. Tirá-lo obrigava a reescrever `match_json` e `match_public_json`, que juntas passam das 300
linhas de construtor de JSON e já foram copiadas quatro vezes de migração em migração. Uma quinta
cópia para remover três colunas que um trigger de dez linhas mantém coerentes acrescentava mais
risco do que removia. Quando alguma delas tiver de mudar por outra razão, tira-se então.

---

## Depois de aplicar

1. **Faz um backup antes** — Admin → IDs → "💾 Backup dos dados" → "Exportar (leve)".
2. Corre o `migrations/esquema.sql` no SQL Editor.
3. Faz o **deploy do frontend**. O SQL sozinho não chega: o código novo só chega ao grupo depois
   do rebuild.
4. Admin → **Novo sorteio** → confirma que o passo 1 mostra os dois cartões de formato
   (🧤 goleiros fixos / 🔄 sem goleiros fixos) e o tamanho da equipa.
5. Marca um jogo de teste em modo rodízio e confirma que o passo 3 mostra a ordem do rodízio com
   a justificação ("nunca começou no gol", "3× no gol · última vez há 12 dias").
6. Num jogo já jogado: Admin → **Jogos** → abre-o → **⏹ Encerrar jogo e abrir a votação**.
   Confirma que aparece a mensagem pronta para o WhatsApp com o link `#/votar/<id>`.
7. Abre esse link **noutro telemóvel** (ou numa janela anónima): deve cair direto no ecrã "És
   tu?" e, depois do PIN, na cédula. É este o caminho que tudo isto existe para encurtar.
8. Abre o perfil de um jogador → **"Como se calcula o overall?"**. As linhas têm de **somar ao
   total** — é a verificação que apanha um peso mal ligado. Se ele tiver rodadas com sorteio,
   aparece a linha "🏆 Vitórias acima do esperado".
9. Ainda nesse telemóvel com voto por dar, vai à **Home**: onde estava o craque da última rodada
   deve aparecer **"🔒 Vota para ver"**. Depois de votar, recarrega — o craque, o bagre e as
   estrelas aparecem. O placar e os gols estão sempre à vista, antes e depois.
10. Entra com qualquer conta: deves cair no ecrã de **avaliação do grupo**, um jogador por vez.
    Arrasta a barra de ponta a ponta — o emoji, o título e a frase têm de mudar **a cada 0,2**
    (são 26 reações, de 💀 “Zero absoluto” a 👑 “Craque absoluto”). Confirma também o
    **“🤷 Não conheço este jogador”**.
11. Admin → **Quem falta votar** → em cima aparece "Avaliação do grupo · ronda 2" com a lista de
    quem ainda não entregou e o botão de abrir à força.

### O que esperar da parcela das vitórias, no início

**Quase nada, e é de propósito.** O peso cresce com as rodadas medidas de cada jogador: 3% à
primeira, 6% à segunda, 15% só a partir da quinta. Medido no plantel real no dia em que entrou:
**14 jogadores ficaram exatamente na mesma** (nenhuma rodada medida) e a maior mexida no resto
foram 4 pontos.

Só começa a dizer alguma coisa a partir de **5 rodadas com sorteio** por jogador. Se parecer que
"não está a fazer nada", é isso mesmo a acontecer — não é sinal de estar mal ligada. Para
confirmar, abre o perfil de alguém: a linha das vitórias mostra a percentagem em que está.

Uma consequência prática: rodadas registadas à mão (sem passar pelo assistente) **nunca contam**
para esta parcela. Se quiseres que contem, o jogo tem de nascer no assistente, que é quem grava as
forças das equipas. Hoje isso são 2 das 4 rodadas — metade do histórico é invisível para a
parcela, e a única forma de o corrigir é daqui para a frente.

---

## "Vota para ver" — **não tem migração**

Fica aqui registado por ser a única mudança de comportamento visível ao grupo que **não** precisa
de nada na base de dados: vive toda no frontend e chega com o deploy.

Enquanto um jogador tiver voto por dar numa rodada, o 👑 craque, o 🐟 bagre e as ⭐ médias dessa
rodada aparecem-lhe como "Vota para ver", com um botão para a cédula. O placar, os gols, as
assistências e as fotos ficam à vista — são factos, e quem lá esteve já os sabe.

Só se aplica a quem **pode** votar. Quem não jogou a rodada, quem já votou, e toda a gente depois
de a votação fechar veem tudo.

**Não é uma barreira de segurança**, e convém que fique escrito: os dados vêm na mesma resposta do
servidor e a chave pública está no bundle por desenho. É um empurrão — o que muda é o caminho de
menor esforço, que passa a ser votar. Tornar isto privado a sério obrigava `get_matches` e
`get_match` a deixarem de ser públicas e a decidirem o que devolvem conforme quem pergunta, que é
outra mudança e com outro custo.
