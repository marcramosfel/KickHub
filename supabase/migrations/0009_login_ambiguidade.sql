-- =====================================================================
--  PELADA BROWNS — Migração 9: login mostra AMBIGUO em nomes partilhados
--
--  Na 0008, o login procurava por user_id usando o texto já "slugificado"
--  (sem espaços/acentos). Isso fazia com que digitar um NOME partilhado por
--  dois jogadores casasse com o user_id-base do primeiro e resolvesse para
--  ele, em vez de mostrar a mensagem "usa o teu ID".
--
--  Correção: a procura por user_id usa apenas minúsculas+trim (mantém
--  espaços/acentos). Como um user_id nunca tem espaços/acentos, só um ID
--  realmente digitado casa; um NOME cai na resolução por nome, que devolve
--  AMBIGUO quando é partilhado. Logins por nome único ou por ID mantêm-se.
--  Idempotente. (Já vem corrigido na 0008 para instalações novas.)
-- =====================================================================

create or replace function login(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; raw text; norm text; name_ids uuid[]; v_pending int;
begin
  raw := lower(btrim(coalesce(p_name, '')));
  norm := slugify(p_name);
  if norm = '' then raise exception 'CRED'; end if;
  select * into r from players where user_id = raw;
  if r.id is null then
    select array_agg(id) into name_ids from players where slugify(name) = norm;
    if coalesce(array_length(name_ids, 1), 0) >= 2 then raise exception 'AMBIGUO'; end if;
    if array_length(name_ids, 1) = 1 then select * into r from players where id = name_ids[1]; end if;
  end if;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;
  select count(*) into v_pending
    from players p
    where p.approved and p.id <> r.id
      and not exists (select 1 from ratings rt where rt.rater_id = r.id and rt.target_id = p.id);
  return json_build_object(
    'id', r.id, 'name', r.name, 'user_id', r.user_id,
    'is_admin', r.is_admin, 'voted', v_pending = 0
  );
end; $$;
