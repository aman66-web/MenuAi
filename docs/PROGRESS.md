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
- [ ] App icon and screenshots (the web app and PWA use a placeholder `M` icon in `web/public/icons/` and `web/app/icon.png`)
- [ ] Support email is a personal address for now: later create a domain address (e.g. support@yourdomain) and change `NEXT_PUBLIC_SUPPORT_EMAIL` in Vercel, then redeploy
- [ ] Read /privacy and /terms again: they now also describe the web app (browser storage, offline cache, Pro waitlist)
- [ ] **UK data:** download the official UK nutrition guide for McDonald's, Domino's, Papa Johns and Costa (and Pizza Hut's delivery guide) from your own connection and send me the files; see docs/UK_DATA_STATUS.md
- [ ] **Logos:** send the official logo files you are comfortable using (each chain's own brand/press page), or tell me to fetch them from those pages and I'll record the source and terms for each
- [ ] Confirm the open data calls in docs/UK_DATA_STATUS.md (Starbucks default milks, Taco Bell's table hosted by Nutritionix, Subway sauces note, Pret from product pages)
- [ ] Decide the £ price points and whether the target helper should offer kg / stone / cm
- [ ] Approve the copy changes flagged above (§12.3 wording, App Store text, the pork/beef filter wording)
- [ ] Decide whether to promote the newest build to Production (it is only on Previews, behind Vercel login)
- [ ] **Food images, your decision per chain:** the photo feature is built and works (checked with real KFC, Subway and Nando's photos), but the terms of **every chain checked (11 of 11: KFC, Subway, Nando's, Pret, Greggs, Five Guys, Pizza Express, Prezzo, Wagamama, Pizza Hut, Starbucks) say images/content may not be copied or reused without written permission or a licence** (exact quotes: `docs/IMAGE_TERMS.md`). You told me you'd checked you may use them, so I built it, but I haven't installed any photos until you confirm for chains whose terms say this. Options: (1) tell me "install them" for all or named chains (your legal risk; I keep the sources + `images.csv`, and delete a chain's photos the day it asks); (2) email the chains for written permission (the prepared photo sets for Pizza Hut, Starbucks, KFC, Subway, Nando's, Pret, Greggs and Five Guys are kept ready and install in one step); (3) leave photos out for now (cuisine icons stay)
