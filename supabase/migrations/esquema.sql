-- =====================================================================
--  PELADA BROWNS — ESQUEMA COMPLETO
--
--  Este e o UNICO ficheiro a correr. Substitui as 28 migracoes que
--  existiam (0001 -> 0028), onde a mesma funcao foi reescrita vezes sem
--  conta (`login` 7, `match_public_json` 6, `get_matches` 5) — 179 definicoes ao todo, para
--  as 106 que ficam de pe. Aqui esta so a ULTIMA versao de cada coisa.
--
--  >>> NAO APAGA NEM ALTERA UM UNICO DADO. <<<
--
--  Corre numa base vazia (cria tudo) ou numa base ja a funcionar (poe as
--  definicoes em dia sem tocar em linhas). Correr duas vezes e inofensivo.
--
--  O que ficou DE FORA, de proposito: as operacoes de dados que ja
--  correram uma vez e nao se repetem, como a limpeza da tabela `ratings`
--  da 0027. Estao no fim, comentadas, com a explicacao de quando se usam.
--  Se este ficheiro as corresse, aplica-lo apagava as notas que o grupo
--  esta a dar agora.
--
--  Ordem: limpeza de views/triggers -> tabelas -> colunas -> restricoes
--  -> indices -> views -> funcoes -> triggers -> permissoes.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- =========================== PREPARACAO =============================
--
-- Views e triggers sao apagados primeiro, e reconstruidos mais abaixo.
-- Nao guardam dados: uma view e uma pergunta gravada, um trigger e uma
-- regra. Apagar e voltar a criar nao mexe numa unica linha das tabelas.
--
-- Isto e preciso porque `create or replace view` so sabe ACRESCENTAR
-- colunas ao fim. Numa base que ja tenha a versao antiga de uma view com
-- outra ordem de colunas, o `replace` recusa. Apagando primeiro, o
-- ficheiro funciona tanto numa base vazia como numa ja a trabalhar.
--
-- Ordem inversa da de criacao: quem depende sai antes de quem sustenta.
drop trigger if exists match_lineup_gk_order_trg on match_lineup;
drop trigger if exists matches_voting_sync_trg on matches;
drop view if exists saldo_esperado_por_jogador;
drop view if exists resultados_esperados;
drop view if exists premios_da_rodada;
drop view if exists participantes_do_jogo;
drop view if exists post_ratings_validas;
drop view if exists matches_validas;

-- ============================== TABELAS =============================
-- ---------- TABELAS ----------
create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  dob        date,
  photo_url  text,                 -- foto como data URL (base64)
  approved   boolean not null default false,
  is_admin   boolean not null default false,
  pin_hash   text not null,
  created_at timestamptz not null default now()
);
create table if not exists ratings (
  rater_id   uuid not null references players(id) on delete cascade,
  target_id  uuid not null references players(id) on delete cascade,
  score      int  not null check (score between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (rater_id, target_id)
);
create table if not exists draws (
  id         uuid primary key default gen_random_uuid(),
  team_a     jsonb not null,
  team_b     jsonb not null,
  published  boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists app_config (
  id            int primary key default 1,
  admin_pw_hash text not null
);
-- ---------- TABELAS ----------

-- Uma rodada (jogo) registada pelo admin depois da pelada
create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  played_at  date not null,
  created_at timestamptz not null default now()
);
-- Quem jogou nessa rodada, com gols e assistências
create table if not exists match_stats (
  match_id   uuid not null references matches(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  goals      int not null default 0 check (goals between 0 and 99),
  assists    int not null default 0 check (assists between 0 and 99),
  primary key (match_id, player_id)
);
-- Voto de craque + bagre da rodada (um voto por jogador por rodada)
create table if not exists award_votes (
  match_id   uuid not null references matches(id) on delete cascade,
  voter_id   uuid not null references players(id) on delete cascade,
  craque_id  uuid not null references players(id) on delete cascade,
  bagre_id   uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, voter_id)
);
-- ---------- AUDITORIA ----------
-- Só cresce: nunca se apaga nem se corrige uma linha daqui.
create table if not exists player_position_history (
  id                         uuid primary key default gen_random_uuid(),
  player_id                  uuid not null references players(id) on delete cascade,
  previous_player_type       text,
  new_player_type            text,
  previous_primary_position  text,
  new_primary_position       text,
  previous_secondary_position text,
  new_secondary_position     text,
  previous_accepts           boolean,
  new_accepts                boolean,
  changed_by                 uuid references players(id) on delete set null,
  changed_by_admin           boolean not null default false,
  change_reason              text,
  changed_at                 timestamptz not null default now()
);
-- ---------- ESCALAÇÃO SORTEADA ----------
-- overall_at_draw congela o overall no momento do sorteio: as estatísticas
-- mudam a cada rodada e o histórico de um jogo não pode mudar com elas.
create table if not exists match_lineup (
  match_id            uuid not null references matches(id) on delete cascade,
  player_id           uuid not null references players(id) on delete cascade,
  team                text not null check (team in ('A','B')),
  assigned_position   text not null check (assigned_position in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST')),
  preferred_position  text,
  was_out_of_position boolean not null default false,
  overall_at_draw     int,
  is_goalkeeper       boolean not null default false,
  created_at          timestamptz not null default now(),
  primary key (match_id, player_id)
);
-- ---------- TABELA ----------
-- Uma linha por goleiro por rodada. Sem linha = não foi à baliza nessa rodada.
create table if not exists goalkeeper_match_stats (
  match_id       uuid not null references matches(id) on delete cascade,
  goalkeeper_id  uuid not null references players(id) on delete cascade,
  team           text check (team in ('A','B')),           -- null nas rodadas antigas
  saves          int  not null default 0 check (saves between 0 and 99),
  goals_conceded int  not null default 0 check (goals_conceded between 0 and 99),
  created_at     timestamptz not null default now(),
  primary key (match_id, goalkeeper_id)
);
-- ---------- REGISTO DAS TROCAS ----------
-- Uma linha por desistência. O lugar e a equipa são copiados no momento
-- da troca em vez de lidos de `match_lineup` mais tarde: quem entrou pode
-- ele próprio desistir depois, e o histórico não pode mudar por isso.
create table if not exists match_substitutions (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references matches(id) on delete cascade,
  out_player_id     uuid not null references players(id) on delete cascade,
  in_player_id      uuid not null references players(id) on delete cascade,
  team              text not null check (team in ('A','B')),
  assigned_position text not null check (assigned_position in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST')),
  is_goalkeeper     boolean not null default false,
  out_overall       int,
  in_overall        int,
  reason            text,
  created_at        timestamptz not null default now()
);
-- ---------- 3. FOTOS DO JOGO ----------
create table if not exists match_media (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  kind       text not null default 'PHOTO' check (kind in ('PHOTO','WINNER','LOCATION')),
  data_url   text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
-- ---------- 4. AUDITORIA POR JOGO ----------
-- `actor` é texto livre ("admin") e não uma FK: o painel autentica-se por
-- senha partilhada, não há utilizador-admin na tabela players. Quando
-- houver, muda-se aqui.
create table if not exists match_activity (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references matches(id) on delete cascade,
  action     text not null,
  detail     jsonb,
  actor      text not null default 'admin',
  created_at timestamptz not null default now()
);
-- ---------- A TABELA ----------
create table if not exists match_publications (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  type         text not null check (type in ('SORTEIO','RESULTADO','CANCELAMENTO','SUBSTITUICAO')),
  title        text not null,
  body         text,            -- a resenha (pode ser editada depois)
  payload      jsonb,           -- snapshot do que se publicou
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
-- ---------- REGISTO DAS TROCAS ENTRE EQUIPAS ----------
-- Uma troca não cabe em `match_substitutions`: ali há um que sai e um que
-- entra, e numa troca continuam os dois a jogar. Tabela própria — e é ela
-- que dá o "Desfazer" e a explicação aos jogadores quando o equilíbrio
-- muda sem ninguém ter desistido.
create table if not exists match_swaps (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references matches(id) on delete cascade,
  a_player_id   uuid not null references players(id) on delete cascade,
  b_player_id   uuid not null references players(id) on delete cascade,
  a_team        text not null check (a_team in ('A','B')),  -- de onde A veio
  b_team        text not null check (b_team in ('A','B')),
  a_position    text not null,
  b_position    text not null,
  is_goalkeeper boolean not null default false,
  a_overall     int,
  b_overall     int,
  reason        text,
  created_at    timestamptz not null default now()
);
-- ---------- 2. A TABELA DAS AVALIAÇÕES ----------
-- Uma linha por (jogo, quem avalia, quem é avaliado). A chave primária é
-- a regra "um voto por companheiro" — não é uma verificação que se possa
-- esquecer numa função. `rater_id` fica guardado para impedir o voto
-- duplo e deixar o jogador corrigir a nota; nenhuma leitura pública o
-- devolve.
create table if not exists post_match_ratings (
  match_id   uuid not null references matches(id)  on delete cascade,
  rater_id   uuid not null references players(id)  on delete cascade,
  target_id  uuid not null references players(id)  on delete cascade,
  stars      int  not null check (stars between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, rater_id, target_id),
  constraint post_match_ratings_nao_proprio check (rater_id <> target_id)
);
-- ---------- 13. SESSÃO POR DISPOSITIVO ----------
-- Guarda um token, NUNCA o PIN. O token autoriza LER e VOTAR — trocar
-- PIN, trocar foto e entrar no admin continuam a exigir o PIN escrito
-- (as funções que os fazem validam o PIN elas próprias e não conhecem
-- tokens). Um telemóvel emprestado fica em "votou por ti", não em
-- "mudou-te a conta".
create table if not exists player_devices (
  token        uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  label        text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '180 days',
  revoked_at   timestamptz
);
-- ---------- 1. GUARDAR O QUE JÁ EXISTE ----------
-- Antes de limpar. Uma ronda de avaliações de 30 pessoas é trabalho de
-- muita gente e não se deita fora sem cópia.
create table if not exists ratings_arquivo (
  ronda      int not null,
  rater_id   uuid not null,
  target_id  uuid not null,
  score      numeric(2,1),
  created_at timestamptz,
  arquivado_em timestamptz not null default now(),
  primary key (ronda, rater_id, target_id)
);

-- ====================== COLUNAS E RESTRICOES ========================
-- Todas com `if not exists` ou dentro de um bloco guardado: numa base
-- que ja as tenha, nao fazem nada.
-- ---------- FECHAR AS TABELAS ----------
alter table players    enable row level security;
alter table ratings    enable row level security;
alter table draws      enable row level security;
alter table app_config enable row level security;
-- ---------- FECHAR AS TABELAS ----------
alter table matches     enable row level security;
alter table match_stats enable row level security;
alter table award_votes enable row level security;
-- ---------- COLUNA + BACKFILL ----------

alter table players add column if not exists user_id text;
alter table players alter column user_id set not null;
-- ---------- COLUNAS NOVAS ----------
alter table matches add column if not exists team_a_name   text not null default 'Amarelos';
alter table matches add column if not exists team_b_name   text not null default 'Azuis';
alter table matches add column if not exists score_a       int  not null default 0;
alter table matches add column if not exists score_b       int  not null default 0;
alter table matches add column if not exists winner_photo   text;
-- base64, opcional
alter table matches add column if not exists location_photo text;
-- base64, opcional
alter table matches add column if not exists notes          text;
-- opcional

alter table match_stats add column if not exists team text;
-- ---------- COLUNAS NOVAS EM players ----------
alter table players add column if not exists player_type              text not null default 'FIELD';
alter table players add column if not exists primary_position         text;
-- null = ainda não escolheu
alter table players add column if not exists secondary_position       text;
-- opcional
alter table players add column if not exists accepts_other_positions  boolean not null default true;
alter table players add column if not exists position_status          text not null default 'NOT_SELECTED';
alter table players add column if not exists position_updated_at      timestamptz;
-- Quem fez a última alteração: o id do jogador quando foi ele próprio,
-- NULL quando foi o admin (o admin autentica-se por senha, não por player
-- id, por isso não há uuid para guardar). Quem foi fica sempre no histórico.
alter table players add column if not exists position_updated_by      uuid references players(id) on delete set null;
alter table players add column if not exists position_notice          text;
-- aviso por ler
alter table players add column if not exists position_notice_at       timestamptz;
-- Como o resto do esquema: tabela fechada por RLS, sem políticas.
alter table player_position_history enable row level security;
-- ---------- COLUNAS NOVAS EM matches ----------
-- kickoff_at é a data+hora real do jogo. As rodadas antigas ficam com
-- null e continuam a usar played_at (que é NOT NULL desde a 0002).
alter table matches add column if not exists kickoff_at     timestamptz;
alter table matches add column if not exists location       text;
alter table matches add column if not exists map_url        text;
alter table matches add column if not exists status         text not null default 'COMPLETED';
alter table matches add column if not exists published_at   timestamptz;
alter table matches add column if not exists team_a_overall int;
alter table matches add column if not exists team_b_overall int;
alter table matches add column if not exists balance_pct    numeric;
alter table matches add column if not exists created_by     uuid references players(id) on delete set null;
alter table matches add column if not exists draw_seed      text;
alter table match_lineup enable row level security;
-- Como no resto do esquema: RLS ligado e zero políticas — só as funções
-- SECURITY DEFINER abaixo é que tocam nesta tabela.
alter table goalkeeper_match_stats enable row level security;
alter table match_substitutions enable row level security;
-- ---------- 1. O ESTADO DO RESULTADO ----------
-- Separado do status do jogo de propósito: "o jogo acabou" e "o resultado
-- está pronto para o grupo ver" são momentos diferentes. NONE = ainda nem
-- começou a preencher; DRAFT = guardado mas invisível; PUBLISHED = conta.
alter table matches add column if not exists result_status text not null default 'NONE';
alter table matches add column if not exists result_published_at timestamptz;
alter table matches add column if not exists cancelled_at timestamptz;
alter table matches add column if not exists cancel_reason text;
-- Craque/bagre: override do admin (a votação continua a mandar; isto só
-- se usa para desempatar ou quando ninguém votou, e fica na auditoria).
alter table matches add column if not exists craque_override uuid references players(id) on delete set null;
alter table matches add column if not exists bagre_override  uuid references players(id) on delete set null;
alter table match_media enable row level security;
alter table match_activity enable row level security;
alter table match_publications enable row level security;
-- ---------- O TIPO DA MEXIDA ----------
alter table match_substitutions
  add column if not exists kind text not null default 'DESISTENCIA';
alter table match_swaps enable row level security;
alter table players add column if not exists primary_card text;
alter table players add column if not exists nickname    text;
-- ---------- 1. COLUNAS NOVAS EM matches ----------

-- O default é 1 DE PROPÓSITO: as linhas que já existem herdam-no no
-- próprio ADD COLUMN, sem UPDATE nenhum, e ficam para sempre na fórmula
-- antiga. Só depois é que o default passa a 2, para os jogos futuros.
-- Correr isto duas vezes não estraga nada (o ADD é no-op na segunda).
alter table matches add column if not exists overall_version int not null default 1;
alter table matches alter column overall_version set default 2;
-- Estado da votação pós-jogo. CLOSED até o admin publicar o resultado
-- (a publicação abre-a sozinha) e depois de ele a encerrar.
alter table matches add column if not exists post_rating_status    text not null default 'CLOSED';
alter table matches add column if not exists post_rating_opened_at timestamptz;
alter table matches add column if not exists post_rating_closed_at timestamptz;
alter table post_match_ratings enable row level security;
-- ---------- 1. FORMATO DO JOGO ----------

alter table matches add column if not exists gk_mode   text not null default 'FIXED';
alter table matches add column if not exists team_size int  not null default 7;
alter table matches add column if not exists gk_rotation_minutes int;
-- ---------- 2. ORDEM DO RODÍZIO ----------
-- 1 = inicia no gol, 2 = entra a seguir, … ; null no formato FIXED.
alter table match_lineup add column if not exists gk_order int;
-- ---------- 3. QUEM ACEITA IR À BALIZA ----------
-- Diferente de `accepts_other_positions`, que é sobre lugares de CAMPO.
-- Aqui é só: "aceitas ir ao gol quando o rodízio te calhar?"
alter table players add column if not exists gk_rotation_ok boolean not null default true;
-- ---------- 1. COLUNAS NOVAS EM matches ----------

alter table matches add column if not exists voting_status    text not null default 'NONE';
alter table matches add column if not exists voting_deadline  timestamptz;
alter table matches add column if not exists voting_closed_at timestamptz;
alter table matches add column if not exists voting_quorum_pct int not null default 50;
alter table matches add column if not exists craque_final uuid references players(id) on delete set null;
alter table matches add column if not exists bagre_final  uuid references players(id) on delete set null;
alter table player_devices enable row level security;
alter table ratings_arquivo enable row level security;
-- ---------- 2. A RONDA ----------
alter table app_config add column if not exists ratings_round      int not null default 1;
alter table app_config add column if not exists ratings_revealed_at timestamptz;
alter table app_config add column if not exists ratings_opened_at   timestamptz;
alter table ratings alter column score drop not null;
alter table ratings alter column score type numeric(2,1) using score::numeric(2,1);
-- gera user_id para quem ainda não tem, por ordem de criação
do $$
declare rec record;
begin
  for rec in select id, name from players where user_id is null order by created_at, id loop
    update players set user_id = gen_user_id(name) where id = rec.id;
  end loop;
end $$;
-- Os CHECK são adicionados à parte: `add constraint` não tem "if not
-- exists", por isso perguntamos ao catálogo antes.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'players_player_type_check'
                    and conrelid = 'public.players'::regclass) then
    alter table players add constraint players_player_type_check
      check (player_type in ('FIELD','GOALKEEPER'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'players_primary_position_check'
                    and conrelid = 'public.players'::regclass) then
    alter table players add constraint players_primary_position_check
      check (primary_position is null or primary_position in
             ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'players_secondary_position_check'
                    and conrelid = 'public.players'::regclass) then
    alter table players add constraint players_secondary_position_check
      check (secondary_position is null or secondary_position in
             ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST'));
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'players_position_status_check'
                    and conrelid = 'public.players'::regclass) then
    alter table players add constraint players_position_status_check
      check (position_status in
             ('NOT_SELECTED','PENDING_REVIEW','APPROVED','ADJUSTED_BY_ADMIN'));
  end if;
end $$;
-- semente do sorteio, para o repetir tal e qual

-- CHECK idempotente: `add constraint` não tem "if not exists".
do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_status_chk' and conrelid = 'public.matches'::regclass
  ) then
    alter table matches add constraint matches_status_chk
      check (status in ('DRAFT','PUBLISHED','IN_PROGRESS','COMPLETED','CANCELLED'));
  end if;
end
$chk$;
do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_result_status_chk' and conrelid = 'public.matches'::regclass
  ) then
    alter table matches add constraint matches_result_status_chk
      check (result_status in ('NONE','DRAFT','PUBLISHED'));
  end if;
end
$chk$;
do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'match_substitutions_kind_chk'
      and conrelid = 'public.match_substitutions'::regclass
  ) then
    alter table match_substitutions add constraint match_substitutions_kind_chk
      check (kind in ('DESISTENCIA','TROCA'));
  end if;
end
$chk$;
do $chk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_post_rating_status_chk' and conrelid = 'public.matches'::regclass
  ) then
    alter table matches add constraint matches_post_rating_status_chk
      check (post_rating_status in ('CLOSED','OPEN'));
  end if;
end
$chk$;
do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_gk_mode_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_gk_mode_chk
      check (gk_mode in ('FIXED','ROTATING'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_team_size_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_team_size_chk
      check (team_size between 5 and 8);
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_gk_rotation_minutes_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_gk_rotation_minutes_chk
      check (gk_rotation_minutes is null or gk_rotation_minutes between 1 and 120);
  end if;
end
$chk$;
do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'match_lineup_gk_order_chk' and conrelid = 'public.match_lineup'::regclass) then
    alter table match_lineup add constraint match_lineup_gk_order_chk
      check (gk_order is null or gk_order between 1 and 8);
  end if;
end
$chk$;
do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_voting_status_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_voting_status_chk
      check (voting_status in ('NONE','OPEN','REVIEW','CLOSED'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'matches_voting_quorum_chk' and conrelid = 'public.matches'::regclass) then
    alter table matches add constraint matches_voting_quorum_chk
      check (voting_quorum_pct between 0 and 100);
  end if;
end
$chk$;
-- ---------- 3. O SCORE PASSA A DECIMAL E ANULÁVEL ----------
-- O check antigo (`between 0 and 5` sobre int) tem de sair antes da
-- mudança de tipo, senão a conversão esbarra nele.
do $mig$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.ratings'::regclass and contype = 'c'
                and pg_get_constraintdef(oid) ilike '%score%') then
    execute (select 'alter table ratings drop constraint ' || quote_ident(conname)
             from pg_constraint
             where conrelid = 'public.ratings'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%score%'
             limit 1);
  end if;
end
$mig$;
do $chk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'ratings_score_chk' and conrelid = 'public.ratings'::regclass) then
    alter table ratings add constraint ratings_score_chk
      check (score is null or (score >= 0 and score <= 5));
  end if;
end
$chk$;

-- ============================== INDICES =============================
create unique index if not exists players_name_key on players (lower(name));
create unique index if not exists players_user_id_key on players(user_id);
create index if not exists player_position_history_player_idx
  on player_position_history(player_id, changed_at desc);
-- Dois jogadores no mesmo lugar da mesma equipa é sempre um bug: a rede
-- de segurança fica na base de dados, não só na validação da função.
create unique index if not exists match_lineup_slot_uidx
  on match_lineup (match_id, team, assigned_position);
-- O "próximo jogo" é lido em cada visita à Home.
create index if not exists matches_status_kickoff_idx on matches (status, kickoff_at);
-- A PK só serve buscas por rodada; o ranking percorre por goleiro.
create index if not exists goalkeeper_match_stats_gk_idx
  on goalkeeper_match_stats (goalkeeper_id);
create index if not exists match_substitutions_match_idx
  on match_substitutions (match_id, created_at);
create index if not exists match_media_match_idx on match_media (match_id, created_at);
-- No máximo UMA foto principal por jogo — a régua fica na base de dados.
create unique index if not exists match_media_primary_uidx
  on match_media (match_id) where is_primary;
create index if not exists match_activity_match_idx on match_activity (match_id, created_at);
create index if not exists match_publications_feed_idx
  on match_publications (published_at desc);
create index if not exists match_publications_match_idx
  on match_publications (match_id);
create index if not exists match_swaps_match_idx on match_swaps (match_id, created_at);
create index if not exists post_match_ratings_target_idx
  on post_match_ratings (target_id, match_id);
-- Duas pessoas na mesma vez do rodízio da mesma equipa é sempre um bug —
-- a rede de segurança fica na base, como já acontece com os lugares.
create unique index if not exists match_lineup_gk_order_uidx
  on match_lineup (match_id, team, gk_order) where gk_order is not null;
-- ---------- 4. HISTÓRICO DE QUEM COMEÇOU NO GOL ----------
-- Não é tabela nova: deriva-se de match_lineup. Só falta o índice que
-- torna a pergunta "quantas vezes o João começou no gol?" barata.
create index if not exists match_lineup_gk_starts_idx
  on match_lineup (player_id) where is_goalkeeper;
-- Índice do fecho preguiçoso: a pergunta "há votações expiradas?" é feita
-- a cada leitura de jogos e tem de custar quase nada.
create index if not exists matches_voting_open_idx
  on matches (voting_deadline) where voting_status = 'OPEN';
create index if not exists player_devices_player_idx on player_devices (player_id);

-- =============================== VIEWS ==============================
-- A view nasceu na 0019 com `select m.*` e ficou com as colunas que
-- existiam nessa altura — as da 0024 e as de cima não estão lá. Recriar
-- acrescenta-as no fim (CREATE OR REPLACE VIEW só deixa ACRESCENTAR, e é
-- por isso que a definição tem de ficar igual em tudo o resto).
create or replace view matches_validas as
  select m.*
  from matches m
  where m.status = 'COMPLETED'
    and m.result_status = 'PUBLISHED';
-- Só contam as avaliações de jogos válidos (resultado publicado, jogo não
-- cancelado) e da versão 2. Uma avaliação de um jogo que o admin despublique
-- deixa de contar sozinha — e volta a contar se ele o republicar.
create or replace view post_ratings_validas as
  select r.match_id, r.rater_id, r.target_id, r.stars, r.created_at,
         m.played_at
  from post_match_ratings r
  join matches_validas m on m.id = r.match_id
  where m.overall_version = 2;
-- ---------- 3. QUEM JOGOU, QUEM VENCEU, QUEM PODE SER VOTADO ----------

-- Participantes de um jogo, com a equipa. Os goleiros entram por duas
-- portas (o admin grava-os em match_stats a partir da escalação, mas a
-- tabela de baliza é a fonte que nunca falha), por isso a união exclui
-- quem já veio pela primeira — senão um goleiro aparecia duas vezes e
-- contava a dobrar nas contagens.
--
-- É uma VIEW e não só uma função por causa das leituras: uma função em
-- FROM não pode receber colunas do mesmo nível da consulta, e as funções
-- de leitura precisam de juntar participantes a vários jogos de uma vez.
create or replace view participantes_do_jogo as
  select ms.match_id, ms.player_id, ms.team
  from match_stats ms
  union all
  select g.match_id, g.goalkeeper_id, g.team
  from goalkeeper_match_stats g
  where not exists (select 1 from match_stats ms2
                     where ms2.match_id = g.match_id and ms2.player_id = g.goalkeeper_id);
-- ---------- 15. O QUÓRUM ENTRA NOS PRÉMIOS ----------
-- Uma rodada onde votaram 3 de 14 não pode valer o mesmo que uma com 12.
-- A partir daqui só contam para craque/bagre as rodadas FECHADAS — e o
-- vencedor é o congelado no fecho, não um recálculo a cada leitura.
create or replace view premios_da_rodada as
  select m.id as match_id, m.played_at, m.craque_final, m.bagre_final
  from matches_validas m
  where m.voting_status = 'CLOSED';
-- ---------- 1. O RESULTADO ESPERADO DE CADA RODADA ----------
--
-- Curva logística, como no Elo: a diferença de forças vira probabilidade.
-- `ESCALA = 100` foi calibrada para esta pelada — uma diferença de 35
-- pontos (o limiar a partir do qual o sorteio já chama "desequilibrado" a
-- um jogo de ~430 de força) dá ~69% de hipóteses ao favorito. Mais alto
-- achatava tudo para 50%; mais baixo fazia de qualquer desequilíbrio uma
-- certeza, e no futebol 7 não há certezas.
--
-- Rodadas sem forças gravadas (as anteriores à 0016, ou as criadas à mão
-- no painel de rodadas antigas) ficam de FORA: sem sorteio não há
-- expectativa, e inventar uma seria pior do que não ter parcela nenhuma.
create or replace view resultados_esperados as
  select
    m.id                                        as match_id,
    m.played_at,
    m.team_a_overall,
    m.team_b_overall,
    (1.0 / (1.0 + power(10.0, -((m.team_a_overall - m.team_b_overall)::numeric) / 100.0)))
                                                as esperado_a,
    case when m.score_a > m.score_b then 1.0
         when m.score_a < m.score_b then 0.0
         else 0.5
    end                                         as real_a
  from matches_validas m
  where m.team_a_overall is not null
    and m.team_b_overall is not null
    and m.score_a is not null
    and m.score_b is not null;
-- ---------- 2. O SALDO DE CADA JOGADOR ----------
--
-- Para quem jogou na equipa B o saldo é o simétrico:
--   (1 − real_a) − (1 − esperado_a)  =  esperado_a − real_a
--
-- Fica escrito por extenso em vez de simplificado — quem vier a ler isto
-- daqui a um ano tem de conseguir confirmar o sinal sem fazer contas.
--
-- Só entram jogadores com equipa atribuída: sem saber de que lado alguém
-- jogou não há resultado que lhe pertença.
create or replace view saldo_esperado_por_jogador as
  select
    pj.player_id,
    count(*)::int as jogos,
    sum(case when pj.team = 'A' then re.real_a - re.esperado_a
             else (1.0 - re.real_a) - (1.0 - re.esperado_a)
        end)::numeric as saldo
  from participantes_do_jogo pj
  join resultados_esperados re on re.match_id = pj.match_id
  where pj.team in ('A', 'B')
  group by pj.player_id;

-- ============================== FUNCOES =============================
--
-- Primeiro apaga-se toda a versao antiga de cada funcao desta lista, por
-- duas razoes:
--
--   1. `create or replace function` recusa mudar o tipo de retorno. Varias
--      funcoes mudaram (`get_players` passou a devolver mais colunas,
--      `submit_ratings` passou de void para json). Sem o drop, o ficheiro
--      so correria numa base ja actualizada.
--   2. Mudar os parametros nao substitui a funcao: cria uma SEGUNDA com o
--      mesmo nome. Com duas a existir, o PostgREST deixa de saber qual
--      chamar e devolve erro de ambiguidade. O drop apanha TODAS as
--      assinaturas de cada nome, nao so a que este ficheiro cria.
--
-- Funcoes nao guardam dados. Apagar e recriar nao toca em nenhuma linha.
do $limpar$
declare r record;
begin
  for r in select p.oid::regprocedure as assinatura
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = any (array[
              'ack_position_notice', 'admin_add_media', 'admin_approve', 'admin_approve_positions',
              'admin_cancel_match', 'admin_clear_card_choices', 'admin_close_game', 'admin_delete_match',
              'admin_delete_media', 'admin_delete_post', 'admin_delete_schedule', 'admin_export',
              'admin_finalize_voting', 'admin_match_activity', 'admin_matches_upcoming', 'admin_ok',
              'admin_pending', 'admin_position_history', 'admin_positions_overview', 'admin_publish_match',
              'admin_publish_result', 'admin_ratings_progress', 'admin_regen_user_id', 'admin_reject',
              'admin_reset_ratings', 'admin_reset_ratings_for', 'admin_reveal_ratings', 'admin_revoke_devices',
              'admin_save_gk_stats', 'admin_save_lineup', 'admin_save_match', 'admin_save_result',
              'admin_save_schedule', 'admin_set_gk_rotation', 'admin_set_match_status', 'admin_set_pin',
              'admin_set_positions', 'admin_set_primary_media', 'admin_set_user_id', 'admin_set_voting',
              'admin_substitute_player', 'admin_swap_players', 'admin_undo_substitution', 'admin_undo_swap',
              'admin_update_post', 'admin_users', 'admin_voting_review', 'autenticar_votante',
              'avaliacoes_completas', 'avaliacoes_em_falta', 'avaliacoes_reveladas', 'change_pin',
              'corrigir_ordem_rodizio', 'elegiveis_premio', 'fechar_votacao', 'fechar_votacoes_expiradas',
              'gen_user_id', 'get_feed', 'get_goalkeeper_stats', 'get_latest_match',
              'get_match', 'get_match_gk_stats', 'get_matches', 'get_my_open_votes',
              'get_next_match', 'get_pending_ratings', 'get_player_chemistry', 'get_player_profile',
              'get_player_stats', 'get_player_stats_range', 'get_players', 'get_published_draw',
              'get_ratings_received', 'get_round_ballot', 'issue_device_token', 'jogadores_do_jogo',
              'lider_do_premio', 'limpar_votos_invalidos', 'login', 'login_with_device',
              'match_admin_json', 'match_json', 'match_public_json', 'participacao_da_votacao',
              'payload_resultado', 'position_json', 'position_ok', 'prazo_de_votacao',
              'preencher_gk_order', 'publicar_no_feed', 'publish_draw', 'recalcular_forcas_do_jogo',
              'registar_atividade', 'register', 'revoke_device', 'set_my_gk_rotation',
              'set_my_nickname', 'set_my_positions', 'set_my_primary_card', 'sincronizar_post_rating_status',
              'slugify', 'submit_ratings', 'submit_round_vote', 'talvez_revelar_avaliacoes',
              'update_photo', 'vencedor_do_jogo'
            ])
  loop
    execute 'drop function if exists ' || r.assinatura;
  end loop;
end
$limpar$;

-- `check_function_bodies` desligado durante esta seccao. Sem isso, uma
-- funcao em SQL que chame outra ainda por criar rebentava, e o ficheiro
-- passava a depender da ordem exata em que estao escritas. Volta a ligar
-- no fim.
set check_function_bodies = off;
create or replace function admin_approve(p_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update players set approved = true where id = p_id;
end; $$;
create or replace function admin_ok(p_pw text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select exists(select 1 from app_config where id = 1 and admin_pw_hash = crypt(p_pw, admin_pw_hash));
$$;
create or replace function admin_pending(p_pw text)
returns table(id uuid, name text, dob date, photo_url text, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return query select p.id, p.name, p.dob, p.photo_url, p.created_at
               from players p where not p.approved order by p.created_at;
end; $$;
create or replace function admin_reject(p_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from players where id = p_id;
end; $$;
create or replace function get_published_draw()
returns json language sql security definer set search_path = public, extensions as $$
  select json_build_object('team_a', team_a, 'team_b', team_b, 'created_at', created_at)
  from draws where published order by created_at desc limit 1;
$$;
create or replace function publish_draw(p_pw text, p_a jsonb, p_b jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  insert into draws(team_a, team_b) values (p_a, p_b);
end; $$;
-- Admin apaga uma rodada (leva junto stats e votos, por cascade)
create or replace function admin_delete_match(p_pw text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from matches where id = p_id;
end; $$;
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
-- Admin: reiniciar as avaliações DE UM jogador (todos reavaliam-no).
create or replace function admin_reset_ratings_for(p_pw text, p_target uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from ratings where target_id = p_target;
end; $$;
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
-- Regenera o user_id a partir do nome atual (com deduplicação).
-- Exclui o próprio jogador da verificação (a coluna é NOT NULL, por isso
-- não se pode passar por null; deduplica ignorando o id atual).
create or replace function admin_regen_user_id(p_pw text, p_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_name text; base text; candidate text; n int := 1;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  select name into v_name from players where id = p_id;
  if v_name is null then raise exception 'CRED'; end if;
  base := slugify(v_name);
  if base = '' then base := 'jogador'; end if;
  candidate := base;
  while exists (select 1 from players where user_id = candidate and id <> p_id) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  update players set user_id = candidate where id = p_id;
  return candidate;
end; $$;
-- Define um user_id personalizado (normalizado; tem de ser único).
create or replace function admin_set_user_id(p_pw text, p_id uuid, p_new text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_slug text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  v_slug := slugify(p_new);
  if v_slug = '' then raise exception 'IDVAZIO'; end if;
  if exists (select 1 from players where user_id = v_slug and id <> p_id) then raise exception 'IDEXISTE'; end if;
  update players set user_id = v_slug where id = p_id;
  return v_slug;
end; $$;
-- ---------- ADMIN: gestão de IDs ----------

-- Lista TODOS os utilizadores (aprovados e pendentes) com o seu estado.
create or replace function admin_users(p_pw text)
returns table(id uuid, name text, user_id text, approved boolean, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return query
    select p.id, p.name, p.user_id, p.approved, p.created_at
    from players p order by p.created_at;
end; $$;
-- Gera um user_id único a partir do nome (sufixo numérico se já existir).
create or replace function gen_user_id(p_name text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare base text; candidate text; n int := 1;
begin
  base := slugify(p_name);
  if base = '' then base := 'jogador'; end if;
  candidate := base;
  while exists (select 1 from players where user_id = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  return candidate;
end; $$;
create function register(p_name text, p_dob date, p_photo text, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_uid text;
begin
  if length(coalesce(btrim(p_name), '')) = 0 then raise exception 'NOME'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN'; end if;
  if coalesce(length(p_photo), 0) = 0 then raise exception 'FOTO'; end if;
  -- nomes repetidos já não são bloqueados: o user_id garante a unicidade
  v_uid := gen_user_id(p_name);
  insert into players(name, dob, photo_url, approved, pin_hash, user_id)
  values (btrim(p_name), p_dob, p_photo, false, crypt(p_pin, gen_salt('bf')), v_uid);
  return v_uid;
end; $$;
-- ---------- HELPERS ----------

-- Normaliza um texto para slug: minúsculas, sem acentos, só [a-z0-9].
-- Usa translate() (sem depender da extensão unaccent, que tem gotchas de
-- schema no Supabase) — cobre os acentos do português de forma determinística.
create or replace function slugify(p text)
returns text language sql immutable as $$
  select regexp_replace(
    translate(
      lower(coalesce(p, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+', '', 'g'
  );
$$;
-- Snapshot dos dados para backup. p_photos = true inclui as fotos (fica
-- bem maior). Nunca exporta pin_hash.
create or replace function admin_export(p_pw text, p_photos boolean)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return json_build_object(
    'exported_at', now(),
    'com_fotos', coalesce(p_photos, false),
    'players', (
      select coalesce(json_agg(json_build_object(
               'id', p.id, 'name', p.name, 'user_id', p.user_id, 'dob', p.dob,
               'approved', p.approved, 'is_admin', p.is_admin, 'created_at', p.created_at,
               'photo', case when p_photos then p.photo_url else null end)
             order by p.created_at), '[]'::json) from players p),
    'ratings', (
      select coalesce(json_agg(json_build_object(
               'rater_id', r.rater_id, 'target_id', r.target_id, 'score', r.score)), '[]'::json)
      from ratings r),
    'matches', (
      select coalesce(json_agg(json_build_object(
               'id', m.id, 'played_at', m.played_at,
               'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
               'score_a', m.score_a, 'score_b', m.score_b, 'notes', m.notes,
               'winner_photo',   case when p_photos then m.winner_photo   else null end,
               'location_photo', case when p_photos then m.location_photo else null end)
             order by m.played_at), '[]'::json) from matches m),
    'match_stats', (
      select coalesce(json_agg(json_build_object(
               'match_id', ms.match_id, 'player_id', ms.player_id,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists)), '[]'::json)
      from match_stats ms),
    'award_votes', (
      select coalesce(json_agg(json_build_object(
               'match_id', av.match_id, 'voter_id', av.voter_id,
               'craque_id', av.craque_id, 'bagre_id', av.bagre_id)), '[]'::json)
      from award_votes av)
  );
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
-- ---------- O JOGADOR CONFIRMA QUE VIU O AVISO ----------
create or replace function ack_position_notice(p_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players p where p.id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  update players set position_notice = null, position_notice_at = null where id = p_id;
end; $$;
-- ---------- O ADMIN VALIDA A ESCOLHA DO JOGADOR ----------
-- Idempotente: só PENDING_REVIEW → APPROVED. Chamar outra vez (ou sobre
-- quem ainda não escolheu) devolve o estado atual sem escrever nada.
create or replace function admin_approve_positions(p_pw text, p_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select * into r from players p where p.id = p_id;
  if r.id is null then raise exception 'SEMJOGADOR'; end if;

  if r.position_status = 'PENDING_REVIEW' then
    update players set
      position_status     = 'APPROVED',
      position_updated_at = now(),
      position_updated_by = null
    where id = p_id;

    insert into player_position_history(
      player_id,
      previous_player_type, new_player_type,
      previous_primary_position, new_primary_position,
      previous_secondary_position, new_secondary_position,
      previous_accepts, new_accepts,
      changed_by, changed_by_admin, change_reason)
    values (
      p_id,
      r.player_type, r.player_type,
      r.primary_position, r.primary_position,
      r.secondary_position, r.secondary_position,
      r.accepts_other_positions, r.accepts_other_positions,
      null, true, 'Posição validada pelo administrador');
  end if;

  return position_json(p_id);
end; $$;
-- Histórico de um jogador, do mais recente para o mais antigo.
create or replace function admin_position_history(p_pw text, p_id uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (
    select coalesce(json_agg(json_build_object(
             'id', h.id, 'changed_at', h.changed_at,
             'previous_player_type', h.previous_player_type,
             'new_player_type', h.new_player_type,
             'previous_primary_position', h.previous_primary_position,
             'new_primary_position', h.new_primary_position,
             'previous_secondary_position', h.previous_secondary_position,
             'new_secondary_position', h.new_secondary_position,
             'previous_accepts', h.previous_accepts,
             'new_accepts', h.new_accepts,
             'changed_by', h.changed_by,
             'changed_by_name', a.name,
             'changed_by_admin', h.changed_by_admin,
             'change_reason', h.change_reason)
           order by h.changed_at desc), '[]'::json)
    from player_position_history h
    left join players a on a.id = h.changed_by
    where h.player_id = p_id
  );
end; $$;
-- ---------- PAINÉIS DO ADMIN (só leitura) ----------

-- Quem falta escolher aparece primeiro, depois quem espera validação.
create or replace function admin_positions_overview(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (
    select coalesce(json_agg(json_build_object(
             'id', p.id, 'name', p.name, 'user_id', p.user_id, 'photo', p.photo_url,
             'player_type', p.player_type,
             'primary_position', p.primary_position,
             'secondary_position', p.secondary_position,
             'accepts_other_positions', p.accepts_other_positions,
             'position_status', p.position_status,
             'position_updated_at', p.position_updated_at,
             'changed_by_admin', (
               select h.changed_by_admin from player_position_history h
               where h.player_id = p.id
               order by h.changed_at desc limit 1))
           order by case p.position_status
                      when 'NOT_SELECTED'   then 0
                      when 'PENDING_REVIEW' then 1
                      else 2
                    end, p.name), '[]'::json)
    from players p where p.approved
  );
end; $$;
-- ---------- O ADMIN AJUSTA ----------
-- Escreve tudo, incluindo o player_type, e avisa o jogador. Não toca em
-- match_lineup/match_stats: rodadas já jogadas ficam como foram jogadas.
create or replace function admin_set_positions(
  p_pw text, p_id uuid, p_type text, p_primary text, p_secondary text,
  p_accepts boolean, p_reason text
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_type text; v_primary text; v_secondary text;
        v_accepts boolean; v_label text; v_mudou boolean;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select * into r from players p where p.id = p_id;
  if r.id is null then raise exception 'SEMJOGADOR'; end if;

  v_type      := upper(nullif(btrim(coalesce(p_type, '')), ''));
  v_primary   := nullif(btrim(coalesce(p_primary, '')), '');
  v_secondary := nullif(btrim(coalesce(p_secondary, '')), '');
  v_accepts   := coalesce(p_accepts, r.accepts_other_positions, true);

  -- tipo inválido devolve POSINVALIDA (o mesmo código): para quem está no
  -- ecrã é tudo "os dados da posição não servem"
  if v_type is null or v_type not in ('FIELD','GOALKEEPER') then raise exception 'POSINVALIDA'; end if;
  if not position_ok(v_primary) then raise exception 'POSINVALIDA'; end if;
  if v_secondary is not null and not position_ok(v_secondary) then raise exception 'POSINVALIDA'; end if;
  if v_secondary is not null and v_secondary = v_primary then raise exception 'POSIGUAL'; end if;

  v_mudou := v_type is distinct from r.player_type
          or v_primary is distinct from r.primary_position
          or v_secondary is distinct from r.secondary_position;

  v_label := case v_primary
    when 'GK'    then 'Goleiro'
    when 'DEF-L' then 'Defesa esquerdo'
    when 'DEF-R' then 'Defesa direito'
    when 'MID-L' then 'Ala esquerdo'
    when 'MID-C' then 'Meio-campo'
    when 'MID-R' then 'Ala direito'
    when 'ST'    then 'Atacante'
  end;

  update players set
    player_type             = v_type,
    primary_position        = v_primary,
    secondary_position      = v_secondary,
    accepts_other_positions = v_accepts,
    position_status         = 'ADJUSTED_BY_ADMIN',
    position_updated_at     = now(),
    -- o admin não tem player id garantido; quem foi fica no histórico
    position_updated_by     = null,
    -- só avisa se a posição mudou mesmo: gravar duas vezes o mesmo não
    -- é notícia nenhuma para o jogador (r é a linha antes desta gravação).
    -- Passar a goleiro é a mudança que mais lhe muda o jogo, por isso vai
    -- dita por extenso e não só implícita no nome da posição.
    position_notice    = case when v_mudou
                           then 'A tua posição foi atualizada para ' || v_label
                                || ' pelo administrador.'
                                || case when v_type is distinct from r.player_type
                                     then ' Passas a estar registado como '
                                          || case v_type when 'GOALKEEPER' then 'goleiro'
                                                         else 'jogador de campo' end
                                          || '.'
                                     else '' end
                           else r.position_notice end,
    position_notice_at = case when v_mudou then now() else r.position_notice_at end
  where id = p_id;

  insert into player_position_history(
    player_id,
    previous_player_type, new_player_type,
    previous_primary_position, new_primary_position,
    previous_secondary_position, new_secondary_position,
    previous_accepts, new_accepts,
    changed_by, changed_by_admin, change_reason)
  values (
    p_id,
    r.player_type, v_type,
    r.primary_position, v_primary,
    r.secondary_position, v_secondary,
    r.accepts_other_positions, v_accepts,
    null, true, nullif(btrim(coalesce(p_reason, '')), ''));

  return position_json(p_id);
end; $$;
-- Estado de posição de um jogador em JSON — partilhado por todas as
-- funções que gravam, para o frontend receber sempre a mesma forma.
--
-- ATENÇÃO: é um HELPER INTERNO, não uma função da API. Devolve o `user_id`
-- (que é meia credencial de login) sem pedir PIN nem senha, por isso fica
-- FECHADA a anon/authenticated logo a seguir — quem a chama são as funções
-- SECURITY DEFINER abaixo, que correm como dono e não passam por esse grant.
create or replace function position_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', p.id, 'name', p.name, 'user_id', p.user_id,
    'player_type', p.player_type,
    'primary_position', p.primary_position,
    'secondary_position', p.secondary_position,
    'accepts_other_positions', p.accepts_other_positions,
    'position_status', p.position_status,
    'position_updated_at', p.position_updated_at,
    'position_notice', p.position_notice,
    'position_notice_at', p.position_notice_at
  )
  from players p where p.id = p_id;
$$;
-- ---------- HELPERS ----------

-- Valida um id de posição. Null-safe de propósito: `x in (...)` com x null
-- devolve NULL e um IF com condição NULL não dispara (a mesma armadilha do
-- crypt()); o coalesce garante um booleano de verdade.
create or replace function position_ok(p text)
returns boolean language sql immutable as $$
  select coalesce(p in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST'), false);
$$;
-- ---------- O JOGADOR ESCOLHE (uma única vez) ----------
create or replace function set_my_positions(
  p_id uuid, p_pin text, p_primary text, p_secondary text, p_accepts boolean
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_primary text; v_secondary text; v_accepts boolean;
begin
  -- `for update` porque a regra é "escolhe-se UMA vez": sem o lock, dois
  -- toques seguidos no botão (ou dois separadores abertos) liam ambos
  -- NOT_SELECTED e gravavam os dois, cada um com a sua linha de histórico.
  select * into r from players p where p.id = p_id for update;
  -- crypt() é STRICT: com p_pin null devolve null e o IF não dispararia
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  -- o bloqueio: só há uma escolha por jogador, o resto é com o admin
  if coalesce(r.position_status, 'NOT_SELECTED') <> 'NOT_SELECTED' then
    raise exception 'POSFIXA';
  end if;

  v_primary   := nullif(btrim(coalesce(p_primary, '')), '');
  v_secondary := nullif(btrim(coalesce(p_secondary, '')), '');
  v_accepts   := coalesce(p_accepts, true);

  if not position_ok(v_primary) then raise exception 'POSINVALIDA'; end if;
  if v_secondary is not null and not position_ok(v_secondary) then raise exception 'POSINVALIDA'; end if;
  if v_secondary is not null and v_secondary = v_primary then raise exception 'POSIGUAL'; end if;

  update players set
    primary_position        = v_primary,
    secondary_position      = v_secondary,
    accepts_other_positions = v_accepts,
    position_status         = 'PENDING_REVIEW',
    position_updated_at     = now(),
    position_updated_by     = p_id
  where id = p_id;

  -- player_type não entra aqui: quem decide quem é goleiro é o admin
  insert into player_position_history(
    player_id,
    previous_player_type, new_player_type,
    previous_primary_position, new_primary_position,
    previous_secondary_position, new_secondary_position,
    previous_accepts, new_accepts,
    changed_by, changed_by_admin, change_reason)
  values (
    p_id,
    r.player_type, r.player_type,
    r.primary_position, v_primary,
    r.secondary_position, v_secondary,
    r.accepts_other_positions, v_accepts,
    p_id, false, 'Escolha do jogador');

  return position_json(p_id);
end; $$;
-- Apagar só o que ainda não é história: já se apagou uma rodada real por
-- engano neste projeto e não volta a acontecer por esta porta.
create or replace function admin_delete_schedule(p_pw text, p_match uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('DRAFT','CANCELLED') then raise exception 'JOGOFECHADO'; end if;

  -- Segunda tranca, e é a que interessa: o status sozinho não protege nada,
  -- porque admin_set_match_status deixa marcar QUALQUER jogo como CANCELLED —
  -- duas chamadas e uma rodada real passava por aqui, levando gols,
  -- assistências, votos e defesas atrás por cascade. Se há resultado ou votos
  -- registados, isto é história e não se apaga por esta porta.
  if exists (select 1 from match_stats s where s.match_id = p_match)
     or exists (select 1 from award_votes v where v.match_id = p_match) then
    raise exception 'JOGOFECHADO';
  end if;

  delete from matches where id = p_match;
end; $$;
-- ---------- O PRÓXIMO JOGO (público) ----------
-- Preferência para o jogo futuro mais próximo. Se já todos passaram,
-- devolve o mais recente: durante e depois da pelada a Home continua a
-- mostrá-lo ("Aguardando resultado") até o admin registar o placar, o
-- que o passa a COMPLETED e o tira daqui.
create or replace function get_next_match()
returns json language sql stable security definer set search_path = public, extensions as $$
  with elegiveis as (
    -- Sem kickoff_at (rodada antiga reaberta) vale a meia-noite de Lisboa:
    -- `played_at::timestamptz` usaria o fuso da sessão, que no Supabase é UTC,
    -- e um jogo mudava de lado do `now()` conforme quem pergunta.
    select m.id,
           coalesce(m.kickoff_at, m.played_at::timestamp at time zone 'Europe/Lisbon') as quando
    from matches m
    where m.status in ('PUBLISHED','IN_PROGRESS')
  )
  select match_public_json(e.id)
  from elegiveis e
  order by (e.quando < now()),                                  -- futuros primeiro
           case when e.quando >= now() then e.quando end asc,   -- o mais próximo
           e.quando desc                                        -- ou o mais recente
  limit 1;
$$;
-- ---------- GRAVAR OS GOLEIROS DE UMA RODADA ----------
-- p_stats: [{goalkeeper_id, team, saves, goals_conceded}]
-- Lista vazia (ou null) é válida e significa "esta rodada não tem goleiros
-- registados" — é assim que o admin desfaz um registo errado.
create or replace function admin_save_gk_stats(p_pw text, p_match uuid, p_stats jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  r_row record;
  v_gk uuid; v_team text; v_saves int; v_conceded int;
  v_vistos uuid[] := '{}';  -- ids já inseridos, para o duplicado não rebentar na PK
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_match is null or not exists (select 1 from matches m where m.id = p_match) then
    raise exception 'INVALIDO';
  end if;
  -- O `where` é obrigatório: o Supabase bloqueia delete sem filtro (21000)
  -- mesmo dentro de SECURITY DEFINER.
  delete from goalkeeper_match_stats where match_id = p_match;

  -- SQL NULL e jsonb 'null' querem a mesma coisa: a rodada fica sem goleiros.
  if p_stats is null or jsonb_typeof(p_stats) = 'null' then return; end if;
  if jsonb_typeof(p_stats) <> 'array' then raise exception 'STATS'; end if;
  if jsonb_array_length(p_stats) = 0 then return; end if;

  for r_row in select value from jsonb_array_elements(p_stats) loop
    -- Os casts vão dentro de blocos próprios: sem eles, um id malformado ou
    -- um campo de número apagado no formulário ('') sobem como 22P02/22003
    -- crus do Postgres, que o frontend não sabe traduzir (só reconhece os
    -- códigos em maiúsculas) e o admin via "invalid input syntax for uuid".
    begin
      v_gk := nullif(btrim(r_row.value->>'goalkeeper_id'), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SEMJOGADOR';
    end;

    v_team := nullif(r_row.value->>'team', '');

    begin
      v_saves    := coalesce(nullif(btrim(r_row.value->>'saves'), '')::int, 0);
      v_conceded := coalesce(nullif(btrim(r_row.value->>'goals_conceded'), '')::int, 0);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'STATS';
    end;

    if v_gk is null then raise exception 'SEMJOGADOR'; end if;
    if not exists (select 1 from players p where p.id = v_gk) then raise exception 'SEMJOGADOR'; end if;
    if v_gk = any(v_vistos) then raise exception 'STATS'; end if;
    if v_saves < 0 or v_saves > 99 or v_conceded < 0 or v_conceded > 99 then raise exception 'STATS'; end if;
    if v_team is not null and v_team not in ('A','B') then raise exception 'STATS'; end if;

    insert into goalkeeper_match_stats(match_id, goalkeeper_id, team, saves, goals_conceded)
    values (p_match, v_gk, v_team, v_saves, v_conceded);
    v_vistos := v_vistos || v_gk;
  end loop;
end; $$;
-- ---------- LEITURA: OS GOLEIROS DE UMA RODADA ----------
-- Para o admin reabrir o formulário já preenchido em vez de o reescrever.
create or replace function get_match_gk_stats(p_match uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select coalesce(json_agg(json_build_object(
           'goalkeeper_id', g.goalkeeper_id, 'name', p.name, 'team', g.team,
           'saves', g.saves, 'goals_conceded', g.goals_conceded)
         order by g.team nulls last, p.name, g.goalkeeper_id), '[]'::json)
  from goalkeeper_match_stats g
  join players p on p.id = g.goalkeeper_id
  where g.match_id = p_match;
$$;
-- ---------- RECALCULAR AS FORÇAS ----------
-- Depois de uma troca, `matches.team_a_overall` / `team_b_overall` /
-- `balance_pct` deixam de bater certo com a escalação. A soma dos
-- `overall_at_draw` é a mesma conta que o motor de sorteio faz no
-- frontend (`strength`), e a percentagem é a de `avaliarEquilibrio`
-- (diferença a dividir pela média das duas forças) — se divergirem, a
-- Home passa a dizer um número e o campo a mostrar outro.
create or replace function recalcular_forcas_do_jogo(p_match uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_a int; v_b int; v_media numeric;
begin
  select coalesce(sum(l.overall_at_draw) filter (where l.team = 'A'), 0),
         coalesce(sum(l.overall_at_draw) filter (where l.team = 'B'), 0)
    into v_a, v_b
  from match_lineup l
  where l.match_id = p_match;

  v_media := (v_a + v_b) / 2.0;

  update matches set
    team_a_overall = v_a,
    team_b_overall = v_b,
    balance_pct    = case when v_media > 0
                          then round(abs(v_a - v_b) / v_media * 100, 2)
                          else 0 end
  where id = p_match;
end; $$;
-- ---------- 8. FOTOS ----------
create or replace function admin_add_media(p_pw text, p_match uuid, p_kind text, p_data text, p_primary boolean)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_data is null or btrim(p_data) = '' then raise exception 'FOTO'; end if;
  if not exists (select 1 from matches m where m.id = p_match) then raise exception 'INVALIDO'; end if;

  -- marcar esta como principal desmarca a anterior (índice único parcial)
  if coalesce(p_primary, false) then
    update match_media set is_primary = false where match_id = p_match and is_primary;
  end if;

  insert into match_media(match_id, kind, data_url, is_primary)
  values (p_match, coalesce(nullif(btrim(p_kind), ''), 'PHOTO'), p_data, coalesce(p_primary, false))
  returning id into v_id;

  perform registar_atividade(p_match, 'FOTO_ADICIONADA', jsonb_build_object('kind', p_kind));
  return v_id;
end; $$;
create or replace function admin_delete_media(p_pw text, p_media uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from match_media where id = p_media;
  if not found then raise exception 'INVALIDO'; end if;
end; $$;
-- ---------- 9. HISTÓRICO DE UM JOGO ----------
create or replace function admin_match_activity(p_pw text, p_match uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (
    select coalesce(json_agg(json_build_object(
             'id', a.id, 'action', a.action, 'detail', a.detail,
             'actor', a.actor, 'created_at', a.created_at)
           order by a.created_at desc, a.id desc), '[]'::json)
    from match_activity a where a.match_id = p_match
  );
end; $$;
-- O caminho ANTIGO de registar rodadas (aba "Jogos", 0016) continua a
-- existir enquanto a UI migra. Ele fecha o jogo com status COMPLETED —
-- mas agora "contar" exige result_status PUBLISHED, e sem esta linha as
-- rodadas gravadas por ele ficavam invisíveis nas estatísticas. Corpo
-- igual ao da 0016, mais o carimbo do resultado.
create or replace function admin_save_match(
  p_pw text, p_id uuid, p_played_at date,
  p_team_a_name text, p_team_b_name text,
  p_score_a int, p_score_b int,
  p_winner_photo text, p_location_photo text, p_notes text,
  p_stats jsonb
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_match uuid; r_row record; v_goals int; v_assists int; v_team text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_played_at is null then raise exception 'DATA'; end if;
  if p_stats is null or jsonb_array_length(p_stats) < 3 then raise exception 'JOGADORES'; end if;
  if coalesce(p_score_a,0) < 0 or coalesce(p_score_a,0) > 99
     or coalesce(p_score_b,0) < 0 or coalesce(p_score_b,0) > 99 then raise exception 'PLACAR'; end if;

  if p_id is null then
    insert into matches(played_at, team_a_name, team_b_name, score_a, score_b,
                        winner_photo, location_photo, notes,
                        result_status, result_published_at)
    values (p_played_at, coalesce(nullif(btrim(p_team_a_name),''),'Amarelos'),
            coalesce(nullif(btrim(p_team_b_name),''),'Azuis'),
            coalesce(p_score_a,0), coalesce(p_score_b,0),
            nullif(p_winner_photo,''), nullif(p_location_photo,''), nullif(btrim(p_notes),''),
            'PUBLISHED', now())
    returning id into v_match;
  else
    v_match := p_id;
    update matches set
      played_at = p_played_at,
      team_a_name = coalesce(nullif(btrim(p_team_a_name),''),'Amarelos'),
      team_b_name = coalesce(nullif(btrim(p_team_b_name),''),'Azuis'),
      score_a = coalesce(p_score_a,0), score_b = coalesce(p_score_b,0),
      winner_photo = nullif(p_winner_photo,''),
      location_photo = nullif(p_location_photo,''),
      notes = nullif(btrim(p_notes),''),
      status = 'COMPLETED',
      result_status = 'PUBLISHED',
      result_published_at = coalesce(result_published_at, now())
    where id = v_match;
    if not found then raise exception 'INVALIDO'; end if;
    delete from match_stats where match_id = v_match;
  end if;

  for r_row in select value from jsonb_array_elements(p_stats) loop
    v_goals   := coalesce((r_row.value->>'goals')::int, 0);
    v_assists := coalesce((r_row.value->>'assists')::int, 0);
    v_team    := nullif(r_row.value->>'team', '');
    if v_goals < 0 or v_goals > 99 or v_assists < 0 or v_assists > 99 then raise exception 'STATS'; end if;
    if v_team is not null and v_team not in ('A','B') then raise exception 'STATS'; end if;
    insert into match_stats(match_id, player_id, team, goals, assists)
    values (v_match, (r_row.value->>'player_id')::uuid, v_team, v_goals, v_assists);
  end loop;

  perform registar_atividade(v_match, 'RESULTADO_PUBLICADO',
    jsonb_build_object('via', 'registo_rapido'));

  return v_match;
end; $$;
create or replace function admin_set_primary_media(p_pw text, p_media uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_match uuid;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  select match_id into v_match from match_media where id = p_media;
  if v_match is null then raise exception 'INVALIDO'; end if;
  update match_media set is_primary = false where match_id = v_match and is_primary;
  update match_media set is_primary = true where id = p_media;
end; $$;
-- (0017) goleiros
create or replace function get_goalkeeper_stats()
returns json language sql stable security definer set search_path = public, extensions as $$
  with agg as (
    select g.goalkeeper_id                                    as pid,
           count(*)::int                                      as matches,
           coalesce(sum(g.saves), 0)::int                     as saves,
           coalesce(sum(g.goals_conceded), 0)::int            as goals_conceded,
           count(*) filter (where g.goals_conceded = 0)::int  as clean_sheets,
           count(*) filter (
             where g.team is not null
               and ((g.team = 'A' and m.score_a > m.score_b)
                 or (g.team = 'B' and m.score_b > m.score_a)))::int as wins,
           count(*) filter (
             where g.team is not null and m.score_a = m.score_b)::int as draws,
           count(*) filter (
             where g.team is not null
               and ((g.team = 'A' and m.score_a < m.score_b)
                 or (g.team = 'B' and m.score_b < m.score_a)))::int as losses
    from goalkeeper_match_stats g
    join matches_validas m on m.id = g.match_id
    join players gp on gp.id = g.goalkeeper_id and gp.approved
    group by g.goalkeeper_id
  )
  select json_build_object(
    'league', json_build_object(
      'avg_goals_conceded',
      coalesce((select round(sum(a.goals_conceded)::numeric / nullif(sum(a.matches), 0), 2)
                from agg a), 0)
    ),
    'goalkeepers', (
      select coalesce(json_agg(json_build_object(
               'id', p.id, 'name', p.name, 'photo', p.photo_url,
               'player_type',    p.player_type,
               'matches',        coalesce(a.matches, 0),
               'saves',          coalesce(a.saves, 0),
               'goals_conceded', coalesce(a.goals_conceded, 0),
               'clean_sheets',   coalesce(a.clean_sheets, 0),
               'wins',           coalesce(a.wins, 0),
               'draws',          coalesce(a.draws, 0),
               'losses',         coalesce(a.losses, 0))
             order by p.name, p.id), '[]'::json)
      from players p
      left join agg a on a.pid = p.id
      where p.approved and (a.pid is not null or p.player_type = 'GOALKEEPER')
    )
  );
$$;
create or replace function get_latest_match()
returns json language sql security definer set search_path = public, extensions as $$
  select match_json(m.id, true)
  from matches_validas m
  order by m.played_at desc, m.created_at desc limit 1;
$$;
-- (0013) química
create or replace function get_player_chemistry(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  with meus as (
    select ms.match_id, ms.team,
           case
             when (ms.team = 'A' and m.score_a > m.score_b)
               or (ms.team = 'B' and m.score_b > m.score_a) then 'V'
             when m.score_a = m.score_b then 'E'
             else 'D'
           end as res
    from match_stats ms
    join matches_validas m on m.id = ms.match_id
    where ms.player_id = p_id and ms.team is not null
  ),
  parceiros as (
    select o.player_id as pid,
           count(*)::int                                as jogos,
           count(*) filter (where meus.res = 'V')::int  as vitorias
    from meus
    join match_stats o
      on o.match_id = meus.match_id and o.team = meus.team and o.player_id <> p_id
    group by o.player_id
  ),
  advers as (
    select o.player_id as pid,
           count(*)::int                                as jogos,
           count(*) filter (where meus.res = 'V')::int  as vitorias
    from meus
    join match_stats o
      on o.match_id = meus.match_id and o.team is not null and o.team <> meus.team
    group by o.player_id
  )
  select json_build_object(
    'parceiros', (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url,
               'jogos', x.jogos, 'vitorias', x.vitorias,
               'pct', round(100.0 * x.vitorias / nullif(x.jogos, 0))::int)
             order by round(100.0 * x.vitorias / nullif(x.jogos, 0)) desc nulls last,
                      x.jogos desc, p.name), '[]'::json)
      from parceiros x join players p on p.id = x.pid),
    'adversarios', (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url,
               'jogos', x.jogos, 'vitorias', x.vitorias,
               'pct', round(100.0 * x.vitorias / nullif(x.jogos, 0))::int)
             order by round(100.0 * x.vitorias / nullif(x.jogos, 0)) desc nulls last,
                      x.jogos desc, p.name), '[]'::json)
      from advers x join players p on p.id = x.pid)
  );
$$;
-- Registo interno; nunca é chamada de fora (revoke lá em baixo).
create or replace function registar_atividade(p_match uuid, p_action text, p_detail jsonb)
returns void language sql security definer set search_path = public, extensions as $$
  insert into match_activity(match_id, action, detail) values (p_match, p_action, p_detail);
$$;
-- ---------- CANCELAR (0019 → aqui): ganha o post no feed ----------
create or replace function admin_cancel_match(p_pw text, p_match uuid, p_reason text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_result text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status into v_status, v_result
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then return match_public_json(p_match); end if; -- idempotente
  if v_result = 'PUBLISHED' then raise exception 'RESPUBLICADO'; end if;

  update matches set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancel_reason = nullif(btrim(p_reason), '')
  where id = p_match;

  perform registar_atividade(p_match, 'JOGO_CANCELADO',
    jsonb_build_object('motivo', nullif(btrim(p_reason), '')));

  -- só publica se o grupo chegou a saber do jogo: cancelar um rascunho
  -- que ninguém viu não é notícia
  if v_status in ('PUBLISHED','IN_PROGRESS') then
    perform publicar_no_feed(p_match, 'CANCELAMENTO', '🚫 Jogo cancelado',
      nullif(btrim(p_reason), ''),
      (select jsonb_build_object('kickoff_at', m.kickoff_at, 'location', m.location)
       from matches m where m.id = p_match));
  end if;

  return match_public_json(p_match);
end; $$;
create or replace function admin_delete_post(p_pw text, p_post uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  delete from match_publications where id = p_post;
  if not found then raise exception 'INVALIDO'; end if;
end; $$;
create or replace function admin_publish_match(p_pw text, p_match uuid, p_resenha text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_payload jsonb;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status <> 'DRAFT' then raise exception 'JAPUBLICADO'; end if;
  if not exists (select 1 from match_lineup l where l.match_id = p_match) then
    raise exception 'SEMESCALACAO';
  end if;

  update matches set status = 'PUBLISHED', published_at = now() where id = p_match;
  perform registar_atividade(p_match, 'SORTEIO_PUBLICADO', null);

  -- snapshot das equipas para o feed (nome + overall por lado chega para
  -- desenhar o post e o card de partilha sem ir à escalação viva)
  select jsonb_build_object(
    'kickoff_at', m.kickoff_at,
    'location', m.location,
    'team_a_overall', m.team_a_overall,
    'team_b_overall', m.team_b_overall,
    'balance_pct', m.balance_pct,
    'teams', (
      select jsonb_object_agg(t.team, t.nomes) from (
        select l.team,
               jsonb_agg(jsonb_build_object(
                 'name', p.name, 'overall', l.overall_at_draw,
                 'position', l.assigned_position, 'gk', l.is_goalkeeper)
                 order by l.is_goalkeeper desc, l.assigned_position, p.name) as nomes
        from match_lineup l join players p on p.id = l.player_id
        where l.match_id = p_match
        group by l.team
      ) t
    )
  ) into v_payload
  from matches m where m.id = p_match;

  perform publicar_no_feed(p_match, 'SORTEIO', '🎲 Sorteio publicado',
                           nullif(btrim(p_resenha), ''), v_payload);

  return match_public_json(p_match);
end; $$;
-- ---------- FECHAR A PORTA LATERAL DO ESTADO ----------
-- admin_set_match_status deixava publicar (sem post, sem SEMESCALACAO) e
-- despublicar-e-republicar (post de sorteio DUPLICADO). Nenhum ecrã a usa
-- para isso; fica só a transição que os fluxos novos não cobrem.
create or replace function admin_set_match_status(p_pw text, p_match uuid, p_status text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_atual text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status into v_atual from matches m where m.id = p_match;
  if v_atual is null then raise exception 'INVALIDO'; end if;

  -- publicar é em admin_publish_match; fechar é em admin_save_result /
  -- admin_publish_result; cancelar é em admin_cancel_match. Por aqui só
  -- marcar o jogo a decorrer (e voltar atrás).
  if not ( (v_atual = 'PUBLISHED' and p_status = 'IN_PROGRESS')
        or (v_atual = 'IN_PROGRESS' and p_status = 'PUBLISHED') ) then
    raise exception 'INVALIDO';
  end if;

  update matches set status = p_status where id = p_match;
end; $$;
-- ---------- DESFAZER UMA TROCA LIMPA O POST (0018 → aqui) ----------
-- Corpo da 0018 + apagar o post de SUBSTITUICAO correspondente: o desfazer
-- existe para o engano do dedo, e sem isto o feed continuava a anunciar ao
-- grupo uma troca que já não aconteceu.
create or replace function admin_undo_substitution(p_pw text, p_sub uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_sub match_substitutions%rowtype;
  v_status text;
  v_primaria text;
  v_fora boolean;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select * into v_sub from match_substitutions s where s.id = p_sub;
  if not found then raise exception 'INVALIDO'; end if;

  select m.status into v_status from matches m where m.id = v_sub.match_id;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  if not exists (
    select 1 from match_lineup l
    where l.match_id = v_sub.match_id
      and l.player_id = v_sub.in_player_id
      and l.team = v_sub.team
      and l.assigned_position = v_sub.assigned_position
  ) then raise exception 'SUBTROCADA'; end if;

  if exists (
    select 1 from match_lineup l
    where l.match_id = v_sub.match_id and l.player_id = v_sub.out_player_id
  ) then raise exception 'JAESCALADO'; end if;

  select p.primary_position into v_primaria from players p where p.id = v_sub.out_player_id;
  if not found then raise exception 'SEMJOGADOR'; end if;

  v_fora := (not v_sub.is_goalkeeper) and (v_primaria is distinct from v_sub.assigned_position);

  update match_lineup set
    player_id           = v_sub.out_player_id,
    preferred_position  = v_primaria,
    was_out_of_position = v_fora,
    overall_at_draw     = v_sub.out_overall
  where match_id = v_sub.match_id and player_id = v_sub.in_player_id;

  delete from match_substitutions where id = p_sub;

  delete from match_publications
  where match_id = v_sub.match_id
    and type = 'SUBSTITUICAO'
    and payload->>'sub_id' = p_sub::text;

  perform recalcular_forcas_do_jogo(v_sub.match_id);

  return match_public_json(v_sub.match_id);
end; $$;
-- ---------- GERIR PUBLICAÇÕES ----------
create or replace function admin_update_post(p_pw text, p_post uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update match_publications set
    title = coalesce(nullif(btrim(p_title), ''), title),
    body  = nullif(btrim(p_body), '')
  where id = p_post;
  if not found then raise exception 'INVALIDO'; end if;
end; $$;
create or replace function get_feed(p_limit int default 20, p_before timestamptz default null, p_match uuid default null)
returns json language sql stable security definer set search_path = public, extensions as $$
  select coalesce(json_agg(post order by pub_at desc, pub_id desc), '[]'::json)
  from (
    select pub.published_at as pub_at,
           pub.id as pub_id,
           json_build_object(
             'id', pub.id,
             'type', pub.type,
             'title', pub.title,
             'body', pub.body,
             'payload', pub.payload,
             'published_at', pub.published_at,
             'match', json_build_object(
               'id', m.id, 'status', m.status, 'result_status', m.result_status,
               'kickoff_at', m.kickoff_at, 'played_at', m.played_at,
               'location', m.location,
               'score_a', m.score_a, 'score_b', m.score_b,
               'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall),
             'photo', coalesce(
               (select md.data_url from match_media md
                 where md.match_id = m.id and md.is_primary limit 1),
               m.winner_photo),
             -- empates desempatam por NOME, a mesma ordem que match_json
             -- mostra no detalhe da rodada — o feed e o histórico têm de
             -- apontar para a mesma cara
             'craque', case when pub.type = 'RESULTADO' then (
               select json_build_object('player_id', p.id, 'name', p.name, 'photo', p.photo_url)
               from players p
               where p.id = coalesce(
                 m.craque_override,
                 (select t.pid from (
                    select av.craque_id as pid, count(*) as n, pv.name as nome
                    from award_votes av join players pv on pv.id = av.craque_id
                    where av.match_id = m.id
                    group by av.craque_id, pv.name
                    order by n desc, nome
                    limit 1) t)
               )
             ) end,
             'bagre', case when pub.type = 'RESULTADO' then (
               select json_build_object('player_id', p.id, 'name', p.name, 'photo', p.photo_url)
               from players p
               where p.id = coalesce(
                 m.bagre_override,
                 (select t.pid from (
                    select av.bagre_id as pid, count(*) as n, pv.name as nome
                    from award_votes av join players pv on pv.id = av.bagre_id
                    where av.match_id = m.id
                    group by av.bagre_id, pv.name
                    order by n desc, nome
                    limit 1) t)
               )
             ) end
           ) as post
    from match_publications pub
    join matches m on m.id = pub.match_id
    where (p_before is null or pub.published_at < p_before)
      and (p_match is null or pub.match_id = p_match)
    order by pub.published_at desc, pub.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) fila;
$$;
-- ---------- PUBLICAR O RESULTADO (0019 → aqui) ----------
-- O payload vive numa função própria porque é preciso em DOIS sítios: ao
-- publicar e ao EDITAR um resultado já publicado (admin_save_result, mais
-- abaixo) — senão o admin corrigia o placar e o post do feed ficava com o
-- placar antigo para sempre, em contradição com o próprio jogo ao lado.
create or replace function payload_resultado(p_match uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  -- placar, gols e assistências do momento; craque/bagre ficam de fora DE
  -- PROPÓSITO (a votação acontece depois — o get_feed lê os vencedores
  -- atuais quando o post é mostrado)
  select jsonb_build_object(
    'played_at', m.played_at,
    'location', m.location,
    'score_a', m.score_a,
    'score_b', m.score_b,
    'team_a_overall', m.team_a_overall,
    'team_b_overall', m.team_b_overall,
    'goals', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'n', ms.goals)
               order by ms.goals desc, p.name), '[]'::jsonb)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = p_match and ms.goals > 0),
    'assists', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'n', ms.assists)
               order by ms.assists desc, p.name), '[]'::jsonb)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = p_match and ms.assists > 0),
    -- só quem defendeu de facto: um goleiro com 0 defesas nesta lista
    -- lia-se como elogio a quem levou 3 sem tocar na bola
    'saves', (
      select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'n', g.saves)
               order by g.saves desc, p.name), '[]'::jsonb)
      from goalkeeper_match_stats g join players p on p.id = g.goalkeeper_id
      where g.match_id = p_match and g.saves > 0)
  )
  from matches m where m.id = p_match;
$$;
-- ---------- REGISTO INTERNO ----------
create or replace function publicar_no_feed(
  p_match uuid, p_type text, p_title text, p_body text, p_payload jsonb
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  insert into match_publications(match_id, type, title, body, payload)
  values (p_match, p_type, p_title, p_body, p_payload)
  returning id into v_id;
  return v_id;
end; $$;
create or replace function admin_substitute_player(
  p_pw text, p_match uuid, p_out uuid, p_in uuid, p_in_overall int, p_reason text,
  p_kind text default 'DESISTENCIA'
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text;
  v_linha match_lineup%rowtype;
  v_primaria text;
  v_fora boolean;
  v_out_nome text; v_in_nome text;
  v_sub_id uuid;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_out is null or p_in is null then raise exception 'SEMJOGADOR'; end if;
  if p_out = p_in then raise exception 'MESMOJOGADOR'; end if;
  if p_kind is null or p_kind not in ('DESISTENCIA','TROCA') then raise exception 'INVALIDO'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  -- `for update` tranca a linha até ao fim da transação: sem isto, dois
  -- admins a substituir o MESMO jogador ao mesmo tempo passavam ambos nas
  -- verificações (cada um com o seu snapshot) e o segundo gravava uma
  -- substituição que nunca chegou a acontecer.
  select * into v_linha from match_lineup l
  where l.match_id = p_match and l.player_id = p_out
  for update;
  if not found then raise exception 'SEMLINEUP'; end if;

  if exists (select 1 from match_lineup l where l.match_id = p_match and l.player_id = p_in) then
    raise exception 'JAESCALADO';
  end if;

  select p.primary_position into v_primaria from players p where p.id = p_in;
  if not found then raise exception 'SEMJOGADOR'; end if;

  v_fora := (not v_linha.is_goalkeeper) and (v_primaria is distinct from v_linha.assigned_position);

  update match_lineup set
    player_id           = p_in,
    preferred_position  = v_primaria,
    was_out_of_position = v_fora,
    overall_at_draw     = p_in_overall
  where match_id = p_match and player_id = p_out;
  -- cinto e suspensórios: se o update não apanhou nada, alguém mexeu entre
  -- o select e agora — melhor falhar do que registar uma troca fantasma
  if not found then raise exception 'JOGOMEXIDO'; end if;

  insert into match_substitutions(
    match_id, out_player_id, in_player_id, team, assigned_position,
    is_goalkeeper, out_overall, in_overall, reason, kind)
  values (
    p_match, p_out, p_in, v_linha.team, v_linha.assigned_position,
    v_linha.is_goalkeeper, v_linha.overall_at_draw, p_in_overall,
    nullif(btrim(p_reason), ''), p_kind)
  returning id into v_sub_id;

  perform recalcular_forcas_do_jogo(p_match);
  perform registar_atividade(p_match,
    case when p_kind = 'TROCA' then 'JOGADOR_TROCADO' else 'JOGADOR_SUBSTITUIDO' end,
    jsonb_build_object('saiu', p_out, 'entrou', p_in, 'motivo', nullif(btrim(p_reason), '')));

  select p.name into v_out_nome from players p where p.id = p_out;
  select p.name into v_in_nome  from players p where p.id = p_in;
  perform publicar_no_feed(p_match, 'SUBSTITUICAO', '🔄 Mudança na escalação',
    nullif(btrim(p_reason), ''),
    (select jsonb_build_object(
       'sub_id', v_sub_id,
       'kind', p_kind,
       'out_name', v_out_nome, 'in_name', v_in_nome,
       'team', v_linha.team, 'position', v_linha.assigned_position,
       'is_goalkeeper', v_linha.is_goalkeeper,
       'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall,
       'kickoff_at', m.kickoff_at)
     from matches m where m.id = p_match));

  return match_public_json(p_match);
end; $$;
-- ---------- TROCAR DOIS JOGADORES DE EQUIPA ----------
-- Um de cada lado; cada um assume o LUGAR do outro. Goleiro só troca com
-- goleiro (senão uma equipa ficava sem ninguém na baliza). A justificação
-- é opcional de propósito — trocar é uma decisão do admin, não um evento
-- que precise de desculpa.
--
-- O apagar+inserir em vez de dois updates não é estilo: o índice único
-- (match_id, team, assigned_position) é verificado a cada linha alterada,
-- e o primeiro update punha dois jogadores no mesmo lugar por um instante
-- — rebentava com 23505 antes de o segundo update compor as coisas.
create or replace function admin_swap_players(
  p_pw text, p_match uuid, p_a uuid, p_b uuid, p_reason text default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text;
  la match_lineup%rowtype;
  lb match_lineup%rowtype;
  v_nome_a text; v_nome_b text;
  v_swap_id uuid;
  v_apagadas int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_a is null or p_b is null then raise exception 'SEMJOGADOR'; end if;
  if p_a = p_b then raise exception 'MESMOJOGADOR'; end if;

  select m.status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  -- as duas linhas ficam trancadas até ao commit; sem isto, dois admins a
  -- confirmar a MESMA troca em simultâneo desfaziam-na um ao outro em
  -- silêncio (o segundo delete apanhava as linhas já trocadas) e o feed
  -- ficava com dois posts de uma troca que no fim não aconteceu.
  -- Ordenados por id para dois pedidos cruzados não ficarem em impasse.
  perform 1 from match_lineup l
  where l.match_id = p_match and l.player_id in (p_a, p_b)
  order by l.player_id
  for update;

  select * into la from match_lineup l where l.match_id = p_match and l.player_id = p_a;
  if not found then raise exception 'SEMLINEUP'; end if;
  select * into lb from match_lineup l where l.match_id = p_match and l.player_id = p_b;
  if not found then raise exception 'SEMLINEUP'; end if;

  if la.team = lb.team then raise exception 'MESMAEQUIPA'; end if;
  if la.is_goalkeeper <> lb.is_goalkeeper then raise exception 'TROCAGK'; end if;

  delete from match_lineup
  where match_id = p_match and player_id in (p_a, p_b);
  get diagnostics v_apagadas = row_count;
  if v_apagadas <> 2 then raise exception 'JOGOMEXIDO'; end if;

  -- cada um herda equipa E lugar do outro; o overall e a posição preferida
  -- congelados no sorteio viajam com o jogador (são dele, não do lugar) —
  -- ler `players.primary_position` outra vez aqui punha o histórico a mudar
  -- quando o admin corrigisse uma posição depois da publicação
  insert into match_lineup(match_id, player_id, team, assigned_position,
                           preferred_position, was_out_of_position,
                           overall_at_draw, is_goalkeeper)
  values
    (p_match, p_a, lb.team, lb.assigned_position, la.preferred_position,
     (not lb.is_goalkeeper) and (la.preferred_position is distinct from lb.assigned_position),
     la.overall_at_draw, lb.is_goalkeeper),
    (p_match, p_b, la.team, la.assigned_position, lb.preferred_position,
     (not la.is_goalkeeper) and (lb.preferred_position is distinct from la.assigned_position),
     lb.overall_at_draw, la.is_goalkeeper);

  insert into match_swaps(match_id, a_player_id, b_player_id, a_team, b_team,
                          a_position, b_position, is_goalkeeper,
                          a_overall, b_overall, reason)
  values (p_match, p_a, p_b, la.team, lb.team,
          la.assigned_position, lb.assigned_position, la.is_goalkeeper,
          la.overall_at_draw, lb.overall_at_draw, nullif(btrim(p_reason), ''))
  returning id into v_swap_id;

  perform recalcular_forcas_do_jogo(p_match);
  perform registar_atividade(p_match, 'JOGADORES_TROCADOS',
    jsonb_build_object('a', p_a, 'b', p_b, 'motivo', nullif(btrim(p_reason), '')));

  select p.name into v_nome_a from players p where p.id = p_a;
  select p.name into v_nome_b from players p where p.id = p_b;
  perform publicar_no_feed(p_match, 'SUBSTITUICAO', '🔁 Troca de times',
    nullif(btrim(p_reason), ''),
    (select jsonb_build_object(
       'swap', true,
       'swap_id', v_swap_id,
       'a_name', v_nome_a, 'a_team', lb.team,   -- para onde FOI
       'b_name', v_nome_b, 'b_team', la.team,
       'team_a_overall', m.team_a_overall, 'team_b_overall', m.team_b_overall,
       'kickoff_at', m.kickoff_at)
     from matches m where m.id = p_match));

  return match_public_json(p_match);
end; $$;
-- ---------- DESFAZER UMA TROCA ----------
-- Como no desfazer das substituições: só se ninguém mexeu por cima, ou seja,
-- se cada um ainda está no lugar que herdou do outro.
create or replace function admin_undo_swap(p_pw text, p_swap uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  s match_swaps%rowtype;
  v_status text;
  la match_lineup%rowtype;
  lb match_lineup%rowtype;
  v_apagadas int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select * into s from match_swaps x where x.id = p_swap;
  if not found then raise exception 'INVALIDO'; end if;

  select m.status into v_status from matches m where m.id = s.match_id;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('PUBLISHED','IN_PROGRESS') then raise exception 'JOGOFECHADO'; end if;

  perform 1 from match_lineup l
  where l.match_id = s.match_id and l.player_id in (s.a_player_id, s.b_player_id)
  order by l.player_id
  for update;

  -- A está no lugar de B e B no lugar de A? Se não, houve outra mexida.
  select * into la from match_lineup l
  where l.match_id = s.match_id and l.player_id = s.a_player_id
    and l.team = s.b_team and l.assigned_position = s.b_position;
  if not found then raise exception 'SUBTROCADA'; end if;
  select * into lb from match_lineup l
  where l.match_id = s.match_id and l.player_id = s.b_player_id
    and l.team = s.a_team and l.assigned_position = s.a_position;
  if not found then raise exception 'SUBTROCADA'; end if;

  delete from match_lineup
  where match_id = s.match_id and player_id in (s.a_player_id, s.b_player_id);
  get diagnostics v_apagadas = row_count;
  if v_apagadas <> 2 then raise exception 'JOGOMEXIDO'; end if;

  insert into match_lineup(match_id, player_id, team, assigned_position,
                           preferred_position, was_out_of_position,
                           overall_at_draw, is_goalkeeper)
  values
    (s.match_id, s.a_player_id, s.a_team, s.a_position, la.preferred_position,
     (not s.is_goalkeeper) and (la.preferred_position is distinct from s.a_position),
     la.overall_at_draw, s.is_goalkeeper),
    (s.match_id, s.b_player_id, s.b_team, s.b_position, lb.preferred_position,
     (not s.is_goalkeeper) and (lb.preferred_position is distinct from s.b_position),
     lb.overall_at_draw, s.is_goalkeeper);

  delete from match_swaps where id = p_swap;

  delete from match_publications
  where match_id = s.match_id
    and type = 'SUBSTITUICAO'
    and payload->>'swap_id' = p_swap::text;

  perform recalcular_forcas_do_jogo(s.match_id);

  return match_public_json(s.match_id);
end; $$;
-- ---------- CORREÇÃO DO ADMIN ----------
-- Só limpa. O admin não escolhe o card de ninguém — se um apelido for
-- impróprio ou um card estiver errado, apaga-se e o jogador volta a escolher.
create or replace function admin_clear_card_choices(p_pw text, p_id uuid, p_card boolean, p_nickname boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update players set
    primary_card = case when coalesce(p_card, false)     then null else primary_card end,
    nickname     = case when coalesce(p_nickname, false) then null else nickname end
  where id = p_id;
  if not found then raise exception 'SEMJOGADOR'; end if;
end; $$;
-- Corpo da 0015 tal e qual + as duas colunas novas no json. O `voted` é
-- "já não tem ninguém por avaliar", NÃO "já votou alguma vez" — trocar isso
-- mandava metade do grupo de volta ao ecrã de avaliações.
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
    'is_admin', r.is_admin, 'voted', v_pending = 0,
    'player_type', r.player_type,
    'primary_position', r.primary_position,
    'secondary_position', r.secondary_position,
    'accepts_other_positions', r.accepts_other_positions,
    'position_status', r.position_status,
    'position_notice', r.position_notice,
    'primary_card', r.primary_card,
    'nickname', r.nickname
  );
end; $$;
-- ---------- O JOGADOR ESCOLHE O SEU APELIDO ----------
-- Curto de propósito: é para caber no card, não para escrever uma frase.
create or replace function set_my_nickname(p_id uuid, p_pin text, p_nickname text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players; v text;
begin
  select * into r from players p where p.id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  v := nullif(btrim(p_nickname), '');
  if v is not null and char_length(v) > 18 then raise exception 'APELIDO'; end if;

  update players set nickname = v where id = p_id;
end; $$;
-- ---------- O JOGADOR ESCOLHE O SEU CARD ----------
-- `p_card` a null limpa a escolha (volta ao automático: o mais raro).
create or replace function set_my_primary_card(p_id uuid, p_pin text, p_card text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players p where p.id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
    raise exception 'CRED';
  end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  update players set primary_card = nullif(btrim(p_card), '') where id = p_id;
end; $$;
-- ---------- 7. PUBLICAR O RESULTADO ABRE A AVALIAÇÃO (0020 → aqui) ----------
create or replace function admin_publish_result(p_pw text, p_match uuid, p_resenha text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text; v_result text; v_versao int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status, m.overall_version into v_status, v_result, v_versao
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_result = 'NONE' then raise exception 'SEMRESULTADO'; end if;
  if v_result = 'PUBLISHED' then raise exception 'RESPUBLICADO'; end if;

  update matches set
    result_status = 'PUBLISHED',
    result_published_at = now(),
    status = 'COMPLETED'
  where id = p_match;

  perform registar_atividade(p_match, 'RESULTADO_PUBLICADO', null);

  -- Publicar é o gatilho da avaliação pós-jogo: é a partir daqui que há
  -- equipas confirmadas e vencedor definido. Jogos da versão 1 nunca a
  -- abrem — o passado não se reavalia.
  if v_versao = 2 then
    update matches set
      post_rating_status = 'OPEN',
      post_rating_opened_at = now(),
      post_rating_closed_at = null
    where id = p_match;
    perform registar_atividade(p_match, 'POSJOGO_ABERTA', jsonb_build_object('via', 'publicacao'));
  end if;

  perform publicar_no_feed(p_match, 'RESULTADO', '🏆 Resultado publicado',
                           nullif(btrim(p_resenha), ''), payload_resultado(p_match));

  return match_public_json(p_match);
end; $$;
-- ---------- 6. GRAVAR O RESULTADO (0020 → aqui) ----------
-- Corpo da 0020 + duas coisas no fim: a correção de craque/bagre do admin
-- passa a obedecer à mesma regra da votação (não se corrige à mão o que a
-- votação proíbe), e os votos que o novo resultado invalidou são apagados.
create or replace function admin_save_result(
  p_pw text, p_match uuid,
  p_score_a int, p_score_b int,
  p_stats jsonb, p_gk_stats jsonb,
  p_notes text,
  p_craque uuid, p_bagre uuid
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text; v_result text;
  r_row record; v_goals int; v_assists int; v_team text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.result_status into v_status, v_result
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_status = 'DRAFT' then raise exception 'SEMESCALACAO'; end if;

  if coalesce(p_score_a,0) < 0 or coalesce(p_score_a,0) > 99
     or coalesce(p_score_b,0) < 0 or coalesce(p_score_b,0) > 99 then raise exception 'PLACAR'; end if;
  if p_stats is null or jsonb_typeof(p_stats) <> 'array' or jsonb_array_length(p_stats) < 3 then
    raise exception 'JOGADORES';
  end if;
  if p_craque is not null and p_craque = p_bagre then raise exception 'IGUAL'; end if;

  delete from match_stats where match_id = p_match;
  for r_row in select value from jsonb_array_elements(p_stats) loop
    v_goals   := coalesce((r_row.value->>'goals')::int, 0);
    v_assists := coalesce((r_row.value->>'assists')::int, 0);
    v_team    := nullif(r_row.value->>'team', '');
    if v_goals < 0 or v_goals > 99 or v_assists < 0 or v_assists > 99 then raise exception 'STATS'; end if;
    if v_team is not null and v_team not in ('A','B') then raise exception 'STATS'; end if;
    insert into match_stats(match_id, player_id, team, goals, assists)
    values (p_match, (r_row.value->>'player_id')::uuid, v_team, v_goals, v_assists);
  end loop;

  delete from goalkeeper_match_stats where match_id = p_match;
  if p_gk_stats is not null and jsonb_typeof(p_gk_stats) = 'array' then
    for r_row in select value from jsonb_array_elements(p_gk_stats) loop
      insert into goalkeeper_match_stats(match_id, goalkeeper_id, team, saves, goals_conceded)
      values (p_match,
              (r_row.value->>'goalkeeper_id')::uuid,
              nullif(r_row.value->>'team',''),
              coalesce((r_row.value->>'saves')::int, 0),
              coalesce((r_row.value->>'goals_conceded')::int, 0));
    end loop;
  end if;

  update matches set
    score_a = coalesce(p_score_a, 0),
    score_b = coalesce(p_score_b, 0),
    notes   = nullif(btrim(p_notes), ''),
    craque_override = p_craque,
    bagre_override  = p_bagre,
    result_status = case when result_status = 'PUBLISHED' then 'PUBLISHED' else 'DRAFT' end
  where id = p_match;

  -- A partir daqui o placar e as equipas já são os novos — é com eles que
  -- se decide quem podia ser craque e quem podia ser bagre.
  if p_craque is not null
     and not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = p_craque) then
    raise exception 'CRAQUEPERDEDOR';
  end if;
  if p_bagre is not null
     and not exists (select 1 from elegiveis_premio(p_match, 'BAGRE') e where e.player_id = p_bagre) then
    raise exception 'BAGREVENCEDOR';
  end if;

  perform limpar_votos_invalidos(p_match);

  perform registar_atividade(p_match,
    case when v_result = 'PUBLISHED' then 'RESULTADO_EDITADO' else 'RESULTADO_GRAVADO' end,
    jsonb_build_object('score_a', p_score_a, 'score_b', p_score_b,
                       'jogadores', jsonb_array_length(p_stats)));

  if v_result = 'PUBLISHED' then
    update match_publications set payload = payload_resultado(p_match)
    where match_id = p_match and type = 'RESULTADO';
  end if;

  return match_public_json(p_match);
end; $$;
-- Quem pode receber votos de craque ('CRAQUE') ou de bagre ('BAGRE').
--
-- Empate ⇒ toda a gente que jogou (não há vencedor nem derrotado).
-- Rodada antiga sem equipas atribuídas ⇒ idem, senão a votação de uma
-- rodada histórica ficava sem candidatos e ninguém percebia porquê.
--
-- Exige gente dos DOIS lados antes de filtrar: com um deles vazio, uma das
-- listas ficava sem ninguém. É a mesma régua de `src/lib/awards.js` — as
-- duas têm de concordar, senão a UI oferece um candidato que isto recusa.
create or replace function elegiveis_premio(p_match uuid, p_tipo text)
returns table(player_id uuid)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_vencedor text; v_lado text; v_a int; v_b int;
begin
  v_vencedor := vencedor_do_jogo(p_match);

  select count(*) filter (where j.team = 'A'),
         count(*) filter (where j.team = 'B')
    into v_a, v_b
  from jogadores_do_jogo(p_match) j;

  if v_vencedor is null or v_a = 0 or v_b = 0 then
    return query select j.player_id from jogadores_do_jogo(p_match) j;
    return;
  end if;

  v_lado := case
              when p_tipo = 'CRAQUE' then v_vencedor
              when v_vencedor = 'A'  then 'B'
              else 'A'
            end;

  return query select j.player_id from jogadores_do_jogo(p_match) j where j.team = v_lado;
end; $$;
-- Buraco tapado de passagem: `get_match` (0010) devolvia `match_json` de
-- QUALQUER jogo, com fotos, sem olhar ao estado. A 0020 fechou o acesso
-- direto a match_json exatamente para isso, mas esta porta ficou aberta —
-- quem soubesse um id lia um resultado ainda em rascunho. Os dois sítios
-- que a chamam (detalhe da rodada e painel de rodadas antigas) só usam ids
-- vindos de `get_matches`, que já é filtrado; nada muda para eles.
create or replace function get_match(p_id uuid)
returns json language sql security definer set search_path = public, extensions as $$
  select match_json(m.id, true) from matches_validas m where m.id = p_id;
$$;
-- (0019) totais por período — idem, com a média do MESMO período
create or replace function get_player_stats_range(p_from date, p_to date)
returns json language sql stable security definer set search_path = public, extensions as $$
  with mt as (
    select m.id, m.craque_override, m.bagre_override from matches_validas m
    where (p_from is null or m.played_at >= p_from)
      and (p_to   is null or m.played_at <= p_to)
  ),
  craque_t as (
    select av.match_id, coalesce(mt.craque_override, av.craque_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join mt on mt.id = av.match_id
    group by av.match_id, coalesce(mt.craque_override, av.craque_id)
  ),
  bagre_t as (
    select av.match_id, coalesce(mt.bagre_override, av.bagre_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join mt on mt.id = av.match_id
    group by av.match_id, coalesce(mt.bagre_override, av.bagre_id)
  ),
  totals as (
    select ms.player_id,
           count(*)::int                    as matches,
           coalesce(sum(ms.goals), 0)::int   as goals,
           coalesce(sum(ms.assists), 0)::int as assists
    from match_stats ms
    where ms.match_id in (select id from mt)
    group by ms.player_id
  ),
  pos as (
    select pr.target_id as player_id,
           round(avg(pr.stars)::numeric, 2) as media,
           count(*)::int                    as n
    from post_ratings_validas pr
    where pr.match_id in (select id from mt)
    group by pr.target_id
  )
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'name', p.name, 'photo', p.photo_url,
           'matches', coalesce(t.matches, 0),
           'goals',   coalesce(t.goals, 0),
           'assists', coalesce(t.assists, 0),
           'craques', (select count(*) from craque_t c where c.pid = p.id and c.n = c.top)
                    + (select count(*) from mt where mt.craque_override = p.id
                         and not exists (select 1 from award_votes av where av.match_id = mt.id)),
           'bagres',  (select count(*) from bagre_t  b where b.pid = p.id and b.n = b.top)
                    + (select count(*) from mt where mt.bagre_override = p.id
                         and not exists (select 1 from award_votes av where av.match_id = mt.id)),
           'post_rating_avg',   ps.media,
           'post_rating_count', coalesce(ps.n, 0))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t on t.player_id = p.id
  left join pos ps   on ps.player_id = p.id
  where p.approved;
$$;
-- O mesmo, para um jogo só — é a forma cómoda dentro das validações.
create or replace function jogadores_do_jogo(p_match uuid)
returns table(player_id uuid, team text)
language sql stable security definer set search_path = public, extensions as $$
  select pj.player_id, pj.team from participantes_do_jogo pj where pj.match_id = p_match;
$$;
-- ---------- 5. LIMPAR O QUE O RESULTADO INVALIDOU ----------
-- Chamada sempre que o placar ou as equipas mudam. Um voto de craque num
-- jogador que passou a estar do lado derrotado deixa de ser válido — e um
-- voto inválido que ficasse na tabela continuava a contar para os títulos.
--
-- Apaga em vez de marcar: `award_votes` guarda craque e bagre na MESMA
-- linha, com as duas colunas NOT NULL, por isso não há forma de anular
-- meia votação. Quem perdeu o voto volta a ver o cartão de votação.
create or replace function limpar_votos_invalidos(p_match uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_votos int; v_notas int;
begin
  delete from award_votes av
   where av.match_id = p_match
     and (   not exists (select 1 from jogadores_do_jogo(p_match) j where j.player_id = av.voter_id)
          or not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = av.craque_id)
          or not exists (select 1 from elegiveis_premio(p_match, 'BAGRE')  e where e.player_id = av.bagre_id));
  get diagnostics v_votos = row_count;

  -- as avaliações pós-jogo seguem a mesma sorte: quem deixou de ser
  -- companheiro (ou de ter jogado) não pode continuar a dar nota
  delete from post_match_ratings r
   where r.match_id = p_match
     and not exists (
       select 1
       from participantes_do_jogo jr
       join participantes_do_jogo jt
         on jt.match_id = jr.match_id and jt.team = jr.team and jt.team is not null
       where jr.match_id = p_match
         and jr.player_id = r.rater_id
         and jt.player_id = r.target_id
     );
  get diagnostics v_notas = row_count;

  if v_votos > 0 or v_notas > 0 then
    perform registar_atividade(p_match, 'VOTOS_ANULADOS',
      jsonb_build_object('craque_bagre', v_votos, 'pos_jogo', v_notas,
                         'motivo', 'resultado alterado'));
  end if;

  return v_votos + v_notas;
end; $$;
-- ---------- 12. O JOGO PASSA A CONTAR A SUA AVALIAÇÃO ----------
-- match_json (0020) + estado da votação pós-jogo e a média por jogador
-- daquele jogo. Só médias: quem deu que nota não sai daqui.
create or replace function match_json(p_id uuid, p_photos boolean)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', m.id, 'played_at', m.played_at, 'created_at', m.created_at,
    'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
    'score_a', m.score_a, 'score_b', m.score_b,
    'notes', m.notes,
    'overall_version', m.overall_version,
    'post_rating_status', m.post_rating_status,
    'has_winner_photo', m.winner_photo is not null,
    'has_location_photo', m.location_photo is not null,
    'winner_photo',   case when p_photos then m.winner_photo   else null end,
    'location_photo', case when p_photos then m.location_photo else null end,
    'players', (
      select coalesce(json_agg(json_build_object(
               'player_id', ms.player_id, 'name', p.name, 'photo', p.photo_url,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists)
             order by ms.goals desc, ms.assists desc, p.name), '[]'::json)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = m.id),
    'gk_stats', (
      select coalesce(json_agg(json_build_object(
               'goalkeeper_id', g.goalkeeper_id, 'name', p.name,
               'team', g.team, 'saves', g.saves, 'goals_conceded', g.goals_conceded)
             order by p.name), '[]'::json)
      from goalkeeper_match_stats g join players p on p.id = g.goalkeeper_id
      where g.match_id = m.id),
    'post_ratings', (
      select coalesce(json_agg(json_build_object(
               'player_id', t.pid, 'name', p.name, 'photo', p.photo_url,
               'avg', t.media, 'votes', t.n)
             order by t.media desc, p.name), '[]'::json)
      from (select pr.target_id as pid,
                   round(avg(pr.stars)::numeric, 2) as media,
                   count(*)::int as n
            from post_match_ratings pr
            where pr.match_id = m.id
            group by pr.target_id) t
      join players p on p.id = t.pid),
    'votes', (select count(*)::int from award_votes av where av.match_id = m.id),
    -- o override do admin (0019) MANDA: quando existe, o vencedor é ele,
    -- com os votos reais que teve (pode ser 0 — foi decisão do admin).
    'craque', case when m.craque_override is not null then (
      select json_agg(json_build_object('player_id', p.id, 'name', p.name,
               'votes', (select count(*)::int from award_votes av
                          where av.match_id = m.id and av.craque_id = p.id)))
      from players p where p.id = m.craque_override
    ) else (
      select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
               order by t.n desc, t.nome), '[]'::json)
      from (select av.craque_id as pid, p.name as nome, count(*)::int as n
              from award_votes av join players p on p.id = av.craque_id
             where av.match_id = m.id group by av.craque_id, p.name) t
    ) end,
    'bagre', case when m.bagre_override is not null then (
      select json_agg(json_build_object('player_id', p.id, 'name', p.name,
               'votes', (select count(*)::int from award_votes av
                          where av.match_id = m.id and av.bagre_id = p.id)))
      from players p where p.id = m.bagre_override
    ) else (
      select coalesce(json_agg(json_build_object('player_id', t.pid, 'name', t.nome, 'votes', t.n)
               order by t.n desc, t.nome), '[]'::json)
      from (select av.bagre_id as pid, p.name as nome, count(*)::int as n
              from award_votes av join players p on p.id = av.bagre_id
             where av.match_id = m.id group by av.bagre_id, p.name) t
    ) end
  )
  from matches m where m.id = p_id;
$$;
-- 'A', 'B' ou null (empate, ou jogo ainda sem placar).
create or replace function vencedor_do_jogo(p_match uuid)
returns text
language sql stable security definer set search_path = public, extensions as $$
  select case
           when m.score_a is null or m.score_b is null then null
           when m.score_a > m.score_b then 'A'
           when m.score_b > m.score_a then 'B'
           else null
         end
  from matches m where m.id = p_match;
$$;
-- ---------- 6. GRAVAR A ESCALAÇÃO COM O RODÍZIO ----------
-- A assinatura não muda: `gk_order` vem dentro de cada linha do p_lineup,
-- como as outras chaves. Validações novas:
--   ROTATING → cada equipa tem de trazer a ordem completa 1..team_size,
--              sem buracos e sem repetições (o índice único apanha as
--              repetições; os buracos só se apanham contando).
--   FIXED    → gk_order tem de vir nulo, senão a UI mostrava um rodízio
--              que não existe.
create or replace function admin_save_lineup(
  p_pw text, p_match uuid, p_lineup jsonb,
  p_a_overall int, p_b_overall int, p_balance numeric, p_seed text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_status text; v_mode text; v_size int;
  r_row record;
  v_player uuid; v_team text; v_pos text; v_overall int;
  v_fora boolean; v_gk boolean; v_ordem int;
  v_lado text; v_n int; v_max int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.status, m.gk_mode, m.team_size into v_status, v_mode, v_size
  from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_status <> 'DRAFT' then raise exception 'JOGOFECHADO'; end if;

  if p_lineup is null or jsonb_typeof(p_lineup) <> 'array' or jsonb_array_length(p_lineup) = 0 then
    raise exception 'SEMESCALACAO';
  end if;

  -- As duas verificações da 0016, mantidas tal e qual: a base também as
  -- garante (índice único e chave primária), mas assim o erro chega ao
  -- admin em português em vez de subir como 23505.
  if exists (
    select 1 from jsonb_array_elements(p_lineup) as e(item)
    group by btrim(e.item->>'team'), btrim(e.item->>'assigned_position')
    having count(*) > 1
  ) then raise exception 'POSDUPLICADA'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_lineup) as e(item)
    group by btrim(e.item->>'player_id')
    having count(*) > 1
  ) then raise exception 'JOGADORDUP'; end if;

  delete from match_lineup where match_id = p_match;

  for r_row in select value from jsonb_array_elements(p_lineup) loop
    begin
      v_player := nullif(btrim(r_row.value->>'player_id'), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SEMJOGADOR';
    end;

    v_team := nullif(btrim(r_row.value->>'team'), '');
    v_pos  := nullif(btrim(r_row.value->>'assigned_position'), '');

    begin
      v_overall := nullif(btrim(r_row.value->>'overall_at_draw'), '')::int;
      v_ordem   := nullif(btrim(r_row.value->>'gk_order'), '')::int;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'STATS';
    end;

    begin
      v_fora := coalesce(nullif(btrim(r_row.value->>'was_out_of_position'), '')::boolean, false);
      v_gk   := coalesce(nullif(btrim(r_row.value->>'is_goalkeeper'), '')::boolean, false);
    exception when invalid_text_representation then
      raise exception 'INVALIDO';
    end;

    if v_player is null then raise exception 'SEMJOGADOR'; end if;
    if not exists (select 1 from players p where p.id = v_player) then
      raise exception 'SEMJOGADOR';
    end if;
    if v_team is null or v_team not in ('A','B') then raise exception 'INVALIDO'; end if;
    if v_pos is null or v_pos not in ('GK','DEF-L','DEF-R','MID-L','MID-C','MID-R','ST') then
      raise exception 'POSINVALIDA';
    end if;
    if v_mode = 'FIXED' and v_ordem is not null then raise exception 'ORDEMRODIZIO'; end if;
    if v_mode = 'ROTATING' and v_ordem is null then raise exception 'ORDEMRODIZIO'; end if;

    insert into match_lineup(match_id, player_id, team, assigned_position,
                             preferred_position, was_out_of_position,
                             overall_at_draw, is_goalkeeper, gk_order)
    values (p_match, v_player, v_team, v_pos,
            nullif(btrim(r_row.value->>'preferred_position'), ''),
            v_fora, v_overall, v_gk, v_ordem);
  end loop;

  -- A ordem tem de cobrir 1..N em cada equipa. Contar e comparar com o
  -- máximo apanha buracos ("1,2,4") que o índice único deixa passar.
  if v_mode = 'ROTATING' then
    foreach v_lado in array array['A','B'] loop
      select count(*), coalesce(max(l.gk_order), 0) into v_n, v_max
      from match_lineup l where l.match_id = p_match and l.team = v_lado;
      if v_n <> v_size or v_max <> v_size then raise exception 'ORDEMRODIZIO'; end if;
      if exists (select 1 from match_lineup l
                  where l.match_id = p_match and l.team = v_lado and l.gk_order is null) then
        raise exception 'ORDEMRODIZIO';
      end if;
    end loop;
  end if;

  update matches set
    team_a_overall = p_a_overall,
    team_b_overall = p_b_overall,
    balance_pct    = p_balance,
    draw_seed      = nullif(btrim(p_seed), '')
  where id = p_match;
end; $$;
create or replace function admin_save_schedule(
  p_pw text, p_id uuid, p_kickoff timestamptz, p_location text, p_map_url text,
  p_gk_mode text default null,
  p_team_size int default null,
  p_gk_rotation_minutes int default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_status text; v_mode text; v_size int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if p_kickoff is null then raise exception 'DATA'; end if;

  v_mode := coalesce(nullif(btrim(p_gk_mode), ''), 'FIXED');
  if v_mode not in ('FIXED','ROTATING') then raise exception 'FORMATOINVALIDO'; end if;
  v_size := coalesce(p_team_size, 7);
  if v_size < 5 or v_size > 8 then raise exception 'TAMANHOEQUIPA'; end if;

  if p_id is null then
    insert into matches(played_at, kickoff_at, location, map_url, status,
                        gk_mode, team_size, gk_rotation_minutes)
    values ((p_kickoff at time zone 'Europe/Lisbon')::date, p_kickoff,
            nullif(btrim(p_location), ''), nullif(btrim(p_map_url), ''), 'DRAFT',
            v_mode, v_size, p_gk_rotation_minutes)
    returning id into v_id;
    return v_id;
  end if;

  select m.status into v_status from matches m where m.id = p_id;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if v_status not in ('DRAFT','PUBLISHED') then raise exception 'JOGOFECHADO'; end if;

  -- O formato só se muda enquanto o sorteio não foi publicado: depois disso
  -- as equipas já estão no telemóvel de toda a gente.
  if v_status <> 'DRAFT'
     and exists (select 1 from matches m
                  where m.id = p_id
                    and (m.gk_mode <> v_mode or m.team_size <> v_size)) then
    raise exception 'JAPUBLICADO';
  end if;

  update matches set
    played_at  = (p_kickoff at time zone 'Europe/Lisbon')::date,
    kickoff_at = p_kickoff,
    location   = nullif(btrim(p_location), ''),
    map_url    = nullif(btrim(p_map_url), ''),
    gk_mode    = v_mode,
    team_size  = v_size,
    gk_rotation_minutes = p_gk_rotation_minutes
  where id = p_id;

  return p_id;
end; $$;
create or replace function admin_set_gk_rotation(p_pw text, p_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  if not exists (select 1 from players where id = p_id) then raise exception 'SEMJOGADOR'; end if;
  update players set gk_rotation_ok = coalesce(p_ok, true) where id = p_id;
end; $$;
-- Reparação manual, para o caso de uma escalação antiga ficar inconsistente.
-- Renumera 1..N por equipa e faz `is_goalkeeper` seguir a vez nº 1.
create or replace function corrigir_ordem_rodizio(p_match uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_mode text; v_lado text;
begin
  select m.gk_mode into v_mode from matches m where m.id = p_match;
  if v_mode is distinct from 'ROTATING' then return; end if;

  foreach v_lado in array array['A','B'] loop
    -- Os números têm de sair todos do caminho antes de voltarem a entrar:
    -- o índice único é verificado linha a linha, e renumerar por cima
    -- colidia a meio (dois jogadores com a vez 2 por um instante).
    update match_lineup set gk_order = null
     where match_id = p_match and team = v_lado;

    with ordenados as (
      select l.player_id,
             row_number() over (order by p.name) as nova
      from match_lineup l join players p on p.id = l.player_id
      where l.match_id = p_match and l.team = v_lado
    )
    update match_lineup l set gk_order = o.nova
    from ordenados o
    where l.match_id = p_match and l.team = v_lado and l.player_id = o.player_id;
  end loop;

  update match_lineup l
     set is_goalkeeper = (l.gk_order = 1)
   where l.match_id = p_match;
end; $$;
create function get_players()
returns table(
  id uuid, name text, dob date, photo_url text, avg numeric, votes bigint,
  player_type text, primary_position text, secondary_position text,
  accepts_other_positions boolean, position_status text,
  gk_rotation_ok boolean, gk_starts bigint, last_gk_start date)
language sql security definer set search_path = public, extensions as $$
  select p.id, p.name, p.dob, p.photo_url,
         round(avg(r.score)::numeric, 2) as avg,
         count(r.score) as votes,
         p.player_type, p.primary_position, p.secondary_position,
         p.accepts_other_positions, p.position_status,
         p.gk_rotation_ok,
         (select count(*) from match_lineup l
           join matches m on m.id = l.match_id
          where l.player_id = p.id and l.is_goalkeeper
            and m.status <> 'CANCELLED') as gk_starts,
         (select max(m.played_at) from match_lineup l
           join matches m on m.id = l.match_id
          where l.player_id = p.id and l.is_goalkeeper
            and m.status <> 'CANCELLED') as last_gk_start
  from players p
  left join ratings r on r.target_id = p.id
  where p.approved
  group by p.id
  order by avg desc nulls last, p.name;
$$;
-- ---------- 8. AS LEITURAS PASSAM A CONTAR O FORMATO ----------
-- match_public_json (0023) + formato, minutos de rodízio e gk_order em
-- cada linha da escalação. O resto é igual, chave a chave.
create or replace function match_public_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'id', m.id,
    'kickoff_at', m.kickoff_at,
    'played_at', m.played_at,
    'location', m.location,
    'map_url', m.map_url,
    'status', m.status,
    'published_at', m.published_at,
    'result_status', m.result_status,
    'result_published_at', m.result_published_at,
    'cancelled_at', m.cancelled_at,
    'cancel_reason', m.cancel_reason,
    'team_a_name', m.team_a_name,
    'team_b_name', m.team_b_name,
    'team_a_overall', m.team_a_overall,
    'team_b_overall', m.team_b_overall,
    'balance_pct', m.balance_pct,
    'score_a', m.score_a,
    'score_b', m.score_b,
    'notes', m.notes,
    'craque_override', m.craque_override,
    'bagre_override', m.bagre_override,
    'overall_version', m.overall_version,
    'gk_mode', m.gk_mode,
    'team_size', m.team_size,
    'gk_rotation_minutes', m.gk_rotation_minutes,
    'post_rating_status', m.post_rating_status,
    'post_rating_opened_at', m.post_rating_opened_at,
    'post_rating_closed_at', m.post_rating_closed_at,
    'post_rating_voters', (
      select count(distinct pr.rater_id)::int from post_match_ratings pr where pr.match_id = m.id),
    'post_rating_total', (
      select count(*)::int from post_match_ratings pr where pr.match_id = m.id),
    'lineup', (
      select coalesce(json_agg(json_build_object(
               'player_id', l.player_id, 'name', p.name, 'photo', p.photo_url,
               'team', l.team,
               'assigned_position', l.assigned_position,
               'preferred_position', l.preferred_position,
               'was_out_of_position', l.was_out_of_position,
               'overall_at_draw', l.overall_at_draw,
               'is_goalkeeper', l.is_goalkeeper,
               'gk_order', l.gk_order,
               'substitute_for', sub.out_name,
               'substitute_for_id', sub.out_id)
             order by l.team,
                      case l.assigned_position
                        when 'GK'    then 1
                        when 'DEF-L' then 2
                        when 'DEF-R' then 3
                        when 'MID-L' then 4
                        when 'MID-C' then 5
                        when 'MID-R' then 6
                        when 'ST'    then 7
                        else 8
                      end,
                      p.name), '[]'::json)
      from match_lineup l
      join players p on p.id = l.player_id
      left join lateral (
        select po.id as out_id, po.name as out_name
        from match_substitutions s
        join players po on po.id = s.out_player_id
        where s.match_id = m.id and s.in_player_id = l.player_id
        order by s.created_at desc
        limit 1
      ) sub on true
      where l.match_id = m.id),
    'substitutions', (
      select coalesce(json_agg(json_build_object(
               'id', s.id,
               'kind', s.kind,
               'out_player_id', s.out_player_id, 'out_name', po.name, 'out_photo', po.photo_url,
               'in_player_id', s.in_player_id, 'in_name', pi.name, 'in_photo', pi.photo_url,
               'team', s.team,
               'assigned_position', s.assigned_position,
               'is_goalkeeper', s.is_goalkeeper,
               'out_overall', s.out_overall,
               'in_overall', s.in_overall,
               'reason', s.reason,
               'created_at', s.created_at)
             order by s.created_at), '[]'::json)
      from match_substitutions s
      join players po on po.id = s.out_player_id
      join players pi on pi.id = s.in_player_id
      where s.match_id = m.id),
    'swaps', (
      select coalesce(json_agg(json_build_object(
               'id', x.id,
               'a_player_id', x.a_player_id, 'a_name', pa.name, 'a_photo', pa.photo_url,
               'b_player_id', x.b_player_id, 'b_name', pb.name, 'b_photo', pb.photo_url,
               'a_team', x.a_team, 'b_team', x.b_team,
               'a_position', x.a_position, 'b_position', x.b_position,
               'is_goalkeeper', x.is_goalkeeper,
               'a_overall', x.a_overall, 'b_overall', x.b_overall,
               'reason', x.reason,
               'created_at', x.created_at)
             order by x.created_at), '[]'::json)
      from match_swaps x
      join players pa on pa.id = x.a_player_id
      join players pb on pb.id = x.b_player_id
      where x.match_id = m.id),
    'media', (
      select coalesce(json_agg(json_build_object(
               'id', md.id, 'data_url', md.data_url, 'kind', md.kind,
               'is_primary', md.is_primary)
             order by md.is_primary desc, md.created_at), '[]'::json)
      from match_media md where md.match_id = m.id),
    'stats', (
      select coalesce(json_agg(json_build_object(
               'player_id', ms.player_id, 'name', p.name,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists)
             order by p.name), '[]'::json)
      from match_stats ms join players p on p.id = ms.player_id
      where ms.match_id = m.id),
    'gk_stats', (
      select coalesce(json_agg(json_build_object(
               'goalkeeper_id', g.goalkeeper_id, 'name', p.name,
               'team', g.team, 'saves', g.saves, 'goals_conceded', g.goals_conceded)
             order by p.name), '[]'::json)
      from goalkeeper_match_stats g join players p on p.id = g.goalkeeper_id
      where g.match_id = m.id)
  )
  from matches m where m.id = p_id;
$$;
-- ---------- 7. TROCAS E DESISTÊNCIAS NÃO PODEM PARTIR O RODÍZIO ----------
--
-- `admin_substitute_player` (0018/0021) faz UPDATE da linha: troca o
-- player_id e o `gk_order` fica onde estava — quem entra herda a vez de
-- quem saiu, que é exatamente o que se quer.
--
-- `admin_swap_players` e `admin_undo_swap` (0021), esses, APAGAM as duas
-- linhas e reinserem-nas com as colunas listadas à mão. Como não conhecem
-- esta coluna, o `gk_order` saía nulo e a ordem da equipa ficava com um
-- buraco — a timeline do rodízio perdia uma vez.
--
-- Em vez de reescrever essas duas funções inteiras (e passar a ter duas
-- cópias do mesmo corpo a divergir com o tempo), o preenchimento fica num
-- trigger: qualquer INSERT sem `gk_order` num jogo ROTATING recebe o
-- número livre mais baixo da sua equipa. Numa troca entre equipas, o
-- número livre de cada lado é precisamente o que o jogador que saiu
-- libertou — a ordem fica completa sem ninguém ter de a recalcular.
create or replace function preencher_gk_order()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_mode text; v_livre int;
begin
  if new.gk_order is not null then return new; end if;

  select m.gk_mode into v_mode from matches m where m.id = new.match_id;
  if v_mode is distinct from 'ROTATING' then return new; end if;

  select min(n) into v_livre
  from generate_series(1, 8) n
  where not exists (select 1 from match_lineup l
                     where l.match_id = new.match_id
                       and l.team = new.team
                       and l.gk_order = n);
  new.gk_order := v_livre;
  return new;
end; $$;
-- ---------- 10. O JOGADOR ESCOLHE SE VAI À BALIZA ----------
create or replace function set_my_gk_rotation(p_id uuid, p_pin text, p_ok boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare r players;
begin
  select * into r from players where id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  update players set gk_rotation_ok = coalesce(p_ok, true) where id = p_id;
end; $$;
-- ---------- 7. ENCERRAR O JOGO NUM PASSO SÓ ----------
-- Era isto: preencher o resultado → guardar rascunho → publicar → ir à
-- secção da avaliação → abrir. Cinco passos para uma decisão só ("o jogo
-- acabou"), e a votação de craque/bagre nem interruptor tinha.
--
-- Devolve já o que o admin precisa para partilhar: o prazo e a votação
-- abertos, para o ecrã montar a mensagem e o link sem outra chamada.
create or replace function admin_close_game(
  p_pw text, p_match uuid,
  p_score_a int, p_score_b int,
  p_stats jsonb, p_gk_stats jsonb,
  p_notes text, p_resenha text default null,
  p_deadline timestamptz default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_result text; v_versao int; v_kickoff timestamptz; v_prazo timestamptz;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.result_status, m.overall_version, m.kickoff_at
    into v_result, v_versao, v_kickoff
  from matches m where m.id = p_match;
  if v_result is null then raise exception 'INVALIDO'; end if;

  -- O resultado primeiro (valida placar, estatísticas e elegibilidade),
  -- a publicação a seguir. Se alguma falhar, a transação leva tudo atrás —
  -- é essa a diferença face a fazer os dois passos à mão.
  perform admin_save_result(p_pw, p_match, p_score_a, p_score_b,
                            p_stats, p_gk_stats, p_notes, null, null);

  if v_result <> 'PUBLISHED' then
    perform admin_publish_result(p_pw, p_match, p_resenha);
  end if;

  -- Jogos da versão 1 não abrem votação nenhuma (a 0023 garante que o
  -- passado não se reavalia) — o jogo fecha na mesma, só sem cédula.
  if v_versao = 2 then
    v_prazo := coalesce(p_deadline, prazo_de_votacao(v_kickoff));
    update matches set
      voting_status    = 'OPEN',
      voting_deadline  = v_prazo,
      voting_closed_at = null,
      craque_final     = null,
      bagre_final      = null
    where id = p_match;
    perform registar_atividade(p_match, 'VOTACAO_ABERTA',
      jsonb_build_object('prazo', v_prazo, 'via', 'encerrar_jogo'));
  end if;

  return match_admin_json(p_match);
end; $$;
-- O admin confirma o resultado final da votação. `p_craque`/`p_bagre`
-- nulos = aceitar quem a votação elegeu.
create or replace function admin_finalize_voting(
  p_pw text, p_match uuid, p_craque uuid default null, p_bagre uuid default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.voting_status into v_status from matches m where m.id = p_match;
  if v_status is null then raise exception 'INVALIDO'; end if;
  if p_craque is not null and p_craque = p_bagre then raise exception 'IGUAL'; end if;

  -- A escolha do admin obedece à MESMA régua da votação: não se corrige à
  -- mão o que a votação proíbe (craque tem de estar entre os vencedores).
  if p_craque is not null
     and not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = p_craque) then
    raise exception 'CRAQUEPERDEDOR';
  end if;
  if p_bagre is not null
     and not exists (select 1 from elegiveis_premio(p_match, 'BAGRE') e where e.player_id = p_bagre) then
    raise exception 'BAGREVENCEDOR';
  end if;

  if p_craque is not null or p_bagre is not null then
    update matches set
      craque_override = coalesce(p_craque, craque_override),
      bagre_override  = coalesce(p_bagre,  bagre_override)
    where id = p_match;
  end if;

  -- `forcar` porque é exatamente isso que o admin está a fazer: fechar
  -- apesar de faltar quórum ou de haver empate.
  perform fechar_votacao(p_match, true);
  return match_admin_json(p_match);
end; $$;
-- Um jogo COMPLETED com o resultado publicado saía da agenda do admin —
-- e é precisamente esse que tem a votação a decorrer. Sem isto, o painel
-- de votação existia e o admin não tinha por onde lá chegar.
create or replace function admin_matches_upcoming(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  perform fechar_votacoes_expiradas();
  return (
    select coalesce(json_agg(match_admin_json(t.id) order by t.quando desc, t.created_at desc), '[]'::json)
    from (
      select m.id,
             coalesce(m.kickoff_at, m.played_at::timestamp at time zone 'Europe/Lisbon') as quando,
             m.created_at
      from matches m
      where m.status in ('DRAFT','PUBLISHED','IN_PROGRESS')
         or (m.status = 'COMPLETED' and m.result_status <> 'PUBLISHED')
         or (m.status = 'CANCELLED' and m.cancelled_at > now() - interval '30 days')
         or m.voting_status in ('OPEN','REVIEW')
    ) t
  );
end; $$;
create or replace function admin_revoke_devices(p_pw text, p_id uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_n int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update player_devices set revoked_at = now() where player_id = p_id and revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
-- ---------- 8. O ADMIN MEXE NO PRAZO E NO ESTADO ----------
create or replace function admin_set_voting(
  p_pw text, p_match uuid, p_status text default null,
  p_deadline timestamptz default null, p_quorum int default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_versao int; v_result text; v_status text;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select m.overall_version, m.result_status, m.status
    into v_versao, v_result, v_status
  from matches m where m.id = p_match;
  if v_versao is null then raise exception 'INVALIDO'; end if;
  if v_status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if v_result <> 'PUBLISHED' then raise exception 'SEMRESULTADO'; end if;
  -- Sem guarda de versão: reabrir uma rodada antiga é legítimo (só o
  -- craque/bagre é que volta a aceitar votos — as estrelas continuam
  -- fechadas ao passado por `submit_round_vote`).

  if p_status is not null and p_status not in ('OPEN','REVIEW','CLOSED') then
    raise exception 'INVALIDO';
  end if;

  update matches set
    voting_quorum_pct = coalesce(p_quorum, voting_quorum_pct),
    voting_deadline   = coalesce(p_deadline, voting_deadline),
    voting_status     = coalesce(p_status, voting_status),
    -- reabrir limpa o fecho: senão o jogo dizia "fechada a 12/08" com a
    -- votação a aceitar votos
    voting_closed_at  = case when coalesce(p_status, voting_status) = 'OPEN' then null else voting_closed_at end
  where id = p_match;

  if p_status = 'OPEN' then
    perform registar_atividade(p_match, 'VOTACAO_ABERTA', jsonb_build_object('via', 'admin'));
  elsif p_status is not null then
    perform registar_atividade(p_match, 'VOTACAO_FECHADA', jsonb_build_object('via', 'admin'));
  end if;

  return match_admin_json(p_match);
end; $$;
-- ---------- 9. REVISÃO DO ADMIN ----------
-- Tudo o que ele precisa para desempatar: contagens, participação e quem
-- ainda não votou.
--
-- ANONIMATO: as estrelas saem SÓ como média por jogador — nem aqui se vê
-- quem deu que nota, porque foi isso que se prometeu a quem vota
-- (src/components/PostMatchRating.jsx). O craque/bagre, esse, tem o
-- votante identificado desde a 0002 e continua a tê-lo: são regras
-- diferentes e o ecrã do admin diz qual é qual.
create or replace function admin_voting_review(p_pw text, p_match uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_json json;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;

  select json_build_object(
    'match_id', m.id,
    'voting_status', m.voting_status,
    'voting_deadline', m.voting_deadline,
    'quorum_pct', m.voting_quorum_pct,
    'participacao', (select row_to_json(p) from participacao_da_votacao(p_match) p),
    'craque', (
      select coalesce(json_agg(json_build_object(
               'player_id', t.pid, 'name', pl.name, 'photo', pl.photo_url, 'votes', t.n)
             order by t.n desc, pl.name), '[]'::json)
      from (select av.craque_id as pid, count(*)::int as n
              from award_votes av where av.match_id = p_match group by av.craque_id) t
      join players pl on pl.id = t.pid),
    'bagre', (
      select coalesce(json_agg(json_build_object(
               'player_id', t.pid, 'name', pl.name, 'photo', pl.photo_url, 'votes', t.n)
             order by t.n desc, pl.name), '[]'::json)
      from (select av.bagre_id as pid, count(*)::int as n
              from award_votes av where av.match_id = p_match group by av.bagre_id) t
      join players pl on pl.id = t.pid),
    -- só médias: quem deu que estrela não sai daqui, nem para o admin
    'estrelas', (
      select coalesce(json_agg(json_build_object(
               'player_id', t.pid, 'name', pl.name, 'photo', pl.photo_url,
               'avg', t.media, 'votes', t.n)
             order by t.media desc, pl.name), '[]'::json)
      from (select pr.target_id as pid, round(avg(pr.stars)::numeric, 2) as media, count(*)::int as n
              from post_match_ratings pr where pr.match_id = p_match group by pr.target_id) t
      join players pl on pl.id = t.pid),
    'faltam', (
      select coalesce(json_agg(json_build_object(
               'player_id', pl.id, 'name', pl.name, 'photo', pl.photo_url)
             order by pl.name), '[]'::json)
      from (select distinct pj.player_id from participantes_do_jogo pj where pj.match_id = p_match) j
      join players pl on pl.id = j.player_id
      where not exists (select 1 from award_votes av
                         where av.match_id = p_match and av.voter_id = j.player_id)
        and not exists (select 1 from post_match_ratings pr
                         where pr.match_id = p_match and pr.rater_id = j.player_id))
  ) into v_json
  from matches m where m.id = p_match;

  if v_json is null then raise exception 'INVALIDO'; end if;
  return v_json;
end; $$;
-- ---------- 10. A CÉDULA, NUMA CHAMADA ----------
-- Tudo o que o ecrã de votação precisa. `p_pin` OU `p_token` — o token
-- vem do "lembrar-me neste telemóvel" e evita pedir o PIN outra vez.
create or replace function autenticar_votante(p_voter uuid, p_pin text, p_token uuid)
returns uuid language plpgsql stable security definer set search_path = public, extensions as $$
declare r players; v_id uuid;
begin
  if p_token is not null then
    select d.player_id into v_id
    from player_devices d
    where d.token = p_token and d.revoked_at is null and d.expires_at > now();
    if v_id is null then raise exception 'TOKENINVALIDO'; end if;
    -- o token identifica quem é; um p_voter diferente é um pedido mal
    -- formado, não uma sessão válida
    if p_voter is not null and p_voter <> v_id then raise exception 'TOKENINVALIDO'; end if;
  else
    select * into r from players where id = p_voter;
    if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then
      raise exception 'CRED';
    end if;
    if not r.approved then raise exception 'PENDENTE'; end if;
    v_id := r.id;
  end if;
  return v_id;
end; $$;
-- ---------- 6. FECHAR O QUE O PRAZO EXPIROU ----------
-- Idempotente e barata: sem votações expiradas não escreve nada.
--
-- CLOSED quando há quórum e um único líder de cada lado. Caso contrário
-- REVIEW — e aí é o admin que decide, com todos os números à frente.
create or replace function fechar_votacao(p_match uuid, p_forcar boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_quorum int; v_pct int; v_votantes int; v_total int;
  v_craque uuid; v_bagre uuid;
  v_craque_emp int; v_bagre_emp int;
  v_over_craque uuid; v_over_bagre uuid;
  v_estado text;
begin
  select m.voting_quorum_pct, m.craque_override, m.bagre_override
    into v_quorum, v_over_craque, v_over_bagre
  from matches m where m.id = p_match;
  if v_quorum is null then return null; end if;

  select p.votantes, p.total, p.pct into v_votantes, v_total, v_pct
  from participacao_da_votacao(p_match) p;

  select l.player_id, l.empatados into v_craque, v_craque_emp
  from lider_do_premio(p_match, 'CRAQUE') l limit 1;
  select l.player_id, l.empatados into v_bagre, v_bagre_emp
  from lider_do_premio(p_match, 'BAGRE') l limit 1;

  -- O override do admin manda: quando existe, não há empate que resolver.
  if v_over_craque is not null then v_craque := v_over_craque; v_craque_emp := 1; end if;
  if v_over_bagre  is not null then v_bagre  := v_over_bagre;  v_bagre_emp  := 1; end if;

  v_estado := case
    when p_forcar then 'CLOSED'
    when v_total = 0 then 'REVIEW'
    when coalesce(v_pct, 0) < v_quorum then 'REVIEW'
    when v_craque is null or v_bagre is null then 'REVIEW'
    when coalesce(v_craque_emp, 0) > 1 or coalesce(v_bagre_emp, 0) > 1 then 'REVIEW'
    else 'CLOSED'
  end;

  update matches set
    voting_status    = v_estado,
    voting_closed_at = case when v_estado = 'CLOSED' then now() else voting_closed_at end,
    craque_final     = case when v_estado = 'CLOSED' then v_craque else craque_final end,
    bagre_final      = case when v_estado = 'CLOSED' then v_bagre  else bagre_final  end
  where id = p_match;

  perform registar_atividade(p_match,
    case when v_estado = 'CLOSED' then 'VOTACAO_FECHADA' else 'VOTACAO_EM_REVISAO' end,
    jsonb_build_object('votantes', v_votantes, 'total', v_total, 'pct', v_pct,
                       'quorum', v_quorum));

  return v_estado;
end; $$;
create or replace function fechar_votacoes_expiradas()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare r record; v_n int := 0;
begin
  for r in
    select m.id from matches m
    where m.voting_status = 'OPEN'
      and m.voting_deadline is not null
      and m.voting_deadline <= now()
  loop
    perform fechar_votacao(r.id, false);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;
-- ---------- 14. O FECHO PREGUIÇOSO ENTRA NAS LEITURAS ----------
-- `get_matches` e `get_next_match` são chamadas em cada visita: é aí que o
-- estado converge, sem pg_cron e sem infraestrutura nova.
create or replace function get_matches()
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  perform fechar_votacoes_expiradas();
  return (
    select coalesce(json_agg(match_json(m.id, false) order by m.played_at desc, m.created_at desc), '[]'::json)
    from matches_validas m
  );
end; $$;
-- ---------- 12. O QUE ESTÁ ABERTO PARA MIM ----------
-- Alimenta a faixa de lembrete: as rodadas em que joguei, com votação
-- aberta, e o que me falta em cada uma.
create or replace function get_my_open_votes(p_voter uuid, p_pin text, p_token uuid default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform fechar_votacoes_expiradas();
  v_id := autenticar_votante(p_voter, p_pin, p_token);

  return (
    select coalesce(json_agg(json_build_object(
             'match_id', x.id,
             'played_at', x.played_at,
             'team_a_name', x.team_a_name, 'team_b_name', x.team_b_name,
             'score_a', x.score_a, 'score_b', x.score_b,
             'deadline', x.voting_deadline,
             'falta_premio', not exists (select 1 from award_votes av
                                          where av.match_id = x.id and av.voter_id = v_id),
             'falta_estrelas', (
               select count(*) from participantes_do_jogo pj
               where pj.match_id = x.id and pj.team = x.equipa and pj.player_id <> v_id
                 and not exists (select 1 from post_match_ratings pr
                                  where pr.match_id = x.id and pr.rater_id = v_id
                                    and pr.target_id = pj.player_id)))
           order by x.voting_deadline), '[]'::json)
    from (
      select m.id, m.played_at, m.team_a_name, m.team_b_name, m.score_a, m.score_b,
             m.voting_deadline,
             (select pj.team from participantes_do_jogo pj
               where pj.match_id = m.id and pj.player_id = v_id) as equipa
      from matches m
      where m.voting_status = 'OPEN'
        and m.overall_version = 2
        and exists (select 1 from participantes_do_jogo pj
                     where pj.match_id = m.id and pj.player_id = v_id)
    ) x
  );
end; $$;
create or replace function get_round_ballot(
  p_voter uuid, p_pin text, p_match uuid, p_token uuid default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; m matches%rowtype; v_equipa text; v_json json;
begin
  perform fechar_votacoes_expiradas();
  v_id := autenticar_votante(p_voter, p_pin, p_token);

  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'INVALIDO'; end if;
  if m.status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if m.result_status <> 'PUBLISHED' then raise exception 'SEMRESULTADO'; end if;

  select j.team into v_equipa from jogadores_do_jogo(p_match) j where j.player_id = v_id;

  select json_build_object(
    'match_id', m.id,
    'played_at', m.played_at,
    'kickoff_at', m.kickoff_at,
    'team_a_name', m.team_a_name,
    'team_b_name', m.team_b_name,
    'score_a', m.score_a,
    'score_b', m.score_b,
    'voting_status', m.voting_status,
    'voting_deadline', m.voting_deadline,
    'overall_version', m.overall_version,
    'me', json_build_object('player_id', v_id, 'team', v_equipa,
                            'jogou', v_equipa is not null
                                     or exists (select 1 from jogadores_do_jogo(p_match) j
                                                 where j.player_id = v_id)),
    -- companheiros de equipa, com a nota que já lhes dei
    'teammates', case when v_equipa is null then '[]'::json else (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url,
               'stars', (select pr.stars from post_match_ratings pr
                          where pr.match_id = m.id and pr.rater_id = v_id and pr.target_id = p.id))
             order by p.name), '[]'::json)
      from participantes_do_jogo pj
      join players p on p.id = pj.player_id
      where pj.match_id = m.id and pj.team = v_equipa and pj.player_id <> v_id) end,
    'craque_candidates', (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url) order by p.name), '[]'::json)
      from elegiveis_premio(m.id, 'CRAQUE') e
      join players p on p.id = e.player_id
      where e.player_id <> v_id),
    'bagre_candidates', (
      select coalesce(json_agg(json_build_object(
               'player_id', p.id, 'name', p.name, 'photo', p.photo_url) order by p.name), '[]'::json)
      from elegiveis_premio(m.id, 'BAGRE') e
      join players p on p.id = e.player_id
      where e.player_id <> v_id),
    'already_voted_award', exists (select 1 from award_votes av
                                    where av.match_id = m.id and av.voter_id = v_id),
    'participacao', (select row_to_json(pp) from participacao_da_votacao(m.id) pp)
  ) into v_json;

  return v_json;
end; $$;
create or replace function issue_device_token(p_id uuid, p_pin text, p_label text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_token uuid;
begin
  select * into r from players where id = p_id;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  -- Um telemóvel, um token: sem isto, cada entrada deixava um token vivo
  -- para trás e "sair deste telemóvel" não chegava para fechar a porta.
  delete from player_devices d
   where d.player_id = p_id and d.label is not distinct from nullif(btrim(p_label), '');

  insert into player_devices(player_id, label)
  values (p_id, nullif(btrim(p_label), ''))
  returning token into v_token;
  return v_token;
end; $$;
-- Quem lidera o craque (ou o bagre) e se há empate no topo.
-- `p_tipo` é 'CRAQUE' ou 'BAGRE'.
create or replace function lider_do_premio(p_match uuid, p_tipo text)
returns table(player_id uuid, votos int, empatados int)
language sql stable security definer set search_path = public, extensions as $$
  with contagem as (
    select case when p_tipo = 'CRAQUE' then av.craque_id else av.bagre_id end as pid,
           count(*)::int as n
    from award_votes av
    where av.match_id = p_match
    group by 1
  ), topo as (
    select max(n) as n from contagem
  )
  select c.pid, c.n, (select count(*)::int from contagem c2 where c2.n = (select n from topo))
  from contagem c
  where c.n = (select n from topo);
$$;
create or replace function login_with_device(p_token uuid)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; v_id uuid; v_pending int;
begin
  select d.player_id into v_id
  from player_devices d
  where d.token = p_token and d.revoked_at is null and d.expires_at > now();
  if v_id is null then raise exception 'TOKENINVALIDO'; end if;

  select * into r from players where id = v_id;
  if r.id is null or not r.approved then raise exception 'TOKENINVALIDO'; end if;

  update player_devices set last_seen_at = now() where token = p_token;

  select count(*) into v_pending
    from players p
    where p.approved and p.id <> r.id
      and not exists (select 1 from ratings rt where rt.rater_id = r.id and rt.target_id = p.id);

  -- `is_admin` fica de FORA de propósito: a área de admin tem senha
  -- própria e não é isto que a abre.
  return json_build_object(
    'id', r.id, 'name', r.name, 'user_id', r.user_id,
    'is_admin', false, 'voted', v_pending = 0,
    'player_type', r.player_type,
    'primary_position', r.primary_position,
    'secondary_position', r.secondary_position,
    'accepts_other_positions', r.accepts_other_positions,
    'position_status', r.position_status,
    'position_notice', null,
    'device', true
  );
end; $$;
-- ---------- 14a. O JSON DO JOGO PARA O ADMIN ----------
-- `match_public_json` já tem 200 linhas e foi recopiado de migração em
-- migração (0016 → 0020 → 0023 → 0024). Uma quarta cópia só para lhe
-- juntar seis chaves era a garantia de as versões divergirem.
--
-- Em vez disso, um envelope: o mesmo JSON de sempre MAIS o estado da
-- votação. Quem lê é o painel do admin — os ecrãs públicos continuam a
-- chamar `match_public_json` e não passam a ver contagens de votos.
create or replace function match_admin_json(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select (
    match_public_json(p_id)::jsonb || jsonb_build_object(
      'voting_status',     m.voting_status,
      'voting_deadline',   m.voting_deadline,
      'voting_closed_at',  m.voting_closed_at,
      'voting_quorum_pct', m.voting_quorum_pct,
      'craque_final',      m.craque_final,
      'bagre_final',       m.bagre_final,
      'voting_voters',     (select p.votantes from participacao_da_votacao(p_id) p),
      'voting_total',      (select p.total    from participacao_da_votacao(p_id) p),
      'voting_pct',        (select p.pct      from participacao_da_votacao(p_id) p)
    )
  )::json
  from matches m where m.id = p_id;
$$;
-- ---------- 5. QUEM VOTOU, QUANTOS SÃO, HÁ QUÓRUM? ----------
-- Um jogador conta como "votou" se entregou QUALQUER das duas coisas:
-- o voto de craque/bagre ou pelo menos uma estrela. É a definição que a
-- barra de progresso do admin mostra e a que o quórum usa.
create or replace function participacao_da_votacao(p_match uuid)
returns table(votantes int, total int, pct int)
language sql stable security definer set search_path = public, extensions as $$
  with jogadores as (
    select distinct pj.player_id from participantes_do_jogo pj where pj.match_id = p_match
  ), votaram as (
    select av.voter_id as player_id from award_votes av where av.match_id = p_match
    union
    select pr.rater_id from post_match_ratings pr where pr.match_id = p_match
  )
  select
    (select count(*) from votaram v where v.player_id in (select player_id from jogadores))::int,
    (select count(*) from jogadores)::int,
    case when (select count(*) from jogadores) = 0 then 0
         else round(100.0
                    * (select count(*) from votaram v
                        where v.player_id in (select player_id from jogadores))
                    / (select count(*) from jogadores))::int
    end;
$$;
-- ---------- 4. O PRAZO POR OMISSÃO ----------
-- "Jogo à sexta ⇒ votação até terça às 23:59" não pode ser lido à letra:
-- há jogos a meio da semana. A regra que generaliza é `kickoff + 4 dias,
-- às 23:59 desse dia` — dá terça para os jogos de sexta e faz sentido
-- para todos os outros.
--
-- Tudo em Europe/Lisbon: um jogador em viagem tem de ver o mesmo INSTANTE,
-- não a mesma hora local. Por isso a conta é feita no fuso da pelada e o
-- resultado guardado como timestamptz.
-- `stable` e não `immutable`: o coalesce cai em now() quando não há
-- kickoff, e o Postgres pode pré-calcular uma immutable no plano.
create or replace function prazo_de_votacao(p_kickoff timestamptz, p_dias int default 4)
returns timestamptz
language sql stable set search_path = public, extensions as $$
  select ((((coalesce(p_kickoff, now()) at time zone 'Europe/Lisbon')::date
            + coalesce(p_dias, 4)) + time '23:59')
          at time zone 'Europe/Lisbon');
$$;
create or replace function revoke_device(p_token uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  -- Não pede PIN: quem tem o token é quem está a sair do próprio telemóvel,
  -- e obrigar ao PIN para SAIR é a forma mais rápida de ninguém sair.
  update player_devices set revoked_at = now() where token = p_token and revoked_at is null;
end; $$;
-- ---------- 3. post_rating_status SEGUE voting_status ----------
-- Uma versão de convivência: tudo o que já lê `post_rating_status`
-- continua certo sem saber que existe um eixo novo.
create or replace function sincronizar_post_rating_status()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.voting_status is distinct from old.voting_status then
    new.post_rating_status := case when new.voting_status = 'OPEN' then 'OPEN' else 'CLOSED' end;
    if new.voting_status = 'OPEN' then
      new.post_rating_opened_at := coalesce(new.post_rating_opened_at, now());
      new.post_rating_closed_at := null;
    else
      new.post_rating_closed_at := coalesce(new.post_rating_closed_at, now());
    end if;
  end if;
  return new;
end; $$;
-- ---------- 11. UM ENVIO SÓ ----------
-- Estrelas + craque + bagre na mesma transação. Tudo é opcional: dar só
-- estrelas, só o craque/bagre, ou tudo. Quem sai a meio não perde o que
-- já fez, e quem já votou no prémio pode voltar para acabar as estrelas.
create or replace function submit_round_vote(
  p_voter uuid, p_pin text, p_match uuid,
  p_craque uuid default null, p_bagre uuid default null,
  p_ratings jsonb default null, p_token uuid default null
) returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid; m matches%rowtype;
  v_equipa text; r_row record; v_alvo uuid; v_estrelas int;
  v_notas int := 0; v_premio boolean := false;
begin
  perform fechar_votacoes_expiradas();
  v_id := autenticar_votante(p_voter, p_pin, p_token);

  select * into m from matches where id = p_match;
  if m.id is null then raise exception 'INVALIDO'; end if;
  if m.status = 'CANCELLED' then raise exception 'JOGOCANCELADO'; end if;
  if m.result_status <> 'PUBLISHED' then raise exception 'SEMRESULTADO'; end if;
  -- a versão só é exigida no ramo das ESTRELAS, lá em baixo: o craque e o
  -- bagre existem desde a 0002 e uma rodada antiga reaberta pelo admin
  -- continua a poder ser votada
  if m.voting_status = 'REVIEW' then raise exception 'VOTACAOREVISAO'; end if;
  if m.voting_status <> 'OPEN' then raise exception 'PRAZOVOTACAO'; end if;
  -- o relógio que manda é o do servidor; o contador do ecrã é decoração
  if m.voting_deadline is not null and now() > m.voting_deadline then
    raise exception 'PRAZOVOTACAO';
  end if;

  select j.team into v_equipa from jogadores_do_jogo(p_match) j where j.player_id = v_id;
  if not found then raise exception 'NAOJOGOU'; end if;

  -- ---- craque e bagre ----
  if p_craque is not null or p_bagre is not null then
    if p_craque is null or p_bagre is null then raise exception 'INVALIDO'; end if;
    if p_craque = v_id or p_bagre = v_id then raise exception 'PROPRIO'; end if;
    if p_craque = p_bagre then raise exception 'IGUAL'; end if;
    if not exists (select 1 from elegiveis_premio(p_match, 'CRAQUE') e where e.player_id = p_craque) then
      raise exception 'CRAQUEPERDEDOR';
    end if;
    if not exists (select 1 from elegiveis_premio(p_match, 'BAGRE') e where e.player_id = p_bagre) then
      raise exception 'BAGREVENCEDOR';
    end if;
    if exists (select 1 from award_votes where match_id = p_match and voter_id = v_id) then
      raise exception 'VOTOFEITO';
    end if;
    insert into award_votes(match_id, voter_id, craque_id, bagre_id)
    values (p_match, v_id, p_craque, p_bagre);
    v_premio := true;
  end if;

  -- ---- estrelas ----
  if p_ratings is not null and jsonb_typeof(p_ratings) = 'array' and jsonb_array_length(p_ratings) > 0 then
    -- a avaliação pós-jogo só existe na versão 2 (0023): o passado não se
    -- reavalia, nem por esta porta
    if m.overall_version <> 2 then raise exception 'VERSAOANTIGA'; end if;
    if v_equipa is null then raise exception 'SEMEQUIPAS'; end if;
    for r_row in select value from jsonb_array_elements(p_ratings) loop
      v_alvo := (r_row.value->>'player_id')::uuid;
      -- só inteiros: "3.5" rebentava no cast com um erro cru do Postgres,
      -- que a app mostrava como "erro de ligação"
      if (r_row.value->>'stars') is null or (r_row.value->>'stars') !~ '^\d+$' then
        raise exception 'ESTRELAS';
      end if;
      v_estrelas := (r_row.value->>'stars')::int;
      if v_estrelas < 0 or v_estrelas > 5 then raise exception 'ESTRELAS'; end if;
      if v_alvo is null or v_alvo = v_id then raise exception 'PROPRIO'; end if;
      if not exists (select 1 from jogadores_do_jogo(p_match) j
                      where j.player_id = v_alvo and j.team = v_equipa) then
        raise exception 'SEMCOMPANHEIRO';
      end if;

      insert into post_match_ratings(match_id, rater_id, target_id, stars)
      values (p_match, v_id, v_alvo, v_estrelas)
      on conflict (match_id, rater_id, target_id)
      do update set stars = excluded.stars, updated_at = now();
      v_notas := v_notas + 1;
    end loop;
  end if;

  return json_build_object(
    'match_id', p_match, 'premio', v_premio, 'avaliados', v_notas,
    'participacao', (select row_to_json(pp) from participacao_da_votacao(p_match) pp));
end; $$;
-- ---------- 4. O PERFIL TAMBÉM ----------
-- O painel "Como se calcula o overall?" vive no perfil e chama
-- `calcularOverall` com o que esta função devolver. Sem o saldo aqui, a
-- parcela aparecia na Home e desaparecia no perfil — o mesmo jogador com
-- dois overalls diferentes, que é exatamente o que a 0017 evitou.
create or replace function get_player_profile(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  with craque_top as (
    select av.match_id, coalesce(mv.craque_override, av.craque_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join matches_validas mv on mv.id = av.match_id
    group by av.match_id, coalesce(mv.craque_override, av.craque_id)
  ),
  bagre_top as (
    select av.match_id, coalesce(mv.bagre_override, av.bagre_id) as pid, count(*) as n,
           max(count(*)) over (partition by av.match_id) as top
    from award_votes av join matches_validas mv on mv.id = av.match_id
    group by av.match_id, coalesce(mv.bagre_override, av.bagre_id)
  )
  select json_build_object(
    'id', p.id, 'name', p.name, 'user_id', p.user_id, 'photo', p.photo_url,
    'avg',     (select round(avg(r.score)::numeric, 2) from ratings r where r.target_id = p.id),
    'votes',   (select count(*) from ratings r where r.target_id = p.id),
    'matches', (select count(*) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'goals',   (select coalesce(sum(ms.goals), 0) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'assists', (select coalesce(sum(ms.assists), 0) from match_stats ms
                 where ms.player_id = p.id
                   and ms.match_id in (select id from matches_validas)),
    'craques', (select count(*) from craque_top ct where ct.pid = p.id and ct.n = ct.top)
             + (select count(*) from matches_validas mv
                 where mv.craque_override = p.id
                   and not exists (select 1 from award_votes av where av.match_id = mv.id)),
    'bagres',  (select count(*) from bagre_top  bt where bt.pid = p.id and bt.n = bt.top)
             + (select count(*) from matches_validas mv
                 where mv.bagre_override = p.id
                   and not exists (select 1 from award_votes av where av.match_id = mv.id)),
    'post_rating_avg',   (select round(avg(pr.stars)::numeric, 2) from post_ratings_validas pr
                           where pr.target_id = p.id),
    'post_rating_count', (select count(*)::int from post_ratings_validas pr
                           where pr.target_id = p.id),
    'wae_saldo',   (select se.saldo from saldo_esperado_por_jogador se where se.player_id = p.id),
    'wae_matches', (select coalesce(se.jogos, 0) from saldo_esperado_por_jogador se
                     where se.player_id = p.id),
    'history', (
      select coalesce(json_agg(json_build_object(
               'match_id', m.id, 'played_at', m.played_at,
               'team', ms.team, 'goals', ms.goals, 'assists', ms.assists,
               'score_a', m.score_a, 'score_b', m.score_b,
               'team_a_name', m.team_a_name, 'team_b_name', m.team_b_name,
               'post_rating_avg', (select round(avg(pr.stars)::numeric, 2)
                                     from post_ratings_validas pr
                                    where pr.match_id = m.id and pr.target_id = p.id),
               -- quanto é que ESTA rodada valeu acima do esperado
               'wae_saldo', (select case when ms.team = 'A' then re.real_a - re.esperado_a
                                         else (1.0 - re.real_a) - (1.0 - re.esperado_a) end
                               from resultados_esperados re where re.match_id = m.id),
               'craque', exists (select 1 from craque_top c2
                                  where c2.match_id = m.id and c2.pid = p.id and c2.n = c2.top),
               'bagre',  exists (select 1 from bagre_top b2
                                  where b2.match_id = m.id and b2.pid = p.id and b2.n = b2.top))
             order by m.played_at desc, m.created_at desc), '[]'::json)
      from match_stats ms join matches_validas m on m.id = ms.match_id
      where ms.player_id = p.id
    )
  )
  from players p where p.id = p_id;
$$;
-- ---------- 3. AS ESTATÍSTICAS PASSAM A TRAZER O SALDO ----------
--
-- Saem os números CRUS (saldo e jogos), não a nota já calculada. É a
-- mesma regra dos goleiros (0017): o overall vive todo em
-- `src/lib/overall.js`, num sítio só. Duas fórmulas em dois sítios é a
-- forma mais rápida de os números divergirem entre a Home e o perfil.
create or replace function get_player_stats()
returns json language sql security definer set search_path = public, extensions as $$
  with validas as (select id from matches_validas),
  legado as (
    select mv.id as match_id, mv.craque_override, mv.bagre_override
    from matches_validas mv
    where mv.voting_status <> 'CLOSED' or (mv.craque_final is null and mv.bagre_final is null)
  ),
  craque_t as (
    select av.match_id, coalesce(l.craque_override, av.craque_id) as player_id, count(*) as n
    from award_votes av join legado l on l.match_id = av.match_id
    group by av.match_id, coalesce(l.craque_override, av.craque_id)
  ), craque_w as (
    select player_id, count(distinct match_id) as wins from (
      select t.match_id, t.player_id from craque_t t
      where t.n = (select max(n) from craque_t t2 where t2.match_id = t.match_id)
      union
      select l.match_id, l.craque_override from legado l
      where l.craque_override is not null
        and not exists (select 1 from award_votes av where av.match_id = l.match_id)
      union
      select pr.match_id, pr.craque_final from premios_da_rodada pr where pr.craque_final is not null
    ) w group by player_id
  ), bagre_t as (
    select av.match_id, coalesce(l.bagre_override, av.bagre_id) as player_id, count(*) as n
    from award_votes av join legado l on l.match_id = av.match_id
    group by av.match_id, coalesce(l.bagre_override, av.bagre_id)
  ), bagre_w as (
    select player_id, count(distinct match_id) as wins from (
      select t.match_id, t.player_id from bagre_t t
      where t.n = (select max(n) from bagre_t t2 where t2.match_id = t.match_id)
      union
      select l.match_id, l.bagre_override from legado l
      where l.bagre_override is not null
        and not exists (select 1 from award_votes av where av.match_id = l.match_id)
      union
      select pr.match_id, pr.bagre_final from premios_da_rodada pr where pr.bagre_final is not null
    ) w group by player_id
  ), totals as (
    select ms.player_id, count(*) as matches, sum(ms.goals) as goals, sum(ms.assists) as assists
    from match_stats ms
    where ms.match_id in (select id from validas)
    group by ms.player_id
  ), pos as (
    select pr.target_id as player_id,
           round(avg(pr.stars)::numeric, 2) as media,
           count(*)::int                    as n
    from post_ratings_validas pr
    group by pr.target_id
  )
  select coalesce(json_agg(json_build_object(
           'id', p.id, 'name', p.name, 'photo', p.photo_url,
           'matches', coalesce(t.matches, 0),
           'goals',   coalesce(t.goals, 0),
           'assists', coalesce(t.assists, 0),
           'craques', coalesce(cw.wins, 0),
           'bagres',  coalesce(bw.wins, 0),
           'post_rating_avg',   ps.media,
           'post_rating_count', coalesce(ps.n, 0),
           -- null (e não 0) quando não há rodadas com forças gravadas: é o
           -- que diz ao overall para deixar a parcela de fora em vez de a
           -- contar como "exatamente o esperado"
           'wae_saldo',   se.saldo,
           'wae_matches', coalesce(se.jogos, 0))
         order by coalesce(t.goals, 0) desc, coalesce(t.assists, 0) desc, p.name), '[]'::json)
  from players p
  left join totals t    on t.player_id  = p.id
  left join craque_w cw on cw.player_id = p.id
  left join bagre_w bw  on bw.player_id = p.id
  left join pos ps      on ps.player_id = p.id
  left join saldo_esperado_por_jogador se on se.player_id = p.id
  where p.approved;
$$;
-- ---------- 8. O ADMIN VÊ O PROGRESSO E PODE ABRIR ----------
create or replace function admin_ratings_progress(p_pw text)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  return (select json_build_object(
    'ronda',       (select ratings_round from app_config where id = 1),
    'aberta_em',   (select ratings_opened_at from app_config where id = 1),
    'revelado',    avaliacoes_reveladas(),
    'revelado_em', (select ratings_revealed_at from app_config where id = 1),
    'completas',   avaliacoes_completas(),
    'em_falta', (
      select coalesce(json_agg(json_build_object(
               'player_id', f.player_id, 'name', f.name, 'faltam', f.faltam)
             order by f.faltam desc, f.name), '[]'::json)
      from avaliacoes_em_falta() f where f.faltam > 0)
  ));
end; $$;
create or replace function admin_reset_ratings(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_ronda int;
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  select ratings_round into v_ronda from app_config where id = 1;

  insert into ratings_arquivo (ronda, rater_id, target_id, score, created_at)
  select v_ronda, r.rater_id, r.target_id, r.score, r.created_at from ratings r
  on conflict (ronda, rater_id, target_id) do nothing;

  delete from ratings where true;

  update app_config set
    ratings_round       = ratings_round + 1,
    ratings_opened_at   = now(),
    ratings_revealed_at = null
  where id = 1;

  return admin_ratings_progress(p_pw);
end; $$;
-- Abrir à força: um jogador que nunca vote não pode trancar a revelação
-- para o grupo todo.
create or replace function admin_reveal_ratings(p_pw text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_ok(p_pw) then raise exception 'ADMIN'; end if;
  update app_config set ratings_revealed_at = coalesce(ratings_revealed_at, now()) where id = 1;
  return admin_ratings_progress(p_pw);
end; $$;
create or replace function avaliacoes_completas()
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select not exists (select 1 from avaliacoes_em_falta() f where f.faltam > 0)
     and (select count(*) from players where approved) > 1;
$$;
-- ---------- 5. QUEM JÁ ENTREGOU, E FALTA ALGUÉM? ----------
-- Um jogador está "em dia" quando tem uma linha para cada outro aprovado —
-- com nota ou com o "não conheço", tanto faz. O que conta é ter respondido.
create or replace function avaliacoes_em_falta()
returns table(player_id uuid, name text, faltam int)
language sql stable security definer set search_path = public, extensions as $$
  with aprovados as (select id, name from players where approved)
  select a.id, a.name,
         ((select count(*) from aprovados) - 1
          - (select count(*) from ratings r where r.rater_id = a.id))::int as faltam
  from aprovados a
  order by a.name;
$$;
create or replace function avaliacoes_reveladas()
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select ratings_revealed_at is not null from app_config where id = 1;
$$;
-- ---------- 7. AS NOTAS QUE RECEBI ----------
-- Antes da revelação: só a lista de notas, sem nomes. Dá para ver que
-- alguém deu 1,2 — não dá para saber quem.
--
-- Depois: cada nota com o nome de quem a deu. Foi decisão do grupo, e o
-- momento é o que a torna honesta — ninguém votou já a saber o que ia
-- receber.
create or replace function get_ratings_received(p_id uuid)
returns json language sql stable security definer set search_path = public, extensions as $$
  select json_build_object(
    'revelado', avaliacoes_reveladas(),
    'media',    (select round(avg(r.score)::numeric, 2) from ratings r where r.target_id = p_id),
    'com_nota', (select count(r.score)::int from ratings r where r.target_id = p_id),
    'nao_conhecem', (select count(*)::int from ratings r
                      where r.target_id = p_id and r.score is null),
    'notas', (
      select coalesce(json_agg(x order by x.score desc nulls last), '[]'::json)
      from (
        select r.score,
               case when avaliacoes_reveladas() then p.name else null end as name,
               case when avaliacoes_reveladas() then p.photo_url else null end as photo
        from ratings r join players p on p.id = r.rater_id
        where r.target_id = p_id and r.score is not null
      ) x)
  );
$$;
create or replace function submit_ratings(p_rater uuid, p_pin text, p_scores jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare r players; k text; v text; n numeric;
begin
  select * into r from players where id = p_rater;
  if r.id is null or p_pin is null or r.pin_hash <> crypt(p_pin, r.pin_hash) then raise exception 'CRED'; end if;
  if not r.approved then raise exception 'PENDENTE'; end if;

  for k, v in select key, value from jsonb_each_text(p_scores) loop
    if k::uuid <> p_rater then
      if v is null then
        -- "não conheço este jogador": linha com nota nula. Sai dos
        -- pendentes e não entra em média nenhuma.
        n := null;
      else
        -- só números; "4,2" com vírgula ou "muito bom" rebentavam no cast
        -- com um erro cru do Postgres, que a app mostrava como erro de ligação
        if v !~ '^\d+(\.\d+)?$' then raise exception 'SCOREDECIMAL'; end if;
        n := round(v::numeric, 1);
        if n < 0 or n > 5 then raise exception 'SCORE'; end if;
      end if;

      insert into ratings(rater_id, target_id, score)
      values (p_rater, k::uuid, n)
      on conflict (rater_id, target_id) do nothing;
    end if;
  end loop;

  return json_build_object(
    'revelado', talvez_revelar_avaliacoes(),
    'em_falta', (select count(*)::int from avaliacoes_em_falta() f where f.faltam > 0)
  );
end; $$;
-- Abre a revelação quando o último entregar. Chamada no fim de cada
-- submissão: é barata e converge sozinha, sem precisar de agendador.
create or replace function talvez_revelar_avaliacoes()
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ja timestamptz;
begin
  select ratings_revealed_at into v_ja from app_config where id = 1;
  if v_ja is not null then return true; end if;
  if not avaliacoes_completas() then return false; end if;
  update app_config set ratings_revealed_at = now() where id = 1;
  return true;
end; $$;

reset check_function_bodies;

-- ============================= TRIGGERS =============================
-- Ja foram apagados la em cima, na preparacao.
create trigger match_lineup_gk_order_trg
  before insert on match_lineup
  for each row execute function preencher_gk_order();
create trigger matches_voting_sync_trg
  before update on matches
  for each row execute function sincronizar_post_rating_status();

-- ==================== FUNCOES QUE JA NAO EXISTEM ====================
-- Substituidas e sem ninguem a chama-las. Numa base vazia nao fazem
-- nada; numa base antiga, limpam o que ficou para tras.
-- ---------- 1. O PAINEL DUPLICADO ----------
-- Era a fonte das duas listas que saíram. Substituída por
-- `admin_ratings_progress` (0027), que traz a mesma informação mais o
-- número da ronda, o estado (anónimas/abertas) e quem falta.
drop function if exists admin_pending_votes(text);
-- ---------- 2. SUBSTITUÍDAS PELA CÉDULA ÚNICA (0025) ----------
-- A votação passou a ser uma só: `get_round_ballot` para ler e
-- `submit_round_vote` para entregar. Estas eram as duas portas antigas,
-- uma para o craque/bagre e outra para as estrelas.
--
-- Ficaram como invólucros durante uma versão, para nada partir a meio do
-- deploy. Já ninguém as chama.
drop function if exists vote_award(uuid, text, uuid, uuid, uuid);
drop function if exists submit_post_match_ratings(uuid, text, uuid, jsonb);
drop function if exists get_my_post_ratings(uuid, text);
drop function if exists get_my_award_votes(uuid, text);
-- Substituída por `admin_set_voting` (0025), que mexe no estado, no prazo
-- e no quórum em vez de só abrir e fechar as estrelas.
drop function if exists admin_set_post_rating_status(text, uuid, boolean);
-- ---------- 3. LEGADO DE 2024 ----------
-- `get_stats` era a primeira versão das estatísticas (0001), de antes de
-- existirem rodadas. Substituída por `get_player_stats`.
drop function if exists get_stats();
-- `admin_add_match` (0002) criava uma rodada só com gols e assistências.
-- Substituída pelo `admin_save_match` (0010) e, depois, pelo ciclo de vida
-- completo da 0019 (`admin_save_result` / `admin_publish_result`).
drop function if exists admin_add_match(text, date, jsonb);

-- ============================ PERMISSOES ============================
-- O Postgres dá EXECUTE a PUBLIC a toda a função nova: sem este revoke, o
-- helper interno position_json ficava a ser um RPC aberto que devolve nome e
-- user_id de qualquer jogador (os ids saem no get_players) sem PIN nenhum.
-- Idempotente: revogar o que já não existe não é erro.
revoke execute on function position_json(uuid) from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
-- `recalcular_forcas_do_jogo` é interna e não pede senha: o Postgres dá
-- EXECUTE a PUBLIC a toda a função nova, e sem este revoke qualquer
-- visitante reescrevia as forças de um jogo. As funções de admin chamam-na
-- por dentro, onde o revoke não estorva (mesmo dono, SECURITY DEFINER).
revoke execute on function recalcular_forcas_do_jogo(uuid) from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
revoke execute on function registar_atividade(uuid, text, jsonb) from public, anon, authenticated;
revoke select on matches_validas       from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
revoke execute on function publicar_no_feed(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function payload_resultado(uuid) from public, anon, authenticated;
-- match_json continua fechada (0020): quem manda no que se vê são os wrappers
revoke execute on function match_json(uuid, boolean) from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
-- As views e os auxiliares são canalização interna das funções acima: quem
-- decide o que se vê são as funções de leitura, não quem souber um id.
-- (O default do Postgres é EXECUTE para PUBLIC — por isso o revoke é
-- explícito. As funções SECURITY DEFINER correm como o dono e continuam a
-- poder chamá-las.)
revoke select on participantes_do_jogo from public, anon, authenticated;
revoke select on post_ratings_validas  from public, anon, authenticated;
revoke execute on function limpar_votos_invalidos(uuid) from public, anon, authenticated;
revoke execute on function jogadores_do_jogo(uuid)      from public, anon, authenticated;
revoke execute on function vencedor_do_jogo(uuid)       from public, anon, authenticated;
revoke execute on function elegiveis_premio(uuid, text) from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
revoke execute on function corrigir_ordem_rodizio(uuid) from public, anon, authenticated;
revoke execute on function preencher_gk_order()         from public, anon, authenticated;
revoke execute on function match_public_json(uuid)      from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
revoke select on premios_da_rodada from public, anon, authenticated;
revoke execute on function fechar_votacao(uuid, boolean)            from public, anon, authenticated;
revoke execute on function fechar_votacoes_expiradas()              from public, anon, authenticated;
revoke execute on function participacao_da_votacao(uuid)            from public, anon, authenticated;
revoke execute on function lider_do_premio(uuid, text)              from public, anon, authenticated;
revoke execute on function autenticar_votante(uuid, text, uuid)     from public, anon, authenticated;
revoke execute on function sincronizar_post_rating_status()         from public, anon, authenticated;
revoke execute on function match_admin_json(uuid)                   from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
-- As views são canalização interna das funções: quem decide o que se vê
-- são elas, não quem souber um id.
revoke select on resultados_esperados          from public, anon, authenticated;
revoke select on saldo_esperado_por_jogador    from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
revoke execute on function avaliacoes_em_falta()          from public, anon, authenticated;
revoke execute on function talvez_revelar_avaliacoes()    from public, anon, authenticated;
-- ---------- PERMISSÕES ----------
grant execute on function register(text,date,text,text)  to anon, authenticated;
grant execute on function login(text,text)                to anon, authenticated;
grant execute on function get_players()                            to anon, authenticated;
grant execute on function submit_ratings(uuid,text,jsonb) to anon, authenticated;
grant execute on function admin_pending(text)             to anon, authenticated;
grant execute on function admin_approve(text,uuid)        to anon, authenticated;
grant execute on function admin_reject(text,uuid)         to anon, authenticated;
grant execute on function publish_draw(text,jsonb,jsonb)  to anon, authenticated;
grant execute on function get_published_draw()            to anon, authenticated;
grant execute on function admin_delete_match(text,uuid)        to anon, authenticated;
grant execute on function get_matches()                             to anon, authenticated;
grant execute on function get_player_stats()   to anon, authenticated;
grant execute on function update_photo(uuid, text, text) to anon, authenticated;
grant execute on function get_pending_ratings(uuid, text) to anon, authenticated;
grant execute on function admin_reset_ratings(text)       to anon, authenticated;
grant execute on function admin_reset_ratings_for(text, uuid) to anon, authenticated;
-- ---------- PERMISSÕES ----------
grant execute on function register(text, date, text, text)   to anon, authenticated;
grant execute on function admin_users(text)                  to anon, authenticated;
grant execute on function admin_regen_user_id(text, uuid)    to anon, authenticated;
grant execute on function admin_set_user_id(text, uuid, text) to anon, authenticated;
grant execute on function get_latest_match()                     to anon, authenticated;
grant execute on function get_match(uuid)                        to anon, authenticated;
grant execute on function admin_save_match(text, uuid, date, text, text, int, int, text, text, text, jsonb) to anon, authenticated;
grant execute on function get_player_profile(uuid) to anon, authenticated;
grant execute on function admin_export(text, boolean)   to anon, authenticated;
grant execute on function get_player_stats_range(date, date)     to anon, authenticated;
grant execute on function get_player_chemistry(uuid)             to anon, authenticated;
grant execute on function change_pin(uuid, text, text)   to anon, authenticated;
grant execute on function admin_set_pin(text, uuid, text) to anon, authenticated;
-- ---------- PERMISSÕES ----------
grant execute on function position_ok(text)                                              to anon, authenticated;
grant execute on function set_my_positions(uuid, text, text, text, boolean)              to anon, authenticated;
grant execute on function admin_set_positions(text, uuid, text, text, text, boolean, text) to anon, authenticated;
grant execute on function admin_approve_positions(text, uuid)                            to anon, authenticated;
grant execute on function ack_position_notice(uuid, text)                                to anon, authenticated;
grant execute on function admin_positions_overview(text)                                 to anon, authenticated;
grant execute on function admin_position_history(text, uuid)                             to anon, authenticated;
grant execute on function login(text, text)                                  to anon, authenticated;
-- ---------- PERMISSÕES ----------
grant execute on function admin_save_schedule(text, uuid, timestamptz, text, text)          to anon, authenticated;
grant execute on function admin_save_lineup(text, uuid, jsonb, int, int, numeric, text)
  to anon, authenticated;
grant execute on function admin_publish_match(text, uuid)        to anon, authenticated;
grant  execute on function match_public_json(uuid)      to anon, authenticated;
grant execute on function get_next_match()                                                  to anon, authenticated;
grant execute on function admin_matches_upcoming(text)           to anon, authenticated;
grant execute on function admin_set_match_status(text, uuid, text) to anon, authenticated;
grant execute on function admin_delete_schedule(text, uuid)                                 to anon, authenticated;
-- ---------- PERMISSÕES ----------
grant execute on function admin_save_gk_stats(text, uuid, jsonb) to anon, authenticated;
grant execute on function get_goalkeeper_stats()                 to anon, authenticated;
grant execute on function get_match_gk_stats(uuid)               to anon, authenticated;
grant execute on function admin_substitute_player(text, uuid, uuid, uuid, int, text) to anon, authenticated;
grant execute on function admin_undo_substitution(text, uuid)     to anon, authenticated;
grant execute on function admin_save_result(text, uuid, int, int, jsonb, jsonb, text, uuid, uuid) to anon, authenticated;
grant execute on function admin_publish_result(text, uuid)       to anon, authenticated;
grant execute on function admin_cancel_match(text, uuid, text)    to anon, authenticated;
grant execute on function admin_add_media(text, uuid, text, text, boolean) to anon, authenticated;
grant execute on function admin_set_primary_media(text, uuid)    to anon, authenticated;
grant execute on function admin_delete_media(text, uuid)         to anon, authenticated;
grant execute on function admin_match_activity(text, uuid)       to anon, authenticated;
grant execute on function admin_publish_match(text, uuid, text)   to anon, authenticated;
grant execute on function admin_publish_result(text, uuid, text) to anon, authenticated;
grant execute on function get_feed(int, timestamptz, uuid)        to anon, authenticated;
grant execute on function admin_update_post(text, uuid, text, text) to anon, authenticated;
grant execute on function admin_delete_post(text, uuid)           to anon, authenticated;
-- ---------- PERMISSÕES ----------
grant execute on function admin_substitute_player(text, uuid, uuid, uuid, int, text, text) to anon, authenticated;
grant execute on function admin_swap_players(text, uuid, uuid, uuid, text)                 to anon, authenticated;
grant execute on function admin_undo_swap(text, uuid)                                      to anon, authenticated;
-- ---------- PERMISSÕES ----------
grant execute on function set_my_primary_card(uuid, text, text)              to anon, authenticated;
grant execute on function set_my_nickname(uuid, text, text)                  to anon, authenticated;
grant execute on function admin_clear_card_choices(text, uuid, boolean, boolean) to anon, authenticated;
grant execute on function admin_save_schedule(text, uuid, timestamptz, text, text, text, int, int)
  to anon, authenticated;
grant execute on function set_my_gk_rotation(uuid, text, boolean)  to anon, authenticated;
grant execute on function admin_set_gk_rotation(text, uuid, boolean) to anon, authenticated;
grant execute on function prazo_de_votacao(timestamptz, int)        to anon, authenticated;
grant execute on function get_round_ballot(uuid, text, uuid, uuid)  to anon, authenticated;
grant execute on function submit_round_vote(uuid, text, uuid, uuid, uuid, jsonb, uuid) to anon, authenticated;
grant execute on function get_my_open_votes(uuid, text, uuid)       to anon, authenticated;
grant execute on function issue_device_token(uuid, text, text)      to anon, authenticated;
grant execute on function login_with_device(uuid)                   to anon, authenticated;
grant execute on function revoke_device(uuid)                       to anon, authenticated;
grant execute on function admin_revoke_devices(text, uuid)          to anon, authenticated;
grant execute on function admin_close_game(text, uuid, int, int, jsonb, jsonb, text, text, timestamptz)
  to anon, authenticated;
grant execute on function admin_set_voting(text, uuid, text, timestamptz, int) to anon, authenticated;
grant execute on function admin_voting_review(text, uuid)           to anon, authenticated;
grant execute on function admin_finalize_voting(text, uuid, uuid, uuid) to anon, authenticated;
grant execute on function avaliacoes_completas()          to anon, authenticated;
grant execute on function avaliacoes_reveladas()          to anon, authenticated;
grant execute on function submit_ratings(uuid, text, jsonb) to anon, authenticated;
grant execute on function get_ratings_received(uuid)      to anon, authenticated;
grant execute on function admin_ratings_progress(text)    to anon, authenticated;
grant execute on function admin_reveal_ratings(text)      to anon, authenticated;

-- ====================== SEMENTE (base vazia) ========================
-- Senha inicial do admin. Numa base que ja exista, o ON CONFLICT faz
-- disto um no-op: a senha atual nao e tocada.
-- senha inicial do admin = 'pelada2026'
insert into app_config (id, admin_pw_hash)
values (1, crypt('pelada2026', gen_salt('bf')))
on conflict (id) do nothing;

-- ================== OPERACOES DE DADOS JA EXECUTADAS ================
--
-- Ficam COMENTADAS. Correram uma vez, na migracao que as trouxe, e
-- repeti-las agora estragava dados reais. Estao aqui pelo registo: se um
-- dia for preciso reconstruir a base de raiz a partir de um backup antigo,
-- e daqui que se tira o que falta.
--
-- 1) Carimbos que ja foram dados, sobre `matches`: a versao da formula
--    (0023) e o arranque da votacao com prazo (0025). Todos guardados por
--    um `where` que hoje ja nao apanha linha nenhuma — mas se apanhasse,
--    o segundo poe TRES DIAS DE PRAZO A CONTAR DE AGORA em votacoes que
--    ja fecharam, e o terceiro fecha as que estao abertas.
--
--   -- Um jogo já agendado mas ainda por jogar é "partida realizada depois
--   -- desta versão" — entra na fórmula nova. Só os que já têm resultado
--   -- publicado (ou foram cancelados) é que ficam no passado.
--   update matches set overall_version = 2
--    where overall_version = 1
--      and status in ('DRAFT','PUBLISHED','IN_PROGRESS')
--      and result_status <> 'PUBLISHED'
--
--   -- ---------- 2. BACKFILL DOS JOGOS QUE JÁ ESTÃO ABERTOS ----------
--   -- Sem isto, a primeira leitura depois do deploy fechava TODAS as votações
--   -- de uma vez (deadline nulo → expirado). Quem tem a avaliação aberta hoje
--   -- passa a OPEN com três dias de prazo a contar de agora.
--   update matches set
--     voting_status   = 'OPEN',
--     voting_deadline = coalesce(voting_deadline, now() + interval '3 days')
--   where voting_status = 'NONE'
--     and post_rating_status = 'OPEN'
--     and overall_version = 2
--     and status = 'COMPLETED'
--     and result_status = 'PUBLISHED'
--
--   -- As rodadas já jogadas ficam CLOSED. `craque_final` fica NULO de
--   -- propósito: quem ganhou nessas rodadas continua a ser decidido pela
--   -- contagem de votos de sempre (ver o ramo `legado` em get_player_stats).
--   -- Congelar aqui um vencedor calculado agora era reescrever a história
--   -- com a régua nova — exatamente o que esta migração quer evitar.
--   --
--   -- Consequência assumida: uma rodada antiga deixa de aceitar votos novos.
--   -- Se faltar mesmo o voto de alguém, o admin reabre-a em Jogos → Votação.
--   update matches set voting_status = 'CLOSED', voting_closed_at = coalesce(result_published_at, now())
--   where voting_status = 'NONE'
--     and status = 'COMPLETED'
--     and result_status = 'PUBLISHED'
--
-- 2) 0027 - o recomeco da avaliacao do grupo. NAO CORRER OUTRA VEZ:
--    apaga a tabela `ratings` inteira. So se usa quando o grupo decidir
--    recomecar as notas de raiz, e nessa altura o caminho certo e o botao
--    do admin (`admin_reset_ratings`), que arquiva antes de limpar.
--
--   insert into ratings_arquivo (ronda, rater_id, target_id, score, created_at)
--   select (select ratings_round from app_config where id = 1),
--          r.rater_id, r.target_id, r.score, r.created_at
--     from ratings r
--     on conflict (ronda, rater_id, target_id) do nothing;
--
--   delete from ratings where true;
--
--   update app_config set ratings_round = ratings_round + 1,
--                         ratings_opened_at = now(),
--                         ratings_revealed_at = null
--    where id = 1;
