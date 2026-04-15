-- Rolled-up metrics per retailer domain + category. Maintained by server jobs (service role); clients read only.

create table if not exists public.domain_category_scores (
  id uuid primary key default gen_random_uuid(),
  retailer_domain_id uuid not null references public.retailer_domains (id) on delete cascade,
  category_key text not null,
  report_count integer not null default 0,
  negative_report_count integer not null default 0,
  computed_score numeric not null default 100,
  auto_insights_disabled boolean not null default false,
  last_computed_at timestamptz,
  constraint domain_category_scores_domain_category_key unique (retailer_domain_id, category_key)
);

create index if not exists domain_category_scores_domain_disabled_idx
  on public.domain_category_scores (retailer_domain_id, auto_insights_disabled);

alter table public.domain_category_scores enable row level security;

create policy "Domain category scores are readable by authenticated users"
  on public.domain_category_scores
  for select
  to authenticated
  using (true);
