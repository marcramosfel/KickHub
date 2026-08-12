-- Dados exclusivamente locais. Nunca aplicar este ficheiro em produção.
-- Senha administrativa local: local-dev-admin
update public.app_config
set admin_pw_hash = crypt('local-dev-admin', gen_salt('bf'))
where id = 1;

-- Cenário multi-tenant local: um profile participa em duas peladas com papéis diferentes.
insert into public.profiles (id, username, display_name, country_code, city, locale, timezone)
values
  ('10000000-0000-4000-8000-000000000001', 'marcos-demo', 'Marcos Demo', 'CH', 'Zürich', 'pt', 'Europe/Zurich'),
  ('10000000-0000-4000-8000-000000000002', 'tiago-demo', 'Tiago Demo', 'CH', 'Zürich', 'de', 'Europe/Zurich')
on conflict (id) do nothing;

insert into public.peladas (
  id, slug, name, description, owner_profile_id, visibility, join_mode, country_code, city, timezone
)
values (
  '10000000-0000-4000-8000-000000000101', 'limmat-united-demo', 'Limmat United Demo',
  'Segundo tenant local para testar isolamento.',
  '10000000-0000-4000-8000-000000000002', 'public', 'approval', 'CH', 'Zürich', 'Europe/Zurich'
)
on conflict (id) do nothing;

insert into public.pelada_memberships (id, pelada_id, profile_id, role, status, approved_at, approved_by)
values
  ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000002', 'owner', 'active', now(), '10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', 'player', 'active', now(), '10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', 'admin', 'active', now(), '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.pelada_settings (pelada_id, default_format, default_team_size, frequency, goalkeeper_mode)
values ('10000000-0000-4000-8000-000000000101', '5x5', 5, 'weekly', 'rotating')
on conflict (pelada_id) do nothing;
