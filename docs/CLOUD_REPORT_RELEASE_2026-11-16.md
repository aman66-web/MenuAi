# Cloud report: release 1.0.1 (build 5), 16 November 2026

1. **RESULT: READY for the Mac to pack and archive 1.0.1 build 5** from branch `release-1-0-1-b`. It is not merged to `main`, and the founder should approve the new wording first (see decisions).
2. **Branch and commit:** `release-1-0-1-b`. Code as of commit `28aa46a`; this report is in the commit after it, and the last line names the pushed commit.
3. **Failures that remain:** two browser-test steps, both failing the same way on clean `main`. One is `mapfs` "privacy and network": Next.js prefetches restaurant pages from our own site; no position leaves the phone. The other is `offline` "client navigation Home → Eat out → chain" (known since 14 November). Neither affects the iPhone app. Everything else passes.
4. **Decisions for the founder:** approve the 12 new on-screen sentences (section 5); keep the new plain share icon (it replaced a redrawn WhatsApp logo); decide what the Settings footer "web 1.0" should say; decide about "Official" on the share image; approve the draft App Store text (`docs/STORE_NEXT_VERSION_DRAFT.md`).
5. **Not verified here:** Xcode build, Swift tests and archive (no Mac in this cloud container); a real iPhone; VoiceOver; App Store Connect; Apple's current guideline wording (cited from knowledge, not re-read). Playwright WebKit stood in for Safari and is not a real iPhone.
6. **Exact branch name:** `release-1-0-1-b`

---

## How this session worked

- **Branch:** cut from `main` at `ca8d8a5`. **Pushes:** at most two in total, as the desktop session asked for the founder on 16 November (each push builds a Vercel Preview and needs the founder's "Allow once"):
  1. one at the start, before that message arrived, which created the branch at `ca8d8a5` with no new commits;
  2. one at the end, with everything.

  Everything in between was committed locally only. My reply to the desktop session could not be delivered (HTTP 401 from this cloud session); nothing depended on it.
- **Nothing outside the repository changed:** no Supabase, Vercel, Stripe, DNS, secret or database change, no migration, no spending, no new npm dependency (`package.json` and the lockfile are untouched).
- **Test tools:**
  - `playwright-core` and `axe-core` were installed inside `web/e2e/` (git-ignored, as `web/e2e/README.md` says).
  - Playwright's WebKit browser was downloaded to a scratch folder, and its Linux system libraries were installed with `apt` in this container only.
- **`docs/PROGRESS.md` was not edited.** The desktop session logs it (an entry is suggested in section 9).
- **Builds:** every browser suite ran against a production build, one command at a time. Each test server was stopped by its process id before the next one started.

## Task 1: version and build number

`MenuMacros.xcodeproj/project.pbxproj`, app target `MenuMacros` (both configurations, Debug and Release):

| Setting | Was | Now |
|---|---|---|
| `MARKETING_VERSION` | 1.0 | **1.0.1** |
| `CURRENT_PROJECT_VERSION` | 4 | **5** |

The test targets carry no version. `Config/Info.plist` does not override either value. Commit `17274b5`.

Hard-coded "1.0" found (reported, not reworded):
- **`web/lib/mm/config.ts:71` `APP_VERSION = "web 1.0"`.**
  - It shows on screen as the Settings footer "Numbite · web 1.0", on the website and in the iPhone app (the app's copy uses the same constant).
  - It is also sent as `appVersion` with every report, chain request and support message (`web/lib/mm/outbox.ts`), so messages from the iPhone 1.0.1 app also say "web 1.0".
  - **Decision for the founder** (on-screen text, rule 8). If it changes, three tests that expect "web 1.0" must change with it: `web/tests/outbox.test.ts` lines 206–219 and `web/e2e/smoke.mjs` line 155.
- `web/tests/handlers.test.ts:81`: the sample value `"1.0 (12)"`, test data only.
- `docs/BACKEND.md:73` says the web sends `appVersion: "web 1.0"`.
- **Swift:** none. The app reads no version string in code; the only "1.0" matches are `HTTP/1.1` and plist DTD headers.

## Task 2: full checks on production builds

**Which code each result is for.** Every result in the "First run" columns came from builds of commit `17274b5`. The web code of that commit is identical to `main` (only the Xcode version changed), so those results are what clean `main` gives. After the task-3 changes I rebuilt and reran the suites those changes touch ("After changes"). The final iPhone copy was built last, from `28aa46a`.

| Check | First run (= clean `main`) | After changes |
|---|---|---|
| `npm run typecheck` (typegen + tsc) | pass | pass |
| `npx eslint app lib tests` | pass | pass |
| website unit tests (vitest) | 1,713 passed, 20 skipped | **1,721 passed** (8 new), 20 skipped |
| `./scripts/test.sh --skip-ios` (216 Python pipeline tests, data checks, web tests) | pass | pass |
| `npm run build` with default flags (as numbite.com) | pass | pass |

Note: a plain `npx tsc --noEmit -p .` before `next typegen` fails with "Cannot find name 'LayoutProps'" (the type is generated by typegen). `npm run typecheck` does both steps. HANDOVER lists the plain command, so run the npm script.

### Browser suites (Chromium)

**Default-flags build (port 3102, what the iPhone app's flags match).**

| Suite | First run | After changes |
|---|---|---|
| prodmode | 9/9 | 9/9 |
| truth | 13/13 | 14/14 |
| protein | 5/5 | 6/6 |
| seo | 9/9 | 9/9 |
| firstvisit | 7/8 | 8/9 |

The one firstvisit failure on this build is expected: that step opens the fictional sample chain "Cluck House", which only exists when sample data is on. It passes on the test build.

**Payments-on build (port 3104).**
- pay: 15/15, and again 15/15 after the changes.
- On this build truth (12/14) and protein (5/6) fail by design: those suites assume everything is free, while this build turns the free-tier limits on (2 Quick answers results, 5 Cheapest protein rows, "Small appetite" behind the paywall). pay covers exactly those limits.

**Test build (port 3101: sample data on and the old Pro gate on, as `web/e2e/README.md` says).**

| Suite | First run | After changes |
|---|---|---|
| truth | 13/13 | 14/14 (one new step) |
| seo | 9/9 | 9/9 |
| protein | 5/5 | 6/6 (one new step) |
| firstvisit | 8/8 | 9/9 (one new step) |
| a11y | 0 violations | 0 violations |
| largetext | no overflow | no overflow |
| smoke | 24/24 | 24/24 |
| extra | 14/14 | 14/14 |
| back | 42/42 | 42/42 |
| days | 9/9 | 9/9 |
| tabs | 3/3 | 3/3 |
| sharelist | 11/11 | 11/11 |
| account | 8/8 | |
| addfood | 14/14 | |
| back-restaurants | 13/13 | |
| browse | 9/9 | |
| calories | 4/4 | |
| community | 10/10 | |
| **community-friends** | **25/26** | 26/26 (after a test fix) |
| compare | 4/4 | |
| diet | 7/7 | |
| done | 13/13 | |
| favnote | 4/4 | |
| groceries-all | 8/8 | |
| groceries-compare | 8/8 | |
| groceries-photos | 4/4 | |
| groceries | 6/6 | |
| languages | 3/3 | |
| listadd | 7/7 | |
| listphotos | 11/11 | |
| map | 7/7 (the usually-flaky headless location step passed too) | |
| **mapfs** | **18/19** | still 18/19 |
| **numbers** | **11/12** | 12/12 (after a test fix) |
| onboarding-body | 22/22 | |
| recipes | 16/16 | |
| **reminders** | **25/26** | 26/26 on a rerun |
| scan | 8/8 | |
| share | PNG 1080×1350 saved | |
| water | 13/13 | |
| **offline** | | **14/15** (run last on the changed build) |

### The failures, one by one

**`community-friends` "offline shows what was here last time"**: fails on clean `main`; the test is fixed.
- The test's fake server runs on a fixed clock of 16 October 2026, so a list "sent" in the test runs out on 15 November.
- The browser's real clock (16 November) correctly drops it from the offline copy (`web/lib/mm/communityCache.ts` `withoutExpired`), and the step waits for a row that is rightly not there:
  ```
  locator.waitFor: Timeout 30000ms exceeded. waiting for locator('main a[href^="/app/community/inbox/view?id="]').first() to be visible
  ```
- That is date rot in the test, not an app fault. The fake server now starts at the browser's clock (`communityWorld(Date.now())`, commit `f96fa70`): 26/26.

**`numbers` "a restaurant opens with the same numbers applied"**: fails on clean `main`; the test is fixed.
- ```
  locator.isVisible: Error: strict mode violation: getByText('35 g+ protein') resolved to 2 elements
  ```
- Since 13 November the restaurant page also has a Quick answers pill called "35 g+ protein". The test now reads the "Your numbers:" line itself (commit `afbe91c`): 12/12.

**`reminders` "Add a reminder … Save with nothing typed"**: `focus did not go to the name`. It passed 26/26 on the very next run of the same build: a timing flake.

**`mapfs` "privacy and network"**: still fails; it fails the same way on clean `main`. The test is not changed (founder decision, section 4).
- ```
  going full screen and back made 5 request(s): http://localhost:3101/app/chain?id=kfc&_rsc=VjZukLfkpBqoEwA8, http://localhost:3101/app/chain?id=greggs&_rsc=VjZukLfkpBqoEwA8, http://localhost:3101/app/chain?id=kfc&_rsc=5RPJKW1jrYUv0Q5Z
  ```
- These are Next.js prefetches of the nearby restaurants' pages (and once a JavaScript chunk), from our own site. They hold no position.
- With a throwaway copy of the test that tolerates same-origin page and chunk prefetches, all 19 steps pass, including "the position never leaves the phone".
- The map code hasn't changed since 17 October and the suite passed on 16 October. The prefetches re-fire when cached link data goes stale during a long run, so the result depends on timing.
- **In the iPhone app these pages come from the app's own files, so nothing reaches a server.** On the website, prefetching tells our own server which chains are listed near the person.

**`offline` "client navigation Home → Eat out → chain"**: still fails; the same step fails on clean `main`, as the 13–14 November PROGRESS entry already says.
- ```
  TimeoutError: locator.waitFor: Timeout 10000ms exceeded. url: http://localhost:3101/app/chain?id=kfc | h1: ["KFC"]
  ```
- The KFC page is in fact showing offline. The other 14 offline steps pass.

### The iPhone export: no Stripe code, no payment, subscription or "Pro" wording (Apple 3.1.1)

How I built it: `NEXT_PUBLIC_SUPPORT_EMAIL=<the support address the live site shows> ./scripts/build_app_web.sh`, the same command the Mac runs. It made a 159.4 MB `WebApp.bundle` with menu photos in, logos in and no shop left out. It holds no `/chains` pages and no sample menus. I then served that copy the way the app serves it (`web/e2e/serve-app.mjs`) with numbite.com unreachable.

1. **`app-build.mjs`: 9/9 on the final copy.** Its own check refuses any `\bPro\b|subscri|free trial|paywall|…` on every screen it opens.
2. **A crawl of every packed page plus the new screens, opened the way a person opens them**: 39 exported pages plus 12 new-screen states, 51 screens in all.
   - The new-screen states: a restaurant's Quick answers with each of the five lists, the menu sources sheet from Quick answers and from the Truth card, a dish's Truth card, Cheapest protein, Settings (with Filming mode), and Settings › About › Where these numbers come from.
   - For each screen it read every visible word plus the names of every visible button and link, and tested them against
     `\bPro\b|subscri|free trial|paywall|\bunlock|checkout|stripe|in-app purchase|\bpay\b|payment|per month|£x.xx once / a month / a year / a week|restore access|Apple Pay|Google Pay|Founding Member`.
   - **Result: "No payment, subscription or Pro wording on any screen."**
   - Two visible lines mention paying, and both say nothing is sold:
     - `/privacy`: "Purchases. There is nothing to buy: every feature is free, in the iPhone app and the web app."
     - `/support`: "Is anything paid? No. Every feature is free and there is nothing to buy."
   - `/app/pro` and `/app/pro/thanks` forward to Home.
3. **The packed files themselves** (5,879 files, 47 HTML pages, 83 JavaScript files): `grep` found
   - **no** `checkout.stripe.com`, `/api/v1/checkout` or `/api/v1/webhook`, no Stripe library, no plan prices (£9.99, £14.99, £2.99), no "Founding Member", no "You pay on Stripe's secure page", no "Apple Pay" or "Google Pay", and no "Unlock the other {n}";
   - **"stripe"** in exactly two files: a logo record's note (`logos/simmons-bakers.source.txt`, "…share buttons and stripes"), and the access-token check, which accepts a token whose source is `"stripe"` or `"apple"` (data, not Stripe code; kept for 1.1);
   - `/api/v1/entitlement/me` once: the dormant restore-by-account function, never called in this build;
   - **older dormant Pro-gate wording that was already inside the approved and live 1.0:** "Try Pro free", "See Pro", "free trial", and the closed paywall dialog whose label is "Numbite Pro" (in 39 HTML pages). All of these were in the build-4 source (checked at commit `6a6482f`, 30 October). They are never shown, because `PRO_ENABLED` is off; the crawl above confirms it.

**What I changed so this holds (commit `28aa46a`).**
- Before the change, the 1.0.1 copy packed new dormant text from the 13–14 November work: the three plans with their prices, "You pay on Stripe's secure page with a card, Apple Pay or Google Pay … Subscriptions renew until you cancel.", the Pro pages and three "Unlock the other {n}" buttons. None of it showed, but App Review 2.3.1 forbids hidden or dormant features, and 3.1.1 covers payment routes outside Apple.
- Now a build-time constant, "app build and no In-App Purchase", leaves all of that out of the iPhone files: in `lib/payments/plans.ts`, `ProPlans`, `/app/pro`, `/app/pro/thanks`, Quick answers, Cheapest protein and Best for you.
- `next.config.ts` now always defines `NEXT_PUBLIC_IAP` ("1" or "0") in the app build. Otherwise the constant can't fold: Next.js only inlines variables that are defined.
- The website is unchanged (pay 15/15 after the change), and so is a future In-App Purchase build (`NEXT_PUBLIC_IAP=1`, 1.1).
- **For the Mac:** pack 1.0.1 **without** `NEXT_PUBLIC_IAP` set. The script does not unset it, because the 1.1 prompt sets it on purpose.

## Task 3: App Review audit of the new screens

**Guideline 1.4.1** (the rule that rejected build 3: health information needs citations that are easy to find). Each figure or rule, whether its source is visible and linked inside the app, and what I did:

| Screen and figure | Source before | Now |
|---|---|---|
| Truth card: calories and protein as "% of the 2,000 kcal reference intake" and "% of reference intake" | UK reference intakes (Reg. 1169/2011 Annex XIII, legislation.gov.uk) linked as "Source" at the **foot** of a long card | Also in the new "Where these numbers come from" sheet, linked at the **top** of the card |
| Truth card: traffic lights (fat, saturates, sugars, salt) | UK front-of-pack guidance 2016 (gov.uk PDF), linked inline as "See the guidance" | Also in the sheet |
| Truth card: "What that looks like" (sugar cubes, butter, eggs) | NHS "Sugar: the facts", McCance & Widdowson via Patient.info, British Egg Information Service, each linked "Source" | Also in the sheet |
| Truth card: Protein score 1 to 5 | Said to be "Numbite's own score"; how it works in one line; **bands not shown** | The sheet lists it under "Numbite's own rules" with its exact bands and size caps |
| Smart Swap | One line under the card; no published source needed (it compares the chain's own figures) | Its rules are in the sheet under "Numbite's own rules" |
| Quick answers (5 lists) | Each list's rule shown under it; **no source link**; the limits are Numbite's own | "Where these numbers come from" under any open list; the limits are in the sheet as Numbite's own |
| Cheapest protein | Price arithmetic from labels and shelf prices, explained on the page; the "protein food" line (12 g per 100 g, 25% of calories) **not shown** | Link under the first line; the line is in the sheet as Numbite's own |
| Share text and image | The message says "Figures from {chain}'s own published nutrition guide"; the image says "Not affiliated with {chain}" | Unchanged (it is the person's own message, sent outside the app) |
| **Home on a first visit (new gap)** | Since 13 November there is no welcome gate, so a first visit lands on Home with the default targets (2,000 kcal, worked-out protein, carbs and fat) and never passes the targets step that links their sources | The "Make Numbite fit you" card under those numbers, and the GLP-1 note in its sheet, now have the same "Where these numbers come from" link as Settings. The targets list now names the 2,000 kcal starting target among Numbite's own starting points |

**How it's built.**
- `web/app/app/_components/MenuSourcesBody.tsx` and `MenuSourcesLink.tsx` reuse the pattern of `SourcesBody` and `SourcesLink`. The sheet sits on top of the Truth card, attached to the end of the page so the dark card's colours never reach it, and closing it leaves the card open with focus back on the link.
- `web/lib/mm/truth/menuSources.ts` only gathers the five sources the card already linked. **No new source and no new number.** Every figure in the words is read from the constants the features use.
- Settings › About › Where these numbers come from now shows both lists.
- Tests:
  - `web/tests/menuSources.test.ts` (8): exactly the card's sources, https on allowed hosts, one checked date, the words match the constants, no judging words.
  - New browser steps in truth, firstvisit and protein: the link sits above the Protein score, opens the five sources and nothing is fetched until tapped, closing keeps the card, works on the dark card, axe 0, and the Quick answers, Cheapest protein and first-visit links.
- All eight source links answered today (HTTP 200; PubMed 203).
  - The egg page now **redirects** to `https://www.egginfo.co.uk/egg-nutrition-and-health/egg-nutrition-information/protein`. The old link still works; update it only after re-reading the 6.4 g figure there.
  - The NHS "Understanding calories" page was past its own review date (April 2026), as HANDOVER says. Its content was not re-read today.

**Guideline 3.1.1** (payments): see "The iPhone export" above. Nothing can be bought in 1.0.1, no screen mentions paying, the share-to-unlock path is off, and the paid code is now left out of the app's files.

**Guideline 5.2.1** (third-party material) in what the app build shows:
- **Fixed:** the "Share to WhatsApp" button drew a speech bubble with a phone handset, i.e. a redrawing of WhatsApp's logo. CLAUDE.md rule 2 says never recreate or redraw a logo. It is now a plain message bubble with two lines; the words "Share to WhatsApp" stay. Commit `0175153`. **Founder: keep it, or say if you want the old icon back.**
- **Flag, not changed (copy):** the saved image card's footer reads "Official UK menu figures • numbite.com". It could be read as Numbite being official. Something like "Figures from each restaurant's own guide • numbite.com" would be safer. Founder's call (rule 8).
- Fine as built: chain names are plain text, "Not affiliated with {chain}" is on the card and the image, the image has no logo or photo, the public `/chains` pages are website-only (not in the app), and the logos and photos are the founder's accepted risk (rule 2).
- Not related to the new screens: the existing logos and item photos, as before.

## Task 4: WebKit (Playwright WebKit 26.6 on Linux; not a real iPhone)

The five suites ran unchanged on WebKit through a small loader that swaps Playwright's `chromium` for `webkit`, against the changed test build:

| Suite | WebKit | Difference |
|---|---|---|
| truth | 13/14 | The Quick answers step read empty text for rows 3–5. Those rows use `content-visibility: auto`, and WebKit gives no `innerText` for content it hasn't drawn yet (Chromium does). A probe showed the text is in the page (all five ≤ 500 kcal), and a screenshot shows all five drawn on WebKit. A difference in how the test reads text, not a visible fault. |
| protein | 6/6 | none |
| firstvisit | 9/9 | none |
| smoke | 22/24 | The two outbox steps (request a chain, report a number) were not caught by the test's request interceptor. The page's service worker is on in that suite, and Playwright cannot intercept requests that go through a service worker on WebKit. The requests did reach the test server (it answered 500, having no database), so the app did send them. A harness difference. |
| sharelist | 10/11 | First run: 0/11, because Playwright's WebKit has no clipboard permissions, so every browser context failed to open. With those permissions dropped by the loader: 10/11. The one failure is the test reading the clipboard (`navigator.clipboard.readText()`), which WebKit refuses. A harness difference. |

No layout or behaviour difference was found on WebKit in these suites. It is still not WKWebView on an iPhone: VoiceOver, the `app://` scheme, the keyboard and the native bridge need the Mac and a phone.

## Task 5: App Store text, draft

`docs/STORE_NEXT_VERSION_DRAFT.md` (new; `docs/STORE.md` is unchanged) holds:
- "What's New in This Version" for 1.0.1 (1,348 characters): See the truth, Smart Swap, Quick answers, Cheapest protein, Share, Starts straight away, then "Every figure still comes from each restaurant's or shop's own published information. Numbite isn't affiliated with any restaurant or shop, and doesn't give medical advice."
  - It has no payment wording, no health claim, no good or bad words, no company name (so not "WhatsApp" either) and no partnership claim.
  - Each line is checked against the code.
- An optional promotional text (152 characters).
- One paragraph to add to the App Review notes for 1.0.1: the new sources sheet and where to find it, which rules are Numbite's own, and that nothing can be bought.
- What to check in App Store Connect.

## 5. New on-screen sentences for the founder's approval (rule 8; English only)

1. "On a dish's Truth card, in Quick answers and in Cheapest protein, {app} adds a few numbers to the restaurant's or shop's own figures. This says where each one comes from."
2. "Reference intakes" (heading)
3. "Percentages are of the UK reference intakes that food labels use for an average adult: 2,000 kcal of energy, 50 g of protein, 70 g of fat, 20 g of saturates, 90 g of sugars and 6 g of salt a day. They are not a target for you."
4. "The colours follow the UK government's guidance for front-of-pack labels, for fat, saturates, sugars and salt only. A figure above the guidance's high level for one portion is red. Green and amber need the dish's weight, so they are only shown when the restaurant publishes it."
5. "{app}'s own rules" (heading)
6. "These are not taken from a published source. They are {app}'s own, and they only sort and compare the figures each restaurant or shop publishes."
7. "Protein score: 5 needs at least 25% of an item's calories to come from protein, 4 needs 20%, 3 needs 15% and 2 needs 8%; below that it is 1. Items up to 650 kcal can score 5, up to 800 kcal 4, up to 1,000 kcal 3, and larger ones 2 at most (1 if under 12% of their calories come from protein). Drinks, sauces, add-ons and items under 120 kcal aren't scored."
8. "Quick answers: meals of 500 kcal or less; meals with 35 g of protein or more; for a small appetite, 400 kcal or less with at least 20 g of protein; 5 g of sugar or less; and for the most protein for the calories, meals of 250 kcal or more with at least 20 g of protein."
9. "Smart Swap: a dish from the same restaurant and the same part of the menu that fits your diet and allergy settings, saves at least 75 kcal and at least 10% of the calories, is at least 40% of the original's calories, and has at least as much protein where the restaurant publishes protein. Dishes under 200 kcal get no swap."
10. "Cheapest protein: a food counts as a protein food when it has at least 12 g of protein in every 100 g and at least 25% of its calories come from protein."
11. "Until you set your own, a target of 2,000 kcal a day." (added to the targets' "Numbite's own starting points" list)
12. No new wording, only new places: the existing "Where these numbers come from" link now also appears on the Truth card, under an open Quick answers list, on Cheapest protein, on Home's "Make Numbite fit you" card, and under the GLP-1 note in that card's sheet.

Reused unchanged: "Traffic lights", "What that looks like", the three existing "basis" lines (sugar cube, butter, egg), "A doctor or dietitian can give advice that fits you. {app} doesn't give medical advice.", "Links open in your browser. Sources checked on {date}." and the existing source citations. In sentences 3 and 7 to 10, every number is read from code constants (shown here with today's values).

## 6. For the Mac session (pack and archive 1.0.1 build 5)

1. `git fetch origin release-1-0-1-b && git checkout release-1-0-1-b`. The branch is not merged to `main`. Merging it deploys numbite.com; the website changes are the sources links and the share icon.
2. `NEXT_PUBLIC_SUPPORT_EMAIL=<the support address the live site shows> ./scripts/build_app_web.sh`, with `NEXT_PUBLIC_IAP` not set.
   - Here it made a 159.4 MB `WebApp.bundle` with photos in, logos in and all nine shops.
   - To confirm, `grep -rl "Stripe's secure page\|£9.99" MenuMacros/Resources/WebApp.bundle` must print nothing.
3. `./scripts/test.sh` (adds the 62 Swift tests and the UI test). The Swift is unchanged since build 4; only the two version numbers changed.
4. Simulator: open a dish › See the truth › Where these numbers come from. The sheet sits on top and Close returns to the card. Check the same on an iPad (Apple reviewed on one).
5. Archive. In App Store Connect create version **1.0.1** and attach build 5. Use the What's New and the review-notes paragraph from `docs/STORE_NEXT_VERSION_DRAFT.md` once the founder approves them.

## 7. Founder decisions, in one list

1. Approve, change or drop the new sentences in section 5.
2. Share button icon: keep the plain bubble (recommended: rule 2 and App Review 5.2.1), or restore the redrawn WhatsApp logo.
3. Settings footer "web 1.0" in the iPhone 1.0.1 app (also sent with reports and messages): leave it, or change it (for example "1.0.1").
4. Share image footer "Official UK menu figures • numbite.com": keep, or reword.
5. Should Home keep a sources link after the "Make Numbite fit you" card has gone? Today the link is on that card, then under Settings › Daily targets and Settings › About.
6. `mapfs`: stop Near me's restaurant links from prefetching on the website, so our server doesn't learn which chains are listed near someone, or accept it and loosen the test.
7. Approve the draft App Store text and review-notes paragraph (`docs/STORE_NEXT_VERSION_DRAFT.md`).

## 8. Other notes

- `web/e2e/alk-tmp-12.mjs` and `web/e2e/alk-tmp-lib.mjs` are empty files committed on 15 October (commit `0afe16b`). They are harmless; delete them in a tidy-up.
- In the test build, Home shows "Log your meals to see what's left today. See Pro". That only appears with the old Pro gate on (`NEXT_PUBLIC_PRO=1`, test builds only). prodmode and the app checks confirm it never shows on numbite.com or in the app.

## 9. Suggested PROGRESS entry (for the desktop session to log)

"2026-11-16: release 1.0.1 build 5 prepared on `release-1-0-1-b` (cloud).
- Version 1.0.1, build 5.
- App Review 1.4.1: 'Where these numbers come from' for the Truth card, Quick answers and Cheapest protein, listing the sources the card already linked and Numbite's own rules (Protein score bands, Quick answers limits, Smart Swap, the protein-food line).
- The same link on Home's first-visit card and its GLP-1 note; the 2,000 kcal starting target listed as Numbite's own.
- The share button's redrawn WhatsApp logo replaced with a plain bubble.
- The free iPhone build no longer packs the website's plans, prices, Stripe text or Unlock buttons.
- Tests fixed for date rot (community-friends) and the new '35 g+ protein' pill (numbers).
- New copy listed in docs/CLOUD_REPORT_RELEASE_2026-11-16.md section 5, awaiting approval."

PUSHED ea6c39f
