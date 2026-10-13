-- Proves the sign-in and sync table (migration 20261013120000_user_data.sql) is locked down and its constraints work.
-- Like security_and_constraints.sql: safe to run against ANY database with that migration applied, including production,
-- because everything happens inside one transaction that is rolled back at the end.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/user_data.sql
-- or paste the whole file into Supabase › SQL Editor and press Run.
-- Every check raises an exception on failure; success prints "ALL USER_DATA CHECKS PASSED".
begin;

-- A throwaway account to attach rows to (rolled back with everything else).
insert into auth.users (id, aud, role, email)
  values ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'selftest-sync@numbite.invalid');

-- 1. The public (anon/authenticated) roles can neither read nor write.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    begin
      execute format('set local role %I; select count(*) from public.user_data', r);
      raise exception '% could read user_data', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
    begin
      execute format('set local role %I; insert into public.user_data (user_id, store, value) values (%L, %L, %L)',
                     r, '00000000-0000-4000-8000-000000000001', 'settings', '{}');
      raise exception '% could write user_data', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end $$;

-- 2. The server role can write and read a row, and replace it by (person, store).
set role service_role;
insert into public.user_data (user_id, store, value)
  values ('00000000-0000-4000-8000-000000000001', 'settings', '{"v":{"goal":"maintain"},"t":1}');
insert into public.user_data (user_id, store, value)
  values ('00000000-0000-4000-8000-000000000001', 'settings', '{"v":{"goal":"lose"},"t":2}')
  on conflict (user_id, store) do update set value = excluded.value, updated_at = now();
reset role;

do $$
declare n bigint; goal text;
begin
  select count(*), max(value #>> '{v,goal}') into n, goal from public.user_data where user_id = '00000000-0000-4000-8000-000000000001';
  if n <> 1 or goal <> 'lose' then raise exception 'expected one replaced settings row (lose), got % rows, goal %', n, goal; end if;
end $$;

-- 3. Constraints reject bad input.
do $$
begin
  begin insert into public.user_data (user_id, store, value) values ('00000000-0000-4000-8000-000000000001', 'password', '{}'); raise exception 'unknown store accepted'; exception when check_violation then null; end;
  begin insert into public.user_data (user_id, store, value) values ('00000000-0000-4000-8000-000000000001', 'log', jsonb_build_object('x', repeat('a', 1048577))); raise exception 'value over 1 MB accepted'; exception when check_violation then null; end;
  begin insert into public.user_data (user_id, store, value) values ('00000000-0000-4000-8000-000000000002', 'log', '{}'); raise exception 'row for a person who does not exist accepted'; exception when foreign_key_violation then null; end;
  begin insert into public.user_data (user_id, store, value) values ('00000000-0000-4000-8000-000000000001', 'settings', '{}'); raise exception 'duplicate (person, store) accepted'; exception when unique_violation then null; end;
end $$;

-- 4. Deleting the account removes every synced row with it.
insert into public.user_data (user_id, store, value) values ('00000000-0000-4000-8000-000000000001', 'saved', '[]');
delete from auth.users where id = '00000000-0000-4000-8000-000000000001';
do $$
declare n bigint;
begin
  select count(*) into n from public.user_data where user_id = '00000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'deleting the account left % synced rows behind', n; end if;
end $$;

rollback;  -- undo the throwaway account and every test row
select 'ALL USER_DATA CHECKS PASSED' as result;  -- only reached if no check raised an error
