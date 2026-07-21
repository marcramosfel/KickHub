-- =====================================================================
--  PELADA EQUILIBRADA — Migração 4: jogador troca a própria foto
--
--  Mesmo modelo das outras: tabela fechada por RLS, acesso só via função
--  SECURITY DEFINER validada por PIN (NULL-safe, como na 0003). O jogador
--  só pode mudar a SUA foto — a validação do PIN garante a identidade.
-- =====================================================================

create or replace function update_photo(p_id uuid, p_pin text, p_photo text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players where id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  if coalesce(length(p_photo), 0) = 0 then raise exception 'FOTO'; end if;
  update players set photo_url = p_photo where id = p_id;
end; $$;

grant execute on function update_photo(uuid, text, text) to anon, authenticated;
