-- "Couldn't find this at {shop}?" reports from a recipe's Swap (founder's idea, 16 Nov 2026; docs/RECIPES_ANY_SUPERMARKET_REPORT.md).
-- WRITTEN, NOT APPLIED: the founder pastes this into Supabase › SQL Editor when the feature is approved (never `supabase db push`, CLAUDE.md rule 4).
-- What a row holds: which shop, which ingredient kind, which product, which recipe and the app version. Nothing about the person: no account id, name, email or
-- location, and no free text. ip_hash only limits how many one caller sends an hour (lib/handlers.ts RATE_LIMITS) and is cleared after 30 days by the daily
-- clean-up (app/api/cron/cleanup), like every other report table. Written only by the API with the server key (RLS on, no policies, nothing granted to the app roles).

create table public.not_found_reports (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  shop             text not null check (shop ~ '^[a-z][a-z-]{1,30}$'),
  ingredient_kind  text not null check (char_length(ingredient_kind) <= 60 and ingredient_kind ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  product_id       text not null check (char_length(product_id) <= 120 and product_id ~ '^[A-Za-z0-9][A-Za-z0-9._%-]*$' and position('..' in product_id) = 0),
  recipe_id        text check (recipe_id is null or (char_length(recipe_id) <= 80 and recipe_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
  app_version      text check (char_length(app_version) <= 32),
  ip_hash          text check (char_length(ip_hash) <= 64)
);
comment on table public.not_found_reports is 'Products people could not find at a shop (recipe Swap, "Could you find this?" No). See the not_found_counts view.';

-- rate-limit lookups (one caller's rows in the last hour)
create index not_found_reports_ip_idx on public.not_found_reports (ip_hash, created_at);

-- The founder's "spreadsheet": open it in Table Editor and export it as CSV. One row per shop, product and ingredient kind, most reported first.
create view public.not_found_counts with (security_invoker = true) as
  select shop,
         product_id,
         ingredient_kind,
         count(*)                                         as reports,
         count(distinct recipe_id)                        as recipes,
         min(created_at)                                  as first_reported,
         max(created_at)                                  as last_reported
  from public.not_found_reports
  group by shop, product_id, ingredient_kind
  order by count(*) desc, max(created_at) desc;
comment on view public.not_found_counts is 'How often each product was reported as not found at its shop. Read-only; export as CSV from Table Editor.';

-- lock it down like the other report tables
alter table public.not_found_reports enable row level security;
revoke all on public.not_found_reports, public.not_found_counts from anon, authenticated;
grant all on public.not_found_reports, public.not_found_counts to service_role;
grant usage, select on all sequences in schema public to service_role;
