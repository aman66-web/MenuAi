# MenuMacros — product and technical spec (v1)

Read the section you need before implementing it. Section numbers are referenced from
`docs/BUILD_PLAN.md`. The full business blueprint (market, marketing) is in
`docs/MenuMacros_App_Blueprint.pdf`; you don't need it to write code. **Where the PDF and this
spec differ, this spec wins** (it is newer and more precise). Decisions logged in
`docs/PROGRESS.md` override both.

---

## 1. What we're building

An iPhone app for people in the US who count calories or protein and eat at chain
restaurants. Open it, pick the restaurant you're at (or one nearby), and see full calories,
protein, carbs and fat for every item. Pro users also get the five best orders for their goal
that fit what they have left today, and an order builder that totals a customised meal live.

**The job:** "I'm at (or near) a restaurant. Tell me, in ten seconds, what I can eat that fits
my goal, and let me tweak it."

**Principles (apply to every decision):**
1. Speed at the counter: any chain in ≤ 2 taps from launch; works offline.
2. Honest numbers: only published chain data, source and date shown, never estimated.
3. Fair free tier: full menus with macros are always free. Pay for decisions, not data.
4. No judgement: never label food "good"/"bad"; no traffic-light colours on food.
5. No medical claims. GLP-1 mode = "smaller, protein-first orders".
6. Private by default: no account; personal data stays on the phone.

**Name:** "MenuMacros" is the working/project name. The name users see is `AppConfig.appName`
(currently "Menu Math", matching the website's `web/site.config.ts`); every `{appName}` in this spec's
copy means that constant. Never hard-code the name in user-facing text (privacy strings in build
settings are the one exception: write the final name there, and set the Display Name to match).

**Market:** United States only at launch; English; US units (kcal, g, mg; lb and ft/in for body
measurements). iPhone only (no iPad layout work in v1; it runs in compatibility mode).

---

## 2. Users

| Persona | Goal setting | What they need most |
|---|---|---|
| Protein-focused gym-goer | Build muscle | Top orders by protein per calorie; double protein in the builder; saved go-to orders |
| Dieter on a budget (e.g. 1,500 kcal/day) | Lose weight / Maintain | "What fits my remaining calories here?"; swaps that cut calories |
| GLP-1 user | "I'm on a GLP-1 medication" | Small, protein-dense meals capped by a comfortable meal size |

---

## 3. Scope

**v1 (this build):** onboarding; goals and targets; home with nearby chains, favourites, search;
chain page with full menu, sort, filter; item detail; "Best for you" (Pro); order builder (Pro);
saved orders (3 free, unlimited Pro); Today log (Pro); Apple Health logging (Pro); share card;
report a number; request a chain; settings; subscriptions with free trial; trial reminder;
review prompt; analytics; offline menus with remote updates.

**v1.1+ (do not build now, but don't block):** home-screen widget, Siri/App Intents, day planner,
FatSecret long-tail search, Apple Watch, barcode scan, iCloud sync, Android, the one-time
$24.99 win-back offer (needs signed promotional offers → server or RevenueCat).
Architectural consequence: keep the SwiftData store and settings in an **App Group** container
from day one so a widget can read them later.

**Never:** estimating menus from photos; allergy filtering; social feeds/streaks/badges;
restaurant logos, brand colours or food photos; ads; selling data.

---

## 4. Free vs Pro

| Capability | Free | Pro | Paywall trigger id |
|---|---|---|---|
| Every chain's full menu with calories, protein, carbs, fat (+ sodium, sugar, fibre, sat fat when published) | ✓ | ✓ | |
| Source + "checked on" date per chain | ✓ | ✓ | |
| Goals, targets, GLP-1 meal cap | ✓ | ✓ | |
| Nearby chains, search, favourites | ✓ | ✓ | |
| Sort (protein, calories, protein per 100 cal) and filters (vegetarian, no pork, no beef) | ✓ | ✓ | |
| Share card | ✓ | ✓ | |
| Report a number, request a chain | ✓ | ✓ | |
| Saved orders | 3 | Unlimited | `saveLimit` |
| "Best for you" top 5 | blurred preview | ✓ | `bestForYou` |
| Order builder (customise) | — | ✓ | `orderBuilder` |
| Log a meal (Today totals, "left today") | — | ✓ | `log` |
| Write to Apple Health | — | ✓ | `log` |

Free users see "Your targets" (not "left today") on Home, because nothing is logged.
Cancelling Pro never deletes data: saved orders beyond 3 stay visible and usable read-only;
logs stay; Pro actions lock again.

---

## 5. Architecture

**Stack:** Swift 6, SwiftUI, iOS 17.0 minimum, SwiftData (user data), StoreKit 2, HealthKit,
MapKit + Core Location, UserNotifications, Swift Testing for unit tests, XCTest for UI tests.
No third-party dependencies in v1 except an optional analytics SDK in M9 (TelemetryDeck via SPM).

**Pattern:** feature folders, `@Observable` view models where a screen has logic, plain
SwiftUI views otherwise. Business logic lives in pure, testable types with no UI imports.
Dependencies are passed in through the SwiftUI environment (`AppEnvironment`), with protocol
seams for anything that touches the system (location, health, store, notifications, analytics,
network) so tests and previews use fakes.

```
MenuMacros/
  App/              MenuMacrosApp.swift, AppEnvironment.swift, AppConfig.swift, RootView.swift (TabView)
  Domain/           Nutrients.swift, Goal.swift, Targets.swift, TargetSuggester.swift,
                    MealBudget.swift, RankingEngine.swift, RankingConfig.swift, OrderCalculator.swift
  MenuData/         MenuModels.swift (Codable, mirrors docs/DATA.md), MenuStore.swift (@Observable, in-memory index),
                    MenuSync.swift (manifest diff + download + SHA-256 verify), MenuFiles.swift (bundle/App Support IO)
  Persistence/      SwiftData models: SavedOrder, LogEntry, FavoriteChain, OutboxItem; ModelContainer setup (App Group)
  Settings/         UserSettings.swift (@Observable, UserDefaults in App Group)
  Services/         LocationService, NearbyChainFinder, HealthService, PurchaseService (StoreKit 2),
                    Entitlements (isPro), TrialReminder, Analytics, ReviewPrompter,
                    APIClient (POST to AppConfig.apiBaseURL), OutboxSender (queued submissions), MailComposer (fallback)
  Features/         Onboarding/, Home/, Search/, Chain/, ItemDetail/, OrderBuilder/, BestForYou/,
                    Saved/, Today/, Settings/, Paywall/, Report/, ShareCard/
  DesignSystem/     Theme.swift (colours, spacing), NutrientRow, MacroSummary, ProBadge, LockedOverlay, EmptyState
  Resources/        Menus/ (bundled JSON from the pipeline), Assets.xcassets, PrivacyInfo.xcprivacy,
                    Products.storekit (local StoreKit testing)
MenuMacrosTests/    Swift Testing; Fixtures/ = copy of data/fixtures/ (golden ranking cases + sample chain JSON)
MenuMacrosUITests/  smoke tests: onboarding, open chain, paywall appears on Pro tap
```

**Menu data at runtime:** decoded from JSON files into immutable structs and indexed in memory
(`MenuStore`): chains by id, items by (chainId, itemId), components by (chainId, componentId),
a search index (lower-cased, diacritic-folded names of chains and items). Menus are reference
data and are **not** stored in SwiftData. The loading and update rules are in docs/DATA.md
("How the app uses the data") and must be followed exactly. Decode off the main actor; publish on
the main actor. Keep JSON dates (`checkedOn`, `addedOn`) as `String` in the Codable models and parse
them with a fixed `en_US_POSIX` `yyyy-MM-dd` formatter when needed; treat empty `portion`/`serving`
strings as absent.

**User data (SwiftData):**
- `SavedOrder`: id (UUID), createdAt, chainId, name, baseItemId?, lines [OrderLine] (see §6.5), nutrientsSnapshot, dataVersionAtSave.
- `LogEntry`: id, loggedAt, chainId, name, nutrients, source (`item`/`combination`/`custom`/`savedOrder`),
  healthCorrelationUUID: String?, healthSampleUUIDs [String].
- `FavoriteChain`: chainId, addedAt.
- `OutboxItem`: id, createdAt, kind (`report` / `chainRequest` / `support`), payload (the JSON body
  from docs/BACKEND.md), photoData (optional, resized JPEG), status (`pending` / `sent` / `failed`),
  attempts, lastAttemptAt, serverId (optional). See §12.
Nutrient snapshots let history survive menu changes. Store references as Codable value types.

**Settings (UserDefaults, App Group suite):** goal (`enum Goal: String { case lose, maintain,
buildMuscle, glp1 }`), dailyCalories, dailyProtein (optional), hasSetTargets (false until the user
saves targets in onboarding or Settings), glp1MealCap (default 450), preferences (vegetarianOnly,
noPork, noBeef), healthLoggingEnabled, hasCompletedOnboarding, paywallDismissCount, proActionCount
(for review prompt), lastMenuSyncAt. The nearby-chains cache (and the last coordinate used for it)
lives **in memory only**.

**Concurrency:** Swift 6 strict concurrency. Services are actors or `@MainActor` classes as
appropriate; no `DispatchQueue` unless an Apple API requires it. Xcode 26 app templates default to
**MainActor isolation** for the whole target: keep that for UI code, and mark the pure types in
`Domain/` and `MenuData/` `nonisolated` (and `Sendable`) so decoding, ranking and maths can run off
the main actor and in tests without hopping.

---

## 6. Domain logic (pure, fully unit-tested)

### 6.1 Nutrients

`struct Nutrients: Codable, Equatable, Sendable` with `calories: Int`, `protein, carbs, fat: Double`
and optionals `saturatedFat, sugar, fiber: Double?`, `sodium: Int?`.
- Addition / scaling follow docs/DATA.md: an optional appears in a total only if every part has it.
  Subtraction (remove modifiers) never goes below 0.
- `proteinPer100Cal = calories > 0 ? protein / calories * 100 : 0`.
- Display: calories as integer with grouping ("1,050 cal"); grams as integers; density with 1
  decimal ("9.5g per 100 cal"); missing optionals as "not published".
- Rounding everywhere: half away from zero — `value.rounded(.toNearestOrAwayFromZero)`, or
  `.number.rounded(rule: .toNearestOrAwayFromZero, increment: 1)` in `FormatStyle`. Don't rely on
  default number formatting (it rounds half to even: 20.5 → "20"). Test: Bowl & Co. chicken bowl fat
  20.5 → "21g".
- Formatting uses the device locale; unit tests pin `Locale(identifier: "en_US")` so golden strings
  such as "1,050 cal" are stable.

### 6.2 Targets and suggestions

Targets: `dailyCalories: Int` (default 2,000 until set), `dailyProtein: Int?`, `hasSetTargets: Bool`.

Suggestion (Mifflin-St Jeor), offered from onboarding step 2 and Settings:
- Inputs: sex for the formula (Male / Female / Prefer not to say), age (18–100; under 18 → no
  suggestion, show "Ask a doctor or dietitian for targets."), weight (lb), height (ft + in),
  activity (Mostly sitting 1.2 · Lightly active 1.375 · Active 1.55 · Very active 1.725).
- kg = lb × 0.45359237; cm = (ft × 12 + in) × 2.54.
- BMR = 10·kg + 6.25·cm − 5·age + s, where s = +5 (male), −161 (female), −78 (prefer not to say).
- TDEE = BMR × activity.
- Calories: lose −500, maintain ±0, build muscle +250, GLP-1 −500; minimum 1,200; round to nearest 10.
- Protein g/kg: lose 1.4, maintain 1.2, build muscle 1.6, GLP-1 1.4; round to nearest 5.
- Always shown with: "Suggested starting points, not medical advice. Adjust any time."

Test vectors (calories, protein):

| Sex | Age | Weight | Height | Activity | Goal | Expected |
|---|---|---|---|---|---|---|
| Male | 30 | 180 lb | 5'10" | Active | Lose | 2,260 kcal, 115 g |
| Female | 42 | 150 lb | 5'4" | Lightly active | GLP-1 | 1,320 kcal, 95 g |
| Prefer not to say | 25 | 200 lb | 6'1" | Very active | Build muscle | 3,460 kcal, 145 g |
| Female | 70 | 110 lb | 5'0" | Mostly sitting | Lose | 1,200 kcal (floor), 70 g |

### 6.3 Left today and meal budget

- `loggedToday` = sum of `LogEntry.nutrients` with `loggedAt` in the current local calendar day.
- `remainingCalories = dailyCalories − loggedToday.calories` (may be negative);
  `remainingProtein = dailyProtein − loggedToday.protein` (if a protein target is set).
- Meal slot from local time, user-switchable on the chain page: breakfast before 10:30,
  lunch 10:30–15:59, dinner from 16:00. Shares: breakfast 0.25, lunch 0.35, dinner 0.40.
- `mealBudget = min(remaining, round(dailyCalories × share))`; GLP-1 goal:
  `mealBudget = min(remaining, glp1MealCap)`.
- Free users: logged is always 0, so remaining = daily target.

### 6.4 Ranking engine ("Best for you")

Pure function: `RankingEngine.rank(chain:profile:loggedCalories:meal:preferences:) -> RankingResult`.
`preferences` = the chain page's current filter state (which starts from Settings preferences).
Goal raw values `lose`, `maintain`, `buildMuscle`, `glp1`; meals `breakfast`, `lunch`, `dinner`;
result modes `ranked`, `outOfBudget`, `nothingFits`, `noMatches` (these strings appear in the fixture).
Constants live in `RankingConfig` (tunable later). **The Python reference
`tools/reference_ranking.py` is the oracle; the Swift engine must pass every case in
`data/fixtures/ranking-golden.json`.**

1. **Candidates:** every item with `rankable == true` (as-is; baseKey = item id; itemCount 1),
   plus every entry in `combinations` (baseKey = `baseItemId ?? id`). Exclude calories ≤ 0.
2. **Preferences:** vegetarianOnly → keep only tag `vegetarian`; noPork → drop `contains_pork`;
   noBeef → drop `contains_beef`. If nothing is left → mode `noMatches`, no picks, copy:
   "Nothing here matches your filters." with a **Clear filters** button.
3. **Out of budget:** if `remainingCalories < 200` → mode `outOfBudget`: the 5 lowest-calorie
   candidates with protein ≥ 10 g, sorted by calories ↑, protein ↓, name ↑. Banner:
   "You've used today's calories. Lowest-calorie options:". If none qualify (fixture case H):
   "You've used today's calories, and nothing here has 10g+ protein." with no cards.
4. **Fit:** keep candidates with calories ≤ mealBudget. If none → mode `nothingFits`: the 3
   lowest-calorie candidates (calories ↑, name ↑), each labelled "Over by N cal".
5. **Score:** d = protein ÷ calories × 100.
   - lose, GLP-1: `d + 2.0 × (1 − calories ÷ mealBudget)`
   - build muscle: `d + 0.05 × protein`
   - maintain: `d`
6. **Order:** GLP-1 only: candidates with protein ≥ 25 g first. Then score ↓ (compare scores rounded
   half-up to 6 decimals), then (mealBudget − calories) ↑, then itemCount ↑, then name ↑ (plain
   Swift `String <`, not a localized compare).
7. **Diversity:** walking the ordered list, skip a candidate if 2 already-picked candidates share its baseKey.
8. **Return** the first 5, each with reason "58g protein · 610 cal · 9.5g per 100 cal"
   (calories grouped: "1,050 cal").

Worked example (fixture case A, fictional Bowl & Co.): build muscle, 2,400 kcal/day, 1,350 logged,
lunch → remaining 1,050, budget min(1,050, 840) = 840 → #1 "Chicken salad · double chicken · no
cheese, no honey lime vinaigrette" (65 g, 410 cal, 15.9 g per 100 cal).

### 6.5 Order calculator (builder maths)

An **order** is a list of lines; total = Σ line totals (DATA.md rules for optional nutrients).
- **Component line** (an item that has `components`): `itemId` + state `[componentId: qty]`
  (qty 1 or 2; 2 only if `allowDouble`). Line total = Σ component.nutrients × qty.
- **Item line** (an item without components): `itemId` + `modifierIds`. Line total =
  item.nutrients + adds − removes (never below 0).
- Any chain can mix both kinds (Bowl & Co.'s "Agua fresca" has no components, so it's an item line).
- A builder session starts from: an item (one line from its default recipe), a combination
  (`components` → one component line for `baseItemId`; `items` → item lines), or a saved order.
- Rules: an order needs ≥ 1 line, and a component line needs ≥ 1 component; any component can be removed or added
  (`removable` only steers the generated variations); swaps only within the same group; "Double"
  only when `allowDouble`.
- **Order name** (Save default, share card, log entry) = item name + " · " + changes, using exactly
  the pipeline's wording and order: doubles ("double chicken"), then removals joined with ", "
  ("no cheese, no sour cream"), then swaps ("romaine lettuce instead of white rice"), then added
  components ("add guacamole"); modifiers use their label. Component names and labels have their first
  letter lower-cased unless the second letter is upper-case ("no mayo", "no BBQ sauce"). Multi-line orders join line names with " + ".
  Test: every `variation` in the fixture chains reproduces its `name` and `nutrients` exactly.
- Output also: `afterThis = remaining − total` (calories and protein), shown as
  "After this: 440 cal · 34g protein left today" (Pro) and in red-free neutral text if negative:
  "After this: 120 cal over today's target".

---

## 7. Screens

Navigation: `TabView` with **Home · Saved · Today · Settings**. Chain page, item detail and order
builder push on the Home/Search stack; paywall, report, request and share are sheets.

### 7.1 Onboarding (4 screens, full-screen cover on first launch)
Exact copy in §8. Progress "Step n of 4". Screens 1–3 have **Skip** = skip this step only (keep
defaults) and go to the next; screen 4 has only **Start**. Reaching the end sets
`hasCompletedOnboarding`. Saving targets on step 2 sets `hasSetTargets`. No account, no email, no
paywall, no review prompt.

### 7.2 Home
Top: "Where are you eating?" title. Below it:
- Pro: "Left today: **1,050 cal · 92g protein**" + progress bar of calories used.
  Free: "Your targets: 2,000 cal · 120g protein". When `hasSetTargets` is false: dismissible card
  "Set your targets to see what's left today" → Settings › Targets.
- Search field (opens Search).
- **Near you** (up to 10 chains with distance "0.3 mi"), when location is authorised.
  Not authorised → section replaced by "Popular" (all chains alphabetical, first 10) and a small
  "Turn on location to see chains near you" row.
- **Favourites** (if any), **Saved orders** (up to 3 most recent, "See all" → Saved tab).
- Offline / no network: everything still works from stored menus; no error banners for sync.

### 7.3 Search
Type-ahead over chain names and item names (min 2 chars, diacritic- and case-insensitive,
prefix-of-word match). Results grouped: Chains, then Items ("Chicken wrap · Cluck House · 440 cal").
No results: "We don't cover this yet." + **Request it** (→ §12.2).

### 7.4 Chain page
Header: chain name (plain text), cuisine, ★ favourite toggle. Meal slot chip
(Breakfast / Lunch / Dinner, defaults from time). Sections:
1. **Best for you** (5 cards: name, reason line; tap → Order builder prefilled).
   Free: the block renders with real cards blurred + overlay "See your 5 best orders · Try Pro free"
   → paywall `bestForYou`. Modes `outOfBudget`/`nothingFits`/`noMatches` show their copy (§6.4).
   The block uses the page's current filters and meal chip.
2. **Full menu** grouped by category (data order). Row: name, then "520 cal · 32g protein · 55g carbs · 18g fat".
   Tags: "New" (addedOn within 30 days), "Limited time". Sort menu: Menu order (default),
   Most protein, Fewest calories, Most protein per 100 cal (sorting flattens categories).
   Filter menu: Vegetarian, No pork, No beef (defaults from Settings preferences).
3. Footer: "Source: {source.title}, checked {d MMM yyyy}" with link; "Not affiliated with {chain}.";
   "Something look wrong? Report a number".
Sample chains (`sample == true`) appear only in DEBUG builds, with a "Sample data" badge.

### 7.5 Item detail (sheet or push)
Name, serving, big calories, then protein/carbs/fat, then sat fat, sodium, sugar, fibre
("not published" when missing). Buttons: **Customise** (Pro → builder), **Log** (Pro),
**Save**, **Share**. "Report a number" link.

### 7.6 Order builder (Pro)
- One card per order line (§6.5). **Component line:** groups in order base, wrap, protein, topping,
  sauce, side, drink, extra; each component row: name, portion, calories; controls: remove,
  "Double" toggle when allowed, **Swap** (picker of other components in the same group); "Add" lists
  the chain's components not in the line, by group. **Item line:** quantity stepper and the item's
  published modifiers as toggles (none → no toggles).
- "Add item" adds another line from the chain's menu (e.g. a side or a drink).
- Sticky summary card: total calories and protein large; carbs, fat; "After this: …" (§6.5).
- Actions: **Save** (name defaults to item name + changes), **Log**, **Share**.

### 7.7 Saved (tab)
List by most recent; chain name; totals. Tap → builder (Pro) or read-only detail (free). Swipe to
delete. Free: when 3 exist, the 4th Save shows paywall `saveLimit`. If a referenced item/component
no longer exists: row label "No longer on the menu", nutrients from the snapshot, builder disabled.

### 7.8 Today (tab, Pro)
Free: explainer + "Try Pro free". Pro: totals vs targets (calories, protein; carbs and fat as
plain numbers), list of today's entries (time, name, chain, cal, protein), swipe to delete
(also deletes Health samples if written). "Plan dinner" placeholder hidden until v1.1.

### 7.9 Settings
Goal; daily targets (+ "Suggest targets"); GLP-1 comfortable meal size (only when goal is GLP-1);
preferences (vegetarian, no pork, no beef); Apple Health (toggle → permission); Location
(status + open Settings); **Subscription** (status, "Manage subscription" → `.manageSubscriptionsSheet`,
"Restore purchases" → `AppStore.sync()`); "How we get our numbers" (static page: §12.3);
Contact us (§12.4); Privacy policy; Terms of use (Apple standard EULA); data version
("Menus updated {date}", from `dataVersion`); app version. DEBUG only: reset onboarding, toggle
Pro override, clear logs.

### 7.10 Paywall (sheet) — §9.

### 7.11 Report a number / Request a chain (sheets) — §12.

**Every screen:** supports Dynamic Type up to accessibility sizes (layouts reflow, nothing
truncated that matters), VoiceOver labels on nutrient rows ("Chicken bowl, 655 calories,
50 grams protein, 67 grams carbs, 21 grams fat" — same rounding as the display), Dark Mode, 44 pt minimum tap targets,
one-handed reach (primary actions at the bottom).

---

## 8. Onboarding copy (exact)

1. **What's your goal?** — "We'll use this to rank orders for you. Change it any time."
   Options: *Lose weight* · *Maintain* · *Build muscle* · *I'm on a GLP-1 medication*.
   Buttons: **Continue** · Skip
2. **Your daily targets** — Calories [field] · Protein [field] g.
   Link: "Not sure? Suggest targets for me" (→ §6.2 form, inline).
   GLP-1 users also see: "Comfortable meal size: 450 calories" (editable).
   Note under suggestions: "Suggested starting points, not medical advice. Adjust any time."
   Buttons: **Continue** · Skip
3. **Find restaurants near you** — "We use your location only on this phone, to list the chains
   nearest you. It's never stored or shared." Buttons: **Allow location** · Not now
4. **Here's how it works** — three lines with SF Symbols: "Pick a restaurant" ·
   "See every item's calories and protein" · "Build the order that fits your day". Button: **Start**

---

## 9. Paywall and subscriptions

**Products** (one subscription group "{appName} Pro"; replace the bundle prefix):
- `com.yourcompany.menumacros.pro.yearly` — $34.99/year, introductory offer: 7-day free trial.
- `com.yourcompany.menumacros.pro.monthly` — $6.99/month, no trial.
Create `Resources/Products.storekit` with both for local testing; set it in the scheme.

**When shown:** only when a free user taps a Pro action (trigger ids in §4); never at launch, during
onboarding, or on a timer. Closing returns to exactly where they were.

**Layout and copy:**
- Title: "Build the perfect order, every time"
- Bullets: "✓ Top 5 picks for your goal at every chain" · "✓ Build your order with live totals" ·
  "✓ Log to Apple Health in one tap" · "✓ Unlimited saved orders"
- Plan selector: **Yearly · {yearly price} ({price ÷ 12}/month)** (default) and **Monthly · {monthly price}**.
  The yearly row shows "{n}-day free trial" only when the user is eligible.
  All prices and the trial length come from StoreKit (`Product.displayPrice`, `price`,
  `subscription.introductoryOffer.period`, `subscription.isEligibleForIntroOffer`) — never hard-code
  them in UI. The values in this spec ($34.99, $6.99, 7 days) are what App Store Connect is set to.
- Button and small print (small print in body-small size, never hidden), three variants:
  - Yearly, eligible for trial — button "Start {n}-day free trial"; small print: "Free for {n} days,
    then {yearly price}/year. We'll remind you 2 days before your trial ends. Cancel any time in Settings."
  - Yearly, not eligible — button "Subscribe"; small print: "{yearly price}/year, renews automatically.
    Cancel any time in Settings."
  - Monthly — button "Subscribe"; small print: "{monthly price}/month, renews automatically. Cancel any
    time in Settings."
  - All variants end with links: Restore · Terms · Privacy.
- Close (×) top-left, always visible.

**Entitlement:** `PurchaseService` listens to `Transaction.updates` at launch, checks
`Transaction.currentEntitlements`, and publishes `isPro`. Pro if any verified, non-revoked
transaction in the group is active (including trial and grace period).

**Trial reminder:** after a purchase whose transaction is an introductory offer (`transaction.offer?.type
== .introductory` on iOS 17.2+, `transaction.offerType == .introductory` below that, behind
`if #available`), ask for notification permission with context ("Get a reminder before
your trial ends?") and schedule a local notification at `expirationDate − 2 days`, 10:00 local:
"Your {appName} trial ends in 2 days. Keep Pro or cancel in Settings — no charge if you cancel before {date}."
If permission is denied, show an in-app banner on Home on day 5 instead.

**Dismissals:** count paywall dismissals (analytics); the $24.99 one-time offer is deferred (§3).

**Review prompt:** after the user's 3rd successful save/log/share (lifetime), call SwiftUI
`requestReview` once per app version; never during onboarding or right after a paywall.

---

## 10. Apple Health (Pro)

- Write only. Request authorization (share) for: dietaryEnergyConsumed, dietaryProtein,
  dietaryCarbohydrates, dietaryFatTotal, dietaryFatSaturated, dietarySodium, dietarySugar,
  dietaryFiber. Ask the first time a Pro user logs with the Settings toggle on (default on for Pro;
  user can turn off).
- Each log writes one `HKCorrelation` of type `.food` containing a quantity sample per nutrient the
  meal has (skip missing optionals), metadata `HKMetadataKeyFoodType` = meal name, date = log time.
- Store the correlation's UUID and every sample UUID on the `LogEntry`. Deleting the entry deletes
  them without reading Health: `healthStore.deleteObjects(of:predicate:)` per type, with
  `HKQuery.predicateForObjects(with: uuids)` (apps may delete samples they wrote with share permission only).
- Never read Health data; never use it for anything but writing the user's meals (guideline 5.1.3).
- Entitlement: HealthKit capability. Privacy string `NSHealthUpdateUsageDescription` (set as build
  setting `INFOPLIST_KEY_NSHealthUpdateUsageDescription`; Xcode 16+ templates have no Info.plist file):
  "{appName} saves the meals you log to Apple Health, so your other apps can see them."
  Also add `NSHealthShareUsageDescription` (harmless for a write-only app, and avoids a crash if a read type is ever requested by mistake):
  "{appName} doesn't read your health data. This permission is only used to save meals you log."

---

## 11. Share card

`ImageRenderer` of a SwiftUI card (1080×1350 @3x-friendly), shared via `ShareLink`:
"My order at {Chain}" · protein large · "610 calories · 52g carbs · 18g fat" · order description
("Double chicken, brown rice, black beans, salsa, no cheese") · wordmark "{appName}" · small
"menumacros.app" placeholder. Plain text chain name, no logos or brand colours. Free for everyone.

---

## 12. Data trust features

Submissions go to the Vercel API (contract: docs/BACKEND.md), never to Supabase directly; the app
holds no Supabase keys. Every submission is first saved as an `OutboxItem`, then sent by
`OutboxSender`, so nothing is lost offline:
- Send immediately; on success mark `sent`. On network error, 429 or 5xx: keep `pending` and retry when
  the app next becomes active (at most once per 10 minutes, max 5 attempts, then `failed`).
- 400/413 means an app bug: mark `failed` right away and log it (no retry).
- For `failed` items, Settings › "Unsent messages" offers **Email instead** (mail composer prefilled
  with the same content, photo attached) or **Delete**.
- The user sees the confirmation as soon as the item is saved locally; sending is invisible.
- Use `URLSession` with a 20-second timeout; tests stub the network with `URLProtocol`.

### 12.1 Report a number
From any item: form with field picker (labels: Calories, Protein, Carbs, Fat, Saturated fat, Sodium,
Sugar, Fibre, Other → wire values `calories`, `protein`, `carbs`, `fat`, `saturatedFat`, `sodium`,
`sugar`, `fiber`, `other`), "Correct value" (number), note, optional photo (PhotosPicker). Body:
`POST reports` (relative to `AppConfig.apiBaseURL`, which ends in `/`) with chainId, itemId, itemName, field, shownValue, reportedValue, note, the menus
`dataVersion`, appVersion, and `photoContentType: "image/jpeg"` if there's a photo. With a photo, resize
to ≤ 1,600 px, JPEG quality 0.7 (< 5 MB), then `PUT` it to `photoUpload.url` with the returned header;
a failed photo upload never re-sends the report. Confirmation: "Thanks — we'll check within 48 hours."

### 12.2 Request a chain
From search "no results" and Settings: name field → `POST chain-requests` {name, appVersion}.
Confirmation: "Thanks — the most-requested chains get added first."

### 12.3 "How we get our numbers" (static copy)
"Every number in {appName} comes from the restaurant's own published nutrition information.
We type it in, check it, and show the source and the date we last checked on every restaurant.
We never estimate. If a restaurant doesn't publish a value, we show 'not published'.
Spot something wrong? Tap 'Report a number' and we'll check within 48 hours.
{appName} isn't affiliated with any restaurant and doesn't give medical advice."

### 12.4 Contact us
Settings › Contact us: message (5–4,000 chars) and optional email ("so we can reply") →
`POST support` {message, email, source: "app", appVersion}. Also show the support email address and
a link to the website's support page. Confirmation: "Thanks — if you left an email, we'll reply soon."

---

## 13. Nearby chains

- Location: When-In-Use only; one-shot `CLLocationManager.requestLocation()` (or `CLLocationUpdate`
  on iOS 17) when Home appears and the cache is stale (older than 10 min or moved > 500 m).
- Search: `MKLocalPointsOfInterestRequest(center:radius: 3,000 m)` filtered to
  `.restaurant, .cafe, .bakery`, plus `MKLocalSearch` natural-language queries "fast food" and
  "restaurant" in the same region. Merge results.
- Matching: normalise names (lower-case, strip diacritics, `&`→"and", remove punctuation and
  "restaurant"/"cafe" suffixes) and match a chain if the normalised name equals, or starts with
  followed by a word boundary, the chain's normalised name or any alias ("cluck house main st" ✓,
  "cluck housewares" ✗). Keep the nearest location per chain.
- Show up to 10, sorted by distance, as "0.3 mi" (one decimal under 10 mi).
- Never store or send coordinates; cache only the matched chain ids + distances in memory.
- Known limitation: MapKit returns a limited number of results per request and throttles bursts, so
  in dense areas a chain can be missed. That's acceptable for v1 (search always works); don't add
  per-chain queries without measuring.
- Privacy string `INFOPLIST_KEY_NSLocationWhenInUseUsageDescription`: "We use your location only on this phone, to
  list the restaurant chains nearest you. It's never stored or shared."
- `NearbyChainFinder` takes the map search behind a protocol so matching is unit-tested with fake
  map items.

---

## 14. Analytics

`protocol Analytics { func track(_ event: AnalyticsEvent) }` with a console implementation in DEBUG
and TelemetryDeck in Release (M9). Anonymous; no location, no health values, no free text.
Events (enum cases with small payloads):
`onboardingCompleted(goal)`, `onboardingSkipped(step)`, `chainOpened(chainId, source: nearby|search|favorite|popular|saved)`,
`itemOpened(chainId)`, `menuSorted(kind)`, `menuFiltered(kind)`, `bestForYouViewed(chainId, mode)`,
`bestForYouPickOpened(rank)`, `builderOpened(origin)`, `builderChanged(kind: add|remove|double|swap|modifier)`,
`orderSaved`, `mealLogged(healthWritten: Bool)`, `shareCardCreated`, `paywallShown(trigger)`,
`paywallDismissed(trigger)`, `trialStarted(productId)`, `purchaseCompleted(productId)`, `restoreTapped`,
`numberReported(chainId)`, `chainRequested`, `reviewPromptShown`, `menuSyncCompleted(changedChains: Int)`.

---

## 15. Design system

- Typography: SF Pro via system text styles only (Dynamic Type). Numbers use `.monospacedDigit()`.
- Colours: system backgrounds/labels; one accent `#D9481E` (light) / `#FF6A3D` (dark) used for
  "fits your goal", selected states and primary buttons. No red/green judgement on food.
- Numbers are the hero: same order everywhere — calories, protein, carbs, fat.
- Spacing scale 4/8/12/16/24; corner radius 12 for cards.
- SF Symbols for icons; no restaurant imagery.
- Components: `NutrientRow`, `MacroSummary` (big number + three small), `ProBadge`,
  `LockedOverlay` (blur + CTA), `EmptyState`, `SourceFooter`.

---

## 16. Privacy, permissions and compliance

- No account; nothing personal leaves the phone except what the user chooses to send (reports, chain
  requests, support messages) through the API. The app contains no Supabase keys.
- The website's privacy policy (`web/app/privacy/page.tsx`) is the app's privacy policy; keep it true.
- `PrivacyInfo.xcprivacy`: declare UserDefaults with reason **1C8F.1** (App Group defaults, shared
  with a future widget) — add CA92.1 too if standard defaults/`@AppStorage` are also used — and any
  other required-reason APIs used (e.g. file timestamp C617.1); no tracking; collected data types only for analytics
  (product interaction, not linked to identity).
- App Store privacy label: see docs/STORE.md "App Privacy" (usage data for analytics; user content and
  optional photos in reports; email address only if the user gives one in Contact us).
- Required in-app links: Privacy policy, Terms of use (Apple standard EULA unless you write your own).
- Copy rules: never "healthy"/"unhealthy"/"good"/"bad" about food; never promise weight loss; GLP-1
  copy is "smaller, protein-first orders"; always "not affiliated with" chains.

---

## 17. Config (`AppConfig.swift`)

```swift
enum AppConfig {
    static let appName = "Menu Math"   // user-facing name; keep in sync with web/site.config.ts and docs/STORE.md
    // Vercel site (docs/SETUP_VERCEL_SUPABASE.md). While these are example.com placeholders,
    // menu sync is skipped and submissions stay queued in the outbox.
    static let websiteURL = URL(string: "https://example.com")!
    static let menuBaseURL = URL(string: "https://example.com/menus/")!
    static let apiBaseURL = URL(string: "https://example.com/api/v1/")!
    static let menuSyncInterval: TimeInterval = 6 * 60 * 60
    static let supportEmail = "support@example.com"
    static let privacyPolicyURL = URL(string: "https://example.com/privacy")!
    static let supportURL = URL(string: "https://example.com/support")!
    static let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!
    static let appGroupID = "group.com.yourcompany.menumacros"
    static let yearlyProductID = "com.yourcompany.menumacros.pro.yearly"
    static let monthlyProductID = "com.yourcompany.menumacros.pro.monthly"
    static let freeSavedOrderLimit = 3
    static let newItemDays = 30
}
```
