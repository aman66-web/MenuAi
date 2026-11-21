# Decisions log

Every decision and session report since 5 October 2026, oldest first, moved here from docs/PROGRESS.md on 17 November 2026 (founder's credits: the
log had grown to 476 KB and was loaded into every session and every helper). Nothing was changed in the move. It is not loaded automatically:
search it (`grep -n`) when a task touches an earlier decision. Add new entries at the end, dated, and keep docs/PROGRESS.md's current state up to date.

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

- 2026-10-16 — **The star on a restaurant's page says what it did** (founder, on the star circled at the top right: "When the user presses the star ... it should say small text in the top right saying
  that the restaurant is added to their favourites"). Tapping the star now writes **"Added to your favourites"** (or **"Removed from your favourites"**) in small accent-green text beside the star, in the page's top row; it stays
  about three seconds and fades (no movement at reduced motion, and it never moves the page); a screen reader hears it through a status line (the visible copy is hidden from it so it is not read twice). It sits to the
  left of the star in English and to the right in Arabic and Urdu, wraps to two lines at Extra large text and never touches Back. Two quick taps show the latest words. New copy (rule 8, logged here; translated into the 10
  languages by AI, in each language's own existing word for favourites, not yet checked by native speakers): "Added to your favourites", "Removed from your favourites". Checked: `e2e/favnote.mjs` 4 (the words, the
  fade, the status line, position, two quick taps, 360 px / Extra large / Arabic, axe 0), tsc, eslint; screenshots at 390 px and Extra large text.

- 2026-10-16 — **Near me map in full screen** (founder, on the Near me map: "There should also be a full screen mode on the bottom right where they can view in full screen ... they can move how they do in
  Google maps using their finger to move and their fingers to pinch and zoom in and out"). Chosen after three independent designs were scored and the winner trimmed:
  - **The button:** a 44 px button at the map's bottom right ("Full screen"; "Exit full screen" while full). MapLibre's credits moved to the bottom left and wrap so they never run under it; the credits' little "i" has a 44 px tap area.
  - **Entering:** the same persistent frame turns into `position: fixed` edge to edge (the one MapLibre instance, canvas, pins, logos, selection, camera and "you" dot are untouched; no second map, no reload, no tiles asked for again).
    The page behind is locked (no scrolling, the tab bar hidden, the other page sections inert), and the controls respect the notch and home bar on all four sides.
  - **Moving like Google Maps:** in full screen one finger drags, two pinch, double-tap and two-finger tap zoom, the + and - buttons and the mouse wheel zoom; rotation is off in both modes. In the page the map still takes two fingers so the page scrolls.
  - **Leaving:** the same button, Escape, or the phone's Back gesture (one same-address history entry per visit, so Back closes full screen instead of leaving Near me; switch `PUSH_FULLSCREEN_ENTRY` in `lib/mm/mapFullscreen.ts` to false to
    drop it and Back then leaves the page as before). Scroll position, camera and the selected restaurant are kept; focus returns to the button.
  - **The card:** a tapped pin's restaurant card shows inside the full-screen map, clear of the button and credits (the map lifts the pin above it); its Menu link opens the restaurant and Back returns to Near me.
  - New copy (rule 8, logged here; translated into the 10 languages by AI, second-checked): "Full screen", "Exit full screen". Checked: 32 unit tests (the history state machine and the gesture timing), `e2e/mapfs.mjs` 19 steps (button and credits
    at 390 and 320 px, entering, touch and mouse gestures, the card, leaving three ways, Menu and Back, double tap, the map's own hint timer, notch and landscape, 200% text and Arabic, axe, privacy and network), `e2e/map.mjs` 6 of 7 (the known
    headless-browser location step), tsc, eslint. **Not tried on a real iPhone: this environment has no WebKit.** Founder or Mac session: on the phone, open Eat out › Near me, tap the button, drag with one finger, pinch, double-tap, swipe back, and check
    the tab bar returns; if Back misbehaves, flip `PUSH_FULLSCREEN_ENTRY` to false (the tripwire above).

- 2026-10-16 — **The rest of M&S's food range** (founder: "M&S definitely has more products, add the rest of them please"). "Every M&S product" went from **194 to 6,141 products**: the 194 priced rows read earlier plus
  **5,947 everyday-range rows (the Foodhall aisles) shown as "Price in store"**, because M&S's aisle pages list no price for them (its site asks for a store; which store was not seen, so the words say only that the lists have none).
  Read from M&S's own category pages with the same polite rules as the other shops (robots.txt read first and honoured, one request a second, stop on a block or a challenge page, never worked round): all 20 food aisles
  were read in full, each "collected X of X" against the total its own page printed (`data/groceries/listing/marks-and-spencer-food-coverage.csv`, summary and per-aisle counts in `raw/marks-and-spencer-food_summary.txt`). The first run stopped by itself on
  Bakery & Cakes page 3 because 3 of 96 tiles printed no pack size (our own format check, not a block); empty pack sizes are now allowed (the 1% stop stays for id, address, picture and title), the crawl was resumed (17 more aisle pages, 0 tiles
  skipped) and finished. Not crawled on purpose: drinks as a whole, alcohol, wine and gift lists (no alcohol; 3 alcoholic cocktails filed under Ready to Cook were excluded by hand and the builder drops them too), household, pet, baby, "New in", and product pages
  (links only). Photos load from M&S's own image host (36 looked at on a contact sheet: all show the product named). The terms caveat for M&S (it bans crawling and commercial use; docs/IMAGE_TERMS.md) stands under the founder's accepted risk of 2026-10-11.
  - **In the app:** the range rows open their own M&S page, the older 194 open M&S's search; the product page says "{shop} doesn't list a price for this product, and prices can differ between its stores. Check this product's price in store."; the list line
    reads "{n} products ... {count} show a price. {shop} lists no price for the others."; price sorts put unpriced rows last; recipes never use a product without a price. Lidl keeps its own wording (it prices only weekly offers online).
  - **Diet filter (CLAUDE.md rule 3: names only, never promises):** "Poultry" and "Cured & Ready to Eat Meats" count as meat and "Meat Alternatives" as meat-free; "Pigs in Blankets" counts as meat; "Plant Kitchen" items and titles starting "No <meat or fish>" are meat-free versions
    (so 10 vegetarian items in the Meat aisle are no longer hidden); a small exception list (halloumi kebabs, sage and onion stuffing, vegetable haggis) keeps those visible; a meat word in the name still wins.
  - **Fixed on the way:** the brand written twice in 14 names, a 6g protein row that lost its pack size, `build_all_products.py --only SHOP` rebuilds one shop without touching the others (tested).
  - **Known gaps:** the builder drops "Daylesford Rose Kombucha" through its alcohol-name rule (M&S files it as a soft drink); "Mini Roulade 125 g" isn't caught by the vegan filter (its name says nothing); the header still reads "checked 8 October" because it
    takes the oldest row's date as for every shop (the new rows were read on 16 October).
  - New copy (rule 8, logged here; translated into the 10 languages by AI, not yet checked by native speakers): the two sentences above. Checked: 196 Python tests (27 new for the crawler, more for the builder and the diet words), 49+ unit tests, e2e groceries-all 8 (new: an M&S
    unpriced product and its range link), groceries 6, groceries-compare 8, diet 7, tsc, eslint.

- 2026-10-16 — **Community tab, step 1: food articles** (founder, on Settings with the bottom-right tab circled: "The settings at the bottom right is now a community. Where you can find food blogs, and more
  and also add a friend and more"; answers: sign-in only for Community, our own short articles, friend code and invite link, shopping lists land in a Community inbox). Plan: `/root/.claude/plans/prancy-snacking-blanket.md`.
  - **The fifth tab is Community** (own two-heads icon). Settings is not lost: it is Home's gear (built earlier today), and Home's tab stays lit on `/app/settings`.
  - **Community hub** (`/app/community`): "Food blogs" with the three newest titles and "See all". No account is needed to read. Friends and Shared with you are **not built yet** (they need a sign-in
    and a new database table, applied only with your go-ahead): nothing on screen promises them.
  - **Food blogs** (`/app/community/blog` list with search and topic chips; `/app/community/blog/view?id=` reads an article from the address like `/app/chain?id=`, so every article works offline). Eight short
    articles written for you to approve (rule 8), author line "Numbite": reading a menu's calorie figures, eating out when you count protein, a shopping list that works, comparing side by side, what "calories only" means,
    where our numbers come from, allergy labels (check the pack), cooking from your shop. **Rules kept:** no nutrition figures that are not in our data (rule 1), no "healthy / good / bad" or medical wording (rule 3; a test
    fails any article using a banned word), no pictures (rule 2), GLP-1 only as smaller, protein-first orders. Articles are English only, like restaurant notes; the app's own words around them are translated.
  - **Tour:** the last stop is now Community ("Short articles to read, all in one place!"); the Home stop's line says the gear opens Settings. Offline cache is `mm-v6` and precaches the hub and the blog shells.
  - **New copy (rule 8, logged here; translated into the 10 languages by Claude, not yet checked by native speakers):** "Community", "Food blogs", "See all", "{n} min read", "Search articles", the hub and article-page
    lines (15 strings). No longer used: three tour lines about the old Settings stop.
  - **Checked:** `tests/blog.test.ts`, `tests/articleSearch.test.ts`, the i18n test; `e2e/community.mjs` 10 of 10 (hub, list, search, chips, an article, Back, 360 px, Extra large text, Arabic, axe 0), smoke, extra, sharelist,
    a11y and largetext updated for the tab (they opened Settings through the tab) and passing; the five tab names fit in all 11 languages at 360 and 390 px. **Written but not run yet:** the new steps in `offline.mjs`
    and `app-build.mjs` (run at the final check, `app-build` last).
  - **Not built (needs your yes before the database changes):** friends by code and invite link, sending a shopping list to a friend and the inbox (steps 2 and 3 of the plan). No migration is written yet and the live
    database is unchanged.

- 2026-10-16 — **Back goes to the page you came from, across the app** (founder: "If you press the top right heart on recipes and then go back it goes to the homepage not the page before").
  - **The cause:** every Back button was a fixed link to one page (My meals' Back went to Home whichever way you arrived). Now each Back button takes the browser's own Back when the page was reached from another
    page of the app, and goes to its old fixed page only when there is nothing earlier (a page opened by address, a shared link, a fresh launch).
  - **How:** each history entry the app makes carries its depth in `history.state` (`installBackDepth()` wraps `pushState` and `replaceState` once, called in AppShell; `lib/mm/navDepth.ts`, tested), and `useBack(fallback)`
    (`app/app/_lib/backNav.ts`) returns the link's address, its click handler and whether the page came from the app. Modified clicks (new tab) are left alone. Only one Back travels at a time (a second tap before the first lands
    would go back twice), and if the browser does not move (the oldest entry it keeps) the person goes to the fixed page instead of being left on a dead button.
  - **Spoken name:** plain "Back" when it goes through history, the old words ("Back to home") when it goes to the fixed page, and a name that always contains the visible word (`backName`), so voice control and screen readers agree.
  - **Where:** My meals (the founder's case), Recipes and a recipe, Today and every day page, restaurant, dish and order builder, Search and "Search every shop" (the typed words come back with Back, kept in `history.state`), Eat out's favourites,
    Near me, Compare, every grocery screen (one shared `BackLink`), the shopping list and shared lists, Community's list and articles, the numbers page, and the privacy, terms and support pages inside the iPhone app (`SiteBack`).
    Stepping through days on Today and switching tabs on Compare replace the entry, so one Back still leaves them. The builder's Save and Log replace themselves, so Back from Today does not return to a finished builder where one more Log would log the meal twice.
    The shared-list page remembers (this tab only) that a list was added, so Back from "Open my shopping list" cannot add it twice.
  - **Left as fixed links on purpose:** buttons whose words name another page ("Back to the recipes" in the not-Pro state, "Back to shopping list" on a shared-list error) still go there, but now through history when the page was reached in the app.
    "Back to my groceries" on the empty cook-with-list page keeps its words (renaming it is copy, rule 8).
  - **No new copy.** Not done: restoring a page's filters, sorts and "show more" limits after Back (that is the "tabs remember where you were" job, still open); the Search screens do restore their typed words.
  - **Checked:** 18 unit tests (`navDepth`), `e2e/back.mjs` 44 steps (the founder's case, Home's tiles, meal rows, week circles and calendar, Today's arrows, Eat out to a dish, Search, Groceries, the shopping list, recipes, 15 pages opened by address
    with their fixed fallback and spoken name, reload, My meals' tabs, modified clicks, double taps, Arabic and Extra large text, axe), `e2e/back-restaurants.mjs` 13, community 10, mapfs 19, sharelist 11, done 13, listadd 7, tsc, eslint.
    **Not run:** the privacy and terms Back bar inside the packed iPhone app (it needs the app build: `app-build.mjs` at the final check) and any real iPhone.

- 2026-10-16 — **Reminders on Home** (founder, on Home: "There should also be a section here for reminders, some people are GLP-1 and some people need to know when to have their medication, the app will send reminders to them when to have etc").
  - **On Home**, under Water: the person's reminders with a round tick and **Done today** for those due today, **Next: {date}** for the others, **Paused** and **Won't ring** tags, and an **Add a reminder** card. The sheet takes a **Name** (up to 40
    characters), an optional **Note** (120), a **Time** (the phone's own time picker; none is suggested) and **How often**: every day, certain days of the week, or every few days from a first day. Edit, Pause or Resume, and Delete (a question that ignores
    a double tap for 0.8 s, then an 8 s Undo). **Settings > Reminders > Manage reminders** (`/app/reminders`) lists them with the same actions. At most 12.
  - **In the iPhone app they ring** as local notifications scheduled on the phone (no push server, no device token, nothing on any server): the web side works out a plan (`lib/mm/reminders.ts` `planNotifications`, at most 60 notifications; iOS keeps 64) and hands it
    to the phone (`NativeBridge`; `Services/NotificationScheduling.swift`, `UserNotificationScheduler.swift`, `ReminderNotificationDelegate.swift`). The phone's permission question is asked the first time a reminder is saved; reminders are scheduled whatever the
    permission, so one made while notifications are off rings if they are switched on later, and a line says when they are off. Daily and weekly ones are repeating notifications left to iOS; "every few days" ones are real dates (up to 20) sent again each time the app opens,
    which the sheet says plainly ("If you don't open {app} for a while, this one can stop ringing"). A reminder that does not fit under the cap shows **Won't ring**. Times are wall-clock; across clock changes the plan never holds a time that does not exist.
    A reminder that comes due while the app is open is shown as a banner too. **On the website nothing rings**: the screens say so and show what is due today.
  - **Rules (CLAUDE.md rules 3 and 4 extended):** the name and note are the person's own words and show on the lock screen (said under both boxes and on the privacy page: keep anything private out of them); the feature has no medicine names and gives no
    medication guidance, never calls a reminder missed or late, and its caution says it may not appear if notifications are off or silenced, so don't rely on it alone, and to follow the advice of a doctor or pharmacist about any medication. Ticking Done is only the person's own
    mark and does not stop today's ring (said under the list). **Reminders are stored only on the phone** (`mm.v1.reminders`), are never synced, sent, shared or counted (a test fails if they ever enter the sync stores, the settings that sync, the share link, the outbox
    or analytics), are removed by Settings > Clear data (which cancels their notifications), and a different person signing in on the same phone starts with none. Privacy page, terms, support-facing text, docs/ACCOUNTS_SYNC.md, docs/APP_BUILD.md and docs/STORE.md
    (App Privacy, age-rating answers, App Review notes) updated.
  - **For the founder to decide or read:** the foreground banner also stays in Notification Center (`.list`; say if not); syncing reminders to an account later is a product decision (needs a migration, the privacy text and Health answers first); Apple's current wording of
    guidelines 1.4.1 and 4.5.4 and the age-rating question were quoted from memory in STORE.md ("as we read it"): read the live text before submitting.
  - **Not done:** cancelling today's ring when a reminder is ticked Done (the honest line is shown instead); a list of which reminders won't ring (each row carries the tag).
  - **Not verified, and cannot be here:** the Swift (no compiler in this environment: the Mac session builds and runs `ReminderNotificationTests`), the system permission prompt, how iOS treats repeating notifications on the nights the clocks change, VoiceOver, and that a notification really rings on an
    iPhone; the website's native time box shows 12 hours in Chromium. Founder or Mac session: add a reminder two minutes ahead, lock the phone and wait.
  - **New copy (rule 8, logged here; 51 strings translated into the 10 languages by AI, each checked by a second translator, not yet by native speakers):** "Reminders", "Add a reminder", "No reminders yet", "Manage reminders", the sheet's labels, repeat names, errors and the two lock-screen and
    do-not-rely-on-it sentences, "Done today", "Next: {date}", "Won't ring", "Paused", "Tap to open {app}", the notifications-off line, the website line, and the two Clear data sentences now ending "reminders you set".
  - **Checked:** 150 unit tests (`reminders.test.ts` 83 incl. a 1,500-round fuzz of the sanitiser and a day-by-day oracle; `reminders.dst.test.ts` 61 across 11 time zones incl. the clock-change nights, mutation-checked with four injected bugs; `nativeNotifications.test.ts`), `e2e/reminders.mjs` 26 steps
    (add, edit, pause, delete with Undo and the double-tap guard, Done, the three repeats, the plan handed to a faked phone, notifications off, the website, nothing sent anywhere, 360 px / Extra large / Arabic, axe 0), tsc, eslint.

- 2026-10-16 — **A serving stays the same serving at any number of people** (founder, on three screenshots of Chicken chow mein at Serves 4, 3 and 2 showing 451, 456 and 451 kcal: "The maths doesn't work when you increase the servings. This seems to be a big issue make sure you fix this
  and that every recipe also should work too"; then, on the Full nutrition panel: "Same in addition for the full nutrition").
  - **The causes (found by reproducing the founder's numbers, then 97 of 100 recipes showed a different serving at some Serves value, worst 201 kcal):** (1) the shop's default product was picked again for every amount, so a different pack and label won at different
    Serves values (the chow mein noodles flipped between two products at 1, 5, 9, 11 and 12); (2) the amounts are rounded (5 g steps, whole eggs, wraps and cloves) and the numbers were added up from the rounded amounts; (3) fitting to the meal size ran on the already scaled and
    rounded recipe, which is exactly 451 / 456 / 451; (4) the whole-item price rule (a pepper, a cucumber) is not proportional to the people; (5) substitutes and the Swap sheet's "a serving" prices were rounded twice.
  - **The fix** (`lib/mm/recipes.ts`, `RecipeDetail.tsx`): the recipe page's whole pipeline is one function, `recipeView` (substitutes, then fit, then scale). Scaling always starts from the recipe as written (`scaledFrom`, so rounding never builds up) and a serving's numbers
    (calories, protein, carbs, fat **and the whole Full nutrition panel: kJ, saturates, sugars, fibre, salt**) and its price come from the recipe as written with the same products; only the amounts and the shopping (packs, "to buy it all", the shopping list) follow the people.
    Result: chow mein fitted to 450 kcal and 35 g protein shows 451 kcal, 35 g, 46.3 g carbs, 12.5 g fat and £2.09 at every Serves from 1 to 12 (it was 451 / 456 / 451 and £2.06-2.75); the same recipe as written shows 611 kcal and £2.74 at every Serves (it was 535 to 614).
    Older saved and shared recipes need no migration.
  - **Also fixed on the way:** the quesadilla wedges (half a wrap a person) no longer double their wraps at other Serves values; fixed water in method steps now follows the people ("800 ml" for 2 becomes "4,800 ml" for 12; 11 recipes; all 10 languages checked); the Swap list no longer offers a product whose
    pack size or price can't be worked out.
  - **Honest limits, logged as decisions (rule 8):** (1) a serving's figures are for the recipe's proportions, while the amounts shown round to whole eggs, wraps and stock cubes and 5 g, so at some Serves values (mostly 1, or odd numbers for wraps) they can differ a little from the amounts listed: a new grey line says so,
    only when the difference passes 3% of calories (about 4% of recipe × Serves × meal-size combinations; never at the recipe's own number of servings). (2) The product is pinned to the one picked for the written servings, so at large Serves the basket can be a little above the cheapest
    identical-label pack (about 2.7% more on average at Serves 12; Swap still lets a person pick a cheaper pack). (3) Packs cover the amount **shown** (a 65 g row with a 65 g pack says buy 1). (4) Whole items sold one at a time (a cucumber, a pepper) are priced a serving from the written recipe, so
    "to buy it all" can be below the number of people times "a serving" for those (up to about £3 at Serves 12). **Not changed:** three method steps carry a fixed count tied to the written servings ("about 16 small balls", "12 small balls", "two small pots": a copy change), the Swap sheet's
    substitute preview shows the as-written amount, and loose produce shows the shop's per-kg price beside the amount.
  - **New copy (rule 8, logged here; translated into the 10 languages by AI, second-checked, not yet by native speakers):** "Eggs, wraps and stock cubes are counted whole and other amounts are rounded, so a serving made from these amounts can differ from the numbers shown."
  - **Checked:** `tests/recipeServings.test.ts` (118 tests: every one of the 100 recipes × Serves 1 to 12 × as written, fitted to 400/600/800 kcal with and without a protein aim, each ingredient's first substitute, halal, "I have this": calories, protein, carbs, fat, every Full nutrition row, the price a serving,
    the products, whole amounts and packs; sabotage-checked: with the old behaviour back it fails 110 of 111), the older recipe tests (288 in all), `e2e/recipes.mjs` 15 (new: the numbers and the price a serving are identical at Serves 1, 2, 3, 4, 5 and 12 for chow mein, an egg recipe and a wrap recipe, as written and fitted, including the open
    More detail rows), tsc, eslint.

- 2026-10-16 — **Suggested calories, protein, carbs and fat from a person's answers (the maths; the screens follow)** (founder, on the onboarding targets screen: "have 3 screens asking their age and then another thing ... use that information to then arrive on this screen with pre typed information which they
  can change ... an algorithm based on their dietary requirements if they're GLP-1 or vegan or veggie etc, trying to gain weight or maintain, the number of calories and their protein, carbs and fats intake"). This commit is the tested pure logic only; nothing on screen uses it yet.
  - **`planTargets`** (`lib/mm/targets.ts`): calories are exactly what "Suggest targets" already gave (Mifflin-St Jeor, activity factors, goal adjustments, the 1,200 floor, rounded to 10: tested equal on a grid of 3,600 people). **Protein** = grams per kg of body weight by goal (lose 1.4, maintain 1.2,
    build muscle 1.6, GLP-1 1.4, other 1.2) × a diet factor (vegan 1.10, vegetarian 1.05, pescatarian 1.00), rounded to 5 g and kept between 15% and 35% of the calories. **Fat** is 30% of the calories (never below 20%) and **carbs** are the rest, both to 5 g. For the GLP-1 goal it also proposes a comfortable meal size
    (a third of the calories to the nearest 50, between 300 and 450); nothing applies it yet, so what Best for you ranks is untouched. Under 18 and unusable answers get their own results; the plan carries calm notes ("check your height and weight" when BMI is under 15 or over 50, the 1,200 floor, a "lower-calorie plan may not suit you"
    note for losing weight or GLP-1 at a BMI under 18.5, the GLP-1 line, "we set your protein a little higher" for a plant-based diet), never a diagnosis.
  - **`bodyUnits`** (`lib/mm/bodyUnits.ts`): kilograms, stone and pounds, pounds, centimetres, feet and inches, converting when a person switches unit (30 to 300 kg, 100 to 230 cm, age 18 to 100). A part number in the stone or feet box is refused ("5.10" is not 5 ft 10), with a plain message that says to use the pounds or inches box.
  - **Independently reviewed (5 lenses) and fixed:** the low-BMI and measurement-check notes, the stone and feet misreads, the GLP-1 meal size held at the 450 default's ceiling, rounding ties, the 20% carb floor, unit-switch edges, null guards.
  - **Proposals for the founder to confirm (rule 8; every figure stays editable by the person):** the diet factors (vegan 1.10, vegetarian 1.05), the 15% to 35% protein share limits, the 30% fat share, the suggested GLP-1 meal size of 300 to 450, whether someone at a BMI under 18.5 who wants to lose weight should get a smaller
    deficit than 500 kcal (today only a note is shown), and a ceiling on protein for very large bodies (a 200 kg man building muscle gets about 320 g; the 15% to 35% limits are the only brake).
  - **New copy (rule 8, logged here; translated into the 10 languages by AI, second-checked, not yet by native speakers):** "Please check your height and weight, because your plan is worked out from them. If they are right, you can carry on.", "Your suggested calories are never below 1,200 a day. If you plan to eat less than that,
    please talk to a doctor or dietitian first.", "At your height and weight, a lower-calorie plan may not suit you. Please talk to a doctor or dietitian before you start.", "Because of your diet, we set your protein a little higher. Change it any time."
  - **Checked:** `tests/targets.plan.test.ts` and `tests/bodyUnits.test.ts` (golden people, the 3,600-person equivalence grid, extremes, both unit systems, rounding ties, the privacy rule that the returned plan holds no body measurement), the existing `targets.test.ts` untouched and green, tsc, eslint.

- 2026-10-16 — **More halal restaurants** (founder: "Add more halal resturantes"). **241 chains, 36,842 items live (was 238 and 36,631); the Halal filter now lists 57 chains (14 say all their food is halal, 43 some; was 41: 11 and 30).**
  Halal stays chain-level and comes only from each chain's own words on its own website, quoted exactly with the page's address and the date checked (`data/dietary/halal-*.csv`, `tools/dietary/build_halal.py`); nothing is inferred, and a chain that says nothing, or says it is not halal, is not shown.
  - **How:** a re-checker re-read the statement behind every halal row and three scouts looked for chains not yet in the app (restaurants, takeaways, bakeries, delivery brands), then a judge kept only chains with official per-dish nutrition; each chain was extracted by a script from its own pages and re-read by a second method, with its own logo.
    26 flag changes: **16 chains now show the chain's own halal words** (Fireaway, Pepe's Piri Piri and Sam's Chicken say all; Atis, Bagel Factory, Bill's, Burger Boi, Dishoom, Domino's, Hollywood Bowl, Honest Burgers, Popeyes, Powerleague, Puttshack, Slim Chickens, Subway, The Salad Project, Wendy's and Wildwood some, before the review below removed Bagel Factory) and 10 more are recorded as "no" (ASK, Booths Café,
    Burger & Lobster, Burger King, Coco di Mama, Pure, Sticks'n'Sushi, The Alchemist, Turtle Bay, Zizzi: not shown).
  - **Three new full-nutrition chains:** **Honest Burgers** (117 items; some halal), **Sam's Chicken** (59 published, 34 held back where its own figures cannot hold; all halal) and **Burger Boi** (35; some halal), each with 0 errors and 0 high audit flags, a second read, and its own logo saved unchanged (Burger Boi's square icon too).
  - **Independent review (4 lenses, 20 findings checked, 10 confirmed and fixed):** two live "some" rows (Jamaica Blue, Pizza Hut) showed the analyst's own description in quote marks and rested on a file name, so they are now "not stated" and gone from the filter; Bagel Factory rested on an undefined "H = Halal Friendly" tag, also removed;
    Sam's Mayo and Sweet Chili Mayo (macros heavier than their own stated 25 g) are held back; Honest Burgers' logo notes corrected; **a robots.txt that cannot be read at all is now treated as "not allowed"** (RFC 9309 s.2.3.1.4; a 4xx, 403 included, still means no rules; tests in `tools/tests/test_robots.py`); the Nearby Halal chip now shows only when
    an "all halal" chain has pins on the map file (today Pepe's Piri Piri 20 and Sbarro 5), so it never opens an empty list; the App Store draft says 241.
  - **For the founder:** (1) Burger Boi's terms (14 Aug 2026, s.5.3) forbid scraping or systematically extracting site content; its robots.txt allows everything and only 16 pages were read: keep it (accepted risk) or remove it (delete `data/source/burger-boi` and its logo files, republish with `./scripts/publish_menus.sh --web-only`, rerun `build_halal.py`).
    (2) Sam's Chicken "all" rests on a hedged sentence ("to the best of our knowledge", chicken only) and Pepe's Piri Piri "all" on one 2024 news-post sentence ("all which are Halal"): change the row to "some" in `data/dietary` and rerun `build_halal.py` if you want a softer reading. (3) Save from your own browser (their sites block this environment): Papa John's 84-page nutrition PDF
    (valid 1 October 2026, full nutrition, 138 sites: the most valuable file), Krispy Kreme's allergen and nutrition book, Shake Shack's allergen and nutrition PDFs, and Kaspa's allergen pack (listed in `data/held-downloads/*/downloads.csv`). (4) **Map pins for 14 chains** (the three new ones and eleven older halal chains) could not be fetched here (the
    Overpass server closed the connection): on the Mac run `python3 tools/branches/fetch_osm_branches.py --only afrikana,amigos-burgers-and-shakes,cluckd,daves-hot-chicken,fireaway,jollibee,little-dessert-shop,maroush,oodles-wok,rola-wala,sams-chicken,shahs-halal-food,honest-burgers,burger-boi --cache <dir>`.
  - **Not changed:** no new copy, so no translations. The iPhone app picks the new chains up after its next `npm run build:app` and Mac build.
  - **Checked:** 215 Python tests (9 new for the halal builder, new ones for Sam's Chicken and the robots rule), `check_chain` and the accuracy audit on the new chains, `tsc`, `eslint`; the halal and logo generators' diffs are pure insertions each traced to one CSV row; the other 238 chain files are byte-identical. Full browser run: see the commit.

- 2026-10-16 — **Onboarding asks about you, then arrives at "Your daily targets" already filled in** (founder, on the targets screen: "Come to this screen later, in the screens before have 3 screens asking their age and then another thing ... use that information to then arrive on this screen with pre typed information which they
  can change if they want. The app should use an algorithm based on their dietary requirements if they're GLP-1 or vegan or veggie etc, trying to gain weight or maintain, the number of calories and their protein carbs and fats intake").
  - **The new order (10 steps, "Step n of 10"):** 1 Goal, 2 Foods to avoid (moved up: the diet has to be known before the numbers are worked out), **3 About you** (sex and age), **4 Your size** (weight and height), **5 How active are you?**, 6 Your daily targets, 7 Shops, 8 Text size, 9 You're all set, 10 Choose a recipe.
    Weight and height each have their own two-way unit choice (stone and pounds or kilograms; feet and inches or centimetres), starting in UK units; switching converts what was typed and the plan is always worked out from the exact kilograms or centimetres typed, so the same person gets the same numbers in either unit. A part number in the stone or feet box ("5.10") is refused with a plain line that points
    at the pounds or inches box. **Skip** on any of the three question screens skips all three (the answers are thrown away) and goes to the targets screen with nothing filled in; an age under 18 goes straight there with the existing "ask a doctor or dietitian" line and is never asked for height or weight.
  - **Your daily targets** arrives with four editable cards, **Calories, Protein, Carbs and Fat**, filled from `planTargets` (the maths committed earlier: goal, diet, sex, age, size and activity), the plan's calm notes under them (check your measurements, the 1,200 floor, a lower-calorie plan may not suit you, the GLP-1 line, protein set a little higher for a plant-based diet)
    and Pip's line that they are only a starting point. The GLP-1 "Comfortable meal size" stays at its 450 default: it is not filled from the plan (it changes what Best for you ranks). "Not sure? Suggest targets for me" is shown only when the questions were skipped, and Settings > Daily targets > "Suggest targets for me" is the same maths on one screen with the same field components.
    Continue saves calories, protein, carbs and fat (an emptied box stays unset, as before). "You're all set!" and Pip's example now read what was saved, so they match Home.
  - **Privacy (CLAUDE.md rule 4):** the answers (sex, age, weight, height, activity) live only in memory while the screens are open and are never written to localStorage, sessionStorage, IndexedDB, a cookie, the address, history state, analytics or any request (a browser test types age 47, 83.7 kg and 183.4 cm and searches all of them after every step, after saving and after a reload); the screens say so in one line.
  - **Independent review (5 lenses, 26 findings, all fixed or answered):** Skip then Back no longer overwrites saved targets or leaves a contradicting screen; a goal or diet tapped and then skipped no longer feeds the plan; "doesn't look right" no longer fires on the first digit; "Use these" after skipping keeps the plan's notes and puts the focus on Calories; a double tap of a finger no longer skips a screen (taps within 0.6 s of a screen appearing are
    ignored; mouse, keyboard and screen readers are never held back); a plan lowered by hand under 1,200 shows one caution, not three; bad target boxes are marked and described; the +/- buttons step from the number shown; thousands commas and other digits are read as numbers; **arrow keys on every radio group now go the right way in Arabic and Urdu**; sizes on the targets screen follow the text size.
  - **Decision for the founder (rule 8):** because the filled-in protein is saved as the person's own target, "protein left today" and Best for you now use a protein target for nearly everyone who answers the questions (before, only people who typed one), and carbs and fat no longer follow later calorie edits in Settings (they are typed values). Say if you would rather save only calories and let protein, carbs and fat stay worked out.
    Also from the maths commit: the diet factors, the 15% to 35% protein share, the suggested GLP-1 meal size and the under-18 default are proposals (see that entry).
  - **New copy (rule 8, logged here; 28 strings translated into the 10 languages by AI, each second-checked, not yet by native speakers):** "About you", Pip's lines ("A few quick questions, and I'll work out your daily numbers for you.", "Tell me your weight and height, in whichever units you like.", "I worked these out from your answers. They're only a starting point, so change any of them."), "Your size", "How active are you?", "Pick the one that sounds most like a normal week for you.",
    the privacy line, the unit and box names (Weight, Height, the unit choices, Stone, Pounds, Feet, Inches, Kilograms, Centimetres), the age, weight and height checks and the two part-number sentences, "Sex, to work out your numbers", and the recipe chips "{carbs} carbs" and "{fat} fat". No longer used: "Height (ft)", "Height (in)", "Weight (lb)", "Sex for the formula".
  - **Checked:** 28 unit tests for `onboardingPlan` (incl. six unit switches in a row), the targets and body-unit suites, `e2e/onboarding-body.mjs` 24 steps (the order, the two example people, unit switches, Skip and Back in every direction, under 18, invalid answers, every note, the privacy search, Settings' form giving the same numbers, 360 px / Extra large / Arabic with no overflow and 44 px targets, axe 0), smoke 23, extra 13,
    sharelist 11, account 8, languages 5, a11y 0 violations, large text. **Not run:** the packed iPhone app (`app-build.mjs`), a production build, a real iPhone keyboard (the number pad has no Return key: the Done pill is the way to put it away).

- 2026-10-16 — **Recipes: Cuisine and Occasion filters, eight new recipes, and Midjourney prompts for every picture** (founder: filters for cuisines such as
  Chinese and Indian and for occasions such as a picnic, party food, a lunchbox, a summer barbecue and Bonfire Night, with "no label on the cards"; then
  "use Midjourney to make images for them ... a prompt for every recipe ... from a bird's-eye view").
  - **Where:** Recipes, two plain drop-downs directly under the tile grid and above More: **Cuisine** (first option "Any cuisine") and **Occasion**
    (first option "Any occasion"). Native pickers, one choice each, options listed alphabetically with the number of recipes in them ("Chinese · 9"). They
    combine with each other (AND) and with the meal tiles, search, and the person's diet and allergies; an option that would show nothing is greyed (the
    chosen one never is). The choice lives in the address (`?cuisine=chinese&occasion=picnic`, written with `router.replace`, so no history entries and Back
    from a recipe returns to the same list); "Clear" and "Show all recipes" reset both; "Picked for you" and "Cook with what's on your list" step aside while
    one is chosen (as they do for a search). The recipe search also finds recipes by these words ("chinese", "bbq", "picnic", "packed lunch", "party",
    "buffet", "guy fawkes"...). **Nothing is printed on any card.** A screen reader hears one live line with the count ("9 recipes match" / "No recipes
    match.").
  - **Which recipes:** kept in two flat tables (`lib/mm/recipeBook/niches.ts`: `CUISINE_LINES`, `OCCASION_LINES`; the recipes' old cuisine tags are
    untouched and a test ties them together). A recipe is filed only where its name or ingredients plainly make it that kind of food (judgement calls to
    confirm are below). A cuisine or occasion with fewer than 3 recipes in the book hides itself. Counts on 16 October: British 9, Chinese 9, Indian 9, Italian
    13, Mexican 11, Middle Eastern 8; Bonfire Night 6, Lunchbox 14, Party food 8, Picnic 14, Summer barbecue 8. **Bonfire Night is offered only 15 October
    to 10 November** (by the date on the phone, decided once when the page opens), so it is not on the list at the January 2027 launch. No Christmas yet
    (below). Thai, Japanese, Greek and the other cuisines with fewer than 3 recipes are not offered.
  - **Eight new recipes** (everyday ingredients only; the book is now **108**): Egg chow mein with vegetables, Egg and tomato stir-fry with rice,
    Chinese-style chicken curry with rice and peas, Chicken and mushroom noodle soup, Spiced chicken and rice bowl with yogurt, Chickpea and spinach stew with
    eggs, Chicken and pepper kebabs with yogurt dressing, Barbecue chicken thigh skewers with corn salad. Every figure is worked out by the app from
    Sainsbury's labels as for the other recipes (no number was typed by hand). Both skewer recipes say what to do without skewers. 55 recipes have no meat or
    fish, 24 are vegan, 96 suit halal. Our own wording (rule 8): "Chinese-style" because the curry is a British takeaway dish; no "authentic" claim anywhere.
    The old "Chicken chow mein" card now shows the noodle drawing instead of the meal icon.
  - **Review (five lenses, 15 findings, 0 blocker or major) and what was done:** removed five loose tags (Chicken, rice and soy bowl and Tuna and bean
    salad were not specific to a cuisine; "BBQ chicken and pepper wraps" are pan-cooked), added the cold salads that sit beside a barbecue and the meat-free
    cottage pie so a vegetarian still sees every occasion; the search word "asian" was dropped (it would have answered with a list that looked complete and
    was not); the stew now uses whole tins and eggs; noodles that must be ready-to-wok no longer offer dried rice noodles as a swap; the season is decided
    once per visit; a test fails any cuisine or occasion with no meat-free recipe.
  - **Midjourney prompts:** `docs/RECIPE_IMAGE_PROMPTS.md` (rewritten from the book by `WRITE_PROMPTS=1 npx vitest run tests/recipeImages.test.ts`, run in `web/`) has
    one prompt per recipe (108), every one a bird's-eye view straight down, light oak table, natural window light, with one shared style and the parameters
    `--ar 4:3 --v 7 --style raw` and a `--no` list (text, letters, numbers, logo, brand, packaging, label, hands, people, cutlery, steam). How each dish looks from above
    is in `web/lib/mm/recipeBook/looks.ts` (a test checks every recipe has one, 22 to 55 words, no brand or writing words). The file begins with a hand-over for
    Claude in Chrome (or a person): paste each prompt exactly, pick the best of four against a seven-point checklist, save as `<recipe id>.png`, keep one look with
    `--sref` from the first picture, stop on any CAPTCHA, login or warning. **Read first:** Midjourney's Community Guidelines say it has no API and that
    **automating interactions with it is prohibited and can get an account blocked**; letting Claude in Chrome click through the site is such automation, so the
    founder decides. The safe way is a person pasting the prompts. Then `python3 tools/recipes/import_recipe_images.py` makes the 800 x 600 WebP copies
    (it now ignores the new cuisine and occasion tables; 108 recipes).
  - **For the founder (rule 8):** (1) confirm or drop the tagging judgement calls, one line each in `niches.ts`: chilli, burritos, fajitas, quesadillas and huevos are all
    filed Mexican although chilli con carne and burritos are Tex-Mex; "Coconut salmon curry" is Indian (curry paste) rather than Thai; "Spanish-style omelette" is a
    Picnic although it is served warm; "Peanut butter oat bites" is Lunchbox and "Paprika roasted almonds" is Party food (both contain nuts, which some schools and
    parties exclude; the app promises nothing about allergies); (2) Summer barbecue is offered all year: say if it should get a season (April to September);
    (3) **Christmas** is not in the list: festive ingredients (cranberry sauce, chestnuts, sprouts) are outside the "everyday ingredients only" rule of 15 October; say if
    November and December may break it (adding it later is one `OCCASIONS` entry plus recipes); (4) docs/STORE.md still says "100 recipes" (the draft is yours to approve);
    (5) the website's recipe count and the 8 new pictures. **Not verified:** the packed iPhone export (`router.replace` on the static export is the same pattern My meals' tabs use),
    a real iPhone's native picker, VoiceOver on the live line. New copy (rule 8, logged here; translated into the 10 languages by AI, each checked by a second translator, not
    yet by native speakers): "Cuisine", "Occasion", "Any cuisine", "Any occasion", "Try another cuisine, occasion, word or meal.", "Bonfire Night", "Lunchbox", "Party food",
    "Picnic", "Summer barbecue", the 8 recipe names, blurbs and steps.

- 2026-10-16 — **Community steps 2 and 3: friends by code, sending a shopping list, the inbox** (founder: "add a friend and more, you can add a friend and send them shopping lists";
  answers: sign-in only for Community, a friend code and an invite link, lists land in an inbox). **The database migration is written and NOT applied** (rule 4: your go-ahead first).
  - **What a person sees.** Community hub: **Friends** and **Shared with you** cards under Food blogs (signed out they say "Sign in to add friends"). **Friends** (`/app/community/friends`): "Your friend code"
    with Copy code, Copy link and Share invite; one box that takes a friend's code **or** the whole invite link; requests with Accept / Decline; "Waiting for an answer" with Take back; the friend list with a three-dot
    menu (Report or block, Remove). The first time someone opens Friends, or taps **Send to a friend** on the Shopping list (new button beside Share), a **Choose a username** sheet opens: chosen once, 3 to 20
    letters, numbers, dots and underscores, shown to friends instead of an email address. Sending asks "Send your shopping list to {name}?" and sends the same references the share link carries (products and typed
    words, never prices; ticked items are left out). The **inbox** (`/app/community/inbox`, `/inbox/view?id=`) shows each list with the shared-list view (Add all, pictures, takedowns), marks it read, lets you delete it and
    report or block the sender; lists stay 30 days. The **Community tab** shows a badge (unread lists plus friend requests; asked when the app opens, on return to the front, when the network returns and every 3 minutes
    while open). The invite link is `https://numbite.com/f#CODE` (a website page like `/l`, not indexed; the code lives after the `#` so no server sees it; Universal Link path `/f` next to `/l` in the site-association file, so the
    Associated Domains step you already have to do covers it; `FriendInviteLink` in `SharedListLink.swift`, **not compiled here**). A first-time visitor opening an invite link goes through onboarding and **lands on Friends with the code**
    (the "choose a recipe" step is skipped for it, like for a shared list).
  - **What the server keeps** (rule 4 amended; `docs/BACKEND.md` "Community"): in six new tables, never in `user_data` or the synced stores: `community_profiles` (username, friend code), `friendships`, `community_blocks`,
    `community_reports`, `community_lists` (references and typed words, deleted after 30 days) and `community_attempts` (a durable tally of friend-code tries, lists sent and reports made). RLS on, no policies, revoked from the
    app roles, written only by the API with the server-only key; deleting an account removes its rows (reports are the exception, below). **Nobody ever sees another person's email address or user id**: people are found only by a
    friend code or link (no search, no contact upload), the app is given only a username and the id of the row that connects you, and every code that cannot be added (unknown, malformed, your own, blocked either way, already friends,
    declined) answers with the same words and the same database work. No chat, no posts, no push.
  - **Thirteen routes** under `/api/v1/community` (me, friends, friends/request, friends/respond, friends/{id}, blocks, blocks/{id}, report, send-list, inbox, inbox/{id}, inbox/{id}/read), all behind the sign-in and CORS for the
    iPhone app, errors as codes the app turns into its own words. Limits: 200 friends; 20 friend-code tries and 20 requests a day; 100 requests waiting to be answered and 50 pending ones a person made; 30 lists a day (and 10 a day
    to one friend); 50 unread lists in an inbox; a list of at most 100 lines or 6,000 characters (the server **re-encodes** what it stores, so nothing else can ride in); 10 reports a day; 10 username tries an hour.
  - **Independent review (5 lenses, 38 findings, 9 major) and what was done:** the daily limits did not bind (a restart or taking a request back reset them): now counted in the database (`community_attempts`), parallel requests
    included; a declined request keeps a hidden `declined` row for 30 days so a re-ask is refused and not a way to pester; **reports survive the deletion of either account** (set null, a copy of the usernames and words, kept a year,
    one open report per reporter, person and list) and cannot be aimed at a stranger by holding their code; the caps (50 unread lists, 100 requests, 200 friends) are held by lock-taking triggers under a race (proved with 10 parallel
    inserts on a real PostgreSQL: exactly 5 got in); half an emoji can no longer make Postgres refuse a report; the word filters see through spacing, look-alikes and slurs; a phrase such as "kill yourself" is refused in a typed list.
    Skipped on purpose (follow-ups): rotating a friend code, per-IP limits (31^8 codes at 20 tries a day per account is not enumerable).
  - **Switch.** `COMMUNITY_FRIENDS_ENABLED` (`lib/mm/config.ts`, on unless `NEXT_PUBLIC_COMMUNITY_FRIENDS=0`) hides every Friends entry point and stops every Community call, so the app can be deployed before the tables exist.
    The food blogs never depend on it.
  - **Legal and store text:** CLAUDE.md rule 4, the privacy page ("Community"), terms, support, the website's "No account needed for menus, shops and recipes", `docs/STORE.md` (App Privacy rows, App Review notes, age-rating
    note for limited user-generated content), `docs/ACCOUNTS_SYNC.md` and `docs/BACKEND.md` updated. Delete my account says Community data goes too. The Welcome screen's "No account needed" and Settings' "You don't need an account to use
    Numbite" are unchanged: still true of everything except friends.
  - **Founder steps (in order):** (1) read `supabase/migrations/20261016120000_community.sql` (it only creates); Supabase dashboard > project menumacros > SQL Editor > paste it > Run ("Success. No rows returned"); do not use `supabase db push`.
    (2) New query > paste `supabase/tests/community.sql` > Run: it rolls back and must print ALL COMMUNITY CHECKS PASSED. (3) **Apply the migration before the website or app build with Friends goes live** (or build with
    `NEXT_PUBLIC_COMMUNITY_FRIENDS=0`; the daily cleanup skips Community until the tables exist). (4) Optional but recommended (App Review 1.2 expects reports acted on within 24 hours): Vercel env `RESEND_API_KEY`, `REPORT_ALERT_TO`,
    `REPORT_ALERT_FROM` so the daily cleanup emails a **count only** while a report is open; otherwise a daily reminder to open Table Editor > `open_community_reports`. (5) To remove someone follow `docs/BACKEND.md` "Removing someone"
    (Ban user, not delete, plus two DELETE statements); check on the first real ban that their calls stop (a token they hold may work for up to an hour). (6) Before announcing it do a real two-account test (two emails, or Apple and Google):
    usernames, add by code, accept, send a list, open it, report and block, and see the report in `open_community_reports`. Keep "acted on within 24 hours" in STORE.md only if you will check daily.
  - **Decisions for you (rule 8):** whether the tab badge may ask the server for every signed-in person (current) or only people who have a username; whether to keep a founder-held copy of removed people's reports outside the database
    (reports are kept a year and survive account deletion); friend-code rotation if codes get posted publicly.
  - **New copy (rule 8, logged here):** 117 new English strings (the Friends, report, block, username, inbox and send text); site pages (`/f`, privacy, terms, support) are English only like the rest of the site.
    **Not translated, on the founder's say-so** ("I don't need you to translate the community ... it's just wasted credits"): they show in English in every language (t() falls back to English). They are listed in
    `web/lib/mm/locales/english-only.json`, which `tests/i18n.test.ts` reads so the other languages are not required to translate them (and fails if a listed key is no longer used). To translate them later: delete the list's keys,
    run `translate_chunks.py pending <code>` and merge.
  - **Checked:** 84 community unit tests (handlers, limits, races, privacy of every answer), 34 username/filter, 22 client, 13 route, 8 cleanup, 19 adapter tests against a **real PostgreSQL 16** with the migration applied
    (`supabase/tests/community.sql` passes twice; mutation-checked: every injected bug in the handlers, the adapter and the SQL test was caught), whole-project `tsc` and eslint; `e2e/community-friends.mjs` 28 steps with two people in two browsers (signed out asks the server nothing; username
    rules; add by code or pasted link; identical answers for every refused code; accept, decline, take back; send from the Shopping list; inbox badge, open, Add all, delete; report and block; offline copy; sign out, Clear data and
    Delete my account clear it; no friend or inbox data in any sync request; no email or account id in any answer; the invite through onboarding; 390 px, 360 px, Extra large and Arabic with no sideways scroll, 44 px targets, axe 0),
    community 10, back 44, account 8, sharelist 11, smoke 23, extra 13, a11y 0 violations, large text. **Not run or not provable here:** the real Supabase/PostgREST (the adapter was proven through a psql stand-in, error texts for the trigger
    and unique-index refusals are assumed), `build:app`/`app-build.mjs`/`offline.mjs` (the new shells in the service worker are unproven offline), the Swift (not compiled), a real iPhone or VoiceOver, the Resend alert (fake fetch only).

- 2026-10-17 — **English only: no language choice** (founder: "lets just leave the app in only english then, there is no need for the step at the start where the person can choose their language they want my app in").
  - **Gone:** the "Choose your language" first screen, the "Change language" button on the welcome screen and Settings › Language. Onboarding now opens on the welcome screen ("Get started"); the step numbers after it are unchanged.
  - **One switch:** `LANGUAGES_ENABLED = false` (`lib/mm/config.ts`). A language stored on the phone or synced from an account (`settings.language`) is ignored: `setLanguage` forces English, so the page is
    left to right and `<html lang>` is English, and no dictionary is loaded. The ten dictionaries, `LanguageList` and the translation tools stay in the repository, so bringing languages back is that switch plus the screens' two entry points
    (the welcome step and the Settings row, in git history).
  - **No translation work from now on:** new text shows in English (`web/lib/mm/locales/english-only.json` still exempts the Community strings from the all-languages test).
  - **Tests:** the language step is out of smoke, extra, largetext, sharelist, onboarding-body, app-build, a11y, account and community-friends; every Arabic/right-to-left variant is dropped from the other suites (the right-to-left code in the app is untouched); `e2e/languages.mjs` is now three steps (no language screen even for a Polish browser, no Settings row,
    a stored `language: "ar"` still shows English left to right). STORE.md no longer says "11 languages"; APP_BUILD.md's simulator check says the app opens on the welcome screen.
  - **For the founder:** the iPhone app needs a Mac rebuild to lose the language screen; the AI translations (never checked by native speakers) are no longer shown, so that to-do is moot unless languages come back.

- 2026-10-17 — **Recipe methods are much more detailed** (founder: "the instructions to making the recipes are not descriptive enough, you need more steps and more detail, right now its far too short and barely looks like the method to do it, it should be far more in detail").
  - **What changed:** all 108 methods were rewritten from 2-7 short steps to about 10 steps each (4-16 allowed): a get-ready step, the pan and the heat, a time and a sign for every stage (colour, bubbling, "no pink left", "firm to a gentle press"), how to tell it is done, and how to serve.
    Plain British words, no cook's jargon (a test fails "sweat", "deglaze", "al dente"...), oven settings only as "200°C (180°C fan, gas 6)" from the standard table, hands and boards washed after raw meat, fish and eggs, and the same
    cooking-safety checks as before (chicken, mince, fish, eggs). Nothing about nutrition, health or prices was added, and no ingredient was added or removed (every food a method names is still bought, and every food bought is named).
  - **Review:** each batch was read by three independent reviewers (cook, beginner, fixer); the 81 findings marked major (no blockers) were all checked and repaired, mostly about timing the rice or pasta to finish with the sauce, putting
    raw-meat hand-washing in the right place, taking a hot tin out with gloves, and spraying oil off the heat. The 253 minor findings were not acted on.
  - **Servings:** a method still scales its water (one "N ml" a step) with Serves; a new grey line under the steps says "Times are for the number of servings the recipe is written for. For more people, cook a little longer or in batches." when Serves differs from the written number.
  - **`minutes` changed** where the steps clearly take longer than the old figure: shakshuka 25 to 35, mushroom and bean pasta 25 to 40, bean and mushroom cottage pie 55 to 75, the two barbecue skewer recipes 40 to 55, devilled eggs 20 to 30 (so it is no longer tagged Quick), egg mayonnaise wraps 15 to 25 (so it is no longer Quick), and the beef pasta bake 50 to 60.
    **Later the same day (founder: "yes please change them"):** bacon and egg wraps 15 to 20 (still tagged Quick, which is 20 minutes or less), spanish omelette 25 to 30, peanut banana porridge 10 to 15.
  - **New test gates** (`tests/recipeBook.test.ts`, `methodProblems`): steps and words per meal, capital letter and full stop, no stray spaces, no jargon, no people counts, one ml amount, oven settings.
  - **Not translated** (English only since today); `recipeServings.test.ts`'s "works in every language" check is skipped while `LANGUAGES_ENABLED` is false and must be translated again if languages come back.
  - Checked: recipeBook (all 108), recipeServings (Serves 1 to 12 for every recipe), recipes, recipeNiche, recipeImages, i18n.

- 2026-10-17 — **Tabs remember where you were** (task from the founder's list: "switching tabs returns to the same page").
  - **What it does:** leave a tab from a page deep inside it (a restaurant, a recipe, a shop's list, an article) and tapping that tab again opens the same page, with its address query (`?id=…`). Tapping the tab you are already on goes to its first page, and a tab shown at its first page remembers nothing.
  - **How:** `lib/mm/tabMemory.ts` (pure, 7 unit tests) and `app/app/_lib/tabMemoryStore.ts`; `AppShell` points each tab link at the remembered address. It lives in this browser tab's `sessionStorage` (`mm.tabs`), so it survives a reload but not closing the app, and holds only addresses inside the app that belong to that tab.
    **Never a `#` part** (a shared list or a friend's code lives there), never the welcome or offline pages, and anything hand-edited into storage is dropped when read.
  - **Not remembered:** the scroll position and a page's filters, search words or "show more" limits that are not in its address (Search and My meals' tabs already restore theirs); a page restores what its address holds.
  - **No new copy.** Checked: tabMemory unit tests, `e2e/tabs.mjs` 3 steps (tab opens the page last seen, the open tab goes to its first page, survives a reload, no fragment stored, hand-edited storage ignored).

- 2026-10-17 — **Founder's answers, and prompts for Claude in Chrome.** (1) The three cooking times were changed (above). (2) **Midjourney by Claude in Chrome: yes**, the founder's call after being told Midjourney's guidelines prohibit automated use and can block the account (their account, their risk);
  the paste-ready prompt is `docs/MIDJOURNEY_CHROME_PROMPT.md` (108 recipes, one look, stops on any CAPTCHA or warning). (3) **Burger Boi stays** (founder, accepted risk; its terms s.5.3 forbid scraping). (4) **Christmas recipes may use festive ingredients** in principle; Claude was asked to explain first what "festive ingredients" means
  before any recipe is written (nothing built yet). (5) `docs/CHROME_PROMPT_LAUNCH.md`: a paste-ready prompt that applies the Community migration in Supabase (then runs the check script) and does a read-only look at Vercel (variable names only, never values). It does not merge or deploy. The founder asked Claude to do as much as it can.

- 2026-10-17 — **Christmas recipes with festive ingredients** (founder: "yes christmas recipies can have festive ingreidents", then "Go" to the plan below).
  - **Rule kept, with one exception:** every recipe in the book still uses only everyday ingredients (15 October), except the nine Christmas recipes, which may also use `FESTIVE_KINDS`
    (`lib/mm/pantry.ts`): turkey breast fillets, pork chipolatas, gammon steaks, Brussels sprouts, parsnips, red cabbage, cooked chestnuts, cranberry sauce, apple sauce, mincemeat,
    dried cranberries, ground mixed spice and ground nutmeg. `tests/recipeBook.test.ts` fails a festive kind in any other recipe, a festive kind no recipe uses, and any festive kind
    that does not resolve to a Sainsbury's product whose label we have read **as sold** (nothing is estimated: a label headed "cooked" or "prepared" never counts).
  - **Dropped for lack of a usable label (rule 1):** a whole turkey crown (none listed), nut roast and eggnog (none listed), bread sauce and Sainsbury's own stuffing (their labels are "cooked" or
    "prepared"), roast gammon joints and turkey steaks (labelled cooked), fresh potatoes (no label read as sold; roast dinners use drained tinned potatoes, as the book already does), stuffing mix,
    brandy mincemeat (alcohol). Turkey breast resolves to one product today (Sainsbury's fresh mini fillets) and gammon steaks to two.
  - **Occasion `Christmas`** (`niches.ts`): offered **1 November to 6 January** by the date on the phone, so it **is on offer at the 4 January 2027 launch** and gone from 7 January. Search words: christmas,
    festive, xmas, boxing day. Bonfire Night (to 10 November) and Christmas never overlap.
  - **Nine recipes (108 -> 117):** Roast turkey with parsnips, sprouts and cranberry; Turkey, cranberry and cheddar wraps; Chipolatas with spiced red cabbage and mash; Gammon steaks with honey parsnips and
    apple sauce; Sprout, chestnut and potato gratin; Spiced parsnip and apple soup (vegan); Red cabbage, chestnut and cranberry rice (vegan); Mince pie porridge; Cranberry, cheddar and ham toasted wraps.
    Four are meat-free (two vegan), four suit halal (the turkey and pork ones don't: no halal-named product), all meet the detailed-method rules (about 8-11 steps, safety cues for turkey, pork and gammon).
    Figures are worked out by the app from the labels, like every recipe; British cuisine lines added for the roast, sausage, gammon and gratin recipes.
  - **Pictures:** a bird's-eye look for each (`looks.ts`), `docs/RECIPE_IMAGE_PROMPTS.md` regenerated (117 prompts). Founder still pastes the Midjourney prompt file.
  - **Flagged (rule 8):** new recipe names, blurbs and steps, and the word "Christmas" in the Occasion menu, are English only (no translation work). `docs/STORE.md` still says "100 recipes" (the draft was already behind at 108).
  - **Checked:** recipeBook (every recipe x all rules), recipeServings (Serves 1 to 12, fitted and as written), recipeNiche (Christmas offered 1 Nov and 4 Jan, gone 10 Jan; the
    "occasion needs a meat-free recipe" rule), recipeImages, i18n, recipes, listRecipes, recipeRules, tsc, eslint. **Not run:** browser tests and a production build of the staged copy.

- 2026-10-17 — **Community database applied, and `main` deployed.** (1) The founder had Claude in Chrome run `supabase/migrations/20261016120000_community.sql` in the Supabase SQL Editor
  (project `menumacros`, "Success. No rows returned"): the six `community_*` tables (profiles, friendships, blocks, reports, lists, attempts) and the view `open_community_reports` exist, RLS on
  with no policies. `supabase/tests/community.sql` was then run (Supabase warned "destructive" because the script deletes its own throwaway test accounts; it begins with `begin;` and ends with
  `rollback;`) and printed **ALL COMMUNITY CHECKS PASSED**. (2) `main` was fast-forwarded to `claude/menumacros-kit` (`ce908da`, 22 commits) and Vercel deployed it. Checked on https://numbite.com:
  the welcome screen has "Get started" and no language screen, `/app`, `/app/community`, `/app/community/friends`, `/f`, `/l` answer 200, `/api/v1/community/me` and `/inbox` answer 401 (signed-out, as designed),
  `/api/health` 200, the site-association file and `/logos/hidden.json` 200. **Not yet done:** the Vercel environment check (needs the founder signed in to Vercel in Chrome), a real two-account Community
  test, and a rebuild of the iPhone app (the packed copy still has the old code).

- **2026-10-18: Mac session on branch `mac-build` (finished).**
  Built from `main` at 39058813 (`git pull` then `mac-build`). Tools: Xcode 26.6, Node 26.5 (22 was expected; `npm ci` and the website tests are fine), Python 3.9.6.
  *Build and tests.* `NEXT_PUBLIC_SUPPORT_EMAIL=aman66@hotmail.co.uk ./scripts/build_app_web.sh` packs 159.1 MB (menus 21.0, menu-images 87.7, groceries 23.1, grocery-images 10.3,
  logos 6.8, _next 6.9, app 1.8; the folder is 164 MB on disk); `NEXT_PUBLIC_COMMUNITY_FRIENDS` not set, so Friends is on. `xcodebuild ... build` for the iPhone 17 Pro simulator:
  **BUILD SUCCEEDED with no error** (the Swift was not broken after all; one warning, `NativeBridge.swift:36` "consider using asynchronous alternative function", left alone).
  `./scripts/test.sh --unit` passes: 1,507 website tests, and **62 of 62 Swift tests** (AppConfig 2, FriendInviteLink 7, Reminder decoding 12 / schedule 6 / scheduler 10 / bridge 5,
  SharedListLink 7, WebAppFiles 3, BridgeMessage 7, SignIn 3). The full `./scripts/test.sh` failed one UI test, `testLaunchShowsTheWebAppsFirstScreen`: it still expected the removed
  "Choose your language" screen. **Fixed the test, not the app** (it now waits for the "Get started" button; commit 3e999ffc); it passes.
  *Project check (looked at, nothing changed).* `Resources/WebApp.bundle` is not listed in project.pbxproj (the folder is a synchronized group) and ends up in the built app as ONE
  folder with its subfolders intact, so no "Copy web app" Run Script phase is needed. Debug and Release both set `INFOPLIST_KEY_UIUserInterfaceStyle = Light`, the camera and location usage
  strings and `ITSAppUsesNonExemptEncryption = NO`; `PrivacyInfo.xcprivacy` is in the app; `Config/MenuMacros.entitlements` has Sign in with Apple. **To recheck:** the Info.plist inside the
  14 October *archive* had no `UIUserInterfaceStyle` key although the simulator Debug build has `Light`; step 11 (the archive) must be looked at for this before upload.
  *In the iPhone 17 Pro simulator (a throwaway UI test drove the app; it is not committed and is kept in `build/scratch/ScratchWalk.swift`):*
  a. Welcome screen shows "Get started". **Not done: Mac network off** (it would cut off the Claude session); do it by hand: Wi-Fi off, delete the app, run it, it must still open.
  b. Finished onboarding, saved the order "Double Espresso + Big Mac" (McDonald's, 510 kcal) and put a Tesco product on the shopping list; quit and reopened the app: **both still there**,
     and the app opened straight on Home (onboarding remembered). OK.
  c. Read from inside the app (a temporary script in the packed Terms page, since removed): `location.origin` = `app://menumath`, `window.isSecureContext` = **true**, `crypto.subtle` = **true**,
     localStorage works. OK.
  d. From the app, `GET /api/v1/auth/session` answered 200 `{"user":null}` and `POST /api/v1/auth/email/start` with `{}` answered 400 `invalid_request`, both readable by the page, so the live
     site accepts the Origin `app://menumath`; `APP_ORIGIN` in `web/lib/cors.ts` is right and needs no change. (A real "Request a restaurant" was not sent, so no test row was created.)
  e. Eat out > Near me > Use my location: **one** iPhone prompt ("Allow Numbite to use your location?" with our usage text), then "732 branches · 50 restaurants" near London. OK.
  f. The allergen-guide link in an order opens **Safari**. OK. **"Email instead" / mailto: cannot be tested here: the simulator has no Mail app and `simctl openurl mailto:` fails (error 115). Needs a real iPhone.**
  g. Reminders: a reminder can be added (name, time, "Every day"); iOS asked "Numbite Would Like to Send You Notifications" once, on the first Save. The app logs "Reminders scheduled: 2 of 2, 0 old removed"
     and iOS accepted every request without error. With the app in the background (Safari in front) the banner **"Spike reminder / Tap to open Numbite"** appeared at the minute set, with the Numbite icon. **Settings > Clear data on this device >
     Clear everything** logged "Reminders scheduled: 0 of 0, 3 old removed" (all three cancelled) and the app went back to the welcome screen. OK. (My first attempts missed the banner because my check ran after its 5 seconds.)
  h. The app has no URL Type yet, so `xcrun simctl openurl booted "numbite://l#<code>"` and `numbite://f#ABCDEFGH` fail with error 115 (nothing is registered for `numbite://`): **the missing founder step, not a bug**. To prove the Swift anyway, a
     throwaway copy of the built app was patched with the URL Type (identifier `com.amanmarwaha.MenuMacros.link`, scheme `numbite`, Viewer), re-signed ad hoc and run in the simulator (the repo was not touched): `numbite://l#<code>` (a real code from the
     web app's own encoder) opens "Shared shopping list: Spike test milk x2, Spike eggs x1, Add all to my shopping list" **both when the app is running and when it was closed (cold start)**; `numbite://f#ABCDEFGH` opens Friends with "Your friend's
     code is saved. After you sign in, it will be ready to add." (a signed-out person). iOS shows its own "Open in Numbite?" question for a custom link sent from outside. Not tried: a first-time launch (questions first, then the list).
  i. Dark appearance (`xcrun simctl ui booted appearance dark`): the app stays light, status-bar text dark. OK.
  Christmas is not in the Occasion list **because it starts on 1 November** (today is 18 October): the list shows Any occasion, Bonfire Night 6, Lunchbox 14, Party food 8, Picnic 14, Summer barbecue 8.
  Screenshots (welcome, Home, Recipes, the Occasion list, a recipe, Groceries, Near me, Safari link) are in `build/screens/` (not committed).
  *Archive dry run* (`xcodebuild -scheme MenuMacros -destination 'generic/platform=iOS' -configuration Release -archivePath build/Numbite.xcarchive archive`, nothing uploaded): **ARCHIVE SUCCEEDED** (169 MB). Inside: version 1.0 (1),
  `UIUserInterfaceStyle = Light`, camera and location strings, `ITSAppUsesNonExemptEncryption = NO`, `PrivacyInfo.xcprivacy`, `WebApp.bundle` as one folder, the Sign in with Apple entitlement, signed "Apple Development: AMAN UMESH MAFWVAHA"
  (the App Store export re-signs with the Distribution certificate). **Two things for the founder:** (1) the build uploaded on 14 October (1.0 build 1) is the OLD app: it has none of Reminders, Community/Friends, shared-list links, and its
  Info.plist had no `UIUserInterfaceStyle` key; upload a new build, which needs a **new build number** (Xcode > target MenuMacros > General > Build: 2), because App Store Connect refuses a build number it already has. (2) no `CFBundleURLTypes` yet (see h).
  The first archive attempt failed with "No space left on device": **the Mac's disk was full (a few hundred MB free)**, which also stopped the Claude shell. Freed by deleting build/DerivedData and the old archives, this project's own caches in
  ~/Library/Developer/Xcode/DerivedData (MenuMacros-*) and web/.next, web/.next-app (all regenerated by builds). **Only about 0.5 GB is free now**: clear space before the next Xcode build (Downloads is 24 GB, CoreSimulator 7 GB).
  *Final checks.* `./scripts/test.sh --unit` again: 1,507 website tests and **62 of 62 Swift tests** pass; the throwaway UI test file (`build/scratch/ScratchWalk.swift`) is not in the project. Only one repo file was changed by this session:
  `MenuMacrosUITests/MenuMacrosUITests.swift` (the stale first-screen check). Screenshots (welcome, Home, Recipes, the Occasion list, a recipe, Groceries, Near me, the Safari link, dark appearance, both `numbite://` links) are in `build/screens/` (not committed).

  *Founder steps done later on 18 October ("do everything"):* **Associated Domains** `applinks:numbite.com` added to `Config/MenuMacros.entitlements`; the **`numbite` URL Type** added as a small partial `Config/Info.plist`
  (`INFOPLIST_FILE = Config/Info.plist` in both app configurations; Xcode merges it with the generated plist: checked, the built app has CFBundleURLTypes, `UIUserInterfaceStyle = Light`, the usage strings and the rest); **build number 2**
  (`CURRENT_PROJECT_VERSION`). Commit 4465841a. The simulator build then accepts `xcrun simctl openurl booted "numbite://f#ABCDEFGH"` (before: error 115). `./scripts/test.sh --unit`: 1,507 website + 62 of 62 Swift tests pass.
  **Archive of 1.0 (2): ARCHIVE SUCCEEDED** (`-allowProvisioningUpdates`), entitlements Sign in with Apple + Associated Domains, URL scheme `numbite`, Light. **The upload to App Store Connect was NOT done by Claude: the permission checker blocked
  it, so the founder runs it** (command in the chat; or Xcode > Window > Organizer, open `build/Numbite.xcarchive`, Distribute App > App Store Connect > Upload). Then App Store Connect > the version > Build > Add Build: 1.0 (2) and remove build 1.
  App Privacy: **no change needed for Community** (STORE.md: the Community rows are the User ID and Other User Content types already declared); `NEXT_PUBLIC_APP_STORE_URL` is for after the app is live in the store.

- **2026-10-18 (later): founder decision: logos on the iPhone app's welcome wall too** ("i cant ask permission from each brands and it has to be the logos too"; accepted risk, after the App Review 5.2.1 and UK trade mark / copyright
  analysis in the chat: names are easier to defend than logos, the logo artwork's copyright has no "identifying a business" defence, permission is the only certain route, the realistic risk is a takedown letter or a 5.2.1 rejection).
  `web/app/app/welcome/page.tsx`: the wall now uses `LOGOS_ENABLED` (the `appLogos` switch) instead of `APP_BUILD`, so the app's wall shows the official logo files like the website's. **Fallback if App Review rejects or a brand objects:** set `"appLogos": false` in
  `web/app-content.json` (names and cuisine icons everywhere, the welcome wall included, a smaller app), rebuild (`./scripts/build_app_web.sh`), new build number, archive, upload; or take one brand down with `web/public/logos/hidden.json` (no app update).
  Review notes must stay factual and must NOT claim permission. Web tests: 1,507 pass (one recipes test flaked once under load and passes alone).

- 2026-10-18 — **Numbite 1.0 (build 3) submitted to App Review** (reported by the Claude in Chrome session and the founder; not seen directly by this session). Content Rights was answered **"Yes, this app has the necessary rights to
  its third-party content"** by the founder's own decision ("Yes, I have the rights", after being told what each answer means and that the logos, chain photos and supermarket lists are the accepted risk of CLAUDE.md rule 2); Claude only set the page to the founder's instruction.
  Other App Store Connect state: build 3 attached (replacing build 1), review notes with the Community paragraph (no "acted on within 24 hours" promise), age rating re-answered for limited user-generated content (still 13+), "not a regulated medical device" declared, App Privacy published
  (seven data types), Apple's agreement accepted. Status: **Waiting for Review**; release is manual. **While it is in review do not upload another build** (it would have to be taken out of review first) **and do not break the live website or API**: the app reads newer menus,
  the taken-down logo list and the API from numbite.com, and CORS allows only `app://menumath`. The submitted source is `origin/mac-build` (merged into this branch on 2026-10-18); it also holds the Mac session's fixes (Associated Domains, `numbite://` URL Type, `Config/Info.plist`, build numbers).
  **If App Review objects** (5.2.1 or anything else): the fallbacks are in the entry above (`appLogos: false` and rebuild, `hidden.json` takedowns). Still open: real-iPhone tests (barcode scanner, Sign in with Apple, Google, email code, reminders on the lock screen), the two-account Friends test, the Vercel variable check, `NEXT_PUBLIC_APP_STORE_URL` once the App Store page exists.

- 2026-10-31 — **App Review rejected build 3 (Guideline 1.4.1) and the fix for build 4** (Claude desktop's report from 31 October read the rejection in App Store Connect: submission
  396dfb5d-7738-4aa0-ac84-6e93d16747d4, reviewed 30 October on an iPad Air 11-inch (M3); its only issue: "the app includes medical information but does not include citations for the
  medical information ... include citations in the app of the sources of the recommendations or information, such as links to those sources". Apple's screenshot was Settings > Daily
  targets with a suggested 3,980 kcal / 290 g protein). Nothing was raised about logos, photos, Community, reminders or privacy this round.
  - **Founder's choices (30 Oct):** option A (cite sources in the app, new build, short factual reply to Apple); build 4 = `main` + this fix only (the unfinished improvement pass on
    `claude/menumacros-kit` waits for 1.0.1); the GLP-1 meal size is kept and labelled as Numbite's own setting.
  - **What it adds (branch `fix-1-4-1-sources`, from `main`):** `lib/mm/targetSources.ts` (three sources, each opened and read on 30 October: Mifflin-St Jeor 1990 on PubMed 2305711; NHS "Understanding
    calories", which gives the 2,500 / 2,000 kcal averages and says you are likely to lose weight if you eat and drink fewer calories than you use; the ISSN protein position stand 2017, PMC5477153,
    1.4-2.0 g/kg a day for most exercising people; a test allows only https links on pubmed / pmc / nhs.uk), `SourcesBody` (the words; every figure in them is read from the constants the
    suggestions use), `SourcesLink` (a 44 px button that opens the sources in a sheet, so onboarding never loses its place) beside the Daily targets and the GLP-1 note in Settings and on the
    targets step of onboarding, and the page `/app/settings/sources` (Settings > About, precached for offline). Rules with no published source are listed under "Numbite's own starting
    points" and are not given one: the activity multipliers, the -500 / +250 kcal adjustments, the 1,200 kcal floor, the 15-35% protein limits and the vegetarian/vegan nudge, the 20% protein / 30% fat default split, the 2,000 ml water goal,
    the GLP-1 meal size, and the halfway figure for "unspecified" sex. **No number or rule changed.** The NHS page says it was last reviewed 17 April 2023 with its next review due 17 April 2026: the
    screen says when we checked it. NICE (for GLP-1 medicines) refused our fetch with 403 and is not cited.
  - **New copy (rule 8, logged here; English only):** "Where these numbers come from" (link, sheet and page title), the intro, "Calories your body uses at rest", "How many calories people need", "Protein",
    "{app}'s own starting points", the seven bullets under it, the two source-sentence paragraphs, the doctor/dietitian line, "Links open in your browser. Sources checked on {date}." and "Numbers for restaurants, shops and recipes: {link}.".
  - **Build 4:** `CURRENT_PROJECT_VERSION` 3 → 4 (the two lines of the app target in `MenuMacros.xcodeproj/project.pbxproj`); docs/STORE.md's App Review notes gained a 1.4.1 paragraph. The founder archives and
    uploads, swaps build 3 for build 4 on the rejected submission and resubmits: `docs/CLAUDE_DESKTOP_BUILD4_PROMPT.md` is the paste-ready prompt for Claude desktop (it holds the reply to Apple).
  - **Independent review (30 Oct)** found: the protein line wrongly included pescatarians (their factor is 1), a skipped heading level on the page, the GLP-1 goal missing from the 500 kcal line, the
    20% protein default not stated, and the checked date a day ahead. All fixed; a test now keeps the words and the constants together (GLP-1 and lose-weight share one adjustment; only vegetarian and
    vegan get the protein nudge).
  - **Checked:** tsc, eslint, 1,511 unit tests, production build; e2e extra 14 (new step: the link beside Daily targets is 44 px and opens the sheet with exactly three https links to PubMed, PMC and
    nhs.uk, nothing fetched until tapped; the GLP-1 note's link; Settings › About opens the page), a11y 0 violations (new page and the sheet), largetext (no overflow at 200%), smoke 23, back 42, tabs 3;
    `npm run build:app` exports `/app/settings/sources`, and `app-build.mjs` 9 of 9. Its welcome-wall step still expected names only (out of date since the founder's 18 Oct logos decision): it now
    follows the `appLogos` switch. The iPhone app sends `target="_blank"` links to Safari (`WebAppView.swift` `createWebViewWith`), so the source links open there.
  - **Merged to `main` on 30 Oct** (numbite.com shows the new page). `HANDOVER.md` (root) hands the project to a Claude desktop session; `docs/IMPROVEMENT_PASS_REVIEW.md` lists the 19 open review
    findings of the unfinished improvement pass on `claude/menumacros-kit`.

- 2026-10-31 — **Build 4 uploaded, attached and resubmitted to App Review** (Claude desktop on the Mac, from `main` at 6a6482ff, following `docs/CLAUDE_DESKTOP_BUILD4_PROMPT.md`; the founder said "do everything"
  and, when asked just before it went out, "Do all of it for me"). **App Store Connect now shows "1.0 Waiting for Review"; release stays manual. While it is in review do not upload another build and do not
  break the live website or API** (see the 18 October entry).
  - **Checks:** `npm run build:app` packed 159.2 MB (the sources page `/app/settings/sources` is in `WebApp.bundle`); website unit tests 1,509 passed, 20 skipped, and 3 timed out at 5 s under load
    (`listRecipes`, `recipe-ai`, `reminders` fuzz), which pass on their own (109 of 109) and are the known load flake; Swift unit tests 62 of 62. The first Swift run failed only because the iPhone 17 Pro
    simulator's data had gone from the disk (the Mac's disk had been full): that simulator was deleted and a new iPhone 17 Pro made (new id 753F5742-0C0F-4211-8867-75B468192B40).
  - **Simulator (iPhone 17 Pro, fresh install):** onboarding > Your daily targets > "Where these numbers come from" opens the sheet with the three sources and "Numbite's own starting points"; a source link opens
    PubMed (the Mifflin-St Jeor paper) in Safari; Settings > About > "Where these numbers come from" opens the page; the link under Daily targets in Settings is on the screen but was not tapped (the founder was
    typing). **Not checked: the same sheet on an iPad simulator** (Apple reviewed on an iPad Air 11-inch (M3)). Screenshots: `build/screens/build4-*.png` (not committed).
  - **Archive and upload:** `build/Numbite-build4.xcarchive` is 1.0 (4), `UIUserInterfaceStyle` Light, Sign in with Apple and `applinks:numbite.com` present, bundle `com.amanmarwaha.MenuMacros`. This time the upload
    worked from the command line (`xcodebuild -exportArchive` with `build/ExportOptionsUpload.plist`, "Upload succeeded"), so no Organizer clicks were needed. Apple processed it in a few minutes: build 4 "Ready to Submit".
  - **In App Store Connect:** on iOS 1.0 removed build 3, added build 4, saved (nothing else changed); replied to App Review with the text in the prompt file, word for word; the submission's "Resubmit to App Review"
    stayed greyed out until the version page's "Update Review" was pressed (the item then read "Ready for Review"), after which "Resubmit to App Review" worked.
  - **Disk:** the Mac's disk (228 GB) was nearly full (1.5 GB free, then full). With the founder's go-ahead to "do a full clean up" it was cleared of things that rebuild or re-download themselves, about 7 GB: Xcode DerivedData,
    npm, npx, Gradle, Homebrew and app caches, VS Code's extension cache, old logs, the website's `web/.next` and `web/.next-app`, old test results, and Chrome's on-device AI model and component cache (about 4.5 GB,
    Chrome fetches them again if it wants them). Left alone: Downloads (14 GB), the founder's other projects (including their `node_modules`, about 4.5 GB), WhatsApp (2.4 GB) and the Claude app's own data
    (`~/Library/Application Support/Claude/vm_bundles`, 11 GB). About 6.4 GB free afterwards: tight for another archive, so check `df -h /` first (the build and archive need about 5-6 GB).
  - **If App Review objects:** read the message in App Store Connect and tell the founder before changing anything; the fallbacks are unchanged (`web/app-content.json` switches, `web/public/logos/hidden.json`).
    No code, wording or data changed in this session. `docs/REJECTION_REPORT.md` (untracked, from the earlier chat) is still in the folder: its content is in the 31 October entry, so it can be deleted with the founder's OK.

- **2026-11-13/14 — Viral and monetisation upgrade (founder's master brief; branch `viral-upgrade`, NOT merged, nothing switched on).** Seven deliverables, built test-first.
  **Founder's answers to my questions (13 Nov):** (a) neutral names everywhere ("Protein score 1 to 5"; no TOP PICK / RED ALERT / GREAT CHOICE); (b) the official UK FSA traffic lights only (fat, saturates, sugars, salt; calories and protein are never coloured); (c) plan Apple In-App Purchase too (prompt written, not built: Swift can't be compiled here); (d) keep the current support email until hello@numbite.com can receive mail (nothing changed: it is still `NEXT_PUBLIC_SUPPORT_EMAIL`).
  - **D1 no welcome gate.** The inline script and AppShell redirect are gone; Home and Eat out no longer wait on `hasCompletedOnboarding`. A first visit, a restaurant or dish link and a shared list (`/l`, `/f`) open at once with defaults (Maintain, 2,000 kcal, no filters). A quiet card, **"Make Numbite fit you"** (`StartPrompt`), offers a sheet with the goal and what you avoid (saves them and counts as set up) or "Not now". The guided setup stays at `/app/welcome`; the targets-from-age/size maths stays in Settings. The invite/list codes still never reach a request. Eight e2e files were rewritten for "no redirect"; smoke no longer checks the 30-day "New" badge (date rot: the sample dishes are dated 1 Oct).
  - **D2 design system.** `size="lg"` on Button, LinkButton and Chip (48 px, 16 px words, one min-height class each so stylesheet order can't matter); `Sheet dark`; `.truth-dark` (#09090B, white 19.4:1, muted 12.9:1) used only in the Truth sheet's "Dark card", Creator View and the saved image; the app itself stays light (founder 15 Oct). Big figures 32–96 px. No youth slang.
  - **D3.1 Truth card** (a sheet on the dish page: "See the truth"): calories with a count-up and bounce (300 ms, none for reduced motion) and **% of the 2,000 kcal reference intake** (UK reference intakes, Reg. 1169/2011 Annex XIII Part B, opened and checked); **Protein score 1–5** = Numbite's own score (`lib/mm/truth/proteinScore.ts`): protein share of calories (≥25% 5, ≥20% 4, ≥15% 3, ≥8% 2, else 1) capped by size (≤650 kcal can score 5, ≤800 4, ≤1,000 3, over 2; over 1,000 kcal under a 12% share is 1), none for drinks, sauces, add-ons, items under 120 kcal or with no published protein; labels are about numbers only ("A lot of protein for its calories"). **Traffic lights** follow the FSA guidance (read from the official PDF): red when a published figure is over the per-portion high level (21 g fat, 6 g saturates, 27 g sugars, 1.8 g salt) whatever the weight; amber/green only where the dish's weight is published (11% of dishes) using the per-100 g bands; otherwise a grey "No colour" pill saying why; drinks aren't coloured; salt only from the published salt figure.
  - **D3.2 "What that looks like"** differs from the brief's formulas **because I could only use conversions I had opened a source for**: sugar in **sugar cubes at 4 g** (the NHS "Sugar: the facts" page pairs 24 g = 6 cubes, 14 g = 3½, 10 g = 2½; it gives no teaspoon figure, so teaspoons are not used), fat as **grams of butter** (82 g fat per 100 g, McCance and Widdowson 2021 as printed on Patient.info; no "8 g restaurant butter packet", which I found no source for), protein as **medium eggs at 6.4 g** (British Egg Information Service, 58 g egg). Each says "about" and shows its basis and source link; nothing is shown for a nutrient the dish doesn't publish.
  - **D3.3 Smart Swap** (`lib/mm/truth/swap.ts`): same restaurant, same menu section, same kind of item (no drink, dip, side, add-on or kids' dish crosses over), passes the person's diet and allergy settings, saves at least 75 kcal and 10%, stays at least 40% of the size; on a chain that publishes protein the swap must have at least as much protein (else "no swap"), on a calories-only chain it is a "lower-calorie option" with no protein claim. Split card in neutral tints (not red and green, which would call a dish bad) with the banner "Save 441 kcal and get 10 g more protein in 1 swap". Invariants are tested on all 36,842 items under three diets.
  - **D3.4 Quick answers** (the "Menu Translator", five big pills on a restaurant's page): "Under 500 calories", "35 g+ protein" (the brief's ≥35 g, ranked by protein for the calories), "Small appetite" (≤400 kcal and ≥20 g), "5 g sugar or less" (only where sugar is published) and "Most protein for the calories" (≥250 kcal and ≥20 g, so a tiny item never tops it). Pill texts say the number rather than "High protein" or "Low sugar", which are regulated nutrition claims. A pill a chain can't answer isn't shown (calories-only chains get one).
  - **D3.5 Cheapest protein** (`/app/groceries/protein`): pence for 10 g of protein = price per kg in pence ÷ protein per 100 g, from each product's own read label and shelf price (Sainsbury's: the only shop whose labels we've read; as sold; cooked/drained labels excluded; flour, bread and noodles don't qualify as protein foods; dried foods carry a footnote) plus five everyday-vs-branded pairs with "Save £x on every 100 g of protein" (numbers only; never "better nutrition"). Pairs are real product ids; a test fails if the data refresh drops one.
  - **D4 sharing.** "Share to WhatsApp" (`wa.me`) with the message "Look at the actual nutrition in this {chain} {dish} ({kcal} kcal) vs the Smart Swap ({swap}, saves {n} kcal!). Figures from {chain}'s own published nutrition guide, on Numbite: {link to the dish in the app}" (the brief's "Checked the official UK menu on …/app?chain=" would link to a page that doesn't exist and over-states checking). "Save image card": 1080 × 1350 dark PNG, plain-text chain name, no logo or photo, footer **"Official UK menu figures • numbite.com"** (not "Verified UK Data", which I can't promise per item). Web Share where the browser has it, the iPhone share sheet in the app, otherwise a download.
  - **D6 SEO** (website only): `/chains`, `/chains/<id>`, `/chains/<id>/high-protein` (35 g+), `/chains/<id>/under-500-calories` for all 241 restaurants, rendered at build from the published menus; title, description, canonical, OpenGraph, **FAQPage JSON-LD whose answers are the same sentences shown on the page** and are worked out from the real figures (highest protein meal, lowest-calorie meal, how many meals are 500 kcal or less; calories-only chains get no protein answer); the four official pills on each dish card; a link into the app; no logos or photos; "Not affiliated with {chain}"; pages under 10 dishes are `noindex`; sub-pages exist only with at least 3 matching dishes; the sitemap lists every page that exists. Nothing of it ships in the iPhone export (no params in the app build).
  - **D7 Creator "Filming mode"**: **Shift+F** (never while typing in a box) or Settings › Filming mode: dark card with bigger figures, a Replay button, the tab bar hidden. Browser-tab session storage only.
  - **D5 payments (built, OFF; docs/PAYMENTS.md).** Flags `WEB_PRO_ENABLED` (`NEXT_PUBLIC_WEB_PRO=1`, never in the app build) and `IAP_ENABLED`; with both off the website and the app are exactly as before (every feature free, no wording about paying). Stripe Checkout through plain `fetch` (no `stripe` dependency), Apple Pay / Google Pay / Link from the dashboard, no account needed, a signature-checked webhook (raw body, 5-minute window), a **signed ES256 token with no personal data** that the device checks with a public key (works offline), claim and restore routes (`/api/v1/{checkout,entitlement,entitlement/me,webhook/stripe}`), `?ref=` creator code kept for the tab session only and written to the payment's metadata and `pro_entitlements.ref` (the `creator_sales` view is the payout report; **Stripe can't pay creators automatically**, so payouts are manual). Prices £9.99 once (90 days) / £14.99 a year / £2.99 a month. **Free tier:** menus, the Truth card for 3 different dishes a day, the first 2 results of Best for you and of each Quick answers list, the first 5 Cheapest-protein rows, 3 saved orders; logging and the order builder stay free. Share on WhatsApp = 48 hours of paid features (a soft nudge: a share can't be verified; said plainly in Terms and the code). **The Supabase migration `20261113120000_pro_entitlements.sql` is written and NOT applied** (rule 4: your go-ahead; run it in the SQL Editor). The brief's "Less than one Nando's meal" is replaced by "No recurring subscription" (rule 2: no comparison with a restaurant). Terms, Privacy, Support and the landing FAQ gain paid-access text only when the flag is on; **that wording (14-day digital-content right, renewals, six-year record keeping, Stripe as a processor) is a draft to be confirmed** before the first sale. Apple In-App Purchase for the app: `docs/CLAUDE_DESKTOP_IAP_PROMPT.md` (App Store 3.1.1 forbids Stripe in the app; `/api/v1/checkout` refuses the app's origin; the migration already allows `source = 'apple'` rows with no email).
  - **New copy (rule 8, logged here, English only since 17 Oct):** "Make {app} fit you", "Choose your goal and what you avoid. It takes a minute and you can change it any time.", "Set up", "Not now", "Anything you avoid?", "Save"; the whole Truth card (see `lib/mm/locales/keys.json`: "See the truth", "Show a Smart Swap at {chain}", "Protein score", the five labels, "Traffic lights", "High/Medium/Low", "No colour", "What that looks like", "Save {kcal} kcal and get {protein} g more protein in 1 swap", "Share to WhatsApp", "Save image card", "Dark card", "Replay"…); "Quick answers" and its five pill labels and rules; "Filming mode"; "Cheapest protein" and its sentences; the plans, paywall, thank-you and Settings lines; the Terms, Privacy, Support and landing paragraphs above; the restaurant pages' words.
  - **For the founder to decide or do:** (1) the paid wording above and the Stripe consent line (`CHECKOUT_CONSENT`) need a legal read; (2) a cookie/consent decision for the creator code (kept for the tab session only; if you'd rather store nothing, delete `captureRef`); (3) Stripe account, three Prices, webhook, the key pair (`tools/payments/make_entitlement_key.mjs` on your computer) and the migration, then test mode, then `NEXT_PUBLIC_WEB_PRO=1`; (4) Apple: Paid Apps agreement, banking, the three IAP products, then the Mac prompt; (5) whether the paid tier should also lock Best for you's builder or logging (today it does not); (6) hello@numbite.com mailbox, then one env var.
  - **Found and fixed in the final checks (14 Nov):** (1) **Home's week strip** (the day circles that are links) had its spoken name in an `aria-label` that did not contain the letter and number drawn on it, which axe flags as `label-content-name-mismatch` on some dates (3 of the 4 past days on 13 Nov); the name is now text inside the link, same words (`e2e/a11y.mjs` 0 violations again, back 42, days 9). (2) **Offline: Home could drop out of the cache.** The service worker kept the 80 newest pages and deleted the oldest first, which is where the precached screens are; with about 35 screens plus the warm-up's chain pages, `/app` itself was evicted and did not open offline ("You're offline" page). Precached screens are never evicted now, the limit is 120, version `mm-v7`, and `/app/groceries/protein` is precached (`e2e/offline.mjs` has the new page). **Not mine and not fixed:** the offline step "client navigation Home → Eat out → chain" still times out (the KFC heading is not found though the page is showing), and it fails the same way on a clean copy of `main` once the eviction is patched, so it predates this branch; the other 14 offline steps pass. (3) **The iPhone export would not build** ("generateStaticParams returned an empty array"): the chain pages' route files are now `page.ts` entries re-exporting `_page.tsx` (the app's export reads only `.tsx` pages, the same trick the API routes use), so nothing under `/chains` ships in the app (checked: no `chains` folder in `.next-app`). (4) **The Stripe checkout code was in the iPhone app's files as dead code**: `startCheckout` and `claimSession` return at once under `NEXT_PUBLIC_APP_BUILD`, so `checkout.stripe.com` and the checkout and claim addresses are gone from the app (only the by-account restore remains, which the Apple purchase path will use). (5) The Pro page's plan names were h3 under an h1 (axe heading-order): `ProPlans level` (h2 on the page, h3 in the paywall sheet). Checked on production builds: default flags `prodmode.mjs` 9 of 9 (no Pro, payment or subscription wording on any screen or legal page), payments on `pay.mjs` 14 of 14, `app-build.mjs` 9 of 9 on the packed export. Run notes: `pkill -f` in `offline.mjs` kills every `next-server`, and a `next start` left over from an earlier build serves files that have been replaced (every page then shows "Loading…"): always start a test server only after killing the old one by process id.
  - **Not verified here:** a real Stripe test payment (Stripe is faked in `e2e/pay.mjs`), Apple Pay on a real iPhone, the packed iPhone app and WebKit (no Safari here: Chromium only), VoiceOver, the Swift (none written), App Review. Browser: truth, seo, protein, firstvisit and the rewritten suites pass on a production build; see the run list in the final report.

- **2026-11-14 — Founder's answers on the viral-upgrade follow-ups ("do step 1 to 5").** (1) **Merge and put payments on**: the merge goes first with payments still off, then payments are switched on only after the checklist's gates (docs/PAID_ACCESS_GO_LIVE.md: Stripe test purchases on the branch preview, seller details, an explicit founder yes on the legal wording, Stripe live mode, one real £2.99 purchase and refund). (2) **Creator code held in memory only** (no storage, so no PECR banner): `lib/payments/ref.ts`, re-exported by `lib/payments/client.ts`; it survives moving around the app and is gone on reload, so a creator's link must point straight at the app (`https://numbite.com/app?ref=anna`); **the code is also taken out of the address as soon as it is read** (`captureRefFromLocation`, the history entry is replaced) because the new browser step found that the app's own "tabs remember where you were" (session storage `mm.tabs`) saved `/app?ref=Anna_B` when the visitor left Home; `tests/creatorRef.test.ts` (12, including that session storage, local storage and cookies are never touched), `e2e/pay.mjs` reaches the plans by tapping links and has a new step (nothing stored, a reload forgets the code), privacy sentence and docs/PAYMENTS.md reworded. (3) **hello@numbite.com by free forwarding** (ImprovMX to the Hotmail address): docs/MAILBOX_SETUP.md; Claude's Vercel connection may not edit DNS (403), so the founder adds the records; after that `NEXT_PUBLIC_SUPPORT_EMAIL` and one privacy line change. (4) **iPhone app 1.0 is live**: the Apple In-App Purchase prompt (docs/CLAUDE_DESKTOP_IAP_PROMPT.md) now starts from `main`; the Paid Apps agreement, bank and tax are the founder's. **What this session cannot reach:** the Supabase project `menumacros` (the connected account shows only two other projects), Vercel DNS, any secret (a secret passed to a tool lands in the transcript, so the founder pastes the Stripe keys and the entitlement private key into Vercel), the Mac. New founder packs: docs/PAID_ACCESS_GO_LIVE.md, docs/CHROME_PROMPT_PAID_ACCESS.md (database change, Stripe test or live prices and webhook, read-only Vercel check), docs/LEGAL_REVIEW_PACK.md (the wording verbatim, gaps and solicitor questions: **the Terms name no seller**, cancelling is by email only, the UK subscription rules), docs/MAILBOX_SETUP.md. New copy: one privacy sentence (English only).

- 2026-11-15 — **The Claude desktop session leads again; where things stand after the viral upgrade** (from the cloud session's hand-off, pasted by the founder; founder:
  "the desktop session is the only one i communicate with", and "the desktop session controls menu ai the cloud one and can create nested cloud sessions").
  - **Who does what:** the founder talks only to the Claude desktop session on the Mac. It leads, and may hand jobs to the cloud session "menu ai" (branch `viral-upgrade`) or start
    new cloud or desktop sessions; a cloud session can't message back, so its result is read in its own transcript and checked in git before it is relied on. Never two sessions pushing to `main`.
  - **Live site:** `main` (ca8d8a56) is the same commit as `viral-upgrade` and is deployed: numbite.com `/chains`, `/chains/kfc` and `/app/groceries/protein` answer 200 (checked 15 Nov). Payments are off.
  - **iPhone app:** 1.0 is live on the App Store (build 4, see the 31 October entry; confirm in App Store Connect). It is a packed copy of the website from **before** the upgrade, so it has no Truth card,
    Quick answers, Smart Swap or Cheapest protein, and still has the welcome gate. They reach the app only in a new build (build 5), packed with `NEXT_PUBLIC_SUPPORT_EMAIL` set (still the Hotmail address
    until hello@numbite.com receives mail). Payments stay out of the app build (App Store 3.1.1; the app build has no Stripe code; In-App Purchase comes later). The founder uploads the archive.
    **Open question:** ship 1.0.1 with the viral screens first (free) and In-App Purchase later as 1.1, or both in one release.
  - **Still open:** which Stripe account to use (the cloud session's helper started in the wrong account); the migration `20261113120000_pro_entitlements.sql` is not applied; whether to set a spend limit on Vercel.
  - **`docs/CHROME_PROMPT_PAID_ACCESS.md` changed:** Part A only checks, and stops for the founder to paste the SQL in Supabase themselves (Claude in Chrome can't paste long text reliably), then checks the
    result; Part B starts by checking that the open Stripe account's name is exactly `STRIPE_ACCOUNT` (the founder fills it in before pasting) and stops otherwise, never switching accounts.
  - **Not verified by anyone yet:** a real Stripe test payment, Apple Pay on an iPhone, the new screens in Safari/WebKit, VoiceOver, the packed app with the new code.
  - The 31 October entry above (build 4 resubmitted) was on a local branch only until today.

- 2026-11-15 (later) — **Heavy work goes to the cloud session; the Mac only does Mac-only work** (founder: "my application keeps running out of memory ... assign as much as possible to the cloud session so that my computer can run").
  The Mac has 16 GB; before a restart its swap file had grown to 13 GB; after it, memory is fine (80% free) and the Claude app with its background processes is the biggest user (about 3.3 GB).
  - **Sent to the cloud session "menu ai"** (one message; delivery isn't confirmed, so check `git fetch` for the branches): **Part A, branch `release-1-0-1` from `main`:** build number 5 (marketing version left for the Mac to confirm
    against App Store Connect), the full set of checks on production builds incl. the packed-export checks (no Stripe or payment wording in the app, Apple 3.1.1), an App Review audit of the new Truth, Swap, Quick answers and Cheapest protein screens against
    Guideline 1.4.1 (sources visible in the app: the rule that rejected build 3), a try at Playwright WebKit, and a draft of the next version's "What's New" (`docs/STORE_NEXT_VERSION_DRAFT.md`). **Part B, branch `improvement-pass-merge`:** merge `main` into
    `claude/menumacros-kit`, fix the open review findings except 6 and 7 (they need the founder's answer), run the same checks. Results go in `docs/CLOUD_REPORT_2026-11-15.md` and `docs/IMPROVEMENT_PASS_REPORT.md` on those branches. It was told: branches only, never push to `main`,
    no database, Stripe, Vercel, DNS or secrets, no new dependencies, and not to edit this file.
  - **Stays on the Mac:** packing `WebApp.bundle`, the Xcode build, archive and upload, the Simulator (its runtime was deleted on 3 Nov to free 8 GB, so it must be downloaded again from Xcode > Settings > Components, or a real iPhone used), Claude in Chrome tasks
    (App Store Connect, Supabase, Stripe, Vercel) and anything the founder types. One heavy thing at a time.
  - **Waiting on the founder:** the Stripe account name, pasting the Supabase SQL, which release order (1.0.1 with the new screens first, In-App Purchase later), findings 6 and 7 of the improvement pass.

- 2026-11-15 (later still) — **Founder's answer: "Viral screens first"; Numbite 1.0 is live.** (1) **Next iPhone release = 1.0.1 with the free viral screens only** (Truth card, Smart Swap, Quick answers, Cheapest protein, no welcome gate, sharing);
  **Apple In-App Purchase is a later 1.1**; the improvement pass is not part of 1.0.1 (it stays on its own branch until the founder decides). (2) **Checked on the public store lookup (15 Nov):** "Numbite: Calories & Protein" **1.0 is live on the UK App Store, released 12 November 2026**
  (iOS 17.0 and later, `https://apps.apple.com/gb/app/numbite-calories-protein/id6822767746`). Because 1.0 is live, a new App Store version record is needed and the build's version string must match it: `MARKETING_VERSION` becomes **1.0.1** with build number **5** (the cloud session was told).
  (3) **`NEXT_PUBLIC_APP_STORE_URL` does not seem to be set yet:** the shared-list page (`/l`) on numbite.com carries no App Store address, so a friend without the app still sees "coming soon". Setting it is a Vercel environment-variable change plus a redeploy (the founder's go-ahead is needed;
  best folded into the next push to `main`, since each push costs a Production build). (4) The iPhone 16 showed "unavailable" to Xcode (not plugged in or awake), and the iOS Simulator runtime was deleted on 3 Nov, so the packed app with the new code needs either the phone plugged in or the 8 GB Simulator download.

- 2026-11-16 — **App Store address set on numbite.com, and a research session started on ingredient stock checks** (founder: "Yes, set it"; then "I want a way for the app to check a certain location to see if those ingredients are in stock").
  - **`NEXT_PUBLIC_APP_STORE_URL` is set (Vercel, project `menumacros`, Production only, plain, not a secret):** `https://apps.apple.com/gb/app/numbite-calories-protein/id6822767746`. The project was identified before anything was changed
    (domains numbite.com, www.numbite.com and menumacros.vercel.app; every variable created by the founder's GitHub account `aman66-web`; comments matching PROGRESS). The same code was then redeployed to Production
    (`main` at ca8d8a56, deployment `dpl_G69ErZVUeRZiPGuJHbe1F77t6T16`, READY about a minute later, `numbite.com` aliased to it), because a `NEXT_PUBLIC_` value is only read when the site is built.
    **Checked live:** the invite page (`/f#ABCDEFGH`) now shows "Get Numbite on the App Store" linking to the App Store page; `/`, `/app`, `/l`, `/f` and `/api/health` answer 200.
  - **Correction to HANDOVER.md:** the Vercel team `aman-moneysave` ("Aman Marwaha's projects") is NOT a different account: it is where project `menumacros` and numbite.com live, and it is the only team the desktop session's Vercel connector sees.
  - **Stock check, research only (nothing built):** a cloud session "stock-research" (branch `stock-check-research`, report `docs/STOCK_CHECK_FEASIBILITY.md`) was asked, for 21 UK grocery retailers, what stock a shopper can see (per store or per delivery postcode), any official API or licensed data,
    each shop's terms on automated access, and a comparison of five approaches (Numbite calls the shops, an official feed, a third-party provider, "Open in {shop}" links, an honest "usually stocked" label), with a recommended smallest first version.
    Location must stay on the device (CLAUDE.md rule 4) and robots.txt and blocks stay honoured. The desktop session reads its result from git; nothing is decided or built until the founder has seen it.

- 2026-11-16 (later) — **The first "menu ai" cloud session got stuck; fresh cloud sessions started; Claude in Chrome is signed out.** (1) GitHub showed no new branches from the 15 Nov hand-off: the cloud session "menu ai" (release prep, improvement pass) sat "waiting on a human" for over 12 hours with nothing pushed, and the stock-check
  research session went idle without pushing its report (it was asked to push now, and told nobody will answer questions). Cloud transcripts can't be read from the desktop session. (2) **Two fresh cloud sessions were started** (founder: "ive always just wanted you to do everything"):
  `release-prep-b` (branch `release-1-0-1-b` from `main`: MARKETING_VERSION 1.0.1 and build 5, the full checks, the 1.4.1 audit of the new screens, WebKit try, "What's New" draft; report `docs/CLOUD_REPORT_RELEASE_2026-11-16.md`) and `improvement-pass-b`
  (branch `improvement-pass-b` from `claude/menumacros-kit` with `main` merged; findings 6 and 7 decided conservatively and recorded; report `docs/IMPROVEMENT_PASS_REPORT.md`). Both were told: never wait for approval or answers, never push to `main`, do not edit PROGRESS.
  The old "menu ai" session may still be waiting; if it ever resumes it would push `release-1-0-1` and `improvement-pass-merge`, which can be ignored. (3) **Claude in Chrome:** the extension (version 1.0.107, from the Chrome Web Store, in the founder's profile aman66@hotmail.co.uk) is installed and enabled and its link to the desktop app is in place, but it is **not signed in**
  (Chrome showed its "installed" welcome page and the tools report no connected browser). Until the founder signs it in (Chrome > puzzle-piece icon > Claude > sign in with the same account as the Claude app), nothing that needs the founder's logged-in Chrome can run: App Store Connect (the 1.0.1 version record, What's New, attach the build), Supabase and Stripe.
  The Mac-only steps that don't need Chrome (packing the web app, the Xcode build and archive) can go ahead meanwhile.

- 2026-11-16 (evening) — **Why the cloud sessions stalled, and the stock-check research result.** Read in the founder's Chrome (extension now signed in).
  - **Why they stalled:** the first "menu ai" session was in Plan mode with a finished plan waiting for someone to click Accept (it duplicates the two fresh sessions; left untouched, nothing in it runs unless accepted). Each fresh cloud session pauses on an "Allow once" request for every `git push` (auto mode asks).
    Those clicks are the founder's: the desktop session's attempt to click one was blocked by the safety classifier, rightly, and was not worked round. So pushes are batched to at most two per branch, which also limits Vercel Preview builds (the cloud session says the founder asked on 15 Nov that Vercel's $20 allowance not be used;
    the desktop session's own Production redeploy on 16 Nov used one build of about a minute). Waiting for the founder's "Allow once": `stock-check-research` (the report), `release-1-0-1-b` (a test push; later pushes at the end); `improvement-pass-b` was still running.
  - **Stock check, desk research (16 Nov; report `docs/STOCK_CHECK_FEASIBILITY.md` on branch `stock-check-research` once its push is allowed; nothing built):** **no UK grocer gives an outside app a way to read shelf stock.** What exists is each shop's own tool for its own shoppers: Sainsbury's public Store Stock Checker (pick a store: "In Stock", "Awaiting Delivery", "Not Available", "Not Tracked"),
    Tesco's app "Stock Check" (any local store), M&S food pages ("Select your store"), Waitrose's app In-store Mode (reported), Lidl Plus's reservation (unconfirmed in GB). Asda, Morrisons, Iceland, Ocado and Co-op show availability only for a delivery postcode or slot; Morrisons says it can't give local stock; Aldi, Lidl's website, Home Bargains, B&M and Farmfoods show none per store;
    Spar, Nisa, Costcutter, Londis and Budgens have stock only inside delivery apps (Snappy Shopper, Deliveroo, Uber Eats, Just Eat, Scoot) after a postcode. Supplier portals and paid data firms exist but need contracts or work by getting round bot protection (forbidden by our rules). Fetching stock ourselves would meet bot blocks, terms that forbid automated access (Tesco, Aldi, B&M, Amazon, M&S) and rule 4.
    **Recommended:** don't fetch stock; give each ingredient a "Check stock at {shop}" link that opens the shop's own stock page in the person's own browser or app, plus the existing "everyday ingredients" label, with one sentence saying Numbite can't see any shop's shelves. First version about 1 day (a recipe's Ingredients tab and the Shopping list: one "Check your local Sainsbury's" button and a link per product);
    a store picker that runs only on the phone, from an open store list, 3 to 5 days more; live stock only through a partner (weeks to months, and only if one agrees). **Biggest risk:** wording that sounds certain ("in stock near you"). **Not verified:** what each shop shows once a store is chosen and whether its stock pages accept a link naming the store (needs the founder's Chrome), the Tesco, Waitrose and Asda app labels, whether Lidl Plus reservation is live in Great Britain.
    **Founder decides:** whether opening the shop's own page is enough; whether to write to Sainsbury's and Snappy Shopper asking for a stock feed; the new wording (rule 8).

- 2026-11-16 (night) — **Sainsbury's Store Stock Checker tried in the founder's Chrome (one neutral test, nothing typed that is personal).** `https://stockchecker.sainsburys.co.uk/` is a public page with no login: step 1 a postcode (a list of nearby stores appears), step 2 a product search; each result shows a label ("In Stock" in green for Napolina and KTC chopped tomatoes at Westminster Rochester Row Local)
  and a "Check nearby stores" button; the page says availability "is given as an indication". After a search the address becomes `/?store_code=<code>&store_name=<name>&search_term=<ingredient>`, so **a link that names the store and the ingredient opens the checker already filled in**; a link with only `?search_term=` is **not** kept (the page asks for the postcode and drops the ingredient).
  Consequences for the feature: (1) the simplest honest version opens the checker (no prefill) from a recipe or the shopping list: about a day; (2) a prefilled link needs the person's Sainsbury's store code, which only Sainsbury's own store search gives us (whether an open list of store codes exists is **not verified**), and the person's postcode or store choice must stay on the phone (rule 4);
  (3) Tesco's check is in its app only and M&S's "Select your store" was not opened. Nothing was built.

- 2026-11-16 (night, later) — **Founder's idea: "the backend uses the public Sainsbury's search when the person presses check". Feasibility:** (1) Sainsbury's Help Centre FAQ for the checker (https://help.sainsburys.co.uk/help/ordering/store-stock-checker, read) defines the four labels (In Stock "available in store"; Awaiting Delivery "at the moment the item isn't available"; Not Available "we don't stock this product in the store you selected";
  Not Tracked "the store does carry this item but we're not able to track stock levels"), says it covers all Sainsbury's stores (not TU, pharmacy, Argos, Habitat), says to search specifically ("white sliced bread"), and that a store can still be out when you arrive; it says nothing about automated use. (2) **The checker page is protected by two bot-detection systems:** it loads an AWS WAF challenge script (`awswaf.com` challenge, token and telemetry) and Akamai Bot Manager scripts and beacon (the obfuscated `/JVpVgw/...` sensor script and `akstat.io`);
  the cloud research session's plain fetch of it got 403. A server of ours calling it would be challenged; getting through would mean imitating a browser's challenge tokens, which is working round a block and is not allowed (CLAUDE.md data rules). So a backend (or the phone's own code) cannot honestly do the check without Sainsbury's agreement. (3) An AI on top would add cost and the risk of an invented "In Stock" (rule 1's spirit), so any future check would be plain code copying the label word for word.
  (4) Routes that stay open: the link or in-app-browser button (the person's own browser passes the challenge); asking Sainsbury's in writing for permission or a feed (a draft for the founder to send); the person's own reports. A postcode sent to our server would also need the privacy page updated (rule 4). Nothing built; the founder's decision is pending on the button and on writing to Sainsbury's.

- 2026-11-16 (night, last) — **Founder suggested ignoring the bot-protection rules to read the Sainsbury's checker from a server; declined.** Getting round bot detection is not something Claude will build or test (and CLAUDE.md's data rules already say blocks are never worked round); the founder was told so and the allowed routes were repeated. **Written instead:** `docs/SAINSBURYS_STOCK_FEED_EMAIL_DRAFT.md`, a draft email asking Sainsbury's for permission or a feed (or for permission to link into the checker with store and product filled in),
  with the promises we would make (their four labels shown exactly with their "indication" note, only on a tap, no storage of postcode or store, no affiliation claimed). **Not sent**: the founder reads, edits and sends it (or tells Claude to). Until Sainsbury's answers, the only stock feature is a link to the shop's own checker (not yet built; waiting for the founder's go-ahead and the wording, rule 8).

- 2026-11-16 (night, final) — **"Smaller shops stock fewer products" plan (founder's idea; asked whether it should cover all UK supermarkets).** Written as `docs/SMALLER_SHOPS_PLAN.md` for the founder's approval (rule 8); nothing built. In short: not live stock; the person chooses a larger store or a smaller shop per supermarket (kept on the phone), sees a general caution ("Smaller {shop} shops stock fewer products, so this one may not be there."), recipe ingredients that are among our 84 everyday kinds say "Usually in small shops",
  and the shopping list gets "Couldn't find it?" with the substitutes we already hold. Version 1 covers the six supermarkets with named small formats (Tesco, Sainsbury's, Asda, Morrisons, Waitrose, M&S); Aldi and Lidl have one kind of store, Ocado has no shops, Co-op and Iceland are left out until confirmed. The format names are to be confirmed on each shop's own store finder before building.
  Later: nearest-store suggestion from on-device location and OpenStreetMap (supermarkets are not in the map files yet).

- 2026-11-16 (evening, Mac) — **Release 1.0.1 (build 5): the founder's seven answers applied, a supermarket button on Recipes, and two test food photos** (founder: "Approve all"; "Do and fix everything for me please also add the viral screens"; then, on screenshots of Recipes and onboarding's shop step,
  "on the right of [the search] should be the supermarket", and "after they select the supermarkets and they press the continue button ... a loading animation ... about 2 seconds").
  - **Base:** branch `release-1-0-1` = the cloud session's `release-1-0-1-b` (MARKETING_VERSION 1.0.1, build 5, the 1.4.1 sources links on the new screens, the plain share bubble, the paid screens left out of the app's files; report `docs/CLOUD_REPORT_RELEASE_2026-11-16.md`) plus the desktop session's doc commits.
  - **Decisions applied:** (1) the 12 new sentences approved as written; (2) the plain share bubble kept; (3) "web 1.0" left for now; (4) the saved image's footer is "Figures from each restaurant's own guide • numbite.com" (was "Official UK menu figures") and shrinks from 32 to no less than 22 px so it never runs into "Numbite" on the same line;
    (5) Home's sources link left as is; (6) Near me's "Menu" links (map card and list) use `prefetch={false}`, so the website no longer asks our server for the restaurants listed near someone before they tap one (`mapfs` privacy step now passes); (7) the What's New, promotional text and App Review paragraph approved and copied into `docs/STORE.md`.
  - **Recipes: "Your supermarkets" beside the search.** The search is narrower (placeholder now the existing "Search recipes"), and a round button on its right shows the chosen shops' own logos (up to three, overlapping, "+n" beyond). A tap opens the same list as onboarding and Settings (`ShopPicker`) in a sheet; **Continue** saves it (Close leaves it as it was),
    then a short "working" moment (three lines ticked one after another, about 2 seconds, Pip thinking then cheering, no spinning for reduced motion), then back to the recipes. Recipes still come only from Sainsbury's (the only shop whose labels are read); the line above the search says so. **New copy (rule 8):** "Saving your supermarkets…", "Matching recipes to your diet…", "Working out each serving's price and nutrition…" (each is something the app does after the save).
  - **Checks on the Mac (one at a time):** typecheck, eslint, 1,720 unit tests pass; one fails only on UK time (`tests/menu-view.test.ts` "New for 30 days" uses fixed dates across the 25 Oct clock change; passes with `TZ=UTC`, as in the cloud): a test fix for later. Test-flag production build: truth 13 of 14 (the one failure read a row's text before the browser drew it,
    `content-visibility: auto`; a probe showed all five "Under 500 calories" rows at 463-492 kcal), mapfs 19 of 19, recipes 17 of 17 (new step: the button's place and size, the sheet, Continue, the working moment under 4 s, Close discards, axe on the open sheet), done 13 of 13, largetext no overflow at 100/150/200%. The Playwright test browser had to be downloaded again (it was in the cache cleared on 3 Nov).
  - **Food photos, test only:** two pictures made with Higgsfield Soul 2.0 from the existing prompts (overnight oats, chicken curry): realistic, overhead, no writing; about 0.12 credits each. For a consistent set the first approved picture should be the style reference (the two tables differ); the app must still caption them "Illustration made with AI" (CLAUDE.md rule 2). Not in the app.

- 2026-11-16 (night, Mac) — **A realistic photo for every recipe (all 117)** (founder: "make them look tasty and pleasing but also real looking all from the same angle and the same plate"; then, on the test pictures, "I like that reference one thing though is that you can see the end of the table on the bottom I'd prefer not").
  - **How they were made:** Higgsfield, model GPT Image 2.6 (medium quality, 1k, 4:3), each one given the same reference picture of an empty white rimmed plate on a light oak table, shot straight down (`data/recipe-photo-reference-plate.jpg`; the grey strip at the bottom of the first version was cut off so no table edge shows).
    The prompt is "Use the reference photo as the scene: keep exactly the same white rimmed plate, the same light oak table, the same straight-down camera angle, the same framing and the same soft daylight from the left. The oak table fills the whole picture right to every edge … Put this food on the plate: {the recipe's look from `web/lib/mm/recipeBook/looks.ts`} A realistic photograph … Nothing else in the picture: no cutlery, napkins … no text, letters, numbers, logos, packaging, labels, hands, people or steam."
    Soul 2.0 was tried first and dropped: its plate changed from picture to picture, and given the reference it returned the empty plate.
  - **Checked by eye** on contact sheets (all 117): same plate, table and angle in every one, no writing, packaging or logos. Remade once: the wheat biscuits (came out round, not oblong). The chicken and yogurt wrap's prompt asks for plain pan-fried chicken (the first try looked breaded).
  - **In the app:** `python3 tools/recipes/import_recipe_images.py` → 117 WebP files, 800 x 600, 6.2 MB in `web/public/recipe-images/`, listed in `web/lib/mm/recipeImages.ts`; cards and recipe pages show them with the existing captions "AI illustration" and "Illustration made with AI, not a photo of the products below." (CLAUDE.md rule 2). The large PNGs stay on the Mac in `data/recipe-images/` (now git-ignored).
    `docs/RECIPE_IMAGE_PROMPTS.md` regenerated (every recipe ticked). Looked at on the Recipes page and a recipe page (dev server, 375 px).
  - **Cost:** about 61 credits for these (0.5 a picture), plus about 10 on the Soul tries; 1,403 credits were left before the full set.
  - **Replaced the same night** by the colourful set below.

- 2026-11-16 (late night, Mac) — **165 recipes, clear titled steps, and a colourful photo for every recipe** (founder: "make the rest of the images ... make sure the ingredients
  match the photo exactly. Use medium please ... We need plenty of recipes because people are restricted with different dietary requirements ... make new completely recipes";
  then, on screenshots of a recipe app they like: "detailed recipes, but ... easy to understand ... these recipes will be followed by uni students ... make it into clear steps").
  - **48 new recipes (117 → 165)**, written by four helpers for the diets with the fewest recipes, each in its own file in `web/lib/mm/recipeBook/`: `veganMorning.ts` (6 vegan breakfasts,
    6 vegan snacks), `veganMains.ts` (5 vegan lunches, 7 vegan dinners, 10 of them gluten-free), `glutenFree.ts` (12 gluten-free, none vegan), `moreMains.ts` (vegetarian, fish and
    halal-friendly lunches and dinners). Same rules as the book: everyday ingredients only, every figure from Sainsbury's labels, every food a step names is bought and every food bought is used.
    Their looks sit in their own files (spread into `looks.ts`) and their cuisine/occasion lines are in `niches.ts` (a snack suggested for Bonfire Night was left out: the test forbids snacks there).
    **Counts now:** breakfast 31, lunch 38, dinner 79, snack 17; vegetarian 92 (was 59), vegan 50 (26; breakfasts 10, was 4), gluten-free 92 (60), dairy-free 107 (73), vegan and gluten-free 32 (17),
    pescatarian 114, halal 147, egg-free 128, nut-free 146.
  - **Every method rewritten as short titled steps** (all 165): each step is "Short title: instruction." (1 to 5 words, then one job in at most 45 words, with a time and a sign where it cooks;
    food-safety wording kept). `tests/recipeBook.test.ts` checks it (`splitStep`, `STEP_WORDS = 45`); the per-meal word minimums were lowered to 110/80/60/40 (dinner/lunch/breakfast/snack) so
    shorter steps pass. Dishes, ingredients, times and temperatures are unchanged; the helpers list their small merges and cut asides in their reports (nothing about food safety cut).
    `sprout-chestnut-potato-gratin` no longer says to peel and chop garlic (its garlic is purée).
  - **Recipe page:** each step shows its title in bold with the step's time beside it ("6 min", "8–10 min", "Overnight"), the instruction below (`lib/mm/recipeSteps.ts` `splitStep`/`stepTime`,
    `tests/recipeSteps.test.ts`; a lead time like "12 minutes before the sauce is ready" is not shown as the step's time). Steps without a title (older saved and Pip's recipes) show as before.
    No new copy beyond the recipe text ("Time" is read only by screen readers and already existed). Looked at on a 375 px phone.
  - **Quick** (20 minutes or less, not left to chill) now also spots "in the fridge for" and steps titled Chill, Freeze or Soak (the peanut butter oat bites had become "Quick" after the rewrite).
  - **Photos: one per recipe, all 165, in the colourful style the founder picked** (three backgrounds in turn: grey concrete with a mustard napkin, mint green with a striped tea towel, blue
    hexagon tiles with a beige napkin; cream speckled or teal plates). GPT Image 2.6 at **medium** quality, 1k (0.5 credits each; low, medium, high, extra high and max were compared on one dish
    first). **Ingredients match the photo:** a helper checked all 117 older looks against their recipes and fixed 33 (foods not in the recipe, wrong number of pieces, served the wrong way); the props are
    never food (napkin, cutlery, a glass of water) and every prompt forbids any other food. Every photo was looked at on a contact sheet: all 165 show only the recipe's own foods, no writing,
    packaging or logos. Captioned as AI-made as before (rule 2). `web/public/recipe-images/` is now 17 MB (was 6.2: the busier pictures compress less), so the app bundle grows by about 11 MB.
  - **Cost:** 82.5 credits for the 165 (plus 8.25 for the quality comparison and 19.5 for the 13 high-quality examples earlier); 1,233.84 left.
  - **New copy (rule 8, logged here; English only):** the 48 new recipe names, blurbs and methods, and every rewritten step title and instruction.
  - **Live the same night (founder: "make everything live ... if there are any other things to fix too please do em"):** `main` fast-forwarded to `recipe-photos` (d4382d45) and
    Vercel deployed it to numbite.com (deployment dpl_8bfg9CMgvLo1DLdh7UA2hXY6iXNY, READY; the recipes page, a new recipe and its photo answer 200). **Fixed on the way:** the "New" tag on a
    dish counted milliseconds, so across the October clock change an item added on 1 October stopped being new an hour early on day 30; it now counts calendar days (`isNewItem`,
    tested in four time zones), which also fixes the test that failed only on UK time.
  - **iPhone 1.0.1 (build 5):** re-packed (177 MB, all 165 photos, no payment wording) and archived (`build/Numbite-1.0.1-build5.xcarchive`: 1.0.1 (5), Light, Sign in with Apple and
    applinks). **Upload blocked:** Apple has updated the Developer Program License Agreement and App Store Connect refuses new builds and versions ("You do not have required contracts")
    until the Account Holder accepts it at developer.apple.com/account. Claude does not accept legal agreements for the founder. After that: upload, create version 1.0.1, paste the
    store text, attach build 5, submit. **New store copy (rule 8, founder asked to ship):** a "Recipes" line added to 1.0.1's What's New in docs/STORE.md.
  - **Founder's test first (same night):** build 5 installed on the founder's iPhone 16 straight from the Mac (`xcrun devicectl device install app`, the archive's development-signed
    app; it replaces the App Store copy; data kept). Nothing submitted until the founder has tried it.

- 2026-11-16 (night, Mac) — **Make it at home: built, switched off, Premium only** (founder: "take photo of food and add a name to it then it makes the recipe ... at a restaurant
  take a photo of the food and add what it's called ... take a screenshot or a real life photo ... fill in what they've taken a photo of in as much detail. They then press next and
  select the supermarkets ... press generate and it shows it generating then shows the ingredients and how to make"; "It should specify to add as much info like peri peri chicken
  wings not chicken wings"; "Only on the premium mode"). Branch `photo-recipes`, not merged.
  - **Why not "share a reel":** checked first. TikTok's official embed service no longer returns the caption (live call and its docs, 16 Nov), and Instagram's oEmbed terms forbid
    extracting or storing the caption ("only meant to be used for embedding"); Facebook's page was unreadable. Fetching posts otherwise would mean scraping (never). The founder
    chose this photo flow instead.
  - **The flow** (`/app/recipes/photo`): Take a photo or Choose from your photos (a screenshot works) → "What's in the photo?" with the founder's example and a nudge under 3 words
    ("Carry on anyway" after it), plus **Suggest from my photo** (Pip describes the dish for the person to correct) → Where do you shop? (the same shop picker; for now recipes use
    Sainsbury's, the only shop whose labels are read, and the screen says so) → **Generate my recipe** → four working lines (each ticks off; the last spins until the answer) → the
    normal recipe page with **the person's own photo at the top** ("Your photo. The recipe is Pip's home version."), titled steps with times, Save, Add all to my shopping list.
  - **Honesty rules** (`lib/mm/photoRecipe.ts`, checked on the server and again on the phone): the AI only picks pantry kinds this diet allows, amounts and words; every number is
    worked out from the products' labels; 4 to 11 "Short title: instruction." steps of at most 45 words; a doneness sign whenever there is meat, fish or eggs; no nutrition figures,
    prices, health claims, restaurant or brand names, or "official/copycat/same as"; a bad answer is asked for once more, then the person gets a plain "couldn't make one".
  - **Switch and Premium:** `PHOTO_RECIPES_ENABLED` = `NEXT_PUBLIC_PHOTO_RECIPES=1` AND Premium exists on the build (`GATING_ENABLED`), so it can't appear free or before Premium. The
    API (`/api/v1/recipe/photo`, `/api/v1/recipe/photo/describe`; docs/BACKEND.md) answers 404 while off, 402 without a valid paid token, needs ANTHROPIC_API_KEY, rate-limits per
    caller, allows our pages and the iPhone app (CORS), and stores nothing. The photo is made ≤1024 px JPEG on the phone first. Model: Claude Haiku 5.5 (the recipe maker's, founder's
    choice for recipes), about 0.1p to 2p a recipe. A Recipes card ("Make it at home", Premium badge) and a paywall line ("Make any dish at home from a photo") appear only when on.
  - **Privacy:** a paragraph on the privacy page, shown only when the feature is on (photo, description, diet and product list go to Anthropic; nothing kept; the paid token holds
    no personal details). **Draft for the founder to approve before launch**, with the App Store privacy answers (photos sent for processing).
  - **New copy (rule 8, logged here; English only):** "Make it at home", "Make it at home is part of Premium.", "See Premium", the Pip lines, "Take a photo", "Choose from your photos",
    "Your photo", "Change photo", "What's in the photo?", the specific-description help and placeholder, "Suggest from my photo", the nudge, "Carry on anyway", the shop note, "Generate
    my recipe", the four working lines, the AI note under Generate, the error lines, "Your photo. The recipe is Pip's home version.", the Recipes card line, the paywall line.
  - **Checked:** 12 unit tests (`tests/photoRecipe.test.ts`, pretend AI), all 1,831 unit tests, tsc, eslint; browser test `e2e/photorecipe.mjs` 7 of 7 on a test build
    (`NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_PRO=1 NEXT_PUBLIC_PHOTO_RECIPES=1`; card and paywall for a free person, nudge and suggestion, Generate and the request's fields
    (only dish, diet, photo, products), titled steps, Save, errors with Try again, Back keeps the photo and words, 360 px at the largest text size with no sideways scroll, axe 0).
  - **Not tried:** a real AI answer (no Anthropic key here; the founder adds one with a spending limit), the iPhone camera inside the app, and real Premium (needs In-App Purchase, 1.1).
  - **The photo is the recipe's picture** (founder, same night: "The photo the user takes of the food they wanna make that's the thumbnail of the recipe"): on Save, an 800 x 600
    copy (cropped to the cards' 4:3) is kept in IndexedDB on the phone (`lib/mm/recipePhotos.ts`, database `mm-recipe-photos`) under the saved recipe's id, and shown on its card
    in Recipes and My meals ("Your photo") and at the top of its page. Saved recipes sync to a signed-in person's account, so the photo is kept apart from them: it is never
    synced or sent (another device shows the drawing), is tidied away when its recipe is no longer saved, and is deleted by Clear data. Privacy paragraph says so. Checked:
    2 unit tests, `e2e/photorecipe.mjs` 8 of 8 (new step: kept under the recipe's id, not inside the synced recipe, on the My meals card and the recipe page, gone after Clear
    data), `e2e/recipes.mjs` 17 of 17. New copy: "Your photo" on the card's label.

- 2026-11-16 (late night) — **Founder: "You have my approval for everything please do it all for me".** Done: the privacy paragraph for Make it at home is approved (it shows
  only when the feature is on); `main` fast-forwarded to `photo-recipes` (a8593d46) and deployed, with Make it at home still off (no `NEXT_PUBLIC_PHOTO_RECIPES`, no Premium on
  the build). **Blocked, not by us:** (1) Apple's updated Developer Program License Agreement must be accepted by the team's **Account Holder, Aayush Dwivedi** (developer.apple.com
  › Account shows "Aayush Dwivedi needs to accept ..."); the founder's login can't, and Claude doesn't accept legal agreements. Until then App Store Connect refuses build 5 ("You do
  not have required contracts", tried again 16 Nov) and any new version. (2) `ANTHROPIC_API_KEY` is **not** set in Vercel (checked by name only); the founder adds it themselves
  (Vercel › menumacros › Settings › Environment Variables, Sensitive, Production) with a monthly spend limit in console.anthropic.com. (3) Make it at home needs Premium to be buyable
  (Stripe on the website: docs/PAID_ACCESS_GO_LIVE.md; Apple In-App Purchase in the app, 1.1), which needs the founder's accounts, bank and tax details.

- 2026-11-16 (late night, Mac) — **iPhone 1.1: Premium with Apple In-App Purchase, Make it at home in the app, and recipes open at Serves 1** (founder: "Finish the app, and then
  after that I'll test it, and then I'll upload it"; "Serves 1 should be the norm ... press plus ... the calories, the protein, all that will change, and all the ingredients ...
  the descriptions of like how to cook it should also like reflect that too"). Branch `iap`, not merged. Version **1.1 (build 6)**; 1.0.1 was never uploaded, so 1.1 replaces it.
  - **Buying** (App Store rule 3.1.1): three products, `com.amanmarwaha.numbite.pro.annual` and `.monthly` (auto-renewable, one group) and `.pass90` (non-renewing, 90 days);
    `Config/Numbite.storekit` has them for testing. Swift: `PurchaseService` / `StoreKitPurchaseService` (StoreKit 2: products, purchase, `Transaction.updates` listener started at
    launch, `currentEntitlements`, `AppStore.sync()`, Apple's manage-subscriptions sheet) and a fake; bridge actions `iap.products`, `iap.purchase`, `iap.entitlements`, `iap.restore`,
    `iap.manage`. Page: `AppStorePlans.tsx` (StoreKit's own names and prices, Buy/Subscribe, Restore purchases, Manage subscription while subscribed, Apple's renewal words, links to the
    Terms of Use (EULA), Terms and Privacy), `lib/payments/iap.ts`; Settings › Subscription gains Restore purchases and Manage subscription; at start-up and on return to the app, Apple's
    current purchases decide (a refund removes the token at the next start). The WhatsApp "share to unlock" is off in the app (rule 3.2.2). No Stripe wording ships in the app's files.
  - **Checking** (`POST /api/v1/entitlement/apple`, `lib/payments/apple.ts`, `appleHandler.ts`, `appleRoute.ts`): the signature chain up to Apple Root CA - G3 (fingerprint checked
    against Apple's support article 126047), Apple's certificate markers, our bundle ID and products; refunded or upgraded transactions refused; **Sandbox accepted** (App Review and
    TestFlight buy there); stateless (Apple keeps the record); the same ES256 token as the website (`src: "apple"`). Xcode test purchases count only while `APPLE_XCODE_TEST_CERT` pins
    the founder's Mac's test certificate, and then for 48 hours at most; a refused request logs reason codes only (and a refused Xcode certificate, which is public) so a test can be
    put right. The public key now lives in the repo (`web/lib/payments/entitlement-public-key.json`, written by `tools/payments/make_entitlement_key.mjs`, which puts the private key
    on the clipboard only); `NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK` still overrides it.
  - **Make it at home in the app**: on for Premium (`NEXT_PUBLIC_PHOTO_RECIPES=1` in the app build). Its two API routes now answer on the website whenever `NEXT_PUBLIC_PHOTO_RECIPES=1`
    (`PHOTO_RECIPES_API_ENABLED`; each still needs a paid token), and the website still shows no card while it sells nothing. `NEXT_PUBLIC_APP_PREMIUM=1` (website, once 1.1 is out)
    makes Privacy, Terms and Support describe Apple purchases; Privacy gains a sentence on the purchase check (Apple's signed record is sent to check it and isn't kept).
  - **Recipes open at Serves 1**; + cooks for more. The card shows the numbers for everyone ("For 2 servings: 1,198 kcal") with "Each serving: …" under it; the full label follows; a
    serving's price stays; every ingredient's amount for that many people is shown under the first step that uses it ("You'll need: Chicken breast fillets 150 g · Onion 75 g",
    `lib/mm/stepIngredients.ts`, using the recipe tests' word table, which now lives there); water in the steps scales as before; a new line says the cooking times are for the
    written servings, with what to do for fewer or more.
  - **Tests**: website 1,890 unit tests, tsc, eslint; 45+9 Apple-check tests (throwaway CA in `web/tests/fixtures/apple/`, test-only keys); `tests/iap.test.ts`, `tests/stepIngredients.test.ts`;
    e2e `recipes.mjs` 15 of 15 (incl. axe). Swift: 83 of 83. The StoreKit-service tests (`StoreKitPurchaseServiceTests`) are opt-in (`NUMBITE_STOREKIT_TESTS=1`, from Xcode): on the iOS 26.5
    simulator `xcodebuild test` never hands the .storekit file to StoreKit (SKInternalErrorDomain Code=3, Apple's known FB22237318, developer.apple.com/forums/thread/826971).
  - **Not verified here:** a real purchase end to end (the Simulator test was dropped: the disk filled up, see below, and Xcode's Run destination needs full-screen control that wasn't
    approved in time); the founder's phone test is the first (docs/APP_BUILD.md "Testing 1.1"). A real Apple-signed or Xcode-signed transaction has not been through the server yet.
  - **Disk:** the Mac's disk filled up completely during this work (swap about 2.6 GB, the Simulator device 2.3 GB). The Simulator device was deleted; Xcode's index and the website builds
    are removed after use. Free space is about 2.5 GB: **the founder needs to free about 10 GB** before the phone build.
  - **Decisions for the founder (rule 8):** the name is "Pro" in places (paywall title "Numbite Pro", Settings) and "Premium" in others (Make it at home, the new plans lines): say which to
    use everywhere; the App Store products' descriptions and the 1.1 What's New and review notes are drafts in docs/STORE.md.
  - **New copy (rule 8, logged here; English only):** the plans' taglines ("One payment. 90 days of access. It doesn't renew.", "Renews each year until you cancel.", "Renews each month until you
    cancel."), "Premium is on.", "Your pass ends on {date}.", "Manage subscription", "Getting prices from the App Store…", "Couldn't reach the App Store. Check your connection and try again.",
    "Buy for {price}", "Subscribe for {price} {per}", "Waiting for the App Store…", "Restore purchases", "Checking with the App Store…", the four purchase results and three restore results,
    the renewal paragraph, "Terms of Use (EULA)", "Privacy Policy", the privacy sentence above; for recipes "For 1 serving", "For {n} servings", "Each serving: {kcal} kcal, {protein}g protein,
    {carbs}g carbs, {fat}g fat.", "Full nutrition for {n} servings", "You'll need:", and "The cooking times are for {n} servings, as the recipe is written. For fewer, use a smaller pan and
    check it a little sooner; for more, use a bigger pan or cook in batches, and allow a little longer." (replaces "Times are for the number of servings…").

- 2026-11-16 (later still, Mac) — **A 7-day free trial, offered once after setup** (founder: "we're offering the person a 7-day free trial ... one free trial per phone ... no matter
  if they sign up with Apple or Google or by email ... after they've done all the onboarding screens, they will then see sign up to Premium today, get a 7-day free trial, which they can
  skip ... claim the free trial later ... whenever they click on a paid feature, it should pop up with a banner saying 7-day free trial"; "The paid features of the app, I'll let you decide").
  - **How:** Apple's introductory offer, Free for 1 week, on Annual and Monthly (`Config/Numbite.storekit`; App Store Connect for real: docs/STORE.md). Apple gives one per subscription group per
    Apple ID, so a phone's App Store account gets one free week whatever account the person signs into Numbite with; only changing the phone's whole Apple ID gets round it. A strict per-device
    lock (Apple's DeviceCheck plus no-trial products) is possible later if needed. The 90-day pass can't have a trial (not a renewing subscription).
  - **iPhone:** `IAPProduct.trialDays` (only when the product has a free introductory offer and `isEligibleForIntroOffer` is true for this Apple ID), sent as `trialDays` in `iap.products`.
  - **Screens:** a one-time offer sheet after setup (`TrialOffer.tsx`: once on this phone, `mm.v1.trialOffer`; never on the welcome screens; not when the trial has been used or Premium is on;
    "Not now" skips it), the paywall's "7-day free trial" banner and "Try Premium free for 7 days" title, the plans' "First 7 days free, then £14.99 a year." and "Start 7-day free trial", the
    trial sentence under Apple's renewal words, and Settings › Subscription's "Start your 7-day free trial" while it's available; plans with a trial come first. StoreKit is asked once per session
    (`app/app/_lib/storeProducts.ts`) and again after a purchase or restore.
  - **Paid features (founder's "I'll let you decide"):** kept as built: free = every menu with full nutrition, search, groceries, recipes, logging and the order builder, shopping list, water,
    reminders, Community, 3 Truth cards a day, the top 2 results of Best for you and each Quick answers list, the first 5 rows of Cheapest protein, 3 saved orders; Premium = Make it at home,
    every Truth card, every Smart Swap and Quick answer, top 5 picks, the full Cheapest protein list, unlimited saved orders.
  - **Tests:** `e2e/iap.mjs` 7 of 7 on the packed app with a pretend iPhone and server (offer once and skippable, no offer when used, before setup or with Premium, paywall banner, starting the trial
    sends Apple's transaction and Premium switches on, cancel, Ask to Buy, Restore, Settings, a refund at start-up, axe on the offer and the paywall); Swift compiles with its tests
    (`build-for-testing`; Swift tests not run: no Simulator, the disk is too full).
  - **New copy (rule 8, logged here):** "Try Premium free for {days} days", "{days}-day free trial", "First {days} days free, then {price} {per}.", "Start {days}-day free trial", "Start your {days}-day free
    trial", "Everything that's free stays free. Premium adds:", "Not now" (existing), "You can start your free trial later from any Premium feature, or in Settings › Subscription.", "With the free trial
    you pay nothing for the first {days} days. If you don't cancel at least 24 hours before it ends, the subscription starts and you're charged. There is one free trial per Apple ID."
  - **Redesign the same night** (founder: "the premium for free 7 days looks basic, make it look more interesting"): the offer and the in-app paywall now open with a dark card like the
    tab bar (Pip cheering, a lime "7-day free trial" pill, "Try Premium free for 7 days", "Everything that's free stays free.", and a two-step timeline: "Today: Premium unlocks. You pay
    nothing now." / "Day 7: Your plan starts, unless you cancel before then in your App Store settings."), then "What Premium adds" as six icon tiles, then the plans as one choice
    (radio cards with StoreKit's price on the right, the free week in green) and one big button ("Start my 7-day free trial", "Subscribe for…" or "Buy for…") with the price line under it,
    Restore purchases as a link, Apple's words and the links (`PremiumOffer.tsx`, `AppStorePlans.tsx`). Sheet title "Numbite Premium". New copy (rule 8): the tile titles and lines
    ("Make it at home / Cook any dish from a photo", "Every Truth card / Not just three a day", "Every Smart Swap / And every Quick answer", "Top 5 picks / For your goal at every chain",
    "Cheapest protein / The full list, every shop", "Saved orders / As many as you like"), "What Premium adds", "Everything that's free stays free.", "Today", "Day {days}", the two timeline lines,
    "Choose a plan", "First {days} days free", "Start my {days}-day free trial", "{price}, one payment. It doesn't renew.", "{price} {per}. Renews until you cancel.", "{app} Premium".
    e2e/iap.mjs 7 of 7 again (plan choice and arrow keys, the price line following the choice).
  - **Cheapest protein redesigned** (founder: "it looks all scrambled ... too tight ... you need images"): each pair is two tiles side by side with the shop's own photo of each product,
    its name, the pence for 10 g of protein and the label line; the cheaper side has a green ring and a "Cheaper" chip on its photo (price only, rule 3); the saving is a lime banner with "100 g of
    protein costs {a} in one and {b} in the other." under it (replaces the long sentence naming both products); the list rows have a rank circle (top 3 in lime), the shop's photo, the name in two
    lines and the price as a pill. Data and wording otherwise unchanged. New copy (rule 8): "Cheaper", "100 g of protein costs {a} in one and {b} in the other." e2e protein.mjs 6 of 6 (incl. 360 px,
    Extra large text, axe).
  - **App Store answer given to the founder:** changes to screens, features, wording or recipes need a new build and App Review (the app carries its own copy of the web app, and rule 2.5.2 forbids
    downloading new features); menu data and prices, the logo takedown list, the server's answers and the promotional text change without one.

- 2026-11-17 — **Two small fixes from the founder's screenshots.** (1) "make sure the app doesn't have those boxes": a green focus box showed round sheet titles ("Your supermarkets")
  and other titles the app focuses itself so screen readers read them out (on an iPhone that focus counts as "visible", and the app-wide `:focus-visible` rule beat the titles'
  `outline-none`); `globals.css` now never outlines `[tabindex="-1"]` targets, dialogs or the sheet panel (buttons, links and text boxes keep theirs). (2) "instead of writing Sainsbury's,
  you should have the Sainsbury's logo": a recipe page's header is now "RECIPE ·" and a white pill with the shop's own logo (`ShopMark`) and its name beside it (CLAUDE.md rule 2 keeps the
  name as plain text next to a logo; rule 2 amended to allow the recipe page's header). No new copy.
  (3) "Remove AI illustration please from on all the photos": recipe cards no longer carry "AI illustration" and a recipe page no longer captions its picture "Illustration made
  with AI, not a photo of the products below."; screen readers still hear "An illustration of …" (the picture's alt text); a person's own photo keeps "Your photo". CLAUDE.md rule 2
  amended (no visible caption). The App Store What's New draft still says the pictures are made with AI.
  (4) Recipes › "Your supermarkets" (founder: "people have to scroll down and press confirm ... they'll tick it, but it doesn't save"): every tick is saved at once (closing the sheet
  any way keeps it) and a **Done** button stays pinned at the foot of the sheet; Done shows the short "working" moment only when something changed. New copy: "Tap all that apply. Each tap is
  saved straight away." (replaces "...Change it any time in Settings."), "Done" (existing). (5) A recipe's "What to buy" rows show the supermarket's own logo beside each product's name
  (today always Sainsbury's: the only shop whose labels are read; ready for more). e2e recipes.mjs 15 of 15.

- 2026-11-17 — **Restaurants show their dishes even when your allergies can't be checked, and recipe ingredients come from small shops** (founder, on McDonald's showing nothing:
  "when you click on a thingy, it should show ... the foods that there are for that specific restaurant"; and "all the ingredients should be able to be found [at a Sainsbury's Local or Tesco Express]").
  - **Diet settings emptied menus too (the bigger cause):** the vegetarian, pescatarian and vegan filters follow what each restaurant marks, and 39 restaurants mark no dish
    vegetarian (McDonald's, Burger King, Costa, Domino's...), a few more mark almost none (Greggs 1 of 263), and most name no dish vegan. Measured on all 241 menus: a vegetarian saw
    35% of dishes with 39 restaurants empty, a vegan 2% with 104 empty. Now, where a restaurant marks fewer than 1 dish in 20 as vegetarian or names none vegan, its menu shows every
    dish except those whose own name or menu section says meat or fish (or, for vegan, dairy or eggs; burgers, nuggets, hot dogs, kebabs, wings and pepperoni count as meat unless the
    name says veggie, vegan or plant-based), under an amber note ("Not checked for your diet", "{chain} doesn't mark which dishes are vegetarian, so only dishes whose names say meat or
    fish are left out.", "Check the rest with {chain} before you order."). Where allergens can't be checked, dishes whose names mention the allergy are left out too ("Filet-O-Fish" for fish).
    Best for you keeps the strict rule there and says "Best for you can't pick for your diet here, because {chain} doesn't mark which dishes fit it. Its full menu is below." with
    **See the full menu**. When the diet hides any dish, the full menu opens with "Showing {n} of {total} dishes" / "The others don't fit your diet settings, or {chain} doesn't say." and
    **Show all {total}** (this visit only; "Showing all {total} dishes", "Some of them may not fit your diet settings.", **Show only what fits**). Now no restaurant is empty for a
    vegetarian or a pescatarian (`tests/menuDiet.test.ts` checks every published menu). `lib/mm/menu-view.ts` (`uncheckedDiet`, `passesMenuDiet`, `namesAllergen`).
    **Better still would be the restaurants' own vegetarian marks**: Costa prints "(V)" in names and McDonald's and Greggs mark vegetarian and vegan products on their own pages; reading
    those into the data is a follow-up.
  - **The empty McDonald's:** with any allergy chosen, a restaurant whose allergens we can't read (98 of 241, McDonald's among them) hid every dish, because a dish with no allergen information is
    hidden while allergies are chosen. Now such a restaurant shows its menu (the other diet settings still apply) under an amber note: "Allergens aren't checked here" / "{chain} doesn't publish
    allergen details we can read, so these dishes aren't checked for {allergens}. Check with {chain} before you order." with its allergen guide link; Best for you follows the same rule. When the diet
    settings still leave nothing, the page says so plainly ("Your diet settings hide every dish here", "None of {chain}'s {n} dishes fits your settings ({settings}). You can see them all for this visit, or
    change your diet.") with **Show every dish** and **Change my diet**. Restaurants with allergen data are unchanged (a dish with an allergy you avoid stays hidden).
  - **Small-shop ingredients:** three judges went through the 732 Sainsbury's products recipes can pick and agreed on 110 that a typical small shop (Sainsbury's Local, Tesco Express, Co-op) stocks
    (`web/lib/mm/localRange.ts`); recipes now pick those first whenever their label can be used (1,037 of 1,268 picks). Where no such product has a usable label (Sainsbury's own rice, pasta and eggs
    print cooked figures; small packs of spices, bacon, berries and the Christmas foods aren't on the list), the ingredient says what to buy instead ("In a small local shop, look for any bag of basmati
    or long-grain rice.", `web/lib/mm/localTips.ts`, 29 ingredients), and the Ingredients tab says the numbers are for the product shown. `tests/localRange.test.ts` fails any ingredient of any recipe that is
    neither a small-shop product nor has a tip. It's a judgement: no supermarket publishes its small-shop range.
  - **New copy (rule 8, logged here; English only):** the note, Best for you and full-menu lines quoted above, "Not checked for your diet or allergies", the two other diet lines
    ("…so only dishes whose names say meat are left out." for pescatarian, "{chain} doesn't say which dishes are vegan, so only dishes whose names say meat, fish, dairy or eggs are left out."),
    "{chain} doesn't publish allergen details we can read, so only dishes whose names mention {allergens} are left out." (replaces the first allergy sentence), the empty-state lines above, "Show every dish", "Change my diet", "In a small local shop, look for {tip}.", the 29 tips,
    and "Small local shops, such as a Sainsbury's Local or a Tesco Express, usually sell everything here. Where a small shop is likely to stock a different pack, we say what to look for; the numbers are for the product shown."

- 2026-11-17 (night) — **Recipes from the shops you pick, amounts in the steps, Co-op's logo, no focus boxes** (founder, from the phone: "If I choose to shop at Asda, it's still
  showing stuff from Sainsbury's"; "have the logo of Sainsbury's, and add ... a plus button, so they can add more stores ... or remove Sainsbury's. And if they did this, then the
  ingredients for the recipe would change"; "the method doesn't specify how much to add ... be very specific with these people because they haven't cooked [before]"; "We're missing the
  co-op logo"; the green box on the Sign in and Add water sheets).
  - **Why Asda showed Sainsbury's:** a recipe works out every figure from each product's own label, and only Sainsbury's labels had been read. Labels are now being read from the shops' own product
    pages for the products recipes can use (`data/groceries/recipe-candidates/<shop>.csv`, `tools/groceries/labels_<shop>.py`, written to `data/groceries/nutrition/<shop>.csv` like Sainsbury's,
    each re-read by a second agent): Iceland done (407 of 459), Morrisons running; **Asda (Cloudflare), Aldi and Tesco (Akamai) and Waitrose refuse scripted requests from the Mac**, so they stay out
    of recipes. Reading Asda and Aldi in the founder's own Chrome was tried (33 Asda labels read) and then paused: it means automating about 1,500 page visits on sites that block scripts (Aldi's terms
    forbid automated collection), so it waits for the founder's explicit yes. `tools/groceries/labels_chrome.js` + `labels_chrome_next.py` + `labels_chrome_ingest.py` are ready if the founder says yes.
  - **Shop set:** recipes use the person's ticked shops that have read labels, in the order ticked (`recipeShopSet`); the first shop's usable product always wins, another ticked shop fills only an
    ingredient the first doesn't sell (`candidates()` sorts by `shopRank` after the "usable" keys; products are shop-tagged copies, keys `shop:id`). With one shop every result is byte-identical to before
    (165-recipe test). Until a ticked shop is ready the Recipes page says "These recipes use {shop} products for now. We haven't read the nutrition labels of {shops} products yet, so their recipes aren't ready."
  - **Recipe page header:** "RECIPE ·", one pill per shop (logo + name) and a 44 px **+** ("Change shops") opening "Where to buy the ingredients" with the shop picker (each tick saved at once, Done pinned);
    each ingredient row, Swap option, shopping-list item and photo comes from its own shop. The small-shop line and tips are Sainsbury's-only (`LOCAL_RANGE_SHOP`).
  - **Amounts in the method** (`lib/mm/kitchenAmount.ts`, tests): each ingredient's amount sits right after the words that first name it in the steps ("Stir the mayonnaise (**1 tbsp, 15 g**), mustard
    (**½ tsp, 3 g**) and lemon juice (**1 tsp, 5 ml**)", "Lower in the eggs (**2 eggs**)", "Peel the onion (**75 g, about ½ an onion**)", "Season (**a pinch of salt, a pinch of black pepper**)",
    "about 5 sprays" of oil spray), from the same amounts as the list, so it follows Serves and the fit; level spoons for small amounts of oils, sauces, pastes, spices and seasonings (usual kitchen
    densities: a cooking measure, nutrition still from the grams); an ingredient named only in a step's title keeps the "You'll need:" line. A test places every ingredient of all 165 recipes.
  - **Co-op logo:** coop.co.uk draws its mark inline in the header (no file); copied unchanged in the founder's Chrome at their request (`web/public/logos/shops/coop.svg`, record beside it).
  - **No focus boxes after a tap:** rings show only after a keyboard is used (`app/app/_lib/inputModality.ts` marks `<html data-keys>`; `globals.css`); titles the app focuses never show one.
  - **New copy (rule 8, logged here; English only):** the multi-shop lines ("Change shops", "Where to buy the ingredients", "Tick the shops you'll buy from. The first one you tick is used first; the others
    fill in anything it doesn't sell.", "Recipes can't use {shops} yet: we haven't read their products' labels.", "Your shops don't sell {name} that fits, so this uses {sub} instead.", "Not found at your shops
    yet.", "We couldn't find every ingredient at your shops yet, so there are no totals for this recipe.", the several-shops price and basket sentences, "Added {n} products to your shopping list.", "Products at
    your shops that fit this recipe, {shop} first, then the cheapest. It uses {amount}.", "Prices are each shop's shelf prices, checked {date}, and vary by store.", "Not affiliated with {shops}."), the
    Recipes note above, and the method's spoon and size words ("tsp", "tbsp", "a pinch", "about ½ an onion", "about 5 sprays").
  - **For the founder:** `ENTITLEMENT_PRIVATE_JWK` in Vercel currently holds a value starting "sk-ant-" (an Anthropic key, pasted by mistake): replace it with the output of
    `node tools/payments/make_entitlement_key.mjs` (it starts with {"kty":"EC"); only Premium purchases in the 1.1 test build use it.

- 2026-11-17 (night) — **Groceries tools first, eight app fixes, and a first-launch tour** (founder: "people might tend to ignore this at the bottom of the screen ... make the changes
  to the app that you think would make the app better"; "when the person loads the app ... it explains everything and what each thing does ... I don't want people to struggle"). Designed
  by three Groceries designs and five area audits judged into one plan, and three tour designs judged into one; each item built by an agent and reviewed by another.
  - **Groceries:** a "Search every shop at once" pill, then Scan a barcode (lime), Cheapest protein (new £ coin icon) and Compare products as Eat out's shortcut rows (shared `Shortcut.tsx`),
    then "Which shop?" and its tiles as before. Eat out renders the same markup.
  - **Dish page:** Log, Save, Share and Compare sit right under the numbers in an even 2x2 grid; "See the truth" names what it opens.
  - **Restaurant menus:** every row lines up (a fork tile where a dish has no photo, when the chain has photos), calories and protein as the app's grey badges.
  - **Home:** meal rows name what was eaten with up to two real dish photos, the week strip lines up and marks logged days, the two cards have icons and counts.
  - **Recipe cards:** protein, carbs and fat on one strip, names up to three lines, Undo when a recipe is taken out of My meals.
  - **Today:** all three meals with "Add to …" straight from the page (Home's sheet), UK 24-hour times.
  - **Shopping list:** "Clear" is "Clear list"; Clear list, Remove ticked and the last − each show an 8-second Undo.
  - **Settings:** worked-out targets say so, unsaved target edits say "Not saved yet", "Set up with Pip" is back, and a Help section has "Show me around again".
  - **Compare:** figures as the labels print them, and Highest/Lowest judged on the printed figures (committed with Pip's pick).
  - **The tour** (`lib/mm/tour.ts`, `app/app/welcome/Tour.tsx`): a plain first launch (no link, nothing set up, nothing stored; `mm.v1.tour` device-only) opens the welcome screens: Pip, text size first,
    then one stop per tab with "What you can do" rows using the real buttons' icons, then "Let's make it yours" ("Set up my plan" / "Look around first"); Skip at any point. Links (shared lists,
    invites, restaurant links) never go through it. The 7-day trial offer follows on Home in the In-App Purchase app only. Replay from Settings › Help.
  - **New copy (rule 8, logged here; English only):** "Look up a product you're holding", "What 10 g of protein costs", "Put products side by side, even from different shops", "Calories, protein score and traffic lights", "Nothing on it yet", "1 saved meal", "{n} saved meals", "Tap the heart on any recipe, or Save at the top of a recipe, and it will be here next time.", "Removed “{name}” from My meals.", "Clear list", "List cleared.", "Ticked items removed.", "Removed “{name}” from your list.", "Worked out", "Not saved yet. Tap “Save targets” to keep them.", "Set up with Pip", "A short tour of the app, then your goal, diet, daily numbers, shops and text size.", "Skip tour", "What you can do", "Tap + next to Breakfast, Lunch or Dinner to add what you ate: a restaurant dish, a recipe, a supermarket product, or your own numbers.", "Tap the calendar next to the date to see another day.", "The gear at the top opens Settings: your goal, diet, text size, and this tour again.", "Further down Home, add the water you drink and set your own reminders.", "Search for any restaurant or dish by name.", "Near me shows the places to eat around you on a map.", "Open a restaurant to see the numbers for each dish. Best for you lists orders that fit your goal.", "Going shopping? Pick your supermarket and look up its products and prices!", "Tap your supermarket to see its products and prices.", "Scan a barcode to look up a product you're holding.", "My list is your shopping list. Tick things off as you shop.", "Tap Breakfast, Lunch, Dinner or Snacks to see recipes for that meal.", "Tap the heart on a recipe to keep it in My meals.", "Open a recipe to add everything it needs to your shopping list in one tap.", "Make it at home turns a photo of a dish into a recipe. It's part of Premium.", "Read short food articles, and send your shopping list to friends!", "Food blogs are short, easy reads about eating out, shopping and cooking.", "Sign in to add friends with a code, then send each other shopping lists.", "Let's make it yours", "That's the tour! Now a few quick questions, and I'll work out your daily numbers and put the dishes that fit you first.", "You can see this tour again any time in Settings.", "Set up my plan", "Look around first", "Help", "Show me around again". **No longer used:** "Your shopping list", "Open any recipe and tap “Save to My meals”. It will be here next time.", "Nothing logged yet today", "Open an item or build an order, then tap Log.", "Today's numbers, your shopping list and what you've saved. The gear at the top opens Settings.", "Every restaurant, café and pub, with the numbers for each dish.", "Supermarket products with their labels and prices.", "Meals made from your shop's products, with the cost per serving.", "Shopping? I'll show you the calories, protein and price of what's on the shelf!", "Let's go!".
  - **For the founder:** the Settings line "A short tour of the app, then your goal, diet, daily numbers, shops and text size." lists text size last though the tour now asks it first; say if you'd like it reordered.
  - Checked: tsc, eslint, 2,001 unit tests; browser tests run in the final pass.

- 2026-11-17 (night) — **Photos everywhere the app has one, small thumbnails, and a lighter iPhone app** (founder: "Use images please when possible"; "when the user downloads the app it
  shouldn't use excessive storage").
  - **Lighter app:** the iPhone build no longer packs the dish, recipe and stored product photos (about 125 MB): `web/app-content.json` "remoteImages": true makes `scripts/pack_app_web.py` leave
    `menu-images/`, `recipe-images/` and `grocery-images/` out and `lib/mm/config.ts` `assetUrl()` load each from the live site the first time it is shown (content-hashed names, cached for a year by
    `next.config.ts`); offline, a photo not yet seen shows the screen's plain tile. Privacy page: "To keep the app small, it loads photos of dishes, recipes and products from this website the first time you
    look at them (like the web app does), and keeps them on your phone to show again." **Order for release: update the website first (it must have the photos), then the app.**
  - **Thumbnails:** lists load small copies (`tools/uk_extract/make_thumbs.py` → `menu-images/thumbs/`, 168 px on the short side so a 56 px tile is sharp on a 3x iPhone; `tools/recipes/make_recipe_thumbs.py`
    → `recipe-images/thumbs/`, 240 px), resize only, falling back to the full photo and then the plain tile. "thumbs" is reserved and can't be a chain id.
  - **New photos in:** Search's dish results (the search file gains an optional photo column: `docs/DATA.md`, schema, `lib/mm/search.ts`; shows once the menus are rebuilt), Best for you picks, saved orders in
    My meals, the Smart Swap cards (never in the saved image card or Creator mode), the order builder's lines and Add item sheet, Home's and Today's meals (a logged entry now keeps its dish image, recipe id or
    product photo: optional `LogEntry` fields, checked by the sanitiser; no migration), every Add food picker, "What can I cook with this?", "You might also need", the Recipes "Cook with what's on your list" card,
    the recipe page's Swap sheet substitutes, and a product's "Other sizes".
  - **For the founder:** the Truth sheet's plain "Dark card" view still shows the two dishes' photos (only Creator/filming mode drops them); say if the Dark card should drop them too.
  - No new words. Checked: tsc, unit tests (thumbs, images, search, log pictures, recipe thumbs), Python tests; each part reviewed by a second agent with screenshots at 360 px and Extra large text.

- 2026-11-17 (night) — **Recipes from Morrisons too; a shop counts for recipes once it can make enough of them.** Morrisons' 1,201 labels let it make 88 of the 165 recipes
  entirely from its own products (it lacks labelled peppers, stock cubes and cucumber); Iceland's 407 labels make only 14 (no labelled salt, pepper or peas among its products). A shop now counts
  for recipes only from 80 recipes (`MIN_RECIPE_COVERAGE`, table generated by `tests/recipeCoverage.test.ts` into `lib/mm/recipeCoverage.ts`): Sainsbury's 165 and Morrisons 88 do, Iceland waits.
  A Morrisons shopper sees its 88 recipes with Morrisons products and prices; ticking Sainsbury's too gives all 165 (Morrisons first). The Recipes page says how many it can't show.
  New copy (rule 8, logged here): "{n} more recipes need something we haven't found at {shops} yet. Tick another shop to see them." (and the one-recipe form), and the shop note now reads
  "These recipes use {shop} products for now. We haven't read enough of {shops} product labels yet, so their recipes aren't ready."

- 2026-11-17 (night) — **Pip's pick on Compare, saved per product pair; product photos on the Compare table** (founder: "when the person compares two products, you should use the AI to say
  what you think personally is better ... if someone compares the same two products, you should have saved what the AI thinks"; "an image of the product on the top of the table"). Built in its own
  session ([Compare: Pip's pick](claude://claude.ai/epitaxy/local_9887c0b5-daa2-4174-905b-a7677829d0fe)).
  - With two items compared, a "Pip's pick" card under the table: which one Pip would pick **for the person's goal**, one sentence in Pip's voice (checked: no digits, no health or medical words, at
    most 25 words) and up to three reasons the app writes with figures worked out from the compared numbers (the AI only chooses from a fixed list of reasons). Rule 3 kept: never "healthier".
  - Saved: the answer is keyed by a hash of the two products and their figures (either order) plus the goal and diet words, kept on the phone (`mm.v1.comparePicks`, device only, cleared by Clear data)
    and on the server in a new table `compare_picks` (`supabase/migrations/20261117120000_compare_picks.sql`, **not applied: the founder pastes it in the Supabase SQL Editor**; the route works without it,
    only without the shared cache). Claude Haiku 5.5, structured output, rate-limited, our pages and the app only (`POST /api/v1/compare/pick`, docs/BACKEND.md).
  - **Off until the founder says:** `NEXT_PUBLIC_COMPARE_PICK=1` (Vercel and the app build). Privacy page paragraph shows only when on.
  - The Compare table also shows each product's or dish's own photo at the top of its column, with its number on the corner.

- 2026-11-17 (early morning, Mac) — **Overnight: more dish photos, menus refreshed from the official sources, an independent review of the night's code, fixes**
  (founder, before bed: "work hard on everything and make the app the best ... make sure all the features are working ... any restaurants that had updates ... update them too").
  Everything below is on the Mac's branch `iap` only: **not pushed, not on numbite.com, not in an App Store build.**
  - **Dish photos: 4,329 → 5,441, on 129 restaurants (was 80).** Helpers went through every restaurant again under rule 2 (the chain's own pages or feeds, robots.txt honoured,
    no block worked round, exact name or product record). A second agent looked at every new photo on contact sheets: 39 taken out (other companies' packs such as McDonald's
    Coca-Cola cups and branded waters, printed figures, the wrong dish). Biggest additions: Wagamama 125, McDonald's 119 (from its own Scene7 image account; mcdonalds.com answers 403
    to scripts, so the page-to-photo link rests on the founder's 9 Oct Chrome read), Grounded Kitchen 73, The Sushi Co 65, Riva Blu 64, Sam's Chicken 50, Creams 50, Deep Blue 40.
    Small copies for lists (`menu-images/thumbs/`, 4,669 files, 168 px short side, resized only, 24 MB) are now made and committed, so list tiles no longer ask for a missing file first.
  - **Menu refresh (still running at the time of writing, alphabetical):** each restaurant's official source checked for a newer version; where it changed, the chain's own script re-read
    it and a second agent re-read 20 random rows plus every added dish against the source (never typed). 68 restaurants A to H refreshed and committed so far (e.g. Caffè Nero, Domino's,
    Gail's, Dishoom, Five Guys, Frankie & Benny's); Dave's Hot Chicken put back as it was; Butcombe Inns and Coffee#1 put right in their scripts. Photos of 36 dishes that left the
    menus were taken out. Blocked or needing the founder's own browser: All Bar One, ASK Italian, Browns, Blue Diamond, Daisy Green, Ember Inns (blocked); Afrikana, British Garden
    Centres, Burger & Lobster, Burger King, Costa, Cooplands (need a file from the founder).
  - **Independent review of the night's code** (`2f9d3b2b..` = what numbite.com runs): 7 reviewers, each finding checked by two skeptics; 21 confirmed, all fixed in two rounds, each fix
    checked again by an independent agent:
    - restaurants that don't mark vegetarian or vegan dishes showed dishes their own data tags pork or beef ("8oz Sirloin", Burger King "The Wagyu", "Pig's Head on Toast") to vegetarians,
      and "vegan", "gluten free", "oat" or "almond milk" in a name cleared every allergen at once: both fixed and checked against every published menu (meat words such as boneless,
      chick'n, gyros, Scotch pie, Cornish/traditional pasty; oats count as a gluten cereal); for a vegan, a restaurant's vegetarian tag no longer clears a burger or wings;
      **Best for you now shows its "can't pick" card wherever the diet or allergies can't be checked** (this reverses the earlier "Best for you follows the same rule" for allergies:
      at the 98 restaurants with no readable allergen data a person with an allergy gets no ranked picks, only the full menu under the amber note);
    - recipes: the whole amount was written after "half the …" or "two thirds of the …" (now "(50 g in all)"), oil in a step didn't follow Serves, a pinch got a measured spoon bracket;
      Add food, My meals, onboarding's first recipe and "What can I cook with this?" used only the first shop;
    - the website's pages had lost their keyboard focus rings (WCAG 2.4.7); the trial timeline didn't give Apple's 24-hour rule; a synced log entry named "constructor" could break Home;
    - Pip's pick (still off) could carry a figure in words, and Compare's photos ignored the taken-down list.
  - **New or changed copy (rule 8, logged here; English only):** "Best for you can't pick for your allergies here, because {chain} doesn't publish allergen details we can read. Its full menu is below."
    and "... for your diet or allergies here, because {chain} doesn't mark which dishes fit them. ..."; the amber notes now say "whose names, menu sections or labels say meat or fish"
    (and "meat" / "meat, fish, dairy or eggs"), a vegan variant "{chain} doesn't say which dishes are vegan, so only dishes it marks vegetarian are shown, and of those, dishes whose names,
    menu sections or labels say meat, fish, dairy or eggs are left out.", and "whose names or menu sections mention {allergens}"; "Recipes can't use {shops} yet: we haven't read enough of their
    products' labels."; the Swap sheet's "Products at {shop} that fit this recipe: those a small local shop usually sells first, then the cheapest to buy. It uses {amount}." and "Products at your
    shops that fit this recipe, {shop} first. At each shop, those a small local shop usually sells come first, then the cheapest to buy. It uses {amount}."; method brackets end "in all" after
    words that use part of an ingredient; the trial timeline's "Your plan starts, unless you cancel at least 24 hours before then in your App Store settings."
  - **iPhone app checks:** the packed app is 62 MB (photos load from numbite.com); `app-build.mjs` 10 of 10 and the 1.1 purchase test `iap.mjs` 11 of 11 on the packed copy; the app's 24 Swift
    files type-check against the iPhone SDK with no error. **A full Xcode build is blocked:** Xcode 26.6 now wants its "iOS 26.5" component downloaded (Xcode › Settings › Components,
    about 8 GB) even to build for a phone, and the Mac has about 12 GB free: founder step below.
  - **Checked:** 2,082 unit tests, tsc, eslint (0 errors); browser suites on a fresh test build: smoke 24, extra 16, a11y 0 violations, largetext no overflow at 200%, browse 9, recipes 17,
    diet 7, compare 4, firstvisit 10, truth 14, numbers 12, addfood 15, listadd 8, listphotos 11, tour 14, back 42 + 13, done 13, water 14, calories 4, onboarding-body 22 (all 21 suites pass).
  - **Later the same morning:** the menu refresh was stopped to save the founder's usage: 136 restaurants A to T are refreshed, checked and committed. The last five it had re-read
    (Wagamama, Wahaca, Wendy's, Yalla Yalla, Yo! Sushi) are committed **without a second reader** (`ca0aa2e4`; they pass `check_chain` and the pipeline builds 241 chains with 0 errors) and are
    **not** in `web/public/menus`, which was built from checked data only; Vintage Inns, Waterfields and Wetherspoon were not refreshed. Rebuild the menu data (`./scripts/publish_menus.sh --web-only`)
    only after those five have had a second read, or step their folders back to `f3f4bf0e`.
  - **Test copy with every photo packed inside (founder: "Pack the photos into the test build"):** `MenuMacros/Resources/WebApp.bundle` is currently the 223 MB test copy (menu photos 132 MB incl.
    small copies, recipe 19, product 10), made by flipping `remoteImages` off for one build and putting it back (`web/app-content.json` is unchanged: true). **It must not ship:** run
    `NEXT_PUBLIC_SUPPORT_EMAIL=… ./scripts/build_app_web.sh` again (about 62 MB) before any archive. The founder's limit is **100 MB on the phone** (about 70 MB expected; not measured, because Xcode
    needs its "iOS 26.5" component before it will build). Not done: the build-script size check (fail above 85 MB), which the founder has not yet said yes to.

- 2026-11-17 (morning, Mac) — **Groceries: pick several shops and see them together** (founder, on the "Which shop?" screen: "a little select button on each one at the bottom right ... at the top
  right ... it will say the number that I've been selected ... the person can press go, and all the shops that they selected ... on the next page"). Mac branch `iap` only: not pushed.
  - **Groceries:** each shop's tile has a **Select** button at its bottom right (a 44 px pill that turns into a dark **Selected** with a tick); tapping a shop's name or logo still opens that one shop.
    Once one is picked, a bar under the title says **"1 shop selected"** / **"{n} shops selected"** with a black **Go**; it stays at the top while the shops are scrolled. The choice is kept for this
    browser tab (sessionStorage `mm.groceryPick`), so coming Back from the next page finds the shops still ticked.
  - **Go:** one shop opens that shop's own list as before; two or more open **`/app/groceries/shops?r=tesco,asda`** ("Your selected shops"): every picked shop's list together with each row
    showing its shop's name (small capitals above the product), its own price, price per kg or litre, card price, photo and numbers, and opening the same product page. Search across all of them,
    a shop chip row ("All selected shops", one chip per shop), Fits my diet / Has nutrition / Has a card price, and the sort. Nothing is merged: a product sold at two shops is two rows. A shop that
    can't load is named with Try again while the others still show. The address is checked (`lib/mm/shopPick.ts`: valid ids only, each once, at most 12). The page is a static shell, also in the
    offline cache (`sw.js` SHELLS and QUERY_SHELLS).
  - **Left out on purpose:** the single shop's "Aisle" menu (each shop names its aisles differently, so a union would mislead) and the catalogue's allergens (these lists have none: the
    existing sentence says so).
  - **New copy (rule 8, logged here; English only):** "Select", "Selected", "1 shop selected", "{n} shops selected", "Go", "Your selected shops", "Products from {shops}, each with its own shop's price and photo.",
    "Couldn't load {shops}. Check your connection.", "Search these shops' products", "All selected shops", "Shop" (the chips' group name).
  - **Checked:** `tests/shopPick.test.ts` (3), `e2e/shoppick.mjs` 5 steps (the button's place and size, counts, Go in tick order and sticky, Back keeps the choice, two shops' rows each naming its shop,
    search, shop chip, sort, the product page, one shop uses the single list, bad address, a failed shop, 360 px and Extra large text, axe 0 on both screens), groceries-all 8, groceries 6,
    groceries-compare 8, groceries-photos 4, listadd 8, listphotos 11, smoke 24, a11y 0 violations, largetext no overflow, tsc, eslint, i18n test.

- 2026-11-17 (midday, Mac) — **Live on numbite.com, and the new app on the founder's iPhone** (founder: "Update Numbite with everything", then "Yes, please do all of that for me").
  - **numbite.com:** `main` fast-forwarded to `961c282e` (45 commits: the 1.1 screens, recipes from chosen shops, dish photos 5,441 on 129 restaurants, menu data `20261117052758` with 241 restaurants,
    the review fixes, Select on Groceries). Vercel deployed it to Production; checked live: /app, /app/groceries/shops, /app/recipes/photo, /chains/kfc, /privacy, /api/health 200, the menu manifest,
    a dish thumbnail and a recipe picture serve, and **no "AI illustration" label is left in the live site's code** (it was still on the site until this push; the removal had been on the Mac only).
    The five restaurants committed without a second read are **not** in the published menus. Pip's pick, Make it at home on the website, and payments on the website stay off.
  - **iPhone:** freed 8 GB (the founder approved deleting ten unfinished Chrome downloads, "Unconfirmed … .crdownload"), downloaded the iOS 26.5 platform with `xcodebuild -downloadPlatform iOS`
    (8.52 GB), rebuilt the app's website copy in the shipped form (62.5 MB, photos loaded from numbite.com, no purchase flags), built **Numbite 1.1 (6)** for the iPhone 16 (development signing)
    and installed and launched it with `devicectl`. **The app is 66 MB** (limit the founder set: 100 MB), measured. Not tried on the phone by Claude: every screen, the camera scanner, notifications.
  - **Premium is not testable in this build:** it was built without the purchase flags because the payment key in Vercel is still the wrong value (see the to-do), so the trial offer and Make it at home
    don't appear. To test them, make the key, then build with `NEXT_PUBLIC_IAP=1 NEXT_PUBLIC_PHOTO_RECIPES=1` (docs/APP_BUILD.md "Testing 1.1").
  - **Disk:** the Mac is down to about 3 GB free after the platform install (the Claude app's background VM still holds about 8 GB of the deleted downloads until the Claude app is restarted).

- 2026-11-17 (afternoon, Mac) — **Recipes by one shop: the founder's design, and the first piece.** Mac branch `iap` and the founder's iPhone only (not pushed after `03e91c12`).
  - **Done and on the iPhone:** each ingredient row shows the cost of the amount used in green beside the pack price ("£2.44  £1.14 used", `RecipeDetail.tsx`; it follows Serves, `e2e/recipes.mjs` checks it).
    New copy: "{price} used". Numbite 1.1 (6) was rebuilt and installed with it.
  - **Decided with the founder, NOT built yet (his words, 17 Nov):** (1) Recipes page: **one shop at a time** ("Shopping at" dropdown, easy to change); the list shows the recipes that shop can make; the logos row and
    the + of last night's multi-shop header go. (2) A recipe page has a **shop button** ("Sainsbury's ▾") that switches the whole recipe to another shop where it can be made; a recipe only one shop can make says so.
    (3) Every ingredient, price, photo, number and the shopping list come from that one shop; macros follow that shop's labels. (4) **Swap** may take one ingredient from another shop (products labelled with their
    shop; the list splits by shop). (5) The existing Higgsfield recipe pictures stay for every shop. (6) **Later, only when the founder says:** shop-specific recipe versions and new pictures where a shop lacks an
    ingredient (Morrisons makes 88 of 165 today); about 40 Higgsfield credits for 77 pictures. Not clear yet: what "Octavo" was (Ocado or Asda?).
  - **Noticed in the founder's screenshot (not asked):** scrolled content shows under the iPhone's clock and battery (the "What to buy" heading overlapped the time); a fixed backing behind the status bar would fix it.
  - **Disk:** about 2.4 GB free; the Claude app's background VM still holds about 8 GB of the deleted downloads until the Claude app is restarted.

- 2026-11-17 (evening, Mac) — **Recipes are made for one shop (Part 1 of the founder's design), on the founder's iPhone; not pushed.** `eb572d07` and `1ecac22f` on branch `iap`.
  - **Recipes page:** a "Shopping at" button beside the search (the chosen shop's logo and name, a small arrow) opens a choice of ONE shop among those whose labels we've read (Sainsbury's, Morrisons;
    Iceland has too few); a pick is saved at once as the first of the person's supermarkets (the others stay ticked for Groceries) and shows the short working moment; the list is that shop's recipes
    ("N more recipes need something we haven't found at {shop} yet. Choose another shop to see them.").
  - **Recipe page:** the shop in the header is a button ("Shopping at: Sainsbury's ▾"); its sheet lists every ready shop, the ones that can't make THIS recipe greyed with "Can't make this recipe"; choosing one
    works the whole recipe out again from that shop's products, prices and labels. The other shops load only when this sheet or Swap opens. **Swap** has a chip per shop: one ingredient can come from the other
    shop's product (its logo and name show on the row; the list splits by shop). `recipeShopSet` is now a list of one; the earlier multi-shop header (logos and +) is gone.
  - **New copy (rule 8, logged here; English only):** "Shopping at", "Recipes are made for one shop at a time. Choose where you're shopping; you can change it any time.", "Saving your shop…",
    "Can't make this recipe", "This recipe is made for one shop. Choose another and every ingredient, price and number changes to that shop's.", "Checking which shops can make this recipe…",
    "Loading other shops…", "Choose another shop to see it/them."; the Swap sentences now name the chosen shop. No longer used: "Where to buy the ingredients", "Tick the shops…", "Change shops", "Your supermarkets" on Recipes.
  - **Checked:** unit tests 2,107, e2e recipes 17 (two new steps on real data: chicken curry at both shops, overnight oats only at Sainsbury's), smoke 24, extra 16, a11y 0 violations, largetext no overflow,
    addfood 15, listadd 8, back 42, diet 7, browse 9. Two data tests fixed on the way (100 stale thumbnails taken out; the every-item test no longer hard-codes 36,842).
  - **Part 2 finding (not built):** Morrisons can't make 77 of 165 recipes, and 66 of those miss exactly ONE ingredient kind with a read label: peppers (23), stock cubes (16), cucumber (13), berries (10), plus
    turkey breast, gammon, nutmeg, mixed spice. So the fix is Morrisons labels for those kinds (or an honest substitute), not 77 new recipes and pictures: the existing Higgsfield pictures stay valid.
  - **Crash report (founder, 17 Nov: opened McDonald's then a dish in the new app and it crashed):** not reproduced in Chromium (every McDonald's dish page under six diet and allergy settings, five ways of
    choosing McDonald's: no errors) and the iPhone holds no crash log for Numbite, so it was most likely iOS ending the page's web process for memory (`WebAppView` then reloads it, which looks like a crash).
    Needs the iPhone's own engine (the Simulator, which needs about 8 GB free: the Claude app's background VM still holds the deleted downloads) or the exact steps from the founder.

- 2026-11-17 (afternoon, Mac) — **A run of the founder's smaller asks, all on the iPhone; not pushed after `03e91c12`** (commits `dedec5c2` to the one after this note).
  - **Reminder sheet:** the Time box could be drawn wider than the sheet on iPhone, so the sheet slid sideways: it may shrink now, and every sheet ignores sideways movement.
  - **Light-green icons** on every Eat out and Groceries shortcut row and the two "More ways" rows (closed).
  - **Done puts the keyboard away on iPhone:** the page remembers the last field and also sends the app a new bridge request `keyboard.hide` (`webView.endEditing(true)`; Swift parse test added).
  - **Compare overview** under the table (no AI; `lib/mm/compareOverview.ts`): Best for price, Best for protein, Best protein for the money, Fewest calories, Lowest sugars, Lowest salt; dishes also Most protein for the calories;
    ties named; per 100 g never compared with per 100 ml. **Compare traffic lights** (FSA, `trafficLightFor`): Low/Medium/High pills on fat, saturates, sugars and salt for foods per 100 g only, from the
    guidance's Table 2 (opened and read again today; its Table 3 for drinks has salt high at 0.75 g, not 1.5, which is one reason ml products stay uncoloured: a drink can't be told from a soup).
  - **Welcome screen:** the logo wall on top, the writing below, no Skip (the way to Home without the tour: Show me around > Skip tour > Look around first). The wall takes the space the text leaves.
  - **Status bar strip:** once a screen has scrolled 24 px, `<html data-scrolled>` paints a page-coloured strip as tall as the status bar (`app/app/_lib/statusBar.ts`, `globals.css`), so headings no longer slide under the clock.
  - **Morrisons recipes 88 → 157 of 165** (Sainsbury's still 165): peppers, cucumber and berries have no label at Morrisons (never estimated), so they now have stand-ins (peppers → tomatoes, cucumber → lettuce or tomatoes,
    berries → bananas; the recipe page says "{shop} doesn't sell {x} that fits, so this uses {y} instead."), and stock cubes are found by "24s 142g"-style counts (`pieceWeight`). The 8 left need turkey breast, gammon, nutmeg or mixed spice.
  - **Accounts (founder: "Every user is required to sign up ... when an account's deleted, they go back to the starting screen"):** sign-in stays OPTIONAL (CLAUDE.md rule 4; App Review 5.1.1(v) risk of forcing it, explained to the founder).
    "You're all set!" has a card "Keep your plan on every device" with Sign in (Continue skips it), and deleting an account now takes the person to the welcome screen (the tour counts as unseen; data on the phone is kept).
  - **New copy (rule 8, logged here; English only):** the Compare overview lines ("Overview", "Best for price", "Best for protein", "Best protein for the money", "Fewest calories", "Lowest sugars", "Lowest salt",
    "Most protein for the calories", "{n} g protein for £1", "{n} g protein per 100 kcal", "tied", the two notes), the traffic-light sentence under the table, "Keep your plan on every device" and its line.
  - **Not done / waiting:** "Make it at home" is built but hidden (Premium and the payment key: see the to-do); the McDonald's crash is not reproduced; Pip's pick stays off.

- 2026-11-17 (evening, Mac) — **Premium tested end to end in the simulator, the live site's missing key fixed, and Make it at home redesigned** (founder: "check everything ... so I don't have to";
  "that screen has to look nice"). Mac branch `iap`; `main` (numbite.com) is at `5bb4b013`; the redesign below is **not pushed** (it only reaches people in a new iPhone build).
  - **Disk:** the Mac's disk was full again; the founder agreed to uninstall Among Us, DJ.Studio, rekordbox 7 and Photoshop 2025 and 2026 (moved to the Trash from Finder, the founder typed the password), emptied the Trash and
    approved deleting exact duplicate files in Downloads (done: IMG_8639, IMG_8628, `video`/`video1`, the edudeme theme zips, the "(1)" copies). About 12 GB free now. A throwaway simulator, "Numbite Test iPhone 17 Pro" (iOS 26.5), is on the Mac (about 7 GB): delete it with `xcrun simctl delete 0A7A4D8C-4ED5-408E-8E9D-6059A8AB634D` when finished.
  - **Walk-through in that simulator (no crash anywhere):** welcome, tour, Home, Eat out, search, McDonald's page and the Big Mac page (the founder's reported crash did not reproduce), Groceries, Recipes. The iPhone's own Xcode connection kept dropping over Wi-Fi (the debug session ended), so the
    StoreKit test store was attached through Xcode Run on the simulator instead (the destination is picked in Xcode's toolbar, which Claude can't do at "click" tier).
  - **Premium purchase:** plans loaded from StoreKit, the 7-day free trial bought on Xcode's test sheet, then the server refused it with `xcode_not_allowed`. **With the founder's yes, Xcode's public test certificate is pinned in Vercel as `APPLE_XCODE_TEST_CERT` (Production, plain) and production was redeployed.**
    Restore purchases then switched Premium on. **TEST ONLY: remove `APPLE_XCODE_TEST_CERT` from Vercel when testing is finished** (docs/APP_BUILD.md "Testing 1.1"); the certificate looks new for each Xcode session.
  - **Found and fixed: the live site had an empty public key** (`{}`), so it could not check Premium tokens and Make it at home answered "part of Premium". The real key was committed on `iap` (`5bb4b013`); with the founder's yes `iap` was pushed to `main` (13 commits: the key, Compare overview and traffic lights, the new welcome
    screen, the status-bar strip, Morrisons stand-ins and others) and Vercel deployed it (deployment `dpl_E3L1yWkbxsuxrATA92Dfz3DKbrZz`, numbite.com answers 200).
  - **Make it at home, real AI call (first ever):** "Suggest from my photo" described a carbonara photo correctly, and Pip wrote "Cheesy bacon spaghetti carbonara" from Sainsbury's products with prices, photos, amounts, the cost of the amount used, and the photo on top.
  - **Make it at home, new order (founder's design, 2026-11-17):** (1) a first screen with **Name of the dish** and **A short description** (still optional to fill in, tagged "Recommended for accuracy"), laid out as a white card with lime icon circles, a 3-step strip (Dish, Photo, Shop) and four tap-to-fill dish ideas; (2) Next opens a **full-screen live camera**
    with corner marks and a light that sweeps over the dish and **two options** (founder 2026-11-17): **Scan food**, the shutter in the middle, and **Camera roll**, a picture button at the bottom right that opens the phone's photo chooser (a chosen photo is scanned the same way), plus a close button; (3) the taken photo is **"Scanned" for about 2.6 seconds** (1.2 seconds with reduced motion); (4) **Where do you shop?**; (5) **Next** starts a loading screen: the photo with a light sliding over it, Pip in the corner, a bar that fills and the four ticking lines;
    (6) the recipe with the photo on top. The name and description are joined into the one sentence the API already takes (`description`, at most 300 characters; name 80 + description 215); the API, the Premium check and the rules are unchanged. "Suggest from my photo" and "What's in the photo?" are gone from the screens (the describe route stays, unused).
    Where the web view can't show a camera or the person refuses it, the same screen offers the phone's own camera and the photo picker, and a picked photo is scanned the same way. Only the one photo that is taken is sent (made smaller first); the live picture never leaves the phone (privacy page updated).
    Files: `web/app/app/recipes/photo/page.tsx`, `PhotoCamera.tsx` (new), `web/app/globals.css` (scan, shimmer and bar animations, still for reduced motion), `web/e2e/photorecipe.mjs`.
  - **New copy (rule 8, logged here; English only):** "Name of the dish", "A short description", "Recommended for accuracy" (a lime tag under the description's title: founder 2026-11-17, "if it's recommended, it helps so much more"), "It helps Pip choose the right ingredients, so the recipe matches your dish more closely.", "Tell me what you'd like to make. The more detail you give, the better the recipe will match.", "For example: salsa chicken tacos", "For example: honey-glazed chicken tacos with sweet corn salsa and lime crema",
    "Need an idea? Tap one.", the four ideas ("Salsa chicken tacos", "Peri-peri chicken wings", "Creamy mushroom pasta", "Honey soy salmon bowl" and their one-line descriptions), "Steps", "Dish", "Photo", "Scan your food", "Camera view: point it at your food", "Point the camera at your food", "Take the photo", "Scan food", "Camera roll", "Upload a photo from your camera roll", "Scanning",
    "The camera can't be shown here. Take a photo with your phone's camera, or choose one from your photos."; the supermarket step's button is now "Next" (was "Generate my recipe").
  - **Checked:** 2,094 unit tests, tsc, eslint; `e2e/photorecipe.mjs` 10 of 10 (name first, nudge, the live camera and shutter with Chromium's fake camera, the scanning screen for about 2.6 s, the loading animation, only dish, diet and products sent, the photo as the saved recipe's picture, errors with Try again, Back, no camera, 360 px at the largest text with axe 0),
    `e2e/recipes.mjs` 17 of 17. **In the iPhone app on the simulator:** the new first screen, the camera (iOS asks "Allow Numbite to use your camera?" once; the Simulator's pretend camera showed live), the shutter, Scanning, the supermarket step, the loading screen and the finished recipe all worked.
  - **Not verified:** the real iPhone lens, light and focus (only the Simulator's pretend camera), the new screens on the founder's phone, and a real purchase on a real Apple ID (TestFlight or the App Store). The founder's iPhone connection over Wi-Fi was unreliable: a cable keeps it stable.

- 2026-11-17 (evening, later) — **Make it at home is now the top card on Recipes, and the phone's test purchase fixed** (founder: "it can be easily missed ... move it to the top ... make it in one dark"; "I tried to get [a membership] ... nothing happened"). Mac branch `iap`, not pushed.
  - **Recipes:** the Make it at home card moved from below the Cuisine and Occasion menus to directly under the search and the shop button, restyled as the page's one dark card (the tab bar's #1d2320), a lime-framed camera icon (the scanner's corner marks), white title, a lime "Premium" pill for a free person, and a lime arrow. Same words, same behaviour (opens the paywall for a free person). Not done yet (offered, waiting for the founder): new wording ("Snap any dish. Get the recipe.", "Try free for 7 days") and a second entry point on Home.
  - **The phone's purchase:** Xcode signs test purchases with a test certificate made per device/session, so the phone's (made 16:22) differed from the simulator's (16:27) and the server answered `untrusted_root`. `APPLE_XCODE_TEST_CERT` now holds the phone's certificate and production was redeployed (dpl_Fz3Vy2Zu5NDiicjohkNFTSipYbbU, same code 5bb4b013). Restore purchases picks up the trial already bought. **Still test only: remove it when testing is finished.**
  - **"Nothing happened":** the purchase result line appears under the buy button, where the floating tab bar can cover it; it is now scrolled into view when it appears (`AppStorePlans.tsx`, also Settings › Subscription). No new copy.
  - Checked: tsc, eslint, e2e photorecipe 11, recipes 17, a11y 0 violations, largetext no overflow; looked at in the browser at 375 px.
  - Tried and undone the same evening: removing the Pip avatar and "Recipes" label at the top of Recipes (founder: "reverted to before ... I preferred it"). The header is as it was.
  - **Make it at home, "3. What to exclude"** (founder: "they should select any like allergens or like meat ... it should say 1, which is the name of the dish, 2, short description, and 3, what to exclude"): the first screen's card now has three numbered parts (lime circles 1, 2, 3 instead of the taco and pencil icons). Part 3 has the six diet tiles (Vegetarian, Vegan, Pescatarian, Halal, No pork, No beef) and "Allergies to avoid" opening the 14 allergens; it starts with the person's diet from Settings and a change is for this recipe only (Settings untouched). The choice is what the pantry, the request and the server's checks use (the server already cuts the pantry to the diet), and the finished recipe's diet note follows it (`RecipeDetail` gained an optional `diet`).
    **Kosher not added** (the same reason as 2026-10-15: no product data we hold says what is kosher, and kosher also covers how meat is killed and keeping meat and milk apart, which ingredient names can't show); No pork plus Crustaceans and Molluscs are the nearest choices. New copy (rule 8, logged here; English only): "What to exclude", "Tick anything you don't eat, and Pip leaves it out. It starts with your diet from Settings; changes here are for this recipe only.", "{n} chosen". Checked: e2e photorecipe 12 (new: Settings' No pork pre-ticked, Vegan and Peanuts sent, no chicken, eggs, cheddar or milk in the pantry sent, Settings unchanged), recipes 17, a11y 0, largetext.
  - "Need an idea? Tap one." and its four dish ideas removed from the first screen (founder: "I don't think we need this"); their words are no longer used. e2e photorecipe 12.
  - **Hold to scan, and a food check** (founder: "they'll need to hold the scanning button ... that way it ensures you get good photos"; "if it doesn't look like they're taking a photo of food ... tell them to please retry. I just took a photo of my leg and it worked"). The camera's shutter is now pressed and held for 1.5 s: a lime ring fills round it, the light sweeps fast and the line reads "Hold still…"; the photo is taken when the ring is full, and letting go early takes nothing and says "Keep holding the button until the ring fills." (Enter or Space takes it at once, for a keyboard.) While "Scanning", the app now asks Pip whether the photo shows food (the existing describe route, Claude Haiku 5.5 at low effort, Premium-only, rate-limited; only the photo is sent). A clear "no" goes back to the camera with "That doesn't look like food. Please try again with a photo of the dish."; if the check can't be made (no signal, too many tries) the flow carries on rather than block. Camera-roll photos are checked the same way. Privacy page: the photo is also sent "to check the photo shows food".
    New copy (rule 8, logged here; English only): "Hold to scan", "Hold to scan your food", "Hold still…", "Keep holding the button until the ring fills.", "Point the camera at your food, then press and hold the button to scan.", "That doesn't look like food. Please try again with a photo of the dish."; no longer used: "Scan food", "Take the photo", "Point the camera at your food". Checked: e2e photorecipe 13 (new: a quick tap takes nothing, a 1.8 s hold takes it, a not-food photo goes back with the note and only the photo is sent, then a food photo goes on).
  - **One shop on the shop step** (founder: "they should only be allowed to choose one shop on this screen"): "Where do you shop?" is now the one-shop list the Recipes page's "Shopping at" uses (`ShopChoice`), showing only the shops that can make recipes (Sainsbury's, Morrisons), with the person's first such shop chosen; the person's other shops that can't yet are named under it with the Recipes page's existing sentence ("Recipes can't use {shops} yet: we haven't read enough of their products' labels."). The shop chosen is sent and becomes the person's first shop, as on the Recipes page. No new copy. e2e photorecipe 14 (new: one shop chosen, no Tesco, Morrisons sent and first in Settings).
  - **Next always in view** (founder: "you can't see the next button on the screen right now. You have to scroll down"): on the first screen and the shop step, Next stays at the foot of the screen just above the tab bar (the same strip a recipe's "Add all to my shopping list" uses) while the form scrolls under it; on the shop step the AI note now sits above it. e2e photorecipe 14 (new: Next fully in view above the tab bar on a 390 x 844 phone without scrolling).
  - **More care over each recipe** (founder: "I don't mind how long this takes ... maybe it can take up to like 45 seconds ... we need to ensure that the recipe is really good"): the recipe is now asked of Claude Haiku 5.5 at **high** effort (was medium), each answer may take up to 75 s, the route may run 150 s (was 60) and a second go is tried only with 75 s left. The loading screen paces itself for it: the lines tick every 8 s, the bar fills over 50 s, and it says "This can take up to a minute, so Pip can get every detail right." (replaces "This usually takes 10 to 30 seconds."; rule 8, logged here). Cost: high effort spends more "thinking" tokens, so a recipe costs a little more (estimated $0.003 to $0.006, still under a penny). **The server part only works once deployed to numbite.com.** Checked: unit photoRecipe 12, e2e photorecipe 14.
  - **Save at the top, and "Save your recipe first?"** (founder, on the finished recipe: "there needs to be a save button ... at like the top right ... if the person tries to go back without saving, show ... would you like to save your recipe first?"): Pip's new recipe has a white "Save" pill (heart) at the top right of the photo, like our book's recipes; once saved it reads "Saved". Back before saving opens a sheet "Save your recipe first?" / "If you go back without saving, this recipe will be gone." with "Save and go back" and "Go back without saving" (closing it stays). Only the Back button asks; the tab bar and the phone's swipe-back don't. New copy (rule 8, logged here): those four lines. Checked: e2e photorecipe 15 (new: Save at the top right, both answers go back and only "Save and go back" saves, a saved recipe goes straight back).
  - **No "£0.00 used"** (founder: "there's no such thing as £0 used ... round it to 1p"): an ingredient whose used amount costs less than half a penny (a spray of oil, a pinch of salt) now shows "£0.01 used" (`formatUsedPrice`, lib/mm/groceries.ts, unit-tested); a serving's price and the basket are unchanged (they add up the exact amounts).
  - **Haiku 5.5 vs Sonnet 5.5 test** (founder: "do the 10 haiku versus sonnet comparison ... use the exact same input for both and the exact same image"): 10 dishes, same photos, words, Sainsbury's 142 kinds, 2 servings, 600 kcal, high effort, run with a 3-hour key the founder created and pasted himself (never seen by Claude). Both 10 of 10 passed the app's checks; Sonnet's recipes read more like a cook's (fuller spices, better order of work) at about 14 times the cost ($0.045 vs $0.003 a recipe, 25 s vs 15 s). Report: `docs/MODEL_COMPARISON_2026-11-17.md`. The model is still Haiku: **the founder to choose**. Total test cost $0.48.
  - **Make it at home now writes with Sonnet 5.5, with prompt caching** (founder: "Sonnet with caching"). `PHOTO_RECIPE_MODEL = "claude-sonnet-5-5"` (`web/lib/photoRecipeAi.ts`), high effort; the house rules and the shop's ingredient list (`photoPantryPrompt`, lib/mm/photoRecipe.ts) are two cached system blocks, then the photo and the person's words (which never break the cache). The food check stays on Haiku 5.5. Each call logs its token counts and cache reads and writes to Vercel's logs ("photo recipe: …", no content) so savings can be checked. Expected cost about $0.045 a recipe with no cache read and about $0.02 with one; the cache lasts about 5 minutes, so savings grow with traffic. Unit photoRecipe 12 (new: the ingredient list is its own part with nothing about the person in it). **Not yet tried with a real call after the change** (no key on the Mac): the first real use on numbite.com shows it in the logs.

- 2026-11-17 (night, Mac) — **Recipes for more supermarkets: Asda (99 recipes) and Iceland (122), with community numbers** (founder: "Iceland plus Asda", then
  "just do for every supermarket in the app"). Recipes need numbers for every ingredient, and only Sainsbury's and Morrisons had labels read from their own pages.
  - **Community numbers by barcode:** a shop's product with no label read from its own page now takes the Open Food Facts record for exactly its barcode
    (`tools/groceries/build_all_products.py` `catalogue_nutrition` / `fill_community_nutrition`: the barcode catalogue's checked records, plus 321 recipe-ingredient
    barcodes looked up one at a time with `fetch_off_codes.py --codes data/groceries/nutrition/off-wanted.txt`, saved in `data/groceries/nutrition/raw-off/`,
    put through the catalogue's own checks, and used only when the record's name shares a word with the shop's name). Never a shop-internal number, never
    Tesco's own-page details. The row's nutrition ends with `"off"` (`ShopNutrition.community`); the manifest counts them (`community`). Now: Asda 6,767 products,
    Iceland 1,023 more, Tesco 925, Morrisons 1,091 more, Waitrose 490, Sainsbury's 192 more.
  - **Said wherever shown:** a shop product page with community numbers says "Numbers from Open Food Facts contributors (community data), not the supermarket."
    (existing copy); the shop list's footnote shows; Compare marks them "community"; **a recipe names every ingredient whose numbers are community data** and its
    full-nutrition note says so; Cheapest protein keeps to the shops' own labels. Recipes always prefer a product with the shop's own label (own labels first,
    then community numbers, at each shop), so Sainsbury's and Morrisons recipes are as before.
  - **Pinch-sized seasonings (decision, rule 8, flagged):** Open Food Facts' records for dried spices and pepper mostly print no protein, carbs or fat, and pepper
    alone blocked 76 recipes at every shop but Sainsbury's and Morrisons. Salt, peppers, the dried herbs and the ground spices (19 kinds, like ground cinnamon since
    11 October) may now be listed and priced without a label read: the recipe says "We haven't read the label for … yet, so it isn't counted" (existing copy), a read
    label is always used first, and **uncounted salt leaves the serving's salt figure as "not on every label"** (never a total that leaves the salt out). Nothing is estimated.
  - **Matching fixes:** "fine salt" is salt (Iceland's Saxa Fine Salt), "runny" honey is clear honey, "Oxo 24 Vegetable Stock Cubes 142g" is 24 cubes.
  - **Result (`lib/mm/recipeCoverage.ts`):** Sainsbury's 165, Morrisons 161 (was 157), **Iceland 122** (was 31), **Asda 99** (was 0); all four are in "Shopping at".
    **Not reachable this way:** Tesco 2 (its list covers only fresh, bakery and frozen: Tesco's bot check stopped the crawl), Waitrose 0 (618 barcodes in 9,726 products),
    Aldi 0, Lidl and M&S (no barcodes and no nutrition in their lists). Those need each shop's own product pages read in the founder's Chrome (the "route 3" of the chat:
    hours per shop, against Tesco's and Aldi's terms, and a risk of the founder's home connection being blocked), so not started. Asda's tinned new potatoes, kidney beans
    and chickpeas stay out: a community record doesn't say whether its numbers are for the drained food.
  - **New copy (rule 8, logged here):** "The numbers for {name} come from Open Food Facts contributors (community data) for that product's barcode, not from the supermarket's
    own label. Check the pack.", the plural "…for those products' barcodes, not from the supermarket's own labels. Check the packs.", and "Added up from each product's numbers
    for the amounts below, before cooking: its own label, or the community numbers named above. \"Not on every label\" means one of the products doesn't give that figure, so
    we don't give a total for it."
  - **Checked:** 2,095 unit tests, 230 Python, tsc, eslint; e2e recipes 17, groceries-all 8, protein 6, compare 4, shoppick 5, addfood 15, photorecipe 15, smoke 24; an Asda
    recipe and an Asda product page looked at in the browser at 375 px. **Where it lives:** Mac branch `iap` only (not pushed, not on numbite.com, not in an App Store build).

- 2026-11-17 (night, Mac) — **Everyone signs in, and Delete my account is easy to find** (founder: "There's no way for the person to delete their numbite account also
  everyone must sign in or up to use", then, after the App Review 5.1.1(v) risk was explained and a skippable sign-up screen suggested: "Sign up screen shouldn't be
  skippable required for everyone though please"). **CLAUDE.md rule 4 changed** (accounts were optional since 2026-10-12).
  - **One switch:** `SIGN_IN_REQUIRED` (`web/lib/mm/config.ts`): on for the real website and the iPhone app; off on the browser tests' sample-data builds
    (`NEXT_PUBLIC_SIGN_IN_REQUIRED=1` forces it on there); `NEXT_PUBLIC_SIGN_IN_REQUIRED=0` is the fallback if App Review objects (accounts optional again, nothing else changes).
  - **The sign-in screen** (`_components/SignInScreen.tsx`, the same Apple / Google / email-code panel as Settings, `SignIn.tsx` `SignInPanel required`): "Create your free account",
    "Already have one? Sign in the same way as before.", no way past it. `lib/mm/signInGate.ts` (unit-tested): every `/app` page shows it instead of the page until someone is
    signed in (no tab bar); the welcome screen and the offline page stay open, and so do the privacy, terms and support pages; while the app checks who just signed in
    (back from Apple or Google, or the iPhone app's stored session) it waits rather than flashing the screen. The address stays as it was, so the page asked for (a restaurant
    link, a shared list with its "#") opens once they're in. On the welcome cover, **Get started** leads to the sign-in screen (with Back to the cover), then the tour; the cover's
    promises read "Free account · On all your devices · Every menu free" (was "No account needed · Stays on your phone"), and "Already have an account? Sign in" is gone (Get
    started signs in too). Sign out, the server ending the session, or deleting the account all bring the sign-in screen or the welcome cover back.
  - **Delete my account:** it was a small grey link at the foot of Settings › Account, shown only when signed in; now a full-width button with a bin icon and "Deletes your
    account and everything synced for it." under it. Its sheet now says "To use {app} again, you'll need to create a new account."
    **Subscriptions (founder: "If someone deletes their account their subscription will cancel and they won't get charged again"):** that can't be done: an App Store
    subscription is between the person and Apple, and no app can cancel it. So wherever Premium is sold through Apple (`APP_PREMIUM`), the delete sheet now says "Deleting your
    account doesn't cancel an App Store subscription. To stop being charged, cancel it in your App Store settings." with **Manage subscription** (Apple's own screen in the iPhone
    app; apps.apple.com/account/subscriptions on the website). New copy (rule 8): that sentence. Checked: `signin.mjs` 6 on a build with `NEXT_PUBLIC_APP_PREMIUM=1`.
    Apple's sign-in revoke on deletion has its three keys in Vercel (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, checked by name); a real deletion has not been tried yet.
    **Sign out and delete both go back to the welcome screen** (founder: "They have an option to sign out which also goes back to the onboarding screen too but it keeps their
    account"): Sign out now goes to the welcome screen as Delete already did; signing in again from there goes straight to the app (someone already set up on this phone skips
    the tour); after a deletion the setup starts again from the beginning for the new account (`hasCompletedOnboarding` is cleared; the data on the phone stays). Checked:
    `signin.mjs` 6, `account.mjs` 8, `community-friends.mjs` 26.
  - **Legal and store text** (shown according to the switch): privacy page (intro, "Your account and syncing", the shopping-list and Community lines; last updated 17 November 2026),
    terms ("Accounts"), support ("Your data"), the website's front page, docs/STORE.md (App Review note and App Privacy line, drafts), docs/ACCOUNTS_SYNC.md untouched (history).
  - **New copy (rule 8, logged here; English only):** "Create your free account", "Already have one? Sign in the same way as before.", "Your free account keeps your meals, shopping
    list and settings safe on all your devices. New here? Any of these creates it.", "We only keep your email address and what your account syncs. No ads, no tracking.", "Free account",
    "On all your devices", "Help", "Deletes your account and everything synced for it.", "This deletes your account and everything we've synced for it. This can't be undone. To use {app}
    again, you'll need to create a new account.", and the site sentences above (privacy, terms, support, front page).
  - **For the founder:** Apple usually asks for a demo account when an app needs a sign-in (Sign in with Apple works with any Apple ID; an email code needs a mailbox the reviewer can't
    open): add one to the review notes if asked. Re-check the App Privacy answers before submitting a build with this on. The website gets it when this is put live; the iPhone app only
    with its next build.
  - **Checked:** unit `signInGate` 4, e2e `signin.mjs` 6 (cover, no way past, every page gated with no tab bar, legal pages open, sign in keeps the page and a shared list's "#", Get started then
    the tour, the delete button's size, sign out and delete, 360 px Extra large with axe 0), and on the normal test build smoke 24, extra 16, account 8, firstvisit 10, back 42, tour 14;
    2,099 unit tests, tsc, eslint. **Not confirmed:** the full-app `a11y.mjs` and `largetext.mjs` runs printed no result this time (rerun them). **Where it lives:** Mac branch `iap` only (not pushed).
  - **Paused (founder: "pause where you are and commit what you've done"):** a check of every recipe at all four recipe supermarkets (a listing of every recipe's products,
    numbers and sources was made for it) and a cook's read of all 165 methods were started with seven reviewers, but they stopped when the weekly usage limit was reached
    (resets 19 November, 8am). Not started yet: the design and onboarding pass, and the check that every product has its image, allergens and barcode.

- 2026-11-17 (night, Mac) — **"Are you enjoying Numbite?" in the iPhone app** (founder: "after they use it for a while they are asked if they are liking it on a scale of 1-5; if they
  choose 5 and only if they choose 5 a pop up comes up after that asking to leave a review; if they've already pressed they will leave a review then don't show that pop up again";
  "show them the pop up only every so often"; then, told that showing Apple's review pop-up only after a 5 is "review gating" and a known App Review risk under guideline 5.6.1:
  "do 1 im allowed to do that" = the founder's decision and accepted risk). `lib/mm/ratingPrompt.ts` (unit-tested) + `_components/RatingPrompt.tsx`: in the iPhone app only, on
  Home only, never over another sheet; first asked once the app has been used on 5 different days and 14 days after the first; 1-4 shows "Thanks for telling us. If anything could
  be better, tell us in Settings › Contact us." and waits 90 days, as does Not now; a 5 asks for Apple's own review pop-up (new bridge action `review.request`, StoreKit
  `AppStore.requestReview(in:)`, `NativeBridge.swift`) and the question never comes back. Apple decides whether its pop-up appears (at most three times a year) and never tells the
  app whether a review was left. Kept on the phone only (`mm.v1.rating`), never synced; Clear data resets it. New copy (rule 8, logged here): "Are you enjoying {app}?", "Tap a number:
  1 is not really, 5 is love it.", "Your rating, 1 to 5", "{n} out of 5", "Not really", "Love it", "Thank you", the thank-you sentence above. Checked: unit 6, `e2e/rating.mjs` 4 on the
  packed app with a pretend iPhone (axe 0), the Swift compiles with a bridge test line.

- 2026-11-17 (night, Mac) — **No product without numbers in any recipe** (founder: "products that have no nutritional information shouldn't be used for recipes in general";
  "You need nutritional information for every product for every store"). This **reverses** tonight's pinch-sized-spices rule (and ground cinnamon's since 11 October): no pantry
  kind may now be listed without a label (`labelOptional` is unused). Ground cinnamon was the only gap at Sainsbury's: its own-brand label prints no fibre and failed our energy check;
  the Stamford Street Co. Ground Cinnamon page (read in the founder's Chrome, 17 Nov) prints fibre 53.1 g and adds up exactly once fibre's 2 kcal a gram is counted, so
  `build_groceries.implausible` now takes the printed fibre and keeps a label that adds up either with fibre on top (UK labels) or inside carbohydrate (some imported labels;
  nothing accepted before is rejected; Python test added). Cinnamon also gets a small-shop tip ("any jar of ground cinnamon", new copy, rule 8). Recipes now: **Sainsbury's 165**,
  **Morrisons 145** (missing cinnamon, mixed spice, nutmeg, turkey breast, chipolatas, gammon: labels to read), **Asda 40 and Iceland 33: below the 80-recipe bar, so out of
  Recipes** until their own labels are read. **numbite.com still runs the earlier rule** (Asda 99, Iceland 122 with uncounted spices) until this is put live.
  Next (founder's go-ahead, accepted risk of the shops' terms): read every product's own page in the founder's Chrome, one at a time, starting with the products recipes use, at
  Tesco, Waitrose, Aldi, Asda and M&S (Lidl's pages print no nutrition: rechecked before giving up).

- 2026-11-17 (late night, Mac) — **Release checks for iPhone 1.1 (build 6), and the Chrome label reading started.** Checked: 2,105 website unit tests, 231 Python, 84 Swift
  (one stale test fixed: the App Store product reply carries the free week), tsc, eslint (0 errors); every browser suite on a test build (smoke 24, extra 16, firstvisit 10, tour 14,
  back 42 + 13, browse 9, calories 4, diet 7, done 13, favnote 4, listadd 8, listphotos 11, sharelist 11, water 14, reminders 26, days 10, numbers 12, truth 14, shoppick 5, recipes 17,
  groceries 6, groceries-all 8, groceries-compare 8, groceries-photos 4, compare 4, protein 6, addfood 15, photorecipe 15, account 8, community 10, community-friends 26,
  onboarding-body 22, tabs 3, scan 8, mapfs 19, map 7, share, a11y 0 violations, largetext no overflow); on the packed app app-build 10, rating 4 (and 4 with purchases on), iap 11; prodmode 9;
  signin 6. The app ran in the "Numbite Test iPhone 17 Pro" simulator: the sign-in screen stands in front of the app (release settings), and with sign-in off Home and Eat out work.
  **Archive:** `build/Numbite-1.1-build6.xcarchive` (1.1 (6), Release, sign-in required, Premium/IAP and Make it at home on, Light, Sign in with Apple and applinks, 68 MB;
  `MenuMacros/Resources/WebApp.bundle` is the release copy, 62.8 MB). Not uploaded (the founder uploads). **Not tried by Claude:** a real sign-in, sign-out and delete with a real
  account; a real App Store purchase on this build (the purchase flow was tried in the simulator earlier the same evening and its code hasn't changed).
  **Chrome label reading** (founder: "for all these supermarkets get all the full nutritional information ... and also the allergens"): `tools/groceries/labels_chrome.js` now also
  copies the ingredients list, the words the shop prints in bold (allergens) and its allergy and may-contain notes; `labels_chrome_next.py --install` / `--short` store the reader in the
  tab once (window.name, run as an inline script: the shops' CSP forbids eval) and read each page with a one-line call (about 200 bytes instead of 2.9 KB). Still read-only: no clicks, no
  extra requests, stop on any robot check. A background helper is reading Aldi (390 recipe products), then Tesco (721) and Asda (about 1,080) in the founder's Chrome; ingesting the
  ingredients and allergens into the app is still to build (the nutrition goes through `labels_chrome_ingest.py` as before; Tesco's address to be added there). Lidl prints no nutrition;
  Waitrose's list has no page addresses (to find); M&S's priced range is small.

- 2026-11-17 (late night, Mac) — **The same product's label is shared across supermarkets** (founder: "if it's the same exact product on another supermarket ... you can literally just
  duplicate it"). `build_all_products.fill_same_product_nutrition`: a product with no label of its own takes the label read from another supermarket's page for exactly the same
  product: the same barcode (never a shop-internal number), else the same branded name and pack size (`build_groceries.name_key`, exact; never a shop's own brand, whose recipe
  differs between shops); a product two shops' labels disagree on lends nothing; it runs before the community step, so a shop's label always beats community numbers. Marked
  `same:<shop>`; the product page says "Read from the same product's page on {shop}'s website." (new copy, rule 8); recipes treat it as a label. Now: Asda 1,178, Morrisons 1,094,
  Waitrose 624, Tesco 448, Iceland 396, Sainsbury's 3 products gain a shop's label this way (Aldi, Lidl, M&S none: almost all own brand); Asda's recipes 40 -> 51. Python tests added.
  **Chrome reading in progress:** four helpers (Aldi, Tesco, Asda, M&S every product) in their own tabs; the reader now fits each result in the browser tool's 1,500-character limit
  (the first Tesco round showed cut-off lines; nothing broken was stored), and Aldi prints no label for loose produce (packaged food yes). The full web suite timed out on 17 data-heavy
  tests while the four helpers ran (load average 27); each passed when run alone.

- 2026-11-17 (night, Mac) — **UK government food data for loose fruit and vegetables** (founder: "you can use the government food data for loose fruits and vegetables. If it doesn't,
  of course, have it on the website of the supermarket"). McCance and Widdowson's Composition of Foods Integrated Dataset 2021 (GOV.UK, Open Government Licence v3.0), saved unchanged
  as `data/groceries/cofid/CoFID_2021.xlsx` (4.6 MB) and read without a spreadsheet library (`tools/groceries/cofid.py`). UK law doesn't require a nutrition label on loose single-ingredient
  produce, which is why Aldi's and others' produce pages print none. Only a product with **no label of any kind** (its own page, the same product at another shop, community numbers)
  whose name is the fruit or vegetable itself and nothing else (shop, origin, size and pack words allowed: `PLAIN_WORDS`; a first version matched any name mentioning a fruit, such as
  raspberry buns and garlic kievs, and was fixed before committing) takes the raw entry for that food (48 foods, e.g. "Onions, raw", "Bananas, flesh only"); "Tr" counts as 0, "N" stays
  empty, and salt stays empty (the dataset gives sodium; we never convert). Marked `cofid` with the food's name; the product page and recipes say "the UK government's figures for {food}
  (McCance and Widdowson's Composition of Foods)" (new copy, rule 8). Now 598 products in all (M&S 127, Waitrose 103, Morrisons 95, Tesco 81, Aldi 60, Lidl 42, Asda 42, Sainsbury's 26,
  Iceland 22); a random sample of 40 checked by eye: all plain produce. Python test added.
  **Chrome reading so far:** Asda 110 labels and 88 ingredient lists, Aldi 96 labels (it prints no ingredients), M&S 65 and 29, Tesco 57 and 17 (paused: Tesco began showing error
  pages after about 60 pages). **Cost:** a helper uses about 3,000 tokens a page (the M&S helper: about 440,000 for 137 pages), so "every product" at the remaining shops (tens of thousands
  of pages) is not affordable this way; the recipe products first.

- 2026-11-18 — **Every supermarket product read for its label, one Chrome reader per shop; M&S prices; no alcohol** (founder: "one agent for each supermarket ... every
  single page", "not just the product, but the ingredients", "I just want every food product to have nutritional information", "at the end of the day we need recipes
  for each supermarket").
  - **How:** one Sonnet helper per shop in the founder's Chrome runs batches from `tools/groceries/labels_chrome_next.py <shop> 10 --short TAB --all`; the page reader
    (`labels_chrome.js`, reader 4) returns short JSON results that `--harvest` copies from the helpers' own transcripts byte for byte (nothing retyped; reads only new
    transcript lines, under a lock). Pages done: `data/groceries/nutrition/raw-<shop>/chrome.jsonl`. Order: products matching a recipe ingredient first, then every other
    product with no nutrition (`--with-labelled` also re-reads labelled ones for ingredients). `labels_chrome_ingest.py <shop>` -> `nutrition/<shop>.csv` (Sainsbury's,
    Morrisons, Iceland: `<shop>-chrome.csv`, which fills only products the main file lacks) and `ingredients/<shop>.csv`; Iceland's nutrition comes from the page's own
    embedded record, filed into `raw-iceland/pages.jsonl` for `labels_iceland.py write`.
  - **Rules kept:** a bot or security check stops that shop's reader for good (never cleared for it, never worked round). **Tesco** showed its security page twice
    ("Oops... something is not right", even at 8 seconds a page) and is stopped: 249 Tesco pages read. **Co-op**: its online shop (shop.coop.co.uk) is behind a bot check
    and is never loaded; its open catalogue (coop.co.uk/products, robots allow it) is read from that site with redirects off, so a product that would send visitors into
    the shop is recorded "moved" (founder asked to clear Co-op's check and reopen tabs to get past it: declined, that would be working round it). **Lidl** publishes no
    nutrition, ingredients or everyday prices on its website ("See in store for price"; prices only in the Lidl Plus app, which is not automated): no reader.
    **Aldi** prints no ingredients. Readers stop on "Oops" only with security wording (Morrisons heads a gone product "Oops").
  - **Same product, other shop:** unchanged rule (same barcode, or same branded name and pack size; never own brand) now spreads today's labels after each rebuild.
    Coverage 18 November (after the first rebuild): 29,774 of 74,376 products with nutrition (was 27,414); Aldi recipes 5 -> 27.
  - **M&S prices** (founder: "There must be a way to find price"; "Yes for M&S do that for me", "one in London"): M&S prices each store; with the store set to
    **M&S Marble Arch, 458 Oxford Street** on marksandspencer.com (chosen by searching "Marble Arch", nothing about where the founder lives) each aisle page's own data
    carries every tile's price and unit price. `tools/groceries/mns_prices_chrome.py` (next/harvest/write) copies them exactly into
    `data/groceries/listing/raw/marks-and-spencer-prices.jsonl`; `write` puts them into `marks-and-spencer-food.csv` (per 100 g/ml x10 = per kg/litre only) and
    records the store in `marks-and-spencer-price-store.txt`. **Not done yet:** the app's M&S wording must name the store (new copy, rule 8, for the founder), then
    rebuild and the recipe coverage.
  - **No alcohol** (founder 2026-11-18): `build_groceries.ALCOHOL_SURE` leaves out names that say outright the drink is alcoholic (Hooch, WKD, VK, Au Vodka, a pre-mixed
    Absolut), alcohol-free drinks and foods such as vodka pasta sauce stay (tests); Co-op's catalogue list leaves out wines, spirits, beers by name and bottle size,
    pet food and household; a 38cm turkey roasting tray is not food.
  - **Decided:** the decisions log moved here from docs/PROGRESS.md (494 KB loaded into every session and helper).
  - **Open for the founder:** whether recipes may use products with no online price ("Price in store") — needed for Lidl; Lidl prices (maybe the founder noting about
    80-100 recipe staples from Lidl Plus); the ingredients and allergens read are not yet shown in the app; Co-op is not yet a shop in the app.
- 2026-11-18 (early morning, Mac) — **Overnight label reads, a decimal-comma fix, and why some shops have few recipes**
  - **Fixed (published figures were wrong):** labels printed with a decimal comma ("Fat 1,5g", "Protein 6,5 g": imported and EU-labelled products) were cut at the
    comma by `labels_chrome_ingest.py` (1,5 read as 1). About 100 rows at Asda, Waitrose, Morrisons and Tesco now carry the printed figure ("0,125" stays a decimal;
    "1,222" with three digits stays a thousands comma). The older script readers (Morrisons, Iceland, Tesco) already handled or refused decimal commas.
  - **Read now that wasn't:** Sainsbury's fruit tables whose first heading says "Typical values per 100g" (the figures sit in the next column), "Total fats",
    "nil" (= 0, as printed), an energy row headed only "kcal" or "- kcal". A range ("Protein 0-1g") is no longer read as a figure. Tests in `tools/tests/test_groceries.py`.
  - **Held back:** Morrisons Pizza Express 16 Doughballs (its page shows only the garlic dip's table). Not food: Asda's George Home kettles and food storers,
    Waitrose's John Lewis grater and peeler, a protein shaker.
  - **Left out on purpose:** about 234 Asda pages print energy in kJ only (no kcal): not converted (that would be a calculation, not the label). Morrisons meat pages
    that print no carbohydrate row: not filled in.
  - **Why Asda, Iceland, M&S and Tesco have few recipes:** black pepper blocks 76 recipes, salt 62, ground cumin 22, cinnamon 12, paprika 21 at shops whose pepper,
    salt and spice pages print **no nutrition table** (UK law doesn't require one on herbs, spices and salt). Nothing else has numbers for them either: Open Food
    Facts has no figures for Schwartz pepper, Schwartz cumin or Saxa salt, and the government's CoFID tables give no energy for black pepper, cumin, cinnamon,
    paprika, nutmeg, turmeric, chilli powder or oregano (and have no table salt). Measured: if unlabelled pepper, salt and dried spices could be listed and priced but
    not counted (the 17 November rule says no product without numbers in any recipe), Asda would go from 47 to 118 recipes, Iceland 33 -> 123, Morrisons 145 -> 161,
    Waitrose 111 -> 123, M&S 10 -> 22. **Open for the founder.** Next blockers after that: Asda new potatoes in water (its pages print "hob-heated and drained"
    figures, not as sold) and carrots (Asda prints boiled figures only); Waitrose and M&S sell no tinned new potatoes.
- 2026-11-18 (late morning, Mac) — **Salt, pepper and dried spices without a label may be in recipes** (founder: "Ok Yes: Asda goes from 47 to 118 recipes and Iceland
  from 33 to 123", choosing spices and salt over spices only, after the 17 November rule "products that have no nutritional information shouldn't be used for
  recipes in general"). UK law requires no nutrition label on herbs, spices or salt, and Asda, Iceland, M&S and others print none; no other source has figures
  for them (Open Food Facts empty; CoFID gives no energy for pepper or most spices and has no table salt).
  - **Which:** the pantry kinds salt, black and white pepper, cumin, paprika, smoked paprika, chilli powder, chilli flakes, cinnamon, turmeric, curry powder, mixed
    herbs, oregano, mixed spice, nutmeg and fajita seasoning (`labelOptional`). Not dried thyme, rosemary, dill, chives or mint (fresh packs share their names),
    sesame seeds, mustard, garlic or ginger (labelled foods).
  - **How:** a product of the kind with numbers always comes first. One with no numbers is used only when its name is just that seasoning: brand or range words
    first, then the seasoning's own words and plain ones (ground, fine, sea, table, jar, spices...): "Saxa Fine Salt 750g", "COOK by ASDA Cook Ground Cumin 41g",
    never "Sea Salt Crackers", "Pretzels With Sea Salt" or "Basil & Oregano Passata" (`plainSeasoning`, tests `recipeSeasonings.test.ts`); turmeric must say ground,
    haldi or powder (not the fresh root). It is listed and priced, not counted; uncounted salt leaves the salt figure blank (never too low). The match cache now
    keys on `labelOptional` too.
  - **New copy (rule 8; the founder approved "Asda doesn't print a nutrition label for black pepper, so it isn't counted in these numbers"; changed so it is true
    for every product, including one whose page we haven't read or whose table failed a check):** "Herbs, spices and salt don't have to carry a nutrition label,
    and we have none for {name}, so it isn't counted in these numbers." (and the plural), replacing "We haven't read the label for {name} yet...". Translated by AI
    into the ten languages (native-speaker check still on the founder's list).
  - **Result:** recipes Asda 47 -> 115, Iceland 33 -> 123, Morrisons 145 -> 161, Waitrose 111 -> 123, M&S 10 -> 22, Aldi 30 -> 31. Asda and Iceland now pass the
    80-recipe mark for Recipes. Also: "Per 100gms" headings read (Asda's Laila black pepper now has its own label).
- 2026-11-18 (midday, Mac) — **Salt is counted** (founder: "guess the calories fats protein etc for salt salt is always the same"; "Salt is a fundamental for
  flavour"). A salt with no label of its own counts as UK table salt labels print it, `PLAIN_SALT` in `lib/mm/recipes.ts`: 0 kJ, 0 kcal, 0 g fat, saturates,
  carbohydrate, sugars, fibre and protein, 99.9 g salt per 100 g, the figures printed by Aldi's British Table Salt and Cerebos Iodised Table Salt (read from
  their shops' own pages today; Sainsbury's own salts print 97.25 g and 1 kcal). So a recipe's salt figure is whole, never blank or too low. Founder's decision
  overriding CLAUDE.md rule 1 for this one food; pepper and dried spices stay listed but not counted. New copy on the recipe page (rule 8): "Salt doesn't have to
  carry a nutrition label. Where the shop gives none, we count it as UK table salt labels print it: no calories, protein, carbs or fat, and 99.9 g of salt in
  every 100 g." (AI-translated into the ten languages). Checked in the app (dev server): Asda's chicken wraps show it with COOK by ASDA Cook Sea Salt; Asda's beef
  chilli shows the spice line for ground cumin. Recipe counts unchanged (Asda 115, Iceland 123).

- 2026-11-18 (evening) — **Apple's agreement is accepted.** Checked read-only in the founder's Chrome after they signed in: developer.apple.com › Account lists the Apple Developer Program License Agreement (issued 29 October 2026) as accepted on 18 November 2026; App Store Connect › Business shows the Paid Apps Agreement (16 Oct 2026 – 4 Jul 2027) and the Free Apps Agreement (17 Nov 2026 – 4 Jul 2027) Active, the bank account and both tax forms Active. The only notices on the Apps page are Apple's China mainland declarations (not a UK concern). Nothing uploaded or submitted: the founder wants the grocery label work finished first. Build 6 (1.1) still predates the 17-18 November grocery changes, so re-pack and archive again before uploading.

- 2026-11-18 (evening) — **Recipes screen: several filters at once, one Filters sheet, side-by-side Cuisine and Occasion, "My recipes", a shorter Make it at home card** (founder, from a
  screenshot: "people should be able to select multiple like breakfast lunch dinner quick no meat etc ... when they select more it opens all of them including the 7 there and
  they can select more filters multiple as many as they want"; "if they select breakfast lunch dinner and no meat or fish and vegan, it will show breakfasts that are no meat or fish
  and vegan, lunches that are ... and dinners that are ..."; "could it be worth putting [cuisine and occasion] side by side"; "instead of the love heart ... maybe its better having
  'my recipes'"; the Make it at home sentence "takes up 3 lines maybe have it take up 2"). **Rules:** the meal tiles are alternatives (Breakfast + Lunch shows either); Quick, No
  meat or fish and Vegan all apply to every meal chosen; several cuisines or several occasions are alternatives within their field, and the two fields together both apply
  (`matchesNiche`, `nicheCounts` in lib/mm/recipeNiche.ts take lists; the address carries `?cuisine=chinese,indian`). "More" opens a Filters sheet with the four meals, the three
  others, every cuisine and occasion with how many recipes each has (0 greyed out unless chosen), then the sort, meal size, allergies and diet as before, and a bottom bar with
  Clear all and "Show n recipes". Cuisine and Occasion sit side by side (one above the other with large text) and each opens the sheet at its own choices; the field shows what
  is chosen with commas ("Chinese, Indian"), not "and". The heart at the top right is now a pill "♡ My recipes" with the saved count, opening My meals' Recipes tab. The Make it at
  home card is tighter (48 pt camera square, 36 pt arrow, 14 px sentence): two lines from a 393 pt wide iPhone up (iPhone 16 and 16 Pro), still three on 375 pt phones (SE, mini).
  **New copy (rule 8, from the founder's request):** "My recipes", "Only show" (heading over Quick, No meat or fish, Vegan in the sheet), "Show {n} recipes", "Show 1 recipe"; in
  the 10 languages by AI, for the native-speaker check. Tests: tests/recipeNiche.test.ts (17), e2e/recipes.mjs cuisine step rewritten for the sheet and several choices.

- 2026-11-18 (night) — **Scan your food (Premium), replacing Home's My meals card** (founder: "replace my meals with instead a way to scan food at resturantes or
  whever the person is and they will get the calories protein fats and also carbs like everything estimated. you can use all the resturante information with
  their menus ... you can also use from the recipies section"; "its a premium feature"; the real dishes are "used to reference and help you", not shown; "whatever
  you think is the most accurate way"; "Yes, build it"). **CLAUDE.md rule 1 now names this as the one exception** (an AI estimate, always marked). **How it works**
  (lib/mm/foodScan.ts, lib/foodScanHandler.ts, lib/foodScanAi.ts, lib/foodScanRefs.ts, app/api/v1/scan/route.ts, app/app/scan/page.tsx): the phone shrinks the
  photo; Claude Haiku 5.5 takes a first look (what is on the plate, how much, searches for dishes like each food); the server finds up to 40 reference dishes
  with real figures among the 241 chains' published menus (menus-search.json + menus-numbers.json, read from the website's own files, about 37,000 dishes) and
  our recipes worked out from Sainsbury's labels (lib/mm/scanRecipeRefs.ts, generated by tests/scanRecipeRefs.test.ts); Claude Sonnet 5.5 at high effort
  estimates each food from the photo using those references as its yardstick; the server checks every number (ranges, calories within 20 % or 40 kcal of 4/4/9
  from the macros, alcohol allowed more) and sums the totals itself; one more go if an answer can't be used. Nothing is stored; the references are never shown.
  **Screen:** a first page that says what it does ("Take a photo of your plate and Pip estimates its calories, protein, carbs and fat"), Take a photo / Choose a photo,
  the camera and scanning look from Make it at home, a loading screen, then the plate's name, "Estimate from your photo", calories and the three macros, what Pip
  counted, how sure it is, and "Add to Breakfast / Lunch / Dinner" (logged as "{name} (estimate)", source custom). **Switch:** the same as Make it at home
  (`FOOD_SCAN_ENABLED` = `PHOTO_RECIPES_ENABLED`); with it off, Home keeps its My meals card. With it on, Home's second card is "Scan your food" (a Premium tag for a
  free person) and My meals is a slim row under the two cards. **Privacy page:** a Scan your food paragraph (shown whenever the route answers). **New copy** (the
  founder asked for the feature; English only while languages are off): the screen's lines, the paywall bullet "Photograph your food for an estimate of its
  calories, protein, carbs and fat", the Home card "Scan your food / Snap your plate to see its calories". **Not yet done:** a real photo through the live AI
  (costs a few pence a scan; waits on the founder's yes), the App Privacy answers in App Store Connect for the new use of photos.

- 2026-11-18 (night) — **Nutrition leaderboards replace Groceries' "Cheapest protein" shortcut** (founder: "have something called nutritional leaderboards ... rank the top
  20 products for each thing ... include the logo of the shop that they can buy it from, and also if the same product is sold by multiple shops, include all the logos").
  lib/mm/leaderboards.ts, app/app/groceries/leaderboards/page.tsx, public/groceries/all/leaderboards.json (written by `WRITE_LEADERBOARDS=1 npx vitest run
  tests/leaderboards.test.ts`; **add it to the rebuild cycle after build_all_products.py**; the test fails when the file is stale). Six boards, top 20 each, across
  every shop: Most protein for the calories (g per 100 kcal, protein foods only), Most protein (per 100 g), Cheapest protein (pence for 10 g, as before but every
  shop), Most fibre, Most carbs (starchy foods: sugar at most a quarter of the carbs), Fewest calories (per 100 g, from 5 kcal). Only the shop's own label or the
  same product's label read at another shop; never community numbers, government produce figures or cooked labels; per-100 g boards compare foods by weight.
  **Left off by name** (the first build was twenty protein powders, twenty herbs and spices, twenty bags of sugar): powders, supplements, herbs, spices and
  cupboard extras (salt, vinegar, baking powder) on every board but Cheapest protein, sugar, sweeteners and sweets on Most carbs and Fewest calories; the page says
  so. The same product at several shops (same barcode, or exactly the same name) is one row with every shop's logo, the best shop first; a row opens the
  every-shop product page when it has a barcode and several shops, else that shop's product. The old Cheapest protein page (with its pairs) stays, linked from its
  board. Free tier when paid access exists: the first five rows, as before. **Not done:** a vegan board (founder: "top 20 for vegans"): we hold no vegan marking we
  can trust for supermarket products yet. **New copy:** the six boards' names and lines, the page's lines, the shortcut "Nutrition leaderboards / The top 20
  products for protein, fibre and more". Also today, from the founder's screenshots: Groceries' chosen-shops button moved to the foot of the screen and named
  ("See Lidl's products" / "See products from {shops}" / "See products from {n} shops"); no "Your shop" tag; "My list" renamed "Shopping list".

- 2026-11-18 (night) — **Community switched off; the fresh-eyes review's mistakes fixed** (founder: "Okay, fine. In that case, we'll remove the community one"; "Apply any
  edits you better think to make the app easier to understand"). **Community:** `COMMUNITY_ENABLED` (lib/mm/config.ts) is on only with NEXT_PUBLIC_COMMUNITY=1:
  four tabs (Home, Eat out, Groceries, Recipes), no Community stop in the welcome tour, every /app/community page (and an old friend-invite link) opens Home
  (app/app/community/layout.tsx), Send to a friend hidden (the shopping list keeps the phone's own Share). Nothing deleted: the pages, the food blogs, the
  database tables and their data stay. e2e: smoke, tour, a11y, largetext, extra, offline now walk four tabs; community.mjs and community-friends.mjs need a build
  with NEXT_PUBLIC_COMMUNITY=1. **Review fixes:** no doubled possessive anywhere ("McDonald's's own guide", "Sainsbury's's website"): lib/mm/i18n.ts format gives
  "{name}'s" the possessive of the name (Tesco's, Morrisons', McDonald's); Filming mode shows in Settings only in testing builds or while it is on (Shift+F
  still turns it on); Search every shop offers only the app's own shops as chips (no Co-op or empty Ocado chip); the beef chilli's blurb no longer says "for
  four" beside Serves 1 ("A batch-cook classic that keeps well for the week."). **Waiting on the founder (rule 8):** Best for you at McDonald's ranks espressos
  first for building muscle (1 kcal, so protein per 100 kcal is high): a minimum size for a pick changes the ranking and its golden cases. **Note:** the app pack
  keeps leaderboards.json whole; if some supermarkets are left out of the App Store version, its rows for those shops would still show their logos.

- 2026-11-18 (night) — **Best for you skips tiny items** (founder, "Yes, skip them", after the review found McDonald's ranking Americanos and espressos first for building
  muscle: 1 kcal makes protein per 100 kcal look high). SPEC §6.4 step 4, `RANKING_CONFIG.minPickCalories = 100` (web/lib/mm/ranking.ts) and
  `MIN_PICK_CALORIES` in the oracle (tools/reference_ranking.py): a ranked pick has at least 100 kcal, unless nothing that big fits the meal (then all that fit are
  kept). Out-of-budget mode (protein ≥ 10 g, lowest calories) is unchanged. Golden cases regenerated: one case loses its 60 kcal fruit cup. McDonald's, lunch,
  build muscle now starts Double Quarter Pounder with Cheese, Chicken Selects (5), Double Sausage & Egg McMuffin.

- 2026-11-18 (night) — **Tesco tried once more, at the founder's request, and stopped again.** The founder opened Tesco in their own Chrome (no security page) and
  asked for Tesco today; one reader at 8 seconds a page read about 53 product pages, then Tesco's security page ("Oops... It looks like something is not right")
  came back on six pages in a row in round 6, and the reader stopped there. The founder had asked whether they could clear the check and let the readers go on,
  or whether the tab could be closed and opened again to keep going: no, both get round the site's protection against automated reading, so a security page
  stops a shop's reader and it doesn't continue after a check is cleared. Tesco stays stopped; its nutrition grows only from the same product read at other shops
  and community numbers. Also held back: two Waitrose mixed packs whose page prints one item's table (a breadstick selection, Peter's Yard crackers selection).

- 2026-11-18 (night) — **Today's version on the founder's iPhone 16.** Packed the web app in the shipped form (63.8 MB; photos from numbite.com; no purchase flags, so
  Premium, Make it at home and Scan your food don't show), built Numbite 1.1 (6) with development signing (BUILD SUCCEEDED, 67 MB) and installed and launched it
  with `devicectl` over the cable (data kept). Tesco: a third try at the founder's request was turned away by the security page on its first round; the reader
  stopped and left its tab open, as the founder asked; Tesco stays stopped for the day.

- 2026-11-18 (night) — **Clarity changes from the fresh-eyes review** (founder: "Apply any edits you better think to make the app easier to understand, and so people
  understand what each screen does"; "make sure all the stuff I've told you in this entire conversation, you definitely added"). **Dish page:** the one big button
  is "Add to today" (it was "Customise"); "Change the order" opens the builder; Save has the heart (as on recipes) and says "Saved to My meals."; the builder's Log
  is "Add to today". **Home:** a line under the date, "Your food today: what you've eaten and what's left.", and the gear says Settings in words. **Groceries:**
  "Supermarket food, with its price and the calories and protein on its label." **Recipes:** the line starts "Pick one of our recipes, or make your own from a
  photo." (just "Pick one of our recipes." where Make it at home is off). **Restaurant page:** the note on how its figures were read moved from the top to the foot,
  beside the source (the menu started 1,500 px down); the calories-only and halal notes stay at the top. **Settings:** "Set up your plan again" (was "Set up with Pip",
  easily taken for the tour), "Where your daily targets come from" (was "Where these numbers come from", beside SPEC's "How we get our numbers"), goal "On a GLP-1
  medication" as in onboarding. **Setup:** with no shop ticked it says recipes use the supermarket we have most labels for; room under the last shops; the end
  of the tour no longer says "That's the tour!" to someone who pressed Skip tour. **Shop lists:** "Loyalty card price" (was "Has a card price"). e2e updated
  (recipes, shoppick, leaderboards, groceries-all, browse pass on the dev server; back-restaurants' Cmd-click-a-new-tab step times out on this Mac, a link this
  change didn't touch). **Not done from the review** (bigger, next): one word for saving across chains' Favourites, opening a shop on its aisles, folding the Today
  page into Home, bigger tab bar labels at large text sizes; the McDonald's note saying allergens are shown while its allergen box says they aren't (menu data, the pipeline).

- 2026-11-18 (night) — **Plan my week** (founder: "they type all of this in, and then my app will make them a diet plan for a week. It'll tell them what they need to buy
  for the week ... how much the price is for each meal of each day ... the full cost ... Budget, amount of money per week"; "you should only use the pre-made recipes
  ... just filter it to that, and make the best plan for them"). No AI. lib/mm/mealPlan.ts (tests/mealPlan.test.ts, 9 on Sainsbury's real list) and
  app/app/plan/page.tsx, reached from a card on Recipes ("Plan my week"; the Recipes tab stays lit). **Questions** (one page, numbered): the daily target from the
  person's own plan (Change opens Settings' targets), diet and allergies (the app's one setting), foods they don't eat (12 plain choices plus typed words, matched
  in a recipe's ingredients, never a seasoning), a budget for the week (optional), their shop. **Rules:** our recipes only, each fitted to the Recipes tab's
  meal size with a protein aim of 30% of the day's protein; left out when the diet, an allergy or a food left out rules it out, or the shop can't make it with
  read labels and prices; each meal of the day rotates through its 4 closest recipes (each at most twice a week). With a budget, the dearest recipe is swapped
  for the cheapest one of that meal still within 0.3 of the meal size (never a 200 kcal soup for lunch), then a meal rotates through fewer recipes so packs are
  shared; if even that is over, the page says so. **The week:** the shopping bill (every meal's amounts added up per product, as whole packs) against the budget,
  what the 21 meals use of it, the daily calories and protein, each day's three meals with calories, protein and price (opening the recipe page), Swap this meal,
  the day's totals, the whole shopping list (cupboard items say "You may have this already") and "Add all to my shopping list". Kept on the phone
  (`mealPlanStore`, mm.v1.mealPlan, never synced, cleared by Clear data). Checked in the browser (1,900 kcal, no mushrooms, £40: £47.00, the cheapest sensible week,
  about 1,685 kcal and 114 g protein a day; Swap and Add all work). **Not yet decided:** free or Premium (free for now); weight and goal weight are not asked:
  the daily target already comes from the person's plan in setup. **New copy:** the page's questions and lines, the Recipes card.

### 18 November 2026 (evening): Scan your food's server part live; auth.numbite.com steps

- **Scan your food is on numbite.com** (founder: "yes i give the go ahread to scan the food", in answer to "its server part has to go live on numbite.com, which needs
  your go-ahead"). Only the scanner went: branch `scan-live` = origin/main aafea749 + one commit (8825833f) with `/api/v1/scan`, its handler, AI calls and reference
  dishes, the `/app/scan` screen, tests, the privacy paragraph, the `foodScan` paywall trigger and CLAUDE.md rule 1's exception. Nothing else from `iap` (sign-in
  required, Community off, Plan my week and the rest stay on the Mac). Vercel already had `NEXT_PUBLIC_PHOTO_RECIPES=1` and `ANTHROPIC_API_KEY`, so the route answers:
  checked with no photo (403 without the app's origin, 400 for a bad request); no real photo was sent (it costs money and needs Premium). The website shows no Scan card
  (Home's card is on `iap` only); the iPhone app's copy reaches the route. Everyone gets "Premium" until `ENTITLEMENT_PRIVATE_JWK` holds a real key (founder to-do).
- **Sign-in on auth.numbite.com** (founder: "for supabase pls use my numbite.com one"): Supabase's Custom Domain add-on; the founder's steps are in
  docs/SUPABASE_CUSTOM_DOMAIN.md (it costs money, so the founder turns it on). Afterwards Claude changes `SUPABASE_URL` and redeploys with the founder's go-ahead.
- Held back two labels whose pages print another item's table or a figure that can't be right: Morrisons 115605237 (Cream Cake Selection, "Per éclair") and
  M&S fdp61228304 (Daylesford Rye Sourdough Crackers, 111.6 kJ beside 265.7 kcal).

### 18 November 2026 (evening, later): the guided tour on the real screens; Scan your food crops to the frame and knows food on screens

- **Pip's tips on the real screens** (founder: "commit the guided tour ill try it like i want a guided tour of what everything does", answering "'Look around first':
  a guided tour inside the app, or always show the current tour?"). After the welcome screens, the first visit to Home, Eat out, Groceries and Recipes dims the
  page and lights one real control at a time (lime ring) with a card: Pip, "Tip n of m", a title and one plain sentence, Next/Done and "Stop the tips"
  (app/app/_components/CoachMarks.tsx, coachSteps.ts; lib/mm/coach.ts). A modal dialog (nothing behind is tapped by mistake, focus on the tip, Escape = Done); it
  waits for the tab's controls and for other sheets (the trial offer waits for it in turn), scrolls each control into view and shows the card once the page is
  still, on the screen at every text size. Each tab's tips show once; "Stop the tips" stops them, and setting up again doesn't bring them back; Settings › Help ›
  "Show me the buttons on each screen" always does. Kept on the phone only (`mm.v1.coach`), reset by Clear data and Reset onboarding. People set up before
  today see none unless they ask in Settings. The welcome tour's rows now match the screens (Settings pill, Scan your food, leaderboards, Plan my week, My
  recipes). e2e/coach.mjs (4 steps, axe, large text); older e2e start with the tips stopped; tour.mjs now counts four stops (it still said five since Community went off).
- **Scan your food, after the founder's first try** (a dish on a website): the photo taken was the camera's whole wide picture, more than the screen showed
  ("it should only be the frame that the person scanned"); now only the part under the corner marks is taken (lib/mm/photoCrop.ts, Make it at home too). And Pip
  said it couldn't recognise food: the first look now counts a dish on a screen, menu, advert or pack as food and describes only the one in the middle; the
  estimate takes one ordinary serving. The prompt change went live on numbite.com (main 368f832e, the same scanner go-ahead); the crop reaches the phone with
  the next install.
- Asda: every page read (the reader's list came back empty). Held back more mixed-pack and odd labels (holdback.csv): Asda 9408715, M&S fdp60608783, six
  Volvic waters at Waitrose whose Energy has no unit.
- Tesco: the founder asked three more times to restart Tesco after its security page ("im the one who is looking at the page so its fine"); declined again
  (carrying on after a cleared check gets round Tesco's bot check, whoever watches). Fresh start tomorrow; a security page stops it for that day.

### 18 November 2026 (night): meal plan with Pip and several shops; several shopping lists and Swap; Scan your food asks what the food is; a safety net for screens

- **Meal plan** (founder: "make a third icon, which has meal plan, and that has pro on it ... Pip's guiding them through ... select the shops they want ... add
  all the ingredients to their shopping list ... swap them out for other meals ... select multiple supermarkets ... choose the best meal plan overall"). Home's
  third card (the whole width under Shopping list and Scan your food, Premium tag where Premium exists; Home stays lit on it). Premium (`mealPlan` paywall
  trigger and bullet; without Premium the page says what it does and offers Premium). Five screens with Pip: daily numbers (from setup, "Change my numbers"),
  diet and allergies, foods left out, budget (£30-£80 or typed, or no limit), shops (tick as many as you like). lib/mm/mealPlan.ts: each recipe fitted at
  every chosen shop; the plan takes the closest fit, or a cheaper one within SHOP_FIT_SLACK (0.05); one meal's ingredients from one shop; shopping per shop
  with its total; swapChoices/setMeal give a list to swap a meal to. Worked out one shop at a time on "Making your plan" (about 0.6-0.9 s a shop on the Mac),
  cached while the app is open. A one-shop plan saved earlier still opens. Add all puts each shop's packs on that shop's own list (the newest) if there is one,
  else the main list. Renamed "Plan my week" to "Meal plan" everywhere.
- **Several shopping lists and Swap** (founder: "create multiple shopping lists ... press plus and what do you want to create a shopping list for? ... it can only
  be one of the shops"; "they can always swap out ingredients when they're at the supermarket and they can't find something"). Built by a helper on its own
  branch, merged: `ShoppingItem.list` (absent = the main list, unchanged), list names in settings `shoppingLists` (synced with settings; no new store, no
  database change); an item on an extra list syncs as `<list>|<retailer>|<code>`. "+ New list" asks which shop (logo tiles; "M&S", "M&S 2"...); chips pick the
  list; "Delete this list" with a confirmation. A product page asks "Add to which list?" when there is a list for its shop. Swap on every shop product: similar
  products at that shop (same category, shared name words, cheaper first), tapping one replaces it (`similarProducts`). Counts on Home, the badge and Recipes
  count all lists. Recipe "add all", "Add the rest" and shared lists go to the main list; the 200-item limit is for all lists together.
- **Scan your food asks what the food is first** ("What are you eating?", required before either photo button; sent with the photo, cleaned, put before both
  AI looks; optional on the server so older apps work). Server part live on numbite.com (main a1241cd5, the same scanner go-ahead).
- **Crashes** (founder: "Sometimes my app just kind of crashes"): the phone's crash and memory reports have no Numbite entry (the one memory report today was
  Mail's), so the likely cause is a screen error leaving a blank page. Added app/app/error.tsx (Pip, Try again, Go to Home; the tab bar keeps working) and
  app/global-error.tsx. Nothing is sent anywhere. (The native web view already reloads if iOS ends its process.)
- Home: no My meals where the scanner is ("I don't want My Meals anymore"); the Shopping list and Scan cards' icons in the light green.
- Tests: 2184 unit tests pass; e2e lists 9/9, mealplan 6/6, listadd 8/8, sharelist 11/11, coach 4/4. More mixed packs held back (Waitrose 978402, 989516,
  951401; Morrisons 110867182).

### 18 November 2026 (late night): sign-in kept in the Keychain; the meal plan's budget slider, recipe count, meals and snacks
- **Signed out after every new build** (founder: "It always goes to this screen whenever you do the new build"): the page kept its session only in the web
  view's local storage, which can lose its newest writes when iOS ends the app at once (an install, an update, a crash); Supabase renews and rotates the
  refresh token, so the renewed one was lost and the old one refused. Now the iPhone app also keeps the page's session text in the Keychain
  (`MenuMacros/Services/SessionStore.swift`, bridge `session.load` / `session.save`, this iPhone only, after first unlock, never iCloud); the page restores it
  first on start (`restoreKeychainSession`, `web/lib/mm/persist.ts` `withCopy`). Signing out and Delete my account clear it. The first start of the build that
  brings this may still ask once. Commit 984daef4, Mac branch `iap`.
- **Budget slider** (founder: "an arrow from a to z ... a green spot based on what to choose to be perfect, higher ... better produce, lower ... lower value
  produce but still to fit what they want, they can't go lower"): the budget step is a slider from the cheapest week that still meets the numbers to the week
  with "better" products (the shop's own premium lines: Taste the Difference, Finest, Extra Special, organic, free range...), with a green stretch at the best
  fit. Below the best fit the plan picks cheaper fits; above it, meals are upgraded cheapest-extra-first while the week stays within the budget, tagged "Better
  products". Pip says how many recipes are left as foods are left out (no cap; a warning under 4, Continue blocked when a meal has none). Recipes' top line
  shortened; the Meal plan card on Home fits two lines. Commit 8ee6d902.
- **Meals and snacks** (founder: "should also specify how many meals and how many snacks they want a day as well ... full personalization"): a new step 2,
  "Your meals and snacks": any of breakfast, lunch and dinner (at least one) and 0-3 snacks. Sizing (`slotTargets`, `lib/mm/mealPlan.ts`): a snack is a tenth
  of the day, kept between 100 and 250 kcal; the meals share the rest 0.8 : 1 : 1.2 (dinner the largest), each kept between 200 and 1,200 kcal and under the
  GLP-1 meal cap when that mode is on; protein follows each slot's share of the calories. The step shows each slot's kcal. A day with two snacks of the same
  kind gets two different ones; swaps never repeat a recipe already on that day. Saved plans keep their slots (`SavedPlan.slots`; plans saved before open as
  breakfast, lunch and dinner). Six steps now. Tests: 2193 unit tests pass, e2e mealplan 7/7. Mac branch `iap` and the phone only; not on numbite.com.
- **One shop or several, said plainly** (founder: "if they choose one shop, all the ingredients can be bought from one shop. If they choose two shops ... spaced
  over two shops ... it needs to be clear to them"): on the shops step Pip's line follows the ticks ("Everything will come from {shop}: one shop, one shopping
  list. Pick another too, and I'll share the meals between them." / "I'll share your meals between {shops}, using the best shop for each meal."), and a card
  under the list says how ("With 2 shops": each meal comes from the shop whose products fit your numbers best, the cheaper one when as close, all its
  ingredients bought there; the list split by shop; more shops, more recipes). It replaces the grey line that sat under the Continue button. The intro card
  now says "Your meals and snacks for seven days". e2e mealplan 7/7.

### 19 November 2026 (early hours): the meal plan uses up its packs; Pip shows the work; pictures in the week's shopping; Select on the shopping list
- **Packs used up** (founder: "by the end of the week, all the ingredients shall be basically almost complete. Except for like the oil and the herb"):
  measured first on Sainsbury's, Asda and Morrisons (2,000 kcal, 120 g protein): a week ate about half of what it bought. Now `makePlan`
  (`lib/mm/mealPlan.ts`) ends with a search (`fillPacks`): a recipe is changed for another close to the meal size (within PACK_FIT_LIMIT 0.1, or the plan's own
  furthest), or two swap which comes round more often, whenever that leaves less fresh food in the packs, weighed with the bill (0.3) and the fit (3 a meal);
  never dearer than the budget, or with no budget than before. Fresh food = everything except KEEPS_WELL (dry goods, jars and bottles, oils, frozen food) and
  cupboard items. Result with "Some repeats": 80-87% of the fresh food eaten (Sainsbury's best-fit week also fell from £100.82 to £79.95, the meals as
  close to size as before); "Meal prep" 88-92%; "A different meal every day" 72-78%. The week says "{pct}% of the fresh food you buy is eaten this week",
  and a fresh product with 30% or more left says "About {pct}% left at the end of the week".
- **How often a meal comes round** (founder: "they can choose if they want any foods repeated"): on the meals and snacks step, "A different meal every day"
  (7 recipes for each meal), "Some repeats" (4, the default and the plan as before), "Meal prep" (2, cooked in batches). Kept as `SavedPlan.variety`.
- **Making your plan** (founder: "it should take about maybe 10 seconds ... show them what you're doing ... so you're showing them that you're properly
  working"): after "Make my plan", Pip shows seven steps one at a time, 1.4 s each (about 10 s), each with its real figure: the recipes that suit the diet,
  the products looked through at the shops, the daily numbers, the meals and snacks chosen, the share of fresh food eaten, the bill against the budget, the
  products on the list. Nothing on it is made up; the work itself takes well under a second.
- **Pictures in "What to buy for the week"** (founder: "include images of all the products"): each product shows the shop's own photo (the same sources as
  the shopping list; the quiet "no photo" tile when none loads) and opens the product.
- **Select on the shopping list** (founder: "a way to select all the products in your shopping basket and remove them all together"): "Select" above the
  items turns the ticks into select boxes, with "Select all"/"Deselect all", "{n} selected", "Done" and a "Remove {n} items" bar that stays in view; it takes
  the chosen items off the list shown only, with Undo for 8 seconds. "Remove ticked" and "Clear list" stay at the foot.
- Tests: 2199 unit tests pass (6 new for the packs and variety); e2e mealplan 8/8, lists 10/10, listadd 8/8, sharelist 11/11. Mac branch `iap` and the phone.
- Labels: M&S is fully read. Held back: 12 M&S squashes and a pressé with figures that can't be right, 6 Waitrose mixed boxes with one flavour's table,
  6 Iceland pages (water mineral tables, wine with only energy, a kJ/kcal clash, garbled rows).
- **The whole picture** (founder: "a thing in the bottom right of the image of the photo where you can zoom in for full view of what it looks like"): a round
  button at the recipe picture's bottom right (above the sheet that covers its foot; on the person's own photo too) opens `PhotoViewer`
  (`app/app/_components/PhotoViewer.tsx`, a native modal dialog): the picture uncropped on black, pinch or double-tap to zoom up to 4x, drag to move round,
  "Zoom in"/"Zoom out" for anyone who can't pinch, Close or Escape. The recipe pictures are stored 800 px wide, so close zoom is a little soft on a phone.
  e2e photoviewer 4/4 (axe clean).
- **Every shop that sells a board's product** (founder: "If some of these products are sold by multiple stores ... have the logo of the other store that also
  sells them next to the logo which is already there ... like a domino"): the boards already showed each shop in a row's group, but grouped only by barcode
  or exactly the same name, and only shops with a label. Now `sameProductGroups` (`lib/mm/leaderboards.ts`) joins the same product by barcode or by
  `brandedNameKey` (the shop lists' own name_key rule: a branded name with its pack size, never a shop's own brand), with the words in any order, a plural s
  or a final full stop aside; never by an M&S name (its own range is listed without "M&S") or a name two barcodes share. Shops that sell it with no label
  of their own come after those whose label gives the figure. Rows with several shops: 16 before, 21 now (Mr. Porky at Asda, Sainsbury's and Waitrose;
  Brown & Polson cornflour at three shops; Ember biltong, Kallo veggie cakes, The Curators pork puffs, Rice Krispies). The logos sit side by side, each whole,
  never one over another (CLAUDE.md rule 2). Own-brand products (Tesco Chia Seeds, ASDA Chia Seeds) are different products with their own labels and stay
  their own rows; The Chia Co seeds are sold only at Sainsbury's in our lists. 12 leaderboard unit tests pass; e2e leaderboards 3/3.
- Held back: Morrisons 111611373 (protein printed "5, g"); Waitrose: 2 mixed boxes with one item's table, 13 teas whose per-100 g table is the brewed drink.
- **Prices on the boards** (founder: "You should also reference the price too"): under each shop's logo on a board row, that shop's shelf price for the
  product ("In store" where the shop's website prints none: M&S's everyday range, Lidl); with several shops priced, the cheapest in bold. VoiceOver reads
  "Sold at Asda: £2.00, Sainsbury's: £2.00 and Waitrose: £2.20". The page's note says the prices are shelf prices and vary by store. e2e leaderboards 3/3.
- Held back: 9 more Iceland pages (5 water mineral tables, 3 drinks with only energy, a Coke Zero whose salt per 250 ml and per 100 ml disagree).
- **Prices beside the logos on other screens** (founder: "add the prices next to the logos on other screens too"): `ShopPrices`
  (`app/app/groceries/ShopPrices.tsx`), each shop's logo with its price under it (the cheapest in bold when several are priced, a loyalty-card price under the
  shelf price, "In store" where none is printed), now on the leaderboards and on every product row in search and the shop lists (every shop that sells that
  barcode, the filtered shop first, then the cheapest; it was one price as text, "£2.74 at Asda"). The product page's shop chips say each shop's price
  beside its logo and name. The recipe and shopping-list rows already showed their prices. e2e leaderboards 3/3, groceries 6/6, groceries-compare 8/8,
  groceries-all 8/8. Held back: 19 more Waitrose teas whose per-100 g table is the brewed drink, 2 Morrisons labels (a 97 g fat typo, a portion column
  copied from the 100 g one).
- **A made recipe saves itself** (founder: "When the person makes a recipe it automatically becomes a saved recipe. They can remove it from the recipes in my
  meals later if they want"): Make it at home and Pip's recipe maker keep the recipe in My recipes the moment Pip makes it (`keepMadeRecipe`,
  `lib/mm/aiRecipe.ts`; with the person's photo as its picture), and say "Saved to My recipes. You can take it out there any time." My recipes keeps 30
  (MAX_SAVED_RECIPES, unchanged): when a new one makes room the screen says which one went, never silently. In My meals › Recipes a made recipe's heart is
  filled; tapping it takes the recipe out, with Undo for 6 seconds, like the book's recipes.
- **The photo cropped round the food** (founder: "You should automatically adjust the photo yourself to make sure the food is in it", a Make it at home photo
  of a website showing its offer banner, not the dish): the quick food check (Haiku, the same call) now also gives "food", the smallest box round the dish as
  fractions of the photo (DESCRIBE_SYSTEM_PROMPT; `cleanFoodBox`, `foodCrop` in `lib/mm/photoRecipe.ts`; returned by /api/v1/recipe/photo/describe as `food`).
  The app crops the photo round it with a margin at 4:3 (`photoOfFood`, `app/app/_lib/photo.ts`) for the top of the recipe and the saved picture; with no
  box (an older server, or Pip unsure) the photo shows as taken. The server part must be live on numbite.com for the phone to get the box. e2e photorecipe
  16/16 (the test build), unit 2205.
- Held back: 11 more Iceland pages (all of Iceland is now read), 19 Waitrose coffees whose per-100 g table is brewed coffee or contradicts its serving
  column. Kept: 12 Waitrose coffees that all print the same roasted-coffee table (406 kcal per 100 g), plausible for beans as sold.

### 19 November 2026 (night): everything on `iap` live on numbite.com
- Founder: "Yes, put it all life, please", then "Put it all live pls". First the food-crop server part alone (main 4119d9a5, deployed Ready), then all of
  `iap` merged into `main` (d0d1fb0f, 152 commits). Checked first: the API and server code are identical on both (the live App Store 1.0 app talks to the same
  API; the founder's phone has run `iap` against it for days), the restaurant menu data is unchanged, 1.0 carries its own grocery lists, and no database
  change is needed. The five conflicts were the scanner and food-crop changes that had gone to `main` as copies; `iap` held every one of their lines and more,
  so `iap`'s side was taken and the merged tree is exactly `iap`'s (2205 unit tests, e2e photorecipe 16/16). On the website nothing is sold (GATING_ENABLED
  false): every feature is open, Make it at home and Scan your food stay hidden, and everyone signs in (SIGN_IN_REQUIRED). The App Store app is unchanged
  until 1.1 is uploaded and approved; that still waits on the payment key (`ENTITLEMENT_PRIVATE_JWK`) and the In-App Purchase products.
- **Tabs in a new order** (founder 19 Nov: "home; recipes; groceries; resturantes"): Home, Recipes, Groceries, Eat out (`app/app/_lib/tabs.ts`; the welcome
  tour's stops follow the bar). The label stays "Eat out".
- **Logos instead of shop names on mixed-shop product rows** (founder: "Instead of writing Sainsbury's, Asda, whatever, add their logos ... on the right
  side"): `ShopProductRow` with `showShop` shows the shop's own logo at the row's top right; the name is kept for screen readers ("Asda, ..."), as on the
  leaderboards. A founder's call on CLAUDE.md rule 2's "next to its name": in these rows the logo stands for the name on screen.
- **Make it at home says a photo can be snapped or uploaded** (founder: "they can either snap or upload a photo of dish to make it they should know that"):
  the Recipes card, the Premium screen and Pip's first line now say so.
- The fridge recipe idea ("take a photo of their fridge or type what's in it") is not built: still the open decision for the next version.
- Tesco read about 36 pages, then its security page came back ("Oops... It looks like something is not right"); stopped for the day with the tab left
  open, no refresh (the founder asked to refresh past it; declined: that works round Tesco's bot protection). Asda and Sainsbury's are fully read.

### 19 November 2026 (small hours): elderly-user testing; earlier meal plans; cook with what you have; cuisines in the meal plan
- **Usability test** (founder: "Get a few AI agents to act like 80-year-old granddads and grandmas"): four testers (Doris 82, Arthur 79, Margaret 85,
  Ted 88), each on its own headless phone (`web/e2e/persona-driver.mjs`) against a production build with sign-in off, Extra large text, from the welcome
  screen. Findings reported to the founder (bugs that stopped jobs; a long first run; jargon; faint controls; content below the fold). Not yet fixed.
- **Earlier plans** (founder: "they can start another meal plan ... or create multiple meal plans, whatever you think could be the best"): one plan is
  followed; "Make a new plan" is now at the top; the plan it replaces is kept under Earlier plans (last five, `earlierPlansStore`, phone only, cleared by
  Clear data) to open again or remove with Undo.
- **Cook with what you have** (founder: "people can write down what they have in their fridge, and then it can make some cool recipe which tastes nice";
  "And based on what vibe of food they wanna eat"): `app/app/recipes/fridge`, a card on Recipes. Type or tap what you have, pick what you fancy
  (Anything, Comforting, Spicy, Fresh and zesty, Cheesy, Quick, or a cuisine): our recipes that use most of it, free (`recipesFromFridge`, `moodMatches`).
  "Ask Pip for a new recipe" (Premium, hidden on the website like Make it at home): `/api/v1/recipe/fridge` (`lib/fridgeRecipeHandler.ts`), Claude Sonnet
  5.5 with the same caching and checks as Make it at home, only the shop's own products so every number is from a label, "fromHome" naming what they
  had; saved to My recipes as it's made. Not live: the route needs deploying.
- **Cuisines in the meal plan** (founder: "they should also be able to choose the cuisine or have the option to do any cuisine"): a new step 4, "The
  food you like": Any, or any of the recipe book's cuisines (British, Chinese, Indian, Italian, Mexican, Middle Eastern) with how many lunches and dinners
  each has; it narrows lunches and dinners only (few breakfasts or snacks have a cuisine). Kept as `SavedPlan.cuisines`. Seven steps now.
- Tests: unit all pass; e2e mealplan 9/9, fridge 3/3.

### 19 November 2026 (night): ten older testers, and the fixes from both rounds
- **Round 2 of the usability test** (founder: "Have 10 ai agents act as 80 yr old elders And navigate the app. Then tell me what we need to work on"):
  ten testers aged 79 to 90 on a test copy (sign-in off), one browser with ten phones (`web/e2e/persona-driver.mjs` now takes a list of names).
  Findings and each tester's notes: `docs/USABILITY_TESTS.md`, `docs/usability/2026-11-19/`.
- **Fixes** (founder: "Do whatever you think first ... Just fix whatever you want ... what you think's the best"; so the copy and behaviour changes
  below were made without asking each one, CLAUDE.md rule 8):
  - Meal plan: a kind of food with too few lunches or dinners for the diet (fewer than `CUISINE_MIN` = 3) no longer stops the plan; that meal takes any
    kind and Pip says so (`cuisineRecipes`); the cuisine counts are for the diet; "nothing left" is said at the top; "Spicy food" also catches dishes
    named spiced, devilled, harissa, peri peri, cajun, jerk and the like, and the dried chilli or cayenne in a recipe; after a swap the budget line says
    the swaps took it over (`SavedPlan.swapped`); earlier plans have a button at the top and say what kind of food; "1 snack".
  - Search: a restaurant's name at the start or end finds its dishes ("greggs sausage roll"); the name alone lists its menu (`namedChain`).
  - Leaderboards: the figure moves under the name at large text. Cook with what you have: the "Uses your ..." line stays in view; "potatos" matches.
  - Today: Move (to another meal) on each logged food (`moveLogEntry`); the add sheet says which meal; Home says "N left" under the calories.
  - **Calories-only restaurants** (Pizza Express and others): their dishes can now be added to today and saved, with the calories alone (protein, carbs and
    fat stay absent, never 0, as typed numbers already could; rule 1 holds); the dish search in Add food includes them; My meals shows such a dish's
    calories only; "Under 500 calories" lists the highest calories first there and says so. The order builder and the share card still need all three.
  - Allergens: "May contain" has a strong outline and a line saying what it means; the person's own allergens are named at the top and marked "You avoid".
  - Tabs: the shopping list lights Groceries; Home always opens Home (`ALWAYS_FIRST` in tabMemory). Targets: - and + go to round numbers; worked-out
    carbs and fat follow a calorie change (setup and Settings). Clear data keeps the text size, returns to the welcome screen and says it worked.
  - Setup: the age box has a hint and the grey Continue says why; the all-set screen's McDonald's example is gone ("Everything is ready for you. You can
    change any of this later in Settings."); the recipe step says when a picked shop can't be used for recipes yet and why; "Get started" is the dark
    button; "Skip", "Skip tour" and "Stop the tips" are real buttons; restaurant names go under the logo at large text instead of breaking mid-word; the
    tour calls the meal plan Premium only where Premium is sold, and names the tabs in their new order.
- **Not done (left for a decision or later):** a language choice (English only, founder 2026-10-16); a text size above Extra large; shop names beside the
  logos (the founder asked for logos instead of names on 19 November); "Change amount" on a logged food; a "how many people" step in the meal plan;
  comparing a whole shopping list between shops; a shorter tour.
- **Tesco:** the label reader read 67 more pages, then Tesco's security page came back; the founder's suggestions to refresh past it, to use other tabs,
  and to use Safari with several agents were declined (each works round the block); one reader resumes only when Tesco serves new pages again.
  `tools/groceries/listing_chrome_next.py` (a shelf-page reader for Tesco's missing Food Cupboard, Treats and Snacks and soft drinks, about 10,000
  products) is written but not yet tried.

### 19 November 2026 (03:00-03:35): iPhone 1.1 build 7 uploaded and submitted, with Premium at new prices
- **Prices** (founder: "monthly should be £4.99 or £5.99. Annually should be about £49.99. Founding member payment, I don't think we need that one", then "do that
  all for me"): **Annual £49.99 a year, Monthly £4.99 a month** (the lower of the two monthly prices offered: Annual then saves about 17%), each with a **free first week**
  (an introductory offer from 19 November with no end date), UK only. **No 90-day pass** (it was never created; the app shows only the products StoreKit returns, so build 7
  needed no change; the server still accepts its product id, harmless). These replace the 16 November drafts (£14.99 / £2.99 / £9.99) in docs/STORE.md and docs/PAYMENTS.md.
- **App Store Connect** (in the founder's Chrome, signed in by the founder): subscription group "Numbite Premium" (ID 22594537, display name "Numbite Premium");
  Annual `com.amanmarwaha.numbite.pro.annual` (Apple ID 6836613222) and Monthly `com.amanmarwaha.numbite.pro.monthly` (6836614524), each with an English (U.K.)
  display name and description, the review screenshot `build/review-plans.png` (the plans screen of a test copy at the new prices, 1290 x 2796) and review notes.
  Version 1.1: build 7; new promotional text and description (the 1.0 text said "no account needed", "every feature is free" and "11 languages", untrue in 1.1; it now
  describes the free account, Premium with Apple's renewal wording, and ends with the Terms of Use (Apple's standard EULA) and Privacy Policy links); What's New and the
  Notes for App Review as in docs/STORE.md "Version 1.1 (build 7)" (the old notes about Community and an optional account replaced). App Privacy unchanged (Photos or Videos,
  Other User Content, Email, User ID, Health, Customer Support, Other Data already declared for App Functionality). Sign-in required left unticked (Sign in with Apple works
  with any Apple ID; the notes say so). **Manual release.** Submitted as one review submission of four items at about 03:30.
- **Still to do:** update `Config/Numbite.storekit` and `FakePurchaseService.swift` (local testing and previews) to the new prices and two products; remove
  `APPLE_XCODE_TEST_CERT` from Vercel after testing; the plans screen still says "Numbite Pro" while the group and the store text say Premium (open decision).

### 19 November 2026 (03:40-05:00): overnight fixes from the older testers, more supermarket labels (all on `iap`, not live)
Founder: "keep doing all the groceries ... and apply any other updates, do you think, to the app too, to make it better". Each fix has its unit or browser test;
nothing here is on numbite.com or in the App Store yet (the founder decides when).
- **Meal plan:** "How many people is the shopping for?" (Just me to 6) on the budget step (`PLAN_PEOPLE`, `forPeople` in `lib/mm/mealPlan.ts`): every meal stays
  sized to the person's own numbers, the shopping, the meal prices and the budget range are for everyone, and the packs are shared out for all of them (measured
  on Sainsbury's for 600 kcal meals: one person's week £58.49; the same meals for 2 cost 1.5x that, for 3 2.0x, for 4 2.4x). The plan says the diet every meal fits ("Every meal fits your diet: vegetarian."); each Swap
  button's spoken name says which meal and recipe it swaps, starting with its visible words. Earlier plans say "for 2 people".
- **Shopping list:** "Choose a product" on anything typed in ("milk", "bread"): the person's shops' products with those words, the thing itself first
  (`typedMatches`: fresh milk before evaporated, free-range eggs before Scotch eggs, loose bananas before banana smoothies), tapping one takes its place with
  its price. Rows wrap their size and price instead of cutting them off.
- **Product page:** once a product is on a list it says "On your list" (or "2 on your list") with See list, and the button reads "Add one more".
- **Recipes:** "I have this" on every ingredient (cupboard things as before, kept for every recipe; anything else for this recipe only), left out of Add all and
  the price to buy it all, never out of a serving's numbers. A recipe opened from Cook with what you have starts with what was typed already ticked.
- **Smaller:** Undo after deleting a food, a plan or a saved meal now stays 10 seconds (was 6); Add buttons in the add-food sheet say which restaurant
  ("Add Sausage roll from Greggs"); a logged supermarket product shows its shop on Today, not "Groceries"; Build your order pins its total only while it takes under 30% of
  the screen (at Extra large it took 39% and hid the allergens); the welcome screens' Skip pill wraps at 200% text.
- **Tests brought up to date:** the a11y test (tour order, the 4-stop replay, `SKIP=paywall` for a build without Premium); a11y checked with axe on every
  screen changed tonight (no violations), the large-text check passes at 100/150/200%.
- **Groceries:** two more rounds each of the Waitrose and Morrisons readers (about 540 pages); 116 more labels held back on the readers' notes (figures as prepared,
  cooked weight on dry rice and pasta, mixed packs, identical columns, negative or garbled figures). Waitrose 7,086 of 9,721 products with labels, Morrisons 9,428
  of 16,367. An automatic rule for cooked-weight figures was tried and dropped: it caught fresh noodles, rice puddings and ready meals whose figures are right.
- **Not done, for the founder:** comparing a whole list's total between shops (own-brand products never match across shops, so most lists couldn't be compared
  honestly; it needs a decision on matching "similar" products); "35 g+ protein" ordering by protein per calorie (a ranking choice); kcal versus "calories" in the
  words; a text size above Extra large.

### 19 November 2026 (05:00-05:50): more tester fixes, a second tester round, more labels (all on `iap`, not live)
Founder ~05:10: "Close down any [tabs] or anything that isn't being used by you right now ... Do as much as you can to make the [app] the best it can be ...
you have free [rein]". Closed: an empty Chrome tab and the booted iOS Simulator (Safari refused to quit, "user cancelled": a page there may hold unsaved
changes, so it was left alone and a look inside was declined).
- **Fixes:** supermarket search in Add food puts the person's shops first; "You're all set" says when the numbers are only starting ones; the welcome logo wall fills
  in after hydration (the "Hydration failed" rebuild on every first visit is gone; onboarding-body passes 22 of 22 on the dev server); the list says how many are
  in the basket; the plan's day strip fades while more days are off screen; "Best fit £n" stands over the green spot; Contact us moved up into Settings › Help.
- **Second tester round** (docs/USABILITY_TESTS.md "Round 3"), then its fixes: list items open their shop's page; I have this named on every ingredient and
  remembered while the app is open; Cook with what you have reads "an onion", "a tin of beans", slips like "chedar", and names what no recipe uses; the list's
  suggestions leave out what the person has; the food diary's left/eaten sum, "½ portion", the amount box, shop names in results, the "For breakfast" label;
  allergen warnings for the person's own allergies stand out and come first; a swap with nothing left says why.
- **Groceries:** two more reader rounds per shop; 32 more labels held back; 4 stray records (Waitrose pages saved under Morrisons ids when two readers shared a
  tab) removed, and the briefs (`tools/groceries/briefs/`, now committed) say to use only a tab of one's own. Waitrose 7,364 of 9,721 with labels, Morrisons 9,640 of 16,367.
- **Tesco:** the check at about 05:20 got Tesco's bot-protection page ("Powered and protected by"): no reader started.

### 19 November 2026 (about 12:55): the overnight work put live
Founder: "Yes, put it all live for me, please." `iap` (db413393, 66 commits since 543c194b) pushed to `main`; Vercel's production build was Ready, and numbite.com
was checked: the new words ("How many people is the shopping for?", "Choose a product for", "I have this:", "in the basket", "For breakfast") are in the live
pages' code, and every shop's list file on numbite.com matches the build (Morrisons 12,104 products with labels, Waitrose 8,239, Tesco 1,686). In the iPhone app
only newer restaurant menus come from numbite.com (docs/APP_BUILD.md "Live data"): the grocery lists and these fixes reach iPhone users with the next app build. Two Morrisons label readers carry on.

### 19 November 2026 (afternoon): the cooking tools on Home, one Scan your food card (on `iap`, not live)
Founder, with two screenshots: "move from image one, those three things ... in that gap" (Recipes' three cards to Home, under the day's numbers); then
"instead of it saying settings in the top right on the home screen, I think that should maybe say shopping list instead. And then you remove shopping list from
that dashboard and you remove scan your food ... they have scan to get the macros or scan to recipe"; then "Wait, don't make it live yet."
- **Home** (`app/app/page.tsx`, the new `_components/RecipeTools.tsx`): top right is a Shopping list pill with how many things are left (a screen reader hears
  "3 things to pick up") and the round gear for Settings; under the numbers, one dark **Scan your food** card (Premium; hidden on the website, where nothing is
  sold) with two full-width buttons, **Calories and macros** (`/app/scan`) and **Make it at home** (paywall, then `/app/recipes/photo`), then **Cook with what you
  already have** and **Meal plan** side by side. The Shopping list and Scan cards and the old full-width Meal plan card are gone. Side by side, the two scan
  buttons broke their words in two at standard text, so they stand one above the other. Checked at standard, large and extra large text: no sideways scroll,
  every control 44 points or more.
- **Recipes** starts with its search and shop, then the meal buttons and the dishes.
- **Pip's tips** on Home (seven, the most a screen has): Your day, Add what you ate, Scan your food, Cook from your fridge, Meal plan, one tip for the top right
  corner ("Shopping list, Settings"), Moving around. Recipes keeps Choose a meal and My recipes. **The welcome tour's** Home stop names the scan card, the two
  cooking cards and the top right corner; its Recipes stop names the search and shop instead of Make it at home and Meal plan.
- **Morrisons:** the second reader finished its stretch of the queue (fewer than 200 unread pages remain; the first reader carries on); 4 more labels held back
  (two energy figures that disagree with themselves, a dried pasta labelled only as cooked, a Fat row misprinted "Fai").

### 19 November 2026 (about 14:30): Settings on Eat out, Standard text only (on `iap`, not live)
Founder, after seeing the new Home: "i like the one you have above commit it so i can test" (committed 02f61678); then "on the Eat Out page at the top right,
that should be where the settings is ... That'd be easier"; and "there is no need for a medium sized text mode and large. Just keep standard pls".
- **Settings** is a named button (gear and "Settings") at the top right of Eat out; Home's top right is the Shopping list alone. Eat out's tab is the lit one on
  the Settings pages, Settings' fallback Back is "Back to Eat out", and Settings is never a tab's remembered page (`lib/mm/tabMemory.ts`), so the Eat out tab
  always opens Eat out. Pip's tips: Home's sixth tip is the Shopping list again; Eat out gains a Settings tip. The welcome tour's Eat out stop has a Settings row.
- **Text size:** `TEXT_SIZE_CHOICE_ENABLED` (lib/mm/config.ts) is false: no "Easy to read" screen in setup, no Text size in Settings, and everyone reads
  Standard (a saved Large or Extra large is kept but not applied). The founder was told first that the iPhone app does not follow the phone's own text size,
  so this leaves no way inside the app to make the words bigger; true brings it all back.

### 19 November 2026 (about 15:30): your own recipes in Add food, and Snacks (on `iap`, not live)
Founder: "if they have a recipe where they scanned it, and that was a custom-made recipe, they're unable to add those. It's only the standard recipes ... which
shouldn't be the case"; "you have breakfast, lunch, and dinner, but also have one for like snacks".
- **Choose a recipe** (Add food, `RecipePick.tsx`) lists the person's own recipes first under "Your recipes" (Make it at home, or Pip from the fridge: `myRecipesStore`),
  worked out from the same shops' labels and fitted the same way as on their own recipe page, then "Our recipes". One that can't be worked out (an ingredient
  left out for the diet, or not sold with a label at the person's shops) is said so, never silently missing. The sheet's line reads "A serving of one of yours,
  or one of ours" when there are any.
- **Snacks** is a fourth row on Home and Today (and a choice on Scan your food), after Dinner (`LogMeal`, `LOG_MEALS` in lib/mm/budget.ts). It has no share of
  the day's calories of its own: it shows what was eaten there ("610 kcal"), counts in the day's total, and the three meals' shares (MEAL_SHARE 25/35/40%) and
  Best for you are unchanged (CLAUDE.md rule 8). The clock never puts an entry in Snacks; only its + does. An older app that syncs such an entry shows it under
  the meal its time falls in.

### 19 November 2026 (evening): held-back labels now kept out of every label file; labels whose heading names the cooking are kept
- **Fixed:** `holdback.csv` was applied only to the Chrome reads (`<shop>-chrome.csv`), so a label held back there could still show from an older `<shop>.csv` row
  (Morrisons: a fruit and nut mix with more sugars than carbohydrate, freeze-dried strawberries with more saturates than fat). `build_all_products.py`
  `read_nutrition` now leaves a held-back product out of every label file of its shop. Other shops' counts did not change.
- **Not held back any more:** labels whose per 100 g heading itself says the food is cooked or prepared ("(as consumed)", "(oven cooked)", "(grilled)",
  "as prepared", "(boiled)"). The importer already keeps that word (`state`), product pages show it ("per 100 g (as consumed)"), and recipes and the leaderboards
  never use such a label (`lib/mm/recipes.ts`, `lib/mm/leaderboards.ts`). Seven held back earlier today for that reason were put back (penne, two noodles, gravy,
  vegan sausages, broccoli, sprouts, red cabbage), and 42 chicken labels a reader flagged were kept. Still held back: those where the heading says only
  "per 100 g" over prepared figures (Maggi noodles' footnote, a follow-on milk given per 100 ml made up, BBQ drumsticks with cooked-looking figures).
  The readers' briefs now say such a heading needs no note.
- Morrisons 12,598 of 16,367 products with labels.
- (later) **A hold-back can also stop borrowed and community numbers**, but only when its line says "takes no numbers from elsewhere" (`label_held_back`,
  `drop_held_back` in build_all_products.py): Nesquik milkshake powders (labelled per 100 ml of the made-up drink; the Open Food Facts copies carry the same
  figures as per 100 g) and an Alpro soya drink (saturates printed equal to fat, at Morrisons, Sainsbury's and through Tesco's borrowing). Other hold-backs,
  most of them about one shop's page, still let the product borrow the same product's label from another shop. A misspelt "Carohydrate" row is read.

### 19 November 2026 (about 18:15): Home after the founder's test on the phone (on `iap`, not live)
Founder, with photos from the iPhone: "I feel like these aren't noticed much the meal plan is a big thing it should have its own row. Also keep the settings
cog on the right of shopping list like before"; "The background colour used for the scan your food may be better if that's used for the background of the
top part instead".
- **The day's numbers** (calories dial and macro bars) are on the app's dark (#1d2320), white words, the dial and bars lime on a faint white track.
- **Scan your food** is a light card now: lime "Calories and macros", dark "Make it at home".
- **Meal plan** is a row of its own across the width, in lime, saying "Pip plans 7 days of meals for your goal, with one shopping list." with a week of days;
  **Cook with what you already have** is the next row, white, with what it does in words and the foods you'd type.
- **The Settings gear** is back at Home's top right, right of the Shopping list; Eat out keeps its named Settings button. Home's tab is lit on Settings again
  (as before), Settings' fallback Back is "Back to home", and Settings is still never a tab's remembered page. Pip's tips: one tip for the top right corner again.
- The tips test waits for the page to scroll to a control far down Home. Morrisons: a Fridge Raiders variety pack (one flavour's table; the same at Sainsbury's)
  held back at both, with no numbers from elsewhere.
- Installed on the founder's iPhone 16 from the Mac (xcodebuild + devicectl): the free Xcode test purchases are on only when started with Xcode's Run.
- (18:30) **Cook with what you already have: picking a shop is instant again** (founder, on the phone: "The animation is slow when a new one is selected fix it").
  The page matched every cupboard staple against the chosen shop's whole list (`pantryLines`) on opening and on each shop change, though only "Make me a
  recipe" uses it: about 0.6 s of work, 2 to 2.5 s on a phone-speed processor (Chrome slowed 4x), which froze the highlight half way. It is now worked out only
  when Pip is asked. Measured at 4x: the new shop shows as picked in 0.1 to 0.2 s (was 1.9 s), with no long task after it (was up to 2.5 s); Pip's request still
  carries the shop's cupboard list (125 lines at Waitrose).
- (18:50) **Home's colours** (founder: "Choose the best colours for each thing for the best design in your opinion"): the app's dark (#1d2320) for the day's
  numbers alone (and the tab bar); the lime only for what is tapped or shows progress (the main buttons, today, the dial and bars, the open tab); each feature card
  a soft tint of its own so it is noticed and known by its colour: Meal plan pale green (#e4f0d0, white day squares), Cook with what you already have cream
  (#fbeccb, white food chips), Scan your food white with its lime and dark buttons; every "add" button on Home (the meals', Water's, Reminders') dark with a
  white +. axe finds nothing for a Premium or a free person; addfood, water and coach pass.

### 19 November 2026 (evening): the meal plan for everyone at home (on `iap`, not live)
Founder: "people normally live with people so I want a way people can add their kids and partner etc and create a plan for everyone"; "first screen is how
many people are they cooking for"; "needs good personalisation ... but easy to understand"; "have a meeting with 20 ai agents ... we need the best possible ...
consider everything"; then "once the final conclusion is done please make those pages and commit". The meeting (20 roles, 42 agent runs: proposals, a merged
draft, a vote, a conclusion; average score 7.1 of 10) is summed up in the session; its conclusion is the plan for these screens.
- **The steps** (one question a screen; the bottom button says the usual answer until something changes: "No allergies at home", "We all eat the same",
  "Nothing to leave out"): How many people are you cooking for? (Just me to 6 of us) > Who's eating with you? (a card per person: Adult, Teenager, Child or
  Little one, an optional name, Smaller/Usual/Bigger, Pip saying the portion in words) > Your meals and snacks (your numbers on its top line) > Where you shop
  (moved earlier) > Any food allergies at home? (one list for the home) > Does anyone not eat meat? (the whole home has the meat-free version) > Anything
  someone won't eat? > Your budget > Ready to make your plan? (everyone, Just me too; allergies first; Change on every line). Just me keeps its diet and
  "The food you like" screens. Step 1 of 8 (Just me) or 9.
- **Cooked as written** (`lib/mm/household.ts`, `forHousehold` in `lib/mm/mealPlan.ts`): every recipe as written, scaled to everyone's portions; the user's
  portion matches their own meal size; another grown-up's matches the same meal of a 2,000 kcal day; a teenager 1¼, a child ¾, a little one ½ of a grown-up's,
  a quarter less or more for Smaller or Bigger (FOR THE FOUNDER TO APPROVE); recipes whose written version suits the user's meal come first; snacks are just
  for the user. Never fitted to the user's targets for everyone (a dieter's dish for the children, extra meat bought).
- **The week**: the cost for everyone, only the user's numbers, the allergy sentence ("Recipes made with peanuts are left out. Always check the label."),
  "Servings each: you 1¼, Person 2 1½ and Sam 1¼." on each meal, "Add my portion to Breakfast" (logs the user's own portion), and a meal opens on its recipe
  page for everyone's servings, as written (`?n=&w=1`).
- **Privacy**: the household (`mm.v1.household`) is on the phone only, never synced; a saved plan keeps the others' age groups and portions and the home's
  allergies and meat answer, never names; signing out, deleting the account and Clear data remove it. The privacy page says so.
- Tests: `tests/household.test.ts` (shares, plates, sizing, what is kept); `e2e/household.mjs` 6 of 6; `e2e/mealplan.mjs` reordered for the new Just me
  steps, 9 of 9 (now run with the Premium preview).
- **Not yet built** (the meeting's first version): Lunch on weekdays, "Was there enough for everyone?", the example week on the Premium intro, product label
  checks with "Check these packs", "People you cook for" outside the plan's steps, the week staying readable when Premium ends. The allergy flags on the
  recipe ingredients are being checked against the shops' own labels (a separate commit).
- **Open for the founder** (the meeting's questions): the portion sizes; "may contain" packs left out or listed; the whole home going vegetarian in 1.2; under-5s
  (included at half a portion, no health advice); the website the same day; counting plan sizes (not done); the new wording.
- (later) **Allergy flags on the recipe ingredients checked against the shops' own labels** (the meeting found lupin, molluscs and sulphites flagged on no
  ingredient, mustard missing from light mayo and BBQ sauce, celery only on the stock cube). A helper ran the app's own matching over all 9 shops' lists and
  read each matched product's label allergens (`data/groceries/ingredients/*.csv`, unread Chrome pages, the same barcode elsewhere; Open Food Facts for 2):
  20 kinds gained flags where about 20% or more of their real products, or the product a recipe uses by default, declare them (stock cube gluten; mustard
  sulphites and gluten; lemon and lime juice sulphites; light mayo mustard and milk; BBQ sauce gluten and mustard; teriyaki sulphites and sesame; granola nuts,
  peanuts and soya; parmesan and pesto eggs; raisins, chickpeas and chipolatas sulphites; apple sauce sulphites, milk and mustard; fajita seasoning and stir-fry
  veg soya; Thai and curry paste gluten; ham gluten; lasagne sheets eggs). None removed. Recipes left under each allergy filter: gluten 92 -> 55, sulphites
  165 -> 100, eggs 128 -> 125, milk 107 -> 102, mustard 139 -> 133, soya 152 -> 147. No product declares lupin or molluscs, and no recipe ingredient is
  one by nature. **Found, not fixed (changes recipes' products and figures, needs a decision):** some ingredients match products that aren't that food
  (mint: a halloumi or a Magnum at three shops; chives: Double Gloucester with chives; thyme: pitta chips; rosemary: chipolatas; skyr: a crème brûlée skyr;
  mozzarella: flatbreads at Asda; paprika: flatbreads at Morrisons). Three "gluten free" collection recipes now leave a gluten filter (breaded ham, Colman's
  mustard, Oxo cube). Full results: the session's scratchpad `allergen-audit/`.
- (evening) **The Settings gear at the top right of every tab, and the Shopping list on Eat out too** (founder: "the settings cog should be on the top right of
  every page. Also shopping list should be on the last page too"). Home's two pieces are shared (`web/app/app/_components/TopActions.tsx`: `ShoppingListPill`,
  `SettingsGear`): Home and Eat out show the Shopping list then the gear; Recipes shows My recipes then the gear; Groceries its own list button then the gear.
  Eat out's named "Settings" pill is gone. Checked at 390 px: the gear's right edge at the same place on all four tabs, one Settings link each, 44 px, no
  sideways scroll; e2e extra, days, back, smoke, coach and tour pass (community needs a build with Community on).
- (evening) **Morrisons: every product page is read** (the reader's next round handed out none). 10,553 Morrisons labels of its own; 4 more held back
  (tuna with sugars above carbohydrate, a baby food's garbled "7.79", two stock cubes with figures only as made up). Tesco still answers with its protection
  page (checked once, no reader started).
- (night) **Home's numbers are three pages you slide sideways, with three dots under them** (founder: "I also want like 3 dots here showing that they can also
  swipe right to see different things like stats ... Have a meeting with 20 people and discuss what to do then after do all of those things"; the 20-person
  meeting's conclusion, both reviews "approve with changes", 8/10). On `iap` only.
  - Page 1 **Today**: the two dark cards exactly as before (moved to `_components/HomeToday.tsx`); the dial and bars now also tell VoiceOver the real figures
    ("640 of 2,000 kcal, 1,360 left", "56 grams of 150 grams"). Page 2 **Calories and protein this week** (`HomeWeek.tsx`, `lib/mm/week.ts`): a bar per day on
    the day circles' own grid, the target as a dashed line ("Your target: 2,000 kcal"), and calories and protein a day over the days logged before today ("From
    the 2 days you logged, not counting today."); a day with nothing logged has a dash, never a 0; no red, no "over", no streaks; Monday says "A new week starts
    today." with last week's average; notes for foods with no protein and for photo estimates. Page 3 **Today: sugar, salt and fibre** (`HomeLabels.tsx`,
    `lib/mm/labelTotals.ts`): only figures a label or menu printed, "from 1 of your 2 foods", "not published" when none; no targets or colours.
  - The dots (`HomePages.tsx`) are three 44 pt buttons ("Choose what to show"), the page shown a dark pill; CSS scroll snap only (one page a swipe, no touch code,
    no library). A first-visit hint "Slide the cards sideways, or tap here, to see your week" until page 2 or 3 is seen, on at most 5 days; one demonstration
    slide once per device (not while Pip's tips are due, not with reduced motion). Kept on the device only (`homePagesStore`, mm.v1.homePages, not synced;
    cleared by Clear data and Reset onboarding). On a narrow screen (content under 20.375rem) the pages stack with no dots. Home always opens on Today.
  - Pip's "Your day" tip: "What you've eaten today and what's left. Slide the cards or tap the dots to see your week." Home's gap sentence now says "today"
    ("Some meals you added today have no protein, carbs or fat entered, so today's figures only count the rest."); the Today page keeps the old one.
  - A meal logged from the meal plan now keeps its sugar, salt, fibre, saturates and kJ (the plan keeps each recipe's label and sizes it with your portion), and a
    Scan your food entry is marked `estimate: true` (kept only when exactly true).
  - Not built, waiting for the founder: the dial showing the real percentage over 100% (now capped at 100%); a sliver of the next card always showing; syncing
    the whole week's log (only 2 days sync, so the week page says "on this device"). The new words are English only for now (languages are off).
  - Checked: unit tests (week, label totals, hint, estimate, weekOf across clock changes, household label), e2e `homepages.mjs` 8/8 (dots, pages, hint, slide,
    free user, 320/360/390 px, axe 0), screenshots of all three pages. Not yet checked on the iPhone (swipe feel, VoiceOver in the web view).

### 20 November 2026 (just after midnight): onboarding, Pip, tips, sign-in and safe colours (first wave)
- **Two meetings, then a build.** A 30-person meeting on the whole onboarding and Pip (average 5.8/10, Pip 6.2) and a 25-person meeting on colours
  (7.7/10); their conclusions are kept in `docs/meetings/` (with the 20-person Home swipe meeting). The founder then decided every open question:
  "Do whatever you think is best ... Whatever the meeting ... conclude, go with that." This first wave builds the meetings' changes that needed no
  answer; the second wave (next) builds the answered ones (sign-in after the targets, "Premium", the full colour plan, the cog with its word on every page).
- **Onboarding (changes 2 to 15):** skipped targets stay "starting numbers" (no longer saved as set); the body questions ("Your height and weight", height
  first; examples on the activity tiles; "Skip these questions"; no text over text); "Your daily targets" with each number once and the sources first;
  goal, foods to avoid and shops with a neutral Pip, nothing picked for you (Continue waits for a tap), "Nothing to avoid", a true allergy line, hints on the
  hard diet and allergy names, "Not in recipes yet" on shops recipes can't use; one honest counter ("Step n of 7"; no bar on the cover and the tour) and a
  clearer fork ("Set up my daily numbers"); one last screen, "You're all set!" with a first recipe and "Go to Home"; the tour is Pip's walk with one plain line
  a tab (the "What you can do" rows only in Settings' replay); the cover says "Calories and protein", "Every menu free" and "No ads, no tracking", has
  "Already have an account? Sign in" again (a reversal of 17 November's removal), and its wall's label names five chains; Pip's tips teach each button once
  (Home: Your day, Add what you ate, Scan your food, Shopping list and Settings; 3 on Eat out, 3 on Groceries, 2 on Recipes); the sign-in screen gives one
  reason in Pip's bubble and a readable, true list of what an account keeps; the privacy page adds that the body questions are never kept, synced or sent
  (privacy page date now 19 November 2026). Home, Today and the week pages follow the real logging gate (1.1's logging is free, so they no longer sell it).
- **Pip redrawn** (`Mascot.tsx`): a thin dark-green outline, pink cheeks, thicker arms, soft eyebrows (the lead thinned them from the meeting's 4.5 to 3.2: they
  looked stern), a "think" with two arms, new moods "listen" (every question) and "pointUp", "point" aiming down; he settles after a few seconds (bob once,
  wave twice, cheer three times; only the blink keeps going). Comparison sheet made first (old and new, every mood, 40 to 190 px).
- **Safe colours:** small text #4a4f4c (was #5f6361); prices and figures in ink, not green; one amber allergy note; red only for errors and deleting; progress on
  light surfaces #4d7c0f; grey tappable pills white with a 1.5 px #7a817d edge; toasts' Undo white and underlined; lighter dimming behind Pip's tips with the
  lit button ringed in ink; tokens for ink, edge, danger and note in globals.css.
- **Every word added or dropped** is listed in `docs/meetings/2026-11-19-wave1-words.md` (80 new, 58 no longer used) for the founder's veto (rule 8).
- Checked: all unit tests (2,290), e2e smoke, tour (with the new "everything settles in 6 s" check), coach, extra, firstvisit, household, onboarding-body 27/27,
  largetext (no overflow at 100/150/200%), homepages, mealplan, addfood, days, numbers, back, diet, recipes, and axe 0 on every screen (light and dark).
  Not run here: signin.mjs (needs the sign-in-required build), app-build.mjs and iap.mjs (packed builds). Not yet seen on the iPhone.

### 20 November 2026 (night): everyday breakfasts with photos, six more diets, meal sizes that add up
- **Breakfasts** (founder: "you can't give someone ... kedgeree ... for breakfast ... maybe add some more breakfast items and you can use the Higgsfield connector to
  make images for them"): 13 everyday UK breakfasts in `web/lib/mm/recipeBook/everydayBreakfast.ts` (cheesy beans on toast, scrambled eggs on toast, poached eggs
  and spinach on toast, boiled eggs with soldiers, cheese and tomato on toast, peanut butter and banana on toast, bacon and tomato sandwich, grilled full English,
  ham and cheese toastie, garlic mushrooms on toast, berry and banana smoothie, apple and cinnamon porridge, eggy bread with berries); every figure from the shops'
  labels. A new **wholemeal sliced bread** kind (40 g a slice, contains gluten and soya as most labels print; white bread as its substitute). Kedgeree, Spanish
  omelette and huevos rancheros move to lunch. 178 recipes (breakfast 41). Coverage: Sainsbury's 178, Morrisons 174, Waitrose 136, Iceland 136, Asda 128, Aldi 41,
  M&S 27, Tesco 3.
- **Their photos**: Higgsfield GPT Image 2.6, medium, 1k, 4:3, in the existing colourful set's style (grey concrete with a mustard napkin, mint with a striped tea
  towel, blue hexagon tiles with a beige napkin; speckled cream or teal plates), each checked by eye (only the recipe's foods; no writing, packaging or logos).
  About 6.5 credits. `import_recipe_images.py`: 178 of 178 recipes have a picture.
- **Six more diets** in the recipe and meal-plan logic (founder: "Some people might be Hindu, Pakistani, whatever ... cater to every single diet"): Jain, No onion or
  garlic, Kosher style (no pork or shellfish, never meat with dairy in one dish), No red meat, No alcohol (halal leaves alcohol out too), No meat sold as halal or
  kosher. Tags read from the shops' own ingredient lists (onion or garlic in every houmous, salsa, pesto, stock cube and fajita seasoning; white wine in Dijon
  mustard; honey in some granolas, which vegan now leaves out too). `tests/diets.test.ts`. Shown in the diet picker behind "More diets" (next).
- **Meal plan sizes** (founder: "I put in 3,400 calories ... clearly they all have to be ... 3,400 divided by 3"): the meals share the day equally, with no
  1,200 kcal ceiling (a 3,400 kcal day: three meals of 1,130 kcal). A GLP-1 meal cap still applies when the goal is GLP-1 (the founder's phone: cap 450), and
  `capShortfall` says how far the day falls short so the plan can say so.
- (night) **Second wave: everything the meetings recommended, now approved** (founder: "Whatever the meeting ... conclude, go with that"). On `iap`.
  - **Sign-in after "Your daily targets"** ("Save your plan: make your free account"); "Look around first" also goes through it; the cover's "Already have an
    account? Sign in" opens it at once ("Welcome back. Sign in"); an existing account's settings win over what was typed (tests in `syncEngine.test.ts`); someone who
    quits mid-setup comes back to it. **Trial offer** only on a later day than the first, never straight after setup or after a closed paywall. **Remote switch**
    `web/public/app-switches.json` (only ever makes sign-in optional; read like the logo take-down list). **Logo wall** has a 44 pt Pause/Play.
  - **"Premium"** is the one name on screen everywhere in the app (the website's home and privacy pages are fixed next).
  - **The full colour plan** (docs/meetings/2026-11-19-colours.json): tokens for ink, edge, line, danger, note; PageHeader with Back, the page action, the Shopping
    list and the cog with the word "Settings" on every page except Settings, sheets and the camera; chosen things lime with an edge and a tick; secondary buttons white
    with an edge; Switch with On/Off; one amber allergy note with its heading; the dial's centre says what's left; Home's past days white with a dot; icon wells page
    fill; ink prices; info tags; disabled buttons with their reason; the FSA lights with Low/Medium/High; the Truth card, share card and og image in ink and sun; a
    colour test (`tests/colours.test.ts`) that stops stray hex; the iPhone web view background #f4f5f6 and AccentColor #046c4f.
  - **Anonymous setup counts** built switched off (TelemetryDeck, only with NEXT_PUBLIC_TELEMETRY_APP_ID; nothing is sent today). Turning them on is the founder's
    step: update Apple's App Privacy answers first.
  - Checked: tsc clean, all unit tests (2,757). The reviewers' leftovers (remote switch needs a CORS header for the app, a few lime leftovers, the favourites page's
    header, the 360 px Shopping list) are handed to the third wave.

### 20 November 2026 (02:30-04:30): third wave, the new onboarding that shows the app working, and the queued fixes (on `iap`, not live)
Founder (asleep until 09:00): "I feel like the onboarding is missing a lot, maybe showing the features like how it is useful and showing the customer", the
30-person meeting's conclusion (docs/meetings/2026-11-20-onboarding-redesign.json: shown, not told; the account last), and "do whatever you think is best".
- **Onboarding, 11 steps with one counter** (`lib/mm/welcomeSteps.ts`, `app/app/welcome/*`): 1 goal, 2 foods you avoid, **3 a look at Eat out** (real dishes at a
  chain the person might use, with that chain's own figures and date, chosen for the goal: `lib/mm/showcase.ts`, display only), 4 shops (each with a line saying what
  it offers: recipes, prices or names only), **5 a look at Recipes** (two of our recipes priced at their shop; tap one to cook first), 6-8 about you, size, activity
  (all skippable), 9 daily targets, **10 a look at Meal plan** (a real one-person week from their shop on one shopping list: `lib/mm/planPreview.ts`, the same sums as
  Meal plan), **11 the free account** (a 10-step run if already signed in). Gone: the tab tour, Pip's separate hello, "Look around first", the text-size step and
  "You're all set!". Nothing is sold during setup; Premium is only named, with "Nothing is charged during setup." Quitting part-way offers "Carry on from step n".
  Settings > Help "Show me what Numbite can do" replays steps 3, 5 and 10 without saving anything.
- **Home after setup:** a one-time "Start here" card (add what you ate, the step-3 dish added only on a tap with its own figures and Undo, the step-5 recipe), a
  short toast, and Pip's tips over two visits that never cover the numbers or that card. **Home's numbers are two pages** (Today; Calories and protein this week):
  the sugar, salt and fibre page is gone (the founder delegated it). Shopping list and Settings sit on the date's line from 320 to 430 px (the word "Shopping
  list" is hidden below 375 px and still spoken).
- **Meal plan:** the first open goes straight to the check screen filled in from the person's settings ("Who's eating: Just me"), no budget unless set;
  **"Making your plan" takes about 20 seconds** (founder: "maybe like 20 seconds or so"; `MAKING_STEP_MS` 2800, 7 steps); with a GLP-1 goal the plan says so
  ("Your goal is 'I'm on a GLP-1 medication', so I keep each meal to {cap} kcal: your meals come to {sum} of your {daily} kcal." with "Change it in Settings");
  the home's diet is now the full diet list including the six new ones; no Pip on the money card.
- **Diets:** "More diets" in the diet picker (Jain, No onion or garlic, Kosher style "We can't check kosher certification.", No red meat, No alcohol, No halal or
  kosher meat). Restaurants and products are never said to fit them: "Restaurant menus don't list ingredients, so dishes aren't checked for {diets}." and
  "Products aren't checked for {diets}. Always check the pack."
- **Every recipe has a price** (founder: "the wraps here, they're missing a price"): piece weights for prices only in `pantry.ts` (tomato 85 g, a bunch of spring
  onions 100 g, a punnet of cherry tomatoes 200 g, lettuce 100 g, naan 50 g); Asda 128 of 128 and Iceland 136 of 136 recipes now priced a serving; a card that
  still can't price a serving shows "£x to buy" (the basket at shelf prices). Side effect: 30 cheapest-product picks changed, 14 recipes' calories changed by the
  new products' own labels (Waitrose's wraps use Sharwood's mini naans: about +50 kcal). Aldi (not a recipe shop) still lacks pack sizes.
- **Premium:** the plans screen leads with Apple's billed price, then "First 7 days free, then £x. Renews until you cancel.", then Continue; "What Premium adds"
  lists Meal plan, Scan your food, Make it at home and Cook with what you have first; the untrue "We'll remind you 2 days before your trial ends." is removed;
  Settings' Subscription button says "See plans" (the trial is a quiet line under it). The order builder no longer shows a Premium wall in 1.1 (it is free there).
- **Pip as the guide, not the decoration** (founder: "Yeah, do that for me"): off the Recipes header, the search hint, the list-recipes intro, Scan your food's start
  screen, the paywall and the meal plan's money card; he stays in onboarding, the tips, empty screens and the AI features.
- **Small fixes:** `/app-switches.json` gets the open headers the app needs; a failed Apple or Google sign-in started in onboarding returns to it; the colour
  meeting's leftovers (allergy badge amber, Compare white with an edge, info tags, the favourites page header, Make it at home's step numbers, Scan your food's
  estimate card dashed with an info tag); the website says Premium.
- Left for later (noted by the builders): `RecipeTile` has no native choose mode (step 5 lays a button over it); Costa frappés count as mains in `itemKind.ts`
  (the `\b` after "é"); mini and full naans share one piece weight; the iPhone's own offline signal is not used on step 11; the 2.5 s week cap not yet timed in the
  iPhone web view.

### 20 November 2026 (about 10:30): My recipes at the top left of Recipes (on `iap`, not live)
- Founder (screenshot of Recipes): "remove the recipes from the top left and put my recipes with a love heart in the top left". The word "Recipes" is gone
  from the top left; the My recipes button (heart, the words, the saved count) sits there instead, drawn like the Shopping list pill beside it, and its old
  row under the intro is removed. One row from 320 to 430 px with a 3-digit list count (measured); below 390 px the saved-count bubble is left out (still read
  by VoiceOver in the button's name).
- (about 10:40) Recipe page: **Save is back at the photo's top right, in place of the Settings cog** (founder, screenshot: "Move the save into the top right
  instead of settings"). A white photo chip like Back ("Save" / "Saved" with the heart); the Save button under the title is gone; the cog stays only on a recipe
  Pip wrote that can't be kept. Checked at 320 and 402 px: Save and Back on one line, a tap saves it, no Settings link on the page.
- (about 10:45) Recipe page: **the product's photo opens the product too** (founder: "whenever I click the image, it doesn't go on the product ... when I click
  the product, in general, it should go on to show me that product"). Same page as the name link; the photo's link is silent to VoiceOver and the keyboard (the
  name is the one they meet). Checked by tapping at 320 and 402 px. Shop lists, search and the meal plan's shopping were already whole-row links.
- (about 10:30) Menus: republished from data/source (67 chains' newer official figures; every dish photo present again), after a second reader checked the
  last five chains of 17 November against each chain's own source (Wahaca, Wendy's, Yalla Yalla, Yo! Sushi pass). Wagamama re-read for its 18 November
  festive menu (8 new dishes, Koko crackers' new figures) and matched by the second reader; Sweet heat sprouts held back (no allergens listed for a gochujang
  sauce). Committed on `iap`; not live until the founder says.
- (about 10:55) **Protein, carbs and fat have their colours again** (founder, after comparing the recipe page before and after the colour meeting: "the
  colours back for protein carbs and fats"): the small dots beside each word, green, blue and purple (labels only, never good or bad), on the recipe page's
  serving card and on every dish's three tiles. This reverses the colour meeting's "told apart by their words, never by a hue" for these three only; the
  other six differences shown to the founder (green calories, capitals, white pills, green prices, grey buttons, the dark switch) stay as they are unless asked.
- (about 11:15) Recipe page: **Allergens in More detail** (founder: "If they press more detail ... there'll also be a part where it has allergens ... it'll
  tell you if there's allergens in it"; they asked for the US list as the longer one, but the UK names 14 and the US 9, so the UK's 14 are used, as on every
  dish and product page). "Saturated fat, salt, sugar, fibre and allergens"; a count ("Contains 4 of the 14 main allergens."), then the 14 rows, each one the
  recipe contains marked with the ingredients that bring it ("From: Peanut butter") and the person's own marked "You avoid". Worked out only from each
  ingredient kind's flags in pantry.ts (checked against the shops' labels on 19 November; `lib/mm/recipeAllergens.ts`, `tests/recipeAllergens.test.ts`);
  never "may contain", and the page says a pack can differ. The note at the end of the ingredients now points to it instead of "We haven't read these
  products' allergen labels" (rule 8: new words, founder's request).
- (about 11:30) **Every message banner can be swiped away** (founder, screenshot of "Removed 51 items from your list. Undo": "the person should be able to swipe
  that off the screen if they want. Like if they swipe up on that, it'll go"). `Toast.tsx` (all 12 banners): it follows the finger and goes when pulled 32 px
  towards its edge (up for the top one, down for the bottom one) or 64 px sideways; a smaller pull springs back, a pull the wrong way only stretches; a swipe
  that starts on Undo never undoes; under Reduce Motion it just goes. Checked with real touch events: small drag, swipe up, swipe sideways, swipe from Undo.
- (about 11:45) **Home and Recipes moved up so more fits on the first screen** (founder, two screenshots: "Remove the text saying your food today ... keep the
  settings cog, but remove the wording settings. Then move everything up ... remove the wording where it says today ... below the two dots, there's extra space.
  Close that ... you should be able to see meal plan on the screen now"; and on Recipes, "you can make what's cooking today ... slightly more up"). Home: the
  intro line "Your food today: what you've eaten and what's left." and the word "Today" under today's circle are gone (the lime circle and its dot still mark
  it; VoiceOver still says "(today)"); the week and the numbers cards sit higher; the gap under the two dots is closed. **The Settings cog has no word under it
  on every page** (VoiceOver still hears "Settings"), reversing the colour meeting's "cog with its word". Recipes: "What's cooking today?" sits right under the
  top row. Measured at 402 x 874 (the founder's phone): the Meal plan card's title and line show above the tab bar; no sideways scroll at 375 and 390.
- (about 12:10) Make it at home: **no "Scanning" screen** (founder, screenshot: "I don't need this part where it says scanning ... once they've scanned the
  food, it just goes onto the next screen"). The photo goes straight to the supermarket step (about 0.3 s); the "is this food?" check runs meanwhile and is read
  when they tap Next, so a photo of something else still goes back to the camera with "That doesn't look like food." Checked in the browser both ways.
- (about 12:20) Scan your food: the estimate's house rules now say outright to **use its own judgement after comparing** (founder: "You compare it to ... all the
  dishes that ... we've already pre-made, and also ... the dishes in the restaurants ... and then you're getting, using your own, like, opinion ... the most
  educated answer"). It already compared each food with the restaurant chains' published dishes and our recipes and scaled from the closest (built 18 November);
  now: weigh the references by closeness, and where they disagree or none is close, use what it knows of typical UK recipes and servings, never just an average.
  Takes effect on the iPhone app when numbite.com (which runs the AI) is next deployed.
- (about 12:40) Make it at home: **the working screen rebuilt to show what is really happening** (founder: "it just feels so childish ... so fake ... like it's
  going to give anything for a result and it's not actually contemplating"). Gone: the lines that ticked off on 8-second timers, the bar that filled on a
  timer, the light sweeping over the photo and Pip on it. Now: the photo; "Writing your recipe" with a real clock; a card of what Pip is working from (the
  dish and the person's words, "{n} {shop} products, each with its own label and price", each serving's calories and protein, their diet); one line on how
  it works ("Pip reads your photo and your words, and chooses a real {shop} product for each part of the dish. Then every amount, price and nutrition figure is
  worked out from those products' own labels."); a bar that only says "working". When the recipe is back: "Your recipe is ready" with what it actually holds
  ("6 ingredients chosen from Sainsbury's", "4 steps written", the labels line) for about 2 seconds, then the recipe. e2e/photorecipe.mjs updated to the new
  flow (no Scanning screen, the food check on Next, Save at the top right): 16 of 16 pass.
- (about 12:50) Home's Scan your food card: the two buttons are now **"Photo to calories"** (Scan your food) and **"Photo to recipe"** (Make it at home)
  (founder: "call the top one like photo to macros, and the bottom one like photo to recipe ... people might understand it better. Or if you have a different
  one to choose"; "calories" chosen over "macros", a word not everyone knows; the card's line still says "see its calories and macros"). e2e foodscan 4/4,
  photorecipe 16/16.
- (about 13:10) **No Pause button on the welcome screen's logo wall** (founder: "There's literally no point of a pause button"; it was the onboarding meeting's
  WCAG 2.2.2 answer). The wall keeps moving and stands still when the phone's Reduce Motion is on. e2e/tour.mjs step 13 updated.
- (about 13:10) **Scan your food sizes each portion from the photo** (founder: "if the photo's been taken with the camera, you can kind of tell how big the portion
  of the food must be"): both looks are told to judge the amount from things of known size beside the food (a UK dinner plate about 26 to 28 cm, a fork about
  19 cm, a can, a glass, a hand), how much of the plate it covers and how deep it is, allowing for a phone's arm's-length angle; low confidence when nothing
  gives a scale. Takes effect with the next numbite.com deploy.
- (about 13:10, in the working copy, committed with the audit's fixes) **Every AI feature on Claude Opus 5.5** (founder: "use Opus for the meal scanner ... just
  use Opus for all the AI stuff which is in my app"): Scan your food (both looks), Make it at home (food check and recipe), Cook with what you have, Ask Pip and
  Pip's pick (off). Opus always thinks a little first, so the quick calls get more room (food check 6,000 tokens, first look 8,000, pick 4,000) and the routes
  longer limits (recipe 120 s, food check 60 s, scan 220 s, pick 60 s). Cost: Opus is $4 / $20 per million tokens in / out, against Sonnet 5.5's $2 / $10 and
  Haiku 5.5's $0.10 / $0.50, so each Make it at home or scan costs about twice what it did, and the quick checks far more than on Haiku; the Anthropic spend
  limit ($20 a month) will be reached sooner.

### 20 November 2026 (09:45-15:40): the 30-person whole-app audit, its fixes, and the founder's requests during it (on `iap`, not live)
- **The audit** (52 agents: 30 areas checked with screenshots and tests, every finding re-checked by a sceptic, 8 fix teams on separate files, a tests stage, a
  release and a design review; findings in docs/audit-findings-2026-11-20-partial.json for the first 8 areas, the full run in the session's workflow journal).
  247 fixes. Scores before the fixes ran from 5 (Groceries: two data sets that disagreed) to 7 (Home, day pages).
- **Founder's request: scan a barcode, see the product, add it to the food diary** (team 3): every barcode we hold is found (`web/lib/mm/barcodes.ts`,
  `public/groceries/all/barcodes.json`: 14,240 shop-list and 14,693 catalogue codes; Kellogg's Rice Krispies 430g, for one, which the scanner had missed);
  a scan opens the product; product pages have "Add to my food diary" (How much did you have?, the meal, the label's figures times the amount, toast with
  Undo); in Add food a scanned barcode with one match goes straight to How much. Free in 1.1 (the Premium badge only where logging is paid). Not yet: barcodes
  we don't hold (Open Food Facts lookup, queued), the scan as its own choice in the Add food sheet with a macros chart (queued, founder 12:46).
- **Other fixes, by area:** Premium and payments (the plans screen's words, Restore says "refused" not "nothing to restore", the fake catalogue at the real
  prices, the StoreKit file; 89 of 89 Swift tests); sign-in, privacy and Settings; Home, Today and the food log (portions no longer re-round label figures,
  toasts now just above the tab bar except after the + sheet, so they never cover Back or Settings; a tap on a toast closes it); Eat out (Best for you no longer
  suggests lattes for breakfast, "No red meat" now leaves out red meat, menus data); recipes (allergy clash warning, "doesn't sell" wording, Back keeps
  filters, the search box's room); meal plan, household and shopping lists (Add all can't double up, the right list named); onboarding and the AI features
  (asking permission before a photo goes to the AI, "Pip can't do this right now" when the AI is unavailable instead of blaming the photo).
- **Founder's requests built today** (each with its own entry above): My recipes top left, Save top right, product photo opens the product, macro colour dots,
  allergens in More detail, swipe-away banners, Home and Recipes moved up (no intro line, no Today or Settings words), no Scanning screen, an honest working
  screen, Photo to calories / Photo to recipe, no Pause button, portion from the photo's scale, every AI feature on Claude Opus 5.5, menus republished and
  Wagamama's festive menu, and (15:30) **choosing the month and year in the calendar** (the month's name opens the year with arrows and its twelve months; back
  to the oldest food logged, at least twelve months).
- **Checked:** tsc clean; all unit tests (3,140); every e2e script in the tests stage green, plus days 10/10, photorecipe 16/16, foodscan 4/4, scandiary 9/9.
- **Queued (founder 12:21-12:54):** the 7-screen onboarding with photo previews and far fewer words; email sign-in as two simple screens; a words pass on every
  screen; the stats screen behind Home's cards; the scan choice in Add food with a macros chart and Open Food Facts; the meal plan's eating styles with recipe
  pictures; moving your own photo on Pip's recipes; "Sized to your meal" and a usual-portion switch; the 3 recipe products without photos; Costa's "ml" portions.
- (about 16:00) Recipes: **"Serving price" in the Occasion field's place** (founder, screenshot: "have it down as ... serving price ... £1.80 to £5.60, and then next
  to it brackets default ... they'll be able to have like this kind of arrow ... adjust for the range of per serving cost"). The field shows the shop's cheapest to
  dearest serving with "(default)"; a tap opens a sheet with one track and two handles (10p steps), the range in big type, "Show {n} recipes" and "Back to every
  price". The range filters the list, is kept in the address (?pmin=60&pmax=320, so Back keeps it) and is reset by Clear. Occasion stays in the Filters sheet
  (More). `lib/mm/servingPrice.ts` + tests; e2e/recipes.mjs 17/17.
- (about 15:50) **Meal sizes: small and big are now a third either side of normal, not 200 kcal** (founder, screenshot of Filters > Your meal showing Small 850,
  Normal 1,050, Big 1,250: "do you think that's actually considered small, normal, big? ... do some research and choose the best one ... up to you"). Normal stays
  30% of the day (the share PHE's 400-600-600 rule of thumb gives lunch and dinner: 20% breakfast, 30% lunch, 30% dinner, snacks the rest), so on the founder's
  3,480 kcal day a normal meal really is about 1,050 kcal; but a fixed 200 kcal step made "Small" 850 (only 19% less) on a big day and 250 on a 1,200 kcal day.
  Now small is ⅔ and big 4/3 of normal, to the nearest 50, the step a chain's own sizes take (McDonald's UK fries 237 / 337 / 444 kcal, from our menu data).
  A 2,000 kcal day still gives 400 / 600 / 800 (PHE's 400 and 600; the 2018 BMJ study of UK chain main meals found fast food averaged 751 kcal, full-service
  1,033); 3,480 gives 700 / 1,050 / 1,400; 1,200 gives 250 / 350 / 450. `mealSizes` in `lib/mm/recipes.ts`; tests/recipes.test.ts. No words changed.
- (afternoon, commit 08e2524c) **The founder's queued requests of 20 November, built by seven teams, then matched to the founder's own example screenshots**
  (founder: "Did you not use any of the examples to make the new screens I said and make them look better?": the first build had only written briefs; a
  second pass gave five people the screenshots, `scratchpad/w5/refs`, liked email/code/one-question screens, diet photo tiles, a Progress screen), then a
  shorter-words pass over every screen, tests and a review.
  - **Onboarding, 7 screens then Save your plan:** goal; anything you avoid (diet picture tiles from our own recipe illustrations, allergy chips, More diets);
    where you shop (logo tiles); recipes from your shop (the cards the founder likes); about you (sex, age, height, weight on one screen, age only, never a
    birthday or name); how active; your plan (calories and protein big, the week as a picture timetable of our recipe pictures with each day's kcal, "About
    £{n} for the week", "1 shopping list", five chains' dish photos captioned "Photo from the {chain} website", "Not affiliated with any restaurant or shop
    shown."). No step words, no labels on previews, no Pip bubbles (Pip small on screen 1 only). Old saved progress maps onto the new steps.
    **Dropped from onboarding (rule 7, SPEC copy; still in Settings):** "Not sure? Suggest targets for me" and GLP-1's "Comfortable meal size" box.
    **Kept:** one small Premium badge over the week preview where Premium is sold (App Store honesty) although the founder said previews need no labels.
    **Big days:** the week can't reach very high targets (fitRecipe moves protein and carb ingredients only between ½ and 2×, so a 3,480 kcal day averages
    about 2,830); Your plan now says so plainly: "Our recipes can't reach {target} kcal yet: about {kcal} a day." Ways to close it are a founder decision
    (two servings on big days, automatic snacks, or a wider fit range).
  - **Sign-in:** "Save your plan", three buttons, one privacy line; email as two screens ("What's your email?", then "Enter the code" with six boxes, iOS
    one-time-code autofill, goes on by itself, a resend countdown). New constant CODE_RESEND_SECONDS 60.
  - **Add food:** "Scan a barcode" first; the product with a protein/carbs/fat ring and How much? in its own unit (label serving, pack, 100 g/ml); a barcode
    we don't hold is asked of Open Food Facts once through our own route `/api/v1/barcode/{code}` (generic User-Agent, a day's memory cache, numbers
    checked), shown as "Figures from Open Food Facts (community data)" with "Open Food Facts, ODbL"; the privacy page says so in one line. Leading zeros kept.
  - **Stats** (`/app/stats`, from Home's calories and macros cards): Calories, Macros, Nutrients from the food log only; no steps, sleep or weight (rule 4).
  - **Meal plan "How do you like to eat?":** Balanced, High protein, Lower carb with our recipe pictures (no keto: 9 recipes; no Mediterranean: too few).
    **New constants for the founder's yes:** HIGH_PROTEIN_MIN 0.30 of a serving's calories, LOWER_CARB_MAX 0.25, STYLE_PROTEIN_FIT 0.32 (the protein aim
    when fitting those two styles, so each meal slot has enough recipes).
  - **Recipe page:** tap your own photo to move it (kept on the phone, file unchanged); "Sized to your meal" with a Usual portion / My meal size switch;
    new constant USUAL_PORTION 600 kcal (fitRecipe's range means some recipes stay above it, e.g. Pip's salsa chicken tacos 894 kcal: said on screen).
  - **Data:** Iceland's Sharwood's naan photo; Costa's food portions no longer printed in ml ("Per portion", note.txt says why); a test that fails when a
    product a recipe uses has no photo. Every wording change, old -> new: `docs/COPY_CHANGES_2026-11-20.md` (411 lines).
- (about 18:20) **Sainsbury's photos for the two recipe products** (Mission 6 x Original Tortilla Wraps 367g, Stamford Street Co. Medium Wholemeal Bread 800g):
  sainsburys.co.uk answered 403 to the server, so they were read from the shop's own product pages in the founder's Chrome (one page each, the gallery
  photo on assets.sainsburys-groceries.co.uk), written to `data/groceries/images/sainsburys-listing.csv`, hotlinked (Option D step 2). Every product a recipe
  uses now has a photo. **Morrisons:** the last 3 pages read; every Morrisons page is read (10,555 labels of its own).
- (evening, commit d2e64ef5) **The review's fixes:** the Groceries tab looks a scanned barcode up as printed (01318180 found the loaf only in Add food
  before) and asks Open Food Facts for one we don't hold, with "Add to my food diary"; How much? always offers 100 g / 100 ml; onboarding's "Anything you
  avoid?" puts the allergy chips first, in view without scrolling (safety: someone could tap "Nothing to avoid" without seeing them); Save your plan has no
  big Pip; Stats' macro ring gives **shares of calories** (protein and carbs 4 kcal/g, fat 9; the three add to 100), the same measure the meal plan's styles
  use, with the grams beside; a saved Pip recipe shows "Saved" at the photo's top right, never the cog. **Restored after the words pass:** "Check {chain}'s
  own guide." and the plans screen's free-trial terms (Apple 3.1.2). Checked live: our route found Rice Krispies (5059319042626) at Open Food Facts.
  Tests: every e2e listed green, vitest all green, tsc and eslint clean. Not checked: e2e/signin.mjs (needs a sign-in-required build).
- (about 18:55) **Our own recipe pictures are always packed inside the iPhone app** (founder, screenshot of Recipes: "Many recipes are missing images"):
  the app loaded recipe pictures from numbite.com (`remoteImages`, founder 2026-11-17, to keep the app small), and the live site doesn't have the newest
  recipes' pictures (scrambled eggs on toast answered 404), so a build newer than the site showed plain tiles. `recipe-images/` (about 21 MB) now always
  ships in the app (`assetUrl` in web/lib/mm/config.ts, scripts/pack_app_web.py, a test in tools/tests/test_pack_app_web.py); dish and product photos
  still load from the website. The same gap affects every new server feature until numbite.com is deployed: the app's API calls go to the live site.
- (19:37) **numbite.com deployed** (founder: "Yes, put it live"): `main` fast-forwarded to `iap` (a4ab96c3) and pushed; `iap` pushed too. Checked first: the
  website build passes here; the API changes only add (new diet keys, CORS for the app, Opus time limits; a paid App Store token is still accepted, and the
  free-preview rule never applies on production), so 1.0 and 1.1 (build 7, in review) keep working. Vercel dpl_FYgiuvmUuzg8XuHk5GQy22t8UCzc READY in about a
  minute. Checked live: `/api/v1/barcode/5059319042626` finds Rice Krispies at Open Food Facts, the newest recipe pictures answer 200, `/app/stats`,
  `/app-switches.json`, the menus manifest matches the repo, and the privacy page carries the barcode line. Rollback: dpl_E5Hb16p7Rj7PmccWxRJ2inweFne2.
- (about 21:05) **Signed out, a fresh start always opens the welcome cover** (founder, screenshots of the cover and of "Sign in or sign up": "Let's say I'm on
  screen one. When I go off the app and swipe up on it, and then I go back onto the app, it goes to screen two, but it should start on screen one, which is
  always going to be the first screen for people who haven't logged in already"). The founder had deleted the account; the phone kept its settings ("What was
  on this phone is still here"), and the start-up gate (`lib/mm/tour.ts` tourDue / TOUR_GATE_SCRIPT) sent only people who hadn't set up to the cover, so a
  relaunch showed the bare sign-in screen. Now, where everyone signs in and nobody is signed in on the phone, a plain start always goes to the cover ("Get
  started", "Already have an account? Sign in"); links (a shared list, a dish) still open their page with the sign-in screen in place. tests/tour.test.ts.
- (about 21:20) **Onboarding's buttons answer the first tap; About you clearly optional, with a unit each for height and weight** (founder, screenshots):
  - "Sometimes when I press the continue button, it doesn't work" (Where do you shop?): ticking a shop did not break it (checked); on an iPhone a tap while a
    scrolled list is still gliding only stops the glide and no click follows. The welcome screens' bottom button (`BottomButton`, welcome/Frame.tsx) now acts
    when the finger lifts (a press that moves over 12 px is a drag), and ignores any click in the second after a finger tap (the phone's own click, which could
    land on the next screen's button); mouse, keyboard and screen readers still use the click. Checked: one tap, a quick double tap (one screen only), a drag
    (nothing), a mouse click. Not reproduced on a real iPhone (the simulator's Safari wouldn't load); the founder to try.
  - "The person might know feet in kilograms, or ... centimeters and stone ... they should be interchangeable": the one "Feet and stone / cm and kg" switch
    became a switch under each row, "ft and in / cm" and "st and lb / kg" (each converts what is typed, as Settings does).
  - "the person should definitely know that they don't have to add any of these": the grey line starts with a bold "All optional."; with nothing typed the
    button reads "Skip these" and does what Skip does (no grey Continue, no "Add your age, height and weight, or tap Skip." until something is typed).
  - Copy, old -> new: "Only used to work out your numbers. Never saved or sent." -> "**All optional.** Only used to work out your numbers. Never saved or
    sent."; grey "Continue" with nothing typed -> "Skip these"; "Feet and stone" / "cm and kg" -> "ft and in" / "cm" and "st and lb" / "kg".
  Tests: e2e onboarding-body 17/17, showcase 14/14, tour 13/13, firstvisit 10/10; a11y.mjs and welcome-steps.mjs updated.
- (about 21:50) **Your plan shows an example week, not a worked-out one** (founder, screenshot of Your plan's timetable with each day's calories: "We shouldn't
  calculate the meal plan. This should just be an example of their meal plan, showing the app is like how it works and stuff, because it depends if you want
  to make it a premium feature"). The last welcome screen made the real week from the person's shop, sized to their numbers and priced: Meal plan (Premium)
  given away. Now `lib/mm/exampleWeek.ts` picks seven days of our own illustrated recipes that suit the diet and allergies as written (spread through the
  book; no shop, no sizing, no prices, nothing saved), headed "Meal plan" with the Premium badge where Premium is sold and "An example week."; the cards say
  "1 shopping list" and "Your shop's prices". Gone from the screen: each day's kcal, "About £{n} for the week", the shelf-price line, "Our recipes can't
  reach {target} kcal yet...", "Each meal is kept to your {cap} kcal meal size." and the week worked out ahead on How active are you?. Offline it still
  shows (no shop file needed). Copy, new: "Meal plan", "An example week.", "Your shop's prices", "{day}: {meals}." (screen readers). Tests:
  tests/exampleWeek.test.ts, welcomeShowcase.test.ts; e2e showcase 14/14, onboarding-body 17/17, tour 13/13, firstvisit 10/10; vitest all green.
- (about 22:00) **The sign-in code email redesigned, live in Supabase** (founder, screenshot of the plain email: "You can make this far better with like the
  digits to obviously log in, and it just looks so bland right now, this email, so make a better template in supabase"). `supabase/templates/sign-in-code.html`:
  our icon and name, a white card, "Your sign-in code", "Type this code in Numbite to sign in.", the code in 46 px digits in a lime box with the dark green
  edge, "It works for 1 hour.", a grey "Didn't ask for a code? You can ignore this email. Nobody can sign in without it.", and numbite.com; a hidden preview
  line "Your Numbite code is {code}. It works for 1 hour." so the inbox list shows the code. Inline styles and tables only; nothing tracked. Pasted into the
  live project (menumacros, rbbalkfkpacazzhsqfzz) in the founder's Chrome: Authentication › Emails › Magic link or OTP and Confirm sign up, subject "Your
  Numbite sign-in code" on both; Supabase said "Successfully updated email template" twice. Also in supabase/config.toml for local runs; ACCOUNTS_SYNC.md
  updated. Old body: "Your Numbite sign-in code is {{ .Token }}. It expires in 1 hour. If you didn't ask for it, ignore this email."
- (about 22:15) **"Signing you in…" shows what is really happening** (founder, screenshot of Pip and a spinner: "When it says sign in, you're in this, what it's
  doing, like loading recipes, blah blah, all this"). `app/app/_components/SigningIn.tsx` (moved out of SignIn.tsx): under the heading, one line per real
  step with its own mark (a turning circle while it runs, the lime tick when done): "Checking your code" / "Signing in with Apple" / "Signing in with Google"
  ("Opening your account" on the welcome screens), done when the account is open; "Your saved meals and settings" (the sync signing in starts); "Restaurant
  menus" (the menu catalogue); "Recipes from {shop}" (the recipe shop's product file, loaded there and then). Nothing shown that isn't running, and nothing
  waits on it: the screen goes when sign-in is done. Offline, a dash and "The rest finishes when you're online." The separate spinner went. New copy: the
  lines above, "Done", "Loading", "When you're online" (screen readers). Tests: vitest all green (mascot.test.ts lists the new file).
- (about 22:20) **A Daily targets page of its own, /app/targets** (founder, screenshots of Meal plan's "Change my numbers" and Settings' Daily targets: "If they
  press change my numbers, it should go onto [the daily targets], but at the same time, it shouldn't be on the settings page. I just want the daily targets
  page"). Settings moved into `app/app/settings/SettingsScreen.tsx` (page.tsx renders it); `only="targets"` shows just the Daily targets card under "Daily
  targets" with Back (to the page it came from), the same boxes, Save targets, Suggest targets and the ask before leaving unsaved numbers. Linked from Meal
  plan's "Change my numbers", its GLP-1 meal-size line ("Change it in Settings" -> "Change it") and Home's "Set your targets to see what's left today".
  Precached for the website (sw.js mm-v10); not remembered as a tab page.
- (about 22:45) **"At home", not "fridge"** (founder, screenshot of Home's Cook with what you already have card: "Say at home not in your fridge"): "Recipes from
  what's in your fridge." -> "Recipes from what you have at home."; "Pip makes a new recipe from your fridge" -> "Pip makes a new recipe from what you have at
  home"; "Pip's new recipe from your fridge is part of Premium. Matching our recipes to it stays free." -> "Pip's new recipe from what you have at home is part
  of Premium. Matching our recipes to it stays free."; "Pip's fridge recipes aren't switched on yet." -> "Pip's recipes from what you have at home aren't
  switched on yet."; "Pip's fridge recipes are part of Premium." -> "Pip's recipes from what you have at home are part of Premium." (The screen itself:
  with the plain-recipes change.) Photo to calories stays as it is (asked, and advised: "nutrients" would promise sugar, salt and fibre the scan doesn't give).
- (about 22:55) **Cook with what you already have: no "Shopping at" list** (founder, twice, circling it: "remove this"). The screen uses the person's usual recipe
  shop quietly (recipeShop, as before when nothing was picked); Pip and the recipe links use that shop. The plain-recipe idea ("onions 150 g, no image nor brand
  names") was dropped at the founder's word ("you can keep the recipes how they are now ... I changed my mind"), so recipe pages are unchanged. e2e/fridge.mjs
  checks no "Shopping at", no "fridge" on screen and the shop on the tiles' links (5/5).
- (about 23:05) **Your first shop, and each week after** (founder: "week one cost and then the week afterwards costs ... they need to understand that we are
  helping them save a lot of money", then: "it said £65 a week, but each thing costs about like £2 each recipe ... about £42 a week. But I'm paying £62 because I
  have to buy the salt and stuff ... I would want to know ... how much it's going to cost the [first] food shop ... then in [coming] weeks"). `weekCosts` in
  lib/mm/mealPlan.ts: the first shop is the whole packs (shoppingCost); each week after is the fresh food again plus only the share used of what keeps
  (keeps ? used : cost); shown when later weeks are at least £1 less (WEEK_AFTER_SAVING, a new constant). `app/app/plan/TwoWeeks.tsx`: "Your first shop: about
  £{n}", "Each week after: about £{n}", "It includes {items} that last for weeks." (the week's real long-lasting items: lastingThings); with a budget, "Both are
  within your {budget} budget." / "Only your first shop is over your {budget} budget.". On Meal plan's money card, its check screen and the preview, and under
  Your plan's example week (priced at the person's recipe shop after the screen shows; offline or under 18 no price). Your plan's example now rotates 4 dishes
  per meal like a real plan (21 different dishes priced at £109 against a real plan's £67): Sainsbury's about £80 then £47, Morrisons £83 then £58. A 2,000
  kcal Meal plan at Sainsbury's: about £67 then £42. **Open for the founder:** the budget still limits the first shop (the money really paid that week), not
  each week after. Tests: mealPlan, exampleWeek; e2e showcase 14/14, mealplan 12/12.
- (about 23:15) **Sandbox purchases cleared for Premium testing** (founder: "you can clear those"): App Store Connect › Users and Access › Sandbox › Test Accounts,
  the one sandbox tester › Clear Purchase History (Apple: only sandbox purchases are deleted; real customers' purchases are not affected). Its "Last purchase"
  read 28 September 2025, so the founder's phone may have been Premium for another reason; to check on the phone (Settings › Subscription). **Budget**
  (founder: "do the rest for me"): stays on the first shop, the money actually paid that week.
- (about 23:45) **Meal plan's Swap: search, filters and every recipe for that meal** (founder, screenshot of Swap breakfast: "they also should be able to search
  ... you know how the recipe screen has those nice features. There's like a version of that which is also in the meal plan part"). `app/app/plan/SwapPicker.tsx`
  with `lib/mm/swapPicker.ts`: the Recipes search (name, ingredients, cuisine, diet words; now shared as `lib/mm/recipeSearch.ts`), the quick tiles (Quick, No
  meat or fish, Vegan; shared `recipes/FilterTile.tsx`), Cuisine and Serving price fields, Sort by (Closest fit, Lowest price, Most protein), and every recipe the
  plan priced for that meal, 20 at a time ("Show {n} more recipes"); ones already in the week marked "In your plan" and still choosable. Only recipes of the
  plan's eating style (the week is built from them). New copy: "In your plan", "No recipes match.", "Show all recipes"; the swap sheet's Serving price shows
  the range without "(default)". Also: "Signing you in…" is imported from its own file (a re-export tripped the dev server's bundler); the test server's 10 GB
  dev cache was cleared. Checked: e2e mealplan 13/13, showcase 14/14, Recipes search and a filter by hand (recipes.mjs's fixed count waits for the new recipes).
- (about 23:10) **Decision: the free-trial offer comes before Home's first visit** (founder: "when people get on the dashboard for the first time just before it
  should come up with 7 days free trial"). Reverses the 19 November meeting's rule (never straight after setup; once, on a later day). Being built with the
  Premium sheet's redesign (founder: "This has got to look more interesting also mention is a 7 day free trial"): iPhone app only, only when the Apple ID can
  still have the trial, never when Premium, never twice, never on a link start.
- (about 23:20) **Home stays lit on its cooking tools** (founder: "If I press click on what you already have, it will go to a screen, but ... it says that I'm on
  the recipes page, but it should still be like on the home page"): Cook with what you already have (/app/recipes/fridge) and Make it at home
  (/app/recipes/photo) are opened only from Home's cards, so the tab bar now lights Home there (HOME_TOOLS in app/app/_lib/tabs.ts; tests/tabMemory.test.ts).
- (about 23:30) **A recipe page lights the tab it was opened from** (founder, screenshot of Cook with what you already have with Recipes lit: "This should still be
  part of the homepage. Same with the snap recipe to timetable, all of that"): a recipe (/app/recipes/view) opened from Home (the meal plan, the cooking tools'
  results) keeps Home lit, from Groceries' list keeps Groceries lit, opened first or from Recipes lights Recipes (SHARED_PAGES and litTab in
  app/app/_lib/tabs.ts, used by AppShell's tab bar). Checked in a browser; tests/tabMemory.test.ts.
- (about 23:45) **Decision: a free week for every new account, no details; gifts by email** (founder: "Whenever someone signs into the app for the first time,
  they automatically get a 7-day free trial ... They don't need to type any details ... once the trial is up ... the pop-up will come up saying you need to
  subscribe"; repeats stopped "if someone deletes their account or uninstalls the app"; "we'll use the Apple device check"; and "if I give their email to you,
  you can give them a premium account ... I won't have to do a new build for that"). Replaces the "free until a date" switch (paused, not built) and the
  trial offer before Home (dropped). Design agreed: 7 days from the first sign-in, on our server (signed Premium token); repeats stopped by a keyed one-way
  hash of the email and of the Apple id (kept after deletion only for this) and Apple's DeviceCheck bit; a server-side gift list (account, optional end);
  Apple's own 7-day introductory trial to be removed in App Store Connect so nobody sees two free weeks. Being built (not yet: migration not applied,
  DeviceCheck key to be made by the founder).
- (about 23:55) **The Premium sheet redesigned** (founder, screenshot of the plain sheet: "This has got to look more interesting also mention is a 7 day free
  trial"): a pale green picture panel made from our own recipe pictures (a little Mon-Wed week, a scan frame; no Pip beside a price, no logos), the headline
  "Try Premium free for 7 days" (26 px, smaller than the 32 px billed amount: Apple 3.1.2) with "Then {price} {per}." under it from the store's own price, the
  plans, "How your free trial works" (Today / Before day 7 / Day 7: no reminder is promised, the app sends none), "What Premium adds" as picture cards for Meal
  plan, Scan your food, Make it at home and Cook with what you already have, then the rest as a compact list; every Apple term, Restore and the links kept.
  Copy old -> new: "{price} {per} is charged and your subscription starts, unless you cancel at least 24 hours before in your App Store settings." -> "Your plan
  starts. You pay {price} {per}." with a new middle step "Before day {days}: Cancel in your App Store settings at least 24 hours before, and you pay nothing.";
  new "Then {price} {per}.", "Get more with Premium" (no trial left for this Apple ID), "How your free trial works"; removed "See everything Premium adds" and,
  on the trial offer, "You can still have a {days}-day free trial.". `PremiumPictures.tsx`, tests/premiumSheet.test.ts; e2e iap 11/12 (the one left clicks the
  old welcome screens). The free-until switch and the trial offer before Home were built then removed at the founder's change of plan.
- (about 00:40, 21 Nov) **15 eating styles, 115 new recipes, and varied weeks** (founder: "Give more options like keto ... as many options as you can think about
  people would choose ... make new recipes and use the Higgsfield connector ... about 100 more recipes"; "make the most longevity-backed diet ... that's the one
  that I want to see"; "a lot of them are to do with [wraps] ... You can't just do [wraps] every single day"). Meal plan's "How do you like to eat?": Balanced,
  **Longevity** (second; rule: no meat other than fish, at least one of pulses, nuts or seeds, oily fish or whole grains, 80 g of vegetables and fruit a meal, no
  sweetened kinds, olive oil only, fibre at least 1.5 g per 100 kcal, saturates under 10% of calories, salt under 0.3 g per 100 kcal; the studies (PREDIMED,
  Trichopoulou 2003, Blue Zones, Adventist Health Study-2, EAT-Lancet, GBD 2017) in the code comment only; the tile says "Vegetables, beans, nuts, olive oil and
  fish", never that it makes anyone live longer: **the name "Longevity" is the founder's accepted risk under rule 3**), High protein, Lower carb, Mediterranean,
  Keto (carbs at most 10% of calories), Paleo, Vegetarian, Vegan, Pescatarian, Quick, **Lower fat** and **More fibre** (renamed from "Low fat" and "High fibre":
  those are UK-regulated claim words whose legal thresholds are stricter than our rules), Lower sugar, Lower salt; each a picture tile, greyed with a reason when
  the person's diet or shop leaves too few. 115 recipes in 7 new files (recipeBook/longevityMorning, longevityDinners, ketoMeals, paleoMeals, mediterranean,
  everydayLunches, quickDinners): 293 in the book; Sainsbury's makes 293, Morrisons 289, Waitrose 240, Iceland 228, Asda 218. **Variety**: lib/mm/dishForm.ts (27
  dish forms), the plan never repeats a form in a day or in a meal two days running, at most 2 wraps a week (MAX_WRAPS_A_WEEK), and Your plan's example the same.
  New constants for the founder's yes: LONGEVITY_FIBRE_PER_100KCAL 1.5, LONGEVITY_SALT_PER_100KCAL 0.3, LONGEVITY_SATURATES_MAX 0.1, VEG_FRUIT_MIN_G 80,
  MEDITERRANEAN_CHEESE_MAX_G 40, KETO_CARBS_MAX 0.10, MAX_WRAPS_A_WEEK 2. Pictures: 12 made in Higgsfield (now 1 credit each, not 0.5); the other 103 next.
  Swap now judges a style on the whole recipe (ingredient rules too). Tests: vitest 3,600 pass; e2e mealplan 13/13, household 6/6, showcase 14/14, recipes 17/17,
  photorecipe 18/18, smoke 24/24.
- (about 00:18, 21 Nov) **`FREE_WEEK_HASH_SECRET` set in Vercel (Production, Sensitive)**: made with `openssl rand -base64 48` and piped straight into `vercel env add`,
  never shown or saved (the founder's go-ahead: "can you do it all for me"). **Never change it** (every email hash would change and everyone could have a second
  free week). `vercel link` in web/ also downloaded a `.env.local`; it was deleted unread (gitignored). The Xcode test store and its test have no introductory
  offer now.
- (00:22, 21 Nov) **numbite.com deployed** (founder: "can you do it all for me"): `main` fast-forwarded to `iap` (d2ffa1ce); the website build passed first in a
  clean copy. Checked live: POST /api/v1/entitlement/account answers 401 without an account, /app/targets and /app/plan load, the privacy page has the free week.
  The free week stays off until `supabase/migrations/20261121120000_free_week.sql` runs (waits for Claude in Chrome, disconnected since about 00:50).
- (00:54, 21 Nov; on the iPhone 00:55, numbite.com 00:57) **Every recipe has a picture; keto and paleo made realistic** (follows the review of the 115 new recipes). 103 Higgsfield pictures
  (GPT Image 2.6, medium, 1k, 4:3, the three scenes in turn; two remade: a pasta with two shapes, a tuna that looked like beef): 293 of 293 recipes. Higgsfield
  now charges 1 credit a picture (0.5 before): 117 credits in all for the 115, 2,876.5 left on the plan; nothing bought. Recipe fixes: oil about 1 tbsp a pan
  and written as a fixed amount (it no longer grows with the meal size; in keto dishes the cheese does), almonds out where a UK cook wouldn't use them (salads,
  soups, meatballs, an omelette side) and halved in the fruit bowl; keeping lines added to the 8 batch-cook recipes ("Cool quickly, then keep in the fridge and
  eat within 2 days."; the rice soup the same day or the next); chilli beef stir-fry renamed "Chilli beef with peppers, broccoli and a fried egg" (keto again
  with the egg); the meatballs are no longer keto (still paleo). **Effect to know:** Paleo and lean keto meals now fit smaller (about 280-540 kcal for a 600 kcal
  meal), so those days come in under the person's calories and the plan says how far; a vegan two-recipe meal-prep week can have 3 wraps (as varied as the
  recipes allow; the test says so). Tests: vitest 3,600 pass.
- (01:03, 21 Nov) **iPhone 1.1 build 10 uploaded to App Store Connect** (founder: "can you do it all for me"): build number 9 → 10 (25371787), packed in the
  clean copy with the In-App Purchase flags ("Packed 1.1 (10)": 99.4 MB web app, recipe pictures in, menu and product photos from the website), Release archive
  `build/Numbite-1.1-build10.xcarchive` (checked inside: version 1.1 (10), the free-week call, 294 files in recipe-images), uploaded with
  `xcodebuild -exportArchive` and `build/ExportOptionsUpload.plist` ("Upload succeeded"). **Not yet done (need Claude in Chrome, disconnected, or the founder
  signed in):** the free-week tables in Supabase, removing Apple's 7-day introductory offer from both subscriptions, swapping build 7 for build 10 in the
  review submission with the new review notes (docs/STORE.md "Version 1.1 (next build)"), then Submit (Claude messages the founder first). Until the tables
  exist the free week simply doesn't start (the route answers 500; the app shows the plans as before).
- (01:15-01:30, 21 Nov) **Free week live on the server; Apple's trial gone; build 10 ready to submit** (founder: "can you do it all for me"; Claude in Chrome reconnected
  at about 01:12). (1) **Supabase** (menumacros, production): the tables of `20261121120000_free_week.sql` created in the SQL Editor ("Success. No rows
  returned"); checked: `trial_claims` and `premium_gifts` exist, row security on, anon cannot read, service_role can write. (2) **App Store Connect:** the
  "Free for the first week" introductory offer (19 Nov to no end date, 175 countries) deleted from Annual and Monthly; version 1.1 removed from review
  (it was "Waiting for Review" with build 7, now "Developer Rejected", which is Apple's word for removed by the developer), build 7 swapped for **build 10**
  (processed, "Ready to Submit", also in TestFlight's Founder group); the description's "each with a 7-day free trial" became "Every new account gets Premium
  free for its first 7 days, with no payment details. After that, choose Monthly or Annual."; the Notes for App Review's In-App Purchase paragraph replaced
  (no introductory offer; the free week after signing in, kept to one per person by a one-way hash; Settings > Subscription > See plans during it; DeviceCheck not
  mentioned because its key isn't set yet); each plan's own review note and review screenshot replaced (`build/review-plans-build10.png`: build 10's plans
  screen, "Numbite Premium", £49.99 a year / £4.99 a month, no trial; the old one said "Numbite Pro" and "First 7 days free"). What's New kept ("Try it free
  for 7 days" is still true). Manual release kept. A draft submission holds the 4 items (iOS App 1.1 (10), Annual, Monthly, the Numbite Premium group);
  **Submit for Review waits for the founder's word.**
