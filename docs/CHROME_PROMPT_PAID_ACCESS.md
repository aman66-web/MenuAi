# Claude in Chrome: database change + Stripe prices and webhook for paid access (paste everything below the line)

HOW TO USE: open Chrome, be logged in to GitHub, Supabase, Stripe and Vercel, open Claude in Chrome and paste EVERYTHING below the line as one message.
Run it first with `MODE = TEST` (Stripe's Test mode). When Claude Code tells you it is time to go live, run Part B again with `MODE = LIVE` (Part A is only done once).
It never reads, types or shows a secret: YOU copy the Stripe secret key, the webhook signing secret and the private key into Vercel yourself (docs/PAID_ACCESS_GO_LIVE.md).

--------------------------------------------------------------------------------------------------------------

MODE = TEST

You are helping the founder of Numbite (a UK calories and protein app). Work in this browser, in NEW tabs, one step at a time. I am already logged in to GitHub, Supabase, Stripe and Vercel. Do ONLY what is written here.

GROUND RULES
- Never reveal, copy, type or screenshot a secret value: Stripe "Secret key" (sk_...), "Restricted keys", webhook "Signing secret" (whsec_...), Supabase keys, Vercel variable values. Never click "Reveal", "Show", "Roll" or "Copy" on any of them. Price ids (price_...) and product names are fine.
- Change only what a step says. Delete nothing. Run no SQL except what Part A names. No "db push", "reset", "pause", "restore" or "delete" button anywhere.
- If anything shows an error, a CAPTCHA, a login or identity-check prompt, a payment or agreement prompt, or a warning you did not expect, STOP, copy the exact words, and tell me. Do not try to get round it.
- Supabase: project `menumacros` (organisation "Aman's Org", ref `rbbalkfkpacazzhsqfzz`, us-east-1). If it has another name or ref, STOP.
- Stripe: look at the Test mode / Live mode switch (top of the dashboard) before every step and make sure it matches MODE. If it does not, STOP and tell me.

PART A: THE DATABASE CHANGE (once)
1. Open https://supabase.com/dashboard/project/rbbalkfkpacazzhsqfzz/editor and look at the tables in the `public` schema. If a table called `pro_entitlements` already exists, the change was applied before: skip to step 5. Otherwise carry on.
2. Open https://github.com/aman66-web/MenuAi/blob/main/supabase/migrations/20261113120000_pro_entitlements.sql (my private repository; I am logged in). Use the "Copy raw file" button (two-squares icon). Do not retype it. The first line is a comment "Paid access: who has paid, for what, until when".
3. Open https://supabase.com/dashboard/project/rbbalkfkpacazzhsqfzz/sql/new, clear the editor, paste, check the file's last line is `comment on view public.creator_sales ...;`, and click Run.
   EXPECTED: "Success. No rows returned". Anything else: STOP and copy the message to me.
4. In the Table Editor, refresh. Check `pro_entitlements` exists and is labelled RLS enabled, and that a view `creator_sales` exists.
5. Open a NEW query and run exactly this read-only check, then tell me the two results:
   select (select count(*) from public.pro_entitlements) as rows_in_table, (select relrowsecurity from pg_class where oid = 'public.pro_entitlements'::regclass) as rls_on;
   EXPECTED: rows_in_table = 0 (or the number of real payments so far) and rls_on = true.

PART B: STRIPE (in MODE)
6. Open https://dashboard.stripe.com/ and check the Test/Live switch matches MODE. Open Product catalogue.
7. Create THREE products, each with ONE price, currency GBP, and these exact names. If a product with that name already exists in this mode, do not create a second one: use it and just report its price id.
   a. Name: Founding Member 90-Day Pass. Price: 9.99 GBP, One time.
   b. Name: Annual. Price: 14.99 GBP, Recurring, every 1 year.
   c. Name: Monthly. Price: 2.99 GBP, Recurring, every 1 month.
   Leave tax settings as they are. Do not add images or descriptions. After saving each, open it and copy ONLY its Price ID (starts with price_).
8. Open Settings > Payments > Payment methods (https://dashboard.stripe.com/settings/payment_methods). Make sure Cards, Apple Pay, Google Pay and Link are switched ON for the default configuration. If one needs a verification, an agreement or a domain step, STOP and tell me which one.
9. Open Developers > Webhooks and add an endpoint (in MODE):
   - MODE = TEST: URL https://menumacros-git-viral-upgrade-aman-moneysave.vercel.app/api/v1/webhook/stripe   (the branch's preview address). Deliveries to it will fail with a "401" in test mode because the preview is behind a Vercel login: that is expected.
   - MODE = LIVE: URL https://numbite.com/api/v1/webhook/stripe
   Events to send, exactly these four: checkout.session.completed, invoice.paid, customer.subscription.deleted, charge.refunded. API version: leave the default. After saving, DO NOT click "Reveal" on the signing secret. Just confirm the endpoint exists and lists the four events.
10. Tell me: the three Price IDs (name -> price_...), whether Apple Pay, Google Pay and Link are on, and the endpoint URL with its four events.

PART C: VERCEL (read only, names only)
11. Open https://vercel.com, my project `menumacros`, Settings > Environment Variables. Do NOT reveal any value. For each of these names say "present" or "missing" and for which environments (Production / Preview): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ENTITLEMENT_PRIVATE_JWK, NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK, STRIPE_PRICE_PASS90, STRIPE_PRICE_ANNUAL, STRIPE_PRICE_MONTHLY, NEXT_PUBLIC_WEB_PRO, NEXT_PUBLIC_SITE_URL. Also confirm the three secret ones (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ENTITLEMENT_PRIVATE_JWK) are marked "Sensitive".

REPORT
Give me a short table: step number, what you found, OK / STOP. Then anything you could not do and why. Do nothing beyond this list.
