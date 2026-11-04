-- Optional: persist finished meal flag on planner slots.
alter table public.meal_slots
  add column if not exists finished boolean not null default false;
