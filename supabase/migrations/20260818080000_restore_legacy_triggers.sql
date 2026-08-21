-- KickHub V2 — repor os triggers legados que a migration anterior tirou a mais.
--
-- `20260818070000` largou os cinco triggers das tabelas legadas com o argumento
-- de que um espelho não deve correr as regras de escrita da app antiga. O
-- argumento estava certo para as restrições CHECK, e errado aqui: dois desses
-- triggers não são regra de produto, são **defesa**. `baseline_security` afirma-o
-- em duas asserções — "uploads de perfil têm validação server-side" e "mídias de
-- jogo têm validação server-side" — e foi o CI que teve de mo dizer.
--
-- As tabelas legadas continuam alcançáveis pela API, e `validar_imagem_guardada`
-- é o que impede alguém de lá pôr uma imagem sem tipo nem limite de tamanho.
-- Tirá-la para desbloquear uma importação era trocar uma defesa por conveniência.
--
-- O problema real era outro e muito menor: das três colunas de imagem, apenas
-- `match_media.data_url` era validada sem verificar se a imagem existe. Fazia
-- sentido enquanto a coluna era `not null`; deixou de fazer quando as imagens
-- passaram a subir por Storage e a coluna passou a aceitar vazio. `players` e
-- `matches` já tinham o `is not null` à volta da chamada — `match_media` fica
-- igual aos outros dois.
--
-- A defesa mantém-se inteira: uma imagem que **seja** gravada continua a ter de
-- passar por tipo e tamanho. O que deixa de acontecer é rejeitar a ausência dela.
--
-- Os outros três triggers voltam como estavam. `preencher_gk_order` e
-- `sincronizar_post_rating_status` reescrevem a linha ao gravá-la, e continuo a
-- achar isso discutível num espelho — mas não era isso que estava a bloquear
-- nada, e removê-los não era mudança que este trabalho precisasse de fazer.

create or replace function public.validar_imagem_guardada()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if tg_table_name = 'players' then
    if new.photo_url is not null then
      perform public.validar_imagem_data_url(new.photo_url, 1500000);
    end if;
  elsif tg_table_name = 'match_media' then
    -- Igual aos outros dois: valida a imagem que existe, não a ausência dela.
    -- Sem isto, a linha cuja imagem foi para o bucket é recusada com 'FOTO'.
    if new.data_url is not null then
      perform public.validar_imagem_data_url(new.data_url, 3000000);
    end if;
  elsif tg_table_name = 'matches' then
    if new.winner_photo is not null then
      perform public.validar_imagem_data_url(new.winner_photo, 3000000);
    end if;
    if new.location_photo is not null then
      perform public.validar_imagem_data_url(new.location_photo, 3000000);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists players_validar_foto on public.players;
create trigger players_validar_foto
  before insert or update of photo_url on public.players
  for each row execute function public.validar_imagem_guardada();

drop trigger if exists match_media_validar_foto on public.match_media;
create trigger match_media_validar_foto
  before insert or update of data_url on public.match_media
  for each row execute function public.validar_imagem_guardada();

drop trigger if exists matches_validar_fotos_legadas on public.matches;
create trigger matches_validar_fotos_legadas
  before insert or update of winner_photo, location_photo on public.matches
  for each row execute function public.validar_imagem_guardada();

drop trigger if exists matches_voting_sync_trg on public.matches;
create trigger matches_voting_sync_trg
  before update on public.matches
  for each row execute function public.sincronizar_post_rating_status();

drop trigger if exists match_lineup_gk_order_trg on public.match_lineup;
create trigger match_lineup_gk_order_trg
  before insert on public.match_lineup
  for each row execute function public.preencher_gk_order();
