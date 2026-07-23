-- =====================================================================
--  PELADA BROWNS — Migração 14: mudar o PIN / recuperar PIN esquecido
--
--  Até aqui, quem esquecia o PIN ficava trancado fora e só se resolvia
--  com SQL à mão. Duas funções, no modelo das outras (tabelas fechadas
--  por RLS, acesso só via SECURITY DEFINER):
--
--    · change_pin    — o próprio jogador muda o PIN, provando o atual
--    · admin_set_pin — o admin define um PIN novo para quem o esqueceu
--                      (não precisa do antigo; é isto que destranca)
--
--  Como na 0003, a validação do PIN é NULL-safe: crypt() é STRICT, com
--  argumento NULL devolve NULL, e um IF com condição NULL não dispara —
--  daí o "p_pin is null" explícito.
-- =====================================================================

create or replace function change_pin(p_id uuid, p_pin text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players p where p.id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  if p_new is null or p_new !~ '^\d{4}$' then raise exception 'PIN'; end if;
  update players set pin_hash = crypt(p_new, gen_salt('bf')) where id = p_id;
end; $$;

-- O admin define o PIN de quem o esqueceu e passa-lho; o jogador pode
-- depois trocá-lo por um seu com change_pin.
create or replace function admin_set_pin(p_pw text, p_id uuid, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_new is null or p_new !~ '^\d{4}$' then raise exception 'PIN'; end if;
  if not exists(select 1 from players p where p.id = p_id) then raise exception 'SEMJOGADOR'; end if;
  update players set pin_hash = crypt(p_new, gen_salt('bf')) where id = p_id;
end; $$;

grant execute on function change_pin(uuid, text, text)   to anon, authenticated;
grant execute on function admin_set_pin(text, uuid, text) to anon, authenticated;
