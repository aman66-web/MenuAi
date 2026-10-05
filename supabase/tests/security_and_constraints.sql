-- Proves the database is locked down and the constraints work.
-- Safe to run against ANY database with the migrations applied, including production:
-- everything happens inside one transaction that is rolled back at the end.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_and_constraints.sql
-- or paste the whole file into Supabase › SQL Editor and press Run.
-- Every check raises an exception on failure; success prints "ALL CHECKS PASSED".
begin;

-- 1. The public (anon/authenticated) roles can neither read nor write anything.
do $$
declare t text;
begin
  foreach t in array array['waitlist','number_reports','chain_requests','support_messages','open_reports','chain_request_counts'] loop
    begin
      execute format('set local role anon; select count(*) from public.%I', t);
      raise exception 'anon could read %', t;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  begin
    set local role anon;
    insert into public.waitlist (email) values ('a@b.co');
    raise exception 'anon could insert into waitlist';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $$;

-- 2. The server role can write valid rows.
set role service_role;
insert into public.waitlist (email, source) values ('selftest@menumacros.invalid', 'selftest');
insert into public.number_reports (chain_id, item_id, field, shown_value, reported_value, note, data_version, app_version)
  values ('bowl-and-co', 'chicken-bowl', 'calories', 655, 640, 'selftest: board says 640', 20261004192220, '1.0 (12)');
insert into public.chain_requests (name) values ('  ZZ Selftest   Chain '), ('zz selftest chain'), ('Other selftest');
insert into public.support_messages (email, message, source) values ('selftest@menumacros.invalid', 'selftest message', 'web');
reset role;

-- 3. Constraints reject bad input.
do $$
begin
  begin insert into public.waitlist (email) values ('Not-Lower@Example.com'); raise exception 'uppercase email accepted'; exception when check_violation then null; end;
  begin insert into public.waitlist (email) values ('no-at-sign'); raise exception 'bad email accepted'; exception when check_violation then null; end;
  begin insert into public.waitlist (email) values ('selftest@menumacros.invalid'); raise exception 'duplicate email accepted'; exception when unique_violation then null; end;
  begin insert into public.number_reports (chain_id, item_id, field) values ('Bowl & Co', 'x', 'calories'); raise exception 'bad chain id accepted'; exception when check_violation then null; end;
  begin insert into public.number_reports (chain_id, item_id, field) values ('a', 'b', 'vibes'); raise exception 'bad field accepted'; exception when check_violation then null; end;
  begin insert into public.number_reports (chain_id, item_id, field, reported_value) values ('a', 'b', 'fat', -1); raise exception 'negative value accepted'; exception when check_violation then null; end;
  begin insert into public.chain_requests (name) values (' x '); raise exception 'too-short request accepted'; exception when check_violation then null; end;
  begin insert into public.support_messages (message) values ('hi'); raise exception 'too-short message accepted'; exception when check_violation then null; end;
end $$;

-- 4. Views work and normalise chain names.
do $$
declare n bigint;
begin
  select requests into n from public.chain_request_counts where chain = 'zz selftest chain';
  if n is distinct from 2 then raise exception 'expected 2 votes for zz selftest chain, got %', n; end if;
  select count(*) into n from public.open_reports where note like 'selftest:%';
  if n <> 1 then raise exception 'expected 1 open selftest report, got %', n; end if;
end $$;

rollback;  -- undo every test row
select 'ALL CHECKS PASSED' as result;  -- only reached if no check raised an error
