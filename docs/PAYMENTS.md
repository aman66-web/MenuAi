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

## Not decided (yours)

- ~~Whether to show a cookie/consent banner for the creator code.~~ Decided 14 Nov 2026: no storage, so no banner.
- How long payment records are kept (drafted as: while access lasts plus six years, for accounting).
- Whether a refund should also end an Annual/Monthly subscription in Stripe automatically (today: you cancel it in Stripe).
