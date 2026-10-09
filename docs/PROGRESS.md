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
| M0 Project foundation | in progress | Xcode project + four-tab shell + AppConfig + icon + 2 tests created 2026-10-08, unit tests pass; still to do: PreviewContent dev assets, bundled menus, Xcode-only capability clicks (see decisions log) |
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
  **Tesco and Iceland:** not crawled (Tesco needs the founder's approval in the permission system; Iceland and Co-op need a UK VPN). **These lists have no barcodes or
  nutrition**, so none of them is in the app yet; the next steps are a "browse every product" layer for shop-only products and Tier-2 product-page reads for nutrition (the
  founder to say). Terms caveat per shop (docs/IMAGE_TERMS.md and each `*_terms.txt`): Tesco bans bots/AI tools, M&S bans crawling and commercial use (hold, do not publish),
  Waitrose and Morrisons restrict reproducing/storing content; Sainsbury's, Asda, Aldi, Lidl have no relevant clause found. Nothing from these lists is published (they live in `data/`, not `web/public`).

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
- [ ] **Logos (26 missing):** the 19 below plus Vue, Tesco Café, Hungry Horse, Amigos, Kokoro, Giraffe, Wild Bean Café. The first list: their sites block automated visits. To add one, save the logo from the chain's own website in your browser (right-click the header logo → Save Image) and send it to me: KFC, Nando's, Pizza Hut, Subway, Premier Inn, GBK, Coffee #1, Jamie's Italian, and the M&B pubs (All Bar One, Browns, Ember Inns, Harvester, Miller & Carter, Nicholson's, O'Neill's, Sizzling Pubs, Stonehouse, Toby Carvery, Vintage Inns)
- [ ] Confirm the open data calls in docs/UK_DATA_STATUS.md (Starbucks default milks, Taco Bell's table hosted by Nutritionix, Subway sauces note, Pret from product pages)
- [ ] Decide the £ price points and whether the target helper should offer kg / stone / cm
- [ ] Approve the copy changes flagged above (§12.3 wording, App Store text, the pork/beef filter wording)
- [ ] Decide whether to promote the newest build to Production (it is only on Previews, behind Vercel login)
- [ ] **Grocery crawl decisions:** (1) Tesco: approve crawling in the permission system (Shift+Tab out of auto mode, or an allow rule for tab creation) or tell me to skip it; (2) Co-op and Iceland: turn on a UK VPN and tell me; (3) Ocado: say whether the quarantined data may be used or should be deleted; (4) which store lists may be published given each shop's terms (M&S: hold); (5) whether to build the "browse every product" layer and read product pages for nutrition
- [ ] **Tesco photos and the Tesco terms:** its image host answers 403 to robots.txt and its terms prohibit AI tools / bots extracting data (quoted in docs/IMAGE_TERMS.md). Tell me whether to (a) keep prices only, (b) also install Tesco photos (a one-line allow for that host, your accepted risk), or (c) pause Tesco collection
- [ ] **Food images, your decision per chain:** the photo feature is built and works (checked with real KFC, Subway and Nando's photos), but the terms of **every chain checked (11 of 11: KFC, Subway, Nando's, Pret, Greggs, Five Guys, Pizza Express, Prezzo, Wagamama, Pizza Hut, Starbucks) say images/content may not be copied or reused without written permission or a licence** (exact quotes: `docs/IMAGE_TERMS.md`). You told me you'd checked you may use them, so I built it, but I haven't installed any photos until you confirm for chains whose terms say this. Options: (1) tell me "install them" for all or named chains (your legal risk; I keep the sources + `images.csv`, and delete a chain's photos the day it asks); (2) email the chains for written permission (the prepared photo sets for Pizza Hut, Starbucks, KFC, Subway, Nando's, Pret, Greggs and Five Guys are kept ready and install in one step); (3) leave photos out for now (cuisine icons stay)
- [ ] **Xcode preview shell:** follow docs/XCODE_PREVIEW_SHELL.md (Vercel Production Branch → create the Xcode project → ask Claude on the Mac to copy the files → Run on your iPhone)
- [ ] **Chains to send me files for (saved from your own browser):** McDonald's, Domino's, Papa Johns, Costa; Coffee Republic's PDF (`data/held-downloads/coffee-republic.pdf`); Sushi Shop's 177 product pages; Brewhouse & Kitchen's allergen matrix; Dave's Hot Chicken's two allergen PDFs; the Angus Steakhouse ifoodi page, John Lewis restaurants page, Betty's allergen page; Subway, Zizzi, Pizza Express, ASK, Coco di Mama, Ole & Steen, Starbucks and Burger King PDFs (held in `data/held-robots/`). Exact addresses: `docs/UK_DATA_STATUS.md` ("Blocked: needs a file from you")
- [ ] **Decide:** (a) The Salad Project, Thaikhun, Byron: ask the chains which figures are current, or say "publish the page figures" / "publish anyway"; (b) Honi Poke and Chiquito: keep or remove (both have thin or self-inconsistent data, notes explain); (c) Jollibee's drinks (March 2023 chart); (d) whether a 403 on an image host's robots.txt may be read as "no rules" (RFC 9309 says yes; I stopped instead) for Sbarro, Amigos, Kokoro, Tortilla photos; (e) Wetherspoon's terms clause and Boston Tea Party's vendor-hosted photos; (f) Norse Catering (school lunches): say "publish" if you want it
- [ ] **For more complete-nutrition chains, save from your own browser:** Dave's Hot Chicken's "Nutritional Guide April 2026" PDF (https://cdn.sanity.io/files/ysupxjc9/production/4197d7ab55a5f626cea8dacde450fd8788c28063.pdf/Nutritional-Guide-April-2026.pdf), one Hungry Horse pub report from smartchef.co.uk (it may print full macros), Atis's four guide PDFs and Smith & Western's PDF; and decide whether the 80 calories-only chains stay live
