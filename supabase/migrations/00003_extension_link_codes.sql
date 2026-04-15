-- Short-lived hashed OTP for web → extension handoff. No client RLS policies: service role only.

create table if not exists public.extension_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists extension_link_codes_user_id_created_at_idx
  on public.extension_link_codes (user_id, created_at desc);

create index if not exists extension_link_codes_expires_at_idx
  on public.extension_link_codes (expires_at);

alter table public.extension_link_codes enable row level security;
