-- KickHub V2 — desarquivar uma pelada.
--
-- O `archive_pelada` existe desde §85 e tira a pelada da lista de quem lá joga,
-- porque o `list_my_peladas` só devolve as activas. Isso é o que se quer: uma
-- pelada que acabou não deve continuar a ocupar o painel de ninguém.
--
-- Só que não havia porta de regresso. Arquivar era uma decisão sem volta tomada
-- num clique, e uma decisão sem volta merece pelo menos ser difícil — ou então
-- ter regresso. Tem regresso.
--
-- A visibilidade não se restaura: o arquivo fecha a pelada ao público, e voltar
-- a abri-la é uma escolha à parte, que se faz nas definições e olhando para
-- ela. Adivinhar aqui era republicar uma pelada sem ninguém ter pedido.

create or replace function public.restore_pelada(p_pelada_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid := public.current_profile_id();
begin
  if v_profile_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.peladas p
    where p.id = p_pelada_id and p.owner_profile_id = v_profile_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  update public.peladas
  set status = 'active', archived_at = null, updated_at = now()
  where id = p_pelada_id and status = 'archived';

  if not found then raise exception 'NOT_ARCHIVED'; end if;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id)
  values (p_pelada_id, v_profile_id, 'pelada.restored', 'pelada', p_pelada_id);

  return jsonb_build_object('restored', true);
end;
$$;

revoke all on function public.restore_pelada(uuid) from public, anon;
grant execute on function public.restore_pelada(uuid) to authenticated;

-- As arquivadas de que sou dono, para o regresso ser alcançável sem decorar
-- identificadores. Só o dono as vê: para todos os outros, uma pelada arquivada
-- deixou mesmo de existir.
create or replace function public.list_my_archived_peladas()
returns table (id uuid, slug text, name text, archived_at timestamptz, member_count integer)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    pelada.id,
    pelada.slug,
    pelada.name,
    pelada.archived_at,
    (
      select count(*)::integer
      from public.pelada_memberships member
      where member.pelada_id = pelada.id and member.status = 'active'
    )
  from public.peladas pelada
  where pelada.owner_profile_id = public.current_profile_id()
    and pelada.status = 'archived'
  order by pelada.archived_at desc nulls last, pelada.id;
$$;

revoke all on function public.list_my_archived_peladas() from public, anon;
grant execute on function public.list_my_archived_peladas() to authenticated;
