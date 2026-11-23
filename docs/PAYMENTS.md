# Paid access (built 13–14 November 2026, switched OFF)

Everything in this document is built, tested with fakes, and **off**. Nothing changes on numbite.com or in the iPhone app until you set `NEXT_PUBLIC_WEB_PRO=1`
(website) and make the build with `NEXT_PUBLIC_IAP=1` (iPhone app 1.1, see below). The free launch stays exactly as it is until then (`web/lib/mm/config.ts`: `WEB_PRO_ENABLED`, `IAP_ENABLED`).

## What it is

| | Price | Notes |
|---|---|---|
| Founding Member 90-Day Pass | £9.99 once | 90 days, no renewal |
| Annual | £14.99 a year | renews until cancelled |
| Monthly | £2.99 a month | renews until cancelled |

**Free tier** (the brief): every menu; the Truth card for 3 different dishes a day; the first 2 results of Best for you and of each Quick answers list; the first 5 rows of Cheapest protein;
up to 3 saved orders. Logging and the order builder stay free. **Paid:** the rest of those lists, every Smart Swap, the "Small appetite" optimiser, unlimited saved orders.
**Share to unlock:** sharing on WhatsApp from the plans screen gives 48 hours of paid features on that device (a soft nudge: a share can't be verified).

## How it works

1. The person taps **Pay** → `POST /api/v1/checkout` → we create a Stripe Checkout Session (plain `fetch`, no `stripe` package) → they pay on Stripe's page (card, Apple Pay, Google Pay, Link: whichever you switch on in Stripe). **No account is needed.**
2. Stripe sends them back to `/app/pro/thanks?session_id=…`; the page asks `POST /api/v1/entitlement` which **reads the Session from Stripe** (never trusts the browser), records the payment and returns a **signed token** (ES256, no name or email in it).
3. Stripe also calls `POST /api/v1/webhook/stripe` (signature checked against the raw body, 5-minute window). It creates the same record (so it never matters which arrives first), extends renewals (`invoice.paid`), notes cancellations (`customer.subscription.deleted`: what was paid for stays until its end date) and ends access on a full refund (`charge.refunded`).
4. The device keeps the token (`mm.v1.paid`), checks it with the public key (works offline) and treats the device as paid until its end date.
5. **Another device:** sign in with the same email address → Settings › Subscription, or the plans screen › "Restore my access" (`GET /api/v1/entitlement/me`).
6. **Creator links:** `?ref=anna` on a page is held **in memory only** (nothing is stored on the device, so no consent banner is needed; founder 14 Nov 2026): it survives moving around the app but not a reload, and is sent only with the person's own Checkout request. A creator's link should therefore point straight at the app (`https://numbite.com/app?ref=anna`). It goes into the Stripe payment's metadata and our `pro_entitlements.ref`. The report is the `creator_sales` view. **Stripe cannot pay creators automatically**: you pay them by hand from that report.

Code: `web/lib/payments/*` (pure, 27 tests in `tests/payments.test.ts`), `web/lib/mm/paid.ts`, `web/app/api/v1/{checkout,entitlement,webhook/stripe}`, `web/app/app/pro/*`, `web/app/app/_components/ProPlans.tsx`.

## Your steps (I can't do these: they need your accounts)

1. **Stripe account** (stripe.com): finish business details, bank account and identity. Stay in **Test mode** first.
2. **Three Prices** (Product catalogue → add product, all GBP): £9.99 *one time*; £14.99 *recurring yearly*; £2.99 *recurring monthly*. Copy each `price_…` id.
3. **Payment methods**: Settings › Payments › enable Apple Pay and Google Pay (and Link). For Apple Pay on Stripe's own page nothing else is needed.
4. **Webhook**: Developers › Webhooks › add endpoint `https://numbite.com/api/v1/webhook/stripe`, events `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`, `charge.refunded`. Copy the signing secret `whsec_…`.
5. **Keys**: run `node tools/payments/make_entitlement_key.mjs` on your own computer. Put the values in Vercel (Production and Preview): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PASS90`, `STRIPE_PRICE_ANNUAL`, `STRIPE_PRICE_MONTHLY`, `ENTITLEMENT_PRIVATE_JWK`, `NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK`. Never paste a key into a chat.
6. **Database**: read `supabase/migrations/20261113120000_pro_entitlements.sql` (it only creates one table and one view), run it in the Supabase SQL Editor (never `supabase db push`). Until then the routes fail safely.
7. **Legal check** (before the first real sale): the wording in Terms › "Paid access on the website" and Stripe's consent line (`CHECKOUT_CONSENT` in `web/lib/payments/stripe.ts`) is a **draft** for the UK 14-day digital-content rule and renewal terms; have it confirmed. (The creator code is held in memory only, so there is no PECR question there.)
8. **Test in Stripe test mode** with card `4242 4242 4242 4242`: pay each plan, confirm access appears, then `Refund` and confirm it ends. Then set `NEXT_PUBLIC_WEB_PRO=1` in Vercel and redeploy.
9. **Go live**: swap in live-mode keys and Price ids, add the live webhook, redeploy.

## iPhone app (Apple In-App Purchase): built 16 November 2026 for version 1.1 (branch `iap`)

App Store guideline 3.1.1: digital features in the app are bought with In-App Purchase, so the app never shows the Stripe page (`/api/v1/checkout` refuses the app's origin)
and never mentions the website or another way to pay. The WhatsApp "share to unlock" is off in the app (guideline 3.2.2: no unlocking for sharing).

1. **Products** (App Store Connect; `Config/Numbite.storekit` holds the same three for testing): `com.amanmarwaha.numbite.pro.annual` and `.monthly` (auto-renewable, one group "Numbite Pro"),
   `.pass90` (non-renewing, 90 days). Names and prices on screen come from StoreKit, never from our table.
2. **Buying** (`web/app/app/_components/AppStorePlans.tsx` → `web/lib/payments/iap.ts` → bridge `iap.purchase` → `MenuMacros/Services/StoreKitPurchaseService.swift`): Apple's own sheet; StoreKit
   checks the purchase on the phone and hands the page Apple's **signed transaction** (a JWS).
3. **Checking** (`POST /api/v1/entitlement/apple`, `web/lib/payments/apple.ts`): the server checks the signature chain up to **Apple Root CA - G3**, Apple's certificate markers, our bundle ID and the
   product, refuses refunded or upgraded transactions, accepts Production and **Sandbox** (App Review and TestFlight buy in the sandbox), and answers with the same signed token as the website
   (`src: "apple"`). It keeps nothing: Apple keeps the purchase record.
4. **Keeping it current**: at start-up and whenever the app comes back to the front the page asks StoreKit for the person's current purchases (`iap.entitlements`); nothing there (refunded, cancelled
   and ended) and the Apple token goes; a purchase there and no token (new phone, reinstall), or one with under a week left, and a fresh token is fetched. **Restore purchases** (plans screen and
   Settings › Subscription) asks the App Store to sync first. **Manage subscription** opens Apple's own screen.
5. **Testing on the Mac or your phone from Xcode**: the scheme's Run uses `Config/Numbite.storekit` (Xcode's local test store: no money, no App Store Connect products needed). Those purchases are signed by
   Xcode's own test certificate, which the server accepts only when `APPLE_XCODE_TEST_CERT` (that certificate) is set in Vercel. **Remove it after testing.** TestFlight and App Review use Apple's sandbox
   instead, which needs the real products in App Store Connect.
6. **Keys**: run `node tools/payments/make_entitlement_key.mjs` once in Terminal on your Mac: it writes the public key into `web/lib/payments/entitlement-public-key.json` (commit it; the website and every app
   build read it) and puts the private key on your clipboard only; paste it into Vercel as `ENTITLEMENT_PRIVATE_JWK` (Sensitive, Production and Preview).

Not done for Apple purchases: no `pro_entitlements` row (not needed: restore goes through the Apple ID), no creator code (an App Store purchase can't carry one), no App Store Server Notifications (a refund is
noticed at the next start-up; the token of a refunded purchase still checks until then).

## Android (Google Play Billing): built 22 November 2026 (branch `iap`)

The Android app is the same web app inside a Kotlin web view (`android/`, package `com.amanmarwaha.numbite`). Google Play requires digital features sold in the app to use Play Billing, so
like the iPhone app it never shows the Stripe page (`/api/v1/checkout` and `/api/v1/entitlement` refuse both apps' origins: `app://menumath` and `https://appassets.androidplatform.net`). The contract
between the page, the app and the server (names, actions, answers) is `docs/ANDROID_BRIDGE.md`; this is the money side.

1. **Product** (Play Console › Monetize with Play › Subscriptions): **one** subscription `com.amanmarwaha.numbite.premium` with **two base plans**, `annual` (£49.99 every year) and `monthly` (£4.99 every month),
   both auto-renewing, **no free-trial or introductory offer** (the 7-day free week is the account's own, as on the iPhone: `web/lib/payments/freeWeek.ts`). One subscription with two base plans is what lets Google
   itself stop anyone holding both and offer a plan change. Names and prices on screen are Play's own (`iap.products`), never from our table. The page names a plan `<subscription id>:<base plan id>`
   (`web/lib/payments/googleIds.ts`).
2. **Buying** (`AppStorePlans.tsx` → `web/lib/payments/iap.ts` → bridge `iap.purchase` → Play Billing in the app): Google's own sheet; the app hands the page Play's **purchase token** (`{purchases:[{productId, token}]}`).
3. **Checking** (`POST /api/v1/entitlement/google`, `web/lib/payments/google.ts`): unlike Apple's signed transaction, a token proves nothing alone, so the server asks Google (Play Developer API
   `purchases.subscriptionsv2.get` for our package) with a service account: OAuth with an RS256 JWT signed with `node:crypto` (no new dependency), the access token kept in memory until a minute before it ends.
   It accepts a line item that is our subscription with base plan `annual` or `monthly` (that is the plan) in state `ACTIVE`, `IN_GRACE_PERIOD`, or `CANCELED` with its paid period still running; on hold,
   paused, pending, expired (Google reports a refunded or revoked purchase as expired) and anything else is refused (402). The access ends at the paid period's end plus the same 3 days' grace as every
   subscription (`plans.ts`), and the answer is the same signed token (`src: "google"`). Several purchases: the one whose access ends last. It keeps nothing: Google keeps the purchase record. Google
   unreachable, our service account refused (403) or no access token: 503 (the app keeps what it has and asks again), never "not paid". Rate limit: 30 requests per caller per 10 minutes.
4. **Acknowledging**: after our server accepts, the page tells the app `iap.acknowledge {token}` for each token it sent (Google refunds a purchase not acknowledged within 3 days). A failed acknowledgement
   changes nothing for the person; the next start-up or Restore purchases claims, and acknowledges, again.
5. **Keeping it current**: as on the iPhone, at start-up and whenever the app comes back to the front the page asks Play Billing for the current purchases (`iap.entitlements`); nothing there and the Google
   token goes; a purchase there and no token (new phone, reinstall), or one with under a week left, and a fresh token is fetched. **Restore purchases** asks Google Play to sync first. **Manage subscription**
   opens Google Play's subscription screen. A Google Play purchase wins over the account's free week and gifts, exactly as an App Store one does (`accountAccess.ts`, `iap.ts`). The Android app has no
   DeviceCheck: the page asks `device.id` instead and sends the app's one-way hash of the phone's Android ID, which the server hashes again (kind `android`) and keeps in `trial_claims` like the email hash
   (see "Free week and gifts" below; google's "device recall" is a closed beta for apps with production usage and is not used yet).
6. **Server env (Vercel, Production and Preview):** `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (**Sensitive**: the whole key file of the service account below, as downloaded; the same text in base64 also works) and, only
   if the package name ever changes, `GOOGLE_PLAY_PACKAGE_NAME` (default `com.amanmarwaha.numbite`). `ENTITLEMENT_PRIVATE_JWK` is the same key as for Apple. Without the service account the route answers 503
   and checks nothing. The Android build of the page needs the same build switches as the iPhone's (`NEXT_PUBLIC_IAP=1`, `APP_BUILD=1`) and `NEXT_PUBLIC_APP_VERSION="Android 1.1 (<versionCode>)"`.

**What you do in Google (I can't: it needs your accounts):**

1. **Play Console** › the app › **Monetize with Play** › **Products** › **Subscriptions** › **Create subscription**: product ID `com.amanmarwaha.numbite.premium`, name "Numbite Premium". Add **two base plans**:
   ID `annual` (auto-renewing, billing period 1 year, price £49.99) and ID `monthly` (auto-renewing, 1 month, £4.99); **Activate** both. **Do not add any offer** (no free trial, no introductory price).
   (The app must have been uploaded to an internal testing track at least once before subscriptions can be created; the Payments profile and merchant account must be set up.)
2. **Google Cloud Console** (console.cloud.google.com): pick or create a project, **APIs & Services › Library › Google Play Android Developer API › Enable**; then **IAM & Admin › Service Accounts › Create service
   account** (name `numbite-play-reader`; no project roles needed) › **Keys › Add key › Create new key › JSON** (it downloads once).
3. **Play Console › Users and permissions › Invite new users**: paste the service account's email address (`…@….iam.gserviceaccount.com`), and under **Account permissions** tick **View financial data, orders and
   cancellation survey responses** and **Manage orders and subscriptions**. (Permissions can take a few hours to reach the API; until then our route logs `forbidden` and answers 503.)
4. **Vercel** › the project › Settings › Environment Variables: add `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, paste the **whole text of the downloaded JSON file**, mark it **Sensitive**, Production and Preview, then
   redeploy. **Never paste the file into chat**, the app or the repository, and delete the downloaded file afterwards.
5. **Test**: add your own Google account under Play Console › **Settings › License testing** (a licence tester buys without being charged and renews quickly, five minutes for a month, up to six times), install from an
   internal testing track, buy each plan, and check Settings › Subscription says Premium; then cancel in Google Play and confirm Premium carries on until the end of the period; refund an order in Play Console and
   confirm it goes at the next start-up. Logs: Vercel's runtime logs show only reason codes (`google entitlement: none of 1 gave access (not_found)`; never a token or a key).

Not done for Google purchases: no `pro_entitlements` row (not needed: restore goes through the Google account), no creator code, no Real-time developer notifications (a refund or an ended subscription is
noticed at the next start-up; the token of a refunded purchase still checks until then, at most its paid period plus 3 days), no server-side acknowledgement (the app does it).

## Not decided (yours)

- ~~Whether to show a cookie/consent banner for the creator code.~~ Decided 14 Nov 2026: no storage, so no banner.
- How long payment records are kept (drafted as: while access lasts plus six years, for accounting).
- Whether a refund should also end an Annual/Monthly subscription in Stripe automatically (today: you cancel it in Stripe).

## Free week and gifts (founder's decision, 20 November 2026)

- **Every account gets 7 days of Premium** from its first ask in the iPhone app (`FREE_WEEK_DAYS`), with no payment details: `POST /api/v1/entitlement/account`
  (the account's session) answers with the same signed token a purchase gets, with `src: "account"` and plan `trial` (or `gift`). The website sells nothing and
  keeps everything open, as before.
- **One free week per person and iPhone**, checked in this order: a running gift wins (and doesn't use the week); then a keyed one-way hash (HMAC-SHA256 with
  `FREE_WEEK_HASH_SECRET`) of the normalised email and of the Sign in with Apple ID: a claim under either decides running or ended; with no claim, Apple's
  DeviceCheck bit 0 for this iPhone (set = no free week); otherwise the week is claimed now and the bit set. DeviceCheck never blocks anyone: unconfigured,
  no token sent or Apple failing, it is skipped and the answer says so.
- **Android phones (22 Nov 2026):** the body may carry `androidDeviceHash` (64 lower-case hex: SHA-256 of "numbite-device:" + the Android ID, made on the phone). The server keys it again
  (HMAC-SHA256, kind `android`) and looks it up with the account's keys. An account with no claim of its own on a phone that had a week gets none (`freeWeek: "device_used"`, as on an iPhone) and is
  stored as having had no week, so its later asks say "ended", never the days left of the other account's week. A phone is remembered only by the week that began on it (not by an account that merely signs
  in on it). The Android ID survives uninstalling and reinstalling, not a factory reset. Storing the phone's key is best effort: until `supabase/migrations/20261122120000_trial_claims_android.sql`
  is run the table refuses kind `android`, the week still starts, and the answer says `deviceCheck: "failed"`.
- **Apple wins on the phone:** while an App Store token runs, the account endpoint isn't asked, so a subscriber's week isn't used up.
- **Gifts** (founder: "if I give their email to you, you can give them a premium account ... I won't have to do a new build"): a row in `premium_gifts`
  (account, optional end). The SQL to give, take away and list gifts is in `supabase/migrations/20261121120000_free_week.sql`. A gift token lasts at most 30 days
  (`GIFT_TOKEN_DAYS`), so a removed gift stops the next time the app asks, at the latest 30 days later.
- **Env vars (Vercel, Production and Preview, Sensitive):** `FREE_WEEK_HASH_SECRET` (at least 32 characters; **never change it once set**, or every hash changes
  and everyone could have a second week); `DEVICECHECK_KEY_ID`, `DEVICECHECK_TEAM_ID` (or `APPLE_TEAM_ID`), `DEVICECHECK_PRIVATE_KEY` (the .p8 text; Apple
  Developer > Certificates, Identifiers & Profiles > Keys > + > DeviceCheck > Continue > Register > Download, once). Without the secret or
  `ENTITLEMENT_PRIVATE_JWK` the route answers 503; before the migration, 500; either way the app changes nothing.
- **Apple's own 7-day introductory offer is removed** from the subscriptions so nobody sees two free weeks; the plans show no trial.

(23 Nov 2026) The Google Play service account needs "View app information and download bulk reports (read-only)" as well as the two financial permissions, or the Play Developer API answers 401 "insufficient permissions": see docs/ANDROID_BILLING.md.
