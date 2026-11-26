# Android app: the contract between the page, the app and our server (22 November 2026)

The Android app is the same web app as the iPhone app (a static export, `web/` built with `APP_BUILD=1`) inside a native Kotlin web view, selling Premium with
Google Play Billing. Package `com.amanmarwaha.numbite`, code in `android/`. Everything below is the single source of truth for the three pieces being
built in parallel (the web/server side, the app shell, Play Billing). If you must change it, change it here and say so in your report.

## Page ⇄ app (same protocol as the iPhone app, web/lib/mm/native.ts)

* The app injects, before any page script runs (`WebViewCompat.addDocumentStartJavaScript`, origin rule `https://appassets.androidplatform.net`), a shim:
  `window.__numbitePlatform = "android"` and `window.webkit = { messageHandlers: { menumath: { postMessage(m) { ... } } } }` which hands `JSON.stringify(m)`
  to the app (`addJavascriptInterface` object `NumbiteBridge.post(String)`). So `hasNative()` is true and every existing `nativeCall` works unchanged.
* The app answers by running `window.__menumathReply(id, result)` (result = plain JSON object) with `evaluateJavascript`.
* The page's origin inside the app is **`https://appassets.androidplatform.net`** (WebViewAssetLoader serves the packed web app from the app's assets; the iPhone
  app's is `app://menumath`). The API's CORS allow-list must accept it (web/lib/cors.ts).
* Actions the Android app answers (updated 22 Nov by the shell: the lead's addendum): `scan` (**Google's code scanner**: `{code}` with 8-14 digits as the iPhone's scanner gives them,
  `{error:"cancelled"|"denied"}`, or `{error:"unavailable"}` when Google Play services can't provide it; the page uses it once Scanner.tsx treats Android as native, see
  docs/ANDROID_BUILD.md), `locate` (the platform LocationManager with the approximate permission, one system question, `{lat,lng}` or `{error:"denied"|"unavailable"}`: the page asks
  the app whenever the bridge exists, web/app/app/map/page.tsx), `share`, `webAuth` (Custom Tabs for **google and apple**, returns to `numbite://auth?code=…`), `appleSignIn`
  (`{error:"unavailable"}`), `notifications.*` (local notifications), `keyboard.hide`, `review.request` (Google Play's in-app review pop-up: `{done:true}` whether or not Google shows
  it, `{error:"unavailable"}` if Play can't give it), `session.load` / `session.save` (Android Keystore), `deviceCheck.token` (`{error:"unavailable"}`: Apple's DeviceCheck), `device.id` (`{deviceHash}`: SHA-256 of
  `"numbite-device:" + Settings.Secure.ANDROID_ID`, 64 lower-case hex characters; `{error:"unavailable"}` without an Android ID; the Android ID itself never leaves the phone), `steps.status` / `steps.get {days, ask}` / `steps.openSettings` / `steps.stop` (the same answers as the
iPhone's, docs/APP_BUILD.md "Steps"; Google's Recording API, see "Steps" below), and `iap.*` below. The app also dispatches `window.dispatchEvent(new Event("menumath:purchases"))` when Play reports a purchase nobody was waiting for.

## Steps (Google's Recording API on mobile, 26 November 2026)

Since Android 9 an app that isn't on screen can't read the step sensor, so a whole day's steps come from **Google Play services' on-phone step recording** (the
Recording API on mobile, `com.google.android.gms:play-services-fitness` 21.3.0, only its `FitnessLocal` / `LocalRecordingClient` classes; founder approved the
library on 26 Nov under CLAUDE.md rule 6). No Google account, no Google Fit, no Health Connect: Google Play services records the steps on the phone and keeps ten days.
Code: `bridge/RecordingStepCounter.kt` (the rules, unit-tested with a pretend recorder: `RecordingStepCounterTest`), `bridge/PlayStepRecorder.kt` (Google's calls, the
permission, the Settings page), `bridge/StepCounter.kt` (day ranges and replies, `StepsBridgeTest`).

| Action | payload | answer |
|---|---|---|
| `steps.status` | – | `{permission:"granted"\|"denied"\|"notDetermined"}`, or `{error:"unavailable"}` when Google Play services is missing or older than 24.15 (`LOCAL_RECORDING_CLIENT_STEPS_MIN_VERSION_CODE`). Never asks |
| `steps.get` | `{days: 1-7, ask}` | `{steps:[{date:"YYYY-MM-DD", steps, partial?}]}` oldest first, `{permission:"notDetermined"}` (nobody asked and `ask` isn't `true`), `{error:"denied"}` or `{error:"unavailable"}` |
| `steps.openSettings` | – | `{done:true}`: the app's page in Android Settings (App info › Permissions › Physical activity) |
| `steps.stop` | – | `{done:true}`: recording stops (`unsubscribe`); Google Play services' recorded steps for the app can no longer be read |

* **The question:** Android's "Physical activity" (`ACTIVITY_RECOGNITION`, Android 10+) is asked only by `steps.get` with `ask:true` (the person tapped "Turn on step
  counting"). "notDetermined" until the app has asked once; afterwards a permission not held is "denied" (Android answers no at once after two refusals), and the page
  shows its line with Open Settings. Android 8 and 9 have no question: `com.google.android.gms.permission.ACTIVITY_RECOGNITION` (manifest, `maxSdkVersion` 28) is given at
  install, so status is "granted"; if Google Play services refuses there anyway the answer is "unavailable" (nothing to switch on in Settings).
* **Recording starts on turn-on** (`subscribe(TYPE_STEP_COUNT_DELTA)`), so the first day is counted from that moment: it is sent with `partial:true`, and the days before
  it are not sent at all (the page says "Not counted"). Each later read subscribes again (nothing happens if the recording is there; it comes back if Google Play services
  dropped it). If Google says there is no recording (`ApiException` 5011, `FitnessStatusCodes.API_EXCEPTION`), or the permission was seen to be off, recording starts again
  and that day is a new first day.
* **Reading:** one `readData` per calendar day (local midnight to midnight, today to now; `aggregate(TYPE_STEP_COUNT_DELTA)`, `bucketByTime(1, DAYS)`, every bucket and
  point added up, so a 23- or 25-hour day when the clocks change is one day). A day Google can't answer is left out; a `SecurityException` is `{error:"denied"}`.
* **Privacy (CLAUDE.md rule 4):** the counts are handed to the page and kept nowhere by the app. The app keeps only, in its own preferences (`numbite_steps`), whether it
  has asked the question and when the current recording began (`since`, removed by `steps.stop`). Nothing is sent. Data safety: not collected (docs/ANDROID_STORE.md).

## In-app purchase (Google Play Billing)

Product (**one** auto-renewable subscription with **two base plans**, so Google itself stops anyone holding both and offers a plan change; **no free-trial offer**:
the 7-day free week is the account's own, exactly as on the iPhone, `web/lib/payments/freeWeek.ts`): subscription id `com.amanmarwaha.numbite.premium`,
base plans `annual` (£49.99 a year) and `monthly` (£4.99 a month). The page and the app name a plan as **`<subscription id>:<base plan id>`**, e.g.
`com.amanmarwaha.numbite.premium:annual` (never the iPhone's `…pro.annual` ids).

| Action | payload | answer |
|---|---|---|
| `iap.products` | `{ids:["…premium:annual","…premium:monthly"]}` | `{products:[{id:"…premium:annual",name,price,period:"month"\|"year"}]}` (price is Play's own formatted text of the base plan) or `{error:"unavailable"}` |
| `iap.purchase` | `{id:"…premium:annual"}` | `{purchases:[{productId,token}]}` \| `{pending:true}` \| `{error:"cancelled"\|"unavailable"}`. If the person already holds the other plan, the app asks Play for a plan change (replacement), never a second subscription |
| `iap.entitlements` | – | `{purchases:[{productId,token}]}` (current, not expired or refunded; empty list is a real answer) \| `{error:"unavailable"}` |
| `iap.restore` | – | same as `iap.entitlements`, after syncing with Google Play |
| `iap.manage` | – | `{done:true}` (opens Google Play's subscription screen for our subscription) |
| `iap.acknowledge` | `{token}` | `{done:true}`; the page sends it **after our server has accepted the purchase** (Google refunds an unacknowledged purchase after 3 days) |

`productId` in a purchase is the subscription id (`com.amanmarwaha.numbite.premium`); which plan it is comes from Google's answer to our server (the base plan id).
`token` is Google's `purchaseToken` (opaque, `[A-Za-z0-9._-]`, up to 4,000 characters). The new result field is **`purchases`** (the iPhone's `transactions` are
Apple JWS strings and stay as they are).

## Page → our server

`POST {API_BASE}entitlement/google` body `{ "purchases": [ { "productId": "...", "token": "..." } ] }` (up to 10) →
`200 { token, plan, expiresAt }` (the same signed access token as every other source, `src: "google"`, plan `annual`|`monthly`) · `402` nothing paid · `400` bad body ·
`429` too many · `503` not set up. The server asks Google (Play Developer API `purchases.subscriptionsv2.get`) with a service account and checks: our package name,
our subscription id, the base plan (`annual`→ plan annual, `monthly`→ plan monthly), the subscription is active (`SUBSCRIPTION_STATE_ACTIVE`, or `…_IN_GRACE_PERIOD`, or `…_CANCELED` while its expiry is in the future), not refunded or
revoked. Server env (Vercel, Sensitive): `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (the whole key file), `GOOGLE_PLAY_PACKAGE_NAME` (default `com.amanmarwaha.numbite`).

The free week and gifts use the existing `POST /api/v1/entitlement/account` unchanged (keyed hash of the account's email; on Android the page sends `{androidDeviceHash}` from `device.id` in place of DeviceCheck's token, and the server hashes it again with its own secret, kind `android`; web/lib/payments/freeWeek.ts).
A purchase from Google Play wins over the account's free week the way an App Store one does (web/lib/payments/accountAccess.ts, iap.ts).
