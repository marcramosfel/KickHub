# Como aplicar as migrações novas (0015 → 0019)

A base de dados tem dados reais. Estas migrações são **aditivas**: só acrescentam colunas,
tabelas e funções. Não apagam nada, não alteram linhas existentes e podem correr duas vezes sem
rebentar (são idempotentes).

Aplica **por ordem**, uma de cada vez, no **SQL Editor** do Supabase
(`gfowkkchpqoirubumnau` → SQL Editor → colar → Run):

1. `0015_posicoes.sql`
2. `0016_jogos_agendados.sql`
3. `0017_goleiros.sql`
4. `0018_desistencias.sql`
5. `0019_ciclo_de_vida.sql`

A app degrada sozinha enquanto não aplicares: as secções que dependem de cada migração mostram
um aviso a dizer qual o ficheiro que falta, em vez de rebentar. Mas o **fluxo de posições só
funciona a partir da 0015** — e sem posições não há sorteio novo.

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

---

## Depois de aplicar

1. **Faz um backup antes** — Admin → IDs → "💾 Backup dos dados" → "Exportar (leve)".
2. Aplica as três migrações por ordem.
3. Entra na app: deves ir parar ao ecrã de escolha de posição.
4. Admin → **Posições** → confirma que vês os ~30 jogadores como "Sem posição".
5. Admin → **Próximo jogo** → o assistente de 7 passos precisa de 2 goleiros + 12 jogadores de
   campo com posição definida. Define-os tu em "Posições" se ninguém tiver escolhido ainda.
6. Faz o **deploy do frontend**. As migrações sozinhas não chegam: o código novo só chega ao grupo
   depois do rebuild.
