# Sign-in and sync across devices (built 13 October 2026, on branch `claude/accounts-sync`; not live yet)

Founder, 12 October 2026: "we need to do the apple google and also set up resend i need to set up the log in methods", then, asked what sign-in
should do: **"Sync across devices"**. This changes CLAUDE.md rule 4 ("no accounts, no personal data off the device"). The rule is rewritten
when the feature ships, and the privacy page and App Store answers change with it (below).

## What people get

- **Sign-in is optional.** Everything works as now without an account, and data stays on the phone. Signing in turns on sync. Apple rejects
  apps that force a login for features that don't need one (guideline 5.1.1).
- **Three ways in:** Sign in with Apple, Continue with Google, and an email code (a 6-digit code sent by Resend from noreply@numbite.com; no
  password to remember). Apple requires Sign in with Apple whenever Google sign-in is offered (guideline 4.8).
- **What syncs:** settings and targets, diet and allergies, saved restaurant meals and favourite restaurants, My meals (saved recipes, Pip's
  recipes), the shopping list, today's log, "I have this" cupboard items and the comparison list. **What doesn't:** recently viewed dishes (24 hours
  only), the offline menu cache, the language screen before sign-in.
- **Settings › Account:** who you're signed in as, "Sign out" (data stays on this phone), and **"Delete my account"**. Apple requires deletion
  inside the app (guideline 5.1.1(v)); it deletes the account and every synced row at once.

## How it works (keeps the rule "never a Supabase key in the app")

- **Accounts** are Supabase Auth (already our database). The app and the website never talk to Supabase directly: every call goes through our
  API on numbite.com, which holds the server-only key. This is the same pattern as reports and requests today.
- **iPhone:**
  - Sign in with Apple uses the iPhone's own Apple sheet (AuthenticationServices, no new library). It sends Apple's identity token to
    `POST /api/v1/auth/apple`, which signs in with Supabase (`signInWithIdToken`) and returns our session.
  - Google and email: Google blocks its sign-in page inside an app's web view, so the app opens numbite.com's sign-in page in Apple's secure
    browser sheet (ASWebAuthenticationSession). That page finishes on `numbite://auth?code=…`, and the app swaps the one-time code at
    `POST /api/v1/auth/exchange`.
- **Website:** the same numbite.com sign-in pages, finishing with a secure, http-only session cookie.
- **Data:** one new table, `user_data` (user id, store name, JSON value, updated time). It is written only by the API for the signed-in user
  (RLS on, no client access, like every table). Sync is per store: the newest write wins for single values such as settings; lists merge by
  item id and keep deletions, so two phones don't undo each other.
- **Schema change:** a new migration file. It is applied to the live database only with the founder's go-ahead (CLAUDE.md rule 4).
- **No new libraries:** `@supabase/supabase-js` is already used on the server; Resend is reached through Supabase's email settings (SMTP).

## Part A: the founder's setup (Claude in Chrome on your Mac can click through it with you)

On the Mac, run `claude --chrome` in the repo with the Claude in Chrome extension installed and signed in, then paste the prompt below. You
type every password and two-factor code yourself. Secret values (Apple's .p8 key file, Google's client secret, Resend's API key) go **only**
into the Supabase dashboard fields: never into chat, the repo, or a file.

> Help me set up sign-in for Numbite in my own Chrome. Work in a new tab, one site at a time, and stop and ask me at any password, two-factor,
> payment or "agree to terms" screen. Never copy a secret key, client secret, API key or .p8 file contents into this chat, into a file, or
> anywhere except the Supabase dashboard field it belongs in. Values:
> - Supabase project `rbbalkfkpacazzhsqfzz` (org "Aman's Org"). Callback URL: `https://rbbalkfkpacazzhsqfzz.supabase.co/auth/v1/callback`.
> - App bundle ID `com.amanmarwaha.MenuMacros`; Apple team `S7G6ZHHK59`; website `https://numbite.com`.
>
> 1. **Apple** (developer.apple.com › Certificates, Identifiers & Profiles):
>    - turn on "Sign in with Apple" for the App ID `com.amanmarwaha.MenuMacros`;
>    - create a Services ID `com.amanmarwaha.numbite.web` with Sign in with Apple on, domain `numbite.com`, and return URL the Supabase callback;
>    - create a Key with Sign in with Apple and download the .p8 (it can be downloaded only once: I'll keep it in my password manager).
>    - Note the Key ID.
> 2. **Google** (console.cloud.google.com):
>    - create a project "Numbite";
>    - set up the OAuth consent screen: app name Numbite, support email mine, home page `https://numbite.com`, privacy
>      `https://numbite.com/privacy`, terms `https://numbite.com/terms`, scopes email, profile and openid only;
>    - create OAuth client IDs: a Web application (authorised origin `https://numbite.com`, redirect URI the Supabase callback) and an iOS
>      client (bundle ID `com.amanmarwaha.MenuMacros`).
> 3. **Resend** (resend.com):
>    - sign up;
>    - add the domain `numbite.com` and show me the DNS records it asks for (I'll have Claude add them in Vercel or add them myself in
>      Vercel › Domains › numbite.com);
>    - once verified, create an API key with "sending access" only.
> 4. **Supabase** (supabase.com › project `rbbalkfkpacazzhsqfzz` › Authentication):
>    - URL Configuration: Site URL `https://numbite.com`; Redirect URLs `https://numbite.com/auth/callback` and `numbite://auth`.
>    - Providers › Apple: on; client IDs `com.amanmarwaha.numbite.web,com.amanmarwaha.MenuMacros`, plus the Key ID, team ID and .p8 (or the
>      secret its generator makes from them; note that it expires after 6 months and add a calendar reminder).
>    - Providers › Google: on; both client IDs (web first, comma-separated) and the web client's secret.
>    - Providers › Email: on, with "Confirm email" on.
>    - Emails › SMTP Settings: custom SMTP on; host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender
>      `noreply@numbite.com`, sender name `Numbite`.
>    - Email Templates › Magic Link: replace the body with "Your Numbite sign-in code is {{ .Token }}. It expires in 1 hour. If you didn't ask
>      for it, ignore this email."
>    - Email Templates › **Confirm sign up**: the same body and the subject "Your Numbite sign-in code". (Added 13 October 2026: a brand-new
>      address is signed up by its first code request, and Supabase then sends the "Confirm sign up" email, whose default text has a link and no code.)
>
> At the end, tell me which steps are done and which need me. Don't show any secret values.

## Part B: what Claude builds (after Part A, or alongside it)

1. Migration `user_data` plus API routes: `auth/apple`, `auth/google/start`, `auth/email/start` and `verify`, `auth/callback`, `auth/exchange`,
   `auth/signout`, `account` (delete), `sync` (get/put per store). Each gets validation, rate limits and CORS for `app://menumath`, with tests.
2. Web: sign-in sheet (Apple, Google, email code), Settings › Account, the sync engine over the existing `mm.v1.*` stores (merge rules above,
   offline-safe: writes queue and send when back online), and translations into the 10 languages.
3. iPhone: native Sign in with Apple and the secure browser sheet for Google and email (Mac session), plus the "Sign in with Apple"
   capability on the app target (Xcode › Signing & Capabilities: the founder's click).
4. Privacy page, terms, docs/STORE.md App Privacy answers, `PrivacyInfo.xcprivacy`, and CLAUDE.md rule 4 rewritten.
   - Collected now: **email address and user ID** (linked to the person, for App Functionality), and the synced content they choose to save.
   - Still no tracking, no ads, no analytics.
5. Tests: unit tests for merge and auth; e2e with a fake Supabase (email code, sign-out, delete, two devices merging). Then a real test on the
   founder's iPhone and the website.

## Consequences to know

- **Launch timing:** the free launch waits for this unless the founder ships without sign-in first. App Review checks sign-in and deletion
  closely.
- **Running costs:** last I knew, Supabase's free plan covered about 50,000 monthly sign-in users and Resend's free plan about 3,000 emails a month
  (100 a day). Check both pricing pages when signing up, since plans change.
- **Apple's .p8 secret** (if Supabase asks for the generated secret) must be renewed every 6 months or Apple sign-in on the website stops.

## Status: Part B is built (13 October 2026), not yet live

Part A is done (Apple, Google, Resend and Supabase set up; see docs/PROGRESS.md). Part B is built and tested on the branch
`claude/accounts-sync`; nothing is pushed, deployed or applied to the live database yet.

**Built:** migration `supabase/migrations/20261013120000_user_data.sql` (+ `supabase/tests/user_data.sql`); the API routes in docs/BACKEND.md
("Accounts and sync"); the shared merge rules (`web/lib/mm/syncMerge.ts`) and the browser's sync engine (`web/lib/mm/sync.ts`,
`syncStores.ts`, wired in `web/app/app/_lib/account.ts`); Settings › Account, the sign-in sheet and the welcome screen's "Already have an
account? Sign in"; the iPhone side (`MenuMacros/Services/AppleSignInService.swift`, `WebSignInService.swift`, bridge actions `appleSignIn`
and `webAuth`); translations in the 10 languages; the privacy page, terms, support page, STORE.md, `PrivacyInfo.xcprivacy` and CLAUDE.md rule 4.
**Tests:** 38 handler tests, 11 sync-server tests, 20 two-phone engine tests (the real server code and merge rules), 19 merge tests (300 random
cases of "same whichever copy comes first"), `web/e2e/account.mjs` (8 browser checks), Swift: 15 unit tests including the RFC 7636 example.

**Where it differs from the plan above (decided while building):**
- **Email in the app** uses the same 6-digit-code form inside the app's own pages (the app keeps the session it is given); only Google opens the
  secure browser sheet, because only Google needs it. Apple on the website goes through Supabase like Google does.
- **Routes added:** `auth/refresh` (the app renews its session), `auth/session` (who is signed in; renews the website's cookies) and
  `auth/apple/start` (Apple on the website).
- **The one-time code** for the iPhone is the session itself, sealed (AES-256-GCM, key derived from `SUPABASE_SECRET_KEY`, so no new environment
  variable), valid two minutes and only usable with the app's own PKCE verifier. It needs no table.
- **First sync on a device:** an account's real settings win over a phone that was never set up; settings set up on the phone go up when the
  account has none; untouched defaults are never sent. Lists always merge (nothing is replaced).
- **A different person signing in on the same phone** starts from a clean slate (the first person's data is not uploaded to the second's account).
- **"Clear data on this device" while signed in** also signs out of the account on that device (otherwise the next sync would bring everything back,
  or treat the clearing as a deletion). The synced data stays in the account.
- **Today's log** syncs only entries from today and yesterday; older entries stay on the phone.
- **Rate limits** are in memory per server instance (as for Pip's recipe maker); Supabase adds its own (one email code a minute per address).
- **Nobody who never signed in sends the server anything**: the app asks "who is signed in?" only on a device that already knows an account, in the
  iPhone app when it holds a session, or when the browser has just come back from Google or Apple (`?signin=ok`).
- The iPhone app keeps its session in the web view's local storage (like its other data); moving it to the Keychain is a possible later hardening.

## Founder steps to take it live

1. **Check the Google secret.** Supabase › Authentication › Sign In / Providers › Google must hold the **web client's** secret (it starts with
   `GOCSPX-`). If it was ever pasted wrong, create a new secret on the "Numbite Web" client in Google Cloud and paste it there. Never into chat.
2. **Say "go" for the database change.** The migration `20261013120000_user_data.sql` is applied to the live database only with your go-ahead
   (CLAUDE.md rule 4); then run `supabase/tests/user_data.sql` in Supabase › SQL Editor (it rolls itself back and prints
   `ALL USER_DATA CHECKS PASSED`).
3. **Merge and deploy.** Merge `claude/accounts-sync` into `claude/menumacros-kit` (and Production as you do today). Nothing else is needed in
   Vercel: no new environment variables.
4. **Xcode: done by Claude (13-14 October 2026).** The Sign in with Apple capability is `Config/MenuMacros.entitlements`, set as
   `CODE_SIGN_ENTITLEMENTS` on the app target (kept outside the synced `MenuMacros/` folder so it isn't copied into the app). It builds for the
   simulator and the entitlement is in the build; signing for a real iPhone is checked when you first run the app on your phone from Xcode (with
   your Apple ID signed in, Xcode refreshes the provisioning profile by itself; the App ID already has Sign in with Apple from Part A). Then run
   `./scripts/build_app_web.sh` and build onto your iPhone.
5. **Test for real**, on the website and on your iPhone: email code (check the email arrives from noreply@numbite.com), Continue with Google,
   Sign in with Apple, a saved meal and a shopping-list item appearing on a second device, Sign out, Delete my account, and "Clear data on this
   device" while signed in. The fake backend in the browser tests cannot prove the real Supabase answers the way the code expects.
6. **Before submitting to the App Store:** confirm the privacy answers in docs/STORE.md (especially "Health"), and have native speakers look at the
   new sign-in text in each language (Apple's and Google's own button wording differs by language).
