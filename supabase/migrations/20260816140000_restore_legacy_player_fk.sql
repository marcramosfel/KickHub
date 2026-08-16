-- KickHub V2 — devolver a chave estrangeira ao vínculo com o legado.
--
-- A migration anterior largou `pelada_memberships_legacy_player_id_fkey` com um
-- fundamento errado. Eu tinha concluído que o schema do legado dentro desta
-- base divergira do da Pelada Browns — que a `matches` daqui tinha três colunas
-- e a de lá quarenta — e daí que as linhas nunca fossem restauradas para cá.
--
-- Não divergira. Li o ficheiro da baseline com uma expressão que só apanhava os
-- blocos `create table` e ignorou sessenta instruções `alter table ... add
-- column` logo a seguir. Comparadas as duas bases a sério, com uma impressão
-- MD5 das colunas e tipos, **as oito tabelas do legado são idênticas**:
-- `matches` tem 39 colunas dos dois lados, `players` 25, `match_stats` 6,
-- `match_lineup` 10.
--
-- Sem divergência, o caminho volta a ser o que o ADR 0001 descreve: as linhas
-- da Browns são restauradas para estas tabelas, e o backfill mapeia-as para as
-- entidades multi-tenant dentro de uma transação — com as garantias que isso dá
-- e com as ferramentas dos gates, que leem exactamente estas tabelas.
--
-- A chave volta, porque é ela que garante que nenhum membro aponta para um
-- jogador que não existe. Ficar sem ela era aceitar esse risco a troco de nada.

alter table public.pelada_memberships
  add constraint pelada_memberships_legacy_player_id_fkey
  foreign key (legacy_player_id) references public.players(id) on delete restrict;

comment on column public.pelada_memberships.legacy_player_id is
  'Id do jogador na tabela do legado. Vínculo único e auditável exigido pelo '
  'ADR 0001, com chave estrangeira: as linhas da Browns são restauradas para '
  'public.players antes do backfill.';
