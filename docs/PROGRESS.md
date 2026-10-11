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

## Known issues

- Web: no nearby chains and no Apple Health (by design, see WEB_BUILD_PLAN.md); payments not wired.
- Web offline: item/chain pages work offline after one online visit (the service worker precaches the shells and the menus are cached on first load); the first visit needs a connection.
- `docs/BUILD_PLAN.md` M0–M10 (native iPhone app) are untouched and still planned.

## Founder to-do (things Claude can't do)

- [x] **Decide: should logging meals be free?** No, it stays Pro (2026-10-11).
- [ ] **Before launch: switch off `ALL_FREE_FOR_TESTING`** in `web/lib/mm/config.ts` (every Pro feature is free while you test), then redeploy
- [ ] **Translations: have a native speaker check each language before launch** (they were made by AI): at least the allergen names, "contains"/"may contain",
  cooking-safety lines and the onboarding. Each language is one file, `web/lib/mm/locales/<code>.json` (English → translation); a reviewer can edit it directly.
- [ ] **Recipe pictures (Nano Banana):** paste each prompt from `docs/RECIPE_IMAGE_PROMPTS.md`, check the picture has no writing, packaging or logos, save it as
  `data/recipe-images/<recipe id>.png`, then run `python3 tools/recipes/import_recipe_images.py` (or send me the files and I'll do it)
- [ ] **Switch on Pip's recipe maker (AI recipes):** create an API key at console.anthropic.com › API Keys, set a monthly spend limit there (Settings › Limits; a recipe
  costs roughly a few pence), then add it in Vercel › Project menumacros › Settings › Environment Variables as `ANTHROPIC_API_KEY` (Production and Preview) and redeploy.
  Until then Recipes work as normal and "Ask Pip" says it isn't switched on yet (the button is hidden on the live site). Never paste the key into chat or the app.

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
- [ ] **Supermarket logos: Tesco and Co-op** blocked us; save each from its own site in your browser (`data/chrome-inbox/QUEUE-LOGOS.md`)
- [ ] **Logos (11 of 220 missing):** Atis, Bettys, Buy & Bite, Costa, Domino's, Fuller's, Honi Poke, Kokoro, McDonald's, Tesco Café, Wild Bean Café (their sites block us, disallow robots, or serve no logo file we may use; list in `data/chrome-inbox/QUEUE-LOGOS.md`). To add one, save the logo from the chain's own website in your browser (right-click the header logo → Save Image) and send it to me
- [x] **Decide: Kick Ass Burrito**: publish (2026-10-11), now live.
- [ ] Confirm the open data calls in docs/UK_DATA_STATUS.md (Starbucks default milks, Taco Bell's table hosted by Nutritionix, Subway sauces note, Pret from product pages)
- [ ] Decide the £ price points and whether the target helper should offer kg / stone / cm
- [ ] Approve the copy changes flagged above (§12.3 wording, App Store text, the pork/beef filter wording)
- [ ] Decide whether to promote the newest build to Production (it is only on Previews, behind Vercel login)
- [ ] **Grocery crawl decisions:** (1) Tesco: approve crawling in the permission system (Shift+Tab out of auto mode, or an allow rule for tab creation) or tell me to skip it; (2) Co-op and Iceland: turn on a UK VPN and tell me; (3) Ocado: say whether the quarantined data may be used or should be deleted; (4) which store lists may be published given each shop's terms (decided 2026-10-11: all nine with a list are live; Co-op blocked, Ocado quarantined); (5) whether to build the "browse every product" layer and read product pages for nutrition
- [x] **Tesco photos:** yes, your accepted risk (2026-10-11). Tesco's image server refuses the cloud environment, so more Tesco photos come from the Chrome run on your Mac (docs/NEXT_GROCERIES_IMAGES_PROMPT.md)
- [ ] **Food images, your decision per chain:** the photo feature is built and works (checked with real KFC, Subway and Nando's photos), but the terms of **every chain checked (11 of 11: KFC, Subway, Nando's, Pret, Greggs, Five Guys, Pizza Express, Prezzo, Wagamama, Pizza Hut, Starbucks) say images/content may not be copied or reused without written permission or a licence** (exact quotes: `docs/IMAGE_TERMS.md`). You told me you'd checked you may use them, so I built it, but I haven't installed any photos until you confirm for chains whose terms say this. Options: (1) tell me "install them" for all or named chains (your legal risk; I keep the sources + `images.csv`, and delete a chain's photos the day it asks); (2) email the chains for written permission (the prepared photo sets for Pizza Hut, Starbucks, KFC, Subway, Nando's, Pret, Greggs and Five Guys are kept ready and install in one step); (3) leave photos out for now (cuisine icons stay)
- [ ] **Xcode preview shell:** follow docs/XCODE_PREVIEW_SHELL.md (Vercel Production Branch → create the Xcode project → ask Claude on the Mac to copy the files → Run on your iPhone)
- [ ] **Chains to send me files for (saved from your own browser):** McDonald's, Domino's, Papa Johns, Costa; Coffee Republic's PDF (`data/held-downloads/coffee-republic.pdf`); Sushi Shop's 177 product pages; Brewhouse & Kitchen's allergen matrix; Dave's Hot Chicken's two allergen PDFs; the Angus Steakhouse ifoodi page, John Lewis restaurants page, Betty's allergen page; Subway, Zizzi, Pizza Express, ASK, Coco di Mama, Ole & Steen, Starbucks and Burger King PDFs (held in `data/held-robots/`). Exact addresses: `docs/UK_DATA_STATUS.md` ("Blocked: needs a file from you")
- [ ] **Decide:** (a) The Salad Project, Thaikhun, Byron: ask the chains which figures are current, or say "publish the page figures" / "publish anyway"; (b) Honi Poke and Chiquito: keep or remove (both have thin or self-inconsistent data, notes explain); (c) Jollibee's drinks (March 2023 chart); (d) whether a 403 on an image host's robots.txt may be read as "no rules" (RFC 9309 says yes; I stopped instead) for the photos of Sbarro, Amigos, Kokoro, Tortilla, Atis, The Alchemist, Honi Poke, The Breakfast Club and Buy & Bite (scripts ready); (e) Wetherspoon's terms clause and Boston Tea Party's vendor-hosted photos; (f) Norse Catering (school lunches): say "publish" if you want it
- [ ] **For more complete-nutrition chains, save from your own browser:** Dave's Hot Chicken's "Nutritional Guide April 2026" PDF (https://cdn.sanity.io/files/ysupxjc9/production/4197d7ab55a5f626cea8dacde450fd8788c28063.pdf/Nutritional-Guide-April-2026.pdf), one Hungry Horse pub report from smartchef.co.uk (it may print full macros), Atis's four guide PDFs and Smith & Western's PDF; and decide whether the 80 calories-only chains stay live
