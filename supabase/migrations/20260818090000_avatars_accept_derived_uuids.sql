-- KickHub V2 — o caminho do avatar aceita o UUID que os perfis Browns têm.
--
-- Dois defeitos, os dois meus, e os dois só visíveis com dados reais.
--
-- 1. A policy do Storage exigia um UUID v1–v5 no primeiro segmento do caminho:
--    versão em `[1-5]`, variante em `[89ab]`. Só que `browns_profile_id()` é
--    `md5('kickhub:browns:profile:' || id)::uuid` — um hash reinterpretado como
--    UUID, sem bits de versão nem de variante. Dos 30 jogadores da Browns, **um**
--    passava, por acaso. Os outros 29 nunca conseguiriam ler a própria foto, e o
--    script que as sobe recusava-as antes sequer de tentar.
--
--    O padrão passa a ser o de um UUID qualquer. Não se perde defesa nenhuma: o
--    que a policy tem de garantir é que o primeiro segmento é o `profile_id` do
--    dono e que quem lê partilha uma pelada com ele — `shares_active_pelada` faz
--    isso, e um segmento que não seja UUID continua a não corresponder a perfil
--    nenhum. A versão do UUID nunca protegeu coisa alguma.
--
-- 2. `mark_browns_avatar_failed` só marcava quem estivesse em `pending`. Desde
--    que o importador passou a tirar as imagens das linhas, o backfill deixa
--    todos os perfis em `ready` — não tem como saber que existe foto. Uma falha
--    no upload não encontrava nada para marcar, e o perfil ficava a dizer
--    `ready` sem foto nenhuma: o estado mentia, e mentia em silêncio. Foi assim
--    que 29 falhas apareceram no relatório como 30 perfis prontos.
--
--    Passa a marcar pelo que se pode verificar — não há objeto — em vez de por
--    um estado anterior que deixou de ser fiável. Um perfil que já tenha uma
--    foto boa não é tocado.

drop policy if exists player_avatars_objects_shared_read on storage.objects;
create policy player_avatars_objects_shared_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'player-avatars'
    and case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.shares_active_pelada(split_part(name, '/', 1)::uuid)
      else false
    end
  );

create or replace function public.mark_browns_avatar_failed(p_profile_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  -- `avatar_path is null` é a pergunta certa: não há objeto no bucket, logo não
  -- há foto, seja qual for o estado que a linha diga ter. Quem já tem caminho
  -- gravado tem uma foto que funciona, e uma falha posterior não a deve apagar.
  update public.profiles
  set avatar_status = 'failed', avatar_bucket_id = null, avatar_sha256 = null
  where id = p_profile_id and avatar_path is null;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.mark_browns_avatar_failed(uuid) from public, anon, authenticated;
grant execute on function public.mark_browns_avatar_failed(uuid) to service_role;
