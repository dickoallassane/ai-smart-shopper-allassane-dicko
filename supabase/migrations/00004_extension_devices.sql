-- Long-lived device/session rows; store token_hash only. Inserts intended via service role from Next.js.

create table if not exists public.extension_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  label text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index if not exists extension_devices_user_id_created_at_idx
  on public.extension_devices (user_id, created_at desc);

alter table public.extension_devices enable row level security;

create policy "Users can view their extension devices"
  on public.extension_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update their extension devices"
  on public.extension_devices
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their extension devices"
  on public.extension_devices
  for delete
  to authenticated
  using (auth.uid() = user_id);
