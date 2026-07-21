-- =====================================================================
--  PELADA EQUILIBRADA — Migração 3: correção de segurança do PIN
--
--  Problema: em login() e submit_ratings() (da 0001), a verificação
--    if r.id is null or r.pin_hash <> crypt(p_pin, r.pin_hash) ...
--  é contornável com p_pin = NULL: crypt() é STRICT (devolve NULL com
--  argumento NULL), a comparação <> NULL dá NULL, e um IF com condição
--  NULL não dispara — ou seja, o erro CRED nunca era lançado e qualquer
--  pessoa com a chave pública podia entrar como qualquer jogador
--  chamando a RPC diretamente com {"p_pin": null}.
--
--  Esta migração substitui as duas funções por versões com guard
--  explícito de NULL. As assinaturas não mudam (os grants mantêm-se).
-- =====================================================================

create or replace function login(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_voted boolean;
begin
  select * into r from players where lower(name) = lower(btrim(p_name));
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  select exists(select 1 from ratings where rater_id = r.id) into v_voted;
  return json_build_object('id', r.id, 'name', r.name, 'is_admin', r.is_admin, 'voted', v_voted);
end; $$;

create or replace function submit_ratings(p_rater uuid, p_pin text, p_scores jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players; k text; v int;
begin
  select * into r from players where id = p_rater;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  if exists(select 1 from ratings where rater_id = p_rater) then raise exception 'JAVOTOU'; end if;
  for k, v in select key, (value)::int from jsonb_each_text(p_scores) loop
    if v < 0 or v > 5 then raise exception 'SCORE'; end if;
    if k::uuid <> p_rater then
      insert into ratings(rater_id, target_id, score) values (p_rater, k::uuid, v);
    end if;
  end loop;
end; $$;

-- Nota: register() não é afetada (o PIN é validado com regex antes do
-- crypt) e admin_ok() usa igualdade positiva num EXISTS, onde um NULL
-- resulta em "não autorizado" — que é o comportamento seguro.
