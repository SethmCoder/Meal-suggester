-- Food-preference onboarding survey flag (separate from tutorial).
-- Existing profiles are grandfathered as completed; new signups start incomplete.

alter table public.profiles
  add column if not exists survey_completed boolean not null default true;

alter table public.profiles
  alter column survey_completed set default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email, survey_completed)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(coalesce(new.email, 'member'), '@', 1)),
    coalesce(new.email, ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
