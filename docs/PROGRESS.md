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
| M0 Project foundation | in progress | Xcode project, AppConfig, icon (2026-10-08). **Free launch (2026-10-12): the app is the web app packed inside it** (docs/APP_BUILD.md): web view + scheme handler + scanner/location/share bridge written, not yet compiled (needs the Mac session) **Mac session 18 Oct 2026: the whole app compiles (Xcode 26.6, iPhone 17 Pro simulator, Swift 6) with no error, 62 of 62 Swift tests pass, the simulator checks and the Release archive dry run pass; see the dated entry in the Decisions log.** |
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

## Current state (17 November 2026)

**Read this first; the full history is in docs/PROGRESS_LOG.md** (every decision since 5 October 2026, not loaded automatically: `grep -n` it when a task
touches an earlier decision, and add new entries there, dated, at the end).

**Where things live**
- **26 November, on `iap` only (not live, not uploaded):** colour schemes ("Pick your colours" at the end of onboarding and Settings › Colours; six light schemes, Lime the default, kept on the device only); onboarding with a headline only on every screen and Pip met as "your food guide and nutrition coach"; the example meal plan and restaurant dishes drawn on a phone that can't be tapped; Pip's button tips only from Settings; "Tap Pip to ask anything" in onboarding while Ask Pip is on. Details in docs/PROGRESS_LOG.md.
- **21 November evening, on `iap` (build 20, the final version, uploaded to App Store Connect 22 Nov 00:37, not submitted; on the phone through TestFlight):** every recipe checked against its photo and marinated, the 13 mismatched pictures remade, the double-tap guard on the plan's questions, one Pip permission for all, the finished plan says the food a day, the budget asked a day and held against the week-after cost, Pip's plan carrying on with a notice at the top of every screen (numbite.com still runs a5313bf0: Pip's prompt there says the budget as a week's shopping), every recipe made the way a chef would and cooked to match its picture (about 300 methods), Meal plan with Pip (nine questions, Opus picks
  the week, the phone checks it), 5 or 7 a day, 49 world recipes (382 in all), a balanced cheapest week on a tight budget, the free week sheet and pill, a
  barcode photo inside Scan a barcode, everyday sizes in recipe ingredients ("80 g / ½ pepper"). Details in docs/PROGRESS_LOG.md.
- **Overnight 20 November (read `docs/MORNING_REPORT_2026-11-20.md` first):** three waves of the meetings' changes committed on `iap` (new onboarding that shows the app working, account last; Start here; two Home pages; More diets; every recipe priced; Premium everywhere). The 30-person audit stopped after 8 of 30 areas (the Claude app's tool check slowed every action to 10 minutes); its findings are in `docs/audit-findings-2026-11-20-partial.json`, not yet fixed. Blocker: the published menus are older than `data/source` (republish).
- **App Store:** Numbite 1.0 (build 4) is live in the UK store since 12 November 2026. **1.1 build 20 was rejected on 23 November 2026 (Guideline 4.0: the Back bar of Terms under the status bar); build 21 (fix: viewport-fit=cover on every page) was uploaded, the reply sent and the submission resubmitted on 23 November at 18:12, Waiting for Review** (build 20 had been submitted on 22 November at 01:05, with 10 new screenshots and updated listing text) in place of build 11 (with the Premium group and both plans; **releases automatically on approval** (founder 22 Nov); App Privacy gained Search History and Fitness, not linked). Before that, **1.1 build 11 submitted for App Review on 21 November 2026 at 06:06** (replacing build 10, 01:40; founder: "after all of the jobs upload and submit the new build"; read docs/MORNING_REPORT_2026-11-21.md first) (founder: "also submit for review, please"), replacing build 7: the account's free week (Supabase tables made, DeviceCheck key BDJV2ZFAM8 in Vercel), Apple's 7-day introductory offer deleted from both plans, new description, review notes and plan screenshots; manual release. History of build 7 below. **1.1 (build 7) was uploaded to App Store Connect on 19 November
  2026 at 03:01** (founder: "I want to upload the newest version ... even though ... we are still working on some stuff"): Premium through Apple In-App Purchase
  with a 7-day free trial, Make it at home, Cook with what you have, everyone signs in, the rating question, and the 19 November fixes from the older testers
  (`build/Numbite-1.1-build7.xcarchive`). **Submitted for App Review on 19 November 2026 at about 03:30** with the two Premium subscriptions (founder: "do that all for me, check everything's good, then submit the app"); release is set to **manual**, so it goes live only when the founder releases it. Apple warned that from April 2027 uploads need Xcode 27 (the iOS 27 SDK). Apple's updated Developer Program License Agreement
  was accepted on 18 November 2026 (developer.apple.com › Account); Paid and Free Apps agreements, bank and tax all Active, so uploads are open again (none made yet).
- **numbite.com runs `main` at d2ffa1ce (21 November, 00:22; founder: "can you do it all for me")**: everything of 20 November evening (costs, swap search, Daily targets page, 15 eating styles and 115 recipes, the Premium sheet, the free week's server route, which stays off until the migration runs). Before that, **`main` at a4ab96c3 (20 November, 19:37; founder: "Yes, put it live")**: all of `iap` as of 20 November evening (the 7-screen onboarding, email code sign-in, barcode to food diary with Open Food Facts through `/api/v1/barcode`, stats, eating styles, every AI feature on Opus, the newest recipes' pictures, app-switches.json). Rollback: Vercel deployment dpl_E5Hb16p7Rj7PmccWxRJ2inweFne2 (db413393). Before that, **`main` at db413393 (19 November, about 12:55; founder: "Yes, put it all live for me, please")**: all of `iap`, with the overnight fixes from the
  older testers (plans for several people, Choose a product, I have this, allergen warnings, Cook with what you have reading, food diary details, and more) and the
  grocery lists as of then (Waitrose 8,239 of 9,721 products with labels, every page read; Morrisons 12,104 of 16,367; Tesco 1,686). Checked live: the new words in
  the plan, list and recipe pages' code, and every shop's list file matching the build. See docs/PROGRESS_LOG.md and docs/USABILITY_TESTS.md "Round 3".
- **On `iap` only, not live (founder 19 Nov, "Wait, don't make it live yet"):** the cooking tools on Home (one Scan your food card with Calories and macros or
  Make it at home; Cook with what you already have and Meal plan side by side), the Shopping list at Home's top right, Settings at Eat out's top right, Recipes
  starting with its search, and Standard text only (`TEXT_SIZE_CHOICE_ENABLED` false). See the 19 November afternoon entries in docs/PROGRESS_LOG.md.
  Also on `iap` only (19 November evening): the Settings gear at the top right of every tab, the meal plan for everyone at home, and Home's numbers as three
  pages with three dots (Today; Calories and protein this week; Today: sugar, salt and fibre).
- **numbite.com** ran `main` at d0d1fb0f (19 November): **all of `iap` merged** (founder 19 Nov, "Put it all live pls"): everyone signs in, the meal plan,
  leaderboards with every shop's logo and price, several shopping lists, Select on the list, the grocery labels, Community off, the food-crop box from the food
  check. On the website nothing is sold, so every feature is open (GATING_ENABLED false) and Make it at home and Scan your food stay hidden there; their API
  routes check Premium with the new key (fixed 19 November). `main` and `iap` now hold the same code.
- **Vercel:** `APPLE_XCODE_TEST_CERT` is test-only (remove after Premium testing). `ANTHROPIC_API_KEY` is set (Make it at home: Sonnet 5.5 with prompt caching;
  the food check on Haiku 5.5).

**Rules decided recently (details and dates in the log)**
- Everyone signs in (`SIGN_IN_REQUIRED`; fallback `NEXT_PUBLIC_SIGN_IN_REQUIRED=0` if App Review objects under 5.1.1(v)); CLAUDE.md rule 4.
- No recipe uses a product without numbers, except salt, pepper and dried spices (founder 18 Nov): UK law requires no label on them. An unlabelled pepper or spice
  is listed and priced but not counted; an unlabelled salt counts as UK table salt labels print it (0 kcal, fat, carbs, protein; 99.9 g salt per 100 g:
  `PLAIN_SALT`); the recipe page says which; only a product whose name is just that seasoning. A shop is offered in Recipes from 80 recipes
  (`MIN_RECIPE_COVERAGE`): Sainsbury's 165, Morrisons 161, Waitrose 123, Iceland 123, Asda 115 today (M&S 22, Aldi 31, Tesco 3, Lidl 0).
- A product with no label of its own takes, in order: the same product's label read at another supermarket (same barcode, or the same branded name and pack
  size; never a shop's own brand), community numbers for its exact barcode (Open Food Facts, always said so), or, for plain loose fruit and vegetables only,
  the UK government's figures (McCance and Widdowson's CoFID 2021). Each is marked and named on screen.
- The rating question (iPhone app only, rarely; only a 5 asks for Apple's review pop-up): the founder's accepted risk under guideline 5.6.1.
- Recipe pictures carry no visible caption (screen readers hear "An illustration of ...").
- Pip's tips on the real screens (founder 18 Nov, "a guided tour of what everything does"): since 26 Nov they never start by themselves; Settings › Help › "Show me the buttons on each screen"
  starts them (each tab's real buttons lit one at a time, `CoachMarks.tsx`, `lib/mm/coach.ts`); "Stop the tips" stops them.

**In progress: supermarket labels for every product** (founder 17-18 November: nutrition for every product, recipes for each supermarket; see the 18 November log entry)
- One Sonnet reader per shop in the founder's Chrome (`tools/groceries/labels_chrome_next.py`, reader `labels_chrome.js`), recipe ingredients first, then every product
  with no nutrition; results copied from transcripts byte for byte (`--harvest`). Asda, Aldi, Sainsbury's, Waitrose, Morrisons, Iceland, M&S and Co-op (catalogue only)
  are reading; **Tesco stopped for good** (security page twice); **Lidl** publishes no nutrition or everyday prices online. M&S prices from the Marble Arch store
  (`tools/groceries/mns_prices_chrome.py`). After reads: `labels_chrome_ingest.py <shop>`, `labels_iceland.py write`, `mns_prices_chrome.py write`,
  `build_all_products.py`, then `WRITE_COVERAGE=1 npx vitest run tests/recipeCoverage.test.ts`. Ingredients and allergens are read but not yet shown in the app.

**Open decisions:** "Pro" or "Premium" as the one name; the fridge feature (next version); Pip's pick on Compare (built, off); the paused review of all
recipe methods and the design pass.

## Decisions log

Moved to docs/PROGRESS_LOG.md (see above).

## Known issues

- Web: no nearby chains and no Apple Health (by design, see WEB_BUILD_PLAN.md); payments not wired.
- Web offline: item/chain pages work offline after one online visit (the service worker precaches the shells and the menus are cached on first load); the first visit needs a connection.
- `docs/BUILD_PLAN.md` M0–M10 (native iPhone app) are untouched and still planned.

## Founder to-do (things Claude can't do)

- [ ] **Ask Pip (built 26 Nov on `iap`, switched off):** before it goes live (1) raise the Anthropic spending cap (about $20 a month now; a chat message costs roughly 1 to 3 pence on Sonnet 5.5, and 40 a day per person is the limit), (2) update App Privacy and Google Play's Data safety (docs/STORE.md and docs/ANDROID_STORE.md, "Ask Pip"), (3) set `NEXT_PUBLIC_ASK_PIP=1` in Vercel and for the app builds, then tell Claude; the defaults to confirm are in the 26 Nov log entry
- [x] **Android free week per phone (22 Nov): released and submitted.** Website, Supabase migration and Data safety are done; Android 1.1 (3) was sent for review at about 13:08 on 22 Nov and Google had approved and published it (with the Data safety form) within the hour. Docs/PAYMENTS.md "Android phones".
- [ ] **Android on Google Play (22 Nov: 1.1 (2) is LIVE in the UK and can sign in since numbite.com was released from `iap` (22 Nov, main fd2787d1); it cannot sell until the service-account key is in Vercel (service account made and invited in Play 22 Nov, key at ~/.numbite-play/: the founder runs the one command in docs/ANDROID_BILLING.md "Putting the key in Vercel"); both Premium plans are set Inactive; docs/ANDROID_STORE.md "LIVE on Google Play"):** ~~(1) upload key~~ done. (Original list follows; item (2) is now the urgent one, because until the service-account key is in Vercel nobody can complete a purchase): (1) in Terminal run `./scripts/android_make_upload_key.sh` (you type a password twice; back up `~/.numbite-android/`), then tell Claude "the key is made": it builds `./scripts/build_android.sh aab`, uploads it to Internal testing, creates the subscription (`com.amanmarwaha.numbite.premium`, base plans `annual` £49.99 and `monthly` £4.99, no trial offer) and sets the countries. (2) Google Cloud: create a service account, enable the Android Publisher API, download its key, invite it in Play Console › Users and permissions with "View financial data" and "Manage orders and subscriptions", paste the whole JSON into Vercel as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (Sensitive), then say so and Claude redeploys with your go-ahead; docs/PAYMENTS.md "Android". (3) Play Console › "Declare your trader status" (due February 2027). (4) ~~Demo login for Google's reviewers~~ not needed (founder 22 Nov: reviewers can sign in with Google, email or Apple, and a new account gets the free week of Premium); the web release (main) is done. (5) Deep links: after the first upload copy the "App signing key certificate" SHA-256 from Play Console › App integrity to Claude: it adds `.well-known/assetlinks.json`.

- [x] **Done 22 Nov (Other User Content + Fitness, not linked): Before the next submission, App Privacy** (numbite.com runs Meal plan with Pip and search help since 21 Nov 20:15): Meal plan with Pip sends the person's plan answers (and any
  note they type) to our server and Anthropic, not linked to them; add it next to the search-help item below
- [x] **Done 22 Nov (Search History, not linked): App Privacy, before the next submission:** search help (21 Nov) sends the typed words of a search that found nothing to our server and Anthropic, kept for up to a day, not linked to the person. In App Store Connect › App Privacy, add Search History (not linked to you, App Functionality), or tell Claude to switch search help off for the app (`NEXT_PUBLIC_SEARCH_HELP=0`)

- [ ] **Before April 2027: update Xcode to Xcode 27 (Mac App Store) and rebuild the app** (Apple's ITMS-90725 warning on 1.1 build 7: from April 2027 uploads must use the iOS 27 SDK). Free plenty of disk first (an Xcode update needs tens of GB; the Mac had about 6 GB free on 19 Nov). Build 7 itself is fine to test and submit until then
- [ ] **Sign-in on auth.numbite.com (you asked 18 Nov, "use my numbite.com one"):** follow docs/SUPABASE_CUSTOM_DOMAIN.md (Supabase Custom Domain add-on, about $10 a month plus a paid plan if the project is on Free; two DNS records in Vercel; Google and Apple redirect URLs), then say "auth domain is on" and Claude switches `SUPABASE_URL` and redeploys with your go-ahead
- [ ] **Remove `APPLE_XCODE_TEST_CERT` from Vercel when your Premium testing is finished** (Production variable pinning Xcode's test certificate; test only). Tell Claude and it will remove it
- [ ] **Try Make it at home on your real iPhone** (plug it in with a cable, press Run in Xcode, Recipes > Make it at home): the live camera, the scanning screen and the loading screen. Delete the throwaway simulator when finished (command in the 17 Nov evening entry)
- [x] The iOS 26.5 platform is installed (17 Nov). **Restart the Claude app when convenient:** its background VM still holds about 8 GB of the deleted downloads, and the Mac has only about 3 GB free
- [x] **`ENTITLEMENT_PRIVATE_JWK` fixed** (19 Nov: the founder ran `make_entitlement_key.mjs --replace --to-vercel`; public key committed, main 8555ee8e deployed; the Apple route now answers 400 to a blank request, not 503)
- [ ] **If you want Pip's pick on Compare:** paste `supabase/migrations/20261117120000_compare_picks.sql` in the Supabase SQL Editor and say "switch on Pip's pick" (`NEXT_PUBLIC_COMPARE_PICK=1`); it works without the table, only without the shared cache
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

- [ ] **Paid access (built, off): follow docs/PAID_ACCESS_GO_LIVE.md (blocks 1–6; the long version is docs/PAYMENTS.md steps 1–9)** (Stripe account in test mode, three GBP Prices, webhook, the key pair from `tools/payments/make_entitlement_key.mjs`, the Vercel variables, the Supabase migration `20261113120000_pro_entitlements.sql`, then `NEXT_PUBLIC_WEB_PRO=1`); give Claude the seller's company details for Terms/Privacy and decide whether a solicitor reads the wording first (docs/LEGAL_REVIEW_PACK.md); the creator-code question is decided (memory only, no banner)
- [ ] **Apple In-App Purchase** (after 1.0 is approved): Paid Apps agreement, banking and tax, then paste `docs/CLAUDE_DESKTOP_IAP_PROMPT.md` into Claude desktop on the Mac (needs the three products; it stops before spending or uploading anything)
- [x] **Merge decision for `viral-upgrade`**: merged and live by 15 November (`main` = `viral-upgrade`, payments off)
- [x] **Decide the next iPhone release:** decided 15 Nov: 1.0.1 with the viral screens first (free), In-App Purchase later as 1.1
- [x] **Set `NEXT_PUBLIC_APP_STORE_URL`** in Vercel to the App Store address: done 16 Nov (shared-list and friend-invite pages now offer the App Store button)
- [ ] **Free about 10 GB on the Mac** (Downloads is 14 GB): the disk filled up on 16 Nov and Xcode needs room to build 1.1 for your phone
- [ ] **Make the paid-access key**: `node tools/payments/make_entitlement_key.mjs` in Terminal, paste the clipboard into Vercel as `ENTITLEMENT_PRIVATE_JWK` (Sensitive); then test 1.1 on your phone (docs/APP_BUILD.md "Testing 1.1")
- [ ] **In-App Purchase products** in App Store Connect (after the Paid Apps agreement, banking and tax): the three in docs/STORE.md "Version 1.1", each with a review screenshot of the plans screen
- [x] **Aayush Dwivedi accepted the updated Apple Developer Program License Agreement** (18 Nov, checked on developer.apple.com › Account). Next, when the founder says so: re-pack, archive, upload and submit
- [x] **`ANTHROPIC_API_KEY` in Vercel** (founder, 16 Nov: key `numbite-website`, never expires, MoneySave organisation; Sensitive, Production). Spend limit already $20 a month for that organisation. Not used until Make it at home is switched on with Premium
- [ ] **Choose the Stripe account** and write its exact name into `STRIPE_ACCOUNT` at the top of docs/CHROME_PROMPT_PAID_ACCESS.md before pasting it
- [ ] **hello@numbite.com mailbox (founder 22 Nov: "I don't want people to contact my personal inbox")**: Google Play's public contact and its content-rating contact were set to `hello@numbite.com` and then put **back to the Hotmail address on the founder's say-so (22 Nov, 03:40: "ill change it later")**; change both in Play Console (Store settings › contact details; App content › Content ratings › Email) once it forwards. Follow docs/MAILBOX_SETUP.md (about 15 minutes: an ImprovMX account with your own password; then in Vercel › Domains › numbite.com › DNS Records add two MX records `mx1.improvmx.com` (10) and `mx2.improvmx.com` (20) and one TXT `v=spf1 include:spf.improvmx.com ~all`, all with an empty name; numbite.com has no MX or root SPF today, so nothing clashes; Claude's Vercel connection and browser may not edit DNS), send a test mail, then tell Claude "mailbox works": Claude sets `NEXT_PUBLIC_SUPPORT_EMAIL=hello@numbite.com` in Vercel, builds the Android bundle with it (and the next iPhone build; build 20 and the live site still show the Hotmail address) and redeploys
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
