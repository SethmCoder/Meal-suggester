-- Larder schema. Run this in the Supabase SQL editor for your project.
-- The browser uses only the anon key. Do not put the service-role key in the app.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  email text not null,
  avatar_url text,
  tutorial_completed boolean not null default false,
  auto_start_tutorial boolean not null default true,
  open_on_current_week boolean not null default true,
  last_week_start date
);

create table if not exists public.inventory_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  expires_on date,
  category text not null check (category in ('produce', 'meat', 'dairy', 'pantry', 'frozen', 'other'))
);

create index if not exists inventory_items_user_idx on public.inventory_items (user_id);

create table if not exists public.meal_slots (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  day text not null check (day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner')),
  meal jsonb,
  time_constraint jsonb,
  unique (user_id, week_start, day, slot)
);

create table if not exists public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  allergies text[] not null default '{}',
  dietary text[] not null default '{}',
  favorites text[] not null default '{}',
  disliked text[] not null default '{}',
  cuisines text[] not null default '{}',
  skill text not null default 'beginner' check (skill in ('beginner', 'intermediate', 'advanced')),
  equipment text[] not null default '{}',
  instructions text not null default ''
);

create table if not exists public.shopping_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  ingredient_key text not null,
  purchased boolean not null default false,
  unique (user_id, week_start, ingredient_key)
);

create table if not exists public.meal_feedback (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_name text not null,
  accepted boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists meal_feedback_user_idx on public.meal_feedback (user_id);

alter table public.profiles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.meal_slots enable row level security;
alter table public.preferences enable row level security;
alter table public.shopping_items enable row level security;
alter table public.meal_feedback enable row level security;

create policy profiles_select on public.profiles for select using (auth.uid() = id);
create policy profiles_insert on public.profiles for insert with check (auth.uid() = id);
create policy profiles_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_delete on public.profiles for delete using (auth.uid() = id);

create policy inventory_all on public.inventory_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy meals_all on public.meal_slots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy preferences_all on public.preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy shopping_all on public.shopping_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy feedback_all on public.meal_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, update, delete on public.meal_slots to authenticated;
grant select, insert, update, delete on public.preferences to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.meal_feedback to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(coalesce(new.email, 'member'), '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.resolve_login_email(identifier text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(email) = lower(identifier)
     or lower(username) = lower(identifier)
  limit 1;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
