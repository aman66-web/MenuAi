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
| M0 Project foundation | in progress | Xcode project, AppConfig, icon (2026-10-08). **Free launch (2026-10-12): the app is the web app packed inside it** (docs/APP_BUILD.md): web view + scheme handler + scanner/location/share bridge written, not yet compiled (needs the Mac session) |
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
- 2026-10-05 — User-facing name comes from `AppConfig.appName` (currently "Menu Math") — name not final. (2026-10-12: now **Numbite**, see below.)

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

- 2026-10-07 — **Recovered from the Mac** after its windows were closed: `data/source/wahaca/` (calories-only, 44 items, builds with 0 errors; it was
  already published but its source folder had never been committed) and `data/groceries/discovery/` (partial product lists read from the shops' own
  category pages: Tesco 1,412 products in 8 of 20 top categories, Sainsbury's 3,823 across about 210 category pages; each category's "shown vs collected"
  counts are in the `*-coverage.csv`). Helpers for Asda and Morrisons were stopped before saving anything. Grocery prices: 30 Tesco prices saved so far.

- 2026-10-08 — **Xcode preview shell (founder: "set up the app in Xcode so I can see the updates while I'm away").** The native app (M0–M10) is
  still not started, so this is a stand-in: `ios/PreviewSources/` (four small SwiftUI files, no dependencies) is a WKWebView that opens the
  deployed web app full screen, so every site update shows on the phone without reinstalling. Written without a compiler: the Mac session builds
  and fixes it. Steps for the founder (Vercel Production branch, new Xcode project, signing, Developer Mode, 7-day free-account expiry) are in
  `docs/XCODE_PREVIEW_SHELL.md`; Add to Home Screen from Safari is the zero-setup alternative. Needs a public address that follows the newest
  build: either set Production Branch to `claude/menumacros-kit` in Vercel or promote the newest deployment (this cloud session's Vercel
  connection sees a different account, `aman-moneysave`, and cannot see the `menumacros` project, so I could not do or check it).

- 2026-10-08 — **More chains: 136 now published (20,260 items in the 125 added since the first 11).** Banked this stretch by helpers working in
  parallel (each re-runnable script in `tools/uk_extract/`, spot-checked against the rendered source): calories-only Notcutts, Bistrot Pierre,
  The Breakfast Club, Boston Tea Party, Hotel du Vin, Malmaison, Warner Hotels, Heartwood Inns, J W Lees, Joseph Holt, Haven, The Botanist,
  Chaiiwala, Blank Street, Cornish Bakery, Little Dessert Shop, Dave's Hot Chicken; full-nutrition Flight Club, McMullens, Rudy's, San Carlo,
  Vue, Baynes, Wild Bean Café, Soho Coffee Co (drinks); second wave Everyman, Village Hotels, Hollywood Bowl, British Garden Centres, Afrikana, Amigos, English Heritage, Slim Chickens. Decisions (all conservative, rule 8 not touched): see "Added 7-8 October" in
  `docs/UK_DATA_STATUS.md` (conflicting sources are held back, never chosen between; hidden-by-the-chain nutrition is not published;
  allergens stay all-or-nothing and link-only where a guide can't cover every item). Home browse-by-type gained four groups (American & diner,
  Seafood, World food, Hotels & days out) so "More" stays small. Verified on a production build: 236 unit tests, tsc, lint, e2e smoke/extra/a11y
  (axe 0)/largetext/share/browse/calories/offline/prodmode all pass; the Nearby "location refused" step times out only because this container's
  headless Chromium never answers an ungranted geolocation request (checked with a bare probe), not because of the app. 49 more candidate
  chains were discovered and triaged (`data/candidates/triage2/b-*.csv`); next extraction wave and the large per-site menus are listed in
  UK_DATA_STATUS.md. **Xcode preview shell** added (`ios/PreviewSources/`, `docs/XCODE_PREVIEW_SHELL.md`).

- 2026-10-08 — **Grocery photos from the supermarkets' own websites (founder: "use the official images from Sainsbury's, Tesco etc from their
  website").** Built: `retailerImage` on a product, shown first (hotlinked, `referrerPolicy=no-referrer`, caption "Photo from the {shop} website",
  Open Food Facts photo as fallback); `tools/groceries/build_groceries.py --images-only` applies them to the published files without the
  Open Food Facts cache; only photo URLs on a shop's own image host (`IMAGE_HOSTS`) are accepted. Done now from the Mac discovery lists: Tesco 298,
  Sainsbury's 535 products. The rest needs the founder's own Chrome (the shops refuse the cloud environment): `docs/NEXT_GROCERIES_IMAGES_PROMPT.md`.
  Only Tesco (4,501) and Sainsbury's (1,873) have products in the catalogue; the other nine shops show 0 until the Open Food Facts fetch is rerun.

- 2026-10-08 — **Logos for the 57 new chains** (founder: "a lot of them don't have images for the restaurants themselves"). 57 of the 64 chains added
  since 6 October now show their own logo, taken by helpers from each chain's own website (robots.txt honoured, saved as served, looked at on
  a contact sheet), assembled by `tools/logos/assemble_logos.py` from the per-chain records in `web/public/logos/`. Not installed: Vue,
  Tesco Café, Hungry Horse, Amigos, Kokoro (blocked or the logo's only host disallows robots), Giraffe (its only logo file is 233 KB), Wild
  Bean Café (bp's site shows only bp's logo). **Compliance finding, same day:** six published chains' PDFs had been fetched from hosts whose
  robots.txt disallows them (Python's robotparser ignores wildcards): Subway, Zizzi, Pizza Express, ASK Italian, Coco di Mama, Ole & Steen.
  They are out of the app (`data/held-robots/`, README says how to restore) until you download the PDFs yourself or say restore anyway; the
  photo fetcher and a new audit (`tools/uk_extract/robots_audit.py`) now use an RFC 9309 matcher (`robots_rfc.py`, tested). Live site: 130 chains.

- 2026-10-08 — **Mixed nutrition level + restore pass.** `nutrition_level = mixed` (docs/DATA.md): a chain whose guide prints full macros for
  food but only calories for drinks, desserts or sides may publish both; macros are all-or-none per item and an item without them is never ranked.
  A restore pass over the chains whose calories-only rows had been dropped found very little to add (the dropped rows mostly print "-" for every
  figure: alcohol), so only social-pub-and-kitchen gained 2 items. heritage-pubs' new hot-drink rows were reverted: their numbers looked like the
  biscuit served with the drink, not the drink.
- 2026-10-08 — **Accuracy audit (founder: "make sure to ensure the accuracy of the nutritional information and allergies").** New
  `tools/audit/accuracy_audit.py` checks every published chain for numbers that cannot hold (calories vs 4P+4C+9F outside alcohol, saturates >
  fat, sugars > carbohydrate, kJ vs kcal, salt vs sodium, macros heavier than the serving, size order inverted, implausible quantities) and for
  allergen contradictions (a "vegan" dish marked milk/egg, a "gluten free" dish marked gluten, a cheese/bread/egg/fish/nut dish with that allergen
  not marked). Flags are questions, never corrections. First run: 76 high-severity flags in 36 chains, about 840 medium. `tools/audit/sample.py <chain>`
  prints the flagged rows plus 12 random items for an independent re-read of the chain's official source (agents re-read each chain's PDF/page
  themselves, never through our script): extraction errors are fixed in the chain's script, rows where the source contradicts itself or where
  an allergen row contradicts the dish's own name are held back (never chosen between, never corrected), and rows confirmed as printed are logged
  with evidence in `data/audit/reviewed/<chain>.csv`; per-chain results in `data/audit/verified/<chain>.json`. `check_chain.py` now prints the audit
  and `bank.py` refuses to bank a chain with unreviewed high flags.

- 2026-10-08 — **Supermarket prices (docs/NEXT_GROCERIES_PROMPT.md run) and shop photos (founder: "photos from the supermarkets actual sites ideally").**
  Prices were collected in the founder's Chrome by agents, one tab each, one page at a time: only Tesco and Sainsbury's have products in the catalogue
  (the other nine shops' wanted lists are empty), so those two were done. A product is priced only when brand, name, variety and pack size all match the shop's
  own page exactly (otherwise skipped); the regular price is `price_gbp`, a single-item Clubcard/Nectar price goes in `member_*`, multi-buys are ignored;
  rows are dated the day they were read (2026-10-07 or 2026-10-08). **Photos:** `data/groceries/images/<shop>.csv` + `web/public/grocery-images/<shop>/`
  (tools/groceries/fetch_retailer_images.py, photo_sheet.py; builder adds `photo`, the app shows it first with "Photo from the {shop} website", Open Food Facts stays the
  fallback). Sainsbury's photos are installed (its image host has no robots.txt and its terms have no clause against it). **Tesco photos are NOT downloaded:** its image
  host answers 403 to robots.txt (the shared helper and the playbook treat that as a stop), and Tesco's terms prohibit "bots, crawlers, scrapers, or AI tools" taking data
  from the site without written consent, which also covers the price collection (quoted in docs/IMAGE_TERMS.md; the founder's accepted risk from 2026-10-07 covers
  prices, a Tesco photo decision is open). The product screen's card note reads "Sainsbury's's" (doubled possessive) in existing copy: not changed.
  **Result of the run:** Tesco 165 products priced (of 199 wanted rows that carry a pack size; the other ~100 have no size or a generic name and stay unpriced), Sainsbury's 123 (of 208),
  16 loyalty-card prices recorded (7 Clubcard, 9 Nectar); 123 Sainsbury's shop photos installed (2.7 MB, each set looked at on a contact sheet). Three shop pages are priced under two barcodes each (the community database
  holds the same product twice). The other nine shops have no products in the catalogue yet, so nothing was priced there.

- 2026-10-09 — **Photos: "Option D" (founder: "ok yeah do option D please").** A grocery product's picture now comes from the first place that has it:
  (1) our own stored 400 px WebP copy of the supermarket's photo (`photo` on the product, `web/public/grocery-images/<shop>/`), (2) the shop's own picture
  hotlinked (`retailerImage`, no referrer), (3) Open Food Facts' picture, (4) "no photo"; a picture that fails to load moves to the next place. Stored copies
  are chosen by `tools/groceries/select_stored_photos.py` (priced products first, then the default "Most protein per 100 kcal" order, at most 3,000, about 17 KB
  each, in the repo, no new service) and only for shops in `STORE`: **Sainsbury's only** (no robots.txt on its image host, no clause in its terms). **Tesco is never
  stored** (403 on its robots.txt, terms ban bots/AI tools): its pictures stay hotlinks. Because a shop's picture address is only known for products whose page we
  read (barcode joined to the shop's product id), the stored set is as big as that list: today 773 Sainsbury's products (123 priced + the rest by protein density, 11 MB), not
  3,000; it grows when more shop pages are read. Every stored photo was looked at on a contact sheet; **11 pictures were left out after looking** and are listed in
  `data/groceries/images/exclude.csv` (the builder and the selection script read it, so a rerun can't bring them back): 5 where Open Food Facts' name for the barcode
  is a different product from the shop's page (e.g. "Whey Protein" = the shop's Cheese Sauce, "Coockies" = Cherry Tomatoes: **those 5 Open Food Facts records are wrong and the
  app still shows their names and numbers**), and 6 whose photo carries a "New Recipe" or "Allergy update" sticker (our numbers/allergens could contradict the pack shown). Captions: "Photo from the {shop} website" (stored or hotlinked, naming the shop the picture is from) and
  "Photo: Open Food Facts contributors (CC BY-SA)". The privacy page (copy added at the founder's request) now says a picture can be loaded from our own site, the
  supermarket's website or Open Food Facts, and what each can see. The service worker caches `/grocery-images/` cache-first. Stored copies live on our server, not on the
  visitor's phone (only the pictures a person opens are cached in their browser, capped at 150).

- 2026-10-08 — **Xcode project created by Claude (founder: "You create it for me", overriding CLAUDE.md's "founder creates new targets" once).** `MenuMacros.xcodeproj` at the repo
  root (targets MenuMacros, MenuMacrosTests, MenuMacrosUITests; synchronized folders; shared scheme MenuMacros), bundle ID `com.amanmarwaha.MenuMacros` (same prefix as the
  founder's other apps), team S7G6ZHHK59 (CLARIFO DEVELOPERS LTD), automatic signing, iOS 17.0, iPhone only (also off for Mac/Vision-designed-for-iPhone), Swift 6 + strict
  concurrency complete, MainActor default isolation on the app target only (test targets nonisolated), no Info.plist file (generated; display name "Menu Math"). It was generated
  once with XcodeGen (installed on this Mac) from a spec kept outside the repo: edit the project in Xcode from now on, never regenerate. Source: `MenuMacros/App/` (MenuMacrosApp,
  RootView with Home · Saved · Today · Settings placeholder tabs, AppConfig per SPEC §17 with the `com.amanmarwaha` IDs, AppEnvironment, PlaceholderScreen), asset catalogue
  with our own icon (web/design/icon.svg drawn at 1024 px) and a green accent. `./scripts/test.sh --unit` passes. Still M0's: `PreviewContent` fixtures, bundled menus, then the
  Xcode-only clicks (App Groups, HealthKit, In-App Purchase capabilities need the Apple account, not done).

- 2026-10-09 — **Store-wide product lists (founder: "every product at Sainsbury's, Tesco's, Waitrose... prices and nutrition").** Agents read each shop's own category pages
  in the founder's Chrome (one tab each, one page at a time, read-only, stop on any check page; never worked round a block); the lists are in `data/groceries/listing/`
  (README there). **Sainsbury's is complete: 17,059 unique food and drink products** (`sainsburys.csv`, names/prices/photo addresses exactly as printed; 17,036 priced, 4,454 with
  a Nectar price). Morrisons 18,412 (complete, incl. beer/cider, wine, world foods and dietary; a few non-food items sit in those last pages), Asda about 13,000, Waitrose about 12,400,
  Aldi about 4,500, Lidl about 350 and M&S about 1,150 as raw crawls (`raw/`). **Co-op:** access denied by Imperva (non-UK IP), 0 products, stopped. **Ocado:** its bot challenge stopped
  the crawl and its data is quarantined (one agent used a forbidden side channel to move data out of the page; that data is not in the repo and is not used until the founder decides).
  **Iceland:** crawled with the founder's UK VPN on: 6,216 products (its terms clause 3.2 forbids copying site content without written permission: kept in `data/` only, not published). **Tesco:** crawled with the founder's approval until Tesco's own bot check stopped it (6,442 products: fresh food, bakery, most of frozen; the rest not done; not worked round; kept in `data/` only, terms quoted in `data/groceries/listing/raw/tesco_terms.txt`). **Co-op** shows a CAPTCHA even from the UK VPN: stopped. **These lists have no barcodes or
  nutrition**, so none of them is in the app yet; the next steps are a "browse every product" layer for shop-only products and Tier-2 product-page reads for nutrition (the
  founder to say). Terms caveat per shop (docs/IMAGE_TERMS.md and each `*_terms.txt`): Tesco bans bots/AI tools, M&S bans crawling and commercial use (hold, do not publish),
  Waitrose and Morrisons restrict reproducing/storing content; Sainsbury's, Asda, Aldi, Lidl have no relevant clause found. Nothing from these lists is published (they live in `data/`, not `web/public`).

- 2026-10-09 — **"Every product" lists in the app (founder: "Yes" to a browse-every-product view).** New screens `/app/groceries/shop?r=<shop>` (a shop's full list: search by
  words, type chips, "Has a card price", sort by name / price / price per kg or litre, 60 at a time) and `/app/groceries/shop/item?r=<shop>&id=<product>` (name, price, price
  per kg/litre, card price, the shop's own picture with "Photo from the {shop} website", the shop's own page as a link), reached from a pill "Every Sainsbury's product · 17,036"
  on the Groceries screen. Built by `tools/groceries/build_all_products.py` from `data/groceries/listing/<shop>.csv` into `web/public/groceries/all/<shop>.json` (2.5 MB, one compact
  array per product, loaded only when that list is opened; the service worker caches it and the two shells). Nothing is estimated: a product with no price printed is not listed, a
  card price counts only when lower and named, no unit price is invented, and the page says "We haven't read the nutrition for this product yet" unless the product's barcode is one the
  Groceries list already has numbers for (3,755 of the 17,036 have a barcode from the discovery lists; those in the catalogue link to the full page). **Only Sainsbury's is published**
  (`PUBLISH` in the script); the other crawls stay in `data/` until the founder has seen each shop's terms. New copy (rule 8: flagged, not in the spec): "Every {shop} product",
  "{n} products with the name and price as {shop} lists them, checked {date}. Calories, protein and allergens appear only for products whose page we've read.", "Has a card price",
  "We haven't read the nutrition for this product yet. The label on the pack has it, and so does the product's page on {shop}'s website.", "See the nutrition", "Open it on {shop}'s
  website", "Not affiliated with {shop}." (a possessive helper avoids the doubled "Sainsbury's's" of the older screens, which are unchanged). Tests: 5 unit, 1 Python, `e2e/groceries-all.mjs`
  (4 steps), axe 0 in light and dark on the real data. **Next:** read product pages for nutrition (Tier 2) in priority order so more products get numbers.

- 2026-10-09 — **Tier 2 for Sainsbury's: nutrition read from each product's own page.** A Sainsbury's product page prints a nutrition table (per 100 g/ml) but **no barcode**,
  so the numbers attach to the shop's product by its page address (slug), not to the Open Food Facts catalogue: `data/groceries/nutrition/sainsburys.csv` →
  `build_all_products.py` → the "Every Sainsbury's product" rows show "{kcal} kcal · {protein}g protein ... per 100 g", with a "Has nutrition" filter and "Most protein per 100 kcal" /
  "Most protein" sorts (products without numbers go last, never guessed). Reading is done by Chrome agents with a checksummed extractor (`tools/groceries/t2_extractor.js` v2) and a tool
  (`tools/groceries/t2_sainsburys.py`: slices, next, append, ingest) so a typing slip or a wrong page is caught: every line carries a hash of the page's own slug and a check of the numbers.
  Only a plain "per 100g/ml" table counts (a heading with "cooked", "prepared", "drained"... is filed as `g?` and kept out of the app); `<0.5` counts as 0; a main number the table
  lacks means the product is left without numbers. Priority order: meat & fish, dietary & world foods, chilled, frozen, food cupboard, snacks, fruit & veg, bakery, drinks (alcohol has no
  table and is not read); the first 4,000 are being read by three agents in the founder's Chrome. **Allergens are not read yet**: such a product's page says "Allergens aren't shown for this
  product yet: check the pack or the page" (never "none"). New copy: "Has nutrition", "Nutrition per 100 g", "Read from the product's own page on {shop}'s website, checked {date}.
  Allergens aren't shown for this product yet: check the pack or the page."

- 2026-10-09 — **Xcode preview shell running on the founder's iPhone** (docs/XCODE_PREVIEW_SHELL.md). `ios/MenuMacrosPreview/MenuMacrosPreview.xcodeproj` was
  created by Claude at the founder's request (overriding CLAUDE.md's "founder creates new targets" once; XcodeGen was used once as a generator and is not kept in
  the repo: edit the project in Xcode from now on, never regenerate). It holds the four files from `ios/PreviewSources/` plus our own icon, bundle
  `com.amanmarwaha.MenuMacrosPreview`, iOS 17, iPhone only, Swift 6 strict concurrency, team S7G6ZHHK59 (CLARIFO DEVELOPERS LTD, a paid team, so the install lasts
  until its profile expires on 2027-07-27, not 7 days), site address `https://menumacros.vercel.app/app`. It compiled first time. Checked in the iPhone 17 Pro
  simulator: the web view is exactly screen-sized, the page receives `env(safe-area-inset-*)` of 62/34 px, the floating tab bar sits above the home bar, pull-to-refresh
  reloads the page, and an external link opens Safari. Installed and launched on the founder's iPhone 16 (iOS 26.5); the founder's screenshot of the Nearby map confirms
  it runs. **Fixed on the way:** the onboarding page used `min-h-[calc(100dvh-3rem)]`, which assumed about 52 px of padding, but a notched iPhone adds 62 px at the top, so
  it overflowed by about 46 px and the "Skip" link sat under the fold (headless browser tests have no safe area, so they never saw it): now
  `calc(100dvh - max(1.25rem, env(safe-area-inset-top)) - 2rem)`. **Vercel:** Production is the `main` branch (fast-forwarded to the same commit as this branch) and
  `menumacros.vercel.app/app` returns 200 with no login wall; the Production Branch setting itself is still `main` (the Vercel connector cannot edit it and the CLI is
  not logged in), so pushes to this branch become Previews until a Production deployment is triggered or the setting is changed in the dashboard. **Nearby map logos
  (founder's request):** pins of chains with an official logo file now show it unmodified on its plain white or dark tile, scaled to fit and never cropped or stretched
  (`lib/mm/logoFit.ts`, tested); the selected pin gets a ring; chains without a logo file keep the green dot (CLAUDE.md rule 2).

- 2026-10-08 — **Accuracy pass results (see docs/ACCURACY_AUDIT.md).** Every chain published at the start of the day (150) was re-read from its
  official source by a second reader (about 24,000 item comparisons, other method than our script): extraction mistakes were rare (Gail's
  cut-off title, Greene King shifted tag, Bistrot Pierre allergen rows) but several chains' guides had drifted within days and were re-run (All
  Bar One, Ember Inns, Miller & Carter, Sizzling Pubs, Stonehouse, The Botanist, Pure, Rosa's Thai, Hickory's, BarBurrito, Caffè Nero, Wagamama's
  new 7 Oct menu); the chains' own documents contradict themselves often, so about 480 rows are held back (per-100 g shown as servings, kJ vs
  kcal, vegan marked milk/egg, battered or crumbed dishes with no gluten, desserts with no gluten, mayonnaise with no egg). Decisions (all
  conservative): (1) kJ that contradicts kcal holds a dish back only where we publish kJ (M&B guides publish none: those dishes stay when kcal
  agrees with their macros); (2) a dish that contains one tree nut/cereal and may contain another kind now shows the generic allergen
  (shared writers fixed: common.write_allergens and tenkites_a/b/c) — chains re-run so the data carries it; (3) a dish whose allergen row
  contradicts its own name or ingredient text, or whose guide row "excludes choices", is held back; (4) **Starbucks pulled** (its guide PDFs
  are disallowed by robots.txt: `data/held-robots/starbucks`, same as Subway, Zizzi, Pizza Express, ASK, Coco di Mama, Ole & Steen);
  (5) high-severity audit flags are 0 for nutrition and 0 for allergens in the republished data. New allergen coverage: Chipotle (read from the
  chart image), Five Guys (PDF matrix), Puccino's, IKEA, Itsu, Chilango, Tim Hortons, Tortilla, and the Mitchells & Butlers guide reader
  (All Bar One, Ember Inns, Nicholson's, O'Neill's). New chains: Blacklock, Caravan, Oodles Wok, Rola Wala, Yalla Yalla, Rockfish,
  Sainsbury's Café (calories-only). Photos added: Benugo, Dunkin', Chaiiwala, Franco Manca, Gail's, Hard Rock Café, Notcutts, Blank Street,
  Wasabi, Little Dessert Shop, Sticks'n'Sushi. `tools/uk_extract/robots_audit.py` now also checks every URL written in a chain's script.

- 2026-10-09 — **UK data after the second accuracy pass: 175 chains, 26,988 items live** (Production = `main`, same commit as this branch; 0 high-severity audit flags, 239 unit tests,
  site build clean). Since the 154-chain republish: new chains Wetherspoon, Simmons, BrewDog, Brunning & Price, Hall & Woodhouse, Away Resorts, Park Holidays UK, Showcase Cinemas, Chozen
  (the pub and holiday-park chains publish only dishes whose calories and allergens agree at 2-3 or more sites; the note says menus differ by site); Hotel du Vin re-read from its 20 pages and 8 PDFs;
  allergens added for Abokado (103 of 118), Benugo (68 of 80), Ping Pong (39 of 53), Jamie's Italian (60 of 67) after a pixel- or browser-level check with 0 mismatches; photos for Oodles Wok (77),
  Pizza Hut (86), Esquires (54), Shah's (9), Prezzo (13), Jollibee (24), TGI Fridays (4). Second-reader checks recorded for Wetherspoon, Maroush, Greenhalghs, Tenpin, Flat Iron, Gordon Ramsay,
  The Light Cinemas, Park Holidays, Showcase, Jollibee, Honi Poke. **Decisions (all conservative):** (1) set aside, not published (`data/held-unpublished/`, `docs/UK_DATA_STATUS.md`):
  Norse Catering (a primary-school lunch menu the public cannot order from) and Thaikhun (its Ten Kites page and the chain's own page disagree on 53 of 64 dishes); not extracted: Byron
  (its ordering app prints 0 kcal for 33 of 74 dishes), The Salad Project (page and PDF disagree), Brewhouse & Kitchen, Sushi Shop, Coffee Republic (blocked from this environment);
  (2) Honi Poke stays published with a note that its calculator scales each total (kcal x0.85, protein x1.10, carbs/fat x0.90) so a dish's headline kcal is 14-15% below the sum of its
  listed ingredients; the headline figure is what the chain's own dish page prints; (3) Jollibee's chart is dated March 2023 and the chain's October 2025 allergen list shows Pepsi drinks, so
  its Coke/Sprite/Fanta rows may be out of date (not changed); (4) Ping Pong's gluten-free dishes that its matrix marks with cereals show as containing gluten (the safe direction);
  (5) photos are installed even where a chain's terms restrict reuse (CLAUDE.md rule 2, the founder's 2026-10-06 decision), the clause is quoted in each helper's report; a 403 on an image
  host's robots.txt still stops the run (Sbarro/wixstatic, Amigos, Kokoro, Tortilla: scripts kept in `tools/uk_extract/images_*.py`, not run); (6) `cluck-house` and `bowl-and-co` are the two
  fictional sample chains, never to be verified or published. **Reality check on the 700-chain target:** of 454 candidate chains triaged only 87 publish full official nutrition and 97 calories only;
  137 publish none, 65 have closed, 61 block automated access; realistic total is about 190-200 chains. A usage-limit stop at 00:00 UTC killed eight helpers; their unfinished allergen, photo and
  verification work was restarted and nothing unverified was published (the republish was built from committed, gated work only).

- 2026-10-09 (later) — **176 chains, 26,944 items live** (`main` = this branch). Added Young's (65 dishes printed with identical calories at 2 or more of 257 pubs read, calories-only);
  allergens now complete for Leon (70 of 94), Mowgli (46 of 46), Dim T (66 of 100: 26 dishes without an exact guide row or contradicting their own text are held back, so Dim T lost those 26 calorie
  entries; an `ALIAS` dict in `dim_t.py` can restore a row the founder approves, and its 18 fryer-marked dishes list every allergen under "may contain" from the guide's own fryer-oil sentence, reading its
  "sulphates" as sulphites: please confirm), Fat Hippo (89), Wenzel's (108); each checked against the rendered source with 0 mismatches. Link-only stays for Pho, Strada, Wahaca, Franco Manca, Wildwood,
  Hard Rock Café, Mildreds, Burger & Lobster, Bagel Factory, Dave's Hot Chicken (reasons in each script's docstring). Simmons Bakers was re-read: kJ/kcal contradictions beyond 7% are now held back
  (45 held back, 4 salads left) and 3 meat tags fixed; **85 Simmons items print salt 0 g, probably a missing figure** (copied as printed). Photos: IKEA 112, Wenzel's 54, Yo! Sushi 53 (the chain's website
  prints a different kcal for 11 dishes; 4 with gaps over 5% are held back: Chicken Gyoza, Vegetable Gyoza, Prawn Crackers (second row), Cotton Candy Cheesecake). PGL Travel (a children's activity-holiday
  rota) was extracted (139 dishes, allergens complete) and set aside with Norse Catering in `data/held-unpublished/`. **Robots check:** a scan of every source site's robots.txt for rules naming Anthropic's crawlers
  found none that apply to our pages (Squarespace sites list AI crawler names in the same group as `*`, i.e. the ordinary rules; Premier Inn and Chaiiwala name ClaudeBot only for search/admin paths). Cafe Concerto's
  PDFs sit on a host whose robots.txt disallows everything: skipped (script `cafe_concerto.py --pdfs DIR` is ready if you save them).

- 2026-10-09 — **Founder's new targets: "I want 300 chains, keep going" then "I only want ones that have complete nutrition".** From now on only chains whose own source prints calories AND protein,
  carbohydrate and fat per dish are added (calories-only and allergen-only chains are not extracted). **Where we stand:** of the 176 published chains, 93 are full nutrition, 3 mixed (full for food) and 80 are
  calories-only; the earlier triage found only 87 full-nutrition chains in 454 candidates, so 300 complete-nutrition chains is not reachable from official sources (a realistic ceiling is about 110-130). The 80
  existing calories-only chains are left live until the founder says whether to remove them (they carry a "calories only" badge and appear in no ranking). Round 3 (triage of 143 more candidates + 8 new
  discovery segments) is running with the new rule.

- 2026-10-09 (evening) — **181 chains, 28,496 items live: 101 full nutrition, 80 calories only** (`main` = this branch; 0 high-severity audit flags). Round 3 for the founder's "complete nutrition
  only" rule: 143 more candidates triaged (batches in `data/candidates/triage3/`) and 8 new discovery segments (`seg-s3*.csv`): almost every brand the helpers could name was already known, and only five
  qualified: **Muffin Break** (491 items) and **Jamaica Blue** (359), both from the chains' own allergen-app CSVs (robots.txt 404 = no rules; salt left blank because the apps swap the per-serving and
  per-100 g salt columns), **Great Local Pubs** (344) and **Pubsmiths** (282), Stonegate brands on tkmenus pages, and **Roxy Leisure** (76, published only where the same row appears at 2+ of 20 venues);
  all with complete allergens. Skipped: Crêpe Affaire (7 of 56 dishes print nutrition), The Chapter Collection (6 pubs), Rita's and Core (one venue), Waterfields (22 bakery products, breads per loaf),
  Cook (frozen ready meals), HelloFresh/Wiltshire Farm Foods (home delivery), Carl's Jr UK (2 sites); blocked by robots or 403: Atis (15 London sites, macros in PDFs on a host whose robots.txt answers 403),
  Smith & Western, Galloways Bakers (names ClaudeBot with Disallow: /). Calories-only chains found by triage (Cornish Bakehouse, Burger & Sauce, Daisy Green, Bakers & Baristas, Deli by Shell, Butcombe Inns,
  Firmdale and others) were NOT extracted under the new rule. **All 80 published calories-only chains were re-checked for macros we might have missed: none upgrades** (their sources print kcal only;
  Greenhalghs and Wasabi print macros per 100 g only, Gail's food panel mixes bases; Hungry Horse's Smart Chef reports and Dave's Hot Chicken's "Nutritional Guide April 2026" PDF might print macros but
  sit behind robots.txt blocks: the founder can save them from their own browser). Realistic ceiling for complete-nutrition chains is now about 105-110.

- 2026-10-09 (night) — **Founder: "yes keep them [the 80 calories-only chains], now just keep adding chains as many as you can".** The 80 calories-only chains stay live. Additions: complete-nutrition chains
  first, then calories-only chains from triage that clear the quality bar (10+ UK sites, official per-dish calories, a source a script can read, sites that disagree published only where 2+ sites agree).
  Calories-only additions in progress: Daisy Green, Bakers & Baristas, Burger & Sauce, Cornish Bakehouse, Deli by Shell, Butcombe Inns, MyTime Active, Harbour Hotels; full nutrition: Papa's Fish & Chips (2018 lab report).

- 2026-10-10 (early) — **189 chains, 29,831 items live: 101 full nutrition, 88 calories only** (`main` = this branch; 0 high-severity audit flags). Added since 181: Daisy Green (278), Deli by Shell (90, valid
  October 2026 only, reissued monthly), Burger & Sauce (43, March 2025 sheet), Cornish Bakehouse (35, January 2025 sheet), Bakers & Baristas (589), MyTime Active (80), Harbour Hotels (28 dishes that agree at 2+ of 15
  hotels), Butcombe Inns (192, published only where name, calories and allergens agree at every pub printing them) — all calories-only (the founder allowed these again with "keep adding chains as many as you can").
  Papa's Fish & Chips (5 items, full nutrition, 2018 lab reports) was extracted and set aside in `data/held-unpublished/` because it has only about 5-9 current shops. **To confirm:** Deli by Shell's allergen matrix
  prints "M" in 283 cells with no key (read as "may contain": it can only add a warning; `READ_M_AS_MAY_CONTAIN` in `deli_by_shell.py` switches to link-only); Bakers & Baristas reads "Y*" as contains milk and "N*" as may
  contain milk. The pool of untried candidates is nearly exhausted (721 earlier discovery leads are almost all small regional groups with no nutrition page).

- 2026-10-10 (later) — **194 chains, 30,748 items live: 102 full nutrition, 92 calories only**: Amalfi (162, calories-only) and The Restaurant Hub (222, full nutrition, 21 sites) added; Coast to Coast, EST Italian, Black Rooster, Biff's, Poke House and Alley Cats checked and not added (reasons in docs/UK_DATA_STATUS.md). Chrome queues C and D (88 more chains) and docs/CHAINS_WORK_LIST.md written.
- 2026-10-10 — **192 chains, 30,372 items live: 101 full nutrition, 91 calories only** (`main` = this branch; 0 high-severity audit flags, 245 web tests, site build clean). Added: Brightside
  (326), Riva Blu (129), Cluck'd (72; its menu is a picture with no text layer, typed after every number was confirmed by OCR and, where the page has one, a second picture; the script stops if
  the picture changes) and 14 Kids items for Puttshack. Chaophraya was set aside (its two sources disagree: only 5 of 88 dishes agree), Chick-fil-A UK was not extracted (its sheet is per 100 g only).
  Details in docs/UK_DATA_STATUS.md ("Added 10 October 2026"). The Chrome route (docs/CHROME_TO_APP.md, data/chrome-inbox/QUEUE.md and QUEUE-B.md) is ready for the founder to run; the importer is
  `tools/uk_extract/chrome_import.py`.

- 2026-10-10 — **UI refresh (founder: "it looks basic, make it look amazing and eye pleasing").** Same green brand, more depth and colour: a mesh of soft
  lights behind every screen, layered shadows and press/lift motion on cards, a floating tab bar whose active tab is a gradient pill, Home rebuilt (search bar
  with a gradient go button, two quick-action tiles for Nearby and Groceries, targets card as two figure tiles with an edit button, Popular and Favourites as a
  two-column grid of restaurant tiles), the restaurant page header as one hero card (bigger logo tile, the data note inside it) with a segmented meal
  selector, menu rows with rounded photo thumbs, the item page with the chain's photo inside the hero card, a bar showing protein, carbs and fat grams side by
  side (published grams only, nothing converted; one hue per macro, labels only, never good/bad), section titles with a gradient marker, empty states with an
  icon, a picture of the Pro screen on Today (no numbers in it). New copy (rule 8, flagged): "a day" under the calorie target and the "Edit your targets" label
  on the pencil button. Every existing label kept. Checked on a production build: 245 unit tests, lint, tsc, e2e smoke (22), extra (9), browse (9; its
  Puccino's count was stale, 654 → now matches any 3-digit count), calories (4), axe 0 violations in light and dark on every screen, no horizontal overflow at
  100/150/200% text.

- 2026-10-10 — **Onboarding with a mascot, easier for everyone, more filters, logos, groceries (founder's list).** (1) **Pip**, our own mascot (a round green
  buddy with a sprout, drawn in SVG for this app: not food, not any restaurant's character), leads a new onboarding: welcome screen (Pip, "{n} UK
  restaurants", names of well-known chains, "No account needed / Stays on your phone / Every menu free"), then five big one-question steps (goal with a
  reply from Pip, targets, foods to avoid, text size, how it works), Pip walking along the progress bar, a "Your plan" card and a real example counted
  from the data ("At KFC alone I found 13 dishes with 20g+ protein that fit a 700 kcal lunch": `lib/mm/onboarding.ts`, tested), confetti at the end. The
  SPEC's step headings are kept. Pip also appears in the search hint and the Saved/Today empty states. (2) **Text size** Standard / Large / Extra large
  (100/115/130%) in onboarding and Settings, applied before the first paint, for older users. (3) **Filters:** Vegan (only dishes the restaurant itself names
  vegan or plant-based), **Halal** (chain-level: only the chain's own words, `data/dietary/halal-*.csv` → `lib/mm/halal-data.ts`; 11 chains say all their
  food is halal, 30 some; Home and Nearby get a Halal chip, restaurant pages quote the chain with a link), **allergies to avoid** (the 14 allergens; hides
  dishes whose guide lists them as contains or may contain, and dishes with no allergen information; a restaurant without readable allergen data says so and
  links its guide). Best for you uses the same filters (`chainForDiet`, ranking untouched). (4) **Logos: 185 of 194 chains** now show their own logo
  (all 11 Mitchells & Butlers pubs, KFC, Nando's, Pizza Hut, Premier Inn and 50 more; site icons used where a chain serves no other logo file: Brunning &
  Price, Coffee #1, Drake & Morgan, Giraffe, Great Local Pubs, Tenpin, Butlin's, Forest Holidays; Vue from its owner's brand page). The last 9 (Bettys,
  Chozen, Deli by Shell, Honi Poke, Hungry Horse, Kokoro, Simmons, Tesco Café, Wild Bean Café) are blocked to us and listed for the founder's Chrome in
  `data/chrome-inbox/QUEUE-LOGOS.md`. (5) **Groceries:** no Open Food Facts pictures anywhere (a shop's own photo or a "no photo" tile), more shop photos
  joined by barcode only (Tesco 339, Sainsbury's 809), own-brand products listed only under their own shop (Tesco 18 removed, 13 held back where brand and
  barcode prefix disagree), 543 products moved to the right type by rule (new type chip "Meat alternatives"). New copy (rule 8, flagged): the onboarding
  lines spoken by Pip, the goal hints, "Easy to read", "Your plan", "Halal", "Vegan", "Allergies to avoid", the allergy and halal caution sentences.
  Checked: 256 unit tests, 112 Python, e2e smoke 22, extra 9, browse 9, calories 4, groceries 6+8+5+4, axe 0 in light and dark, no overflow at 200% text.

- 2026-10-10 — **Eat out, shop, cook (founder: "the app isn't just for restaurant food ... it can craft recipes based on where you shop").**
  **Recipes from your shop** (`/app/recipes`, `/app/recipes/view?id=&r=`; `lib/mm/recipes.ts`, 12 recipes of ours): every ingredient is matched to a real
  product in the shop's full list (Sainsbury's, the only shop with prices and page nutrition today) and every figure is arithmetic on that product's own label
  for the recipe's amount: per 100 g or ml **as sold**, or **drained** for canned beans, chickpeas and tuna (the shop's pages and its price per kg both use the
  drained weight); a label the shop's page heads "cooked" is never used for an uncooked amount, and a kcal range per ingredient keeps out labels whose heading
  doesn't say (Sainsbury's own basmati and penne print cooked figures, so dry ones from other brands are picked). Default pick = cheapest pack; "Swap" lists every
  product that fits; "a serving" prices only the amount used (the shop's price per kg/litre), "to buy it all" the whole packs. Blurbs make no nutrition or health
  claims (rule 3; a test checks for "lean", "high in", "healthy"...); "No meat or fish" is by product name only, so allergens/halal are flagged as not read.
  **Shopping list** now takes shop products without a barcode (`shopId`) and notes the shelf price and date when added: a per-shop total ("£x for the items with a
  price, at Sainsbury's prices checked {date}. Prices change: check in store."). "Add to my list" on every shop product page; "Add all to my shopping list" on a recipe.
  **Positioning:** Home has four tiles (Find restaurants near you · Browse supermarket groceries · Cook from your shop · Your shopping list); onboarding's first screen
  shows Eat out / Shop / Cook, its "Let's go" button stays in view, a new step "Where do you shop?" (`settings.shops`; also in Settings › Your supermarkets) makes
  Groceries and Recipes open on that shop, and "Here's how it works" names all three; the website gained a "More than menus" section (its headline,
  `site.description` and the App Store title are unchanged: flagged below). New copy (rule 8, logged here): the recipe names, blurbs and methods, "Recipes from your
  shop", "Cook from your shop", "Your shopping list", "What to buy", "How to make it", "a serving", "to buy it all", "Also handy:", "No meat or fish", "Where do you
  shop?", "Your supermarkets", and the welcome lines "I'll help you eat out, shop and cook with the calories, protein and prices in front of you." / "Supermarket
  products with their labels and prices" / "Recipes made from your shop's products, with the cost per serving". Tests: 9 unit (`tests/recipes.test.ts`, incl. every
  recipe resolving against the published Sainsbury's list), `e2e/recipes.mjs` (6, axe light/dark), a11y + large-text lists extended.
  **Found on the way (not changed):** some Sainsbury's product pages print cooked figures under a plain "per 100g" heading (e.g. its own Penne 1kg shows 164 kcal
  per 100 g); the Mac's Tier 2 extractor v7 (merged the same day) labels such figures "cooked" from the page's own nutrition guide and is re-reading dry
  staples, so these rows fix themselves as the re-read reaches them (Penne 1kg not yet); recipes are protected by the kcal ranges meanwhile. **Flagged for the
  founder:** the website headline/description and App Store title still say restaurants only ("Know your macros before you order", "Fast Food Macros"); say if you
  want them to cover shopping and cooking too.

- 2026-10-10 — **Recipes you can fit to your numbers, recipes for your diet, and Pip's recipe maker with AI (founder: "complete macros ... allow the user to
  choose what macros they want ... use AI to make the recipe based on that or their diet"; "old people use it too, so it needs to be straightforward").**
  (1) **Pantry** (`lib/mm/pantry.ts`): 37 kinds of ingredient (each with its product match, its role, meat/fish/animal flags, the allergens it plainly contains, and
  a halal-named variant where Sainsbury's sells one: Tariq Halal chicken and beef). Our recipes are built from it (now 17: Black bean chilli, Cod with butter beans,
  Halloumi and chickpea wraps, Lentil and tomato pasta, Chicken thigh, bean and tomato rice added). (2) **Fit to your meal** (`fitRecipe`): the protein ingredients move
  by one factor and the carb ones by another (each half to double), everything else stays as written; amounts rounded to 5 g (eggs to whole eggs) and every figure is then
  worked out again from the labels. Recipes › **Your meal**: three big buttons (Small / Normal / Big = about 30% of the day's calories ±200 kcal; GLP-1 capped at the
  comfortable meal size), Normal or **More protein** (an aim of 30% of the meal's calories from protein at 4 kcal/g), **Type my own numbers** (calories, protein, carbs
  and fat limits), or **Show recipes as written**; remembered in Settings (`recipeMeal`). Recipes are sorted by closest fit. (3) **Full nutrition per serving**: energy
  (kcal and kJ), fat, saturates, carbohydrate, sugars, fibre, protein, salt, each summed from the labels; a figure that any product doesn't print shows "not on every
  label" (never filled in). (4) **Diet**: the Settings choices apply automatically (vegetarian, vegan, halal, no pork, no beef, allergies to avoid): a recipe with a
  kind that plainly doesn't suit is left out ("3 recipes are left out for your diet"), halal uses halal-named meat only and leaves out shellfish and meat without a
  halal-named product; Thai curry paste counts as fish (shrimp paste/fish sauce). Every screen says these are chosen by ingredient, not by each product's label: check each pack.
  (5) **Pip's recipe maker** (`/app/recipes/make`, `lib/mm/aiRecipe.ts`, `lib/recipeHandler.ts`, `lib/recipeAi.ts`, `POST /api/v1/recipe`): big buttons for the meal,
  how many people, the meal size, tap-to-fill ideas ("Comfort food", "A curry"...) or a short wish; the AI only chooses pantry kinds the diet allows (enforced in the
  structured-output schema and again on the server and in the browser), the amounts and the words. **It never supplies a number shown**: the app finds the products, fits
  the amounts and works out every figure from the labels. Its text is refused (and asked for once more) if the name or any step makes a health claim or gives a nutrition
  figure or price; a claim in the blurb or an extra is dropped. Saved recipes stay on the device (`mm.v1.myRecipes`, "Your recipes", cleared by Clear data). Model:
  **Claude Opus 5.5** at low effort (switched to Claude Haiku the same day, see below), structured output, Anthropic's server-side refusal fallback (`fallbacks: "default"`). Rate limit 5 per 10 minutes and 25 a day per caller
  (in memory per server instance), only our own pages may call it (Origin check), nothing stored. **New dependency `@anthropic-ai/sdk` 0.128.0** (pinned, released
  22 Sep 2026) for the founder's AI request (CLAUDE.md rule 6: added because the founder asked for AI recipes; logged here). Privacy page: new section "Recipes and Pip's
  recipe maker" and Anthropic in the processors list (last updated 10 October 2026). New copy (rule 8, logged here): "Your meal", "How big a meal?", "Small/Normal/Big",
  "More protein", "as the recipe has it", "Type my own numbers", "Show recipes as written", "Each recipe is fitted to about …", "Full nutrition per serving", "not on every label",
  "Your diet:", "… left out for your diet", "Ask Pip to make a recipe", "Ask Pip", "Which meal?", "How many people?", "Anything you'd like?", "Make my recipe", "I'm writing your
  recipe now…", "Save this recipe", "Make another", "Your recipes", "Made by Pip", the AI note and the privacy line. Tests: 290 unit (pantry, fitting, diets, real-data
  fits for all 17 recipes, halal at Sainsbury's, AI answer checks, server handler with a fake AI incl. retry/refusal/rate limit), `e2e/recipes.mjs` 10 steps (incl. what the
  recipe maker sends: only shop, meal, servings, target, diet, wish and pantry), axe 0, no overflow at 200% text on the new screens.
  **Not testable here:** a real call to the model (no API key in this environment); the whole flow is tested with a mocked answer.

- 2026-10-10 — **100 recipes, substitutes, Pro recipe maker on Claude Haiku (founder: "Use haiku claude please ... there should already be new recipes
  ... only for the people who subscribe to pro can make their own recipe ... make like maybe 100 different recipes ... with multiple substitutes of ingredients as
  some may not be available at specific grocery stores ... full macros ... I'll use nano banana later to make images").**
  (1) **Recipe book: 100 recipes** (`lib/mm/recipeBook/`: core 17, breakfast 18, lunch 18, world dinners 18, home dinners 18, snacks 11), each tagged with its meal.
  All 100 are complete at Sainsbury's from real products with full macros (kcal, protein, carbs, fat, plus kJ, saturates, sugars, fibre and salt where every label prints
  them); 50 have no meat or fish, 20 are vegan, 80 suit halal, 53 have no gluten and 59 no milk (counted by the app's own diet rules); 99 have at least one substitute. `tests/recipeBook.test.ts` checks every
  recipe: well formed, no claims or figures in the words (`cleanText`), a "cooked through / piping hot / opaque / set" check in the steps wherever meat, fish or eggs are cooked,
  resolves at Sainsbury's, 60-1,100 kcal a serving (snacks from 60, meals from 180), fits a 600 kcal meal. One recipe has no price a serving: wheat biscuits are sold by the
  count ("x24"), so there is no price per kg to work it out from (shown as "–", never guessed). Recipes were written by helpers to a fixed brief and pantry list, then checked by
  the test against the real list. (2) **Pantry: 80 kinds** (`lib/mm/pantry.ts`, was 24), each with match rules, a diet profile and **substitutes** (e.g. chicken → chicken thigh,
  Quorn, tofu; noodles → egg noodles, rice noodles; milk ↔ oat drink; any bean ↔ another bean; with an amount factor where it differs, e.g. 2.2 x gnocchi for dry pasta).
  When a shop doesn't sell an ingredient, the first substitute it does sell is used and the row says "{shop} doesn't sell {x} that fits, so this uses {y} instead."; the Swap
  sheet now offers "Use something else instead" (only substitutes the shop sells, each with its amount) above "Or pick a different product", and "As the recipe has it" goes back.
  Substitutes follow the person's diet (a vegan never sees a dairy substitute). Products named soup, chowder or broth are never picked for an ingredient; curry paste no longer
  picks korma (often nuts/milk) and counts mustard; Thai paste never picks massaman (peanuts). (3) **Recipes list for 100**: search (name, blurb and ingredients), meal chips
  (Any meal · Breakfast · Lunch · Dinner · Snacks), "No meat or fish", the count, 24 at a time with "Show more recipes". **Snacks are shown as written**, never fitted to a
  meal size ("Snacks are shown as written, not fitted to your meal size."). (4) **Pip's recipe maker is Pro**: the card carries a "Pro" badge and opens the paywall for free users;
  `/app/recipes/make` shows "Making a new recipe just for you is part of Menu Math Pro. All our ready-made recipes stay free." with "See Pro"; new paywall bullet "Pip makes new
  recipes just for you" (PaywallTrigger `recipeMaker`). Pro is still client-side until payments exist, so the API keeps its Origin check and rate limits (BACKEND.md).
  **Model: Claude Haiku 5.5** (`claude-haiku-5-5`, medium effort, structured output; no server-side fallback, which Haiku doesn't offer). (5) **Pictures for our recipes**
  (founder's decision; CLAUDE.md rule 2 amended narrowly): an AI illustration (Nano Banana) may show on **our own recipes only**, captioned "Illustration made with AI, not a photo
  of the products below." on the recipe and "AI illustration" on its tile; never for a restaurant's or a supermarket's item, never with packaging, logos, brand names or writing.
  `docs/RECIPE_IMAGE_PROMPTS.md` has one prompt per recipe (rewritten from the book by `WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts`, checked in step by that test);
  the founder saves each picture as `data/recipe-images/<id>.png` and runs `python3 tools/recipes/import_recipe_images.py` (4:3, 800 x 600 WebP named by content hash in
  `web/public/recipe-images/`, listed in `lib/mm/recipeImages.ts`; 3 Python tests); the service worker caches them like the other pictures. No pictures yet: recipes show the
  pot icon until then. New copy (rule 8, logged here): "Search recipes, e.g. chicken or curry", "Any meal", "Snacks", "{n} recipes match", "No recipes match.", "Try another word or
  meal.", "Show all recipes", "Show more recipes ({n} more)", "Use something else instead", "Or pick a different product", "As the recipe has it, {amount}", "{amount} in the recipe",
  "Instead of {x}.", the shop-lacks sentence above, the snack note, the Pro lines above, the picture captions, the 100 recipe names, blurbs and methods. Checked: 395 unit tests, 115
  Python, e2e recipes 12 (incl. 100-recipe list, substitute and back, Pro gate), smoke 22, extra 9, browse 9, calories 4, groceries 6+8+5+4, axe 0 light/dark, no overflow at 200% text.

- 2026-10-10 — **Nearby map: every restaurant has its own pin (founder: "I don't like how it has 10, 9, 2, 2, just add every restaurant on the map").**
  Number bubbles (clusters) are gone: each branch is drawn as its own logo tile or green dot (still at most the nearest 400; the list says so beyond that). Pins shrink as
  the map zooms out (logos 60% at town scale, full size from street level) so a busy area stays readable; tapping any pin selects it as before. **Fixed:** on the founder's
  iPhone a Greene King pin showed as an empty black tile (the file loaded but nothing was drawn); a logo is now decoded before it is drawn and checked afterwards, and a
  tile that comes out blank falls back to the green dot, so an empty tile can't appear. Checked: e2e map 6 of 7 (the 7th, "location refused", is the known headless-browser
  geolocation limit noted on 2026-10-08), axe 0 on Nearby in light and dark, screenshots at LS17 5PG (25 branches at 2 mi, 226 at 10 mi, all drawn).

- 2026-10-10 — **"Other" goal (founder: "Should also be an option for other too").** Onboarding step 1 and Settings › Goal gain **Other** ("Something else, or just here
  for the numbers"; Pip: "No problem. I'll show you the numbers and keep your orders around your target."). It works out suggested targets and ranks Best for you
  **exactly like Maintain** (no ranking constant changed, rule 8; tested: same targets, same top picks). The onboarding Continue/Skip buttons now stay in view at the
  bottom of every step (five goal cards can run past the fold on a notched iPhone), like the welcome screen's button. New copy (logged here): "Other", the hint and Pip's line.
  Not in docs/SPEC.md (four goals); the native app should add it too. Checked: 398 unit tests, e2e extra 10 (new: Other in onboarding and Settings), smoke 22, axe 0, no overflow at 200% text.

- 2026-10-10 — **Onboarding back button (founder: "Add a back button to go back to the previous screen").** Every onboarding step has a round back button left of
  "Step n of 6": it returns to the step before with the choices kept (step 1 returns to Pip's welcome screen). Screen-reader names "Back to the previous step" /
  "Back to the start" (new copy, logged here). Checked: e2e extra 11 (new: forward, back keeps the goal, back to the start), smoke 22, axe 0, no overflow at 200% text.

- 2026-10-10 — **The app in 11 languages (founder: "the first screen should be a screen where they choose their language"), and a new welcome screen
  (founder: "Screen 2 should be like this but have all the logos of the restaurants and grocery stores moving at the top").** Languages: English plus the ten
  most-spoken main languages in England and Wales after English (ONS Census 2021): Polish, Romanian, Punjabi (Gurmukhi), Urdu, Portuguese (European), Spanish (Spain),
  Arabic (MSA), Bengali, Gujarati, Italian (`web/lib/mm/i18n.ts`; adding or removing one is one line plus its dictionary). **First screen:** "Choose your language",
  a two-column grid of cards, each language in its own script with its English name, the browser's language pre-selected (never sent anywhere), the screen switching to a
  language as soon as it's tapped; Settings › Language switches later. **How it works:** every piece of our own text goes through `t("English text", { values })`
  (`app/app/_lib/i18n.ts`, `Rich` for sentences with styled words); library helpers take an optional translator; each language's dictionary (`web/lib/mm/locales/<code>.json`,
  English text → translation) is loaded only when chosen; `<html lang/dir>` is set before the first paint and the page waits for the words (3 s at most) so nobody sees a
  flash of English. Urdu and Arabic read right to left (start/end spacing throughout, arrows flip, no letter-spacing on joined scripts). `tests/i18n.test.ts` finds every
  key in the code (`t("…")`/`tk("…")` literals) and our data (the 100 recipes, pantry labels, meal types, grocery type names: 1,699 keys, about 12,400 words) into
  `keys.json`, and checks every language translates every key with the same {placeholders}; `tools/i18n/translate_chunks.py` hands out the missing keys and merges translations
  with the same checks. **Not translated, on purpose:** restaurant, dish and product names, chain notes and quotes (shown as each restaurant and shop publishes them, in English:
  the language screen says so), recipes Pip writes with AI (its claim/figure check reads English only), the website, privacy and terms pages. Shop names in our sentences no
  longer get an English possessive in other languages ("Tesco's"). **Translations were made by AI** (one translator per language, to a brief: exact allergen label names,
  "contains"/"may contain", cooking-safety wording, no health claims, the informal "you" where usual, Urdu "آپ"); they have not been checked by native speakers.
  **Welcome screen (screen 2):** a moving wall of the official logos of the restaurants in the app (unmodified files on their plain tiles; the very large files left out
  so it loads quickly) mixed with the supermarkets by plain-text name (we hold no supermarket logo files), drifting in alternating rows and still for reduced motion, then Pip,
  the app name, "Eat out, shop and cook. Know the numbers first.", "{n} UK restaurants · {n} supermarkets", the three promises, "Let's go", and "Terms · Privacy · Not affiliated
  with any restaurant or shop shown."; the language pill top left goes back to the language screen. CLAUDE.md rule 2 amended for this one screen (founder's decision; never on
  the website, marketing, store screenshots or the app icon). New copy (rule 8, logged here): the language screen lines, "Change language", the welcome tagline, counts line and
  not-affiliated line; every translation.

- 2026-10-10 — **A simpler layout: five tabs, Home is today, and Pip's intro (founder: "Screen 3/4/5 should be like this ... the nearby tab should be called
  the eat out tab ... The saved tab should be the recipes tab ... the Home Screen will be the today screen ... 4 tabs ... 'my groceries' ... so an 90 year old can
  easily understand and navigate it").** **Tabs:** Home · Eat out · Groceries · Recipes · Settings (was six; Today folded into Home). **Home** = today: the date, today's
  numbers (Pro: calories left with a ring, protein left, eaten so far in kcal/protein/carbs/fat, "See what you've eaten today" → `/app/today`; free: the daily targets,
  "Log your meals to see what's left today." and See Pro), then four big tiles: **My groceries** (`/app/groceries/list`), **My saved meals** (`/app/saved`: saved
  restaurant orders + favourite restaurants), **My recipes** (`/app/recipes/saved`, new: a "Save to My recipes" button on every recipe of ours, plus Pip's) and **My diet**
  (Settings › Diet and allergies). **Eat out** (`/app/eat-out`) = the old Home's restaurant list (search, all restaurants, Popular, Favourites, browse by type, A to Z) plus a
  "Near me" card that opens the map (`/app/map`, now with a back button). **My groceries** = the shopping list, now with typed-in items ("Milk", any shop), tick-off as things go
  in the basket (ticked items drop to the bottom, "Remove ticked", left out of the shared text), "What can I cook with this?" at the top → `/app/groceries/list/recipes`
  (recipes that use something on the list, the fewest still to buy first, "You have 2 of 4 ingredients", one tap adds the rest: the recipe's own picks at the shop) and
  "You might also need" (the missing ingredients of the recipe that uses most of the list). Matching (`lib/mm/listRecipes.ts`, 9 unit tests): a product from the same shop counts
  by the recipes' own product rules, another shop's product or typed words by name; each list item counts for one ingredient, and only the ingredient itself (chicken on the
  list doesn't make a beef recipe "one you can make"; the recipe still offers the swap). **Recipes tab**: no back button; when only one shop has a full list it says
  "Ingredients from Sainsbury's. More supermarkets will appear here as we read their products and prices." (the shop picker appears with a second shop).
  **Onboarding:** language → welcome ("Get started") → three Pip screens in a calm, adult tone (a large speech bubble above Pip: "Hi, I'm Pip." / "A few quick questions
  and a short tour, and you're ready." · "It only takes a minute." / "Let's go!" with a short, quiet burst of brand-green confetti, none for reduced motion) → the six
  questions; the last step is now the short tour: the tab bar, tab by tab, with the same icons. **Where the founder's plan was adjusted (told in chat):** (1) today's macros
  need meals logged, and logging is Pro (SPEC §7.8; rule 8 not touched), so a free user sees their targets on Home with See Pro: **say if logging should be free**;
  (2) recipes can only come from shops whose full product list, prices and labels we've read, so "filter by supermarket" shows one shop today; (3) suggestions come only from
  recipes (no invented "people also buy"); (4) the two extra tiles chosen: My recipes and My diet. New copy (rule 8, logged here): every string above, "Eat out", "Near me",
  "All restaurants", "Today's meals", "Any shop", "Get started", the tour lines; the Clear data sentence now says "the area you typed for Near me"; privacy page says "Near me
  map". All of it translated into the 10 languages (by Claude, not yet checked by native speakers; Punjabi and Urdu greet with "Hello", not a religious greeting).
  Checked on a production build: 419 unit tests, tsc, lint, e2e smoke 23, extra 11, recipes 13 (new: typed item, tick, cook-with-list, add missing, save to My recipes),
  browse 9, calories 4, languages 5, groceries 6+8+5+4, offline 13 (new pages precached), map 6 of 7 (the known headless geolocation limit), axe 0 violations on every
  screen incl. the new ones, no horizontal overflow at 100/150/200% text.

- 2026-10-10 (night) — **Founder: "Keep doing for more restaurants ... get my app to 300 restaurants whilst I sleep."** 202 chains are live (the Mac session's
  Domino's, McDonald's, Costa, Burger King, Starbucks, Turtle Bay, Sushi Shop and The Alchemist went live with the new layout). Decision for the push to 300 (product
  judgement, not a data rule): a **calories-only** chain now needs **5 or more GB sites** (was 10); full-nutrition chains still need 3+. Every data rule is unchanged
  (official source only, copied by script, never estimated, robots.txt and blocks honoured, sites that disagree published only where 2+ agree). Overnight work: logos for
  the 6 new chains without one, an independent re-read of Turtle Bay and Sushi Shop, a re-test of the 75 chains that blocked this environment, new discovery in four
  segments not covered before (travel food, leisure and hotels, the restaurant long tail, pub and bar brands: results in `data/candidates/triage4/`), and extraction of
  the calories-only chains already triaged (Leonardo Hotels, Avanti West Coast, Pasta Evangelists, Angus Steakhouse). Results are logged below as they land.

- 2026-10-11 (early) — **Overnight result: 220 chains, 34,918 items live (113 full nutrition, 107 calories only), up from 202.** Added (details in
  docs/UK_DATA_STATUS.md, "Added 10-11 October"): Pasta Evangelists, Leonardo Hotels, Avanti West Coast, The Salad Project, Zizzi, ASK Italian, Coco di
  Mama, PizzaExpress (the four back from their own HTML menus, which robots.txt allows; the held PDFs stay unused), Dishoom, Fuller's, Shepherd Neame
  (Ten Kites menus linked from their pubs' own sites, published only where 2+ pubs agree), Fireaway, Powerleague, Buy & Bite, Goals, Booths Café,
  **Subway** (195 products with full nutrition from its own product pages; the old PDF readers moved to `tools/uk_extract/held_pdf/`) and Atis.
  Every one passed `check_chain.py` with 0 errors and 0 high audit flags and had an independent re-read. Extracted but **held for you**:
  Kick Ass Burrito (52 items, full nutrition and allergens, but a delivery-only brand with no website of its own: `data/held-unpublished/`).
  Stopped by robots.txt or a block (not worked round): AirHop (its data host answers 403 to robots.txt), Brewhouse & Kitchen, Angus Steakhouse,
  Coffee Republic, Robinsons, TeamSport. **300 is not reachable from official sources:** about 1,400 names have now been triaged; the rest publish no
  per-dish figures, have closed, block automated access, or are too small. A realistic ceiling is about 225-235 without files from your own browser.
- 2026-10-11 — **Square logos (founder: "All logos should be 1:1 too for the app").** Every logo tile was already a square, but a wide wordmark sat
  in it with space above and below. A logo can't be cropped or redrawn (CLAUDE.md rule 2), so the tile now shows **the chain's own square icon**
  where its website serves one (its apple-touch-icon, web-app manifest icon or SVG site icon), saved unchanged (rasters over 256 px only scaled
  down proportionally) in `web/public/logos/square/` with a record per chain and `square/SOURCES.md`; an icon that fills its square is drawn edge to
  edge (in our rounded tile, like an app icon on a phone), otherwise it sits on the plain tile. The wordmark is the fallback if the icon fails to
  load. **126 of 220 chains** now have a square icon (5 have only that: Booths Café, Chozen, Deli by Shell, Hungry Horse, Simmons); the other 83
  with a logo keep their wordmark on the square tile (their sites serve no square icon of 120 px or more, or block us). Every icon was looked at on a
  contact sheet (`node web/e2e/square-sheet.mjs`); **left out after looking:** Blank Street (a plain green block), Nando's (a plain red heart; its
  rooster logo stays), Wahaca (a plain yellow circle), Rudy's (a plain half circle) and Wild Bean Café (bp's company mark, as in the earlier logo
  round). Deli by Shell shows Shell's mark (the café is named after Shell). Logos are on the list, restaurant pages, the welcome wall and the
  map pins. Also new: Subway's logo (from its own newsroom site) and Goals'. Tools: `tools/logos/fetch_square_icons.py` (robots honoured, 1 request a
  second, stops on 401/403/429) and `assemble_logos.py` (now also builds `SQUARE_ICONS`). Checked: 421 unit tests, e2e smoke 23, extra 11, browse 9,
  axe 0 in light and dark, map 6 of 7 (the known headless geolocation limit); screenshots of Eat out and the map in light and dark.

- 2026-10-11 — **Founder: "Yes please for both"**, then **"It should be pro. But right now I need all the features free so I can test them."**
  (1) **Logging stays Pro** (the brief free-logging change was undone the same hour: Log buttons, Today, Home's free targets card, the paywall
  bullet, the website FAQ and docs/SPEC.md are back as they were). (2) **Every Pro feature is free while the founder tests:** one switch,
  `ALL_FREE_FOR_TESTING` in `web/lib/mm/config.ts` (on by default; `NEXT_PUBLIC_ALL_FREE=0` turns it off), makes everyone count as Pro, so the
  paywall never appears; Settings shows "Pro (preview, for testing)". **Switch it off before launch** (founder to-do). The browser tests build
  with `NEXT_PUBLIC_ALL_FREE=0` so they still check the paywall (e2e/README.md). (3) **Kick Ass Burrito** (52 items, full nutrition and
  allergens) moved from `data/held-unpublished/` to `data/source/` and published: **221 chains live**.

- 2026-10-11 — **Photos for every product, and supermarket logos (founder: "Make sure you are adding images for every product too", "ensure all items have
  images from their respective grocery chain", "Add all logos for grocery stores too").** **Menu photos:** 8 helpers went through the 162 chains that had none, under
  the same rules as before (the chain's own site or feed only, robots.txt honoured, exact name or product-record matches, every set looked at on a contact sheet;
  photos with promotional lettering, printed figures, placeholders, drawn illustrations or another product's picture left out). Added 1,135 photos on 21 chains:
  Subway 146, ASK Italian 143, Zizzi 134, Coco di Mama 131, Nando's 123, Sushi Shop 123, Fireaway 57, Starbucks 55 (re-matched to its current items), Baynes 38,
  Turtle Bay 32, KFC 28, Greenhalgh's 26, Wild Bean Café 23, Ben's Cookies 19, Burger King 18, The Salad Project 11, Third Space 9, Sizzling Pubs 8, Chopstix 8,
  Brightside 2, Flat Iron 1. **4,329 of 37,226 items (12%) on 80 chains now have the chain's own photo** (was 3,194). The rest can't get one from here: most
  pubs, hotels, holiday parks, cinemas and many restaurants publish no per-dish photos (menus are PDFs or text), every Ten Kites-hosted menu's photos sit on
  images.tenkites.com (robots.txt `Disallow: /`), several sites block this environment (McDonald's, Domino's, Costa, Muffin Break, the Mitchells & Butlers
  brands, Bettys), and some chains keep their photos on hosts whose robots.txt answers 403 (Atis, The Alchemist, Honi Poke, The Breakfast Club, Buy & Bite, Kokoro,
  Tortilla, Sbarro, Amigos: scripts written and kept, not run; founder decision (d) below). **Supermarket logos:** each shop's own logo next to its name on the
  Groceries chips, "Every {shop} product", the product page's shop switcher, the shopping list, the shop picker and the welcome wall (`SHOP_LOGOS`, `ShopMark`;
  CLAUDE.md rule 2 amended): 9 of 11 installed from the companies' own sites (Sainsbury's and Aldi from their corporate/press pages, Waitrose from the John Lewis
  Partnership's, Asda from asda.jobs, the rest from the shopping sites), 6 with their own square icon; **Tesco and Co-op** blocked us (queued for the founder's
  browser in `data/chrome-inbox/QUEUE-LOGOS.md`; they show a basket meanwhile). Asda's wordmark file is single-colour (shows black), its square icon is the green A.
  **Grocery photos:** the full Sainsbury's list has the shop's own photo for 16,473 of 17,036 products (the other 563 had none on the category pages); the barcode
  catalogue has Sainsbury's 809 of 2,736 and Tesco 339 of 4,475: the only link from a barcode to the shop's photo is the shop's product page, which refuses this
  environment, so the rest needs the founder's Chrome run (`docs/NEXT_GROCERIES_IMAGES_PROMPT.md`, wanted lists in `data/groceries/wanted-images/`, full-list gaps
  read by `build_all_products.py` from `data/groceries/images/<shop>-listing.csv`). **Grocery data fix found on the way:** 15 community records whose calories can't
  match their protein and fat (e.g. "Breast mini fillets" 0.1 kcal with 4 g protein, "Cottage Pie Recipe Mix" 1.9 kcal) sat at the top of the default "most protein
  per 100 kcal" list; `build_groceries.implausible` now also rejects energy far below what the protein and fat give (carbs are left out of that check because
  sugar-free gum and sweeteners are mostly polyols), and they are out of the app. Checked: 423 unit tests, 115 Python, e2e smoke 23, extra 11, a11y 0 violations,
  groceries 6, groceries-all 5, groceries-compare 8, groceries-photos 4.

- 2026-10-11 — **Diet settings everywhere (founder: "I put in vegetarian and it's suggesting meat items, fix all of this please and categorise everything").**
  Checked first: no restaurant dish naming meat or fish carries the vegetarian tag (the 15 that mention a meat word are crisps flavours, "'prawn'
  crackers", oyster mushrooms, add-ons and meat-free versions), so the restaurant page and Best for you were right. The leaks were the screens that
  ignored the setting: **Groceries**, a shop's **full list**, **search** and the **order builder's pickers**. Now: (1) groceries
  (`lib/mm/foodDiet.ts`, 13 tests) leave out a product when its own name, brand, type, category, ingredients or allergens plainly say it doesn't suit
  (vegetarian: meat or fish, incl. gelatine and dishes like "chilli con carne"; vegan: also milk, eggs, honey unless the plant version is named; no pork /
  no beef: those words, gelatine counted for both; halal: pork, alcohol, and meat not named halal; allergies: as on restaurant pages, and a full shop list,
  which has no allergens, says it can't filter them). Meat-free versions are kept ("Quorn ... Chicken Style", "This Isn't Bacon"). Nothing is inferred the
  other way: a product that stays isn't promised to suit, and the list says "We go by each product's name, type and label, so this can't promise a product
  is {vegetarian}. Always check the pack." A product page that doesn't fit says so. (2) Search and the builder use the restaurant rule (tags, named vegan,
  allergens); the search file now carries each dish's diet letters (`docs/DATA.md` "Search file"; +50 KB gzipped). (3) Every screen has a **"Fits my diet"**
  chip (on by default when any diet is set) to see everything. (4) **Categorising:** the pipeline now adds `contains_pork` / `contains_beef` wherever a
  dish's own name says so (`name_tags` in `tools/build_menus.py`; bracketed add-on context ignored, meat-free versions and vegetarian dishes never
  tagged): **108 dishes in 46 chains** gained a tag (Burger King's and McDonald's bacon items, Costa and Starbucks ham/bacon, Domino's 'nduja, black
  pudding everywhere, steaks such as rump/sirloin/chateaubriand). (5) Found while checking: **115 grocery records whose label kJ and kcal disagree** (e.g.
  "Fruit jellies" 0.2 kcal but 1,446 kJ) are now left out (one of the two is wrong; `implausible()` in `build_groceries.py`). Recipes already followed the diet.
  New copy (rule 8, logged here; translated into the 10 languages by Claude, not yet checked by native speakers): "Fits my diet", the grocery caution
  sentence, "This product doesn't fit your diet settings, going by its name, type and label.", "We haven't read allergens for these products, so your
  allergy settings can't hide any here. Always check the pack." Checked: 439 unit tests, 119 Python, e2e diet (new, 5), smoke 23, extra 11, groceries
  6+5+8, recipes 13, browse 9, axe 0 on the full list. **Permissions:** `.claude/settings.json` now allows every shell command, web fetch and search
  without asking; `git push` and the Supabase database commands still ask (CLAUDE.md rule 4).

- 2026-10-11 — **Every Asda, Aldi and Lidl product, with each shop's own photos (founder: "What about the other grocery stores, ensure they all also have
  photos too"; answers: Tesco photos yes; publish Asda, Aldi and Lidl lists, all three as their accepted risk).** **Correction to the 2026-10-09 entry:**
  "Sainsbury's, Asda, Aldi, Lidl have no relevant clause found" was wrong for two of them: **Aldi's terms forbid "systematic or automated data collection ...
  (such as scraping ...)" without written consent and using its content "for commercial purposes without obtaining a licence"; Asda's terms were never read**
  (robots.txt disallows /terms*, and its site refuses this environment). Only Lidl has no such clause. The founder was told this and chose to publish all three.
  New "Every {shop} product" lists, built like Sainsbury's from the crawls of each shop's own category pages (8 Oct; names and prices as printed; no
  nutrition, so recipes stay on Sainsbury's: `recipeShops()` uses only shops whose labels we've read): **Asda 11,839 products, all with Asda's photo**
  (asdagroceries.scene7.com; links go to Asda's own search for the product, since its page addresses aren't known); **Aldi 3,466, 3,403 with Aldi's photo**
  (dm.emea.cms.aldi.cx; 3,450 link to the product's own page from Aldi's sitemap_products.xml, which Aldi answered once and then refused our script's client:
  the saved copy is `data/groceries/listing/raw/aldi_sitemap_products.xml`, never re-fetched); **Lidl 238, 237 with Lidl's photo** (each product's own page read
  once for its og:image, 269 pages, 1 a second, robots.txt allows /p/; the 32 products found only on offer pages, some of them next week's deals, are left out).
  Photos are loaded from the shops' own servers (not stored). Every Lidl photo, and 108 random Asda and Aldi ones, were looked at on contact sheets: each shows
  the product named (one Asda picture failed to load and the row shows "no photo"). Unit prices are copied as printed and converted only exactly (Aldi "100 G"
  x10 = per kg, "75 CL" /0.75 = per litre). The diet filter knows these shops' aisle names (Asda "Meat, Poultry & Fish", Lidl "Meat & Poultry" / "Fish &
  Seafood", "Wine, Beer & Spirits", Aldi "Alcohol"). Asda links now use www.asda.com/groceries/search/ (the old groceries.asda.com address only redirects to
  Asda's home page; the product page's Asda search link is fixed too). **Tesco:** the founder said yes, but Tesco's image server refuses this environment for the
  photos themselves (403), so no copies are stored; the 332 Tesco photos keep loading from Tesco, and the Chrome run (docs/NEXT_GROCERIES_IMAGES_PROMPT.md) may now
  read Tesco product pages for barcodes and photos. Morrisons, Waitrose, Tesco, Iceland and M&S lists stay in `data/` only. Tools: `tools/groceries/shop_pages.py`,
  `tools/groceries/lidl_photos.py`; `ingest_listing.py` and `build_all_products.py` handle the three shops (Sainsbury's file unchanged byte for byte). No new copy.
  Checked: 444 unit tests, 124 Python, e2e groceries-all 6 (new: a second shop's photo template, sitemap page link and both lists), groceries 6, compare 8,
  diet 5, recipes 13, smoke 23, a11y 0 violations; each new list in light and dark (photos load, no overflow, also at the largest text size).

- 2026-10-11 — **Every grocery list published: nine supermarkets, 74,911 products, each with its own shop's photo (founder: "I say yes" = Tesco photos;
  "all the grocery stores, all the items ... only groceries").** Added Tesco 6,086, Waitrose 11,424, Morrisons 18,382, Iceland 6,202 and M&S 291 to the
  "Every {shop} product" lists (Sainsbury's 17,002, Asda 11,820, Aldi 3,466, Lidl 238 as before), built from the crawls of each shop's own category pages
  (8-9 Oct). Each is the founder's accepted risk against its terms (quoted in docs/IMAGE_TERMS.md: Tesco bans bots and AI tools; M&S bans crawling, copying and
  commercial use; Iceland 3.2 and Waitrose forbid reproducing content without permission; Morrisons allows extracts for own use only). Photos load from each
  shop's own image server (Waitrose, Morrisons, Iceland and M&S: random sets of 36 looked at on contact sheets, every one shows the product named; Tesco's
  server refuses this environment, so its 6,063 photos could not be looked at here and load only in visitors' browsers, falling back to "no photo").
  Links: Iceland to the product's own page; Tesco to its product page; Waitrose, Morrisons and M&S to the shop's own search for the name (their crawls kept
  no page addresses). Rules (`tools/groceries/ingest_listing.py`): Morrisons' size line follows the name only when the name has no quantity; a Morrisons meal
  deal is not a card price (529 real More Card prices kept); Waitrose loose items priced as an estimate ("Typical weight ...", 105) and M&S tiles with two
  prices and no "was" (12) are left out, never shown as a shelf price. **Groceries only** (`not_food` in `build_all_products.py`, applied to every shop, so
  Sainsbury's lost 14 and Asda 7): birthday candles and sparklers, cake toppers, flower bouquets, M&S flower gifts, cake cases, coffee filter papers, a dog toy;
  a cake named after its decoration ("Balloon & Stars Cake") and charcoal-cooked kebabs stay. Still no nutrition for these lists except Sainsbury's (next:
  barcode matches). **Co-op** has no list (it blocks even through a UK VPN) and **Ocado's** crawl stays quarantined. Tesco's crawl covers fresh food, bakery
  and most of frozen (Tesco's bot check stopped it); the rest needs the Chrome run. No new copy. Checked: 129 Python, 445 unit tests, tsc, lint, e2e
  groceries-all 6, groceries 6, diet 5, smoke 23; screenshots of Morrisons' list, an Iceland product (photo + "Open it on Iceland's website") and Groceries.

- 2026-10-11 — **Every recipe complete, and products shared across shops by barcode (founder: "make sure every recipe is fully complete"; the Alpro example).**
  **Recipes:** all 129 different "extras" (salt and pepper, oil, garlic, onions, lemons, herbs, spices, vegetables) are now real ingredients with amounts,
  listed, priced and counted like everything else: 49 new pantry kinds (`lib/mm/pantry.ts`: seasonings, dried herbs, oils, garlic and ginger paste,
  lemon/lime juice, onions, carrots, peppers, chillies, salad, beans, broccoli, herbs, bananas, apples), each matched to Sainsbury's products with a
  read label. The chicken shawarma wraps now buy cumin, paprika, two garlic cloves, lemon juice, lettuce, tomatoes, cucumber, salt and pepper.
  A test (`tests/recipeBook.test.ts`) fails any recipe whose method names a food it doesn't buy, any recipe with "extras" left, and any without a
  price a serving; 3 methods were reworded (celery, which Sainsbury's has no label for, taken out of the minestrone; chives -> the spring onions
  it buys; "cucumber or pepper" -> cucumber) and the tofu satay and chicken rice bowl now buy their vegetables. **Costs:** "a serving" includes
  the share of each jar used (2 g of a 43 g jar of cumin); "to buy it all" includes the whole jar; whole items sold one at a time (a pepper, a
  cucumber, a pack of 3 onions) are counted as whole items at the shop's own price each ("about 1 pepper"), loose produce by weight, and a pack
  priced per kg without a weight in its name by the shop's own price ÷ price per kg. Store-cupboard items say "You may have this already" with an
  "I have this" button that leaves them off the shopping list and the price to buy it all (remembered on this device, `mm.v1.cupboard`, cleared by
  Clear data; privacy page says so); a serving's price and numbers always include them. Ground cinnamon's label hasn't been read yet: it is
  listed and priced and the page says it isn't counted (never filled in). Among products within 50p of the cheapest, the one whose label
  prints the most figures is chosen, so recipes with a blank saturates/sugars/salt row went from 23 to 4; **fibre is now blank in 74 recipes (44
  before)** because salt, spice and lemon-juice labels don't print fibre. Oil and seasonings now count, so kcal rose a little (all 100 still
  within the book's 60-1,100 kcal range). Pip's AI recipes must list seasonings as ingredients too (prompt and checks; old saved recipes keep
  their notes). New copy (rule 8, logged here; translated into the 10 languages by AI): the 49 kind names, "You may have this already.", "I have
  this", "Left off your list and the price to buy it all.", the two "label not read" sentences, the counted notes ("about 1 pepper"...), the Recipes
  footer sentence ("including the pinch of salt and the spoon of oil") and the 4 reworded steps.
  **Groceries by barcode:** the shops' own lists now prove a shop sells a barcode and give its own name, price and photo (Asda names its pictures by
  barcode; Sainsbury's and Tesco through product pages read). Open Food Facts records for 12,908 such barcodes were taken from its daily export
  (its product API answered 429 after ~200 reads; it asks bulk users to use the export: streamed once, only our barcodes kept), found for 9,913,
  and added only when they pass the catalogue's checks and their name shares a word with the shop's own name (217 failed that). Shop-internal
  numbers (EAN-8 0/2, EAN-13 2/02/04) are never shared between shops. Catalogue: **Asda 3 -> 6,740 products (6,731 with Asda's photo)**, Sainsbury's
  2,667 -> 3,839, Tesco 4,414 -> 4,915 (834 with Tesco's photo, 136 more showing another shop's photo of the same barcode). Only 683 products are at 2+
  of these shops, because the Tesco catalogue is mostly Tesco's own brand. Asda's full list now carries the barcode for 11,109 products, so 6,740 link
  to their full page with nutrition. The rest (official labels, Tesco's unfinished categories, Co-op) needs the founder's Chrome:
  `docs/NEXT_GROCERIES_ALL_SHOPS_PROMPT.md`. Tools: `tools/groceries/fetch_off_codes.py`, `off_export_filter.py`, `build_groceries.py --patch --add-codes`.
  Checked: 130 Python, 445 unit tests, tsc, lint, e2e recipes 13 (new: 7 ingredients, "I have this" lowers the basket and leaves cumin off the list),
  groceries 6, groceries-all 6, compare 8, diet 5, smoke 23, extra 11, languages 5, a11y 0 violations, no overflow at 200% text; contact sheet of 36 new
  Asda catalogue products (every photo matches its name).

- 2026-10-11 — **Same product at different shops by exact name and pack size (founder's answer: "Yes, exact name + size").** A branded list row
  without a barcode now takes the barcode of the one product in the barcoded lists (Asda's pictures, Sainsbury's and Tesco pages read) whose name and
  pack size are identical after tidying (`name_key` in `tools/groceries/build_groceries.py`: lower case, "&" = "and", units written one way, punctuation
  dropped). Never a shop's own brand (a name naming any supermarket or one of their ranges), never a name without a size, and a name two barcodes share
  is left out. Matched: Tesco +315, Waitrose 667, Morrisons 1,677, Iceland 1,531, Sainsbury's +931 rows; a sheet of 30 random pairs was checked by eye
  (every pair the same product). The catalogue now lists each match under its shop with that shop's own name, photo and price (search link where the
  list has no page): Waitrose 489, Morrisons 1,215, Iceland 1,096, Tesco 5,164 (1,088 with Tesco's photo), Sainsbury's 4,477; **2,685 products show
  prices at 2+ shops** (683 before), e.g. Heinz Cream of Tomato Soup 400g at Morrisons, Asda (lowest), Sainsbury's and Iceland. The lists carry
  the barcode for 1,583 Tesco, 1,682 Morrisons, 668 Waitrose and 1,537 Iceland products, so those link to the full page. Catalogue files total 10.6 MB
  (the "all shops" view loads them all; the simpler one-shop Groceries screen comes next). Checked: 133 Python, 445 unit tests, e2e groceries 6,
  groceries-all 6, compare 8, diet 5, recipes 13, smoke 23; screenshot of the five-shop product page.

- 2026-10-11 — **Groceries opens on "Which shop?" (founder: simple enough for their 90-year-old granddad; "Tesco's is missing all the photos").**
  The Groceries tab is now one plain question: a big button per supermarket (its logo, name and how many products), the person's own shops first
  ("Your shop"), "Not here yet: Co-op, Ocado." under them, then two buttons, "Scan a barcode" and "Search every shop at once". A shop's button opens
  **that shop's own full list** as the main list (its own photo and price for nearly every product: Tesco's photo is on 6,063 of 6,086), with one search
  box, an "Aisle" menu (was a sideways row of chips) and a labelled "Sort" menu; "Name A to Z" now lists names that start with a letter first (was
  "-196 Shochu" and "1000 Stories" at the top). Products the list has no label for take the community numbers of the **same barcode** from the
  barcode catalogue, so far more show calories and protein (Tesco 250 -> 1,012; barcodes compared ignoring leading zeros), and the footer says where
  those numbers come from. The old all-shops screen moved to `/app/groceries/search` ("Search every shop", with a back button) and is unchanged
  otherwise. New copy (rule 8, logged here; translated into the 10 languages by AI): "Which shop?", "Tap a shop to see its products, prices and photos.",
  "Your shop", "Not here yet: {shops}.", "Search every shop at once", "Search every shop", "Find a product at every supermarket that sells it, with its
  calories, protein and allergens.", "My list", "{n} products, with the prices {shop} showed on {date}.", "{count} of them show calories and protein.",
  "Calories and protein aren't shown for these yet.", "Aisle", "Every aisle", "More {shop} products with their numbers", and the footer line on community
  numbers. Found on the way (not changed): three list names lost a letter in the crawl ("?owicz" for Łowicz, "Zo?adkowa", an Iceland name ending in "?").
  Checked: 446 unit tests, tsc, lint, e2e groceries-all 6 (new first step: the shop picker), groceries 6, photos 4, compare 8, diet 5, smoke 23, extra 11,
  languages 5, offline 13, a11y 0 violations, no overflow at 200% text (the three grocery screens added to the large-text test).

- 2026-10-11 — **Plainer screens for older users (founder: their 90-year-old granddad gets confused in Eat out, Groceries and Recipes).** Fewer
  choices on screen at once, bigger text and words on buttons; nothing about the data, ranking or prices changed. **Eat out:** search, "Near me" and the
  list; the type, "Full nutrition only" and "Halal" choices sit behind one "More ways to find a restaurant" button (wrapping, no sideways row; closing
  it goes back to every restaurant). **A restaurant:** the five diet chips are one line, "Your diet: Vegetarian · Change", which opens the same big-button
  picker as Settings (diets and allergies together); section headings, item names, notes and the "Show all" buttons are body size; in every item row
  the calories and protein are darker than carbs and fat. **An item:** the big calories and protein stay; saturated fat, salt, sugar and fibre open
  under "More detail" (the allergens stay in view). **Recipes:** the first question is "Which meal?" as five big buttons, then search and "No meat or
  fish"; the meal-size choices open under "Adjust", next to the line saying what recipes are fitted to. **Everywhere:** every back button says "Back"
  (was an arrow only), chips and the tab labels are bigger (a long translated label such as "Supermercado" now goes onto a second line instead of
  pushing "Ajustes" off the bar), and the small grey 12 px text on these screens is body size. "Best for you" keeps its name: the plan's "Good choices
  for you" would call food good (CLAUDE.md rule 3). New copy (rule 8, logged here; translated into the 10 languages by AI): "More ways to find a
  restaurant", "More detail", "Saturated fat, salt, sugar and fibre", "Adjust"; "Allergies" and "Allergies · {n}" are no longer used. Checked: 446 unit
  tests, tsc, lint, e2e smoke 23, extra 11, browse 9 (new: the choices are hidden until asked and closing them shows every restaurant), calories 4,
  recipes 13 (new: sizes hidden until Adjust), languages 5, groceries 6, groceries-all 6, compare 8, photos 4, diet 5, share, offline 13, a11y 0 violations,
  no horizontal overflow at 100/150/200% text; screenshots in light, dark and extra-large text, and the tab bar in Spanish and Italian.

- 2026-10-11 — **Home has two tiles: "Shopping list" and "My meals" (founder's sketch on the Home screenshot: "there needs to be one of them ... my meals
  ... two tabs ... your recipes ... your favourite restaurant meals ... very dead simple page"; "the My Diet one, there's no need for it").** "My groceries"
  is now **Shopping list** (tile and page title). **My meals** (`/app/meals`, line "Your favourite meals", count of saved recipes and restaurant meals) is one
  page with two big tabs, **Recipes** (recipes saved from our book and the ones Pip made) and **Restaurant meals** (saved orders, then favourite
  restaurants); the tab is kept in the address (`?tab=restaurant`), saving an order from the builder opens that tab, and with no recipes saved but some
  restaurant meals it opens on Restaurant meals. The old addresses `/app/saved` and `/app/recipes/saved` forward to the matching tab (bookmarks and
  installed copies keep working; the service worker precaches `/app/meals`). The **My diet** tile is gone (diet stays in Settings › Diet and allergies and
  on every restaurant page's "Your diet … Change" line). The recipe button now reads "Save to My meals" and the Recipes tab's pill "My meals". Nothing about
  the data changed. New copy (rule 8, logged here; translated into the 10 languages by AI): "My meals", "Restaurant meals", "Your favourite meals",
  "Save to My meals", "Saved to My meals", "Open any recipe and tap “Save to My meals”. It will be here next time.", "Back to shopping list"; no longer
  used: "My groceries", "My saved meals", "My recipes", "My diet" and their tile lines. Checked: 446 unit tests, tsc, lint, e2e smoke 23 (new: only the
  two tiles), recipes 13 (new: the tile opens My meals, tabs switch, both old addresses forward), extra 11, languages 5, a11y 0 violations, offline 13,
  no overflow at 200% text; screenshots of Home and both tabs in light, dark and extra-large text.

- 2026-10-11 — **No alcohol, a photo and a price for every grocery listed, favourite restaurants, recently viewed, a tidier restaurant page and a new
  Recipes look (founder's list).** **Groceries:** (1) "You don't need to add alcohol drinks ... like whisky etc. Just no point": every beer, lager, cider, wine,
  spirit and alcoholic ready-to-drink is out of every shop's list and the barcode catalogue (`build_groceries.is_alcohol`: the shop's alcohol aisle, or the
  product's own name naming an alcoholic drink with a drink size; alcohol-free versions, mixers, soft drinks and food that only names a drink stay, e.g. wine
  vinegar, Baileys truffles, mirin; 22 test cases). Lists: Sainsbury's 15,310, Morrisons 16,373, Asda 10,527, Waitrose 9,726, Tesco 6,079, Iceland 5,976, Aldi 3,207,
  M&S 194, Lidl 193 (67,585, was 74,911). Advert tiles ("Sponsored", "Occasions") and flowers are out too. (2) "Every item should have a photo and say the price":
  the "Search every shop" catalogue now lists a product under a shop **only when that shop's own list shows its price** (`mergeProducts(..., { pricedOnly: true })`);
  the community database's word alone no longer counts, which is why Tesco looked photo-less (3,996 of its 5,163 records had no Tesco price or photo; 1,065 are
  listed now, all priced). Records left out still lend their photo, and a scanned barcode no shop prices still opens with its numbers. The "Has a price" chip
  is gone (everything listed has one). (3) A list row with no photo of its own borrows the same product's photo from another supermarket's own website (same
  barcode, or the same branded name and pack size with the words in any order; never a shop's own brand) and, where no supermarket has one, the **Open Food Facts
  front photo of that exact barcode** (founder: "use the EAN number ... find an image of it ... if you can't find it on the supermarket's website"). Google image
  search was not used: Google forbids automated searching and those pictures belong to whichever site posted them; Open Food Facts is looked up by the exact
  barcode, licensed for reuse (CC BY-SA, credited "Photo: Open Food Facts contributors (CC BY-SA)") and allows this use. 84 barcodes were asked for
  (`tools/groceries/fetch_off_images.py`, one request every 1.5 s), 78 had a front photo, every one was looked at on a contact sheet and **5 were left out**
  (2 show the back of the pack, 1 is a different product, 2 too dark or blurry; recorded in `data/groceries/images/off-front.csv`); 74 catalogue products use one.
  Still without any photo: **Sainsbury's 522 bakery products** (that aisle's crawl saved no pictures and they have no barcode, so they can't be looked up; they are
  on the Chrome run's list, `data/groceries/wanted-images/sainsburys-listing.csv`), Aldi 61, Tesco 22, Iceland 20, Lidl 1. Tesco's photos load from Tesco's own
  server, which refuses this cloud computer, so they could not be checked here. Privacy page updated (photos can come from Open Food Facts; the recently viewed
  dishes below), last updated 11 October 2026. **Eat out:** a **"My favourite restaurants"** card under "Near me" opens `/app/eat-out/favourites`: the person's
  favourites, then every restaurant with a big "Save" star (search by name); the same favourites as the star on a restaurant's page (the old Favourites grid on
  Eat out is replaced by the card). **Recently viewed:** a dish opened is remembered on this device for **24 hours** (`lib/mm/recent.ts`, `mm.v1.recentItems`, at
  most 60, cleared by Clear data) and listed at the top of that restaurant's page, newest first (up to 5); after a day it is gone. **A restaurant's page:** the meal
  choice ("Which meal?"), the diet line ("Your diet: ... Change") and the Best for you picks are now one card, so it reads as "best for this meal and my diet";
  smaller gaps between sections. **Recipes:** a header card with Pip and one sentence ("Every ingredient is a real product at Sainsbury's, with its price and the
  nutrition of each serving."), search, "Which meal?" as four big buttons with our own simple icons (sunrise, sandwich, moon, apple) and "Any meal", one card
  for what recipes are fitted to (Adjust) and the diet (Change); each recipe tile has a coloured band for its meal, a bigger name, and "calories", "protein" and
  "a serving" (price) in words instead of KCAL/EACH, with "35 min", "Serves 4" and "No meat or fish" as labels. New copy (rule 8, logged here; translated into the
  10 languages by AI): "My favourite restaurants", "Keep the places you go to here", "No favourite restaurants yet", "Tap the star next to a restaurant below, or on
  its page, and it will be here next time.", "Add a restaurant", "Search restaurants", "Type a restaurant's name", "Type a name to find any of the {n} restaurants.",
  "No restaurant matches “{query}”.", "Saved", "Recently viewed", the Recipes header sentence (with and without the shop's name), "Photo: Open Food Facts
  contributors (CC BY-SA)". Checked: 136 Python, 451 unit tests, tsc, lint, e2e smoke 23, extra 12 (new: favourites and recently viewed incl. the 24-hour expiry),
  browse 9, calories 4, recipes 13, groceries 6, groceries-all 6, compare 8, photos 4, diet 5, languages 5, a11y 0 violations, no overflow at 200% text;
  screenshots of Eat out, favourites, a restaurant, Recipes and the Tesco catalogue in light, dark and extra-large text.

- 2026-10-11 (afternoon) — **224 chains live: three more restaurants** (founder: "get another agent to also add more restaurants"; added by a helper in its own
  worktree, merged here; details in docs/UK_DATA_STATUS.md "Added 11 October (afternoon)"): **The Chapter Collection** (163 dishes, full nutrition and allergens,
  6 Stonegate pubs; 9 held back where the chain's own figures contradict each other), **Chef & Brewer** (204, calories only, the same figures at all 138 pubs' own
  menu feeds) and **Morrisons Café** (114, calories only, the café's own England and Wales menu; 8 breakfast dishes whose Scottish recipe prints other calories
  under the same name are left out). Each passed check_chain with 0 errors and 0 high audit flags and had an independent re-read; logos from each chain's own site.
  No alcoholic drinks were added (founder's rule of 11 October; 0% drinks stay). Checked and not added: Fazenda/Fogo de Chão, Roti UK, Carl's Jr UK, Imperial Hotels,
  Marston's, Metropolitan Pub Co; blocked: Pesto, Old English Inns, Coffee Republic. The reachable pool is close to exhausted.

- 2026-10-11 (evening) — **Every Lidl product (founder: "Lidl only has 193 products you need all of them"; answer to the price question: "Add all, say
  'Price in store'").** Lidl's website lists in its "Food & Drink" pages only its weekly offers and special buys (the 270 crawled, 193 after the alcohol rule).
  Its own product sitemap (saved: `data/groceries/listing/raw/lidl_product_sitemap.xml`) has a page for the everyday range too; every one of its 1,918 pages
  was read once (`tools/groceries/lidl_range.py read`: robots.txt allows /p/, about one page a second, nothing refused; only the few fields needed are kept,
  `raw/lidl_pages.jsonl`). Those pages carry the name, Lidl's own aisle, Lidl's own photo and "Available in store now", but **most print no price** (the page's
  offer has none and its data says `price: null`), and **none prints a barcode or nutrition**. Kept (`lidl_range.py write` -> `data/groceries/listing/lidl-range.csv`,
  summary in `raw/lidl_range_summary.txt`): food in Lidl's own food aisles only (Lidl files hand wash, candles, nappies and pet food under its food world too,
  so those aisles are left out; baby food and formula and protein snacks/drinks stay, vitamin pills don't), on sale now or "In store from" a date within a week
  (21 special buys due later are left out until a later read), no alcohol (Lidl's wine/beer/spirits world and `is_alcohol`). **Lidl now lists 1,037 products
  (was 193): 264 with a price, 773 "Price in store"**; 1,022 with Lidl's own photo. **Exception for Lidl only** to "every item says the price": the builder lets a
  row from Lidl's own product pages have no price (`PRICE_IN_STORE` in `build_all_products.py`); every other shop, and Lidl's offer-page rows, still need a printed
  price; a product's own page stands in for an offer-page-only row (27 such, e.g. carrots, salmon fillets). The app shows **"Price in store"** in the row and on
  the product page with "{shop} shows prices on its website only for its weekly offers. Check this product's price in store."; the list line reads "{n} products
  from {shop}'s website, checked {date}. {count} show a price. {shop} shows the others' prices only in store."; price sorts put them last; recipes never use a
  product without a price (`hasPrice`); the shopping list total already counts only items with a price. **Photos looked at:** a contact sheet of 72 random new
  ones (71 right) plus every photo shared by different products and an automatic scan of all 1,036 for blank or empty pictures: **14 left out** in the new
  `data/groceries/images/listing-exclude.csv` (read by the builder, so a rerun can't bring them back): 4 of Lidl's "MISSING IMAGE" placeholder, 8 blank white
  pictures Lidl serves for several products, the vanilla protein pudding showing the chocolate pot, and plain crisps showing the ridge-cut pack. New copy (rule 8,
  logged here; translated into the 10 languages by AI): "Price in store" and the two sentences above. Checked: 138 Python (new: page reader, aisles, "in store
  from" dates, unpriced rows Lidl-only, offer row giving way, photo exclusions), 453 unit (null price decode and sort, recipes skip unpriced products), e2e
  groceries-all 7 (new: an unpriced Lidl product, light and dark, axe 0), groceries 6, compare 8, diet 5, recipes 13, smoke 23; screenshots of the real Lidl list
  and a product in light, dark and extra-large text (no overflow).

- 2026-10-11 (evening) — **Compare, and a UI polish pass (founder: "they should have a compare tool where they can compare various versions of products like
  beans to see the nutrient difference ... stuff like this too"; "do any updates you think would make the ui better ... you have free roam").**
  **Compare** (`/app/compare`, `lib/mm/compare.ts`, 5 unit tests, `e2e/compare.mjs` 3 steps incl. axe light/dark): two tabs, **Groceries** (per 100 g or ml as each
  label prints it) and **Restaurant dishes** (per serving as each restaurant publishes it), never mixed in one table; up to 6 of each. Add from a search on the
  page ("Type a product, e.g. baked beans": the barcode catalogue; "Type a dish or restaurant": the restaurant search) or with the new **Compare** button on a
  catalogue product's page, a shop product's page whose label we've read, and every dish page. Each nutrient (calories, protein, carbohydrate, of which sugars,
  fat, of which saturates, fibre, salt) is one block with a bar per item, numbered like the list above it; the only marks are **"Highest"** and **"Lowest"** (never
  good or bad, rule 3; a tie marks nothing); a figure a label doesn't print says "not on the label" (dishes: "not published"). Groceries add the shop's own **price
  per kg or litre** and **"Protein for £1"** (protein per 100 g x 10 / the shop's price per kg; only where the shop prints a per-kg/litre price matching the label's
  basis). Labels per 100 ml or for the cooked food get a "compare those with care" line. The list is a copy of the figures shown when each item was added, on this
  device only (`mm.v1.compare`; Clear data removes it; privacy page says so). Entry points: "Compare products" on Groceries' "Which shop?" screen, a "Compare dishes"
  card on Eat out. **UI polish:** (1) restaurant page: the meal picker no longer breaks "Breakfast" mid-word; a chain's halal quote now opens from "Halal (some): What
  {chain} says" instead of filling the header (the data's limits and the source line stay in view); (2) grocery rows (every shop's list, "Search every shop") show
  calories and protein as two pills instead of one long grey sentence (carbs and fat are on the product's page); (3) "Most protein per 100 kcal" lists products
  with under 1 g of protein per 100 g after the rest, so a 2 kcal kombucha no longer tops it (numbers unchanged; `MIN_DENSITY_PROTEIN`); (4) Settings › Your
  supermarkets is one column on phones (no more "Sainsb ury's"); (5) empty states have a real icon (basket, map pin, search) and body-size text. New copy (rule 8,
  logged here; translated into the 10 languages by AI): every compare string ("Compare", "Compare products", "Compare dishes", "In your comparison", "Side by side",
  "Highest", "Lowest", "Protein for £1", "Price per kg", the basis lines, the empty-state and footer sentences), "What {chain} says", the Clear data sentence (adds
  "what you picked to compare"); **approved by the founder the same evening ("Yes that's ok")**. Checked: 460 unit, tsc, lint, e2e compare 3, groceries-all 7, groceries 6, compare(shops) 8, photos 4, diet 5, recipes 13,
  smoke 23, extra 12, browse 9, calories 4, languages 5, offline 13, a11y 0 violations (incl. the comparison and the opened halal quote), no overflow at 200% text
  (incl. both compare tabs and KFC's page); screenshots in light and dark.

- 2026-10-11 (evening) — **228 chains, 35,978 items live (116 full nutrition, 112 calories only): four more restaurants** (founder: "Keep adding more
  restaurants"; added by a helper in its own worktree, merged here; details and every chain checked in docs/UK_DATA_STATUS.md "Added 11 October (evening)" and
  `data/candidates/triage6/evening.csv`). **Cosy Club** (215, calories and allergens, 38 venues, the Ten Kites menus its own venue records name; its calories sit behind
  a visible "Hide Calories" switch, used as for Loungers), **Pilpel** (18, full nutrition **per ingredient** as its own calculator prints them, 7 London sites; nothing
  added up, the note says so, and no ingredient is ranked as a meal), **Blue Diamond** (125, calories, about 45 garden centres; figures printed on each dish's picture,
  read by OCR and checked twice by eye, 48 OCR misreads corrected from the eye check) and **Squire's Garden Centres** (169, calories, 17 café bars; Autumn/Winter 2026
  menu PDFs, a dish listed only where 2+ café bars print the same figure; based on uncooked ingredients, as its menus say; afternoon tea left out because its figures
  are for parts of one set). Each passed check_chain with 0 errors and 0 high audit flags and had a second read by another method; logos from each chain's own site
  (square icons for Cosy Club and Squire's). No alcoholic drinks added. Checked and not added: Walkabout (its Ten Kites page and its own PDFs disagree), M&S Café,
  Smashburger, Crêpeaffaire, Van Hage, Stewarts, Frosts (blocked), Tank & Paddle (2 venues), Wingstop UK, Deep Blue, Bob & Berts (no calories without picking a store),
  Klondyke/Strikes, Cherry Lane, Pennells, Revolución de Cuba (no calories printed), Hillier, Poundbakery, Oakman Inns (no menus or nutrition). The reachable pool is
  close to exhausted. **For you to decide:** Waterfields (36 North West bakeries) prints nutrition for 22 products but 6 contradict themselves; about 16 consistent rows
  could go live as a thin full-nutrition chain. Checked after the merge: 460 unit, 138 Python.

- 2026-10-12 — **Founder: "keep adding more food chains please"; two answers.** (1) **A calories-only chain now needs 3 or more GB sites** (was 5 since
  2026-10-10), the same bar as full-nutrition chains; every data rule is unchanged (official source only, copied by script, never estimated, robots.txt and
  blocks honoured, sites that disagree published only where 2+ agree, no alcoholic drinks). (2) **Waterfields: publish the products whose own figures agree**
  (about 16 of its 22 nutrition tables); the 6 that contradict themselves are held back and listed in its check report. Round 7 runs three helpers in their own
  worktrees: (A) menus that show calories only after a store is picked (read 2+ stores, publish only what agrees) plus Waterfields; (B) new discovery from the
  Food Standards Agency's food hygiene open data (every food business by name, Open Government Licence: business names with 3+ outlets that no earlier list
  had); (C) chains earlier set aside only for having fewer than 5 sites. Results are logged below as they land.

- 2026-10-12 — **Round 7 B and C merged: 233 chains, 36,184 items live (118 full or mixed nutrition, 115 calories only).** Details and every chain checked in
  docs/UK_DATA_STATUS.md ("Added 12 October (round 7B, FSA discovery)" and "(round 7C, 3+ sites)") and `data/candidates/triage7/`. **C (chains set aside for size,
  now 3+ sites):** **Papa's Fish & Chips** (5 items, full nutrition from its own December 2018 Campden BRI lab reports, unchanged byte for byte and still linked from
  its nutrition page; 5 restaurants; the note gives the date; Mushy Peas stays held back), **Firmdale Hotels** (30, calories, 6 London hotel restaurants) and
  **Apex Hotels** (33, calories, its 3 English restaurants that print calories), both published only where 2+ restaurants print the same dish name and figure and
  no menu prints another. **B (new discovery from the Food Standards Agency's open data):** all 363 local-authority files read once (614,158 food businesses;
  11,831 names with 3+ GB outlets; 7,893 not known before; files and scripts in `data/candidates/fsa/` and `tools/discovery/fsa/`); almost all are small groups that
  publish no figures, but it found brands trading inside other shops: **YO! To Go** (49 products, full nutrition and allergens; YO! Sushi's own "Tesco kiosk menu",
  289 counters inside Tesco; kept separate from Yo! Sushi because the menu and outlets differ; 20 held back where its own kJ/kcal or salt can't hold) and **The Sushi
  Co** (89, calories, its own January 2026 counter menu, 38 outlets; its full-nutrition table exists only as two 2024 pictures that OCR couldn't read reliably).
  Each passed check_chain with 0 errors and 0 high audit flags and had a second read by another method; logos from each chain's own site. Checked and not added
  (reasons in the status doc): 39 FSA finds publish no figures (e.g. Sushi Gourmet, Mai Sushi, B Kitchen, Bird & Blend, Mr Pretzels, Kebabish Original), Happy Tokyo
  (per 100 g only), Archie's and Geek Retreat (blocked), Gravity MAX (robots.txt answers 403: open decision (d)), Thistle, Royal Museums Greenwich, RHS Gardens and
  Imperial War Museums (no dish printed at 2+ sites), Rita's, Core, Carl's Jr UK, Tank & Paddle, Captain D's (still under 3 sites). Helper A (store-picked menus and
  Waterfields) is still running. Checked after the merges: 138 Python, 460 unit, menu build 233 chains 0 errors.

- 2026-10-12 — **Round 7 A merged: 238 chains, 36,631 items live (120 full or mixed nutrition, 118 calories only).** Details in docs/UK_DATA_STATUS.md
  ("Added 12 October (round 7A)") and `data/candidates/triage7/a.csv`. **Waterfields** (15 products, full nutrition, 36 North West shops, from each product's own
  page; 7 held back: the 6 that contradict themselves and the Sausage Roll, whose 1,111 kJ can't match its 289 kcal), **Deep Blue** (61, calories, 7 fish and chip
  shops, its own ordering site read at all 6 that take orders; published only where 2+ shops print the same figure; 12 products differ North vs South and are left
  out), **Farmhouse Inns** (119, calories, all 62 pubs' own menu data on Greene King's platform; carveries and buffet breakfasts left out because their own text says
  calories are at the counter; its full-macro PDF is the Autumn/Winter 2025 menu, a year old, so not used), **Grounded Kitchen** (81, full nutrition, 9 restaurants,
  each product page's own nutrition per serving; no logo: its logo host answers 403 to robots.txt) and **Belhaven Pubs** (171, calories, 62 Scottish Greene King pubs
  that print menus; 8 dishes printed with two figures left out). All five link to the chain's allergen information (none prints a complete allergen list we can
  copy); no alcoholic drinks; second reads recorded. New shared reader `tools/uk_extract/vita_mojo.py` (the ordering platform behind Deep Blue and Grounded Kitchen).
  Checked and not added: Bob & Berts (no calories on its ordering site), Wingstop UK (its ordering script answers 403), Pizza GoGo and Tops Pizza (their menus load
  through paths robots.txt disallows), Chocoberry (its menu host disallows everything), Banyan, Pesto (Cloudflare challenge), and still blocked: Grosvenor Casinos,
  Dobbies, Parkdean, Yates, Old English Inns, Topgolf. **Round 7 total: 10 chains** (228 → 238). Checked after the merges: 138 Python, 460 unit, menu build 238
  chains 0 errors, production build, e2e smoke 23, browse 9, calories 4, extra 12, a11y 0 violations; Waterfields' and YO! To Go's pages looked at.

- 2026-10-12 — **robots.txt answering 403 = "no rules" (founder: "Yes, follow the standard"), and 7 more logos (founder: "cant you do all those logos for me pls").**
  RFC 9309 says a 4xx answer for robots.txt (403 included) means the site has no rules for crawlers; we used to stop on a 403 instead. Now a 403 for
  robots.txt is read as no rules (`tools/uk_extract/images_common.py`, `robots_audit.py`; tests in `tools/tests/test_robots.py`). A 401 or 429, a 5xx, a bot check or challenge
  page, and any page or file that itself answers 401/403/429 still stop the run. Nothing else is worked round. **Logos added**, each the chain's own file, saved
  byte for byte, with a record next to it: Atis, Honi Poke, Kokoro and Grounded Kitchen (their logo hosts answered 403 to robots.txt), Buy & Bite (its robots.txt allows the page; an earlier "disallowed" was a 429 rate limit misread), Domino's (its investor
  site; dominos.co.uk geo-blocks us) and Costa (its owner Coca-Cola's brand page, as Vue's came from its owner's; costa.co.uk times out). New square icons: Buy & Bite,
  Grounded Kitchen, Honi Poke (137 in all). **Left out after looking at the tiles:** Wild Bean Café's file from bp's brand page (the mark is a third of the picture, the rest
  white, so on our tile it is a dot; a logo can't be cropped, so the cuisine icon stays), and the square icons offered for Costa (a Coca-Cola mark) and Kokoro (the symbol
  without the name). **232 of 238 chains now show a logo** (5 of them only their square icon). Still none: Bettys, Fuller's, Kick Ass Burrito, McDonald's, Tesco Café, Wild Bean
  Café (`data/chrome-inbox/QUEUE-LOGOS.md`). Domino's wordmark is wide, so it is small on its square tile (no square icon is served). Decision (d) also unblocks the food-photo
  scripts already written for Sbarro, Amigos, Kokoro, Tortilla, Atis, The Alchemist, Honi Poke, The Breakfast Club and Buy & Bite. Not run yet.

- 2026-10-12 — **Free launch on the App Store (founder: "we just make everything free right now, we dont add the ai features and we ship then
  after its on the app store then we add those extra improvements"; answers: "Web app inside the app", name **Menu Math** ("MenuMacros" is taken by
  "MenuMacros: Eat Out Healthily", June 2026), logos "Keep, with safeguards", then "do those 5 things").** (1) **Pro off:** `PRO_ENABLED` in
  `web/lib/mm/config.ts` (off unless `NEXT_PUBLIC_PRO=1`, which the browser tests use) replaces `ALL_FREE_FOR_TESTING`: everyone has every feature
  and no screen says Pro, subscription, trial or paywall; the Pro code stays for later. (2) **AI recipe maker off:** `AI_RECIPES_ENABLED = false`, a
  constant so no key can turn it on: no card, `/app/recipes/make` forwards to the recipes, `/api/v1/recipe` answers 404; its code stays. (3) **Legal
  pages** describe the free app: privacy (no purchases, no AI, no Apple Health, no usage statistics, the iPhone app keeps everything inside it;
  last updated 12 October 2026), terms ("The app is free: there is nothing to buy in it"; names **and logos** of restaurants **and supermarkets**
  only identify them, removed on request), support ("Is anything paid? No"), landing page FAQ ("Yes. Every feature is free"). (4) **Logo safeguards:**
  `web/public/logos/hidden.json` takes a logo down on the website and in the app without an app update; the app's welcome wall shows names only;
  store screenshots carry no logos or photos; App Review note in docs/STORE.md; CLAUDE.md rule 2 updated. (5) **The iPhone app** (docs/APP_BUILD.md):
  `npm run build:app` (static export, `pageExtensions: ["tsx"]` so the API and robots/sitemap/manifest are left out) packed by
  `scripts/build_app_web.sh` into `MenuMacros/Resources/WebApp.bundle` (git-ignored, 155 MB); `MenuMacros/Features/WebApp/` serves it on
  `app://menumath/…` (works with no signal), `NativeBridge` + `Services/` give the iPhone's own barcode scanner (VisionKit), location (one prompt)
  and share sheet (`web/lib/mm/native.ts`); online, newer menus and the taken-down list come from the live site and reports/requests/messages go
  to its API (CORS only for `app://menumath`, `web/lib/cors.ts`); camera, location and export-compliance keys and `PrivacyInfo.xcprivacy` added.
  **The Swift is written but not compiled** (no Xcode here): the Mac session builds and checks it (docs/APP_BUILD.md). `web/app-content.json`
  holds the open decision (menu photos, which supermarkets go in the app; everything until decided). (6) **docs/STORE.md** rewritten for the free
  launch (draft copy for approval, rule 8: "Menu Math: Eat Out & Macros", "Calories for UK menus & shops", keywords without brand names, App Privacy
  and age-rating answers, review notes); `web/e2e/store-shots.mjs` takes six 1320 x 2868 screenshots with every logo and photo left out.
  New copy (rule 8, logged here; translated into the 10 languages by Claude, not yet checked by native speakers): the app-only scanner and location
  sentences ("{app} isn't allowed to use the camera…", "This iPhone can't scan barcodes…", "…or scan again.", "Scan again", "{app} isn't allowed
  to use your location…"), "Names of restaurants and shops in the app", the clear-data sentence ending "from this phone"; site pages' new sentences
  above (English only, like the rest of the site). Checked: 469 unit, 143 Python, e2e smoke 23, extra 12, browse 9, calories 4, recipes 12 (maker
  absent), diet 5, compare 3, groceries 6/7/8/4, languages 5, offline 13, a11y 0, large text, **prodmode 9** (as shipped: no Pro/AI wording anywhere,
  logging and builder open), **app-build 7** (the packed app with no signal, names-only wall, taken-down logo, fake bridge for scan/locate/share).

- 2026-10-12 — **The app is now called Numbite** (founder: "are you sure this is the best name for my app i feel there must be one better", "think
  of more", then "I like numbite actually" and "Yes, rename to Numbite"). Why: "Menu Math" used the US spelling ("maths" in the UK), sounded
  restaurant-only and like homework. About 80 names were checked against the UK App Store and domains; most were taken (MenuMacros twice,
  MacroMenu, MenuWise, MenuLens, Platewise, MealWise, MunchMap, Nosh, Plateful, Morsel, Forkcast's .co.uk/.app sites, Tuck In, Know Your Plate...).
  **Numbite** (numbers + bite): no app of that name on the UK or US App Store, nothing on the web, numbite.com / .co.uk / .app free on 12 October
  2026, a coined word. Changed: `web/site.config.ts` (`name`, `appStoreTitle` "Numbite: Calories & Protein"), `AppConfig.appName`, the Xcode
  display name, the social card (re-rendered by `web/e2e/brand.mjs`), comments and docs/STORE.md (draft: subtitle "UK menus, shops & recipes",
  keywords without repeats or brand names), docs/APP_BUILD.md, README. The name reaches every screen and translation through `site.name` / `{app}`,
  so no translation changed. Unchanged on purpose: the bundle ID `com.amanmarwaha.MenuMacros`, the repo and folder names, the `app://menumath`
  scheme (internal; the API's CORS allows exactly it), the `mm.v1.*` storage keys (saved data survives), the icon (no words) and Pip. Offline cache
  bumped to `mm-v4` so installed copies pick up the new name.

- 2026-10-12 — **New app icon: a white plate with a fork on it and a bite out of the rim** (founder: "it needs to be related to numbite ... number and bite",
  "you need to think food when you see it", "do you think they look too childish"; picked "L · plate and fork" from the fourth round of drawings).
  Rounds shown and dropped: a bitten 0 / N / # / bar chart (numbers, but no food), a cartoon doughnut, cookie, burger and pizza (food, but childish and
  an odd signal for a calorie app), a donut-chart doughnut. Flat white on the same green gradient, no outlines or extra colours; our own mark, no
  restaurant's product, and no bitten apple (too close to Apple's logo). `web/design/icon.svg` → `node web/e2e/brand.mjs` (PWA icons, favicon,
  apple-icon, social card) and the iPhone's `AppIcon.appiconset/icon-1024.png` (1024 px, square, no transparency) drawn from the same file.
  Offline cache bumped to `mm-v5` so installed copies pick up the icon.

- 2026-10-12 — **numbite.com** (founder: "should i buy on godaddy or you really think vercel for sure", then "ok ive bought numbite"). Bought by the
  founder on Vercel in their own name (registered 12:41 UTC, renews 12 October 2027, Vercel's name servers); this session's Vercel connector couldn't
  buy it (its token has no access to the account that holds the project). The website's own address (`web/site.config.ts` `url`, used for link
  previews, the sitemap and robots) is now https://numbite.com unless `NEXT_PUBLIC_SITE_URL` says otherwise; the iPhone app's live site
  (`NEXT_PUBLIC_REMOTE_BASE`, `scripts/build_app_web.sh`) and `AppConfig.swift`'s website addresses are numbite.com; `menumacros.vercel.app` stays as an
  alias, so installed copies keep working. **Copy (rule 8):** the order share card printed the spec's placeholder "menumacros.app" (SPEC §11), a
  domain we don't own, whenever the site address was unset (it was, on the live site); it now prints "numbite.com". Store and build docs use
  numbite.com/privacy and /support. Still to do: Vercel Pro, a support@numbite.com forwarding address, and (optional) numbite.co.uk.
  **Live the same day:** the founder upgraded the project to **Vercel Pro** (ends the Hobby 100-deployments-a-day cap that had blocked every build since
  the rename, and Hobby's non-commercial rule); the Vercel connector attached `numbite.com` to project `menumacros` (verified at once) and `www.numbite.com`
  as a 308 redirect to it, then deployed `main` (d4fb812) to Production. Checked on https://numbite.com: /app 200, title "Numbite", offline cache `mm-v5`,
  social card from numbite.com, sitemap on numbite.com, /privacy and /support 200, API health 200, the iPhone app's preflight from `app://menumath` answered
  204 with its origin allowed, `/logos/hidden.json` open to the app; `menumacros.vercel.app` serves the same build.

- 2026-10-12 — **Sign-in and sync across devices: decided, planned, not built** (founder: "we need to do the apple google and also set up resend i
  need to set up the log in methods", then "Sync across devices"). Plan in `docs/ACCOUNTS_SYNC.md`:
  - sign-in is optional (Apple, Google, email code via Resend), through our own API on Supabase Auth, so no Supabase key ever goes in the app;
  - one `user_data` table, written only by the API;
  - Settings › Account with "Delete my account".
  CLAUDE.md rule 4 ("no accounts, no personal data off the device"), the privacy page and the App Store privacy answers are rewritten when it ships.
  Part A (Apple, Google, Resend, Supabase dashboards) is the founder's, with a paste-ready prompt for Claude in Chrome on the Mac. The new migration is
  applied only with the founder's go-ahead.

- 2026-10-13 — **Sign-in and sync: Part A done, Part B built** (founder: "just do everything for me i give you permission"). **Part A** (done with the
  founder in their Chrome): Apple (App ID `com.amanmarwaha.MenuMacros` with Sign in with Apple, Services ID `com.amanmarwaha.numbite.web`, Key
  `X374U6N8FP`; the generated secret expires **11 April 2027**, with a reminder in the founder's Outlook calendar for 29 March 2027 and
  `tools/auth/apple_client_secret.py` to make the next one without ever printing it), Google (project "Numbite", consent screen published
  "In production" with non-sensitive scopes, Web and iOS clients), Resend (`numbite.com` verified in Ireland; DKIM, `rsend`/`send` CNAMEs and
  `_dmarc` added in Vercel DNS; a sending-only key restricted to numbite.com), Supabase (Site URL, redirect URLs `https://numbite.com/auth/callback`
  and `numbite://auth`, Apple, Google and Email enabled, custom SMTP, Magic Link template "Your Numbite sign-in code is {{ .Token }}…" with the
  subject "Your Numbite sign-in code"; the **Confirm sign up** template got the same text, because Supabase sends that one to a brand-new address's first code request and its default has only a link). **Part B** (branch `claude/accounts-sync`, not pushed): everything in docs/ACCOUNTS_SYNC.md "Status";
  differences from the plan and the founder's steps are listed there. **Live since 14 October 2026:** the founder ran the migration in Supabase's SQL Editor and pushed `main` (fa68b8a); Vercel deployed it and the new routes answer correctly on numbite.com (docs/ACCOUNTS_SYNC.md "Status"). What is still untried is a real sign-in (email code, Google, Apple) and two-device sync.
  **Copy added (rule 8, logged here; translated into the 10 languages by AI, not yet checked by native speakers):** the sign-in sheet ("Sign in",
  "Continue with Apple/Google/email", "Your email address", "Send me a code", "6-digit code", the code and error lines, "Use a different email",
  "Send a new code", the privacy line), Settings › Account ("Account", "Signed in as", "Sync now", "Sign out", "Delete my account" and its
  confirmation, "Last synced {time}", the waiting/offline/error lines, "Keep my account"), the welcome screen link "Already have an account? Sign
  in", the Clear-data sentence "This also signs you out of your account on this device. What is synced stays in your account.", and the Settings
  data line for signed-in people ("Because you're signed in, your settings, saved meals, shopping list, favourites and today's log are also saved in
  your account..."). **Legal and store text changed (English only):** privacy page (new section "Signing in and syncing (optional)", cookies,
  processors incl. Resend, retention; last updated 13 October 2026), terms ("Accounts (optional)"), support page and landing line ("No account needed"),
  docs/STORE.md (description, App Privacy rows incl. Health, review notes), `PrivacyInfo.xcprivacy` (user ID and Health added, other user content now
  linked) and CLAUDE.md rule 4 (accounts are optional). **Found on the way (not mine, not changed):** the browser tests `languages.mjs` (Arabic: the
  recipe page's "Back" link) and `a11y.mjs` (the welcome screen's "Change language" button) report `label-content-name-mismatch` on existing buttons whose
  spoken label doesn't contain their visible word; the first sync-engine test also caught and fixed untouched defaults being sent to the server.

- 2026-10-14 — **App Review readiness check (founder: "go through the app like an app store developer").** Two independent reviewers (one read the code,
  settings and docs against the guidelines of 8 June 2026; one tapped through every screen of the packed app in light, dark, extra-large text, three
  languages and offline). **Fixed:** 71 placeholder `support@example.com` addresses inside the packed app (`build_app_web.sh` now needs
  `NEXT_PUBLIC_SUPPORT_EMAIL` and refuses placeholders; built with the address the live site shows, `aman66@hotmail.co.uk`, **founder to confirm**); the
  website landing page ("an iPhone app is planned", a waitlist) inside the app (now only forwards to /app) and a plain Back bar on the privacy, terms and
  support pages inside the app; the camera purpose string (also covers the report photo); a caution under calorie targets below 1,200 and a GLP-1 line
  ("follow the advice of your doctor or pharmacist") in onboarding and Settings; "How we get our numbers" no longer claims every number is a restaurant's
  (supermarket numbers and recipes are explained); store text (age-rating answers: Health or Wellness Frequent, Medical Infrequent, Alcohol Infrequent;
  "glp1" keyword dropped; "every dish" → "menu items"; new App Review notes); privacy page says the database is in the United States; Sign in with Apple
  token revoke on account deletion (`web/lib/auth/apple.ts`, needs `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` in Vercel: docs/ACCOUNTS_SYNC.md);
  `appLogos` switch next to `menuPhotos` (app-content.json, default on). **Open decision (founder):** the chains' logos, item photos and the supermarkets'
  scraped lists are third-party material used without permission (guideline 5.2.1; docs/IMAGE_TERMS.md): the reviewer's advice is to ship 1.0 with
  `menuPhotos: false`, `appLogos: false` and only the shops whose terms allow it (about 70 MB instead of 161 MB), then add them back with permission.
  **Not done:** real alcohol products remain in Iceland's grocery list (rule of 11 October) and about 450 alcoholic menu items are in 23 chains (declare in the
  age rating); tap targets under 44 pt on small links (welcome Terms/Privacy, product-page shop links, map zoom buttons); minor polish (404 page dead end,
  Settings footer "web 1.0", Co-op and Ocado listed as shops, map pins piling up in central London, an unstyled file input in the report sheet); the privacy
  policy names no company and says nothing of the UK GDPR transfer basis for the US database (the founder to supply the company details); Apple's own
  Sign in with Apple artwork instead of our drawn pill; the session lives in local storage, not the Keychain.

- 2026-10-14 — **Founder's answers after the App Review check:** "keep" the chains' logos, item photos and all nine supermarkets in the app (the accepted
  risk of rule 2 stands; `web/app-content.json` stays `menuPhotos: true`, `appLogos: true`, all shops); "do number three … four … five … six for me"
  (the Apple settings in Vercel, a real sign-in test, the support contact and the App Store steps: what Claude may and may not do is in docs/ACCOUNTS_SYNC.md and
  the chat). The personal address `aman66@hotmail.co.uk` stays the public support contact for now (founder, 14 October). **So that the App Review notes are
  true:** the taken-down list (`web/public/logos/hidden.json`) now also hides a chain's item photos and a shop's product photos (`isTakenDown`), with no app
  update; the packed files stay in the app until the next release.

- 2026-10-14 — **New Home layout (founder's reference picture: "I want this exact app layout … for the Home Screen").** Top to bottom: "Home" with a
  round calendar button (opens Today's meals); this week Monday to Sunday as day circles (today in the brand gradient, earlier days dark when something
  was logged, outlined when not, later days grey); a Calories card with a three-quarter dial (`_components/Gauge.tsx`) and "eaten / target kcal" beside
  a card with Protein (eaten / target with a bar), Carbs and Fat; the "Shopping list" and "My meals" cards, each with a dark "Open" button; then
  **Today's meals**: Breakfast, Lunch and Dinner rows with a flame chip, "eaten / meal figure kcal", round pictures of what was eaten (the chain's own
  photo of the dish where we have one, otherwise a fork; two at most, then "+n") and a + that opens Eat out. Kept to the spec as it stands, nothing
  invented: a logged item goes under the meal its time falls in (SPEC §6.3 `mealSlotFor`: before 10:30, until 16:00, after) and each meal's figure is
  its share of the day (`mealBudget`: 25/35/40%, or the GLP-1 meal size). **The app keeps no carb or fat target**, so those two show grams eaten without
  a bar (the reference shows targets for all three: adding optional carb and fat targets to Settings needs the founder's yes). Snacks have no row (the
  spec has three meals). Our green replaces the reference's orange; the tab bar is unchanged. At large text the paired cards stack and the meal
  pictures step aside. While Pro is on (later), a free user sees the Pro nudge and the + opens the paywall, as before. Removed from Home: "Left today:",
  "Eaten so far", the free targets card. New copy (rule 8, logged here; translated into the 10 languages by Claude, not yet checked by native speakers):
  "Open", "This week", "Add food", "{day} (today)", "{day}: food logged", "{day}: nothing logged". Checked: 575 unit tests, tsc, lint, e2e smoke 23,
  extra 12, a11y 0 violations, large text (no overflow at 100/150/200%), prodmode 9; screenshots in light, dark and extra-large text.
  The App Store screenshots and the uploaded build still show the old Home: re-run `web/e2e/store-shots.mjs` and make a new build.

- 2026-10-14 — **New Recipes page (founder's two reference pictures: "make the recipes page look exactly more like image 1 ... add whatever
  would make it better"; the cards "how image 2 does the name ... with the protein").** Top: Pip in a round avatar with "Recipes", and a heart
  button that opens My meals with the number saved; "What's cooking today?"; the shop sentence; the search; eight big tiles (Breakfast, Lunch,
  Dinner, Snacks, **Quick** = ready in 20 minutes or less as the recipe says, No meat or fish, **Vegan** = the app's own vegan rules,
  `isVegan`/`isQuick` in `lib/mm/recipes.ts`, tested) and **More**, which opens sorting, the meal size and the diet. **Picked for you**: the eight
  recipes closest to the person's meal size for the meal of the day (SPEC §6.3 slot by the clock), side by side; hidden while searching or filtering.
  A card **"Cook with what's on your list"** shows when the shopping list has something a recipe uses. **All recipes** keeps the "fitted to"
  sentence and the diet in view with an Adjust button. **Cards** (`RecipeTile`, also on My meals): a picture area with a heart to save it to My
  meals, then the name, then calories and protein as two chips side by side, then the price of a serving and the minutes. Until the AI pictures
  exist, the picture area is a plate with a simple drawing of the kind of dish, picked from words in the recipe's English name (noodles, pasta,
  wrap, eggs, salad, porridge, pot, bake, fish, rice bowl; the meal's icon otherwise), on one of six colours chosen by the recipe's id: our own
  generic drawings (`icons.tsx`), never a picture of food. The bottom tab bar is unchanged. "Trending" from the reference was not used: the app keeps
  no usage figures, so nothing can honestly be called trending. New copy (rule 8, logged here; translated into the 10 languages by Claude, not yet
  checked by native speakers): "What's cooking today?", "Picked for you", "Quick", "Cook with what's on your list"; no longer used: "Recipes {em}",
  "from your shop", "Any meal". Checked: 576 unit tests, tsc, lint, e2e recipes 12 (new: picks, tiles incl. Quick and Vegan, Clear, sort under More,
  the heart saves and the top heart counts), smoke 23, extra 12, languages 5, a11y 0 violations, large text (no overflow), prodmode 9; screenshots
  in light, dark and extra-large text.

- 2026-10-14 — **Onboarding restyled (founder's reference picture: "make the screens look amazing like this").** Same screens, steps, wording
  and buttons as before; new look on every screen:
  - **Top:** the app's icon and name, Back on the left, **Skip** on the right. Skip is new on Pip's three intro screens, where it goes straight to the
    first question; on the questions it moved up from under Continue. Under that, the progress as **segments** (4 for the welcome part, 6 for the
    questions, with "Step n of 6").
  - **Headlines:** very large, with a small green picture pill in them.
  - **Bottom button:** the big pill with a green » knob, the words and a tick. A tap does it; there's nothing to drag, so it's easy for everyone.
  - **Welcome:** "Eat out, shop and cook. [Pip · Welcome to Numbite] Know the numbers first." with the moving wall of restaurants and shops as the
    picture underneath, two floating labels ("{n} UK restaurants", "{n} supermarkets"), and a white Get started pill.
  - **Pip's intro screens:**
    - 1: Pip in a big green card with Calories, Protein and Price floating round it.
    - 2: a preview of Home (this week; a calories dial; protein, carbs and fat), marked **"Example"**. Its figures are made up for the picture,
      43% of the person's calorie target. It is decorative and hidden from screen readers, never a food's data.
    - 3: Pip cheering with the burst.
  - **Questions:** the selected goal or text size is a dark card with a green tick. The targets step has our own plate and fork (the app icon's
    mark, never a photo of food) beside the headline, coloured bars showing the calories and protein as they change, and two cards with − and +
    (50 kcal, 5 g; fields still typeable).
  - **"Your plan":** coloured bars and the plate.

  No food photographs (CLAUDE.md rule 2). The iPhone app's wall still shows names only. New copy (rule 8, logged here; translated into the 10
  languages by Claude, not yet checked by native speakers): "Welcome to {app}", "Example", "Price", "Decrease", "Increase". No longer used:
  "{kcal} kcal · {protein} protein a day".

  Checked:
  - 576 unit tests, tsc, lint;
  - e2e smoke 23, extra 12, languages 5, account 8, a11y 0 violations, large text (no overflow);
  - prodmode 9, app-build 8;
  - every screen in light and dark, and extra-large text on the busiest screens.

- 2026-10-14 — **New recipe page (founder's reference picture of a "Chicken Curry" page: "make the recipe pages look amazing like this").**
  Top to bottom:
  - **Picture:** runs to the edges and under the status bar, with white **Back** and **Save** (a heart with its word; it saves to My meals as
    before) on it. It is the recipe's AI illustration once there is one (captioned as before), until then the card's plate and dish drawing, larger.
  - **Sheet:** white, rounded, over the foot of the picture; "Recipe · {shop}", the name and the blurb in the middle.
  - **Serves:** "− Serves 4 +" (1 to 12 people) next to the minutes. More or fewer people changes every amount, the packs and the price to buy it all;
    a serving's numbers stay the same (`scaleServings` in `lib/mm/recipes.ts`: whole eggs, peppers and cloves stay whole; tested).
  - **Per serving:** calories, protein, carbs and fat as four soft chips with the bar under them. The full label (saturates, sugars, fibre, salt, kJ) opens
    under **More detail**, as on a dish's page.
  - **Two tabs** as in the reference, **Ingredients** (the prices, then What to buy: each row has the photo, the amount on the right, the product, its
    price and Swap beside it, and "I have this" for store-cupboard items) and **Method** (numbered steps).
  - **"Add all to my shopping list"** stays at the foot of the screen above the tab bar, the page fading out behind it.

  The reference's "Rating" chip was not used: we hold no ratings. New copy (rule 8, logged here; translated into the 10 languages by Claude, not yet
  checked by native speakers): "Method", "Fewer servings", "More servings". Checked: 577 unit tests, tsc, lint; e2e recipes 13 (new: Back and Save on
  the picture, serving 1 to 4 people, the tabs incl. arrow keys, the add bar kept in view; full label under More detail), a11y 0 violations, large text
  (no overflow at 200%), languages 5 (Arabic axe), smoke 23, extra 12, offline 13, browse 9, calories 4, diet 5, groceries 6, groceries-all 7,
  compare 3, prodmode 9, app-build 8; screenshots in light, dark and extra-large text.

- 2026-10-15 — **Light grey app, the reference picture's text, and no dark mode** (founder, on the Home reference picture: "The background of the
  app should be light grey like the colour here", "Also match the text from the image above too", "The app doesn't need a dark mode anymore").
  - **Grey:** every /app screen sits on a flat light grey (#f2f2f2) with the white cards on it, and no green glow behind the page
    (`:root:has(.app-surface)` in `globals.css`; AppShell carries `.app-surface`). The website keeps its white page and glow. In the app the
    accent is a shade darker (#046c4f, so green text keeps WCAG AA on the grey: 5.8:1, and 5.2:1 on the green tint) and chip/track grey
    (`--soft-strong`) a shade darker so they still show. Browser bar and installed-app colour are the same grey.
  - **Text:** DM Sans replaces Plus Jakarta Sans everywhere (with its latin-ext face, so Polish and Romanian letters match), DM Mono for figures in
    data rows: Home's "PROTEIN 73g / 150g" rows and the onboarding's Home preview. Both SIL OFL, bundled in `web/app/fonts/` with their licences;
    nothing is fetched from Google by visitors. The greys are neutral (`--muted` #5f6361: 6.1:1 on white, 5.5:1 on the grey). In the app the
    small italic accents are gone: a kicker is now a small uppercase label (e.g. "RECIPE · SAINSBURY'S", like the picture's "BODYWEIGHT") and an
    accent word in a heading keeps its colour in the heading's own font; the heaviest headings are bold (700) like the picture's. The website keeps
    its Playfair accents. No wording changed.
  - **No dark mode:** the dark colours, the map's dark style and the Apple button's dark variant are gone; `color-scheme: light`. The iPhone app
    gets `UIUserInterfaceStyle = Light` (project build settings, Debug and Release), so a phone in dark mode still shows dark status-bar text on
    our light page: **the Mac session builds it**. CLAUDE.md's conventions and the verify skill now say light only.
  - Checked: 577 unit tests, tsc, lint; e2e smoke 23 (its dark-mode step now checks a phone in dark mode still gets the grey page), a11y 0
    violations, large text (no overflow at 200%), recipes 13, languages 5, extra 12, offline 13, groceries-all 7, compare 3, browse 9, calories 4,
    diet 5, groceries 6, groceries-compare 8, groceries-photos 4, account 8, share, map 6 of 7 (the known headless geolocation limit), prodmode 9,
    app-build 8; screenshots of every main screen, the welcome screen and the website, normal and extra-large text.
  - The App Store screenshots and the uploaded iPhone build still show the old look: re-run `web/e2e/store-shots.mjs` and make a new build.

- 2026-10-15 (night) — **A cleaner look from the founder's seven reference pictures** ("make the app look the cleanest you can. These are all images
  I love": a fitness Home, a recipe page, two recipe grids, a "What's cooking today?" screen and an onboarding). Looks only: no wording, data,
  ranking or behaviour changed, so no new translations. All of it is in `globals.css`'s `.app-surface` scope (the website is unchanged):
  - **Page and cards:** the pictures' cool light grey (#f4f5f6, was #f2f2f2); white cards with no outline, no blur and a soft neutral shadow (the
    green-tinted shadows and the hero card's green tint and corner light are gone). Anything that sits on a white card (a figure tile, a nested
    list, a small round icon) is a light grey fill instead of an outlined box. The card styles moved into Tailwind's components layer, so a
    selected or hover colour set on the same element now always wins.
  - **Flat colours, no gradients or glows:** where the brand gradient was (main buttons, selected marks, today's circle, round icons, Pip's
    avatar, the Recipes "More" tile) the app uses one flat pastel lime (#d6efa0, dark text on it: 11.9:1); accent words in headings are the flat
    accent green; the calories dial, rings and progress bars are one deeper lime (`--bar` #8cc63f; their figures are always written beside them).
  - **Tab bar:** a dark floating bar (#1d2320) like the pictures, the open tab's icon in a lime circle and its word in lime; the words stay under
    the icons (inactive 9.5:1, active 12.7:1).
  - **Chips** are outlined, with the selected one filled dark, as in the pictures; **calories and protein badges** on recipe cards and grocery rows
    are grey with a bold number and a grey unit (protein was a green pill); section headings lost their green marker bar; search boxes show one
    focus ring (not a ring plus a green border).
  - **Recipe cards** without their picture yet show the plate on six soft pastel colours (cream, blush, pale lime, mint, sky, peach) instead of the
    bright ones.
  - **Headings in one plain ink**, as in every picture: an accent word ("Eat **out**", "Restaurants **near** you") no longer turns green; big figures
    keep the green, like the pictures' "0 / 2,800 kcal". Eat out's three cards end in the same round arrow (it steps aside at the
    larger text sizes so the words have room, like Home's meal pictures); Today's meals shows no stray "·" when an entry has no restaurant name.
  - **Large text:** at Extra large, "Groceries" broke as "Groce / ries" beside the My list button; the button now moves under the title instead. A
    shop's filter chips wrap onto a second line instead of running off the side.
  - **Found on the way:** `npm run build:app` (the iPhone copy) also writes its working files into `.next`, so running it while a test server serves
    `.next` breaks that server (every later browser test times out). `web/e2e/README.md` now documents `app-build.mjs` and says to run it last.
  - Contrast re-checked on the new surfaces: accent 5.9:1 on the grey, 5.8:1 on the grey fill, 5.3:1 on the green tint; grey text 5.6:1 on the grey,
    5.5:1 on the fill.
  - Checked: 577 unit tests (one failed once on the first, cold run after a container restart and passed on four reruns), tsc, lint; e2e
    smoke 23 (a phone in dark mode still gets the grey page, now #f4f5f6), a11y 0 violations, large text (no overflow at 200%), recipes 13,
    languages 5, extra 12, browse 9, calories 4, diet 5, groceries 6, groceries-all 7, groceries-compare 8, groceries-photos 4, compare 3,
    account 8, share, map 6 of 7 (the known headless geolocation limit).
  - The App Store screenshots and the uploaded iPhone build still show the old look: re-run `web/e2e/store-shots.mjs` and make a new build.

- 2026-10-15 (morning) — **The reference pictures' font, and no green gradient anywhere** (founder: "You need to change the font of the writing to
  match the font of the other ones I sent", "Could you please get rid of the slight green gradient on each page").
  - **Font: Urbanist** (SIL OFL, latin and latin-ext faces bundled in `web/app/fonts/` with its licence; DM Sans removed). Rendered side by side
    with the "What's cooking today?" picture, its letters match (single-storey "a", round "g", straight "y" and "k"); the recipe-list pictures use
    the iPhone's own font, a different face. Weights follow the picture: headings semi-bold (`font-extrabold` 650, `font-bold` 600,
    `font-semibold` 550 in the app) and running text at 500, a little heavier than the picture's 400, so it stays easy to read on the grey. DM Mono
    stays for the figures in data rows (the Home picture). The website uses Urbanist too.
  - **No gradients:** the website's green glow behind the page and its gradient buttons and hero cards are gone, so the whole product is flat
    (the app's grey page, the website's white page). Also gone: a blurred lime glow in the corner of every restaurant tile, the green tint on the
    tile of a restaurant or shop with no logo file, the lime gradients, glows and green-tinted shadows of the welcome screens, and the soft lights
    in the recipe pictures (six flat pastel colours now). Shadows are neutral grey. The accent green is the app's #046c4f on the website too
    (6.4:1 on white). Pip keeps the shading in his own drawing. No wording changed.

- 2026-10-15 (midday) — **Home like the founder's picture, with carb and fat targets** (founder, on the Home reference picture: "Make the home page
  look absolutely identical to this", then on its calories card: "exactly like image 2"; answers: leave the bodyweight card out, work out carb and fat
  targets, keep our lime, keep the dark bottom bar).
  - **Layout:** a smaller bold "Home" with a grey round calendar button; every day gone by a dark circle (whether food was logged is still said to
    screen readers), today lime, days ahead grey; the calories card measured from the picture (a dial about 55% of the card's width with a thick track,
    280° of arc, a small grey centre with a white ring between, a heavy "43%", a small bold label, regular-weight "1,030 / 2,800" and "kcal"); the macro
    card as three rows measured from the founder's picture of it ("exactly like the design in image 2"): "PROTEIN 73g / 180g" on one line, label in
    small capitals and figures in DM Mono, both the same grey, a thin bar well below each, the rows centred in the card. Kept on purpose: Shopping list / My meals
    with "Open" (for the picture's Workouts / Meals), and Today's meals below the fold. The picture's bodyweight card is left out (the app doesn't track weight).
  - **Carb and fat targets (rule 8: founder's decision):** worked out from the calorie and protein targets, about 30% of calories from fat (9 kcal/g) and
    the rest from carbs (4 kcal/g) after protein (20% of calories when no protein target is set), rounded to 5 g (`lib/mm/targets.ts` suggestCarbFat /
    macroTargets, tested). Settings › Daily targets gains "Carbs (g)" and "Fat (g)": empty follows the suggestion (shown greyed), a typed number is kept
    (`dailyCarbs` / `dailyFat` in settings, synced like the other targets). They are targets the person can change, never figures about a food.
  - New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator): "Carbs (g)", "Fat (g)", the note "Carbs
    and fat are worked out from your calories and protein: about 30% of calories from fat and the rest from carbs. Type your own to change them." and
    "Carbs and fat should be above 0 and at most 2,000 g."
  - Also fixed: two tab counts at 70% opacity (My meals, Compare) were below AA once the lighter weights stopped counting as bold text.

- 2026-10-15 (midday) — **Recipes use only everyday ingredients** (founder: "the customer may get annoyed if they go to like a Tesco local or
  Sainsburys local which doesn't sell a specific product for their recipe ... All ingredients can be picked up from almost 100% of stores").
  - `EVERYDAY_KINDS` in `lib/mm/pantry.ts`: 84 pantry kinds judged to be sold in nearly every small UK shop (Tesco Express, Sainsbury's Local, Co-op,
    One Stop). It's a judgement: no supermarket publishes its small-shop range. A test fails any recipe-book ingredient outside it (substitutes may be
    anything; the switched-off AI maker is unchanged). New kind `coconut-milk` (regular tins; small shops rarely stock the light ones).
  - Out of every recipe: tofu, Quorn, halloumi, feta, paneer, parmesan, skyr, prawns, cod and white fish, smoked mackerel, steak, turkey and lamb mince,
    lentils, black and butter beans, gnocchi, lasagne sheets, rice noodles, edamame, mangetout, beansprouts, green beans, Thai paste, teriyaki,
    horseradish, fresh herbs, chillies and ginger, lime juice, smoked paprika and the rarer dried herbs and seeds.
  - 33 recipes keep their name with a simple swap (e.g. parmesan → cheddar, black → kidney beans, garnish herbs dropped); 21 become the same dish with the
    missing item swapped and a new name (e.g. "Bean chilli", "Beef keema with peas", "Egg and pea curry"); 22 are new dishes (e.g. "Salmon and coconut
    curry", "Tuna fishcakes", "Chicken chow mein", "Salmon fish pie"). Still 100 recipes and the same meal mix; vegan 20 → 24, no meat or fish 50 → 52,
    suits halal 80 → 90. Recipes saved under an old id drop out of My meals (not launched yet).
  - Halal still uses halal-named meat, which small shops rarely sell. The 211 new or changed sentences were translated into the 10 languages by AI, each
    checked by a second translator.

- 2026-10-15 (afternoon) — **Every screen as calm as the new Home** (founder: "the home screen now looks beautiful ... the rest of the app should match
  that elegance too", "the whole app should be elegant and visually pleasing ... make the app look the best it possibly can"). Looks only: no wording,
  data, ranking or behaviour changed (the set of translation keys is the same apart from two Today lines retired below).
  - **How:** 13 groups of screens, each restyled by a designer agent to Home's language, then compared with Home and the founder's pictures by an
    independent reviewer, then fixed: Eat out / favourites / Search / Near me; a restaurant, a dish, the order builder; Recipes, a recipe, My meals;
    Groceries and every shop screen; Settings, Today, Compare; onboarding; the diet, shop, language and suggested-targets pickers; the report, contact
    and request forms; the share card, Compare button and dish photos; the offline page; numbite.com's home page; privacy, terms and support; and the
    shared buttons, sheets, inputs and segmented controls.
  - **The language:** flat light grey page, white 20 px cards with a soft neutral shadow and no outline, compact heavy page titles, section headings
    without decoration, small spaced-capital labels, figures in a regular weight with a smaller unit, nutrition rows like Home's (label in small
    capitals, figures in DM Mono, thin bars), the main action a black pill, lime only for what is selected or today.
  - **Notable changes:** disabled buttons are a quiet grey pill with readable words (never faded); the busy spinner sits inside its button; keyboard
    focus rings are no longer cut off inside grouped cards; empty states have icons; Today shows Home's protein, carbs and fat rows with the new targets
    (retiring "{eaten} / {target} protein" and "{carbs} carbs · {fat} fat"); the share card keeps its translated words; sheet form labels in sentence
    case like Settings; the stacked "Which meal?" choices at large text are dark like other lists; a long Polish button word no longer splits.
  - **Tab names** are sized by measuring their longest word in its own font (13 px; 11 px only when that keeps it whole; letters a touch closer before
    hyphenating), and the bar's insets no longer grow with the text size, so every language fits on a 390 px iPhone at every text size; on the
    narrowest phones Spanish and Portuguese "Supermercado" is hyphenated.
  - `<html suppressHydrationWarning>`: the text-size and language script changes `<html>`'s attributes before the first paint on purpose.
  - The accessibility tests (a11y, account) now wait for fades and slides to end before judging colours: the two "contrast" flags were text caught
    halfway through its fade-in (3.9:1 for a moment, 5.5:1 when shown).

- 2026-10-15 (afternoon) — **Recipes: everything bought is used, the right products, sensible amounts.** An independent review of the rewritten book
  confirmed 72 problems; all fixed, then guarded.
  - **Bought but never used:** onions, garlic, spinach, lettuce, spring onions, cinnamon, salt and pepper, oil spray and others that recipes bought and
    their methods never mentioned are now used where a cook would use them (or removed where the dish is better without). A new test fails any recipe
    whose method doesn't name everything it buys (with the words methods use: "season" for salt and pepper, "spray" for oil spray...).
  - **Picks:** block cheddar for grating (not slices), a real sweet chilli sauce (not a stir-fry sauce), plain sultanas, crumbly stock cubes (not stock
    pots; "about 2 stock cubes" where a soup needs two), a single basmati bag, 60 g wraps, plain wheat biscuits counted by the biscuit, spaghetti or
    linguine as the recipe says.
  - **Fitting to a meal size:** milk and oat drink follow the oats (and similar pairs), so porridge and pancakes keep their consistency; tinned pulses move
    at most 1.5x; wraps always come out as the same whole number for every person (`perServing` on the kind; fitted and scaled; tested).
  - Dishes that had become copies were made distinct; amounts changed so whole tins and packs are used where that is natural.
  - About 100 new or changed sentences, translated into the 10 languages by AI, each checked by a second translator.
  - Checked (both entries): 600 unit tests, tsc, lint; e2e smoke 23, a11y 0 violations, large text (no overflow at 100/150/200%), recipes 13,
    extra 12, browse 9, calories 4, diet 5, groceries 6, groceries-all 7, groceries-compare 8, groceries-photos 4, compare 3, account 8, share,
    languages 5, offline 13, map 6 of 7 (the known headless geolocation limit), prodmode 9, app-build 8; tab names measured in all 11 languages at
    360 and 390 px, standard and extra-large text; screenshots of every main screen at normal and extra-large text.
  - The App Store screenshots and the uploaded iPhone build still show the old look: re-run `web/e2e/store-shots.mjs` and make a new build.

- 2026-10-15 (evening) — **McDonald's logo** (founder: "McDonalds is missing the logo"). Its website, its corporate site and mcdonalds.co.uk all answer 403
  (Akamai) to the cloud environment, which we never work round, so the founder saved the golden arches from mcdonalds.com/gb in their own browser and sent
  the file (WebP, 500 x 438, transparent, one colour, cut to the artwork). Saved byte for byte as `web/public/logos/mcdonalds.webp`, record in
  `mcdonalds.source.txt` (the site's robots.txt and terms could not be read from here; installed on the founder's accepted risk, rule 2; takedown through
  `hidden.json`), added by `tools/logos/assemble_logos.py`; plain white tile (looked at on Eat out, the chain page and Search, normal and extra-large text).
  **233 of 238 chains now show a logo**; still none: Bettys, Fuller's, Kick Ass Burrito, Tesco Café, Wild Bean Café. The iPhone app shows it after its next build.

- 2026-10-15 (evening) — **Plain black buttons: no circles inside them** (founder, on the language screen: "It says continue, then on the left side the play
  button, and on the right side the tick button. It just looks quite weird ... get rid of those two circles ... for all the screens too"; answer: every
  black button). Looks only: no wording, behaviour, roles or names changed, so no translations.
  - The onboarding's bottom pill (`BottomButton`, was `SlideButton`; the language, Get started, Pip's three screens, every question and Start) is now a plain
    56 px pill with the words centred: black, or white over the logo wall; disabled is the quiet grey pill, as everywhere.
  - The same lime icon circles are gone from the other black buttons: shop product "Add to my list" (`MainButton`, no icon prop any more), the floating "Best for
    you" pill (a plain arrow now), the recipe's "Add all to my shopping list" (a plain plus), and the website's "Open the web app", "Get early access" and the
    support form's "Send".
  - Kept on purpose: status marks that are not buttons (the tick in "You're on the list", "Thanks!" and report-sent, selection ticks, the shopping-list ticks),
    the map's "Near {place}" pin circle and Pip's headline pill.
  - Found on the way (not mine, not changed): in the dev server, a non-English language logs "Hydration failed" and "Encountered a script tag" for
    `/app/welcome` (same with and without these changes; English is clean).

- 2026-10-15 (evening) — **Welcome screen in the right order** (founder: "welcome to Numbite, then a line that sums up the app ... then the collage of all
  the logos ... and the bottom has a Get started"). Top to bottom: Pip (waving, lime avatar) with "Welcome to Numbite" as plain visible text, then the one
  headline "Eat out, shop and cook. Know the numbers first.", the three promises, the moving wall of logos with its two labels, and the Get started bar.
  The greeting used to be a tilted white sticker in the middle of the headline. Looks and order only: the same three lines of copy as before, so no new
  words and no translations (the founder's own wording is the "catchy line"; a different tagline would be new copy: say if you want one). The greeting is
  now read by screen readers (the sticker was hidden from them). Checked at 390 px in English, Extra large text, Arabic (right to left) and Polish: no
  overflow; at Extra large the page scrolls and the wall sits behind the bar as before.

- 2026-10-15 (night) — **Pip leads the onboarding** (founder, on the "A few quick questions and a short tour" screen with the Home preview: "This screen
  doesn't make sense ... when you press Get started, Pip appears with a cool animation, then Pip walks them through the app ... and makes them excited,
  like Duolingo"). After Get started:
  - **Pip arrives** ("Hi, I'm Pip!"): a lime spotlight opens, Pip jumps up from below the edge and lands with a squash, a burst of colour goes off, sparkles
    twinkle and Pip's bubble pops up ("I'm your guide to the numbers in your food. Let me show you around!"). Button: "Show me around".
  - **Pip walks along a small copy of the tab bar** (five stops: Home, Eat out, Groceries, Recipes, Settings). Pip hops to the next tab each time, the
    bubble's tail follows, the heading is the tab's name with the one-line description the app already used, and Pip says an excited line about it. The last
    button is "Let's go!". Skip on any of these screens goes to the first question.
  - **The questions** keep their order; Pip now hops in on every screen and the bubble pops again as Pip reacts to answers (goal as before; "Noted! I'll leave
    those out of your top picks." once something to avoid is picked; "Lovely! I'll show those shops first."; "Perfect, that's easy on the eyes!" after a text size).
  - **"You're all set!"** has Pip's bubble ("At {chain} alone I found ... lunch.", same real count as before), your plan and Continue (it was Start; the choice of a
    first recipe now follows, see the next entry). The "Here's how it works" list moved to the walk at the start, so it is gone from here. The old preview of Home
    with made-up figures marked "Example" is gone.
  - Looks, order and animation only; no figures are shown anywhere in it (CLAUDE.md rules 1 and 2). Nothing moves for reduced motion. The progress bar has
    seven segments for the welcome part and seven for the questions and the last two screens. Pip's burst is taken away once it has faded: its pieces used to end up off the screen
    and left the page able to scroll sideways (found while testing right-to-left).
  - **New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator, not yet by native speakers):** "Hi, I'm Pip!",
    "I'm your guide to the numbers in your food. Let me show you around!", "Show me around", the five lines Pip says on the tabs, "Your targets, diet, shops,
    language and text size. Change anything, any time.", the three reactions above, "You're all set!", "At {chain} alone I found {dishes} with {protein}g+ protein
    that fit a {budget} kcal lunch." and "Everything is ready for you.". No longer used: "Hi, I'm Pip.", "A few quick questions and a short tour, and you're
    ready.", "It only takes a minute.", "First up: what you're aiming for.", "Example", "Here's how it works", "Everything is in the bar at the bottom of the
    screen:" and the old "You're all set! ..." lines.

- 2026-10-15 (night) — **A first recipe to start with, a protein bar on Home, and Pescatarian** (founder's three asks):
  - **"Choose a recipe to start with"** is now the last onboarding screen (step 7 of 7, after "You're all set!"). Pip shows **two recipes** side by side, picked the way
    "Picked for you" picks them: the best fit for the person's meal size, diet and shop for the meal of the day (before 10:30 breakfast, to 16:00 lunch, then dinner; SPEC §6.3),
    and the best fit for the other main meal, so they are different dishes (`pickTwoRecipes` in `welcome/RecipeChoice.tsx`, snacks never). Tapping one finishes onboarding and
    opens the real recipe page (per serving: calories, protein, carbs and fat; the shop's products with prices; Swap for substitutes), with **Home underneath** in the history (Home
    is opened first and the recipe only once Home is showing: asked together, the second navigation swallowed the first and Back returned to the welcome screens). "Take me to Home"
    (or the shared page the visitor first opened) skips it; if the shop's list can't load, Pip says so and only that button is offered. The shop's full list starts loading
    during the last questions. Progress shows "Step n of 7"; Skip is on steps 1-5 only. No figure on this screen is anything but what the recipe page itself shows.
  - **Home and Today always show a protein bar.** The protein row showed only "0g" and no bar when no protein target was typed (it is optional in onboarding), unlike carbs and
    fat. Now an empty protein target is **20% of the day's calories at 4 kcal a gram, to the nearest 5 g** (`suggestProtein`, `macroTargets` always returns a protein figure): the same
    share carbs were already worked out after. Settings shows it greyed in the empty Protein box like carbs and fat; typed numbers still win; ranking, Best for you and "protein left" still
    use only a protein target the person typed (`dailyProtein` is unchanged). Note under the targets reworded to say all three are worked out when empty.
  - **Pescatarian** (founder: "people are also pescatarian ... do all that"): a new diet tile (Settings, onboarding, restaurant pages), `Preferences.pescatarianOnly`, kept in sync.
    **Groceries and recipes:** nothing that plainly says meat (fish and seafood are fine; same word rules as the vegetarian filter, `foodDietProblem`); recipes with a meat
    ingredient are left out (`kindExcluded`). **Restaurant dishes** (menus, search, the order builder's pickers, Best for you): a dish passes when the restaurant marks it vegetarian,
    or when **its own name names fish or seafood and no meat** (`namedPescatarian`: "Salmon fillet", "Fish and chips", "Prawn linguine"; never "Chicken and prawn", "Surf and turf"; a dish the
    restaurant tags with pork or beef never passes). Nothing is inferred beyond the name, like the vegan filter, so it hides dishes that are pescatarian but name nothing (a plain
    "Cheese toastie" the restaurant doesn't tag vegetarian), and the caution line says it can't promise. No pipeline or data change (computed in the app from the name).
    **Not added: Kosher.** No restaurant data we hold says what is kosher, so a filter would promise what we can't know (Halal works only because chains state it on their own sites).
    All 14 UK allergens were already in "Allergies to avoid" (Gluten, Milk, Eggs, Peanuts, Tree nuts, Soya, Fish, Crustaceans, Molluscs, Sesame, Mustard, Celery, Lupin, Sulphites);
    "Gluten-free" and "dairy-free" eaters use Gluten and Milk there.
  - New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator, not yet by native speakers): "Pescatarian", "pescatarian",
    "Choose a recipe to start with", "I picked two that fit your day and your shop. Tap one to see what's in it and where to buy it!", "Take me to Home", "Finding two recipes for you…",
    "I can't show recipes just now. You'll find them any time under Recipes.", and the new note "Left empty, protein, carbs and fat are worked out from your calories: about 20% from
    protein, 30% from fat and the rest from carbs. Type your own to change them." (replaces the carbs-and-fat note). No longer used: "Start".

- 2026-10-15 (night) — **Find a restaurant by your numbers and allergies** (founder: "another way where you can input the macros like calories, protein and fat to filter the
  restaurants, also a way to filter by allergies"). Eat out › "More ways to find a restaurant" now has **Your numbers**: four boxes (calories up to, protein at least, carbs up
  to, fat up to; any can be left empty; "Use my meal numbers" fills them from the person's meal size) and **Allergies to avoid** (all 14); the list below becomes the restaurants
  that have **at least one dish fitting every number and the person's diet and allergy settings** ("27 restaurants have dishes that fit", most dishes first, each row with how many
  dishes fit and the highest-protein one as an example). It respects the type, Halal and Full-nutrition choices; Clear empties it. Tapping a restaurant opens its page with the same
  numbers and allergies applied to that visit ("Your numbers: up to 500 kcal · 35 g+ protein · Show all dishes"). **How:** the pipeline now also writes **`menus-numbers.json`**
  (calories, protein, carbs and fat of every item, columns in the search file's item order; docs/DATA.md "Numbers file"; schema, manifest, publish scripts and sample build updated;
  639 KB, loaded only when someone types a number, verified against the manifest's SHA-256 and paired with the search file only if the item counts and every calorie figure agree).
  The menu data was republished with `./scripts/publish_menus.sh --web-only`: only the manifest (new dataVersion and `numbers` entry) changed; every chain file and the search file are
  byte-identical. Logic in `lib/mm/numbers.ts` (tests: `tests/numbers.test.ts`, including the real published files for all 238 chains). **Rules kept:** nothing is estimated (a dish with
  no published figure for something you asked about doesn't count; calories-only chains are left out when protein, carbs or fat are asked for, and the page says so); a restaurant with no
  allergen guide is left out while allergies are chosen, and says so; add-ons ("Add 8oz sirloin") are never counted; counts include sides and drinks, as the line under the list says;
  the allergy caution line is the existing one. Not done: the iPhone app's native M1 menu bundle (`MenuMacros/Resources/Menus`) was not republished (the packed web app uses `web/public`).
  New copy (rule 8, logged here; translations follow): "Your numbers", "Your numbers:", "Calories, up to", "Protein, at least (g)", "Carbs, up to (g)", "Fat, up to (g)",
  "Type any of these to see the restaurants with dishes that fit. Leave the rest empty.", "Use my meal numbers", "Clear", "Finding restaurants…", "Couldn't load the numbers just now.",
  "Restaurants that fit", "1 restaurant has dishes that fit", "{n} restaurants have dishes that fit", "1 dish fits", "{n} dishes fit", "No restaurant has a dish that fits all of that",
  "Try a higher calorie limit, a lower protein or fewer allergies.", "Show more restaurants", "These count every item on a menu, sides and drinks included, as each restaurant publishes it.",
  "Restaurants that publish calories only are left out when you ask for protein, carbs or fat.", "Restaurants that don't publish an allergen guide are left out while you have allergies chosen.",
  "up to {n} kcal", "{n} g+ protein", "up to {n} g carbs", "up to {n} g fat".

- 2026-10-15 (night) — **A Done button for the keyboard** (founder, on Compare's "Add a product" box with the keyboard up and a circle drawn at the end of
  the box: "There needs to be like a done box here"). Every search box in the app filters as you type, so nothing needs submitting: a person only needs to put
  the keyboard away to see the results under it.
  - **In the box:** a small black "Done" pill at the end of the field (the right; the left in Arabic and Urdu), shown only while the box is in use. Tapping it
    puts the keyboard away and keeps the words and the results. Where the box has a clear (×) button, that sits just before Done. The field's text makes room for
    it while it is in use, so typed words never run under it. The keyboard's own Return key now reads **Done** too and does the same (on Search it still keeps the
    search in "Recent searches" first, and keeps its "search" label).
  - **Where:** Compare (both "Add a product" and "Add a dish"), Recipes, Groceries "Search every shop", a shop's full list, My favourite restaurants,
    a restaurant's menu search and the main Search. Eat out's postcode box keeps its own Search button.
  - **Number boxes:** an iPhone's number pad has no Return key at all, so on Eat out's "Your numbers" card a **Done** shows at the card's top corner, level with the
    heading, while one of the four boxes is in use. It is hidden, not removed, and sits outside the flow, so showing it moves nothing. (A first version put it
    under the boxes and pushed the allergy tiles down the moment a box lost the focus, so the next tap missed: the finder's own test caught it.) Other
    number boxes (Settings, the targets steps, "Type my own numbers") have their own buttons under them and are unchanged.
  - **How:** `_components/SearchDone.tsx` (`SearchDone`, `NumberDone`, `DONE_KEY`); the box's wrapper carries `group/search` and the button shows with CSS
    `:focus-within`, so it can still be reached with Tab. A tap keeps the focus in the field until the click lands (the button would otherwise disappear under
    the finger first). Labels moved off wrapping `<label>`s onto the inputs (`aria-label`) so the button's word isn't read as part of the field's name.
  - Looks and behaviour only. **No new copy:** "Done" was already in the app and translated in the 10 languages. Checked: `e2e/done.mjs` 13 steps (every box: Done
    shows, sits inside the box, tap and Return both let go of the field, words stay; results stay under Compare's box; the clear button sits beside Done and still
    clears; the number boxes; Tab then Enter; Arabic; Extra large text, no sideways scroll; axe 0), tsc, lint; screenshots on a 390 px phone with touch.

- 2026-10-15 (night) — **Compare is one side-by-side table** (founder, on the per-nutrient blocks: "I think like a side by side table works better instead").
  The comparison under "Side by side" is now a single table instead of a block per nutrient with a row and a bar per item:
  - **Columns** are the items you chose (its number, name and shop or restaurant at the top); **rows** are the nutrients: calories, protein, carbohydrate, of
    which sugars, fat, of which saturates, fibre, salt, then for groceries the price per kg or litre and "Protein for £1", only the rows at least one item has.
    The "of which" rows are indented under theirs.
  - **Cells:** the figure in DM Mono with its unit smaller; **Highest** and **Lowest** in small capitals under it, words only and no colour or tint, so neither
    reads as better (rule 3); a figure the label doesn't print says "not on the label" ("not published" for a dish). The bars are gone.
  - **On a phone:** two items fit with no sideways scroll. With more, the item columns scroll sideways while the nutrient names stay in view (sticky), and the next
    column peeking in shows there is more. The scrolling area can be reached with the keyboard; right to left (Arabic, Urdu) mirrors it.
  - It is a real table (column and row headers) for screen readers. No new copy: every word was already in the app and translated.
  - Checked: `e2e/compare.mjs` 4 steps (a column per item, a row per nutrient, "of which" order, Highest and Lowest once each, 53 g of protein for £1,
    two items fit and three scroll with the names staying put, dishes, axe 0 in light and dark), the large-text test (no overflow at 100, 150 and 200%),
    tsc, lint; screenshots with 2, 3 and 6 items, dishes, Extra large text and Arabic.

- 2026-10-15 (night) — **Allergies to avoid on the Recipes page** (founder, on Recipes › More: "Needs to also be a way to filter by allergens too"). Recipes already left
  out recipes for the allergies chosen in Settings, but the choice sat behind "Your diet: … Change". Now Recipes › More has an **Allergies to avoid** card between "Your
  meal" and "Your diet": the 14 allergens as tiles, tap to leave out every recipe that contains one. It is the **same setting** as Settings' and the restaurant page's
  (one list for the whole app, kept in the app's order, synced like the rest), so a choice made here also applies to the restaurant lists and groceries, and Settings
  shows it chosen; the "Your diet:" lines and "N recipes are left out for your diet" update at once. Once one is chosen, the card shows the existing sentence that
  recipes are left out by their ingredients and the products' allergen labels haven't been read, so check each pack (the same sentence the recipe page has).
  - **Code:** `AllergenTiles` (the 14 tiles) and `toggleAllergen` (`lib/mm/menu-view.ts`, unit-tested) were pulled out of the diet picker and are shared by it, Eat out's
    finder and this card.
  - **No new copy:** "Allergies to avoid", the tile names and the caution sentence all exist and are translated.
  - Checked: `e2e/recipes.mjs` 14 (new: the 14 tiles under More, Milk leaves recipes out and shows in the diet line, in Settings and after a visit elsewhere, unchoosing brings
    them back, the caution goes with the last allergy), `e2e/numbers.mjs` 7, 629 unit tests (4 new), axe 0 with the card open, no sideways overflow at Extra large text,
    right to left (Arabic) checked on screenshots.

- 2026-10-15 (night) — **Scan a barcode opens a full-screen camera that reads the code** (founder, on Groceries › "Scan a barcode": "can it launch like a camera where you can
  scan it then"). Before, the scanner only worked in browsers that have a built-in barcode reader (Chrome on Android); iPhone Safari, the Xcode preview shell and any web view
  have none, so they showed a box to type the number. Now:
  - **Tap Scan →** a full-screen camera: the live picture, a box to hold the barcode in (everything outside it dimmed; the box turns lime and the phone buzzes where it can the
    moment a code is read), a hint "Point the camera at the barcode", a close button and a white **Type the number instead** button. The product opens as soon as the code is read.
    Closing, or reading a code, switches the camera off.
  - **The page reads the code itself** (`web/lib/mm/barcode.ts`, **no library**, CLAUDE.md rule 6): EAN-13, UPC-A (as 13 digits starting 0) and EAN-8, the codes on supermarket
    products. It looks along lines across and down the picture (and tilted a little either way), turns each into dark and light stripe widths and matches them to the standard
    digit patterns; the check digit has to agree, and the same code has to be read twice (on two lines or two pictures) before it is believed. Where the browser has its own
    BarcodeDetector (Chrome on Android) that is used instead. A picture is looked at on the phone and dropped: nothing is sent anywhere (the privacy page already says so).
  - **Tested against a reference reader.** The test pictures are drawn by `python-barcode` and checked with `zxing-cpp` (separate tools, used only to make and judge test pictures:
    `tools/barcode/make_fixtures.py`, not dependencies of the app): `tests/barcode.test.ts` reads 44 of 44 pictures that hold a code (clean, small, large, turned 8 and 20 degrees,
    upside down, sideways, soft, grainy, washed out, unevenly lit, on a dark pack) and reads nothing from 4 pictures with no code (blank, noise, random bars, text-like marks). On
    300 further hard pictures at 1280 x 720 it read 259 of the 262 the reference reader reads, plus 22 it missed, **and never returned a wrong code**; about 14 ms a picture.
    `e2e/scan.mjs` (8 steps) plays a video of a barcode through Chromium's fake camera: the camera opens full screen, reads the code and opens the product, switches the camera
    off, Type the number instead / Scan again / Close, a refused camera and a browser with no camera API land on the typing sheet with the note, the Search every shop scan button
    opens the same camera, a picture with no code never opens anything, axe 0.
  - **Found by the tests:** the typing sheet's own "close" event (when the camera takes over again) used to close the whole scanner; fixed.
  - **iPhone app:** unchanged, it still uses the iPhone's own scanner. **The Xcode preview shell** needed `allowsInlineMediaPlayback` and a camera usage description to show the camera
    in the page: both added (`ios/PreviewSources/WebView.swift`, its copy in the project, and `INFOPLIST_KEY_NSCameraUsageDescription` in the project's two build configurations),
    **not compiled here: rebuild and run it once from Xcode** (docs/XCODE_PREVIEW_SHELL.md). Real iPhone cameras can't be tried from this computer: the reader is tested on pictures and on
    Chromium's fake camera, not on an iPhone's lens, so test it once on the phone (hold the barcode level, 15-25 cm away, good light).
  - **New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator, not yet by native speakers):** "Point the camera at the barcode",
    "Type the number instead". "Scan again" now also appears on the typing sheet in a browser (it goes back to the camera).

- 2026-10-15 (night) — **Fixes from the independent review of the onboarding, diet, protein bar and finder work** (four reviewers, each finding checked by a second agent; 16 confirmed).
  - **Eat out finder:** (1) a one-line summary directly under the number boxes says what was found ("17 restaurants have dishes that fit", "No restaurant has a dish that fits all of that",
    "Couldn't load the numbers just now.") and is a link to the list; **Done** (corner of the card) also scrolls to the list; the list could be a screen or more below the boxes, so typing a
    number looked as if nothing happened. The summary is one live line that stays in place, so a screen reader hears every change (the old heading and empty state each appeared fresh).
    (2) **Coming back from a restaurant** now finds the panel open with the numbers and allergies as they were (kept for this tab only, `mm.finder` in sessionStorage; closing the row, or
    Settings › Clear everything, forgets them). (3) The allergy caution now sits under the count, where "dishes that fit" could be read as "safe to eat". (4) Numbers typed in Arabic,
    Urdu, Bengali, Punjabi or Gujarati digits are read as numbers (they were silently deleted). (5) "Change" is a 44 px target; the allergy tiles no longer run past the card on a 320 px
    phone at 200% text; the two chevrons point the right way in Arabic and Urdu.
  - **A restaurant opened from a result:** Best for you now picks only from the dishes that fit the numbers (the ranking itself is untouched, its pool is narrower), so it no longer
    contradicts the "Your numbers" line above it.
  - **Pescatarian:** "Surf & Turf" is no longer pescatarian (the steak is in the name: `turf` is a meat word, with tests); reading the search file is fast again for everyone
    (the pescatarian answer is worked out only for someone who chose it, and only once); Pescatarian and Vegetarian/Vegan are now alternatives in the diet picker (turning one on
    turns the other off: with both on the stricter vegetarian rule won and the tile did nothing).
  - **Pip's recipe lines** no longer promise "your shop": the first-recipe screen names the shop the recipes really come from (only a shop whose labels we have read can fill a recipe,
    today Sainsbury's), and the tour's Recipes line says "real products" (one reworded string, translated). The shop-first lines on the shops step and Groceries stop are unchanged.
  - **Focus under the tab bar:** the page leaves 7rem clear at the bottom when it scrolls to what has the keyboard focus (WCAG 2.4.11), on every app screen.
  - **Tests added:** the carbs (and calories, protein, fat) columns of `menus-numbers.json` equal each chain file's own figures, item for item (real data); digits in other numeral
    systems; diet toggles; allergen toggles; the lazy pescatarian answer; `e2e/numbers.mjs` 12 steps (summary and Done scroll, caution placement, back-and-restore, other digits, Best for you
    within the numbers); the fat-limit step now insists the list gets shorter.
  - **Docs:** STORE.md draft names Pescatarian and the finder; BACKEND.md lists `pescatarianOnly`; PROGRESS's finder entry above is corrected here: the finder is its own row, "Find by numbers or allergies"
    (listed in that entry's new copy), not inside "More ways to find a restaurant".
  - **Left as they were (low, noted):** the progress bar restarts at 1 of 7 after the tour; protein shows as "Optional" in onboarding while Home shows a worked-out 100 g; the tour bubble grows
    at the largest text sizes; the sticky Continue bar can cover the mock tab bar on short phones at large text; "Wegetariańskie"/"Pescetariańskie" wrap inside their tiles on a 360 px phone;
    "Try a higher calorie limit, a lower protein or fewer allergies." is shown whatever was typed; restaurants whose numbers didn't line up are skipped without a note; the first recipe tap in
    onboarding drops a shared link's destination; the finder's example dish with no protein limit is the lowest-calorie item.

- 2026-10-15 (night) — **Pictures on the Shopping list** (founder, on a Tesco item "Abra Ca Debora Sweet Pancakes" with no picture: "The image should be next to it too").
  - **The row:** the round tick, then the product's picture (56 px, the same picture the shop's list and product page show), then the name and price, with the quantity
    (− 1 +) underneath at the end. The quantity moved under the text so a long name keeps its width beside the picture (at 390 px the old one-line row would have left a
    name about 100 px). The picture opens the product too (the name beside it is the link a screen reader and the keyboard use). A typed-in item ("Milk") and a product whose
    shop shows no picture get a quiet basket tile, so the rows line up.
  - **New items keep their picture** (`ShoppingItem.photo`, one place a picture can come from: our stored copy of a shop's photo, the shop's own picture on its own image
    server, or the Open Food Facts front photo of that barcode): every way of adding a product stores it (a shop's full list, a product page, a recipe's "Add all", "You might
    also need"), so the list shows it at once and reads no list of products. Adding the same product again gives an older item the picture it lacks.
  - **Items added before** (the founder's current list) have none, so the list **looks it up** in the shop's own list by the shop's product id, or in the barcode catalogue
    by the barcode (`app/app/_lib/listPhotos.ts`). Only the shops that have such an item are loaded (kept for the session, and by the service worker for offline), nothing
    is written back to the list, and when every item carries its picture nothing is read.
  - **Checked every time it is read back** (`validPhoto`, `lib/mm/groceries.ts`): it comes from this phone's storage and from the sync server, so only the three kinds above
    pass, on https, with no other host, port, login in the address or look-alike host (`PHOTO_HOSTS`, the same list the shops' lists use; a test runs every picture of all nine
    shops' lists and the barcode catalogue through it, so no shop silently loses pictures). A bad picture is dropped, the item stays, nothing is loaded from there.
  - **Taken-down shops** (`public/logos/hidden.json`) show none of their pictures here either, also when the list reaches the device after the page has opened.
  - Looks and behaviour only. **No new copy.** Checked: `tests/listPhotos.test.ts` (10: accepted and refused pictures, the sanitiser, adding again, taken-down shops, every published picture),
    `e2e/listphotos.mjs` (11 steps: a lookup for an older item and nothing written back, a kept picture and no list read, a typed item, adding from a shop's list, a product page and a recipe,
    a picture from elsewhere never loaded, a taken-down shop on a device that knows the list and one that learns it later, the layout at 360 px, Extra large text and Arabic, ticking
    and quantity, axe 0), tsc, lint; screenshots at 390 px, 360 px and Extra large text.

- 2026-10-15 (night) — **Home's + opens an "Add food" sheet** (founder, on the + beside Breakfast: "a kind of menu vibe sheet should launch where you can either type in macros, choose a
  recipe perhaps, choose a meal from a restaurant or whatever"). The + on Breakfast, Lunch or Dinner (it used to open Eat out) opens a bottom sheet with four big choices; whatever is picked
  goes into **the meal whose + was tapped**, at the time of the tap, with an Undo for 8 seconds (at the top of the screen, clear of the rows).
  - **Type in your numbers:** calories (needed), protein, carbs, fat (each optional, **an empty box is no figure, never 0**), an optional name ("My own numbers" when left empty). A box that is wrong
    is named ("Check the protein: use a number from 0 to 1,000 g."); numbers typed in another numeral system and a thousands comma are read as numbers (`lib/mm/addFood.ts`, `parseNumber`, tested).
  - **Choose a recipe:** one of our recipes, a serving or more (half to six), with exactly the figures its card and page show per serving (fitted to the person's meal size, from the shop's own
    labels); the recipes for that meal first; diet and allergy settings apply as everywhere.
  - **Choose a restaurant meal:** search the menus (or the person's saved meals above the search); a dish is added as the restaurant publishes it, one serving. A restaurant that publishes calories
    only is not offered (the log counts protein, carbs and fat; the way to log such a dish is to type its calories). A dish picked on a slow connection is **not** added if the sheet was closed
    meanwhile (found by the review below; `e2e/addfood.mjs`).
  - **Choose a supermarket product:** found by name or barcode (typed, or the camera), then how much was had in grams or millilitres; the line shown before Add is the label per 100 g or ml times the
    amount over 100 (plain arithmetic, `amountNutrients`). **Where the numbers come from is said:** "From the label" only when the preferred shop's own product page was read; otherwise
    "From Open Food Facts contributors (community data) … Check the pack." (almost the whole catalogue; the review found the old wording overstated it).
  - **Decisions (rule 8, all logged here):** (1) an entry **stays in the meal whose + was tapped**, whatever the time (SPEC §6.3 says the meal comes from the time; that still applies to everything
    logged from a dish or an order); stored as `LogEntry.meal`, kept by sync, dropped by the sanitiser if it isn't one of the three. (2) A typed entry may have **calories only**: the log
    sanitiser now accepts entries with protein, carbs and fat absent (they're never 0). **Home, Today and the builder say so instead of showing "0g":** Home and Today add "Some meals you added have no
    protein, carbs or fat entered, so those figures only count the rest." under the figures, and the order builder leaves out "protein left today" while a meal's protein is unknown (`loggedGaps`, tested).
    An older iPhone build's sanitiser would hide such entries until the app is updated. (3) Pro: while Pro is off at the free launch nothing is gated; when Pro returns the + shows the paywall for a free
    person (tested with the Pro-on build). (4) The sheet is not an AI feature and sends nothing anywhere: the picks come from the menus and lists already on the phone; a typed entry stays on it (and in
    sync if the person signed in).
  - **Independent review (30 agents, 27 findings, 14 confirmed) and what was done:** fixed: a restaurant dish chosen on a slow connection was logged after the sheet closed and closed a newer sheet
    (now cancelled, and the tapped Add shows a spinner); a left-blank macro shown as 0g (above); the product note's provenance (above); the sheet's Done pill and search icon painting over its sticky header
    (header above them); the Undo bar covering the + below it; focus dropped when a view changes (focus now goes to the sheet's title, which a screen reader reads); the recipe list's Try again doing
    nothing after the shop list failed to load; failure messages sitting under the list and never cleared (now under the search, cleared when typing); menu or product load failures reading "No dishes match." or
    plain text with no retry (an error with Try again); a label that Done could cover at large text; Home showing yesterday's totals for up to a minute after the phone wakes (the clock now also updates when the
    app comes back to the front). **Not changed (low, noted):** a recipe or product entry keeps the translated name it was logged under (so a person who changes language sees old entries in the old language);
    a "mixed" restaurant's calories-only dish still shows Add and then explains why it can't be added.
  - **New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator, not yet by native speakers):** "Add to Breakfast", "Add to Lunch", "Add to Dinner",
    "Added “{name}” to Breakfast." (and Lunch, Dinner), "Type in your numbers", "Calories, protein, carbs and fat", "Choose a recipe", "A serving of one of our recipes", "Choose a restaurant meal",
    "Search the menus, or pick a saved meal", "Choose a supermarket product", "Search, or scan its barcode", "Numbers", "Calories (kcal)", "Name (optional)", "e.g. Toast and jam", "My own numbers",
    "Calories are needed. Protein, carbs and fat can stay empty.", "Check the calories: use a number from 0 to 5,000." (and protein, carbs, fat: "… from 0 to 1,000 g."), "Servings", "{name} ({n} servings)",
    "Your saved meals", "Choose", "How much did you have? (g)" and "(ml)", "Type an amount from {min} to {max}.", "From the label, for {amount}: {kcal}, {protein} protein, {carbs} carbs, {fat} fat.",
    "From Open Food Facts contributors (community data), for {amount}: {kcal}, {protein} protein, {carbs} carbs, {fat} fat. Check the pack.", "This dish publishes calories only, so it can't be added here. You can
    type its calories in instead.", "Restaurants that publish calories only aren't listed here. You can type their calories in instead.", "Some meals you added have no protein, carbs or fat entered, so those
    figures only count the rest."
  - Checked: `tests/addFood.test.ts` (typed numbers, amounts, servings, the meal an entry sits under, the log sanitiser, `loggedGaps`), `e2e/addfood.mjs` (15 steps incl. a slow connection, Pro gate on the Pro-on build,
    products' provenance, Back paths, scanner fallback, 360 px / Extra large text / Arabic, axe 0), tsc, lint.

- 2026-10-15 (night) — **Shopping list: add more from the same shop, or from another** (founder, on a list holding one Asda product: "After they've added from a shop there is no
  way to add a product from the same shop or choose a different shop"). The list only had a typing box; the way back to the shops was the Groceries tab.
  - **"Add more from {shop}"** is the last row of each shop's card (a lime round + like a tick's place, like "New reminder" at the foot of a list). It opens that shop's own list of
    products; a shop with no list of its own (Co-op today) goes to the page that asks "Which shop?" instead of an empty page. Typed-in items ("Any shop") have no such row.
  - **"Add from another shop"** sits under the shops' cards (a white pill with the basket): it opens "Which shop?". When the list holds only typed-in items it reads
    "Add products from a shop". An empty list is unchanged ("Browse groceries", "See recipes").
  - Behaviour only (the shop rows are links, not items: ticks, quantities and "Remove ticked" count only items). **New copy (rule 8, logged here; translations follow):** "Add more from {shop}",
    "Add from another shop", "Add products from a shop". Checked: `e2e/listadd.mjs` (7 steps: the row's place, target and address, adding a second product from the shop's own list and coming back,
    two shops, typed-only, Co-op, an empty list, 360 px / Extra large text / Arabic, axe 0), `e2e/recipes.mjs` 14 (its list count now counts ticks, not rows), tsc, lint.

- 2026-10-15 (night) — **Share a shopping list as a link** (founder: "when the person presses share then sends to someone they know they get a link saying to download the app to view
  their shopping list, then their friend downloads the app and can view the shopping list. So that shopping lists can be easily shared"). Shopping list › Share (and Copy) now sends the
  list as words **and a link**, and the person who gets it can open the list in Numbite.
  - **The link holds the list; no server does.** `https://numbite.com/l#<list>`: everything after the "#" is never sent to a server (not by the browser, not by a messaging app's link
    preview), so nothing is stored anywhere, **no account, no database table, no migration** (rule 4 untouched; the privacy page says so). What travels is references only, never
    prices or numbers: for each shop the products' ids (the shop's own product id or the barcode) and how many, plus the words of typed-in items (`lib/mm/shareList.ts`, 16 unit tests).
    The reader's app looks the products up in the shops' own lists, so they see today's name, picture and price, not the sender's. Ticked items (already in the basket) are left out.
    A version digit, a 6-character check and a length limit (100 items, 6,000 characters) mean a link a messaging app cut short, a newer format or random text is **said to be so**
    ("This link looks cut short…") and never half-read; an over-long list is trimmed to what fits, and the message says "The link holds the first {n} of your {total} items. The list in
    the message has them all." Every shop, code, word and quantity in a link is checked when it is read (a link can come from anyone): typed words are shown as words, never run.
  - **What the friend sees.** The link opens a website page (`/l`, English like the other site pages, not for search engines): "A friend shared a shopping list", how many things and
    from which shops (the products' names stay in the link), and what to do. **Today** (no App Store page yet) it says the iPhone app is coming soon and offers "View the list", which opens
    the list in the browser version of the app. **Once `NEXT_PUBLIC_APP_STORE_URL` is set** it shows "Get Numbite on the App Store", "I have Numbite: open the list" (`numbite://l#…`),
    "Or read the list in your browser" and a card "After you've installed it" (tap the link again, or paste it in the app) with a Copy button.
  - **In the app** (`/app/groceries/list/shared`): the products as the Shopping list shows them (picture, name, price as the shop shows it, quantity) under each shop, typed items under
    "Any shop", then "Add all to my shopping list" (merges with what is there: the same product adds up; each product keeps its picture) and "Open my shopping list". Products a shop's list no
    longer has are counted and said so; a link of nothing else says that. A first-time visitor is taken through the questions first and **lands on the list** (the "#" survives
    onboarding; the "choose a recipe to start with" step is skipped for a shared link). Shopping list › **"Got a list from a friend? Open it"** takes the whole message, the link or just
    the code pasted in, so the list can still be opened by someone who installed the app after the link arrived.
  - **The iPhone app** (`MenuMacros/Features/WebApp/SharedListLink.swift`, `MenuMacrosApp.swift` `.onOpenURL` + `.onContinueUserActivity`, `LinkInbox`, `WebAppView`): a tap on
    `https://numbite.com/l#…` or `numbite://l#…` opens that page inside the app, running or from cold. Only those two shapes are opened (the sign-in callback and every other address
    are ignored; the code may hold only the characters a list uses). Swift Testing tests are in `MenuMacrosTests/SharedListLinkTests.swift`. **Written without a compiler: the Mac session
    builds it.** The site serves `/.well-known/apple-app-site-association` (team S7G6ZHHK59, `com.amanmarwaha.MenuMacros`, path `/l`; `next.config.ts` gives it the JSON content type).
  - **Founder steps (docs/APP_BUILD.md "Shared shopping lists"):** add the **Associated Domains** capability (`applinks:numbite.com`) and a **URL Type** `numbite` in Xcode (capabilities
    and Info settings are yours; I did not touch the entitlements file or add an Info.plist), set `NEXT_PUBLIC_APP_STORE_URL` in Vercel when the App Store page exists, and try it on a real iPhone.
  - **Limits, said plainly:** (1) a friend who does not have the app yet goes to the App Store and, after installing, has to **tap the link in the message again** (or paste it): iOS gives an
    app no way to know which link led to its install without a third-party service (rule 6: none added). (2) Until Associated Domains is on, a tap on the https link opens the web page; its "I have Numbite: open the list" button
    (`numbite://l#…`) only exists once `NEXT_PUBLIC_APP_STORE_URL` is set, so until then that page offers "View the list" in the browser version. (3) Anyone who has the link can read the list, like any link: the share note says so. (4) Product prices are what each shop's list showed when the
    reader's app last read it, never the sender's.
  - **New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator, not yet by native speakers):** "My shopping list on {app}", "Open it in {app}
    to see the products and prices:", "The link holds the first {n} of your {total} items. The list in the message has them all.", "Sharing sends a link that holds your list, so anyone who has
    it can see it.", "Got a list from a friend? Open it", "Open a shared list", "Paste the link your friend sent, and the list opens.", "The link or code", "Paste it here", "Open the list", the four
    problem sentences ("There is nothing to show in this link…", "This link was made by a newer version of {app}…", "This link looks cut short…", "This doesn't look like a shopping list link…"),
    "Shared shopping list", "Opening the list", "Couldn't open this list. Check your connection.", "A friend shared this shopping list with you. Add it to yours to tick things off as you shop.",
    "None of the products in this list could be found in the shops' lists any more.", the two "… couldn't be found in the shops' lists any more." lines, "Added to your shopping list.", "Open my shopping
    list", "Prices are what each shop showed on its website, and they change: check in store." English only (website page, privacy page paragraph, docs).
  - **Found and fixed while testing:** a link that does not start with a version digit (for example "abc") was reported as made by a newer app; it is now "doesn't look like a shopping list link";
    the landing page did not notice a changed "#" in the same tab (it now follows `hashchange`, like the in-app page).
  - Checked: `tests/shareList.test.ts` 16, `e2e/sharelist.mjs` 11 steps (share text and link, ticked items left out, Copy and a long list cut with a note, the landing page in both modes — before and after the App
    Store address is set — bad, cut and empty links, a first-time visitor through the questions onto the list, pictures/prices/quantities and "Add all" merging, products no longer in a list, html as words, the
    paste sheet, 360 px / Extra large text / Arabic with no sideways scroll, axe 0), tsc, lint; screenshots of the landing page.

- 2026-10-15 (night) — **Water on Home** (founder, on Home under Dinner: "There should be a water intake section below dinners with its own heading"; then 2026-10-16: "It should have like a
  water bottle which you can move up and type the amount of water you've had extra when the plus is pressed").
  - **What it is:** under **Today's meals**, a heading **Water** and one card in the look of a meal row: a small **water bottle** (our own drawing, `WaterBottle.tsx`, no photo and no brand) filled to
    today's level against the goal, today's millilitres against the goal ("750 / 2,000 ml"), an **Undo** (the last drink added today only; it keeps its place and is only hidden when there is nothing
    to undo, so the card never changes height) and a round **+**. Today starts again at midnight (Home's clock now ticks at midnight and when the app comes back to the front). Over the goal the
    figure says the real amount and the bottle stops at full. A screen reader hears "750 of 2,000 ml of water today" when it changes.
  - **The + opens "Add water"** (`AddWaterSheet.tsx`, a bottom sheet like Add food): a bigger bottle whose water you **drag up or down** with a finger or the mouse (or move with the arrow keys:
    50 ml a step, Page Up and Page Down 250 ml, Home and End for empty and full; it is a slider for screen readers), an **Amount (ml)** box you can type in, the two quick buttons **Glass 250 ml** and
    **Bottle 500 ml** (they fill the box in), and a black **Add {n} ml** button. The bottle and the box stay in step; the bottle is full at one litre and a typed amount up to 5,000 ml shows a full bottle.
    What is added is **on top of** what is already drunk today. An empty, 0, over-5,000 or non-number amount can't be added and says "Type an amount from 1 to 5,000." Numbers typed in other numeral
    systems or with a comma are read as everywhere else. The sheet starts afresh (250) each time it opens; Escape or Close adds nothing. The inline Glass and Bottle buttons on Home are gone.
  - **Decisions (rule 8, for you to change if you like):** (1) the **starting goal is 2,000 ml** (eight glasses): a number to start from, not a recommendation, and nothing in the app says anyone should
    drink it (rule 3); the person types their own in **Settings › Daily targets › Water (ml)** (250 to 6,000; empty = 2,000), and it syncs with the other settings (clearing it on one device now clears it on
    the others: see the review fixes below). (2) **The drinks stay on the device and are not synced.** The table behind sync (`public.user_data`) accepts only the store names its CHECK constraint lists, so
    syncing water needs a new migration (applied with your go-ahead before the code that uses it ships); until then nothing about water leaves the phone (the privacy page and ACCOUNTS_SYNC.md say so;
    `tests/water.test.ts` fails if a synced store isn't on the database's list). A different person signing in on the same phone starts with the water empty too. (3) Logging stays Pro: while Pro is on, a
    free person's + shows the paywall, like the meal rows' +; at the free launch it's open to everyone. (4) The bottle's full mark is one litre (a drag moves in 50 ml steps; typing allows any amount to 5,000).
    (5) Not on Today yet.
  - **Code:** `lib/mm/water.ts` (entries, today's total, goal, add/undo, tidying; 2 weeks kept, 600 entries at most; the bottle maths `mlToLevel`, `levelToMl`, `stepMl`, `parseWaterAmount`), `waterStore`
    (`mm.v1.water`, `addWaterEntry`, `undoWaterEntry` in `lib/mm/stores.ts`), `app/app/_components/WaterCard.tsx`, `AddWaterSheet.tsx`, `WaterBottle.tsx`, `DropIcon`, `dailyWater` in the settings (checked when
    read back), "Clear data on this device" also removes it (and its sentence says "water you added"), `SyncEngine` takes `localStores` (reset for a different person).
  - **New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator, not yet by native speakers):** "Water", "Glass", "Bottle", "{ml} of {goal} ml of water
    today", "Undo the last water you added", "Water (ml)", "Your goal for the day on Home. Left empty it is 2,000 ml.", "Water should be between 250 and 6,000 ml."; the two "Clear data" sentences now
    read "... saved orders, log, water you added, favourites ..."; for the sheet: "Add water", "Drag the water up, or type how much you had.", "Amount (ml)", "Add {n} ml", "Water to add", "{n} ml". "Type an
    amount from {min} to {max}." already existed (Add food). No longer used: "Add" as the word before a Glass or Bottle button.
  - Checked: `tests/water.test.ts` (23: entries read back, today across midnight, undo, pruning, the goal, the setting, not synced, the bottle's level, snapping, steps and typed amounts),
    `tests/syncEngine.test.ts` (a different person's water is cleared, never uploaded), `e2e/water.mjs` (13 steps: under Dinner with its own h2, a small bottle and a round +, the + opens Add water, adding
    is on top and the card doesn't jump, dragging with the mouse and a tap, above the top and below the bottom, the keyboard, typing moves the bottle, the amount checks, the shortcuts, Escape and Close add
    nothing, Undo, yesterday not counted, over the goal, the Settings goal and its checks, Clear data, no request mentions water, the paywall on the Pro-on build, 360 px / Extra large text / Arabic with
    the sheet open, axe 0 on Home, the sheet and Settings), tsc, lint; screenshots at 390 px, Extra large text and Arabic.

- 2026-10-16 — **Home's round button at the top right is Settings** (founder, on the Home screenshot with the calendar button circled: "Change this icon to a settings icon instead please. You can access the
  current settings from there"). The round grey button next to "Home" was a calendar that opened Today's meals; it is now our gear icon (the tab bar's) and opens **Settings** (`/app/settings`), same 44 px tap
  area and small grey circle, named "Settings" for screen readers. Today's meals is still one tap away from each Breakfast, Lunch and Dinner row's title. `CalendarIcon` is gone (nothing else used it).
  **No new copy** ("Settings" already existed and is translated). Checked: `e2e/extra.mjs` (new last step: the header link is named Settings, goes to `/app/settings`, is 44 px or more, opens the Settings
  heading, and there is no header link to Today's meals).

- 2026-10-16 — **Fixes from the independent review of the share link, Add food and water work** (two reviewers, each finding checked; all confirmed ones fixed):
  - **Share link, privacy:** a first-time visitor who opened a shared link was sent to `/app/welcome?next=…` with the list's code **inside the query**, which reaches the server. The code now stays in the
    fragment: the query holds only the page (`?next=/app/groceries/list/shared`) and the code rides after the welcome page's own `#` (`app/app/layout.tsx` inline script, `AppShell.tsx`,
    `welcome/page.tsx` `afterOnboarding`). `e2e/sharelist.mjs` now fails if the code appears in any request's path or query. (After a round trip through Apple or Google sign-in from the welcome
    screen the code is not carried back: the friend taps the link again.)
  - **Share link, smaller:** a shops' lists that couldn't be fetched now show "Couldn't open this list. Check your connection." with Try again, not "no longer in the shops' lists"; "Added to your
    shopping list." belongs to the list that was added (a different link opened in the same page starts as not added); pasting a whole message takes the **link**'s code (the last link), and without
    a link the last `#code`, so a hashtag in an item's name can't be taken for it (tests); typed items keep the joiners Persian, Urdu and Indic words need (U+200C, U+200D; the zero-width space still goes);
    a shop taken down in `hidden.json` shows none of its pictures on the shared page either.
  - **Swift (not compiled here, the Mac session builds it):** `SharedListLink.swift` imports `Observation` (it uses `@Observable`); `WebAppView.updateUIView` marks a link request as handled before it
    decides whether to load it, so a link the page was already showing can't load later after the person has moved on.
  - **Water, settings sync:** a target the person empties (water goal, protein, carbs, fat, the shops or the recipe fit) is left out of what a device sends, so another device kept its old copy and sent it
    back; a device that takes the account's settings now lets go of those too (`OPTIONAL_SYNCED_KEYS` in `lib/mm/syncStores.ts`, test in `tests/syncEngine.test.ts`).
  - **Add food test:** its "no toast" check now looks for an "Added …" status only (Home now has a water status line too).

- 2026-10-16 — **Recipe cards show carbs and fat too** (founder, on a "Picked for you" card: "Add the fats and carbs to each of the recipes also"). Every recipe tile (Recipes, "Picked for
  you", My meals, onboarding's first-recipe choice) now has four grey chips: calories and protein first, then carbs and fat, each the per-serving figure the recipe page shows (summed from the
  shop's own labels, rounded to whole grams). They wrap onto a second line on a phone's two-column grid (and one a line in Arabic); no sideways overflow at 360/390 px, Extra large text or Arabic.
  **No new copy** ("carbs" and "fat" already existed and are translated). Checked: `e2e/recipes.mjs` 14 (new: all 24 first cards show kcal, protein, carbs and fat), eslint; screenshots at 390 px, 360 px,
  Extra large text and Arabic.

- 2026-10-16 — **Home shows the date, a calendar, and any day's macros and meals** (founder: "Instead of home have the date for example Nov 15, the month in short form ... have this logo on
  the right of it. When the person clicks on that they can find any day and click on it and see their macros and what they ate on that day"; earlier: "when they click the number at the top it shows what
  they got on that day").
  - **Header:** Home's title is today's short date, month first in English (**"Oct 16"**; other languages use their own short form through the browser's date formatting), still named "Home" for screen readers
    ("Home, Oct 16"). The round **calendar button** sits beside it (named "Choose a day"); the Settings gear stays at the far right.
  - **Calendar sheet** (`_components/DayPicker.tsx`, pure helpers in `lib/mm/day.ts`, 14 unit tests): a month at a time, Monday first like the week strip, back twelve months and forward only to this month; today is the
    lime circle, a small dot marks every day with something logged, the days ahead are greyed and can't be tapped. Each day is a button named like the week strip's ("Friday 16 October (today)", "...: food logged").
  - **The week strip's circles** are now links too: every day up to today opens that day (the link reaches into the gap so a narrow phone still gets a full-size tap target); the days ahead stay inert.
  - **The day page is the Today page made date-aware** (`/app/today?d=YYYY-MM-DD`, a static shell like `/app/chain?id=`; a missing, bad or future date is today; any earlier real date is allowed): that day's calories dial and
    protein, carbs and fat rows, then Breakfast / Lunch / Dinner with every entry (name, time, figures, the chain's photo), **Previous day / Next day** (Next day is greyed on today; they stack at large text) and a **Today**
    shortcut. An empty day shows Pip with "Nothing was logged on this day.". Delete with Undo works on any day. Totals are measured against the person's **current** targets (the app keeps no target history), said under the
    card on a past day. The service worker serves the day page offline from the same cached shell (`/app/today` joined its query shells). No adding food to a past day in this version (Home's + is for today).
  - **History limit to know:** a day's meals are whatever is on this phone (the log is kept locally with no cut-off), but **sync only carries the last 2 days** (`SYNC_WINDOW_MS.log`), so a second device or a reinstall has only recent
    days. Widening that window (say to 90 days) is a one-line code change (about 300 bytes an entry against the 1 MB per-store cap, no migration); not done unasked.
  - **New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator, not yet by native speakers):** "Choose a day", "Previous month", "Next month", "Previous day", "Next day", "Today",
    "Nothing was logged on this day.", "These totals use your current targets.". Checked: `e2e/days.mjs` 9 (header, calendar, picking a day, the week circles, flipping days, bad dates, delete and Undo on a past day, empty log, 360 px /
    Extra large / Arabic, axe 0 with the sheet open), 818 unit tests, tsc, eslint; screenshots at 390 px, Extra large text and Arabic.

- 2026-10-16 — **Recipe cards: calories in the picture's corner, protein, carbs and fat under the name** (founder, on a card with "DINNER" circled: "Instead have calories where the red is here. Then below the
  title the protein fats and carbs. That should be enough space for everything now"). Every recipe card (Recipes, "Picked for you", My meals, onboarding's first-recipe choice) now shows the calories as a white pill
  in the picture's top-left corner (where the meal's label was; opposite the heart, mirrored in Arabic and Urdu) and **protein, carbs and fat** as three grey chips under the name (the app's usual order, as on Home).
  The meal's label ("DINNER") is gone from cards (the meal is still on the recipe page, in the meal tiles and in "Picked for you"'s heading); the "AI illustration" caption moved to the picture's bottom-left.
  In the markup the calories pill follows the name, so a screen reader hears "name, calories, protein ..." even though it is drawn over the picture. Where three chips don't fit on one line (a two-column phone grid) fat wraps
  to a second line; at Extra large text and in Arabic the chips stack, no sideways overflow at 360/390 px. **No new copy.** Checked: `e2e/recipes.mjs` 14 (incl. axe), tsc, eslint; screenshots at 390 px, 360 px, Extra large and Arabic.
  **Why the founder's phone still showed calories and protein only:** the carbs-and-fat chips were already live on numbite.com; the installed iPhone app carries its own packed copy of the website and shows screen changes only after it is rebuilt on the Mac (docs/APP_BUILD.md).

## Known issues

- Web: no nearby chains and no Apple Health (by design, see WEB_BUILD_PLAN.md); payments not wired.
- Web offline: item/chain pages work offline after one online visit (the service worker precaches the shells and the menus are cached on first load); the first visit needs a connection.
- `docs/BUILD_PLAN.md` M0–M10 (native iPhone app) are untouched and still planned.

## Founder to-do (things Claude can't do)

- [x] **Decide: should logging meals be free?** No, it stays Pro (2026-10-11).
- [x] ~~Before launch: switch off `ALL_FREE_FOR_TESTING`~~ replaced 2026-10-12: the free launch ships with Pro off (`PRO_ENABLED`); turn Pro on in a later update with payments
- [ ] **Sign-in and sync (live; real tests still to do): the founder's remaining steps are in docs/ACCOUNTS_SYNC.md "Founder steps" 1, 5 and 6**: check the Google secret, test a real sign-in on the website and the iPhone (the Sign in with Apple capability is already added: `Config/MenuMacros.entitlements`), confirm the App Privacy answers
- [ ] **Shared shopping lists need two Xcode settings and one Vercel variable** (docs/APP_BUILD.md "Shared shopping lists": Associated Domains `applinks:numbite.com`, URL Type `numbite`, `NEXT_PUBLIC_APP_STORE_URL` once the App Store page exists), then try a shared list on a real iPhone
- [ ] **Free App Store launch: follow docs/APP_BUILD.md "Steps for the founder"** (numbite.com live and Vercel Pro since 2026-10-12; next a support@numbite.com forwarding address, read the legal pages, UK trade mark search for "Numbite", App Store Connect record, privacy and age rating, archive, TestFlight, submit) and run the Mac session's checks first
- [ ] **Decide which supermarkets go into the App Store version** (`web/app-content.json`; all nine until you say; the six whose terms restrict copying: Tesco, Waitrose, Morrisons, Iceland, Aldi, M&S). Food photos: decided 2026-10-12, all in ("yes i want all the food photos there")
- [ ] **Approve the App Store copy** in docs/STORE.md (name, subtitle, keywords, description, review notes: drafts)
- [ ] **Translations: have a native speaker check each language before launch** (they were made by AI): at least the allergen names, "contains"/"may contain",
  cooking-safety lines and the onboarding. Each language is one file, `web/lib/mm/locales/<code>.json` (English → translation); a reviewer can edit it directly.
- [ ] **Recipe pictures (Nano Banana):** paste each prompt from `docs/RECIPE_IMAGE_PROMPTS.md`, check the picture has no writing, packaging or logos, save it as
  `data/recipe-images/<recipe id>.png`, then run `python3 tools/recipes/import_recipe_images.py` (or send me the files and I'll do it)
- [ ] **Later, after launch: switch on Pip's recipe maker (AI recipes)** (off for the free launch: set `AI_RECIPES_ENABLED` back to true in `web/lib/mm/config.ts` and update the privacy page and App Privacy answers first): create an API key at console.anthropic.com › API Keys, set a monthly spend limit there (Settings › Limits; a recipe
  costs roughly a few pence), then add it in Vercel › Project menumacros › Settings › Environment Variables as `ANTHROPIC_API_KEY` (Production and Preview) and redeploy.
  Until then Recipes work as normal and "Ask Pip" says it isn't switched on yet (the button is hidden on the live site). Never paste the key into chat or the app.

- [ ] Real bundle ID prefix, Team, App Group ID in Xcode signing and `AppConfig.swift`
- [ ] Xcode: iPhone-only destination, iOS 17.0 minimum, capabilities (App Groups, HealthKit, In-App Purchase), shared scheme
- [ ] App Store Connect: app record (free launch: docs/APP_BUILD.md); the subscription group, products and trial come with Pro in a later update
- [ ] Vercel + Supabase set up (docs/SETUP_VERCEL_SUPABASE.md) → put the URLs in `AppConfig`
- [x] Supabase secret key added to Vercel (Production + Preview). Never paste it into chat or the app
- [ ] Delete the test row "mcdonalds" in Supabase › chain_requests if you don't want it (or leave it: it's a valid request)
- [ ] Payments for the web app (Stripe or RevenueCat Web Billing: both add a dependency/account; needs your decision)
- [x] numbite.com bought and live, Vercel Pro (2026-10-12); still: a support@numbite.com address (forwarding)
- [ ] Read the live /privacy and /terms pages and confirm every statement is true
- [x] Real chain data in `data/source/`: 72 UK chains (about 12,900 items) extracted from official sources (see docs/UK_DATA_STATUS.md, which lists what needs your decision); keep the two sample folders; release builds use `--no-samples`. 150 was not possible: only 62 of 210 candidates publish full official macros, and 25 more need a file from you
- [x] App icon: plate and fork with a bite (founder's pick, 2026-10-12, `web/design/icon.svg`). Store screenshots: `web/e2e/store-shots.mjs`
- [ ] Support email is a personal address for now: later create a domain address (e.g. support@yourdomain) and change `NEXT_PUBLIC_SUPPORT_EMAIL` in Vercel, then redeploy
- [ ] Read /privacy and /terms again: they now also describe the web app (browser storage, offline cache, Pro waitlist)
- [ ] **UK data:** download the official UK nutrition guide for McDonald's, Domino's, Papa Johns and Costa (and Pizza Hut's delivery guide) from your own connection and send me the files; see docs/UK_DATA_STATUS.md
- [ ] **Supermarket logo: Co-op** blocked us; save it from its own site in your browser (`data/chrome-inbox/QUEUE-LOGOS.md`). Tesco's was installed on 2026-10-14 from tescoplc.com
- [ ] **Logos (5 of 238 missing, checked 2026-10-15; McDonald's added 15 October):** Bettys, Fuller's, Kick Ass Burrito (delivery-only, no website of its own), Tesco Café, Wild Bean Café (their sites block us, or the only file is too padded to read; list in `data/chrome-inbox/QUEUE-LOGOS.md`). To add one, save the logo from the chain's own website in your browser (right-click the header logo → Save Image) and send it to me
- [x] **Decide: Kick Ass Burrito**: publish (2026-10-11), now live.
- [x] **Decide: Waterfields**: publish the products whose own figures agree (2026-10-12); live, 15 products
- [ ] **Decide: YO! To Go** (the Yo! Sushi counters inside Tesco) is listed as its own chain because its menu and outlets differ; say if it should be folded into Yo! Sushi
- [ ] **Logo: Grounded Kitchen** (its logo host answers 403 to robots.txt): save it from groundedkitchen.com in your browser and send it to me
- [ ] **Need your own browser:** Wingstop UK (ordering script answers 403) and Pesto (Cloudflare challenge); Gravity MAX waits on decision (d) below
- [ ] Confirm the open data calls in docs/UK_DATA_STATUS.md (Starbucks default milks, Taco Bell's table hosted by Nutritionix, Subway sauces note, Pret from product pages)
- [ ] Decide the £ price points and whether the target helper should offer kg / stone / cm
- [ ] Approve the copy changes flagged above (§12.3 wording, App Store text, the pork/beef filter wording)
- [ ] Decide whether to promote the newest build to Production (it is only on Previews, behind Vercel login)
- [ ] **Grocery crawl decisions:** (1) Tesco: approve crawling in the permission system (Shift+Tab out of auto mode, or an allow rule for tab creation) or tell me to skip it; (2) Co-op and Iceland: turn on a UK VPN and tell me; (3) Ocado: say whether the quarantined data may be used or should be deleted; (4) which store lists may be published given each shop's terms (decided 2026-10-11: all nine with a list are live; Co-op blocked, Ocado quarantined); (5) whether to build the "browse every product" layer and read product pages for nutrition
- [x] **Tesco photos:** yes, your accepted risk (2026-10-11). Tesco's image server refuses the cloud environment, so more Tesco photos come from the Chrome run on your Mac (docs/NEXT_GROCERIES_IMAGES_PROMPT.md)
- [ ] **Food images, your decision per chain:** the photo feature is built and works (checked with real KFC, Subway and Nando's photos), but the terms of **every chain checked (11 of 11: KFC, Subway, Nando's, Pret, Greggs, Five Guys, Pizza Express, Prezzo, Wagamama, Pizza Hut, Starbucks) say images/content may not be copied or reused without written permission or a licence** (exact quotes: `docs/IMAGE_TERMS.md`). You told me you'd checked you may use them, so I built it, but I haven't installed any photos until you confirm for chains whose terms say this. Options: (1) tell me "install them" for all or named chains (your legal risk; I keep the sources + `images.csv`, and delete a chain's photos the day it asks); (2) email the chains for written permission (the prepared photo sets for Pizza Hut, Starbucks, KFC, Subway, Nando's, Pret, Greggs and Five Guys are kept ready and install in one step); (3) leave photos out for now (cuisine icons stay)
- [ ] **Xcode preview shell:** follow docs/XCODE_PREVIEW_SHELL.md (Vercel Production Branch → create the Xcode project → ask Claude on the Mac to copy the files → Run on your iPhone)
- [ ] **Chains to send me files for (saved from your own browser):** McDonald's, Domino's, Papa Johns, Costa; Coffee Republic's PDF (`data/held-downloads/coffee-republic.pdf`); Sushi Shop's 177 product pages; Brewhouse & Kitchen's allergen matrix; Dave's Hot Chicken's two allergen PDFs; the Angus Steakhouse ifoodi page, John Lewis restaurants page, Betty's allergen page; Subway, Zizzi, Pizza Express, ASK, Coco di Mama, Ole & Steen, Starbucks and Burger King PDFs (held in `data/held-robots/`). Exact addresses: `docs/UK_DATA_STATUS.md` ("Blocked: needs a file from you")
- [ ] **Decide:** (a) The Salad Project, Thaikhun, Byron: ask the chains which figures are current, or say "publish the page figures" / "publish anyway"; (b) Honi Poke and Chiquito: keep or remove (both have thin or self-inconsistent data, notes explain); (c) Jollibee's drinks (March 2023 chart); (d) ~~robots.txt answering 403~~ decided 2026-10-12: read as no rules (RFC 9309), so the photo scripts for Sbarro, Amigos, Kokoro, Tortilla, Atis, The Alchemist, Honi Poke, The Breakfast Club and Buy & Bite may run; (e) Wetherspoon's terms clause and Boston Tea Party's vendor-hosted photos; (f) Norse Catering (school lunches): say "publish" if you want it
- [ ] **For more complete-nutrition chains, save from your own browser:** Dave's Hot Chicken's "Nutritional Guide April 2026" PDF (https://cdn.sanity.io/files/ysupxjc9/production/4197d7ab55a5f626cea8dacde450fd8788c28063.pdf/Nutritional-Guide-April-2026.pdf), one Hungry Horse pub report from smartchef.co.uk (it may print full macros), Atis's four guide PDFs and Smith & Western's PDF; and decide whether the 80 calories-only chains stay live
