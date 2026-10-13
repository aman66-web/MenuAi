# App Store listing and release checklist (free launch)

Founder 2026-10-12: ship the app **free** (no subscription, no AI recipe maker), then add Pro and the extras in updates. The app is the web
app packed inside an iPhone app (docs/APP_BUILD.md). Name: **Numbite** (founder 2026-10-12; numbers + bite). Checked that day: no app
called Numbite on the UK or US App Store, nothing by that name on the web, and numbite.com, numbite.co.uk and numbite.app free; it is a
coined word, the strongest kind of trade mark. Earlier names were dropped: "MenuMacros" is taken ("MenuMacros: Eat Out Healthily", June
2026) and "Menu Math" used the US spelling and sounded restaurant-only. Everything below is a **draft for the founder to approve** (CLAUDE.md rule 8): numbers are from the published
data on 12 October 2026; if web/app-content.json leaves shops or photos out of the app, update the numbers and the description.

| Field (limit) | Text |
|---|---|
| App name (30) | **Numbite: Calories & Protein** (27) |
| Subtitle (30) | **UK menus, shops & recipes** (25) |
| Keywords (100) | `macros,nutrition,restaurant,counter,diet,grocery,takeaway,supermarket,cooking,meal,food` (87; words already in the name and subtitle are indexed anyway, so they aren't repeated) |
| Primary / secondary category | Food & Drink / Health & Fitness |
| Promotional text (170) | Menu items from 238 UK restaurants and 68,000 supermarket products, with calories and protein. Free, no account needed, works offline. (131) |
| Price | Free (no in-app purchases in this version) |
| Availability | United Kingdom first (the data is UK only) |

**Never** put a restaurant's or supermarket's name or logo in the app name, subtitle, keywords, icon or screenshots (App Review 2.3.7,
2.3.9, 4.1(c); CLAUDE.md rule 2). Never call food healthy, good or bad (rule 3); GLP-1 copy is "smaller, protein-first orders".

## Description (draft)

Know the numbers before you eat. Numbite shows the calories, protein, carbs and fat for menu items at 238 UK restaurants, cafés and
pubs, taken from each chain's own published nutrition information, with the source and the date we checked shown on every menu.

Eat out. Search a restaurant or find the ones near you, see every dish's numbers, and get the best orders for your goal and what you
have left today. Build your own order and watch the totals add up as you tap.

Shop. Browse about 68,000 products from nine UK supermarkets with the shop's own price, and calories and protein where the label is
published. Scan a barcode, compare products side by side, and keep a shopping list.

Cook. 100 recipes made from real supermarket products, with the calories, protein and cost of each serving, fitted to your meal size.

Made for your goal. Losing weight, maintaining, building muscle, or smaller, protein-first meals on a GLP-1 medication: set it once and
every suggestion follows it. Diet filters for vegetarian, vegan, halal, no pork, no beef and the 14 allergens, always going by what each
restaurant or shop publishes.

Easy to use. Large text options, a plain layout, and 11 languages.

Private by design. No account needed, no ads, no tracking. Your settings, saved meals and lists stay on your phone unless you choose to
sign in (with Apple, Google or an email code) to keep them on all your devices. Your location is used on your phone only.

Every feature is free. Numbite isn't affiliated with any restaurant or shop, and doesn't give medical advice.

## Screenshots (6.9" iPhone, 1320 × 2868)

`web/e2e/store-shots.mjs` takes them from the app's own pages with **every logo hidden and every photo left out** (chains show our cuisine
icons): Today · Eat out · a restaurant · Recipes · a recipe · a supermarket's products. Saved in `web/e2e/shots/store/`. Add captions in
App Store Connect's own frames or leave them plain; never add a restaurant or supermarket logo.

## App Privacy (App Store Connect questionnaire)

From what the app actually sends (docs/BACKEND.md; the same as `MenuMacros/Resources/PrivacyInfo.xcprivacy`). None of it is used for
tracking, and there is no analytics in this version.

| Data type | Why | Linked to the user? |
|---|---|---|
| User Content → Other User Content | "Report a number", "Request a restaurant" | No |
| User Content → Photos or Videos | Optional photo attached to a number report | No |
| User Content → Customer Support | "Contact us" messages | No |
| Contact Info → Email Address | Only if the person types one in "Contact us" so we can reply | Yes |
| Other Data → Other Data Types | A salted one-way hash of the sender's IP address, kept 30 days to stop spam | No |
| Contact Info → Email Address (again) | **Only if the person signs in** (Apple's relay address, Google or the address they type for an email code) | Yes |
| Identifiers → User ID | **Only if the person signs in**: the account's ID | Yes |
| User Content → Other User Content (now linked) | **Only if the person signs in**: what they choose to sync (saved meals and recipes, shopping list, favourites, comparison list) | Yes |
| Health & Fitness → Health | **Only if the person signs in**: synced goal, targets, diet and allergy choices and today's log entries (see below) | Yes |

- Purpose for all of the above: App Functionality.
- Location: **not collected** (used on the phone only to sort nearby branches; a typed postcode goes to postcodes.io for the lookup and
  isn't kept by us). Camera: not collected (barcodes are read on the phone).
- Purchases: none in this version. Apple Health: not used.
- **Sign-in (optional, docs/ACCOUNTS_SYNC.md):** the four rows marked "only if the person signs in" are why the manifest changed on 13 October
  2026. "Health" is declared because the synced goal (which can be a GLP-1 goal), calorie and protein targets, allergies and logged meals are
  health-related information the person typed in; it is the cautious answer, so confirm it in App Store Connect before submitting (Apple's
  definition of Health data decides whether it is needed). Used for App Functionality only; never for tracking, advertising or analytics.
- Account deletion is inside the app (Settings › Account › Delete my account), as App Review guideline 5.1.1(v) requires; Sign in with Apple is
  offered next to Google (guideline 4.8).
- If anything is added (crash reporting, analytics, Pro, the AI recipe maker), update this table, the privacy manifest and the website
  privacy policy first.

## Age rating

Answer the questionnaire honestly. Notes: no violence, no user-to-user content, no web browsing (links open Safari). Apple's definitions
(App Review 2.3.6): **Health or Wellness Topics: Frequent** (calorie tracking and dieting advice count, and the app is about little else);
**Medical or Treatment Information: Infrequent** (the GLP-1 goal mentions a medicine class, and every number comes with "not medical advice");
**Alcohol, Tobacco or Drug Use or References: Infrequent/Mild** (a few pub and restaurant menus list cocktails or ciders by name; alcohol is
never added to the supermarket lists); everything else None. Expect a rating of about 13+; do not answer lower to look better.

## URLs for App Store Connect

- Privacy Policy URL: `https://numbite.com/privacy`
- Support URL: `https://numbite.com/support`
- Marketing URL: `https://numbite.com`

(numbite.com was bought on Vercel on 12 October 2026 and is live on Vercel Pro; `menumacros.vercel.app` stays as an alias.)

## Notes for App Review (draft; replaced 14 October 2026 after an internal guideline review)

"Numbite works without an account and every feature is free. Signing in is optional and only turns on sync across the person's devices: use
Sign in with Apple with any Apple ID, or 'Continue with email' (a 6-digit code is sent to the address). Settings > Account has Sign out and
Delete my account (for an Apple sign-in it asks Apple to confirm and then revokes the Apple token).

Why this is an app and not a website: all menus, products, recipes and photos are packed inside the app, so it works with Airplane Mode on.
It uses the iPhone itself for Groceries > Scan a barcode (VisionKit, camera, nothing leaves the phone), Eat out > Near me > Use my location (one
system prompt; a typed postcode works instead), the share sheet for the shopping list, and Sign in with Apple. The only things fetched online
are newer menus and the optional account and sync.

Restaurant and shop names (and any logos or pictures shown) only identify whose published nutrition information is listed; the app says it
is not affiliated with any of them, and we remove anything on request, without an app update. Numbers come from each chain's own published
data with the source and date shown; allergen information says 'check with staff'. The app gives no medical advice (stated in the app and the
terms), warns when a calorie target is very low, and the GLP-1 goal says to follow a doctor's or pharmacist's advice."

## Release checklist (free launch)

- [ ] Decide which supermarkets the App Store version includes (web/app-content.json; food photos are in): see docs/APP_BUILD.md
- [x] Domain: numbite.com (bought 12 October 2026, on Vercel, in the founder's name)
- [x] Vercel Pro (12 October 2026)
- [ ] Support email on the domain (forwarding); /privacy, /terms and /support read and true
- [ ] Optional: numbite.co.uk at a UK registrar, redirected to numbite.com
- [ ] UK trade mark search for "Numbite" (gov.uk "Search for a trade mark"), and consider filing it (classes 9 and 42)
- [ ] `./scripts/build_app_web.sh` (it talks to https://numbite.com by default), then build in Xcode
- [ ] Mac session: build, unit and UI tests, simulator check in airplane mode (docs/APP_BUILD.md "Checks before TestFlight")
- [ ] App Store Connect: app record "Numbite: Calories & Protein", bundle `com.amanmarwaha.MenuMacros`, price Free, UK availability
- [ ] App Privacy form and age rating from the sections above; screenshots from `web/e2e/store-shots.mjs`
- [ ] Archive and upload from Xcode; TestFlight on your own iPhone (scanner, Near me, share, offline)
- [ ] Submit; release manually
