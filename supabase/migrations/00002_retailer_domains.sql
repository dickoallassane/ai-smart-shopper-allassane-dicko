-- Global retailer allowlist: hostname + full-URL POSIX regex (validate patterns in app to reduce ReDoS risk).

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.retailer_domains (
  id uuid primary key default gen_random_uuid(),
  hostname text not null unique,
  url_regex text not null,
  label text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists retailer_domains_set_updated_at on public.retailer_domains;
create trigger retailer_domains_set_updated_at
before update on public.retailer_domains
for each row
execute procedure public.set_current_timestamp_updated_at();

alter table public.retailer_domains enable row level security;

create policy "Retailer domains are readable by authenticated users"
  on public.retailer_domains
  for select
  to authenticated
  using (true);

insert into public.retailer_domains (hostname, url_regex, label, sort_order)
values (
  'www.amazon.com',
  '^https://www\.amazon\.com/(dp/[A-Z0-9]{10}|gp/product/[A-Z0-9]{10})([/?#]|$)',
  'Amazon US product detail pages',
  0
)
on conflict (hostname) do nothing;
