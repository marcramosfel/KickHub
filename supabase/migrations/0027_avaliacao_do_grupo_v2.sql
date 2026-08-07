-- =====================================================================
--  PELADA BROWNS — Migração 27: a avaliação do grupo, outra vez e melhor
--
--  A nota de 0 a 5 que cada um dá aos outros é a parcela mais pesada do
--  overall — e o overall é o que equilibra as equipas. Três mudanças:
--
--    1. DECIMAIS. `score` passa de `int` a `numeric(2,1)`: 3,7 diz mais do
--       que "3 ou 4". Com 30 jogadores, obrigar a inteiros empilhava meio
--       plantel no 3 e o sorteio ficava sem como os separar.
--
--    2. "NÃO CONHEÇO ESTE JOGADOR". `score` passa a aceitar NULL, com o
--       significado de "não o conheço o suficiente para o avaliar". Não é
--       o mesmo que "ainda não avaliei": a linha existe, o jogador sai da
--       lista de pendentes, e a nota dele não entra em média nenhuma.
--
--       Isto sai de graça: `avg()` e `count()` do Postgres já ignoram
--       nulos, por isso `round(avg(r.score))` e `count(r.score)` — que
--       várias funções já usam — passam a contar só quem conhece, sem
--       precisar de uma linha de código novo.
--
--    3. RONDA NOVA, COM REVELAÇÃO. As notas ficam ANÓNIMAS até o último
--       jogador entregar as dele. Quando a ronda fecha, abre para todos e
--       cada um vê quem lhe deu o quê.
--
--       A ordem importa: revelar antes de toda a gente votar faria os
--       últimos votarem já a saber o que receberam, e a nota deixava de
--       ser uma opinião para passar a ser uma resposta.
--
--  As notas atuais NÃO se perdem: vão para `ratings_arquivo` antes de a
--  tabela ser limpa. O overall de toda a gente vai a zero de opinião do
--  grupo até a ronda nova andar — é o preço de recomeçar, e é assumido.
--
--  Códigos de erro novos: SCOREDECIMAL, RONDAFECHADA.
-- =====================================================================

-- ---------- 1. GUARDAR O QUE JÁ EXISTE ----------
-- Antes de limpar. Uma ronda de avaliações de 30 pessoas é trabalho de
-- muita gente e não se deita fora sem cópia.
create table if not exists ratings_arquivo (
  ronda      int not null,
  rater_id   uuid not null,
  target_id  uuid not null,
  score      numeric(2,1),
  created_at timestamptz,
  arquivado_em timestamptz not null default now(),
  primary key (ronda, rater_id, target_id)
);

alter table ratings_arquivo enable row level security;

-- ---------- 2. A RONDA ----------
alter table app_config add column if not exists ratings_round      int not null default 1;
alter table app_config add column if not exists ratings_revealed_at timestamptz;
alter table app_config add column if not exists ratings_opened_at   timestamptz;

-- ---------- 3. O SCORE PASSA A DECIMAL E ANULÁVEL ----------
-- O check antigo (`between 0 and 5` sobre int) tem de sair antes da
-- mudança de tipo, senão a conversão esbarra nele.
do $mig$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.ratings'::regclass and contype = 'c'
                and pg_get_constraintdef(oid) ilike '%score%') then
    execute (select 'alter table ratings drop constraint ' || quote_ident(conname)
             from pg_constraint
             where conrelid = 'public.ratings'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%score%'
             limit 1);
  end if;
end
$mig$;

-- Arquivar ANTES de mexer no tipo: assim o arquivo guarda os valores tal
-- como estavam. Idempotente — correr duas vezes não duplica.
insert into ratings_arquivo (ronda, rater_id, target_id, score, created_at)
select (select ratings_round from app_config where id = 1),
       r.rater_id, r.target_id, r.score::numeric(2,1), r.created_at
from ratings r
on conflict (ronda, rater_id, target_id) do nothing;

alter table ratings alter column score drop not null;
alter table ratings alter column score type numeric(2,1) using score::numeric(2,1);

do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'ratings_score_chk' and conrelid = 'public.ratings'::regclass) then
    alter table ratings add constraint ratings_score_chk
      check (score is null or (score >= 0 and score <= 5));
  end if;
end
$chk$;

-- ---------- 4. LIMPAR PARA A RONDA NOVA ----------
-- `where true` porque o Supabase recusa DELETE sem WHERE (a mesma razão
-- que motivou a correção da 0007).
delete from ratings where true;

update app_config set
  ratings_round       = ratings_round + 1,
  ratings_opened_at   = now(),
  ratings_revealed_at = null
where id = 1;

-- ---------- 5. QUEM JÁ ENTREGOU, E FALTA ALGUÉM? ----------
-- Um jogador está "em dia" quando tem uma linha para cada outro aprovado —
-- com nota ou com o "não conheço", tanto faz. O que conta é ter respondido.
create or replace function avaliacoes_em_falta()
returns table(player_id uuid, name text, faltam int)
language sql stable security definer set search_path = public, extensions as $$
  with aprovados as (select id, name from players where approved)
  select a.id, a.name,
         ((select count(*) from aprovados) - 1
          - (select count(*) from ratings r where r.rater_id = a.id))::int as faltam
  from aprovados a
  order by a.name;
$$;

create or replace function avaliacoes_completas()
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select not exists (select 1 from avaliacoes_em_falta() f where f.faltam > 0)
     and (select count(*) from players where approved) > 1;
$$;

-- Abre a revelação quando o último entregar. Chamada no fim de cada
-- submissão: é barata e converge sozinha, sem precisar de agendador.
create or replace function talvez_revelar_avaliacoes()
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ja timestamptz;
begin
  select ratings_revealed_at into v_ja from app_config where id = 1;
  if v_ja is not null then return true; end if;
  if not avaliacoes_completas() then return false; end if;
  update app_config set ratings_revealed_at = now() where id = 1;
  return true;
end; $$;

create or replace function avaliacoes_reveladas()
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select ratings_revealed_at is not null from app_config where id = 1;
$$;

-- ---------- 6. ENTREGAR AS NOTAS ----------
-- p_scores: { "<uuid>": 3.7 }  ou  { "<uuid>": null }  para "não conheço".
--
-- Mantém a assinatura da 0005 — só muda o que aceita lá dentro. O `do
-- nothing` no conflito também se mantém: uma nota entregue não se corrige,
-- que é a regra desta votação desde o início.
--
-- O DROP é preciso: era `returns void` e passa a `returns json` (para o
-- ecrã saber se a ronda fechou com este envio). CREATE OR REPLACE não muda
-- o tipo de retorno — dá "cannot change return type of existing function".
drop function if exists submit_ratings(uuid, text, jsonb);

create or replace function submit_ratings(p_rater uuid, p_pin text, p_scores jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; k text; v text; n numeric;
begin
  select * into r from players where id = p_rater;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  for k, v in select key, value from jsonb_each_text(p_scores) loop
    if k::uuid <> p_rater then
      if v is null then
        -- "não conheço este jogador": linha com nota nula. Sai dos
        -- pendentes e não entra em média nenhuma.
        n := null;
      else
        -- só números; "4,2" com vírgula ou "muito bom" rebentavam no cast
        -- com um erro cru do Postgres, que a app mostrava como erro de ligação
        if v !~ '^\d+(\.\d+)?$' then raise exception 'SCOREDECIMAL'; end if;
        n := round(v::numeric, 1);
        if n < 0 or n > 5 then raise exception 'SCORE'; end if;
      end if;

      insert into ratings(rater_id, target_id, score)
      values (p_rater, k::uuid, n)
      on conflict (rater_id, target_id) do nothing;
    end if;
  end loop;

  return json_build_object(
    'revelado', talvez_revelar_avaliacoes(),
    'em_falta', (select count(*)::int from avaliacoes_em_falta() f where f.faltam > 0)
  );
end; $$;

-- ---------- 7. AS NOTAS QUE RECEBI ----------
-- Antes da revelação: só a lista de notas, sem nomes. Dá para ver que
-- alguém deu 1,2 — não dá para saber quem.
--
-- Depois: cada nota com o nome de quem a deu. Foi decisão do grupo, e o
-- momento é o que a torna honesta — ninguém votou já a saber o que ia
-- receber.
create or replace function get_ratings_received(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'revelado', avaliacoes_reveladas(),
    'media',    (select round(avg(r.score)::numeric, 2) from ratings r where r.target_id = p_id),
    'com_nota', (select count(r.score)::int from ratings r where r.target_id = p_id),
    'nao_conhecem', (select count(*)::int from ratings r
                      where r.target_id = p_id and r.score is null),
    'notas', (
      select coalesce(json_agg(x order by x.score desc nulls last), '[]'::json)
      from (
        select r.score,
               case when avaliacoes_reveladas() then p.name else null end as name,
               case when avaliacoes_reveladas() then p.photo_url else null end as photo
        from ratings r join players p on p.id = r.rater_id
        where r.target_id = p_id and r.score is not null
      ) x)
  );
$$;

-- ---------- 8. O ADMIN VÊ O PROGRESSO E PODE ABRIR ----------
create or replace function admin_ratings_progress(p_pw text)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (select json_build_object(
    'ronda',       (select ratings_round from app_config where id = 1),
    'aberta_em',   (select ratings_opened_at from app_config where id = 1),
    'revelado',    avaliacoes_reveladas(),
    'revelado_em', (select ratings_revealed_at from app_config where id = 1),
    'completas',   avaliacoes_completas(),
    'em_falta', (
      select coalesce(json_agg(json_build_object(
               'player_id', f.player_id, 'name', f.name, 'faltam', f.faltam)
             order by f.faltam desc, f.name), '[]'::json)
      from avaliacoes_em_falta() f where f.faltam > 0)
  ));
end; $$;

-- Abrir à força: um jogador que nunca vote não pode trancar a revelação
-- para o grupo todo.
create or replace function admin_reveal_ratings(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update app_config set ratings_revealed_at = coalesce(ratings_revealed_at, now()) where id = 1;
  return admin_ratings_progress(p_pw);
end; $$;

-- Recomeçar uma ronda (arquiva, limpa e volta a fechar a revelação).
-- DROP pela mesma razão: era `returns void`.
drop function if exists admin_reset_ratings(text);

create or replace function admin_reset_ratings(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_ronda int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  select ratings_round into v_ronda from app_config where id = 1;

  insert into ratings_arquivo (ronda, rater_id, target_id, score, created_at)
  select v_ronda, r.rater_id, r.target_id, r.score, r.created_at from ratings r
  on conflict (ronda, rater_id, target_id) do nothing;

  delete from ratings where true;

  update app_config set
    ratings_round       = ratings_round + 1,
    ratings_opened_at   = now(),
    ratings_revealed_at = null
  where id = 1;

  return admin_ratings_progress(p_pw);
end; $$;

-- ---------- PERMISSÕES ----------
revoke execute on function avaliacoes_em_falta()          from public, anon, authenticated;
revoke execute on function talvez_revelar_avaliacoes()    from public, anon, authenticated;

grant execute on function avaliacoes_completas()          to anon, authenticated;
grant execute on function avaliacoes_reveladas()          to anon, authenticated;
grant execute on function submit_ratings(uuid, text, jsonb) to anon, authenticated;
grant execute on function get_ratings_received(uuid)      to anon, authenticated;
grant execute on function admin_ratings_progress(text)    to anon, authenticated;
grant execute on function admin_reveal_ratings(text)      to anon, authenticated;
grant execute on function admin_reset_ratings(text)       to anon, authenticated;
