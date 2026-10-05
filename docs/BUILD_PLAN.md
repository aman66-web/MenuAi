# Build plan: milestones

Build in this order. Each milestone ends with: the app builds, all tests pass (`./scripts/test.sh`;
use `./scripts/test.sh --unit` for quick runs between steps), the feature is checked in the
simulator, and `docs/PROGRESS.md` is updated. Run one milestone per Claude Code
session (`/milestone M3`), then `/clear`. Weeks match the 12-week plan in the blueprint PDF
(menu-data entry for real chains runs in parallel, done by the founder; see docs/DATA.md).

---

## M0 · Project foundation (week 1)
**Spec:** §5, §17. **Goal:** a clean, buildable skeleton that matches the folder layout.

*Founder does in Xcode (Claude gives click-by-click steps and waits):*
- Target › General: **iOS 17.0** minimum; Supported Destinations **iPhone only** (remove iPad, Mac,
  Vision) so App Store Connect won't ask for iPad screenshots.
- Signing & Capabilities: Team; **+ App Groups** (`group.<bundle prefix>.menumacros`),
  **+ HealthKit**, **+ In-App Purchase**.
- Product › Scheme › Manage Schemes › tick **Shared** for `MenuMacros` (so scheme settings such as
  the StoreKit file in M8 are committed; `xcuserdata/` is git-ignored).

*Claude does:*
- Check the build settings it depends on (read `project.pbxproj` or `xcodebuild -showBuildSettings`):
  Swift 6 language mode, strict concurrency complete, and Default Actor Isolation. If the template set
  MainActor isolation (Xcode 26 default), keep it and follow SPEC §5 (mark `Domain/`, `MenuData/` types
  `nonisolated`). Make any build-setting change with a minimal, surgical edit to `project.pbxproj`
  and build immediately; don't touch signing or capabilities.
- Privacy strings go in build settings (`INFOPLIST_KEY_NSLocationWhenInUseUsageDescription`, etc.),
  **not** in a new Info.plist file (one inside a synchronized folder causes "Multiple commands produce
  Info.plist").
- Create the folder structure from SPEC §5 (synchronized folders: files created on disk join the
  target automatically; verify by building). `AppConfig.swift` with the founder's IDs,
  `AppEnvironment.swift`, `RootView` with the four tabs (placeholder views).
- Previews: create `MenuMacros/PreviewContent/` with copies of `data/fixtures/chain-*.json` and a
  manifest, registered as Development Assets (`DEVELOPMENT_ASSET_PATHS`), so previews always have the
  fictional sample chains and they never ship.
- Run `python3 tools/build_menus.py --bundle-into MenuMacros/Resources/Menus` and confirm the JSON
  is in the built app bundle.
- Create the test targets if missing; add one passing Swift Testing test.
**Done when:** `./scripts/test.sh` passes; app launches to four empty tabs in the simulator.

## M1 · Menu data layer (weeks 1–2)
**Spec:** §5 (menu data at runtime), §6.1, docs/DATA.md. **Goal:** the app knows every chain.
- `MenuModels.swift`: Codable structs mirroring `data/schema/chain.schema.json` and
  `manifest.schema.json` exactly (decode with `JSONDecoder`, no custom key strategies).
- `Nutrients` with addition/scaling/subtraction rules and formatting helpers.
- `MenuFiles`: read bundle and Application Support/Menus; atomic writes.
- `MenuStore` (@Observable, @MainActor publish) and `MenuSync`: implement docs/DATA.md "How the app
  uses the data" exactly — active set in Application Support, reset from the bundle when the bundle's
  `dataVersion` is newer, all-or-nothing updates built in a temp folder and swapped atomically,
  SHA-256 verified with CryptoKit, `sample` chains hidden unless DEBUG. Network and file system
  behind protocols for tests.
**Tests:** copy `data/fixtures/` into `MenuMacrosTests/Fixtures/` (test-target resources; load with
`Bundle(for:)`/a token class, not the app bundle, so tests don't depend on which data is bundled).
Decode both sample chains; nutrient maths incl. "missing optional propagates";
search index finds "nugg" → Nuggets items; sync with a fake network: unchanged → no downloads,
changed sha → one download, bad sha → whole update rejected and active set kept, remote
`dataVersion` not newer → nothing fetched, higher schemaVersion → ignored, bundle newer than active
set → active set replaced from bundle, chain removed remotely → gone after update.
**Done when:** a debug screen (temporary) lists both sample chains with item counts.

## M2 · Settings, targets and onboarding (week 3)
**Spec:** §6.2, §6.3, §7.1, §8, §7.9 (targets part). **Goal:** a new user finishes setup in ~20 s.
- `UserSettings` (App Group UserDefaults), `Goal`, `Targets`, `TargetSuggester`, `MealBudget`.
- Onboarding flow with the exact copy; suggestion form; location permission step (uses
  `LocationService` stub until M3).
**Tests:** all four TargetSuggester vectors; age < 18 → no suggestion; meal slot boundaries
(10:29 breakfast, 10:30 lunch, 15:59 lunch, 16:00 dinner); mealBudget incl. GLP-1 cap and
remaining < share.
**Done when:** onboarding works end to end in the simulator; Skip on every step leads to Home
with defaults (2,000 kcal, no protein target).

## M3 · Home, nearby, search, favourites (week 4)
**Spec:** §7.2, §7.3, §13. **Goal:** any chain in two taps.
- `LocationService` (When-In-Use, one-shot), `NearbyChainFinder` (MapKit behind a protocol,
  name normalisation + alias matching, 10-min/500-m cache).
- Home sections (targets/left-today header, search, Near you or Popular, Favourites, Saved preview).
- Search screen with grouped results and "Request it" placeholder action.
- Favourites via SwiftData `FavoriteChain`.
**Tests:** name normalisation and matching ("Bowl & Co - Main St" → bowl-and-co; "Cluckhouse" alias;
"Cluck Housewares" must NOT match if it only shares a prefix without a word boundary — require the
match to end at a word boundary); distance formatting; search ranking (chains before items, prefix matches first).
**Done when:** with a simulated location (Xcode › Debug › Simulate Location, or `xcrun simctl location`),
Home shows nearby results using a fake finder in DEBUG; real MapKit path compiles and is manually tested.

## M4 · Chain page and item detail (week 5)
**Spec:** §7.4, §7.5, §12.3 (footer link). **Goal:** the complete free experience.
- Menu by category, sort and filter, "New"/"Limited time" tags, source footer, sample badge.
- Item detail with all nutrients and "not published".
- "Best for you" block shows a locked placeholder for now.
**Tests:** sorting (protein ↓, calories ↑, density ↓ with stable name tie-break); filters with tags;
"New" within 30 days of addedOn.
**Done when:** the free tier is fully usable offline (airplane mode in the simulator).

## M5 · Order builder (week 6)
**Spec:** §6.5, §7.6. **Goal:** customise any order with live totals.
- `OrderCalculator` (pure) for orders made of component lines and item lines (SPEC §6.5),
  plus the order-naming function.
- Builder UI for both chain types; summary card with "After this"; Save (SwiftData `SavedOrder`).
- Entry points: item "Customise", Saved list.
**Tests:** Bowl & Co. chicken bowl default = 655 kcal / 50 g; double chicken = 835 / 82;
remove cheese + swap white rice → lettuce matches the pipeline's variation nutrients exactly
(load the fixture chain JSON and compare every `combinations` entry of kind `variation` against
`OrderCalculator` — nutrients AND names must all match); Cluck House classic sandwich no mayo =
340 kcal; "add bacon" makes the order non-vegetarian; double on a non-doublable component is
rejected; a two-line order (chicken bowl + agua fresca) totals both lines; fat 20.5 displays "21g".
**Done when:** every sample variation reproduces exactly in the builder.

## M6 · "Best for you" and GLP-1 mode (week 7)
**Spec:** §6.4, §7.4 (block). **Goal:** the feature people pay for.
- `RankingEngine` + `RankingConfig` exactly as specified; result modes ranked / outOfBudget /
  nothingFits / noMatches, each with its copy.
- Cards with reason lines; tap opens the builder prefilled from the combination or item.
- Meal slot chip changes the budget live.
**Tests:** load `MenuMacrosTests/Fixtures/ranking-golden.json` and the chain files beside it, and
assert, for every case, the same `mode`, `remaining`, `budget` and ordered `picks` ids (and
`reasons` where present, formatted with `Locale(identifier: "en_US")`). Plus unit tests for each
scoring branch, the diversity rule and `noMatches` (build a tiny in-memory chain).
**Done when:** all golden cases pass.

## M7 · Saved, Today, logging, Settings (week 8)
**Spec:** §7.7, §7.8, §7.9, §6.3. **Goal:** the daily loop.
- Saved tab (limit logic with `saveLimit` trigger placeholder), "No longer on the menu" handling.
- Log action → `LogEntry`; Today tab; "left today" on Home; delete entry.
- Full Settings screen (subscription rows can be placeholders until M8).
- Accessibility pass on every screen built so far (Dynamic Type XXXL, VoiceOver labels, Dark Mode).
**Tests:** today's totals across midnight (entries at 23:59 and 00:01 fall on different days);
saved-order snapshot survives a data update that removes the item.
**Done when:** log three meals → Home and Today show correct remaining values.

## M8 · Subscriptions, paywall, gating (week 9)
**Spec:** §4, §9. **Goal:** Pro works and is honest.
- `Products.storekit` with both products and the 7-day trial; scheme uses it.
- `PurchaseService` (StoreKit 2: products, purchase, `Transaction.updates`, current entitlements,
  restore), `Entitlements.isPro`, DEBUG Pro override.
- Paywall UI and copy; triggers wired at every Pro entry point; blurred "Best for you" for free users.
- `TrialReminder` (notification permission in context, schedule at expiration − 2 days, banner fallback).
**Tests:** gating matrix (free vs Pro for each trigger id); paywall copy for the three variants
(yearly with trial, yearly without, monthly) built from product values; reminder date calculation;
StoreKitTest (`SKTestSession`) purchase → isPro true; expire subscription → false; refund → false.
**Done when:** in the simulator with the StoreKit config: buy yearly → trial → Pro unlocks →
reminder scheduled; in Debug › StoreKit › Manage Transactions, **Expire** (or **Refund**) the
subscription → Pro locks. (Cancelling only turns off auto-renew; Pro correctly stays until expiry.)

## M9 · Health, share, reports, analytics, review prompt (week 10)
**Spec:** §10, §11, §12, §14, §9 (review prompt). **Goal:** feature complete.
- `HealthService` (write-only correlation; delete on log deletion), Settings toggle.
- Share card renderer + `ShareLink`.
- Outbox (`OutboxItem` + `OutboxSender` + `APIClient`) and the three submissions: Report a number
  (with optional photo upload), Request a chain, Contact us — per SPEC §12 and docs/BACKEND.md.
- Analytics protocol + events everywhere; TelemetryDeck adapter (ask the founder for the app ID;
  keep console analytics if none).
- Review prompt rule.
**Tests:** Health sample building (types/units/metadata, missing optionals skipped) with a fake
store; outbox with a `URLProtocol` stub: 201 → sent, offline → pending then sent on retry, 429/500 →
retried, 400 → failed (no retry), 5 failures → failed; report with photo → PUT to the returned URL with
the returned Content-Type; request bodies match docs/BACKEND.md exactly; analytics never includes free
text or health values.
**Live check (if the backend is set up):** send a test report from the simulator and see it in Supabase
› `open_reports`; then delete it.
**Done when:** every v1 feature in SPEC §3 works in the simulator.

## M10 · Polish and release prep (weeks 11–12)
**Spec:** §15, §16, docs/STORE.md. **Goal:** ready for TestFlight and App Review.
- App icon placeholder → founder supplies final art; launch screen; empty states everywhere.
- `PrivacyInfo.xcprivacy`; privacy strings (`INFOPLIST_KEY_*` build settings) reviewed; privacy policy URL in Settings.
- Release data: `python3 tools/build_menus.py --no-samples --out dist/release --bundle-into MenuMacros/Resources/Menus`
  (the same `dist/release` files go to the host); verify no sample chains in a Release build and that
  previews still work (they use PreviewContent).
- Run the unit tests on an iOS 17 simulator once: `IOS_VERSION=17 ./scripts/test.sh --unit`
  (install the iOS 17 runtime in Xcode › Settings › Components if needed).
- Performance: cold launch < 1 s on a recent iPhone simulator; menu screens scroll smoothly with 300 items.
- UI smoke tests: onboarding skip → open a chain → tap "Best for you" → paywall appears.
- Run the `spec-reviewer` agent across the whole app and fix gaps.
- Archive build succeeds (Product › Archive) — the founder uploads to TestFlight.
**Done when:** the founder can upload a build and the checklist in docs/STORE.md is complete.
