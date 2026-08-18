-- The Browns source stores craque and bagre choices independently while a
-- voting window is open. Keep those historical partial votes intact in the
-- legacy compatibility table; the multi-pelada backfill already normalizes
-- each non-null choice into its own game_award_votes row.

alter table public.award_votes
  alter column craque_id drop not null,
  alter column bagre_id drop not null;

alter table public.award_votes
  add constraint award_votes_at_least_one_choice
  check (craque_id is not null or bagre_id is not null) not valid;

alter table public.award_votes
  validate constraint award_votes_at_least_one_choice;
