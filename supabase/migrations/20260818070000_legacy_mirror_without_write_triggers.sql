-- KickHub V2 — o espelho legado deixa de correr as regras de escrita da app antiga.
--
-- Continuação directa de `20260818050000`, que tirou as restrições CHECK pela
-- mesma razão: as tabelas `public.players`, `matches`, `match_media`, … não são
-- o modelo do KickHub. São um espelho da Pelada Browns, e o que lá entra vem de
-- uma restauração — não de alguém a usar a aplicação antiga.
--
-- Restavam cinco triggers, e fazem duas coisas que um espelho não pode aceitar:
--
--   * `validar_imagem_guardada` (em `players`, `matches`, `match_media`) recusa
--     a linha quando a imagem vem vazia, com `raise exception 'FOTO'`. Só que as
--     imagens deixaram de viajar dentro das linhas de propósito: em base64 fazem
--     o corpo do pedido crescer até o gateway o deixar cair, e agora sobem por
--     Storage. O trigger passou a rejeitar exactamente o que queremos escrever.
--
--   * `preencher_gk_order` e `sincronizar_post_rating_status` **reescrevem** a
--     linha ao gravá-la. Num espelho isso é pior do que rejeitar: a origem diz
--     uma coisa, o espelho guarda outra, e a reconciliação compara o resultado
--     do trigger em vez do que a Browns tem. Estiveram a correr em todas as
--     importações até aqui.
--
-- `match_media.data_url` perde o `not null` pela mesma razão. A coluna guardava
-- a imagem inteira; agora guarda-a só quando a restauração a traz por dentro,
-- que é o caso do `pg_restore` no cutover de produção. No staging, onde os dados
-- atravessam a API, a imagem chega ao bucket por `upload-browns-media.mjs` e a
-- coluna fica vazia. `backfill_browns_content()` continua a projetar a linha de
-- `game_media` a partir da própria existência do registo, não do conteúdo dela.
--
-- Nada disto toca no modelo do KickHub: `games`, `game_media`, `profiles` e o
-- resto mantêm as suas regras, e é lá que a validação tem de estar.

alter table public.match_media alter column data_url drop not null;

do $legacy_triggers$
declare
  v_legacy constant text[] := array[
    'players', 'matches', 'match_stats', 'match_lineup', 'goalkeeper_match_stats',
    'ratings', 'ratings_arquivo', 'award_votes', 'post_match_ratings',
    'match_availability', 'match_activity', 'match_publications',
    'match_predictions', 'match_forecasts', 'match_substitutions', 'match_swaps',
    'draw_disputes', 'draws', 'app_config', 'player_position_history',
    'player_devices', 'match_media'
  ];
  v_trigger record;
begin
  for v_trigger in
    select c.relname as tabela, t.tgname as nome
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and c.relname = any (v_legacy)
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      v_trigger.nome, v_trigger.tabela
    );
  end loop;
end
$legacy_triggers$;
