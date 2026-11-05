-- Phone texting and grocery lines added by SMS.
alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists pending_phone text,
  add column if not exists phone_code_hash text,
  add column if not exists phone_code_expires timestamptz;

create unique index if not exists profiles_verified_phone_idx
  on public.profiles (phone)
  where phone is not null and phone_verified;

create table if not exists public.manual_shopping_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'piece',
  purchased boolean not null default false
);

create index if not exists manual_shopping_user_week_idx
  on public.manual_shopping_items (user_id, week_start);

alter table public.manual_shopping_items enable row level security;

create policy manual_shopping_all on public.manual_shopping_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
