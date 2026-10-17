-- Community: friends, and shopping lists sent to a friend (docs/BACKEND.md "Community").
--
-- What this adds, and ONLY this: six tables, one view and three small trigger functions. Nothing is touched in the tables that already exist.
--
--   community_profiles  a person's chosen username and friend code (one row per person who joined Community)
--   friendships         a friend request (pending), a friendship (accepted) or a declined request (kept 30 days); one row per pair, whichever way it was asked
--   community_blocks    who blocked whom
--   community_reports   reports of a username or of a shopping list; YOU read this table (the view below lists the open ones)
--   community_lists     a shopping list one friend sent another: it waits in the recipient's Community inbox for 30 days
--   community_attempts  a tally of friend-code tries, sends and reports, so the daily limits hold across server restarts and can't be refunded by deleting a row
--   open_community_reports (view)  the open reports, oldest first, with the names written out
--   triggers            the three caps that must hold even when requests arrive at the same moment (50 unread lists, 100 waiting requests, 200 friends)
--
-- Same security model as every other table (docs/BACKEND.md, and user_data in 20261013120000_user_data.sql):
--   * the app and the website NEVER talk to Supabase directly; only the Vercel API does, with the server-only secret key, and it checks
--     the caller's session before it reads or writes anything, and only ever for rows the caller is a party to;
--   * RLS is on with NO policies and anon/authenticated privileges are revoked, so the publishable key can read or write nothing;
--   * every reference to auth.users is ON DELETE CASCADE, so "Delete my account" removes the person's profile, friendships, blocks, lists
--     (sent or received) and tallies in the same step, with no new code. REPORTS are the one exception: they are kept (the person's id is
--     emptied, the copied usernames and words stay) so that deleting an account can't destroy the evidence of what the person did.
--
-- Nothing here is synced: Community data is not in user_data and never enters the sync stores (docs/ACCOUNTS_SYNC.md).
-- No email address is stored here or shown to anyone: other people see only a username.

-- ---------------------------------------------------------------------------------------------------- profiles
-- The username is chosen once, 3 to 20 characters of a-z 0-9 _ . and stored lower case, so a plain unique constraint is already
-- case-insensitive (the check refuses capitals) and no extension is needed. It starts and ends with a letter or digit and never has
-- two dots or underscores in a row. The reserved-word and bad-word rules live in the API (lib/community/username.ts), not here.
-- The friend code is 8 characters from an alphabet with no look-alikes (A-Z without I L O, and 2-9).
create table public.community_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  username     text not null,
  friend_code  text not null,
  created_at   timestamptz not null default now(),
  constraint community_profiles_username_key unique (username),
  constraint community_profiles_friend_code_key unique (friend_code),
  constraint community_profiles_username_format check (
    char_length(username) between 3 and 20
    and username ~ '^[a-z0-9]([a-z0-9_.]*[a-z0-9])?$'
    and username !~ '[._]{2}'
  ),
  constraint community_profiles_friend_code_format check (friend_code ~ '^[A-HJKMNP-Z2-9]{8}$')
);
comment on table public.community_profiles is 'Community: a person''s username and friend code. Written only by the API. No email is stored here.';

-- ---------------------------------------------------------------------------------------------------- friendships
-- requester asked, addressee answers. One row per pair in either direction (the unique index on the sorted pair), never with oneself.
-- Removing a friend or taking a request back deletes the row. DECLINING keeps it, as 'declined', for 30 days (the daily cron deletes it): while it
-- exists the same person can't ask again, so a declined request can't be re-sent at once. It is never shown to anyone.
create table public.friendships (
  id          uuid primary key default gen_random_uuid(),
  requester   uuid not null references auth.users (id) on delete cascade,
  addressee   uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz,   -- when it was declined
  constraint friendships_not_self check (requester <> addressee),
  constraint friendships_declined_has_time check (status <> 'declined' or answered_at is not null)
);
create unique index friendships_pair_key on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_requester_idx on public.friendships (requester, created_at);   -- "my requests today", "my friends"
create index friendships_addressee_idx on public.friendships (addressee, status);       -- "requests waiting for me", "my friends"
create index friendships_declined_idx on public.friendships (answered_at) where status = 'declined';   -- the daily clean-up
comment on table public.friendships is 'Community: friend requests (pending), friendships (accepted) and declined requests (kept 30 days). Written only by the API.';

-- ---------------------------------------------------------------------------------------------------- blocks
create table public.community_blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker     uuid not null references auth.users (id) on delete cascade,
  blocked     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint community_blocks_not_self check (blocker <> blocked),
  constraint community_blocks_pair_key unique (blocker, blocked)
);
create index community_blocks_blocked_idx on public.community_blocks (blocked);
comment on table public.community_blocks is 'Community: who blocked whom (hides both ways). Written only by the API.';

-- ---------------------------------------------------------------------------------------------------- reports
-- A report names a person (and, when a shopping list is reported, copies what that list said, because the list itself is deleted when the
-- reporter blocks or after 30 days). The usernames are copied too so the table reads without joins. YOU read this table: Table Editor
-- > open_community_reports (docs/BACKEND.md "Your weekly routine"). status is yours to change: open, then actioned or dismissed.
-- The two people are ON DELETE SET NULL, not CASCADE: if the reported person deletes their account (or you remove them), the report stays, readable
-- from the copied usernames and words, so deleting an account can't be used to destroy the evidence. The daily cron deletes a report that is no longer
-- open a year after it was made. One open report per reporter, person and list: a second one can't be stacked on top of it.
create table public.community_reports (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  reporter           uuid references auth.users (id) on delete set null,
  reported           uuid references auth.users (id) on delete set null,
  reporter_username  text check (char_length(reporter_username) <= 20),
  reported_username  text check (char_length(reported_username) <= 20),
  reason             text not null
                     check (reason in ('abusive_username','abusive_list','spam','harassment','impersonation','other')),
  note               text check (char_length(note) <= 500),
  list_payload       text check (char_length(list_payload) <= 6000),   -- the reported list, as sent (only when a list was reported)
  list_text          text check (char_length(list_text) <= 2000),      -- the words typed into that list, readable
  status             text not null default 'open' check (status in ('open','actioned','dismissed')),
  resolved_at        timestamptz,
  founder_note       text,
  constraint community_reports_not_self check (reporter <> reported)
);
create unique index community_reports_open_once on public.community_reports (reporter, reported, md5(coalesce(list_payload, ''))) where status = 'open';
create index community_reports_open_idx on public.community_reports (created_at) where status = 'open';
create index community_reports_closed_idx on public.community_reports (created_at) where status <> 'open';   -- the daily clean-up
create index community_reports_reporter_idx on public.community_reports (reporter);
create index community_reports_reported_idx on public.community_reports (reported);
comment on table public.community_reports is 'Community: reports of a username or a shopping list. The founder reads this and acts on it. Kept if either account is deleted.';

-- ---------------------------------------------------------------------------------------------------- lists in the inbox
-- payload is the share-link code of lib/mm/shareList.ts, re-written by the API from a checked copy (references only: shop ids, barcodes and
-- typed words; never a price). It is URL-safe base64 text, at most 6,000 characters, at most 100 lines.
create table public.community_lists (
  id          uuid primary key default gen_random_uuid(),
  sender      uuid not null references auth.users (id) on delete cascade,
  recipient   uuid not null references auth.users (id) on delete cascade,
  payload     text not null check (char_length(payload) between 8 and 6000 and payload ~ '^[A-Za-z0-9_-]+$'),
  item_count  integer not null check (item_count between 1 and 100),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  expires_at  timestamptz not null default now() + interval '30 days',
  constraint community_lists_not_self check (sender <> recipient)
);
create index community_lists_inbox_idx on public.community_lists (recipient, created_at desc);   -- the inbox, newest first
create index community_lists_sender_idx on public.community_lists (sender);                     -- deleting an account
create index community_lists_expiry_idx on public.community_lists (expires_at);                  -- the daily clean-up
comment on table public.community_lists is 'Community: a shopping list sent to a friend; waits in their inbox for 30 days (the daily cron deletes expired rows).';

-- ---------------------------------------------------------------------------------------------------- tallies for the daily limits
-- One row per friend-code try, shopping list sent and report made. The API counts the last 24 hours of a person's rows to decide whether to say "you've reached
-- today's limit". It has to be a table of its own: the limits used to be counted from friendships and lists, but the person can delete those rows (take a request
-- back, a friend deletes a list), which gave the budget back. A tally row is never deleted by anyone but the daily cron (after 2 days) or the account's deletion.
-- `target` is the friend a list was sent to (so the cap of 10 lists a day to one friend doesn't depend on whether that friend read or deleted them).
create table public.community_attempts (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null check (kind in ('code','send','report')),
  target   uuid references auth.users (id) on delete cascade,
  at       timestamptz not null default now()
);
create index community_attempts_user_idx on public.community_attempts (user_id, kind, at);
create index community_attempts_target_idx on public.community_attempts (target);        -- deleting an account
create index community_attempts_at_idx on public.community_attempts (at);                -- the daily clean-up
comment on table public.community_attempts is 'Community: tally of friend-code tries, sends and reports for the daily limits. Written only by the API; the daily cron deletes rows older than 2 days.';

-- ---------------------------------------------------------------------------------------------------- caps that must hold under a race
-- The API checks these first (and says something kind), but two requests can arrive at the same moment and both pass a check-then-insert. These triggers
-- take a lock for the person whose number is being counted, count, and refuse (check_violation, a message the API recognises). The numbers match
-- web/lib/community/limits.ts: MAX_UNREAD 50, MAX_PENDING_IN 100, MAX_FRIENDS 200.
create function public.community_lists_before_insert() returns trigger
language plpgsql set search_path = '' as $$
declare unread bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.recipient::text, 0));
  select count(*) into unread from public.community_lists where recipient = new.recipient and read_at is null and expires_at > now();
  if unread >= 50 then
    raise exception 'community_inbox_full' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger community_lists_cap before insert on public.community_lists
  for each row execute function public.community_lists_before_insert();

create function public.friendships_before_insert() returns trigger
language plpgsql set search_path = '' as $$
declare waiting bigint;
begin
  if new.status = 'pending' then
    perform pg_advisory_xact_lock(hashtextextended(new.addressee::text, 0));
    select count(*) into waiting from public.friendships where addressee = new.addressee and status = 'pending';
    if waiting >= 100 then
      raise exception 'community_requests_full' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger friendships_cap_requests before insert on public.friendships
  for each row execute function public.friendships_before_insert();

create function public.friendships_before_accept() returns trigger
language plpgsql set search_path = '' as $$
declare person uuid; friends bigint;
begin
  -- both people's locks, always the smaller id first, so two answers at once can't wait on each other
  perform pg_advisory_xact_lock(hashtextextended(least(new.requester, new.addressee)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(new.requester, new.addressee)::text, 0));
  foreach person in array array[new.requester, new.addressee] loop
    select count(*) into friends from public.friendships where status = 'accepted' and (requester = person or addressee = person);
    if friends >= 200 then
      raise exception 'community_friends_full' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;
create trigger friendships_cap_friends before update of status on public.friendships
  for each row when (old.status is distinct from 'accepted' and new.status = 'accepted')
  execute function public.friendships_before_accept();

revoke execute on function public.community_lists_before_insert(), public.friendships_before_insert(), public.friendships_before_accept()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------- founder view
create view public.open_community_reports with (security_invoker = true) as
  select id, created_at, reporter_username, reported_username, reason, note, list_text,
         round(extract(epoch from now() - created_at) / 3600) as hours_open,
         reporter, reported, list_payload
  from public.community_reports
  where status = 'open'
  order by created_at;

-- ---------------------------------------------------------------------------------------------------- lock everything down
alter table public.community_profiles enable row level security;
alter table public.friendships        enable row level security;
alter table public.community_blocks   enable row level security;
alter table public.community_reports  enable row level security;
alter table public.community_lists    enable row level security;
alter table public.community_attempts enable row level security;

revoke all on public.community_profiles, public.friendships, public.community_blocks, public.community_reports,
              public.community_lists, public.community_attempts, public.open_community_reports
  from anon, authenticated;

grant all on public.community_profiles, public.friendships, public.community_blocks, public.community_reports,
             public.community_lists, public.community_attempts, public.open_community_reports
  to service_role;
