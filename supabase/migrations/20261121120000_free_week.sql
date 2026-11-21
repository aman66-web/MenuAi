-- The free week and gifts of Premium (founder's decision of 20 November 2026; web/lib/payments/freeWeek.ts, POST /api/v1/entitlement/account).
--
-- What this adds, and ONLY this: two tables. Nothing is touched in the tables that already exist.
--
--   trial_claims   one row per email address or Sign in with Apple ID that has had the free week: a KEYED ONE-WAY HASH of it (HMAC-SHA256 with the server-only
--                  secret FREE_WEEK_HASH_SECRET; the address or ID itself is never stored and can't be worked out from the hash), whether it was an email or an
--                  Apple ID, and when the free week started and ends. It has no link to the account, so deleting an account leaves it in place: that is its one
--                  purpose (the same person signing up again gets no second free week). It is used for nothing else.
--   premium_gifts  Premium the founder gives an account by hand: the account, until when (empty = no end), a note for the founder, when it was given. Deleted
--                  with the account (on delete cascade).
--
-- Same security model as every other table (docs/BACKEND.md): the app and the website never talk to Supabase directly; only the Vercel API does, with the
-- server-only secret key; RLS is on with NO policies and anon/authenticated privileges are revoked, so the publishable key can read or write nothing.
--
-- NOT applied by Claude: you read it, then run it in the Supabase SQL Editor (never `supabase db push`). Until then the route answers 500 and the app changes
-- nothing (no free week; the paywall as before).

create table public.trial_claims (
  key_hash    text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  kind        text not null check (kind in ('email', 'apple')),
  claimed_at  timestamptz not null default now(),
  ends_at     timestamptz not null,
  constraint trial_claims_dates check (ends_at >= claimed_at)
);
comment on table public.trial_claims is 'Free week had: a keyed one-way hash of the email or Apple ID (never the address), kept after the account is deleted only to stop a second free week. Written only by the API.';

alter table public.trial_claims enable row level security;
revoke all on public.trial_claims from anon, authenticated;
grant all on public.trial_claims to service_role;

create table public.premium_gifts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  until       timestamptz,
  note        text check (note is null or char_length(note) <= 500),
  granted_at  timestamptz not null default now()
);
comment on table public.premium_gifts is 'Premium given by hand to an account, until a date (empty = no end). Deleted with the account. Read only by the API.';

alter table public.premium_gifts enable row level security;
revoke all on public.premium_gifts from anon, authenticated;
grant all on public.premium_gifts to service_role;

-- How to give Premium to someone by their email (they must have signed in once, so the account exists; 0 rows inserted = no account with that address).
-- Run in the Supabase SQL Editor; the app picks it up the next time it is opened or comes back to the front (no new build).
--
--   insert into public.premium_gifts (user_id, until, note)
--   select id, now() + interval '3 months', 'Tester'          -- or null for no end
--     from auth.users where lower(email) = lower('someone@example.com')
--   on conflict (user_id) do update set until = excluded.until, note = excluded.note, granted_at = now();
--
-- How to take it away (it stops on their phone the next time the app asks, and at the latest 30 days later):
--
--   delete from public.premium_gifts
--    where user_id in (select id from auth.users where lower(email) = lower('someone@example.com'));
--
-- Who has a gift:
--
--   select u.email, g.until, g.note, g.granted_at from public.premium_gifts g join auth.users u on u.id = g.user_id order by g.granted_at desc;
