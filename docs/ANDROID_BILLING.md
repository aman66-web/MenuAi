# Android app: Google Play Billing (22 November 2026)

How the Android app sells Premium. The contract with the page and the server is `docs/ANDROID_BRIDGE.md` (ids, JSON shapes); this file is how the Kotlin side
works, the exact Play Console setup, how to test, and what every Google event looks like to the app. Code: `android/app/src/main/java/com/amanmarwaha/numbite/billing/`.

## What is where

| File | What it is |
|---|---|
| `PurchaseService.kt` | The contract the bridge calls (six functions, plain JSON, never throws). |
| `PurchaseServices.kt` | `createPurchaseService(appContext, activityProvider)`: the one place the app asks for the service. |
| `PlayBillingService.kt` | The real service: one BillingClient for the process, one purchase open at a time, plan changes, late purchases, acknowledge. |
| `BillingBackend.kt` | A tiny interface over Google's `BillingClient` (so the state machine is tested with a fake) and the real implementation (`RealBillingBackend`). |
| `PlayPlans.kt` | The pure part: ids, plan names, choice of offer, Play answers to ours, the JSON. |
| `PlanMemory.kt` | Remembers which base plan the last in-app purchase was (see "Plan changes"). |
| `src/debug/.../FakePurchaseService.kt`, `DebugPurchaseServices.kt` | A pretend Play for debug builds only. `src/release/.../DebugPurchaseServices.kt` is an empty twin. |
| `src/test/...` (`PlayPlansTest`, `PlayBillingServiceTest`, `PlayFixtures`), `src/testDebug/...` (`FakePurchaseServiceTest`) | Unit tests, no Play connection needed. |

Library: `com.android.billingclient:billing-ktx:8.0.0` (declared in `app/build.gradle.kts`). Its manifest adds `com.android.vending.BILLING`, the `<queries>` for Play
and `ProxyBillingActivity` by itself: nothing is needed in our manifest.

## How it works

* **One subscription, two base plans.** Subscription id `com.amanmarwaha.numbite.premium`; base plans `annual` and `monthly`. The page names a plan
  `<subscription id>:<base plan id>` (`com.amanmarwaha.numbite.premium:annual`). A purchase the page sends to our server is
  `{productId: "com.amanmarwaha.numbite.premium", token: "<purchaseToken>"}`; which plan it is comes from Google's answer to the server.
* **The six calls.**
  * `iap.products`: queries the subscription's `ProductDetails`, one entry per plan asked for: Play's own formatted price of the base plan's **recurring** phase,
    the period from Play's billing period (`P1M` is month, `P1Y` is year; any other period is left out), name `Annual` / `Monthly` (our fixed names: Play's own product
    name is the subscription's and is the same for both plans, and the page shows the name as each plan's title). Never a trial field. `{"error":"unavailable"}` on any failure.
  * `iap.purchase`: needs the foreground Activity (none: unavailable). Asks Play what the person holds first (see "Plan changes"), picks the offer (the plain base plan
    without a free trial; if several offers, one without a trial; only if every offer has a trial, the first), opens Google's own sheet and waits for Play's answer.
    PURCHASED gives `{"purchases":[{productId, token}]}` (paid state only); PENDING gives `{"pending":true}`; the person closing the sheet gives `{"error":"cancelled"}`;
    `ITEM_ALREADY_OWNED` is success with what Play says is held; everything else is unavailable.
  * `iap.entitlements`: `queryPurchasesAsync(SUBS)` filtered to our subscription and PURCHASED state. **Unacknowledged ones are included** (the page sends them to our
    server, then calls `iap.acknowledge`). Pending purchases are not entitlements. An empty list is a real answer.
  * `iap.restore`: the same, after dropping the connection and making a fresh one. Play is the source of truth: there is nothing of ours to sync. (While a purchase
    sheet is open it leaves the connection alone.)
  * `iap.manage`: opens `https://play.google.com/store/account/subscriptions?sku=com.amanmarwaha.numbite.premium&package=com.amanmarwaha.numbite` (in the
    foreground Activity's task, or a new task if there is none): change plan, cancel, resubscribe, fix the payment method.
  * `iap.acknowledge {token}`: `acknowledgePurchase` for that token; "already acknowledged" or "not found" is `{"done":true}`, any other failure is unavailable (the page
    may try again). **The app never acknowledges on its own initiative**: only the page does, after our server has accepted the purchase.
* **One connection.** `PlayBillingService.shared(...)` is a process-wide singleton with one `BillingClient`, connected on first use and reconnecting by itself
  (`enableAutoServiceReconnection`). Every call waits for a ready connection for 15 s (`BillingTimeouts`) and answers unavailable instead of hanging. A connection
  attempt that never answers after 60 s is abandoned and made again. Everything runs off the main thread except `launchBillingFlow`, which Play wants on it
  (the backend hops to `Dispatchers.Main` for that one call) and opening the Play URL.
* **One purchase at a time, surviving a rotation.** The open purchase (a `CompletableDeferred`) lives in the singleton service, not in the Activity. A second
  `iap.purchase` while one is open answers unavailable. The sheet may stay open up to 20 minutes (the page waits 15). If the caller's coroutine is cancelled (a
  scope that died with the Activity) the slot is freed, and when Play's answer arrives with nobody waiting it is **kept** and returned by the next
  `iap.entitlements`; so is a purchase that was pending and completes later, or one made outside the app (a redeemed code). `PurchaseUpdateSource.onPurchasesChanged`
  (optional hook on the service, `service as? PurchaseUpdateSource`) tells the shell at once so it can ask the page to look again; the page also asks at start-up and
  whenever the app comes back to the front.
* **Logging.** `Log.d("NumbiteBilling", ...)`: reason codes and outcomes only, never a token.

### Plan changes (annual to monthly, monthly to annual)

Google forbids two active purchases of one subscription, and a second `launchBillingFlow` for it answers `ITEM_ALREADY_OWNED`. So `iap.purchase` first asks Play what the
person holds:

* nothing: a normal purchase;
* a paid purchase of the plan asked for: nothing to buy, the app answers with that purchase;
* a paid purchase of the other plan: the purchase flow is launched with `SubscriptionUpdateParams` (old purchase token, replacement mode below);
* only a pending purchase: `{"pending":true}`, nothing is started again.

Play's client library says which subscription a purchase is for, **not which base plan** (only the server can ask Google that). So the app remembers which base plan
its last in-app purchase was (`PlanMemory`: the latest token as a one-way hash, in the app's private preferences). A held purchase it has no record of (another phone,
a reinstall) is treated as "the other plan" and Play is asked for a plan change; Play decides.

**Replacement modes chosen** (Play: "when switching plans within the same subscription to an auto-renewing plan from an auto-renewing plan, valid replacement modes are
`CHARGE_FULL_PRICE` and `WITHOUT_PRORATION`"; `CHARGE_PRORATED_PRICE`, `DEFERRED` and `WITH_TIME_PRORATION` are not allowed for this case, so the purchase would fail):

* **To annual: `CHARGE_FULL_PRICE`.** The year is charged now and the person gets Annual at once; the unused part of the month already paid is credited as extra time. It is what
  someone who taps "Annual" expects: they pay £49.99 and have it.
* **To monthly: `WITHOUT_PRORATION`.** Nothing is charged now; the person switches to Monthly at once and the monthly price starts when the year they already paid for ends.
  They lose nothing they paid for, and there is no surprise charge. (`CHARGE_FULL_PRICE` would charge £4.99 immediately and turn the unused year into months of credit.)

After a plan change Play makes a **new purchase token** (our server sees the old one as replaced via `linkedPurchaseToken`); the new one is returned to the page, claimed
on the server and acknowledged like any first purchase. Replacement parameters: library 8.0.0 uses `SubscriptionUpdateParams.setSubscriptionReplacementMode`; from
library 8.1 it is deprecated in favour of `SubscriptionProductReplacementParams` (whose value mapping differs): redo this call if the library is upgraded.

## The acknowledgement flow and the 3-day rule

1. The person pays in Google's sheet. Play answers `PURCHASED` with a `purchaseToken` (the purchase is **unacknowledged**).
2. The app returns `{"purchases":[{productId, token}]}` to the page; the page sends it to `POST /api/v1/entitlement/google`.
3. Our server asks Google (`purchases.subscriptionsv2.get`), checks package, subscription id, base plan and state, and answers with the access token.
4. Only then the page calls `iap.acknowledge {token}`, and the app calls `acknowledgePurchase`.
5. **Google refunds a purchase that is not acknowledged within 3 days** (the 3 days start when it becomes PURCHASED, not while it is pending), and the subscription is cancelled.
   So if the server could not be reached, nothing is acknowledged, and the next start-up/foreground/Restore sends the unacknowledged purchase again (it is in `iap.entitlements`).
   For a licence tester the window is a few minutes: an unacknowledged test purchase is refunded after about 3 minutes (Play's test rule), with an email.
6. Renewals need no acknowledgement. A plan change makes a new purchase that does.

## What each Google event looks like

| Event | What `queryPurchasesAsync` shows | Server (`subscriptionsv2`) | What the person sees |
|---|---|---|---|
| New purchase | PURCHASED, unacknowledged | ACTIVE | Premium after the server accepts; acknowledged by the page |
| Renewal | PURCHASED, acknowledged, same token | ACTIVE, new expiry | Nothing; the page's refresh swaps in a fresh access token |
| Cancelled (auto-renew off), time left | PURCHASED, not auto-renewing | CANCELED, expiry in the future (counts as active) | Premium until the end of the paid period |
| Cancelled and expired | not listed | EXPIRED | Premium ends at the next refresh |
| Payment failed, grace period | still PURCHASED | IN_GRACE_PERIOD (counts as active) | Premium continues while Google retries the card |
| Account hold (grace over, still unpaid) | **not listed** (suspended subscriptions are left out by default) | ON_HOLD (not active) | Premium stops; the person fixes the payment method in Play (`iap.manage`) |
| Refund or revocation | not listed | refunded or revoked | Premium ends at the next refresh |
| Pending payment (slow method) | PENDING | pending | "Waiting for payment"; Premium only once it turns PURCHASED |
| Plan change | new token, new base plan | new token, `linkedPurchaseToken` = old | Switched, as described above |
| Redeemed promo code / bought on another device | PURCHASED | ACTIVE | Found at the next entitlements check |

Pause (a Play Console option) is not used: leave it off.

## Play Console setup (what the founder, or Chrome automation by the lead, has to do)

Prerequisites: the developer account with a payments profile (bank and tax, so paid products can be created) and the Numbite app created with package name
`com.amanmarwaha.numbite`. Play may refuse to create a subscription until an app build that has the billing permission has been uploaded to some track: if it does, upload the first
internal-testing build first (the library puts the permission in automatically).

1. **Monetize with Play > Products > Subscriptions > Create subscription.**
   * Product ID: **`com.amanmarwaha.numbite.premium`** (exact; a product ID, base plan ID or offer ID can never be deleted or reused, so type it carefully).
   * Name: `Numbite Premium`. Benefits (shown in the Play sheet): short words, for example "Best for you, the order builder, logging, all of Premium".
2. **Add a base plan** (inside that subscription):
   * Base plan ID **`annual`**; renewal type **Auto-renewing**; billing period **Yearly (1 year)**; price **£49.99**.
   * Grace period **7 days**, account hold **on** (the default; Play shows it as 60 days minus the grace period, and the two together must be at least 30 days);
     **Resubscribe: active** (so someone whose subscription ended can buy again from Play); leave proration at the default.
3. **Add a second base plan:** ID **`monthly`**; auto-renewing; **Monthly (1 month)**; price **£4.99**; same grace period, account hold and resubscribe settings.
4. **Availability and prices** (on each base plan, "Set prices"): **United Kingdom** only for now, price in GBP as above. Do not add other countries until the prices and the
   page's wording have been decided for them. Leave "include new countries Google adds later" **off**.
5. **Offers: none.** No free-trial or introductory offer: the 7-day free week is the account's own (web/lib/payments/freeWeek.ts). If someone adds a trial offer by mistake the
   app still prefers the plain base plan, but the page's wording (no trial) would then be wrong for people shown a trial in Google's sheet.
6. **Activate both base plans** (status Draft to **Active**; a base plan that is Draft or Inactive is not returned by Play, and `iap.products` answers without it). The subscription
   itself must also show Active.
7. **License testers** (Play Console > Settings > License testing): add the founder's and testers' Google accounts, licence response "RESPOND_NORMALLY".
8. **Service account for the server** (the web/server agent's part, for completeness): Play Console > Users and permissions, invite the service account email with "View financial
   data" and "Manage orders and subscriptions", Google Cloud: enable the Google Play Android Developer API; its JSON key goes in Vercel as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

**Grace period: why 7 days.** The server treats `IN_GRACE_PERIOD` as active, so a failed card does not lock someone out while Google retries it for 7 days; after that the
subscription goes to account hold (no access, our server says 402), and the Play sheet tells them to fix the payment method. Longer grace gives free access for longer to
cards that fail for good; shorter gives people less time to notice an expired card. Seven days is the console's own example value and the middle of the usual range.

## Testing

**Unit tests (no Play):** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools; cd android && ./gradlew :app:testDebugUnitTest --console=plain` (JDK 21: Android Studio's JDK 25 breaks Gradle). 79 tests: the pure mapping,
the whole state machine against a fake connection (one purchase at a time, racing callers, pending, cancelled, already owned, plan changes both ways, late purchases, caller
cancelled, time-outs, nothing acknowledges by itself, restore not touching the connection during a purchase, acknowledge of gone or already acknowledged purchases) and the
debug fake. Tests that read the page's JSON need a real `org.json` (the Android jar's is a stub in plain JVM tests): `app/build.gradle.kts` has
`testImplementation("org.json:json:...")`; without it those tests are skipped, not failed.

**With a licence tester on a real phone** (the only way to see Google's real sheet):

1. Internal testing track: upload the AAB (`bundleRelease`), add testers by email list, send them the opt-in link, install **from Play** (a few hours after the first upload).
   A licence tester can also sideload any build with the same package name (a debug build too): Play's billing then works for that account.
2. In the sheet the licence tester has test payment methods: "Test card, always approves", "always declines", "Slow test card, approves / declines after a few minutes" (pending
   purchases), "approves then charges back". Google marks the sheet as a test and charges nothing.
3. Test subscriptions renew fast: monthly every 5 minutes, annual every 30 minutes, at most 6 renewals; grace period 5 minutes, account hold 10 minutes. Change the payment method to
   "always declines" in Play Store > Payments and subscriptions > Subscriptions to walk through grace period and hold. The Play Billing Lab app (Play Store) can push a test subscription into
   grace or hold with one tap.
4. Things to check: both plans show Play's prices; a purchase reaches the server and Premium turns on; the purchase is acknowledged (Orders tab in the Play Console shows it not refunded
   after 3 minutes); kill and reopen the app: Premium is still there (entitlements); Restore on a second phone with the same Google account; change plan both ways and see which price is
   charged when; cancel in `iap.manage` and see Premium until the end; "always declines" for grace and hold; rotate the phone with Google's sheet open (the answer must still arrive).

**Without Play (debug build, no money): the fake.** `FakePurchaseService` answers products with £49.99 / £4.99, a purchase after about 0.7 s with a made-up token
(`fake.numbite.purchase.<n>`), and keeps an in-memory list for entitlements, restore and acknowledge. **Our server rejects the made-up tokens (402 "nothing paid")**, which is the page's
"not confirmed" path; the fake is for checking the screens, not Premium. It exists only in the debug source set (`src/debug`; `src/release` has an empty twin), so a release
build contains no trace of it (checked: no `FakePurchaseService` or `fake_billing` string in the release dex). Switch it on in a debug build with `adb` (the app must be debuggable, which a
release build never is):

```sh
cat > /tmp/numbite_debug.xml <<'EOF'
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="fake_billing" value="true" />
    <string name="fake_billing_outcome">purchased</string>
</map>
EOF
adb push /tmp/numbite_debug.xml /data/local/tmp/numbite_debug.xml
adb shell run-as com.amanmarwaha.numbite sh -c 'mkdir -p shared_prefs && cp /data/local/tmp/numbite_debug.xml shared_prefs/numbite_debug.xml'
adb shell am force-stop com.amanmarwaha.numbite      # the preference is read when the app starts
# switch it off again:
adb shell run-as com.amanmarwaha.numbite rm shared_prefs/numbite_debug.xml && adb shell am force-stop com.amanmarwaha.numbite
```

`fake_billing_outcome` is optional: `purchased` (default), `pending`, `cancelled` or `unavailable` is what the fake's purchase ends with. If the debug build's package name differs
(an `applicationIdSuffix`), use that one.

## Android-side limits and things to know

* **Play Store required.** On a phone without Google Play (some Huawei and other devices, an emulator image without Play) every call answers unavailable and the page shows its "can't reach
  the store" state.
* **One Google account buys, one Numbite account claims.** A purchase belongs to the Google account on the phone, not to a Numbite sign-in. `iap.entitlements` lists whatever that
  Google account holds; which Numbite account may use a given token is the server's decision (docs/ANDROID_BRIDGE.md).
* **Subscriptions only, UK only for now,** as set up in the console. No one-time products, no prepaid plans (a plan with no recurring phase is left out of `iap.products`).
* **Plan change needs Play to agree.** If Google refuses the replacement (an unusual state of the held subscription: cancelled-but-active, on hold) the call answers unavailable and the
  person can use `iap.manage` (Google's own screen) to switch or resubscribe. How Google handles "tap the plan you already hold with auto-renew off" is unverified.
* **A suspended (account hold) subscription is not returned** by Play's purchase query in library 8.0.0, so buying again while on hold is refused by Play and the app answers
  unavailable; the person fixes the payment method through `iap.manage`.
* **Prices are Google's text for the person's country.** Today only the UK is on sale, so GBP; if more countries are added the page's wording should not hard-code "£".
* **The shell** must call `createPurchaseService` with an `activityProvider` that reads the current Activity from a holder (a `WeakReference`), and run bridge calls in an
  application-level scope, not `lifecycleScope`, or a rotation cancels the waiting call (the late result is then still kept for the next `iap.entitlements`, but the page's
  buy button would wait for an answer that never comes).
