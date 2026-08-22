-- KickHub V2 — ver as notas que recebi, sem descobrir quem as deu.
--
-- Hoje um jogador vê a sua média e o número de avaliações no ranking, e mais
-- nada. Não vê como evoluiu, nem em que jogo foi melhor ou pior — que é a única
-- coisa que torna uma avaliação útil a quem a recebe.
--
-- O que **não** se pode fazer está escrito na política que já existe: a
-- `game_ratings_own_read` só deixa ler as avaliações que a pessoa **deu**. As
-- que recebeu são anónimas de propósito, e continuar assim não é uma limitação
-- desta função — é o produto.
--
-- Portanto devolve-se o agregado por jogo, e nunca a linha. Com uma ressalva
-- que faz a diferença entre agregar e disfarçar: **abaixo de três avaliadores
-- num jogo, a média é a opinião de uma ou duas pessoas identificáveis**. Numa
-- pelada de dez, saber que foste avaliado por duas pessoas e ver a média é
-- praticamente saber quem disse o quê. Esses jogos aparecem com a contagem e
-- sem a nota: diz-se que houve avaliações e não se diz quais.

create or replace function public.get_my_rating_history(p_pelada_id uuid)
returns table (
  game_id uuid,
  played_at timestamptz,
  raters int,
  -- Nulo quando são poucos para agregar em segurança. Nulo não é zero: zero
  -- seria dizer que a pessoa levou nota mínima.
  average numeric
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with eu as (
    select membership.id
    from public.pelada_memberships membership
    where membership.pelada_id = p_pelada_id
      and membership.profile_id = public.current_profile_id()
      and membership.status <> 'removed'
  )
  select
    rating.game_id,
    game.scheduled_at,
    count(*)::int,
    case when count(*) >= 3 then round(avg(rating.stars)::numeric, 2) end
  from public.game_ratings rating
  join public.games game on game.id = rating.game_id
  where rating.pelada_id = p_pelada_id
    and rating.rated_membership_id = (select id from eu)
    and public.is_active_member(p_pelada_id)
  group by rating.game_id, game.scheduled_at
  order by game.scheduled_at desc;
$$;

revoke all on function public.get_my_rating_history(uuid) from public, anon;
grant execute on function public.get_my_rating_history(uuid) to authenticated;
