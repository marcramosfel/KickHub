-- =====================================================================
--  PELADA EQUILIBRADA — Migração 5: avaliações incrementais + resets
--
--  Problema corrigido: a avaliação era "tudo de uma vez, uma só vez"
--  (login.voted = já submeteu alguma vez; submit_ratings recusava se já
--  existisse qualquer voto). Resultado: os novatos que entram DEPOIS
--  nunca eram avaliados pelos veteranos.
--
--  Novo modelo: cada jogador avalia quem ainda não avaliou. O que falta
--  é a lacuna na matriz — aprovados (menos ele) sem linha (rater,target).
--  Assim, quando um novato entra, todos os veteranos passam a ter uma
--  avaliação pendente (a do novato) e são chamados a avaliá-lo.
--
--  Extra: o admin pode reiniciar as avaliações de todos, ou só de um
--  jogador (todos terão de o reavaliar).
-- =====================================================================

-- login: voted passa a significar "não tem avaliações pendentes"
create or replace function login(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_pending int;
begin
  select * into r from players where lower(name) = lower(btrim(p_name));
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  select count(*) into v_pending
    from players p
    where p.approved and p.id <> r.id
      and not exists (select 1 from ratings rt where rt.rater_id = r.id and rt.target_id = p.id);
  return json_build_object('id', r.id, 'name', r.name, 'is_admin', r.is_admin, 'voted', v_pending = 0);
end; $$;

-- submit_ratings: preenche só as lacunas; não recusa quem já avaliou
-- antes (deixou de haver o erro JAVOTOU aqui), e nunca sobrescreve uma
-- nota já dada (on conflict do nothing).
create or replace function submit_ratings(p_rater uuid, p_pin text, p_scores jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players; k text; v int;
begin
  select * into r from players where id = p_rater;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  for k, v in select key, (value)::int from jsonb_each_text(p_scores) loop
    if v < 0 or v > 5 then raise exception 'SCORE'; end if;
    if k::uuid <> p_rater then
      insert into ratings(rater_id, target_id, score)
      values (p_rater, k::uuid, v)
      on conflict (rater_id, target_id) do nothing;
    end if;
  end loop;
end; $$;

-- Jogadores que este avaliador ainda tem de avaliar (aprovados, menos
-- ele próprio, sem linha (rater, target) — as lacunas dele).
create or replace function get_pending_ratings(p_rater uuid, p_pin text)
returns table(id uuid, name text, photo_url text)
language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players where id = p_rater;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  return query
    select p.id, p.name, p.photo_url
    from players p
    where p.approved and p.id <> p_rater
      and not exists (select 1 from ratings rt where rt.rater_id = p_rater and rt.target_id = p.id)
    order by p.name;
end; $$;

-- get_stats: "voters" passa a ser quantos aprovados já não têm lacunas
-- (avaliaram toda a gente) — é o que faz sentido para libertar o sorteio.
create or replace function get_stats()
returns json language sql security definer set search_path = public, extensions as $$
  select json_build_object(
    'approved', (select count(*) from players where approved),
    'voters', (
      select count(*) from players me
      where me.approved
        and not exists (
          select 1 from players p
          where p.approved and p.id <> me.id
            and not exists (select 1 from ratings rt where rt.rater_id = me.id and rt.target_id = p.id)
        )
    )
  );
$$;

-- Admin: reiniciar TODAS as avaliações (todos reavaliam todos).
create or replace function admin_reset_ratings(p_pw text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from ratings;
end; $$;

-- Admin: reiniciar as avaliações DE UM jogador (todos reavaliam-no).
create or replace function admin_reset_ratings_for(p_pw text, p_target uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from ratings where target_id = p_target;
end; $$;

-- ---------- PERMISSÕES ----------
grant execute on function get_pending_ratings(uuid, text)     to anon, authenticated;
grant execute on function admin_reset_ratings(text)           to anon, authenticated;
grant execute on function admin_reset_ratings_for(text, uuid) to anon, authenticated;
