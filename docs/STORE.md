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
| Keywords (100) | `macros,nutrition,restaurant,counter,diet,glp1,grocery,takeaway,supermarket,cooking,meal,food` (92; words already in the name and subtitle are indexed anyway, so they aren't repeated) |
| Primary / secondary category | Food & Drink / Health & Fitness |
| Promotional text (170) | Every dish at 238 UK restaurants and 68,000 supermarket products, with calories and protein. Free, no account, works offline. (125) |
| Price | Free (no in-app purchases in this version) |
| Availability | United Kingdom first (the data is UK only) |

**Never** put a restaurant's or supermarket's name or logo in the app name, subtitle, keywords, icon or screenshots (App Review 2.3.7,
2.3.9, 4.1(c); CLAUDE.md rule 2). Never call food healthy, good or bad (rule 3); GLP-1 copy is "smaller, protein-first orders".

## Description (draft)

Know the numbers before you eat. Numbite shows the calories, protein, carbs and fat for every dish at 238 UK restaurants, cafés and
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

Private by design. No account, no ads, no tracking. Your settings, saved meals and lists stay on your phone. Your location is used on
your phone only.

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

- Purpose for all of the above: App Functionality.
- Location: **not collected** (used on the phone only to sort nearby branches; a typed postcode goes to postcodes.io for the lookup and
  isn't kept by us). Camera: not collected (barcodes are read on the phone).
- Health and purchases: none in this version.
- If anything is added (crash reporting, analytics, Pro, the AI recipe maker), update this table, the privacy manifest and the website
  privacy policy first.

## Age rating

Answer the questionnaire honestly. Notes: no violence, no user-to-user content, no web browsing (links open Safari). A few pub menus list
alcoholic drinks by name (for example a cocktail or a cider), so **Alcohol, Tobacco or Drug Use or References: Infrequent/Mild**. Medical
or treatment information: none (the app shows published nutrition only and says it isn't medical advice).

## URLs for App Store Connect

- Privacy Policy URL: `https://<your-domain>/privacy`
- Support URL: `https://<your-domain>/support`
- Marketing URL: `https://<your-domain>`

(Until there is a domain, `https://menumacros.vercel.app/...` works, but Vercel's free Hobby plan is for non-commercial use: move to Vercel
Pro and a domain before submitting.)

## Notes for App Review (draft)

"Numbite shows restaurants' and supermarkets' published nutrition information, works fully offline, and has no account or login. The
app is free with no in-app purchases. Restaurant and shop names and logos are shown small next to the name only to identify whose menu or
products are listed; the app says it is not affiliated with any of them, and we remove any logo the day its owner asks (we can do this
without an app update). The barcode scanner (Groceries › Scan a barcode) and Near me (Eat out › Near me) use the camera and location on
the device only."

## Release checklist (free launch)

- [ ] Decide which supermarkets the App Store version includes (web/app-content.json; food photos are in): see docs/APP_BUILD.md
- [ ] Domain + Vercel Pro; support email on the domain; /privacy, /terms and /support read and true
- [ ] Register numbite.co.uk (and numbite.com / numbite.app) now, before someone else does
- [ ] UK trade mark search for "Numbite" (gov.uk "Search for a trade mark"), and consider filing it (classes 9 and 42)
- [ ] `./scripts/build_app_web.sh` (with `NEXT_PUBLIC_REMOTE_BASE=https://<your-domain>` once the domain is live), then build in Xcode
- [ ] Mac session: build, unit and UI tests, simulator check in airplane mode (docs/APP_BUILD.md "Checks before TestFlight")
- [ ] App Store Connect: app record "Numbite: Calories & Protein", bundle `com.amanmarwaha.MenuMacros`, price Free, UK availability
- [ ] App Privacy form and age rating from the sections above; screenshots from `web/e2e/store-shots.mjs`
- [ ] Archive and upload from Xcode; TestFlight on your own iPhone (scanner, Near me, share, offline)
- [ ] Submit; release manually
