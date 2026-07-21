-- =====================================================================
--  PELADA EQUILIBRADA — Migração 6: corrige get_pending_ratings
--
--  A versão da 0005 rebentava com "column reference id is ambiguous"
--  (SQLSTATE 42702): o `returns table(id ...)` cria uma variável `id`
--  e a linha `select * into r from players where id = p_rater` usava
--  `id` sem qualificar, colidindo com essa variável.
--
--  Correção: qualificar com o alias da tabela (p.id). Idempotente.
--  (Já vem corrigido na 0005 para instalações novas; esta migração é
--  para quem já aplicou a 0005 com o bug.)
-- =====================================================================

create or replace function get_pending_ratings(p_rater uuid, p_pin text)
returns table(id uuid, name text, photo_url text)
language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players p where p.id = p_rater;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  return query
    select p.id, p.name, p.photo_url
    from players p
    where p.approved and p.id <> p_rater
      and not exists (select 1 from ratings rt where rt.rater_id = p_rater and rt.target_id = p.id)
    order by p.name;
end; $$;

grant execute on function get_pending_ratings(uuid, text) to anon, authenticated;
