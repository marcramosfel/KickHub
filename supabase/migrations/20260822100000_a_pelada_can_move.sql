-- KickHub V2 — uma pelada pode mudar de sítio.
--
-- A Browns está gravada em Zürich, CH, fuso Europe/Zurich, e joga-se no
-- Algarve. As coordenadas e a região já apontam para Quarteira — essas o
-- formulário da descoberta grava — mas a cidade, o país e o fuso não têm campo
-- nenhum em lado nenhum. O `update_pelada_identity` nunca os aceitou.
--
-- Daí a queixa parecer "não guarda": guardava. O que ficava por guardar era
-- precisamente o que o cabeçalho mostra, e por isso a página continuava a
-- dizer Zürich depois de cada gravação bem sucedida.
--
-- O fuso não é detalhe cosmético: é ele que decide a que horas um jogo aparece
-- para quem o vê. Uma pelada do Algarve marcada com fuso suíço mostra os jogos
-- uma hora adiantados a toda a gente.

-- ------------------------------------------------------------------ escrita
--
-- A assinatura muda, portanto a antiga cai: deixá-la viva ao lado desta tornava
-- a chamada ambígua para o PostgREST.
drop function if exists public.update_pelada_identity(uuid, text, text, text, text);

create or replace function public.update_pelada_identity(
  p_pelada_id uuid,
  p_name text,
  p_description text,
  p_visibility text,
  p_join_mode text,
  p_city text default null,
  p_country_code text default null,
  p_timezone text default null
)
returns public.peladas
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_pelada public.peladas;
  v_country text := nullif(upper(btrim(coalesce(p_country_code, ''))), '');
  v_timezone text := nullif(btrim(coalesce(p_timezone, '')), '');
begin
  if not public.has_pelada_role(p_pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;

  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'INVALID_COUNTRY';
  end if;

  -- Um fuso inválido não dá erro nenhum ao ser gravado; dá horas erradas mais
  -- tarde, a toda a gente, sem ninguém perceber porquê. Verifica-se aqui, que é
  -- o único sítio onde ainda há a quem dizer que está errado.
  if v_timezone is not null
     and not exists (select 1 from pg_timezone_names where name = v_timezone) then
    raise exception 'INVALID_TIMEZONE';
  end if;

  -- Nulo é "não mexas neste"; vazio é "apaga". A distinção existe porque estes
  -- três chegaram depois, e quem chamar a função sem eles — o teste, uma
  -- integração antiga — não pode por isso apagar a morada da pelada.
  update public.peladas
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      visibility = p_visibility,
      join_mode = p_join_mode,
      city = case when p_city is null then city
                  else nullif(btrim(p_city), '') end,
      country_code = case when p_country_code is null then country_code
                          else v_country end,
      timezone = case when p_timezone is null then timezone
                      else coalesce(v_timezone, timezone) end,
      updated_at = now()
  where id = p_pelada_id
  returning * into v_pelada;

  if not found then
    raise exception 'PELADA_NOT_FOUND';
  end if;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    p_pelada_id,
    public.current_profile_id(),
    'pelada.identity_updated',
    'pelada',
    p_pelada_id,
    jsonb_build_object(
      'visibility', v_pelada.visibility,
      'join_mode', v_pelada.join_mode,
      'city', v_pelada.city,
      'country_code', v_pelada.country_code,
      'timezone', v_pelada.timezone
    )
  );

  return v_pelada;
end;
$$;

revoke all on function public.update_pelada_identity(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_pelada_identity(uuid, text, text, text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------------- leitura
--
-- A leitura passa a trazer tudo o que os dois formulários mostram, e não só o
-- que o primeiro mostrava. O da descoberta nascia vazio porque não tinha de
-- onde se encher: escrevia bem e não sabia ler. Depois de gravar e recarregar,
-- os campos voltavam a aparecer em branco — que de fora é indistinguível de
-- não ter gravado nada.
drop function if exists public.get_pelada_admin_settings(uuid);

create or replace function public.get_pelada_admin_settings(p_pelada_id uuid)
returns table (
  name text, slug text, description text, visibility text, join_mode text,
  city text, country_code text, timezone text,
  region text, latitude numeric, longitude numeric, location_precision text,
  default_format text, default_team_size integer, frequency text,
  goalkeeper_mode text, ratings_enabled boolean, awards_enabled boolean,
  match_weekday integer, match_time text, skill_level text, max_players integer
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    pelada.name,
    pelada.slug,
    pelada.description,
    pelada.visibility,
    pelada.join_mode,
    pelada.city,
    pelada.country_code,
    pelada.timezone,
    pelada.region,
    pelada.latitude,
    pelada.longitude,
    pelada.public_location_precision,
    coalesce(settings.default_format, '7x7'),
    coalesce(settings.default_team_size, 7),
    coalesce(settings.frequency, 'weekly'),
    coalesce(settings.goalkeeper_mode, 'fixed'),
    coalesce(settings.ratings_enabled, true),
    coalesce(settings.awards_enabled, true),
    -- `match_weekday` é `smallint` na tabela; sem o molde explícito a função
    -- não casa com o tipo de retorno declarado e a migration nem aplica.
    settings.match_weekday::integer,
    -- `time` não tem representação em JSON: chega ao cliente como texto de
    -- qualquer maneira, e converter aqui é converter uma vez em vez de em
    -- cada sítio que o lê.
    to_char(settings.match_time, 'HH24:MI'),
    settings.skill_level,
    settings.max_players
  from public.peladas pelada
  left join public.pelada_settings settings on settings.pelada_id = pelada.id
  where pelada.id = p_pelada_id
    and public.has_pelada_role(p_pelada_id, array['owner','admin']);
$$;

revoke all on function public.get_pelada_admin_settings(uuid) from public, anon;
grant execute on function public.get_pelada_admin_settings(uuid) to authenticated;
