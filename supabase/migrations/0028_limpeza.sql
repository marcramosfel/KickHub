-- =====================================================================
--  PELADA BROWNS — Migração 28: limpeza do que ficou a duplicar
--
--  >>> ESTA MIGRAÇÃO NÃO APAGA NEM UM DADO. <<<
--
--  Não mexe em nenhuma linha de nenhuma tabela. Só remove FUNÇÕES que
--  deixaram de ser chamadas — código morto, não informação. Todas as
--  rodadas, notas, gols, votos e escalações ficam exatamente onde estão.
--
--  O que se apaga, e porquê:
--
--    · duas listas do painel do admin mostravam a MESMA coisa. A "Falta
--      dar notas" e a "Avaliação do grupo" corriam ambas sobre a tabela
--      `ratings` — mesmos nomes, mesmos números. A primeira foi escrita na
--      0011, antes de existirem as estrelas pós-jogo, e o ⭐ no título
--      passou a enganar quando elas chegaram;
--
--    · a "Falta votar (craque/bagre)" olhava para a rodada mais recente
--      sem olhar ao PRAZO — que nem existia quando foi escrita. Desde a
--      0025 a votação fecha sozinha, por isso a lista mostrava gente que
--      já não pode votar. Isso vive agora em Jogos → Votação da rodada;
--
--    · o resto são funções substituídas nas migrações 0025 a 0027 e que
--      ficaram sem ninguém a chamá-las.
--
--  Correr duas vezes não faz nada (todos os DROP têm `if exists`).
-- =====================================================================

-- ---------- 1. O PAINEL DUPLICADO ----------
-- Era a fonte das duas listas que saíram. Substituída por
-- `admin_ratings_progress` (0027), que traz a mesma informação mais o
-- número da ronda, o estado (anónimas/abertas) e quem falta.
drop function if exists admin_pending_votes(text);

-- ---------- 2. SUBSTITUÍDAS PELA CÉDULA ÚNICA (0025) ----------
-- A votação passou a ser uma só: `get_round_ballot` para ler e
-- `submit_round_vote` para entregar. Estas eram as duas portas antigas,
-- uma para o craque/bagre e outra para as estrelas.
--
-- Ficaram como invólucros durante uma versão, para nada partir a meio do
-- deploy. Já ninguém as chama.
drop function if exists vote_award(uuid, text, uuid, uuid, uuid);
drop function if exists submit_post_match_ratings(uuid, text, uuid, jsonb);
drop function if exists get_my_post_ratings(uuid, text);
drop function if exists get_my_award_votes(uuid, text);

-- Substituída por `admin_set_voting` (0025), que mexe no estado, no prazo
-- e no quórum em vez de só abrir e fechar as estrelas.
drop function if exists admin_set_post_rating_status(text, uuid, boolean);

-- ---------- 3. LEGADO DE 2024 ----------
-- `get_stats` era a primeira versão das estatísticas (0001), de antes de
-- existirem rodadas. Substituída por `get_player_stats`.
drop function if exists get_stats();

-- `admin_add_match` (0002) criava uma rodada só com gols e assistências.
-- Substituída pelo `admin_save_match` (0010) e, depois, pelo ciclo de vida
-- completo da 0019 (`admin_save_result` / `admin_publish_result`).
drop function if exists admin_add_match(text, date, jsonb);

-- ---------- O QUE NÃO SE APAGA, E PORQUÊ ----------
--
-- `matches.post_rating_status` (e as duas datas ao lado) É de facto um
-- espelho de `voting_status`, mantido por um trigger desde a 0025 — ou
-- seja, estado duplicado. Fica.
--
-- Tirá-lo obrigava a reescrever `match_json` e `match_public_json`, que
-- juntas passam das 300 linhas de construtor de JSON e já foram copiadas
-- de migração em migração quatro vezes. Uma quinta cópia para remover três
-- colunas que um trigger de dez linhas mantém coerentes acrescentava mais
-- risco do que o que removia.
--
-- Quando alguma dessas funções tiver de mudar por outra razão, tira-se
-- então. Fica aqui escrito para não parecer esquecimento.
--
-- `admin_reset_ratings_for` (0005) também fica: reinicia a avaliação de UM
-- jogador (todos voltam a avaliá-lo), que é coisa diferente de recomeçar a
-- ronda toda. Não tem botão hoje, mas continua a fazer sentido.
