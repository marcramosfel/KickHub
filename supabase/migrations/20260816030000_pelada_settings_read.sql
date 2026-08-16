-- KickHub V2 — leitura das definições desportivas da pelada.
--
-- O sorteio precisa de saber se a pelada joga com guarda-redes fixos. Sem isto
-- a interface usava o valor por omissão da função de domínio e podia colocar os
-- dois guarda-redes na mesma equipa, numa pelada configurada para os separar.
--
-- Fica numa RPC própria em vez de alargar `list_my_peladas`: mudar o tipo de
-- retorno dessa função obrigaria a largá-la e recriá-la, e ela é lida em todo o
-- produto.

create or replace function public.get_pelada_settings(p_pelada_id uuid)
returns table (
  default_format text,
  default_team_size int,
  goalkeeper_mode text,
  ratings_enabled boolean,
  awards_enabled boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    settings.default_format,
    settings.default_team_size,
    settings.goalkeeper_mode,
    settings.ratings_enabled,
    settings.awards_enabled
  from public.pelada_settings settings
  where settings.pelada_id = p_pelada_id
    and public.is_active_member(p_pelada_id);
$$;

revoke all on function public.get_pelada_settings(uuid) from public, anon;
grant execute on function public.get_pelada_settings(uuid) to authenticated;
