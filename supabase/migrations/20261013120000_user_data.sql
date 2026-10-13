-- Sign-in and sync across devices (docs/ACCOUNTS_SYNC.md): one new table.
--
-- Accounts themselves are Supabase Auth (auth.users). This table holds what a signed-in person chose to sync, one row per
-- (person, store): the store name ("settings", "saved", "shopping"...) and its JSON value as the website and the app wrote it.
--
-- Same security model as every other table (docs/BACKEND.md):
--   * the app and the website NEVER talk to Supabase directly; only the Vercel API does, with the server-only secret key,
--     and it checks the caller's session before it reads or writes a row for that person;
--   * RLS is on with NO policies and anon/authenticated privileges are revoked, so the publishable key can read or write nothing;
--   * "Delete my account" removes the auth user, and ON DELETE CASCADE removes every synced row in the same step.

create table public.user_data (
  user_id     uuid not null references auth.users (id) on delete cascade,
  store       text not null
              check (store in ('settings','favorites','saved','log','shopping','savedRecipes','myRecipes','cupboard','compare')),
  value       jsonb not null check (octet_length(value::text) <= 1048576),   -- 1 MB per store
  updated_at  timestamptz not null default now(),
  primary key (user_id, store)
);
comment on table public.user_data is 'What a signed-in person syncs across their devices (one JSON value per store). Written only by the API.';

alter table public.user_data enable row level security;
revoke all on public.user_data from anon, authenticated;
grant all on public.user_data to service_role;
