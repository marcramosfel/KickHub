begin;

select plan(16);

-- A descoberta geográfica existe e está aberta a quem ainda não tem conta:
-- procurar uma pelada é o passo anterior a criar uma.
select has_function('public', 'discover_peladas', 'a descoberta com filtros existe');
select ok(
  has_function_privilege('anon', 'public.discover_peladas(text,text,text,text,numeric,numeric,numeric,smallint,time,time,text,text,boolean,int,int)', 'execute'),
  'anon pode descobrir peladas públicas');
select ok(
  has_function_privilege('authenticated', 'public.discover_peladas(text,text,text,text,numeric,numeric,numeric,smallint,time,time,text,text,boolean,int,int)', 'execute'),
  'authenticated pode descobrir peladas públicas');

-- A distância sai do PostGIS e não de uma conta à mão, que era o que
-- aconteceria se o cliente a calculasse.
select alike(
  pg_get_functiondef('public.discover_peladas(text,text,text,text,numeric,numeric,numeric,smallint,time,time,text,text,boolean,int,int)'::regprocedure),
  '%st_distance%', 'a distância é medida no servidor com PostGIS');
select alike(
  pg_get_functiondef('public.discover_peladas(text,text,text,text,numeric,numeric,numeric,smallint,time,time,text,text,boolean,int,int)'::regprocedure),
  '%visibility = ''public''%', 'só peladas públicas entram na descoberta');
select alike(
  pg_get_functiondef('public.discover_peladas(text,text,text,text,numeric,numeric,numeric,smallint,time,time,text,text,boolean,int,int)'::regprocedure),
  '%public_pelada_point%', 'o que volta passa pelo filtro de privacidade');

-- A coluna geográfica é gerada: coordenadas novas não podem conviver com um
-- ponto velho.
select has_column('public', 'peladas', 'location', 'as peladas têm ponto geográfico');
select ok(
  (select is_generated = 'ALWAYS' from information_schema.columns
   where table_schema = 'public' and table_name = 'peladas' and column_name = 'location'),
  'o ponto é gerado a partir das coordenadas');
select has_index('public', 'peladas', 'peladas_location_idx', 'a busca por proximidade tem índice espacial');

-- Os campos que os filtros de §21 exigem.
select has_column('public', 'pelada_settings', 'match_weekday', 'o dia habitual é filtrável');
select has_column('public', 'pelada_settings', 'match_time', 'a hora habitual é filtrável');
select has_column('public', 'pelada_settings', 'skill_level', 'o nível é filtrável');
select has_column('public', 'pelada_settings', 'max_players', 'as vagas são filtráveis');

-- O ponto público respeita a precisão escolhida. 'hidden' não devolve nem
-- desfocado, e 'city' arredonda o suficiente para não denunciar o campo.
select is(public.public_pelada_point('hidden', 37.0812345, -8.1123456), null,
  'quem esconde a morada não devolve ponto nenhum');
select is(
  public.public_pelada_point('city', 37.0812345, -8.1123456)->>'lat', '37.1',
  'a precisão de cidade arredonda a uma casa');
select is(
  public.public_pelada_point('exact', 37.0812345, -8.1123456)->>'lat', '37.081235',
  'a precisão exacta devolve o que lá está');

-- Só quem administra mexe na descoberta da pelada.
select ok(
  not has_function_privilege('anon', 'public.update_pelada_discovery(uuid,text,numeric,numeric,text,smallint,time,text,int)', 'execute'),
  'anon não altera a descoberta de ninguém');

select * from finish();
rollback;
