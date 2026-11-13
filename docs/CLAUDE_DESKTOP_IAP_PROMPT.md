# Claude desktop: add Apple In-App Purchase to Numbite (paste everything below the line)

HOW TO USE: this is for AFTER the website payments (docs/PAYMENTS.md) work in Stripe's test mode and after version 1.0 is approved. On your Mac, open a NEW chat in Claude desktop with
access to your Mac turned on, signed in to App Store Connect and Xcode. Paste EVERYTHING below the line. It builds the Swift purchase code, writes the server route and tests it in the
simulator with a StoreKit test file. It stops and asks you before anything that costs money, touches App Store Connect or uploads a build.

--------------------------------------------------------------------------------------------------------------

You are Claude desktop on the founder's Mac with access to the computer, Terminal, Xcode and the founder's browser. The founder (Aman) wants the paid features of the iPhone app
Numbite sold with Apple In-App Purchase (App Store guideline 3.1.1 forbids selling digital features in the app any other way). Do ONLY what is written, in order, and report after each step.

BACKGROUND
- Numbite is a free UK calories/protein app: the web app in web/ (Next.js, TypeScript) packed inside a SwiftUI WKWebView app. Repo folder MenuAi on this Mac (GitHub aman66-web/MenuAi). Xcode project
  MenuMacros.xcodeproj, scheme MenuMacros, bundle ID com.amanmarwaha.MenuMacros, team S7G6ZHHK59. Read CLAUDE.md first (the non-negotiable rules), then docs/PAYMENTS.md, docs/APP_BUILD.md and
  web/lib/payments/ and web/lib/mm/paid.ts. The branch to start from is `viral-upgrade` (or `main` once it has been merged).
- The website side is built and OFF: three plans (90-day pass GBP 9.99 once; Annual GBP 14.99; Monthly GBP 2.99), a signed ES256 access token that carries no personal data (web/lib/payments/token.ts),
  `GET /api/v1/entitlement/me` that returns a token for a signed-in person, a table `pro_entitlements` that already has `source = 'apple'`, `apple_original_transaction_id` and `user_id` columns.
- The web layer decides what is free or paid from the token on the device (`paidStore`, web/lib/mm/stores.ts). In the iPhone app the web layer must NOT show the Stripe page: `NEXT_PUBLIC_IAP=1` and
  `APP_BUILD=1` make `IAP_ENABLED` true and `WEB_PRO_ENABLED` false (web/lib/mm/config.ts).

GROUND RULES
- Never print, copy or type a password, key or token. The founder types passwords, two-factor codes and any payment or agreement. Stop and ask on any CAPTCHA, agreement or unexpected prompt.
- Follow CLAUDE.md: Swift 6 strict concurrency, system access behind protocols in Services/ with a fake for tests and previews, no new third-party dependency, no force unwraps, Logger not print,
  Swift Testing. Do not touch the entitlements file, signing or capabilities except the In-App Purchase capability in step 3.
- No medical wording, no "good/bad/healthy" (CLAUDE.md rule 3). The paywall must show Apple's required disclosures (below).
- Do not upload a build or submit anything. Stop after step 9 and report.

STEP 1 - APP STORE CONNECT (ask the founder to do the money parts)
  Check: Business > Agreements: "Paid Apps" agreement active, banking and tax done (if not, STOP: the founder must do this). Then in the app > Monetization > Subscriptions create ONE
  subscription group "Numbite Pro" with two auto-renewable subscriptions: product ids `com.amanmarwaha.numbite.pro.annual` (1 year) and `com.amanmarwaha.numbite.pro.monthly` (1 month); and, under
  In-App Purchases, one NON-RENEWING subscription `com.amanmarwaha.numbite.pro.pass90` (90 days). Prices: the UK tiers closest to GBP 14.99, 2.99 and 9.99 (show the founder the exact tier before saving).
  English (UK) names and descriptions must match the website: "Annual", "Monthly", "Founding Member 90-Day Pass". Upload no screenshots yet (the founder does that with the review build). Save as Ready to Submit.

STEP 2 - SERVER: VERIFY APPLE'S SIGNED TRANSACTION
  Add `web/app/api/v1/entitlement/apple/route.ts` + `web/lib/payments/apple.ts` (pure, with tests in web/tests/applePurchase.test.ts, written first): `POST { signedTransaction }` (a StoreKit 2 JWS).
  Verify the JWS properly: the x5c chain in its header must end in Apple's root (embed Apple Root CA - G3 as a constant, fingerprint documented), the leaf must carry Apple's receipt-signing OID, the
  signature must be ES256 over the payload, `bundleId` must be com.amanmarwaha.MenuMacros, `productId` one of the three above, `expiresDate` (or purchaseDate + 90 days for the pass) in the future,
  `environment` Production (accept Sandbox only when the server env `APPLE_ALLOW_SANDBOX=1`), `revocationDate` absent. Use node:crypto only (no new dependency). On success upsert a `pro_entitlements` row
  (`source='apple'`, `apple_original_transaction_id`, plan, expires_at, `user_id` when the request carries a signed-in session, else null) and return `{ token, plan, expiresAt }` signed by the existing
  `signClaims` with `src: "apple"`. Same CORS as /api/v1/sync (the app's origin app://menumath). Tests: a valid chain made with a throwaway CA in the test, a wrong bundle, expired, revoked, a changed payload,
  a chain that does not end at the root, sandbox refused/accepted by env, an idempotent repeat, rate limit. Also extend `GET /api/v1/entitlement/me` to look up by `user_id` as well as email.
  Run `cd web && npm test && npx tsc --noEmit && npx eslint`.

STEP 3 - XCODE
  Add the In-App Purchase capability to the MenuMacros target (Signing & Capabilities). Add a StoreKit configuration file `Config/Numbite.storekit` with the three products above (same ids, prices)
  and select it in the scheme's Run options for testing only (not for Release).

STEP 4 - SWIFT
  `MenuMacros/Services/PurchaseService.swift` (protocol) + `StoreKitPurchaseService.swift` (StoreKit 2: `Product.products(for:)`, `purchase()`, `Transaction.updates` listener started at launch,
  `Transaction.currentEntitlements`, `AppStore.sync()` for restore) + a fake for tests/previews. Handle: cancelled, pending (Ask to Buy), unverified (never grant), revoked. Pass the signed transaction
  (`transaction.jsonRepresentation` is NOT enough: send `VerificationResult.jwsRepresentation`) to the web layer. Register it in AppEnvironment.
  Bridge (MenuMacros/Features/WebApp/NativeBridge.swift, web/lib/mm/native.ts): actions `iap.products` (id, display name, display price from StoreKit, period), `iap.purchase(id)`, `iap.restore`; each
  answers JSON. Swift Testing tests for the bridge decoding and the fake. `./scripts/test.sh --unit`.

STEP 5 - WEB LAYER IN THE APP
  In `web/app/app/_components/ProPlans.tsx` add the iPhone branch (when `IAP_ENABLED`): show the products from `iap.products` (never a hard-coded price), a Buy button per plan, "Restore purchases",
  and Apple's required disclosures under the plans: title, length of the subscription, price (and price per unit where relevant), "Payment will be charged to your Apple ID account at confirmation of
  purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings > Apple ID > Subscriptions.", and working links to the
  Terms of Use (Apple's standard EULA unless the website Terms is set as the custom EULA) and the Privacy Policy. After a purchase, POST the JWS to /api/v1/entitlement/apple (same origin rules as the
  other app calls), then `acceptToken` (web/lib/payments/client.ts). The WhatsApp share unlock may stay. Hide the Stripe wording and "Pay with Stripe" in the app. Keep every other file's wording as is.
  Build the packed app: `NEXT_PUBLIC_IAP=1 NEXT_PUBLIC_SUPPORT_EMAIL=aman66@hotmail.co.uk ./scripts/build_app_web.sh`.

STEP 6 - PRIVACY AND STORE TEXT
  Update `MenuMacros/PrivacyInfo.xcprivacy` (Purchases: purchase history linked to the user only if user_id is stored; no tracking) and the App Privacy answers in docs/STORE.md; add the In-App Purchase
  review notes (how to find the paywall, a sandbox account is not needed because the StoreKit sandbox works with the reviewer's own), the restore path and the Terms/Privacy links. Do not touch the age rating.
  Add a "Founder to-do" entry for anything only the founder can do.

STEP 7 - SIMULATOR TEST WITH THE STOREKIT FILE
  Run on iPhone 17 Pro: free tier first (the Truth card opens three dishes then shows the paywall), buy each product with the StoreKit test file (Xcode > Debug > StoreKit > Manage Transactions), see paid
  access appear, quit and reopen (still paid), refund a transaction in Manage Transactions and check access ends at the next launch, test Ask to Buy and cancel, and Restore. Screenshots into build/screens/ (not committed).

STEP 8 - CHECK AGAINST THE GUIDELINES
  Re-read App Store Review Guidelines 3.1.1, 3.1.2 (subscriptions), 3.1.3(b) (multiplatform services) and 5.1.1(v) in their current live text (do not quote them from memory) and list, in your report, anything
  in the built screens that could be rejected. Do NOT mention Stripe, the website or any price outside the App Store in the app (3.1.1/3.1.3).

STEP 9 - REPORT
  Commit to a new branch `iap` (not main) with a clear message, do not push, and give the founder: what you built, test results, the product ids and prices set in App Store Connect, the list of things that
  still need the founder (screenshots for each product, the review build with IAP, version 1.1 and a new build number, submitting the products with the app version), and anything you were unsure about.
