-- =====================================================================
--  PELADA EQUILIBRADA — Migração 7: corrige "reiniciar avaliações de todos"
--
--  admin_reset_ratings (da 0005) fazia `delete from ratings;` sem WHERE,
--  e o Supabase bloqueia DELETE sem WHERE (erro 21000, "DELETE requires
--  a WHERE clause"). Por isso o reset de UM jogador funcionava (tem WHERE)
--  mas o reset de TODOS falhava.
--
--  Correção: `delete from ratings where true` (apaga tudo, com WHERE).
--  Idempotente. (Já corrigido na 0005 para instalações novas.)
-- =====================================================================

create or replace function admin_reset_ratings(p_pw text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from ratings where true;
end; $$;

grant execute on function admin_reset_ratings(text) to anon, authenticated;
