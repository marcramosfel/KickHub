-- KickHub V2 — o histórico de um jogador, jogo a jogo.
--
-- O ranking diz quantos golos alguém marcou na pelada inteira. Não diz em que
-- jogo, nem se foi tudo numa noite, nem se vem a subir ou a descer — e é isso
-- que um jogador quer ver quando abre o seu próprio card depois de jogar.
--
-- Não é informação nova: são as mesmas linhas que o ranking já soma, aqui sem
-- as somar. Quem pode ver o ranking pode ver isto, e é por isso que a guarda é
-- a mesma — `is_active_member`. Um histórico visível a quem não é da pelada
-- seria publicar o desempenho de alguém fora do grupo onde ele o produziu.

create or replace function public.get_player_game_history(
  p_pelada_id uuid,
  p_membership_id uuid,
  p_limit int default 20
)
returns table (
  game_id uuid,
  played_at timestamptz,
  goals int,
  assists int,
  saves int,
  -- 'win' | 'draw' | 'loss', ou nulo quando o jogo não tem resultado lançado:
  -- um jogo por registar não é um empate.
  outcome text,
  craque boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with vencedores as (
    -- `pelada_award_winners` está fora do alcance do cliente de propósito: conta
    -- os votos de toda a gente. Aqui é alcançável porque esta função é
    -- `security definer` e só devolve a linha de um jogador de cada vez.
    select winner.game_id
    from public.pelada_award_winners(p_pelada_id) winner
    where winner.award = 'craque' and winner.membership_id = p_membership_id
  )
  select
    game.id,
    game.scheduled_at,
    coalesce(stat.goals, 0),
    coalesce(stat.assists, 0),
    coalesce(stat.saves, 0),
    case
      when result.game_id is null then null
      when result.score_a = result.score_b then 'draw'
      when (lineup.team = 'A') = (result.score_a > result.score_b) then 'win'
      else 'loss'
    end,
    exists (select 1 from vencedores where vencedores.game_id = game.id)
  from public.game_lineups lineup
  join public.games game on game.id = lineup.game_id
  left join public.game_results result on result.game_id = game.id
  left join public.game_player_stats stat
    on stat.game_id = game.id and stat.membership_id = lineup.membership_id
  where game.pelada_id = p_pelada_id
    and game.status = 'played'
    and lineup.membership_id = p_membership_id
    and public.is_active_member(p_pelada_id)
  order by game.scheduled_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 60);
$$;

revoke all on function public.get_player_game_history(uuid, uuid, int) from public, anon;
grant execute on function public.get_player_game_history(uuid, uuid, int) to authenticated;
