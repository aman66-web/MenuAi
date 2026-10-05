-- MenuMacros backend: core tables.
--
-- Security model (see docs/BACKEND.md):
--   * The iOS app and the website NEVER talk to Supabase directly. They call the Vercel API,
--     which uses the server-only secret key (service_role, bypasses RLS).
--   * RLS is enabled on every table with NO policies, and anon/authenticated privileges are
--     revoked, so the publishable/anon key can read or write nothing.
--   * ip_hash is a salted SHA-256 of the caller's IP, used only for rate limiting, and is
--     cleared after 30 days by the Vercel cron job (/api/cron/cleanup).

-- ---------------------------------------------------------------- waitlist (website)
create table public.waitlist (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  email       text not null unique
              check (char_length(email) between 3 and 254
                     and email = lower(email)
                     and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  source      text check (char_length(source) <= 64),        -- e.g. "tiktok", from ?ref= / utm_source
  ip_hash     text check (char_length(ip_hash) <= 64)
);
comment on table public.waitlist is 'Pre-launch email sign-ups from the website.';

-- ---------------------------------------------------------------- "Report a number" (app)
create table public.number_reports (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  chain_id        text not null check (chain_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(chain_id) <= 80),
  item_id         text not null check (item_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(item_id) <= 120),
  item_name       text check (char_length(item_name) <= 200),
  field           text not null
                  check (field in ('calories','protein','carbs','fat','saturatedFat','sodium','sugar','fiber','other')),
  shown_value     numeric check (shown_value is null or (shown_value >= 0 and shown_value < 100000)),
  reported_value  numeric check (reported_value is null or (reported_value >= 0 and reported_value < 100000)),
  note            text check (char_length(note) <= 1000),
  data_version    bigint,
  app_version     text check (char_length(app_version) <= 32),
  photo_path      text check (char_length(photo_path) <= 200),  -- object path in the report-photos bucket
  status          text not null default 'open' check (status in ('open','fixed','rejected','duplicate')),
  resolved_at     timestamptz,
  founder_note    text,
  ip_hash         text check (char_length(ip_hash) <= 64)
);
comment on table public.number_reports is 'User reports of wrong nutrition numbers. Target: resolve within 48 hours.';
create index number_reports_open_idx on public.number_reports (created_at) where status = 'open';

-- ---------------------------------------------------------------- "Request a chain" (app)
create table public.chain_requests (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  name             text not null check (char_length(btrim(name)) between 2 and 80),
  name_normalized  text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  app_version      text check (char_length(app_version) <= 32),
  ip_hash          text check (char_length(ip_hash) <= 64)
);
comment on table public.chain_requests is 'Votes for chains to add. See the chain_request_counts view.';

-- ---------------------------------------------------------------- support messages (app + website)
create table public.support_messages (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  email        text check (email is null or (char_length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  message      text not null check (char_length(btrim(message)) between 5 and 4000),
  source       text not null default 'web' check (source in ('web','app')),
  app_version  text check (char_length(app_version) <= 32),
  status       text not null default 'open' check (status in ('open','answered','closed')),
  ip_hash      text check (char_length(ip_hash) <= 64)
);
comment on table public.support_messages is 'Contact form messages. Reply by email; mark answered.';

-- ---------------------------------------------------------------- rate-limit lookups
create index waitlist_ip_idx          on public.waitlist (ip_hash, created_at);
create index number_reports_ip_idx    on public.number_reports (ip_hash, created_at);
create index chain_requests_ip_idx    on public.chain_requests (ip_hash, created_at);
create index support_messages_ip_idx  on public.support_messages (ip_hash, created_at);

-- ---------------------------------------------------------------- founder views (Table Editor / SQL editor)
create view public.open_reports with (security_invoker = true) as
  select id, created_at, chain_id, item_id, item_name, field, shown_value, reported_value, note,
         photo_path, app_version, data_version,
         round(extract(epoch from now() - created_at) / 3600) as hours_open
  from public.number_reports
  where status = 'open'
  order by created_at;

create view public.chain_request_counts with (security_invoker = true) as
  select name_normalized as chain, count(*) as requests, max(created_at) as last_requested
  from public.chain_requests
  group by name_normalized
  order by count(*) desc, max(created_at) desc;

-- ---------------------------------------------------------------- lock everything down
alter table public.waitlist          enable row level security;
alter table public.number_reports    enable row level security;
alter table public.chain_requests    enable row level security;
alter table public.support_messages  enable row level security;

revoke all on public.waitlist, public.number_reports, public.chain_requests, public.support_messages,
              public.open_reports, public.chain_request_counts
  from anon, authenticated;

grant all on public.waitlist, public.number_reports, public.chain_requests, public.support_messages,
             public.open_reports, public.chain_request_counts
  to service_role;
grant usage, select on all sequences in schema public to service_role;
