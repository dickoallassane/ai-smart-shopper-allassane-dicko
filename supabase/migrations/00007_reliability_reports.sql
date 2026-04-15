-- User-submitted reliability signals (products and services). Domain cannot be deleted while reports reference it.

create table if not exists public.reliability_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  retailer_domain_id uuid not null references public.retailer_domains (id) on delete restrict,
  category_key text not null,
  listing_kind text not null,
  product_fingerprint text,
  title_snapshot text,
  severity text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint reliability_reports_listing_kind_check check (
    listing_kind in (
      'physical_product',
      'digital_product',
      'subscription_service',
      'other_service'
    )
  ),
  constraint reliability_reports_severity_check check (
    severity in ('unreliable', 'suspicious')
  )
);

create index if not exists reliability_reports_domain_category_created_idx
  on public.reliability_reports (retailer_domain_id, category_key, created_at desc);

create index if not exists reliability_reports_user_created_idx
  on public.reliability_reports (user_id, created_at desc);

alter table public.reliability_reports enable row level security;

create policy "Users can read their own reliability reports"
  on public.reliability_reports
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own reliability reports"
  on public.reliability_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);
