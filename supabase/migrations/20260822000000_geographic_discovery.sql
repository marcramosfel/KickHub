-- KickHub V2 — descoberta geográfica.
--
-- A descoberta era por texto: nome ou cidade, e nada mais. O master prompt
-- (§21–24) pede filtros a sério e busca por proximidade, e é explícito quanto
-- ao como: "nunca calcular isso trazendo todas as peladas para o frontend".
-- Portanto a distância calcula-se aqui, com PostGIS e um índice GIST.
--
-- A privacidade da morada é uma definição da pelada e não uma opção do cliente.
-- O ponto exacto NUNCA sai desta função para quem não é membro: o filtro por
-- distância corre sobre a localização verdadeira, mas o que volta é a versão
-- que a pelada autorizou. Filtrar com precisão e devolver com pudor é
-- deliberado — é o que permite "peladas a 5 km de ti" sem revelar o campo.

create extension if not exists postgis with schema extensions;

-- 'exact' faltava. O enum tinha 'hidden', 'city' e 'approximate', mas §23 pede
-- três opções que incluem a morada exacta, e sem este valor não havia como uma
-- pelada dizer "podem ver onde jogamos".
alter table public.peladas
  drop constraint if exists peladas_public_location_precision_check;
alter table public.peladas
  add constraint peladas_public_location_precision_check
  check (public_location_precision in ('hidden','city','approximate','exact'));

-- A coluna é gerada: uma pelada que mude de coordenadas não pode ficar com o
-- ponto velho, e um trigger para manter duas verdades sincronizadas é uma
-- verdade a mais.
alter table public.peladas
  add column if not exists location extensions.geography(Point, 4326)
  generated always as (
    case
      when latitude is null or longitude is null then null
      else extensions.st_setsrid(
        extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326
      )::extensions.geography
    end
  ) stored;

create index if not exists peladas_location_idx
  on public.peladas using gist (location)
  where visibility = 'public' and status = 'active';

create index if not exists peladas_region_idx
  on public.peladas (country_code, region, city)
  where visibility = 'public' and status = 'active';

-- Quando e como a pelada joga. Sem isto não há filtro por dia nem por horário,
-- e §21 pede os dois. `match_weekday` segue o ISO: 1 = segunda, 7 = domingo.
alter table public.pelada_settings
  add column if not exists match_weekday smallint
    check (match_weekday is null or match_weekday between 1 and 7),
  add column if not exists match_time time,
  add column if not exists skill_level text not null default 'mixed'
    check (skill_level in ('casual','mixed','competitive')),
  add column if not exists max_players int
    check (max_players is null or max_players between 4 and 60);

/**
 * O ponto que uma pelada mostra a quem não é membro.
 *
 * Arredondar é a forma honesta de desfocar: mantém a pelada no sítio certo do
 * mapa sem dizer em que campo é. Uma casa decimal são ~11 km (cidade), duas são
 * ~1,1 km (bairro). 'hidden' não devolve nada — nem desfocado.
 */
create or replace function public.public_pelada_point(
  p_precision text,
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language sql immutable
as $$
  select case
    when p_latitude is null or p_longitude is null then null
    when p_precision = 'hidden' then null
    when p_precision = 'exact' then jsonb_build_object('lat', p_latitude, 'lon', p_longitude, 'precision', 'exact')
    when p_precision = 'approximate' then jsonb_build_object(
      'lat', round(p_latitude, 2), 'lon', round(p_longitude, 2), 'precision', 'approximate')
    else jsonb_build_object(
      'lat', round(p_latitude, 1), 'lon', round(p_longitude, 1), 'precision', 'city')
  end
$$;

/**
 * Descobrir peladas públicas, com os filtros de §21.
 *
 * Todos os filtros são opcionais e nulo significa "não filtres por isto" — um
 * ecrã sem filtros escolhidos tem de devolver o mesmo que devolvia antes.
 *
 * `p_radius_km` só tem efeito com um centro; sem coordenadas de referência não
 * há distância nenhuma para medir, e inventar uma era pior do que ignorar o
 * raio.
 */
create or replace function public.discover_peladas(
  p_query text default null,
  p_country_code text default null,
  p_region text default null,
  p_city text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_radius_km numeric default null,
  p_weekday smallint default null,
  p_from_time time default null,
  p_to_time time default null,
  p_format text default null,
  p_skill_level text default null,
  p_only_with_room boolean default false,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  logo_path text,
  country_code text,
  region text,
  city text,
  join_mode text,
  timezone text,
  member_count bigint,
  default_format text,
  frequency text,
  skill_level text,
  match_weekday smallint,
  match_time time,
  max_players int,
  distance_km numeric,
  location jsonb,
  created_at timestamptz
)
language sql stable security definer
set search_path = public, extensions, pg_temp
as $$
  with centre as (
    select case
      when p_latitude is null or p_longitude is null then null
      else extensions.st_setsrid(
        extensions.st_makepoint(p_longitude::double precision, p_latitude::double precision), 4326
      )::extensions.geography
    end as point
  ),
  candidates as (
    select
      p.*,
      s.default_format, s.frequency, s.skill_level, s.match_weekday, s.match_time, s.max_players,
      (select count(*) from public.pelada_memberships m
        where m.pelada_id = p.id and m.status = 'active') as member_count,
      case
        when (select point from centre) is null or p.location is null then null
        -- Metros para quilómetros, com uma casa: a precisão do metro num
        -- filtro de "peladas a 10 km" é ruído, e sugere uma exactidão que a
        -- própria localização desfocada não tem.
        else round((extensions.st_distance(p.location, (select point from centre)) / 1000)::numeric, 1)
      end as distance_km
    from public.peladas p
    left join public.pelada_settings s on s.pelada_id = p.id
    where p.visibility = 'public' and p.status = 'active'
  )
  select
    c.id, c.slug, c.name, c.description, c.logo_path, c.country_code, c.region, c.city,
    c.join_mode, c.timezone, c.member_count,
    c.default_format, c.frequency, c.skill_level, c.match_weekday, c.match_time, c.max_players,
    c.distance_km,
    public.public_pelada_point(c.public_location_precision, c.latitude, c.longitude) as location,
    c.created_at
  from candidates c
  where
    (nullif(trim(p_query), '') is null
      or c.name ilike '%' || trim(p_query) || '%'
      or c.city ilike '%' || trim(p_query) || '%'
      or coalesce(c.region, '') ilike '%' || trim(p_query) || '%')
    and (nullif(trim(p_country_code), '') is null or c.country_code = upper(trim(p_country_code)))
    and (nullif(trim(p_region), '') is null or c.region ilike trim(p_region))
    and (nullif(trim(p_city), '') is null or c.city ilike trim(p_city))
    -- Sem centro o raio não filtra nada; com centro, quem não tem coordenadas
    -- fica de fora, porque não se pode afirmar que está perto.
    and (p_radius_km is null or (select point from centre) is null
      or (c.distance_km is not null and c.distance_km <= p_radius_km))
    and (p_weekday is null or c.match_weekday = p_weekday)
    and (p_from_time is null or (c.match_time is not null and c.match_time >= p_from_time))
    and (p_to_time is null or (c.match_time is not null and c.match_time <= p_to_time))
    and (nullif(trim(p_format), '') is null or c.default_format = trim(p_format))
    and (nullif(trim(p_skill_level), '') is null or c.skill_level = trim(p_skill_level))
    -- "Com vagas" só exclui quem declarou um limite e já lá chegou. Uma pelada
    -- sem limite declarado não é uma pelada cheia.
    and (p_only_with_room is not true or c.max_players is null or c.member_count < c.max_players)
  order by
    case when c.distance_km is null then 1 else 0 end,
    c.distance_km nulls last,
    c.created_at desc,
    c.id
  limit least(greatest(coalesce(p_limit, 24), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

/**
 * Quantas peladas públicas há por região — as páginas "Peladas em Lisboa" de
 * §24, e o que lhes dá conteúdo antes de existir SEO nenhum.
 *
 * Uma região sem nome agrupa-se pela cidade: obrigar toda a gente a preencher
 * `region` só para aparecer aqui era esconder peladas por causa de um campo.
 */
create or replace function public.list_pelada_regions(
  p_country_code text default null,
  p_limit int default 60
)
returns table (
  country_code text,
  region text,
  city text,
  pelada_count bigint
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.country_code, coalesce(nullif(trim(p.region), ''), p.city) as region, p.city, count(*) as pelada_count
  from public.peladas p
  where p.visibility = 'public' and p.status = 'active'
    and (nullif(trim(p_country_code), '') is null or p.country_code = upper(trim(p_country_code)))
  group by p.country_code, coalesce(nullif(trim(p.region), ''), p.city), p.city
  order by count(*) desc, p.country_code, region, p.city
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

/**
 * As definições de descoberta de uma pelada, para quem a administra.
 *
 * Separada de `update_pelada_settings` porque mexe na tabela `peladas` (a
 * morada e a precisão) e não só nas definições desportivas — e porque a
 * precisão da localização é uma decisão de privacidade, não uma regra de jogo.
 */
create or replace function public.update_pelada_discovery(
  p_pelada_id uuid,
  p_region text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_location_precision text default null,
  p_match_weekday smallint default null,
  p_match_time time default null,
  p_skill_level text default null,
  p_max_players int default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.pelada_memberships m
    where m.pelada_id = p_pelada_id and m.profile_id = v_profile_id
      and m.status = 'active' and m.role in ('owner','admin')
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_location_precision is not null
    and p_location_precision not in ('hidden','city','approximate','exact') then
    raise exception 'INVALID_PRECISION';
  end if;
  if p_skill_level is not null and p_skill_level not in ('casual','mixed','competitive') then
    raise exception 'INVALID_SKILL_LEVEL';
  end if;

  update public.peladas
  set region = coalesce(nullif(trim(p_region), ''), region),
      latitude = coalesce(p_latitude, latitude),
      longitude = coalesce(p_longitude, longitude),
      public_location_precision = coalesce(p_location_precision, public_location_precision),
      updated_at = now()
  where id = p_pelada_id;

  update public.pelada_settings
  set match_weekday = coalesce(p_match_weekday, match_weekday),
      match_time = coalesce(p_match_time, match_time),
      skill_level = coalesce(p_skill_level, skill_level),
      max_players = coalesce(p_max_players, max_players),
      updated_at = now()
  where pelada_id = p_pelada_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.public_pelada_point(text,numeric,numeric) from public;
grant execute on function public.public_pelada_point(text,numeric,numeric) to anon, authenticated;

revoke all on function public.discover_peladas(
  text,text,text,text,numeric,numeric,numeric,smallint,time,time,text,text,boolean,int,int
) from public;
grant execute on function public.discover_peladas(
  text,text,text,text,numeric,numeric,numeric,smallint,time,time,text,text,boolean,int,int
) to anon, authenticated;

revoke all on function public.list_pelada_regions(text,int) from public;
grant execute on function public.list_pelada_regions(text,int) to anon, authenticated;

revoke all on function public.update_pelada_discovery(
  uuid,text,numeric,numeric,text,smallint,time,text,int
) from public, anon;
grant execute on function public.update_pelada_discovery(
  uuid,text,numeric,numeric,text,smallint,time,text,int
) to authenticated;
