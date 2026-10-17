-- Proves the Community tables (migration 20261016120000_community.sql) are locked down, their constraints work, and deleting an account removes
-- everything of that person. Like user_data.sql: safe to run against ANY database with that migration applied, including production, because
-- everything happens inside one transaction that is rolled back at the end.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/community.sql
-- or paste the whole file into Supabase > SQL Editor and press Run.
-- Every check raises an exception on failure; success prints "ALL COMMUNITY CHECKS PASSED".
begin;

-- Throwaway accounts to attach rows to (rolled back with everything else). c1..c3 are the main cast; d1..d4 prove the edge cases that are allowed.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'selftest-community-1@numbite.invalid'),
  ('00000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'selftest-community-2@numbite.invalid'),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'selftest-community-3@numbite.invalid'),
  ('00000000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', 'selftest-community-d1@numbite.invalid'),
  ('00000000-0000-4000-8000-0000000000d2', 'authenticated', 'authenticated', 'selftest-community-d2@numbite.invalid'),
  ('00000000-0000-4000-8000-0000000000d3', 'authenticated', 'authenticated', 'selftest-community-d3@numbite.invalid'),
  ('00000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'selftest-community-d4@numbite.invalid');

-- 1. The public (anon/authenticated) roles can neither read nor write any Community table, nor the founder view.
do $$
declare r text; t text;
begin
  foreach r in array array['anon','authenticated'] loop
    foreach t in array array['community_profiles','friendships','community_blocks','community_reports','community_lists','community_attempts','open_community_reports'] loop
      begin
        execute format('set local role %I; select count(*) from public.%I', r, t);
        raise exception '% could read %', r, t;
      exception when insufficient_privilege then null;
      end;
      reset role;
    end loop;
    begin
      execute format('set local role %I; insert into public.community_profiles (user_id, username, friend_code) values (%L, %L, %L)',
                     r, '00000000-0000-4000-8000-0000000000c1', 'sneaky', 'ABCDEFGH');
      raise exception '% could write community_profiles', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
    begin
      execute format('set local role %I; insert into public.community_lists (sender, recipient, payload, item_count) values (%L, %L, %L, 1)',
                     r, '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', '1abcdefgh');
      raise exception '% could write community_lists', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
    begin
      execute format('set local role %I; insert into public.community_attempts (user_id, kind) values (%L, %L)', r, '00000000-0000-4000-8000-0000000000c1', 'code');
      raise exception '% could write community_attempts', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
    begin
      execute format('set local role %I; select public.community_lists_before_insert()', r);
      raise exception '% could call a trigger function', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end $$;

-- 2. The server role can write and read every table, and the founder view.
set role service_role;
insert into public.community_profiles (user_id, username, friend_code) values
  ('00000000-0000-4000-8000-0000000000c1', 'alice', 'ABCDEFGH'),
  ('00000000-0000-4000-8000-0000000000c2', 'bob.b', 'JKMNPQRS'),
  ('00000000-0000-4000-8000-0000000000c3', 'carol_3', 'TUVWXYZ2');
insert into public.friendships (requester, addressee, status) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'accepted'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c1', 'pending');
insert into public.community_blocks (blocker, blocked) values
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c3');
insert into public.community_reports (reporter, reported, reporter_username, reported_username, reason, note, list_payload, list_text) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c3', 'alice', 'carol_3', 'abusive_list', 'rude word', '1abcdefgh', 'some words');
insert into public.community_reports (reporter, reported, reason, status, resolved_at) values
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c3', 'spam', 'dismissed', now());
insert into public.community_attempts (user_id, kind, target) values
  ('00000000-0000-4000-8000-0000000000c1', 'code', null),
  ('00000000-0000-4000-8000-0000000000c1', 'send', '00000000-0000-4000-8000-0000000000c2'),
  ('00000000-0000-4000-8000-0000000000c3', 'report', null);
insert into public.community_lists (sender, recipient, payload, item_count) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', '1abcdefgh', 3),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c1', '1abcdefgh', 2),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c3', '1abcdefgh', 1);
reset role;

do $$
declare n bigint;
begin
  set local role service_role;
  select count(*) into n from public.community_profiles where user_id::text like '00000000-0000-4000-8000-0000000000c%';
  if n <> 3 then raise exception 'expected 3 profiles, got %', n; end if;
  select count(*) into n from public.friendships where requester::text like '00000000-0000-4000-8000-0000000000c%';
  if n <> 2 then raise exception 'expected 2 friendships, got %', n; end if;
  select count(*) into n from public.open_community_reports where reporter::text like '00000000-0000-4000-8000-0000000000c%';
  if n <> 1 then raise exception 'the founder view should list exactly the 1 open report, got %', n; end if;
  select count(*) into n from public.open_community_reports where reported_username = 'carol_3' and list_text = 'some words' and reason = 'abusive_list';
  if n <> 1 then raise exception 'the founder view should show the names and the words of the reported list, got % matching rows', n; end if;
  reset role;
end $$;

-- 3. Profiles: constraints reject bad input.
do $$
declare bad text;
begin
  -- usernames: too short, too long, capitals, a leading or trailing dot or underscore, two separators in a row, spaces, symbols, non-ASCII, empty
  foreach bad in array array['ab', 'abcdefghijklmnopqrstu', 'Alice', 'ALICE', '.alice', 'alice.', '_alice', 'alice_', 'ali..ce', 'ali__ce', 'ali._ce', 'ali_.ce',
                             'ali ce', 'alice!', 'ali-ce', 'ali@ce', 'élise', 'alice1é', '', ' alice', 'alice ', E'ali\nce'] loop
    begin
      insert into public.community_profiles (user_id, username, friend_code) values ('00000000-0000-4000-8000-0000000000d1', bad, 'GHJKMNPQ');
      raise exception 'username % accepted', quote_literal(bad);
    exception when check_violation then null;
    end;
  end loop;

  -- friend codes: wrong length, lower case, spaces, hyphens, and the look-alike characters 0 O 1 I L
  foreach bad in array array['ABCDEFG', 'ABCDEFGHJ', 'abcdefgh', 'ABCDEFG0', 'ABCDEFGO', 'ABCDEFG1', 'ABCDEFGI', 'ABCDEFGL', 'ABCD EFG', 'ABCD-EFG', ''] loop
    begin
      insert into public.community_profiles (user_id, username, friend_code) values ('00000000-0000-4000-8000-0000000000d1', 'newname', bad);
      raise exception 'friend code % accepted', quote_literal(bad);
    exception when check_violation then null;
    end;
  end loop;

  -- uniqueness: the same username (capitals are refused, so case can't be used to get round it), the same code, a second profile for one person
  begin insert into public.community_profiles (user_id, username, friend_code) values ('00000000-0000-4000-8000-0000000000d1', 'bob.b', 'GHJKMNPQ'); raise exception 'duplicate username accepted'; exception when unique_violation then null; end;
  begin insert into public.community_profiles (user_id, username, friend_code) values ('00000000-0000-4000-8000-0000000000d1', 'newname', 'ABCDEFGH'); raise exception 'duplicate friend code accepted'; exception when unique_violation then null; end;
  begin insert into public.community_profiles (user_id, username, friend_code) values ('00000000-0000-4000-8000-0000000000c1', 'newname', 'GHJKMNPQ'); raise exception 'a second profile for one person accepted'; exception when unique_violation then null; end;
  begin insert into public.community_profiles (user_id, username, friend_code) values ('00000000-0000-4000-8000-0000000000c9', 'ghost', 'GHJKMNPQ'); raise exception 'profile for a person who does not exist accepted'; exception when foreign_key_violation then null; end;
end $$;

-- the edge cases that ARE allowed: three characters, twenty, digits, a single dot or underscore inside, every character of the code alphabet
insert into public.community_profiles (user_id, username, friend_code) values
  ('00000000-0000-4000-8000-0000000000d1', 'abc', 'GHJKMNPQ'),
  ('00000000-0000-4000-8000-0000000000d2', 'a1.b2_c3', 'RSTUVWXY'),
  ('00000000-0000-4000-8000-0000000000d3', 'abcdefghijklmnopqrst', 'Z2345678'),
  ('00000000-0000-4000-8000-0000000000d4', '007', 'ABCDEFG9');

-- 4. Friendships: not with oneself, only pending, accepted or declined, one row per pair whichever way round, only real people.
do $$
begin
  begin insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1'); raise exception 'friendship with oneself accepted'; exception when check_violation then null; end;
  begin insert into public.friendships (requester, addressee, status) values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2', 'maybe'); raise exception 'unknown status accepted'; exception when check_violation then null; end;
  begin insert into public.friendships (requester, addressee, status) values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d4', 'declined'); raise exception 'a declined request with no time accepted'; exception when check_violation then null; end;
  begin insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2'); raise exception 'duplicate pair (same direction) accepted'; exception when unique_violation then null; end;
  begin insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c1'); raise exception 'duplicate pair (reverse direction) accepted'; exception when unique_violation then null; end;
  begin insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c3'); raise exception 'duplicate pending pair (reverse of a pending request) accepted'; exception when unique_violation then null; end;
  begin insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c9'); raise exception 'friendship with a person who does not exist accepted'; exception when foreign_key_violation then null; end;
end $$;
insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2');   -- an ordinary new pair is fine
insert into public.friendships (requester, addressee, status, answered_at) values ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d4', 'declined', now());   -- a declined request keeps its pair, so it can't be asked again
do $$ begin
  begin insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000d3'); raise exception 'a declined pair was asked again'; exception when unique_violation then null; end;
end $$;

-- 5. Blocks: not oneself, once per direction (both people may block each other), only real people.
do $$
begin
  begin insert into public.community_blocks (blocker, blocked) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1'); raise exception 'block of oneself accepted'; exception when check_violation then null; end;
  begin insert into public.community_blocks (blocker, blocked) values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c3'); raise exception 'duplicate block accepted'; exception when unique_violation then null; end;
  begin insert into public.community_blocks (blocker, blocked) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c9'); raise exception 'block of a person who does not exist accepted'; exception when foreign_key_violation then null; end;
end $$;
insert into public.community_blocks (blocker, blocked) values ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c2');   -- the other direction is a separate block

-- 6. Reports: a reason from the fixed list, a note of at most 500 characters, not about oneself, a status from the list.
do $$
begin
  begin insert into public.community_reports (reporter, reported, reason) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'dislike'); raise exception 'unknown reason accepted'; exception when check_violation then null; end;
  begin insert into public.community_reports (reporter, reported, reason, note) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'other', repeat('n', 501)); raise exception 'note over 500 characters accepted'; exception when check_violation then null; end;
  begin insert into public.community_reports (reporter, reported, reason) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1', 'other'); raise exception 'report about oneself accepted'; exception when check_violation then null; end;
  begin insert into public.community_reports (reporter, reported, reason, status) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'other', 'maybe'); raise exception 'unknown status accepted'; exception when check_violation then null; end;
  begin insert into public.community_reports (reporter, reported, reason, list_payload) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'abusive_list', repeat('a', 6001)); raise exception 'copied list over 6,000 characters accepted'; exception when check_violation then null; end;
  begin insert into public.community_reports (reporter, reported, reason, reported_username) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'other', repeat('u', 21)); raise exception 'username copy over 20 characters accepted'; exception when check_violation then null; end;
  begin insert into public.community_reports (reporter, reported, reason) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c9', 'other'); raise exception 'report about a person who does not exist accepted'; exception when foreign_key_violation then null; end;
end $$;
insert into public.community_reports (reporter, reported, reason, note) values   -- a note of exactly 500 characters is fine
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'harassment', repeat('n', 500));
do $$
begin
  -- one open report per reporter, person and list: a second can't be stacked on the first, but another list, another person or a closed one is fine
  begin insert into public.community_reports (reporter, reported, reason) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'spam'); raise exception 'a second open report on the same person accepted'; exception when unique_violation then null; end;
  insert into public.community_reports (reporter, reported, reason, list_payload) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'abusive_list', '1differentlist');
  begin insert into public.community_reports (reporter, reported, reason, list_payload) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'spam', '1differentlist'); raise exception 'a second open report on the same list accepted'; exception when unique_violation then null; end;
  insert into public.community_reports (reporter, reported, reason, status, resolved_at) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'spam', 'dismissed', now());
  insert into public.community_reports (reporter, reported, reason, status, resolved_at) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', 'spam', 'dismissed', now());
end $$;

-- 7. Lists: a URL-safe code of 8 to 6,000 characters, 1 to 100 lines, never to oneself, expiring after 30 days, unread until opened.
do $$
declare bad text;
begin
  foreach bad in array array['1abcdef', repeat('a', 6001), '1abc+defgh', '1abc/defgh', '1abc=defgh', '1abc defgh', E'1abc\ndefgh', '1abc.defgh', ''] loop
    begin
      insert into public.community_lists (sender, recipient, payload, item_count) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', bad, 1);
      raise exception 'payload % accepted', left(quote_literal(bad), 40);
    exception when check_violation then null;
    end;
  end loop;
  begin insert into public.community_lists (sender, recipient, payload, item_count) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', '1abcdefgh', 0); raise exception 'zero items accepted'; exception when check_violation then null; end;
  begin insert into public.community_lists (sender, recipient, payload, item_count) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', '1abcdefgh', 101); raise exception '101 items accepted'; exception when check_violation then null; end;
  begin insert into public.community_lists (sender, recipient, payload, item_count) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1', '1abcdefgh', 1); raise exception 'list to oneself accepted'; exception when check_violation then null; end;
  begin insert into public.community_lists (sender, recipient, payload, item_count) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', null, 1); raise exception 'list with no payload accepted'; exception when not_null_violation then null; end;
  begin insert into public.community_lists (sender, recipient, payload, item_count) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c9', '1abcdefgh', 1); raise exception 'list to a person who does not exist accepted'; exception when foreign_key_violation then null; end;
end $$;
insert into public.community_lists (sender, recipient, payload, item_count) values   -- the longest payload and the most lines are allowed
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', repeat('a', 6000), 100);
do $$
declare n bigint;
begin
  select count(*) into n from public.community_lists
    where sender = '00000000-0000-4000-8000-0000000000c1' and recipient = '00000000-0000-4000-8000-0000000000c2' and read_at is null and expires_at - created_at = interval '30 days';
  if n <> 2 then raise exception 'new lists should be unread and expire 30 days after they were sent, got % such rows', n; end if;
end $$;

-- 7b. Tallies: only the three kinds, and they go with the account.
do $$
begin
  begin insert into public.community_attempts (user_id, kind) values ('00000000-0000-4000-8000-0000000000c1', 'login'); raise exception 'unknown attempt kind accepted'; exception when check_violation then null; end;
  begin insert into public.community_attempts (user_id, kind) values ('00000000-0000-4000-8000-0000000000c9', 'code'); raise exception 'attempt for a person who does not exist accepted'; exception when foreign_key_violation then null; end;
  begin insert into public.community_attempts (user_id, kind, target) values ('00000000-0000-4000-8000-0000000000c1', 'send', '00000000-0000-4000-8000-0000000000c9'); raise exception 'attempt aimed at a person who does not exist accepted'; exception when foreign_key_violation then null; end;
end $$;

-- 7c. The caps that must hold under a race (triggers). Numbers match web/lib/community/limits.ts.
-- (a) an inbox holds at most 50 unread lists; opened ones and expired ones do not count.
insert into auth.users (id, aud, role, email) select ('00000000-0000-4000-8000-00000001' || lpad(to_hex(g), 4, '0'))::uuid, 'authenticated', 'authenticated', 'selftest-cap-' || g || '@numbite.invalid' from generate_series(1, 260) g;
do $$
declare v_inbox constant uuid := '00000000-0000-4000-8000-0000000000d1'; v_sender constant uuid := '00000000-0000-4000-8000-0000000000d2';
begin
  insert into public.community_lists (sender, recipient, payload, item_count, expires_at)
    select v_sender, v_inbox, '1abcdefgh', 1, now() - interval '1 day' from generate_series(1, 5);          -- expired: not counted
  insert into public.community_lists (sender, recipient, payload, item_count, read_at)
    select v_sender, v_inbox, '1abcdefgh', 1, now() from generate_series(1, 5);                              -- opened: not counted
  insert into public.community_lists (sender, recipient, payload, item_count) select v_sender, v_inbox, '1abcdefgh', 1 from generate_series(1, 50);   -- exactly 50 unread: allowed
  begin
    insert into public.community_lists (sender, recipient, payload, item_count) values (v_sender, v_inbox, '1abcdefgh', 1);
    raise exception 'the 51st unread list was accepted';
  exception when check_violation then
    if sqlerrm <> 'community_inbox_full' then raise exception 'wrong error for a full inbox: %', sqlerrm; end if;
  end;
  update public.community_lists set read_at = now() where id = (select id from public.community_lists where recipient = v_inbox and read_at is null and expires_at > now() limit 1);
  insert into public.community_lists (sender, recipient, payload, item_count) values (v_sender, v_inbox, '1abcdefgh', 1);   -- one was opened, so there is room again
  -- somebody else's inbox is separate
  insert into public.community_lists (sender, recipient, payload, item_count) values (v_sender, '00000000-0000-4000-8000-0000000000d3', '1abcdefgh', 1);
end $$;

-- (b) at most 100 friend requests waiting for one person; answered ones do not count.
do $$
declare target constant uuid := '00000000-0000-4000-8000-0000000000d4'; n bigint;
begin
  insert into public.friendships (requester, addressee) select ('00000000-0000-4000-8000-00000001' || lpad(to_hex(g), 4, '0'))::uuid, target from generate_series(1, 100) g;   -- exactly 100: allowed
  begin
    insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000c2', target);
    raise exception 'the 101st waiting request was accepted';
  exception when check_violation then
    if sqlerrm <> 'community_requests_full' then raise exception 'wrong error for a full request pile: %', sqlerrm; end if;
  end;
  update public.friendships set status = 'declined', answered_at = now() where addressee = target and requester = '00000000-0000-4000-8000-000000010001';
  insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000c2', target);   -- one was answered, so there is room again
  -- a person with no pile is not held up by this one
  insert into public.friendships (requester, addressee) values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d2');
end $$;

-- (c) at most 200 friends; the answer that would make it 201 for EITHER person is refused. A request is allowed to wait while someone is full.
insert into auth.users (id, aud, role, email) select ('00000000-0000-4000-8000-00000002' || lpad(to_hex(g), 4, '0'))::uuid, 'authenticated', 'authenticated', 'selftest-friend-' || g || '@numbite.invalid' from generate_series(1, 200) g;
do $$
declare full_one constant uuid := '00000000-0000-4000-8000-0000000000d3'; other constant uuid := '00000000-0000-4000-8000-0000000000d2';
begin
  insert into public.friendships (requester, addressee, status) select full_one, ('00000000-0000-4000-8000-00000002' || lpad(to_hex(g), 4, '0'))::uuid, 'accepted' from generate_series(1, 200) g;   -- 200 friends
  insert into public.friendships (requester, addressee) values (other, full_one);       -- the 201st person may ask
  begin
    update public.friendships set status = 'accepted' where requester = other and addressee = full_one;
    raise exception 'a 201st friend was accepted';
  exception when check_violation then
    if sqlerrm <> 'community_friends_full' then raise exception 'wrong error for a full friend list: %', sqlerrm; end if;
  end;
  delete from public.friendships where status = 'accepted' and requester = full_one and addressee = '00000000-0000-4000-8000-000000020001';
  update public.friendships set status = 'accepted' where requester = other and addressee = full_one;   -- one was removed, so there is room again
  -- the cap is checked for the person who asked as well: another full person can't be the one who gets the answer either
  insert into public.friendships (requester, addressee) values (full_one, '00000000-0000-4000-8000-000000020001');
  begin
    update public.friendships set status = 'accepted' where requester = full_one and addressee = '00000000-0000-4000-8000-000000020001';
    raise exception 'a 201st friend was accepted for the person who asked';
  exception when check_violation then null; end;
end $$;

-- 8. Deleting an account removes everything of that person and nothing of anyone else, EXCEPT reports (kept, with the person's id emptied).
delete from auth.users where id = '00000000-0000-4000-8000-0000000000c3';
do $$
declare n bigint; me constant uuid := '00000000-0000-4000-8000-0000000000c3';
begin
  select count(*) into n from public.community_profiles where user_id = me;
  if n <> 0 then raise exception 'deleting the account left % profile rows', n; end if;
  select count(*) into n from public.friendships where requester = me or addressee = me;
  if n <> 0 then raise exception 'deleting the account left % friendship rows', n; end if;
  select count(*) into n from public.community_blocks where blocker = me or blocked = me;
  if n <> 0 then raise exception 'deleting the account left % block rows', n; end if;
  select count(*) into n from public.community_reports where reporter = me or reported = me;
  if n <> 0 then raise exception 'a report still names the deleted account, got %', n; end if;
  select count(*) into n from public.community_reports where reported_username = 'carol_3' and list_text = 'some words' and reporter_username = 'alice' and reported is null and reporter is not null and status = 'open';
  if n <> 1 then raise exception 'the report about the deleted account should stay, readable, with the person emptied, got % rows', n; end if;
  select count(*) into n from public.community_reports where reporter is null and reported is null;
  if n <> 0 then raise exception 'no report should have lost both people yet, got %', n; end if;
  select count(*) into n from public.community_lists where sender = me or recipient = me;
  if n <> 0 then raise exception 'deleting the account left % list rows', n; end if;
  select count(*) into n from public.community_attempts where user_id = me or target = me;
  if n <> 0 then raise exception 'deleting the account left % tally rows', n; end if;
  -- everyone else's rows are untouched
  select count(*) into n from public.community_profiles where user_id::text like '00000000-0000-4000-8000-0000000000%';
  if n <> 6 then raise exception 'expected the other 6 profiles to remain, got %', n; end if;
  select count(*) into n from public.community_attempts where user_id = '00000000-0000-4000-8000-0000000000c1';
  if n <> 2 then raise exception 'someone else''s tally rows should remain, got %', n; end if;
  select count(*) into n from public.friendships where requester = '00000000-0000-4000-8000-0000000000c1' and addressee = '00000000-0000-4000-8000-0000000000c2';
  if n <> 1 then raise exception 'the friendship between two other people should remain'; end if;
  select count(*) into n from public.community_lists where sender = '00000000-0000-4000-8000-0000000000c1' and recipient = '00000000-0000-4000-8000-0000000000c2';
  if n <> 2 then raise exception 'lists between two other people should remain, got %', n; end if;
end $$;

-- the person who sent and received is removed too: one more account, everything of theirs goes
delete from auth.users where id = '00000000-0000-4000-8000-0000000000c1';
do $$
declare n bigint; me constant uuid := '00000000-0000-4000-8000-0000000000c1';
begin
  select count(*) into n from (
    select user_id from public.community_profiles where user_id = me
    union all select id from public.friendships where requester = me or addressee = me
    union all select id from public.community_blocks where blocker = me or blocked = me
    union all select id from public.community_reports where reporter = me or reported = me
    union all select id from public.community_attempts where user_id = me or target = me
    union all select id from public.community_lists where sender = me or recipient = me) x;
  if n <> 0 then raise exception 'deleting the second account left % rows behind', n; end if;
  -- reports are kept: the reports alice made are still readable, with her id emptied
  select count(*) into n from public.community_reports where reporter_username = 'alice' and reporter is null;
  if n <> 1 then raise exception 'the report alice made should stay with her id emptied, got %', n; end if;
  select count(*) into n from public.community_reports where reporter is null and reported is null;
  if n <> 1 then raise exception 'the report that lost both people should stay, got %', n; end if;
  select count(*) into n from public.community_profiles where user_id = '00000000-0000-4000-8000-0000000000c2';
  if n <> 1 then raise exception 'a person who is still here lost their profile'; end if;
end $$;

rollback;  -- undo the throwaway accounts and every test row
select 'ALL COMMUNITY CHECKS PASSED' as result;  -- only reached if no check raised an error
