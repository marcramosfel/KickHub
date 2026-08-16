-- KickHub V2 — escalação sorteada de um jogo.
--
-- `overall_at_draw` congela a força do jogador no instante do sorteio, tal
-- como no legado: o overall muda a cada jornada, e o histórico de um jogo não
-- pode mudar com ele. Sem esta coluna, reabrir um jogo antigo mostraria
-- equipas "desequilibradas" que estavam equilibradas no dia.
--
-- `seed` guarda a semente usada. Quem contestar o sorteio pode reproduzi-lo com
-- o mesmo plantel e obter exatamente as mesmas equipas.

create table public.game_lineups (
  game_id uuid not null,
  membership_id uuid not null,
  pelada_id uuid not null references public.peladas(id) on delete cascade,
  team text not null check (team in ('A','B')),
  is_goalkeeper boolean not null default false,
  overall_at_draw int not null check (overall_at_draw between 1 and 99),
  overall_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (game_id, membership_id),
  foreign key (game_id, pelada_id) references public.games (id, pelada_id) on delete cascade,
  foreign key (membership_id, pelada_id) references public.pelada_memberships (id, pelada_id) on delete cascade
);

create index game_lineups_game_team_idx on public.game_lineups (game_id, team);

alter table public.games
  add column draw_seed text,
  add column drawn_at timestamptz;

alter table public.game_lineups enable row level security;

create policy game_lineups_member_read on public.game_lineups
  for select using (public.is_active_member(pelada_id));

-- A escalação chega inteira, calculada pelo domínio no cliente, e é substituída
-- numa transação: um sorteio meio gravado deixaria equipas incompletas.
--
-- O servidor não confia no que recebe: valida que cada jogador pertence à
-- pelada, está ativo e confirmou presença no jogo. Sem isso, quem organiza
-- podia escalar alguém de outra comunidade através da RPC.
create or replace function public.save_game_lineup(
  p_game_id uuid,
  p_seed text,
  p_lineup jsonb
)
returns setof public.game_lineups
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_game public.games;
  v_count int;
  v_valid int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if not public.has_pelada_role(v_game.pelada_id, array['owner','admin']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_game.status <> 'scheduled' then
    raise exception 'GAME_NOT_OPEN';
  end if;
  if jsonb_typeof(p_lineup) <> 'array' or jsonb_array_length(p_lineup) = 0 then
    raise exception 'EMPTY_LINEUP';
  end if;

  -- Sem tabela temporária de apoio: `on commit drop` só a larga no commit, o
  -- que fazia a segunda chamada dentro da mesma transação falhar com 42P07, e
  -- o nome podia ser ocupado de fora para impedir a função de correr.
  select
    count(*),
    count(*) filter (where member.id is not null and attendance.membership_id is not null)
  into v_count, v_valid
  from jsonb_array_elements(p_lineup) as entry
  left join public.pelada_memberships member
    on member.id = (entry->>'membership_id')::uuid
   and member.pelada_id = v_game.pelada_id
   and member.status = 'active'
  left join public.game_attendance attendance
    on attendance.game_id = p_game_id
   and attendance.membership_id = member.id
   and attendance.status = 'confirmed';

  if v_valid <> v_count then
    raise exception 'INVALID_LINEUP';
  end if;

  delete from public.game_lineups where game_id = p_game_id;

  insert into public.game_lineups (
    game_id, membership_id, pelada_id, team, is_goalkeeper, overall_at_draw, overall_estimated
  )
  select
    p_game_id,
    (entry->>'membership_id')::uuid,
    v_game.pelada_id,
    entry->>'team',
    coalesce((entry->>'is_goalkeeper')::boolean, false),
    (entry->>'overall_at_draw')::int,
    coalesce((entry->>'overall_estimated')::boolean, false)
  from jsonb_array_elements(p_lineup) as entry;

  update public.games
  set draw_seed = p_seed, drawn_at = now()
  where id = p_game_id;

  insert into public.tenant_audit_log (pelada_id, actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_game.pelada_id,
    public.current_profile_id(),
    'game.lineup_drawn',
    'games',
    p_game_id,
    jsonb_build_object('seed', p_seed, 'players', v_count)
  );

  return query
  select * from public.game_lineups where game_id = p_game_id order by team, membership_id;
end;
$$;

create or replace function public.get_game_lineup(p_game_id uuid)
returns table (
  membership_id uuid,
  display_name text,
  team text,
  is_goalkeeper boolean,
  overall_at_draw int,
  overall_estimated boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    line.membership_id,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    line.team,
    line.is_goalkeeper,
    line.overall_at_draw,
    line.overall_estimated
  from public.game_lineups line
  join public.pelada_memberships member on member.id = line.membership_id
  left join public.profiles profile on profile.id = member.profile_id
  where line.game_id = p_game_id
    and public.is_active_member(line.pelada_id)
  order by line.team, line.is_goalkeeper desc, line.overall_at_draw desc, line.membership_id;
$$;

-- Quem confirmou presença, já com os atributos que o sorteio precisa. Sem isto
-- o cliente teria de cruzar o plantel inteiro com as presenças à mão.
create or replace function public.list_game_attendance(p_game_id uuid)
returns table (
  membership_id uuid,
  display_name text,
  status text,
  overall int,
  player_type text,
  primary_position text,
  secondary_position text,
  accepts_other_positions boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    attendance.membership_id,
    coalesce(nullif(btrim(member.nickname), ''), profile.display_name, 'Jogador'),
    attendance.status,
    member.overall,
    member.player_type,
    member.primary_position,
    member.secondary_position,
    member.accepts_other_positions
  from public.game_attendance attendance
  join public.games game on game.id = attendance.game_id
  join public.pelada_memberships member on member.id = attendance.membership_id
  left join public.profiles profile on profile.id = member.profile_id
  where attendance.game_id = p_game_id
    and public.is_active_member(game.pelada_id)
  order by attendance.status, coalesce(nullif(btrim(member.nickname), ''), profile.display_name), attendance.membership_id;
$$;

revoke all on function public.list_game_attendance(uuid) from public, anon;
grant execute on function public.list_game_attendance(uuid) to authenticated;

revoke all on function public.save_game_lineup(uuid, text, jsonb) from public, anon;
revoke all on function public.get_game_lineup(uuid) from public, anon;

grant execute on function public.save_game_lineup(uuid, text, jsonb) to authenticated;
grant execute on function public.get_game_lineup(uuid) to authenticated;

grant select on public.game_lineups to authenticated;
