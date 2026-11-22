-- Android phones in the free-week claims (founder, 22 November 2026: stop a second free week on the same Android phone, as DeviceCheck does on an iPhone).
-- trial_claims.kind may now also be 'android': key_hash is then a keyed hash (HMAC-SHA256 with the server's secret) of the app's SHA-256 of the phone's Android ID,
-- never the Android ID itself, and, like the email and Apple ID hashes, it is kept after the account is deleted only to stop a second free week.
-- Safe to run at any time and more than once. Until it is run the server still works: it just doesn't remember Android phones (lib/payments/freeWeek.ts insertKeys).

alter table public.trial_claims drop constraint if exists trial_claims_kind_check;
alter table public.trial_claims add constraint trial_claims_kind_check check (kind in ('email', 'apple', 'android'));
