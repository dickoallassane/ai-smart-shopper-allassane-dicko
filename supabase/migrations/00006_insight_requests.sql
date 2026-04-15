-- Audit trail for insight API calls (stored response JSON).

create table if not exists public.insight_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_fingerprint text not null,
  flags jsonb not null default '{}'::jsonb,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists insight_requests_user_id_created_at_idx
  on public.insight_requests (user_id, created_at desc);

alter table public.insight_requests enable row level security;

create policy "Users can read their insight requests"
  on public.insight_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their insight requests"
  on public.insight_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);
