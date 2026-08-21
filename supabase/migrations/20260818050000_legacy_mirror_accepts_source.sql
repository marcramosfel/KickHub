-- KickHub V2 — o espelho legado aceita o que a Browns tem hoje.
--
-- As tabelas `public.players`, `matches`, `match_stats`, … não são o modelo do
-- KickHub: são um espelho da Pelada Browns, restaurado para servir de fonte de
-- reconciliação durante o cutover. As restrições CHECK que trouxeram vieram do
-- baseline da app antiga e ficaram congeladas no dia em que foi cortado.
--
-- A Browns continuou a andar. Já apareceram duas divergências em duas tentativas
-- de importação: primeiro colunas novas (`gk_mode_a`, `gk_mode_b`, `squad_a`,
-- `squad_b`, quando o modo de guarda-redes passou a ser por equipa) e depois um
-- valor de `gk_mode` que `matches_gk_mode_chk` não previa. As que faltam vêm a
-- seguir — `team_size` entre 5 e 8 não sobrevive à primeira rodada de 4x4, e
-- `players_availability_status_chk` não sobrevive a um estado novo.
--
-- Guardar uma cópia velha do domínio de um sistema que continua a evoluir não
-- protege nada: só garante que a importação parte, uma restrição de cada vez,
-- com uma exportação inteira a cada descoberta. A validação pertence à projeção,
-- e é lá que está — `backfill_browns_history()` lê um conjunto fixo de colunas,
-- degrada valores desconhecidos (`else 'scheduled'`) e aborta se golos,
-- assistências, avaliações ou votos deixarem de reconciliar. As tabelas do
-- KickHub mantêm as suas próprias restrições: uma equipa que não seja 'A' ou 'B'
-- continua a ser recusada em `game_lineups`, que é onde importa recusá-la.
--
-- Só caem as CHECK. Chaves primárias, estrangeiras, únicas e `not null` ficam:
-- essas são integridade estrutural, não o domínio de valores de outra app.

do $legacy_checks$
declare
  v_legacy constant text[] := array[
    'players', 'matches', 'match_stats', 'match_lineup', 'goalkeeper_match_stats',
    'ratings', 'ratings_arquivo', 'award_votes', 'post_match_ratings',
    'match_availability', 'match_activity', 'match_publications',
    'match_predictions', 'match_forecasts', 'match_substitutions', 'match_swaps',
    'draw_disputes', 'draws', 'app_config', 'player_position_history',
    'player_devices', 'match_media'
  ];
  v_constraint record;
begin
  for v_constraint in
    select c.relname as tabela, con.conname as nome
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and con.contype = 'c'
      and c.relname = any (v_legacy)
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      v_constraint.tabela, v_constraint.nome
    );
  end loop;
end
$legacy_checks$;
