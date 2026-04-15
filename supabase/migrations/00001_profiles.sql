-- Example user profile row keyed by Supabase auth.users
-- Enable RLS so only the owner can read/write their profile.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by owners"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Profiles are insertable by owners"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "Profiles are updatable by owners"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
