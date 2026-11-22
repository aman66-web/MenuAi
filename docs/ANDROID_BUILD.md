# The Android app: how it's built and shipped (22 November 2026)

The Android app is the same web app as the iPhone app (a static export of `web/` built with `APP_BUILD=1`, packed by `scripts/pack_app_web.py`) inside a full-screen Kotlin web
view, sold with Google Play Billing. Package `com.amanmarwaha.numbite`. The contract between the page, the app and our server is **docs/ANDROID_BRIDGE.md** (single source of
truth); how the iPhone app does the same is docs/APP_BUILD.md. This file is the shell and the build.

## How it works

* `MainActivity` shows one `WebView`, edge to edge, light only. The page loads from the APK's own assets through `WebViewAssetLoader` at
  **`https://appassets.androidplatform.net/`** (`web/AppAssetHandler.kt`, routing in `web/AppFiles.kt`: exactly `BundleSchemeHandler.swift`: the file, then `<path>.html`, then
  `<path>/index.html`, then `404.html`), so it opens and works with no connection. The menus, photos and API come from numbite.com as on the iPhone.
* A script written before the page's own (`web/BridgeShim.kt`) sets `window.__numbitePlatform = "android"` and `window.webkit.messageHandlers.menumath.postMessage`, so the page's
  `hasNative()` is true and every `nativeCall` works unchanged. The app answers with `window.__menumathReply(id, result)` (`bridge/NativeBridge.kt`).
* Only the app's own page may talk to the bridge: Android puts the `NumbiteBridge` object only into frames of `https://appassets.androidplatform.net`
  (`WebViewCompat.addWebMessageListener`, `web/BridgeHost.kt`), and the origin and main frame are checked again on every message. A WebView too old for that falls back to
  `addJavascriptInterface` with a per-call check of the page being shown. Ids are validated like `BridgeRequest.isValidID`, sizes are capped like `BridgeMessages.swift`, an
  unknown action with a good id is answered `{"error":"unavailable"}`, and nothing a request does can crash the app.
* Page requests run in an application-level scope (`NumbiteApp.appScope`), not an Activity's, so a rebuilt Activity never cancels a waiting purchase or sign-in. The
  current Activity is held weakly (`NumbiteApp.currentActivity()`), which is also what `createPurchaseService` is given.

### Folder layout (`android/`)

| Path | What |
|---|---|
| `app/src/main/java/com/amanmarwaha/numbite/` | `MainActivity`, `NumbiteApp`, `AppConfig` |
| `…/web/` | asset serving and routing, navigation policy (what stays in the app), shared-list and friend links, bridge host and shim, web view clients, file chooser, safe-area variables |
| `…/bridge/` | the bridge: request parsing (`BridgeRequest`), handlers (`NativeBridge`), Google's barcode scanner, location, share sheet, permissions, notifications facade, Play review pop-up |
| `…/auth/` | sign-in in a Custom Tab with PKCE (`WebSignIn`, `Pkce`) |
| `…/reminders/` | the plan rules (`ReminderPlan`, a port of `ReminderPlanItem.swift`), alarms (`ReminderScheduler`), notifications, boot receiver, store |
| `…/session/` | the account's sign-in, AES-GCM with an Android Keystore key (`SessionStore`, `SessionCrypto`) |
| `…/billing/` | Google Play Billing (not part of this file: docs/ANDROID_BILLING.md) |
| `app/src/main/res/` | icons, splash, themes, network security config, backup rules, FileProvider paths |
| `app/src/main/assets/WebApp/` | the packed web app (git-ignored, made by `scripts/build_android_web.sh`) |
| `app/src/test/` | JUnit tests (`./gradlew :app:testDebugUnitTest`) |
| `tools/` | `cdp.mjs`, `bridge-check.mjs`: drive a debug build's bridge from the computer (never shipped) |
| `store/play-icon-512.png` | the 512 px icon Play Console asks for (made from the app's real artwork) |

## Bridge (what the Android app answers)

Full contract: docs/ANDROID_BRIDGE.md. Summary of what the shell does for each action:

| Action | Android |
|---|---|
| `scan` | **Google's code scanner** (Google Play services; Google asks for the camera itself, our app needs no code for it). EAN-13, EAN-8, UPC-A (handed over as the 13-digit EAN with a leading 0, as the iPhone's scanner does), UPC-E. Answers `{code}` (8–14 digits), `cancelled`, `denied`, or `unavailable` when Google Play services can't provide it. **The page does not call it on Android yet**: see "Switch the page to the native scanner" below |
| `locate` | `LocationManager` with the *approximate* permission only: one system question the first time the person taps "use my location"; `onlyIfAllowed` never asks; the position is never stored or sent by the app |
| `share` | the system share sheet (ACTION_SEND through the chooser); an order's PNG goes by the FileProvider from the cache folder, emptied at every start. Answers `done` when the sheet opens (Android doesn't say whether anything was sent) |
| `webAuth` google or apple | a Chrome Custom Tab on `numbite.com/api/v1/auth/<provider>/start?mode=app&challenge=…` (PKCE: the verifier never leaves the app); the tab ends on `numbite://auth?code=…`, which `MainActivity` (single task) hands to the waiting call. Closing the tab = `cancelled` (after 1.5 s); 10 minutes = `cancelled`. No key of any kind is in the app |
| `appleSignIn` | `unavailable` (Apple sign-in goes through `webAuth`) |
| `notifications.*` | local notifications: see "Reminders" |
| `keyboard.hide` | hides the keyboard and clears the focus |
| `review.request` | Google Play's in-app review pop-up (`play:review-ktx`); `{done:true}` whether or not Google shows it, `unavailable` if Play can't give it |
| `session.load` / `session.save` | the sign-in text (≤ 16 KB) sealed with AES-256-GCM, key in the Android Keystore, file in app-private storage; survives the app being killed; `value:null` forgets it. Backup and device transfer are off (`allowBackup=false`, `data_extraction_rules.xml`) |
| `deviceCheck.token` | `unavailable` (Apple's DeviceCheck) |
| `device.id` | `{deviceHash}`: SHA-256 of "numbite-device:" + the Android ID (DeviceIdentity.kt), so a second free week on the same phone can be stopped; `unavailable` without an Android ID |
| `iap.*` | `PurchaseService` from `createPurchaseService` (billing/); when it reports a purchase that arrives with nobody waiting (`PurchaseUpdateSource`), the shell dispatches `menumath:purchases` on the page, as the iPhone does |

### Switch the page to the native scanner (one line, web/)

The shell answers `scan` with Google's scanner, but `web/app/app/groceries/Scanner.tsx` only calls it for the iPhone: line 192 is
`const native = open && nativePlatform() === "ios";`. Change it to `const native = open && nativePlatform() !== null;` (the page then uses the native scanner on Android and keeps its own
camera scanner on the website). Its notes there say "iPhone" ("This iPhone can't scan barcodes…", "Turn it on in the iPhone's Settings") and want platform-neutral wording for Android
(the same applies to the map's "isn't allowed to use your location" note in app/map/page.tsx, which a phone that refused location reads as an iPhone line).

## Looking and behaving the same as the iPhone app

The founder's rule: the Android app matches the iPhone app exactly in how it looks and what it does.

* **Same page, same fonts, spacing and colours**: it is the same pack. Light only: the theme is light, `forceDarkAllowed=false`, the WebView's algorithmic darkening is off.
* **Safe areas.** The iPhone's web view fills the screen under the clock and the home bar and the page keeps clear of them with `env(safe-area-inset-*)`
  (`viewport-fit=cover`; web/app/app/_lib/statusBar.ts paints the page-coloured strip once the page has scrolled; a recipe's picture runs up under the clock). The Android WebView
  fills the screen the same way (`enableEdgeToEdge`, transparent bars, dark icons), but most WebViews only turn a *camera cut-out* into `env()`, not the status and navigation
  bars, and the phone has whichever WebView Google last updated. So the app states the four values itself, in CSS pixels, as `--sai-top/right/bottom/left` on `<html>`
  (`web/SafeAreaInsets.kt`; a document-start script, so the first paint is right; updated on rotation, three-button or gesture navigation, the keyboard), and
  **`scripts/android_safe_area.py`**, run by `build_android_web.sh`, makes the *packed copy* of the page read them first: `env(safe-area-inset-top)` becomes
  `var(--sai-top,env(safe-area-inset-top))` in the stylesheets and in script text, but never inside a Tailwind class name (renaming one would orphan its rule). Where a variable is
  unset, or a newer WebView does the bars itself, the original `env()` is what is used. `web/` and the iPhone's pack are not touched. The script has a self-test and stops
  the build if it finds an inline value it did not rewrite.
* **Keyboard.** The page is lifted above it (the container pads itself) and the bottom safe area is 0 while it is up, like the iPhone.
* **Text size.** The iPhone's web view ignores Dynamic Type, and "Standard text only" is the founder's decision (`TEXT_SIZE_CHOICE_ENABLED` false). An Android WebView scales the
  page with the phone's font size at launch (150% gave 24 px instead of 16 px), so `WebViewSetup.FOLLOW_SYSTEM_TEXT_SIZE = false` pins it to 100%. Flip it to `true` to follow the phone.
* **Splash.** The Android 12 splash screen (also backported by `core-splashscreen`): the page's grey with the app's round icon, held until the page's first paint (at most 4 s).
* **Back.** The system Back goes back in the page's history, and leaves the app when there is none (what the iPhone's swipe-back does).
* **Links.** Only the app's own origin stays inside. Other websites, `mailto:` and `tel:` open in the browser, mail app and dialler (`web/NavigationPolicy.kt`, WebAppView.swift's rules);
  `blob:`/`data:` downloads are refused; a shopping list or friend-invite link clicked inside a page loads the page for it.
  `https://numbite.com/l#…` and `/f#…` (App Links, verified by Google) and `numbite://l#…` / `numbite://f#…` open the app and load `/app/groceries/list/shared#…` or
  `/app/community/friends#…`, fragment kept.

### Where Android still differs from the iPhone app, and why

* **System dialogs and bars are Android's**: the permission questions (camera, approximate location, notifications: one each, at the moment they are needed), the share sheet, the
  photo picker and Google's scanner screen, the clock, battery and gesture bar. Same words from the page; the system's own look.
* **Scanner.** Google's scanner has its own look and no "Photo" button (the iPhone's VisionKit screen has one at the bottom right). The page's own "barcode from a photo" button
  (PhotoBarcodeButton) is still on the sheet.
* **Reminders can ring a few minutes late** (see below); the iPhone rings on the second.
* **Notification and sign-in sheets** are a Chrome Custom Tab (iPhone: the secure browser sheet) and the sign-in tab is closed by Back.
* **Apple sign-in** goes through the web path (`webAuth`) in a browser tab; there is no native Apple sheet on Android.
* **Share** can't tell whether the person finished; it answers `done` when the sheet opens.
* **Photo fields**: "Take a photo" opens the camera app (after the camera question); "choose" opens Android's photo picker (no storage permission).
* **Haptics, the system font and animations** follow Android.
* **No dark mode on either.**

## Reminders (local notifications)

The page sends its whole plan (`notifications.syncReminders`, web/lib/mm/reminders.ts); `ReminderPlan.kt` checks every field exactly as `ReminderPlanItem.swift` does (a bad item
is dropped, a plan that is not a list changes nothing, an empty list cancels everything, at most 50 items and 60 notifications). The Android facts that shape it:

* An alarm rings **once**, so the next ring of a daily or weekly reminder is set when it rings; every alarm is set again after a restart, an app update and a change of clock or time
  zone (`BootReceiver`). They follow the phone's clock and zone ("every day at 08:00" stays 08:00 across a change of clocks).
* They use `AlarmManager.setAndAllowWhileIdle`: **no exact-alarm permission** (Google restricts it to alarm and calendar apps). The price: a reminder can ring **a few minutes after
  its time** while the phone is dozing (in the emulator it rang within a minute).
* The page sends its plan again and again (every time the app opens or comes to the front, after a rotation). An alarm already waiting is left alone (`ReminderRearm`): setting it
  again in the minute after its time would find "08:00 has passed" and push it to tomorrow.
* The text is the person's own name and note (the page's neutral line when they typed none): no medication guidance, never "missed" or "late". Channel "Reminders"; tapping a
  notification opens the app. A force-stop removes every alarm (Android's rule); they are set again the next time the app opens.
* Android 13+ asks for notifications once (`POST_NOTIFICATIONS`) when the person saves their first reminder.
* What is stored: the person's reminder names, notes and times, in the app's private storage, excluded from backup. Never sent anywhere.

## Build

```bash
NEXT_PUBLIC_SUPPORT_EMAIL=<the address the live site shows> ./scripts/build_android.sh debug     # debug APK
NEXT_PUBLIC_SUPPORT_EMAIL=… ./scripts/build_android.sh aab                                         # the bundle Google Play takes
./scripts/build_android.sh apk --no-web                                                            # a release APK without packing the web app again
./scripts/android_make_icons.mjs                                                                   # icons from web/design/icon.svg (only when the artwork changes)
```

* `scripts/build_android_web.sh` is `scripts/build_app_web.sh` (the iPhone's) with three differences, kept as a clearly named copy: the version line is `Android <versionName>
  (<versionCode>)` read from `android/app/build.gradle.kts` (`NEXT_PUBLIC_APP_VERSION`), the pack goes into `android/app/src/main/assets/WebApp/`, and the Android safe-area step
  runs. Same guards: it refuses `web/.env*`, requires a real `NEXT_PUBLIC_SUPPORT_EMAIL`, clears test switches and keys (`NEXT_PUBLIC_IAP=1`, `NEXT_PUBLIC_PHOTO_RECIPES=1`,
  `APP_BUILD=1`), and greps the pack for placeholder addresses, a missing "Restore purchases", the version line and anything that looks like a private key.
* `scripts/build_android.sh debug|apk|aab [--no-web]` sets `JAVA_HOME` (JDK 21; Android Studio's own JDK 25 breaks this Gradle) and `ANDROID_HOME`, packs the web app unless
  `--no-web`, runs Gradle and prints the file and its size. The debug build is debuggable (Chrome's inspect page and `tools/` can drive it) and can use the fake purchase service
  (docs/ANDROID_BILLING.md); a release build contains neither.
* **Sizes (22 Nov 2026, `remoteImages: true` as for the iPhone):** the pack is 109 MB on disk (menus 21, recipe pictures 41, groceries 26, logos 7, code 11), **61 MB in the
  release APK and in the AAB** (Play's limit for the base module is 200 MB compressed), so the content file needed no Android copy. Dish and product photos load from the live site.
* Gradle keeps folders that start with an underscore (`_next`, `_not-found`): aapt's default drops them, which would leave the app with no scripts. `build.gradle.kts` sets
  `ignoreAssetsPattern` for that; do not remove it.

### Signing and upload (founder steps)

1. Run `./scripts/android_make_upload_key.sh` **yourself** in Terminal. keytool asks you for the password; nobody else sees it. It writes `~/.numbite-android/upload.keystore`.
   Back that file up. Then write `~/.numbite-android/keystore.properties` (four lines: `storeFile`, `storePassword`, `keyAlias=upload`, `keyPassword`; the script prints them) and
   `chmod 600` it. Without that file a release build still succeeds, **unsigned**, and says so.
2. `./scripts/build_android.sh aab`; upload `android/app/build/outputs/bundle/release/app-release.aab` in Play Console (Play App Signing: Google holds the real signing key).
3. **App Links** (so `https://numbite.com/l#…` opens the app): in Play Console › Setup › App signing copy the **SHA-256 certificate fingerprint of the app signing key**, and serve
   `https://numbite.com/.well-known/assetlinks.json` (a web/ change) with package `com.amanmarwaha.numbite` and that fingerprint. Until then those links open in the browser
   (whose page has the "I have Numbite" button for `numbite://`).
4. Supabase: `numbite://auth` is on the Redirect URLs list already (the iPhone uses it); the API's CORS list must accept `https://appassets.androidplatform.net`
   (web/lib/cors.ts; docs/ANDROID_BRIDGE.md).
5. **Target API.** `targetSdk` is 35 (Android 15). Google Play's rule is that new apps and updates target the newest-but-one Android release by 31 August each year; for 2026 that
   is Android 16 (API 36). Raise `targetSdk` to 36 before uploading if Play Console says so. The app is already edge to edge, which was the big change in 35, and `compileSdk` is 36.
6. App Privacy / Data safety answers match the iPhone's (location approximate, used on the device only; camera; account email; purchases), plus Google's code scanner and in-app review
   are Google's own services.

## Testing on an emulator (what was done on 22 November 2026, and how to do it again)

1. `sdkmanager "emulator" "system-images;android-35;google_apis;arm64-v8a"` (about 5 GB) and an AVD `numbite_test` (Pixel 6 profile, 1080x2400, 2 GB RAM). **The emulator insists on
   a 6 GB data partition and wants 7.4 GB free to create it** (an AVD config with a smaller one is rewritten). On a nearly full disk, make the file yourself: `mkfs.ext4 -F -L userdata
   -b 4096 -O ^has_journal -E lazy_itable_init=1 <avd folder>/userdata-qemu.img 1572864` (the emulator's own `emulator/bin64/mkfs.ext4`): a sparse 6 GB image that uses a few MB;
   a plain `truncate` file does not boot (boot loop). `adb root` works on this image (needed to kill the WebView renderer).
2. `./scripts/build_android.sh debug`, `adb install -r app/build/outputs/apk/debug/app-debug.apk`, launch.
3. Drive the page: `adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.amanmarwaha.numbite)` and `node android/tools/bridge-check.mjs`. (Playwright's
   `connectOverCDP` does not work with a WebView: `tools/cdp.mjs` is a plain DevTools client.)
4. Checked that day on API 35 / WebView 124, a debug build: the welcome screen offline (airplane mode, `navigator.onLine` false, fetch fails); `localStorage` and the session
   surviving `am force-stop`; every bridge call above (session save/load/forget; unknown action; `iap.*` unavailable without Play; notifications status/permission/plan; location
   with a mock network provider (`cmd location providers add-test-provider network`); share; keyboard; sign-in tab and the `numbite://auth` return and its cancel; `review.request`
   and `scan` answer `unavailable` on that image, which has no review service and no scanner module); a real reminder from the page's own store ringing, its tap opening the app;
   external links (`target=_blank`, same-window, `window.open`, `mailto:`) leaving the app with the page unchanged; Back; shared-list and friend-invite links; rotation without
   a reload; gesture and three-button navigation; the keyboard resizing the page and `keyboard.hide`; camera for the page (video granted, audio refused); photo picker and camera
   capture; a killed WebView renderer being rebuilt at the same address; the 150% system font size ignored.
5. Delete the SDK image and AVD afterwards if the disk is tight (`sdkmanager --uninstall …`).
