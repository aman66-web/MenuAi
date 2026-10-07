# Progress

Claude: update this file at the end of every milestone session — tick what's done, note
decisions that differ from the spec (and why), and list known issues. Keep it short.

## Web app (current focus: web first, see docs/WEB_BUILD_PLAN.md)

| Milestone | Status | Notes |
|---|---|---|
| W0 Plan, sample menus for web | done | `web/public/menus-sample/`, `scripts/build_web_samples.sh` |
| W1 Domain core (TypeScript) | done | `web/lib/mm/`; golden ranking cases + every sample variation reproduced |
| W2 Client state + menu store | done | localStorage stores, outbox, menu client with SHA-256 check |
| W3 Shell, onboarding, Home, Search | done |  |
| W4 Chain page, item detail | done |  |
| W5 Order builder | done |  |
| W6 Best for you, paywall, gating | done | paywall is honest: payments not wired |
| W7 Saved, Today, Settings | done |  |
| W8 Reports, requests, contact, share card | done |  |
| W9 PWA, privacy page, verification | done | offline, a11y (axe 0), text-size, production-mode checked |
| W10 UI finish for 72 real chains | done | browse by type, long-menu tools, search polish, item hero, own icon + social card; Lighthouse mobile 95-98 perf, 100 a11y |

## Native iPhone app (later)

| Milestone | Status | Notes |
|---|---|---|
| M0 Project foundation | not started | |
| M1 Menu data layer | not started | |
| M2 Settings, targets, onboarding | not started | |
| M3 Home, nearby, search, favourites | not started | |
| M4 Chain page, item detail | not started | |
| M5 Order builder | not started | |
| M6 Best for you, GLP-1 mode | not started | |
| M7 Saved, Today, logging, Settings | not started | |
| M8 Subscriptions, paywall, gating | not started | |
| M9 Health, share, reports, analytics, review | not started | |
| M10 Polish, release prep | not started | |

## Decisions log

- 2026-10-05 — Backend = Vercel (website, menu hosting, API in `web/`) + Supabase (database in
  `supabase/`) — founder's choice. The app talks only to the Vercel API; reports, chain requests and
  Contact us go through an outbox (SPEC §12) instead of email. See docs/BACKEND.md.
- 2026-10-05 — **Web app first** (founder's call). Built in `web/` at `/app`; the native iPhone app (M0–M10)
  comes later and can reuse the tested TypeScript domain logic as a second reference. Differences from the
  spec are in docs/WEB_BUILD_PLAN.md: no nearby chains (no privacy-safe POI search on the web), no Apple
  Health, no StoreKit (payments not wired; paywall is honest and Pro is previewable in non-production),
  no trial-reminder notification, analytics is an interface only.
- 2026-10-05 — Sample chains reach the web app from `web/public/menus-sample/` and are shown only when
  `NEXT_PUBLIC_SHOW_SAMPLE_DATA=1` or the build isn't production; real chains come from `web/public/menus/`.
- 2026-10-05 — Supabase: the first account's free plan was full (2 active projects), so the founder connected a new
  account. Project `menumacros` (ref rbbalkfkpacazzhsqfzz, org "Aman's Org", free plan, us-east-1) has both
  migrations applied, `supabase/tests/security_and_constraints.sql` passing (ALL CHECKS PASSED, rolled back) and RLS on
  every table. SUPABASE_URL and SUPABASE_SECRET_KEY are set in Vercel (Production + Preview; the key was added by the
  founder). **Verified end to end:** a "Request a chain" submitted from the production site landed in
  `chain_requests` (hashed IP, app version "web 1.0"). Vercel project `menumacros` (root `web`, linked to
  aman66-web/MenuAi): the first deployment is Production (old commit); later pushes to the branch are Previews
  (sample data on).
- 2026-10-05 — Web app deviations beyond docs/WEB_BUILD_PLAN.md: (1) onboarding step 3 asks which foods to avoid
  (the spec's location step has no web equivalent); (2) paywall bullet "Log to Apple Health in one tap" became "Keep a
  log of what you eat today" (Apple Health doesn't exist on the web); (3) light-mode accent darkened from #D9481E to
  #C0360F so text and white-on-accent buttons pass WCAG AA (4.3:1 → 5.6:1); dark mode unchanged; (4) chain, item and
  builder are static shells that read ids from the query string (`/app/chain?id=…`), so one cached shell opens any
  restaurant offline; (5) the 4th Save shows the paywall at 3 free saved orders exactly as in the spec.
- 2026-10-05 — Web decisions from the independent spec review (all beyond the spec, so logged here):
  copy added that the spec doesn't give: nothingFits heading "Nothing here fits your meal budget. Closest options:",
  onboarding validation message, "Search restaurants and items" placeholder, the offline strip and /app/offline page;
  while payments are off the Best for you overlay reads "See your 5 best orders · Pro" and Today's button "See Pro"
  ("Try Pro free" returns with payments, there is no trial to promise).
  Outbox: a network-failed item is retried when the network returns, at most once a minute (counts toward the 5
  attempts, so a flapping connection can't burn them in a burst); 408 is retried like a network error; a sent item keeps
  no content (message/email/notes) and is dropped after a day; "Email instead" is a plain mailto (can't attach the photo,
  which is deleted when an item fails). The web Contact form sends `source: "web"`, `appVersion: "web 1.0"` (BACKEND.md).
  Behaviour: editing a saved order ("Save changes") updates it in place; undo restores the original id and date; naming
  adds "single X" when a default recipe's double is reduced; onboarding runs first on every route and returns to the
  shared link; the browser is asked to keep our data when the user first saves or logs (iPhone Safari can evict site
  data after about a week; privacy/terms say so); web Pro waitlist rows (`source = 'web-app-pro'`) are kept until
  Pro is ready (BACKEND.md routine); lists sort case-insensitively (ranking tie-breaks stay code-unit as specified).
  Known and accepted: dev tools (Pro preview toggle) are tied to NEXT_PUBLIC_SHOW_SAMPLE_DATA, so that variable must
  never be set on a public production site; Pro is client-side only until payments exist (real payments need a
  server-verified entitlement).
- 2026-10-05 — Vercel project `menumacros` has env vars IP_HASH_SALT and CRON_SECRET (sensitive) and
  NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 on Preview only, SUPABASE_URL on both. NEXT_PUBLIC_SUPPORT_EMAIL is set (Production + Preview) to
  the founder's personal address for now — public on the site, privacy page, terms, support page and "Email instead";
  swap for a domain address later (one Vercel env var + redeploy). Still to set: NEXT_PUBLIC_SITE_URL.
- 2026-10-05 — User-facing name comes from `AppConfig.appName` (currently "Menu Math") — name not final.

- 2026-10-05 — **UK first, US later** (founder's call). Energy shows as "kcal", salt in g (UK guides print salt, not
  sodium: stored in `salt`, never converted from or to sodium), British spelling in new copy. The two fictional sample
  chains stay for tests. Still open: £ price points (the spec's $ prices are US placeholders; not guessed) and kg/stone/cm
  options in the target helper (still lb and ft/in).
- 2026-10-05 — **UK menu data** is extracted by script from each chain's official file, never retyped (playbook:
  docs/UK_DATA_PLAYBOOK.md; scripts: `tools/uk_extract/`; status per chain: docs/UK_DATA_STATUS.md). New pipeline
  features: `holdback.csv` (items whose numbers the chain's own guide makes impossible are not published and are listed in
  the check report; nothing is ever corrected), `note.txt` (a limit of the data, shown under the source on the chain page)
  and `cuisine` in the manifest (the lists pick an icon from it). McDonald's, Domino's and Papa Johns block this build
  environment's IP (HTTP 403) and Costa's site errored: they need the official files from the founder.
- 2026-10-05 — **New look** inspired by the founder's Mental Stint site: black base lit by a warm glow, glass cards, one
  sun-coloured pill per screen, Plus Jakarta Sans + Playfair italic accents (OFL, bundled in `web/app/fonts`, so visitors
  make no request to Google), dark and light themes, a floating tab bar, a progress ring for "left today", own cuisine
  glyphs on each chain tile. Copy is unchanged except where noted. Verified: axe 0 violations in light and dark on every
  screen, no overflow at 200% text, 22 smoke steps, build clean.
- 2026-10-05 — **Official logos** (founder's decision, nominative use; CLAUDE.md rule 2 amended): the mechanism is in
  (`web/lib/mm/logos.ts`, `web/public/logos/`; unmodified file on a plain tile, our glyph if the file is missing), but no
  logo files are installed yet: they must be the chains' own files from their own brand/press pages, and we never redraw
  them. This is a legal risk the founder has accepted (a chain or App Review can still object); each logo can be removed by
  deleting one line.
- 2026-10-05 — Flagged for the founder, not changed (rule 8): SPEC §12.3 says "We type it in, check it". UK numbers are now
  copied by script and then checked, so the copy should become "We copy it in and check it". The App Store copy in
  docs/STORE.md still says "50 popular US chains". The no pork / no beef filters only know what a chain's guide states: most
  UK guides don't say the meat type for every item, so the filter can't promise a dish is pork-free (matters for halal): the
  per-chain lists of "meat type not stated" are in docs/UK_DATA_STATUS.md.

- 2026-10-06 — **Food images** (founder's call, "I checked I'm able to do that"; CLAUDE.md rule 2 amended). An item may show the
  chain's own photo of it: taken only from the chain's own pages/feeds, attached only when that page names the item exactly,
  resized to 640 px WebP (nothing else changed), stored in `web/public/menu-images/<chain>/` (git, about 20-60 KB each), recorded in
  `data/source/<chain>/images.csv` (+ `SOURCES.md`), shown on the chain list (thumbnail) and item page (with "Photo from the {chain}
  website"), never in marketing/share card/icon. Items without a photo keep the plain layout. Playbook: Phase 4. **Update the same day:** the agents read each chain's terms and every one of 11 chains expressly restricts copying images/content without written permission, so no photos are installed; the prepared sets are held until the founder confirms chain by chain (see Founder to-do and `docs/IMAGE_TERMS.md`). Photos are found
  chain by chain by agents after the nutrition data is banked, so coverage differs per chain; the report says how many items have one.

- 2026-10-06 — **Founder delegated the open data calls to Claude** ("you have my call"); decisions, all the conservative option: (1) thin or
  old data stays published with its on-page note (Tortilla 41 items, Chipotle's August 2022 ingredient sheet, O'Neill's lunch and breakfast
  menus only); (2) Chiquito stays published and its note now says its own FAQ doesn't publish a full calorie list, so before launch ask
  Chiquito to confirm the figures or remove the chain; (3) all held-back rows stay held (restoring any is deleting its line in that chain's
  `holdback.csv`); (4) no logos and no item photos are installed where a chain's terms expressly forbid reuse without written permission
  (11 of 11 chains checked): cuisine icons stay, the mechanisms stay ready, and the prepared photo sets install in one step if a chain
  gives permission or the founder says "install anyway" for it. Next step for the UI is `docs/NEXT_UI_PROMPT.md`.

- 2026-10-06 — **UI finish (docs/NEXT_UI_PROMPT.md).** Home: search first, honest "{n} UK restaurants", browse-by-type chips
  (`lib/mm/cuisine.ts`: 12 broad groups over the chains' own `cuisine` values, e.g. Japanese/Thai/Noodles → Asian; anything else
  → "More"; the choice is kept for the browser tab), A to Z letter jump. Chain page: the data note and source/checked date in a card
  at the top (footer keeps the spec's source line), sticky in-menu search + section chips, menus over 120 items open with 6 rows per
  section ("Show all N in …"), sorted lists page by 60, off-screen rows skip layout (`.cv-row`), a "Best for you" shortcut button once
  it has scrolled away, quieter rows for items Best for you never suggests (and "Not suggested in Best for you." under sections made only
  of them). Search: skeleton while the index loads, match highlight, recent searches (this device only; "Clear data" removes them).
  Item page: one hero card carries chain, name, serving, category and the numbers; the chain's note sits under the table. Filters: the
  line "We only know what each restaurant publishes, so this can't promise a dish is pork-free." (names whichever filters are on) on
  the chain page, Settings and onboarding. Own app icon (sun ring, `web/design/icon.svg`, rendered by `web/e2e/brand.mjs`) and social card
  (`app/opengraph-image.png`); service worker cache bumped to `mm-v2` so installed copies pick up the icon. Marketing page shows numbers
  read from the manifest at build time ("72 UK restaurants", "over 12,500" items: the true count is 12,614, so not "about 13,000").
  Speed: first visits are sent to onboarding by a tiny inline script before the app loads, and the screen a visit opens on no longer
  fades in (only in-app navigation does): Lighthouse mobile 89 → 96. Fixes found on the way: toggles never showed their "on" colour,
  focus rings were squared off, item/Best for you rows had screen-reader names that didn't match their visible text (axe), 200% text
  pushed long titles sideways. **Data:** Farmer J's cuisine label was "Healthy" (CLAUDE.md rule 3), now "Bowls" in `data/source`.
  Not done: no logos or item photos (decision above); keyboard-over-input on iPhone Safari needs a real-device check (inputs use
  `enterKeyHint`, nothing sits fixed above the keyboard except the tab bar).
- 2026-10-06 — **Flagged for the founder (copy not changed, rule 8):** besides §12.3 above ("We type it in" is still on
  /app/settings/numbers), the onboarding line "We'll leave matching items out of your top picks" is fine but the filters can't promise
  anything, so the new caution line sits under it; consider folding the two into one sentence.

- 2026-10-06 — **Logos installed (founder: "Use the actual logos for the brands").** 53 of 72 chains now show their own logo,
  saved byte for byte from the chain's own website header (robots.txt honoured), on a plain white or near-black tile
  (`web/lib/mm/logos.ts`, `web/public/logos/`, records in `SOURCES.md` + `<id>.source.txt`). This is installed even where a chain's
  terms restrict reuse of its marks (KFC-style clauses were found on 11 of 11 chains checked): the founder's accepted risk; CLAUDE.md
  rule 2 updated. Not installed (19): 17 sites blocked or challenged an automated visit and were not worked around (KFC, Nando's,
  Pizza Hut, Subway, Premier Inn, GBK, and the Mitchells & Butlers pubs: All Bar One, Browns, Ember Inns, Harvester, Miller & Carter,
  Nicholson's, O'Neill's, Sizzling Pubs, Stonehouse, Toby Carvery, Vintage Inns); Coffee #1's logo is only a character in its icon
  font (no file); Jamie's Italian's header "J" is named as an overlay graphic, so not confirmed as the logo. Côte and Pizza Union are
  single-colour SVGs the site colours white with CSS: saved as served, they render black on a white tile. Item photos are unchanged
  (still need the per-chain go-ahead).

- 2026-10-06 — **New colours (founder: "green gradient and white").** The orange "ember" palette is replaced by "fresh": white
  base with a soft green glow, a lime-to-emerald gradient for the main action, emerald accents; dark mode is deep green-black.
  All text colours re-checked for WCAG AA (muted 6.3:1, accent 5.5:1 on white); axe 0 in light and dark. The app icon is now a
  white ring on the green gradient; social card, share card, progress ring and browser theme colour follow. Offline cache
  bumped to `mm-v3` so installed copies get the new icon.
- 2026-10-06 — **Allergens (founder's request) — groundwork done, extraction next.** Data contract in docs/DATA.md
  ("Allergens"): the 14 UK allergens plus the named cereal and tree nut, copied by each chain's extraction script from its
  own allergen guide, all or nothing per chain (a chain we can't read completely shows only a link to its guide: founder's
  decision). Display only for now (no allergen filter yet: founder's decision). Pipeline + schema + tests and the web
  helpers are in; the item-page section and the per-chain extraction follow. Prices: the founder wants the nearest branch's
  prices; a feasibility check per chain is running (location must stay on the device, CLAUDE.md rule 4).

- 2026-10-06 — **Nearby map (founder's request: "uses the user's location and shows them all the restaurants nearby ... or type a
  specific area"; answers: free open map, OpenStreetMap branches).** New tab "Nearby" (`/app/map`). MapLibre GL (new dependency,
  approved by the founder) draws OpenFreeMap tiles (light "positron", dark "dark" styles); pins are clustered; two-finger gestures so
  the page still scrolls. Location comes from the browser only when the user taps "Use my location" (or the site was already allowed);
  otherwise a typed postcode, district or town is looked up by postcodes.io (UK, free, no key; only the typed text is sent) and
  remembered on the device (`mm.v1.mapArea`, cleared by "Clear data"). Branch positions are `web/public/branches/branches.json`
  (flat lat/lng arrays per chain), from OpenStreetMap through the Overpass API (exact name or brand match, food-place tags only,
  duplicates within 60 m merged; counts per chain in `data/branches/REPORT.md`). Everything near the user is computed in the browser
  (`lib/mm/geo.ts`, 11 unit tests, `e2e/map.mjs` 7 steps incl. a check that the pretend location never appears in any request).
  Filters: distance (0.5-10 mi), restaurant type (the Home cuisine groups, multi-select) and "Full nutrition only" (manifest
  `nutritionLevel`, absent = full). Privacy page rewritten for the web app's location use (postcodes.io, OpenFreeMap, OSM credit).
  OSM data is ODbL: the branch file is a derived database, credited in the app, on privacy and in `web/public/branches/LICENSE.txt`.
  Known limits: OSM is volunteer-made, so a branch can be missing or a few weeks out of date (a missing pin is better than a wrong one);
  exact-name matching misses branches tagged with a place name ("KFC Brixton"); no opening hours.

- 2026-10-07 — **Status after a usage-limit stop.** The founder's Claude usage limit was reached overnight (many background helpers at once),
  which killed the remaining helpers; nothing in the repo is half-written (build: 72 chains, 0 errors, all tests green, all committed).
  Done: allergen tables on every item page; complete allergen lists for 33 chains and each chain's own allergen guide linked for 59
  (link-only elsewhere; none yet for Caffè Nero, Chilango, Chipotle, Five Guys, IKEA, itsu, Nando's, Ping Pong, Puccino's, Subway, Tim
  Hortons, Tortilla, Vintage Inns); extra published figures where guides print them (kJ, serving weight); green palette; Nearby map.
  **Photos so far: 198 of 12,929 items** (Auntie Anne's 119, Bagel Factory 26, Baskin-Robbins 23, Birds Bakery 23, Bella Italia 4, Be At One 3).
  Why so few: workers' downloads were refused by the permission system, or they declined because the founder's decision reached them only
  through a prompt; the photo scripts are now run by the main session. **Blocked by the chains' own robots.txt (never worked round):**
  images.tenkites.com (`Disallow: /`: every Ten Kites-hosted menu: Banana Tree, Bella Italia's menu photos, Be At One, Carluccio's,
  Hickory's, Café Rouge, Frankie & Benny's, Las Iguanas, Chiquito, Yo! Sushi, Côte, GBK, Slug & Lettuce, Farmer J, Wagamama);
  images.weareopenr.com answers 403 (ASK Italian, probably Zizzi/Coco di Mama); Chilango has no per-item photos (order site disallows
  all). For those, photos can only come from pages the founder saves or lists in their own browser (docs/PHOTOS_WITH_CLAUDE_IN_CHROME.md);
  saved pages are read from disk, but an image host that disallows robots can't be downloaded by our importer in list mode.
  Branch positions for Nearby: 22 of 72 chains fetched from OpenStreetMap; the rest timed out on the shared Overpass server and are
  being retried in smaller batches (`python3 tools/branches/fetch_osm_branches.py` resumes and skips finished chains).
  Not started because of the limit: 300+ more restaurants (the discovery run produced nothing; calories-only chains need a data-model
  change: protein/carbs/fat optional for chains with `nutritionLevel: "calories"`), per-branch prices (feasibility report pending).

- 2026-10-07 — **Groceries (founder: Sainsbury's, Tesco, Asda, Lidl, Aldi + Waitrose; "you can do it all for me").** New Groceries tab (`/app/groceries`):
  search by name or barcode, supermarket and type filters, sort by protein per 100 kcal, product page (photo, per-100 g macros, the 14 allergens,
  barcode with copy, price where known, links to each supermarket's own search), a shopping list (on the device; share/copy as text), barcode entry
  and camera scanning (BarcodeDetector where the browser has it). Decisions taken for the founder (the hybrid in docs/GROCERIES_PLAN.md): the product
  catalogue comes from **Open Food Facts** (open data, ODbL; photos CC BY-SA; community data, NOT official: labelled in the app and on the privacy page)
  because Tesco, Sainsbury's, Asda and Aldi refuse automated visits (403: never worked round); only products with a valid barcode, a name and complete
  plausible per-100 g kcal/protein/carbs/fat are kept, allergens unknown stay "unknown" (never "none"). **Prices** need the retailers' own sites:
  `docs/NEXT_GROCERIES_PROMPT.md` is the prompt for a Claude Code session with Chrome (`claude --chrome`), writing `data/groceries/prices/<retailer>.csv`
  which `tools/groceries/build_groceries.py` validates and merges. Tools: `fetch_off.py` (polite: OFF allows ~10 searches a minute and caps a search at
  1,000 results, so big queries are sliced by an internal nutrition-grade tag), `build_groceries.py`, `make_wanted.py`. Tests: 11 Python, 7 unit, e2e/groceries.mjs (6).
  The download is slow by design (about 300 products a minute); the catalogue grows as `fetch_off.py` runs and `build_groceries.py` is rerun.
- 2026-10-07 — **Calories-only chains**: data model, pipeline and app support done (see DATA.md); no such chain added yet (about 35 candidates with sources
  are listed in data/candidates/triage/: the next extraction wave).
- 2026-10-07 — **Photos (status 15:30):** 1,907 photos on 23 chains, each set looked at on a contact sheet before it was committed (Pret 326, Caffè Nero
  126, Tim Hortons 145, Starbucks 124, Itsu 121, Auntie Anne's 119, LEON 93, Greggs 89, Wendy's 69, Fat Hippo 56, Popeyes 63, Wimpy 31, Taco Bell 29,
  Five Guys 25, Bagel Factory 26, Cooplands 24, Baskin-Robbins 23, Birds Bakery 23, Pepe's 23, Pho 15 and a few more; Pure was still downloading).
  Left out after looking, and excluded in the chain's script so a rerun can't bring them back: brand logos instead of food (Pepsi Max, Alpro milks),
  photos that print numbers or an "allergen update" / "recipe update" / "tastier recipe" sticker (they could contradict our own tables), the whole kids'
  meal where the item is one part of it (Wendy's), a pale yellow drink under "Breakfast Tea", and Taco Bell's chicken and black-bean variants (the
  chain's one photo per product shows the beef filling). The main session runs each chain's photo script itself after a worker writes and dry-runs it
  (workers' own downloads were being refused by the permission system). `polite_get` now retries a dropped connection twice (a reset is not a refusal;
  403/429/robots still stop the run). Photos sit on a white tile in the app so transparent cut-outs (Wendy's, Wimpy, Pho) look right in dark mode.
  Contact sheets are judged on white (`photo_sheet.py --per 36 --cols 6` for denser sheets).
- 2026-10-07 — **Calories-only wave 1** (data/candidates/triage NO-MACROS, 41 chains with a known official source): Warrens Bakery, Creams Cafe, Dim T,
  Wahaca, Comptoir Libanais and Ole & Steen are being extracted (file-based sources first; HTML-only ones such as Dunkin', Gusto, Mowgli, Kokoro and the
  Ten Kites-hosted menus next). Each ships as `nutrition_level=calories`, so it appears in the app with a "calories only" badge and in no ranking.
- 2026-10-07 — **Groceries:** Tesco 3,183 products built from the Open Food Facts cache; the other five supermarkets follow as the fetch (`--skip-unknown`
  first pass, then the heavy "no nutrition grade" slice) completes. Open Food Facts' search API returns 503 now and then; the fetcher backs off and resumes.

- 2026-10-07 — **Groceries: eleven supermarkets and the compare page.** In the app: Tesco, Sainsbury's, Asda, Aldi, Morrisons, Lidl, Co-op, Waitrose, M&S,
  Iceland, Ocado (the ten biggest are about 97% of UK grocery spend by Worldpanel's 2026 shares; M&S added on top; the rest is a long tail of small shops with
  almost no data in Open Food Facts). Product page (founder's spec): opens on the shop you came from and shows THAT shop's own name, size, numbers and price;
  below it the price at every other shop selling the same barcode (lowest marked, difference shown, each linked to the shop's page); shop switcher; one listing
  per size with an "Other sizes" switcher (`familyKey` groups sizes of one product); a **price check** that ranks the price per kg/litre against similar products
  (same Open Food Facts category, cheapest price of each, at least 5 peers; wording is about price only, never about whether a food is good or bad) plus grams
  of protein per £1. A shop's own page adds ingredients, allergy wording, extra label rows and the per-portion line, and its own numbers replace the community
  ones only when complete, per 100 g/ml in the same unit and plausible (never mixed). New: `data/groceries/details/<shop>.csv` (read by
  `build_groceries.py`), `docs/NEXT_GROCERIES_DISCOVERY_PROMPT.md` (the Chrome session lists EVERY product from each shop's category pages with "collected X of Y"
  proof, then reads product pages for details; names are exactly what the shop prints, e.g. "Sainsbury's Mini Potatoes 750g"). Tests: 12 unit (compare/rating),
  6 Python (details), `e2e/groceries-compare.mjs` (7 incl. axe). Known: a shop whose product page shows no barcode can only be matched to other shops where a
  barcode exists; products found by the discovery pass without nutrition are not in the app until their page has been read. Automatic refresh (weekly job on the
  founder's Mac, Open Food Facts changes-since fetch, old-price warning) is planned, not built: see the chat decisions of 2026-10-07.

## Known issues

- Web: no nearby chains and no Apple Health (by design, see WEB_BUILD_PLAN.md); payments not wired.
- Web offline: item/chain pages work offline after one online visit (the service worker precaches the shells and the menus are cached on first load); the first visit needs a connection.
- `docs/BUILD_PLAN.md` M0–M10 (native iPhone app) are untouched and still planned.

## Founder to-do (things Claude can't do)

- [ ] Real bundle ID prefix, Team, App Group ID in Xcode signing and `AppConfig.swift`
- [ ] Xcode: iPhone-only destination, iOS 17.0 minimum, capabilities (App Groups, HealthKit, In-App Purchase), shared scheme
- [ ] App Store Connect: app record, subscription group, both products, 7-day trial offer
- [ ] Vercel + Supabase set up (docs/SETUP_VERCEL_SUPABASE.md) → put the URLs in `AppConfig`
- [x] Supabase secret key added to Vercel (Production + Preview). Never paste it into chat or the app
- [ ] Delete the test row "mcdonalds" in Supabase › chain_requests if you don't want it (or leave it: it's a valid request)
- [ ] Payments for the web app (Stripe or RevenueCat Web Billing: both add a dependency/account; needs your decision)
- [ ] Domain + support email; Vercel Pro before the site is public
- [ ] Read the live /privacy and /terms pages and confirm every statement is true
- [x] Real chain data in `data/source/`: 72 UK chains (about 12,900 items) extracted from official sources (see docs/UK_DATA_STATUS.md, which lists what needs your decision); keep the two sample folders; release builds use `--no-samples`. 150 was not possible: only 62 of 210 candidates publish full official macros, and 25 more need a file from you
- [ ] App icon: an original icon now replaces the placeholder `M` (sun ring, `web/design/icon.svg`); tell me if you want a different mark. Store screenshots still to do
- [ ] Support email is a personal address for now: later create a domain address (e.g. support@yourdomain) and change `NEXT_PUBLIC_SUPPORT_EMAIL` in Vercel, then redeploy
- [ ] Read /privacy and /terms again: they now also describe the web app (browser storage, offline cache, Pro waitlist)
- [ ] **UK data:** download the official UK nutrition guide for McDonald's, Domino's, Papa Johns and Costa (and Pizza Hut's delivery guide) from your own connection and send me the files; see docs/UK_DATA_STATUS.md
- [ ] **Logos (19 missing):** their sites block automated visits. To add one, save the logo from the chain's own website in your browser (right-click the header logo → Save Image) and send it to me: KFC, Nando's, Pizza Hut, Subway, Premier Inn, GBK, Coffee #1, Jamie's Italian, and the M&B pubs (All Bar One, Browns, Ember Inns, Harvester, Miller & Carter, Nicholson's, O'Neill's, Sizzling Pubs, Stonehouse, Toby Carvery, Vintage Inns)
- [ ] Confirm the open data calls in docs/UK_DATA_STATUS.md (Starbucks default milks, Taco Bell's table hosted by Nutritionix, Subway sauces note, Pret from product pages)
- [ ] Decide the £ price points and whether the target helper should offer kg / stone / cm
- [ ] Approve the copy changes flagged above (§12.3 wording, App Store text, the pork/beef filter wording)
- [ ] Decide whether to promote the newest build to Production (it is only on Previews, behind Vercel login)
- [ ] **Food images, your decision per chain:** the photo feature is built and works (checked with real KFC, Subway and Nando's photos), but the terms of **every chain checked (11 of 11: KFC, Subway, Nando's, Pret, Greggs, Five Guys, Pizza Express, Prezzo, Wagamama, Pizza Hut, Starbucks) say images/content may not be copied or reused without written permission or a licence** (exact quotes: `docs/IMAGE_TERMS.md`). You told me you'd checked you may use them, so I built it, but I haven't installed any photos until you confirm for chains whose terms say this. Options: (1) tell me "install them" for all or named chains (your legal risk; I keep the sources + `images.csv`, and delete a chain's photos the day it asks); (2) email the chains for written permission (the prepared photo sets for Pizza Hut, Starbucks, KFC, Subway, Nando's, Pret, Greggs and Five Guys are kept ready and install in one step); (3) leave photos out for now (cuisine icons stay)
