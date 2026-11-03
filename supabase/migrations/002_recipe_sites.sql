-- Preferred recipe publisher ids (e.g. recipetineats, justonecookbook)
alter table public.preferences
  add column if not exists recipe_sites text[] not null default '{}';
