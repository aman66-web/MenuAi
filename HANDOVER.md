# Handover: Numbite (for a new Claude Code session in the Claude desktop app)

Hi Claude, I'm Aman, the founder of Numbite. I'm moving this project from a cloud session to you in the Claude desktop app on my Mac, where you can also use my
desktop and Chrome. This file tells you everything you need to carry on exactly where we left off. It was written on 30 October 2026.

## 1. About me and how to work with me

1. I'm not technical. Explain in plain words, and give me at most 2 or 3 numbered steps at a time.
2. Do everything yourself wherever a tool lets you: Terminal, Xcode, clicking in my Chrome and apps. Only hand me what needs me.
3. I type my own passwords and two-factor codes. Never type, copy, print or save a password, API key, token or private key.
4. Ask me before anything that costs money, and before anything I can't easily undo or that goes outside the Mac (publishing, emailing, replying to Apple), unless
   I've already said yes to that exact thing.
5. Standing rules from me (also in `CLAUDE.md`, which wins if anything here disagrees):
   - Never invent or estimate a nutrition number. Never call food good, bad or healthy. No medical claims.
   - The app is **English only** (since 17 October). Don't spend effort on translations.
   - Light appearance only. No dark mode.
   - No new third-party dependencies without asking me.
   - Never run `supabase db push` or change the live database without my go-ahead. Database changes are new migration files.
   - Never push to `main` without my go-ahead for that piece of work. `main` deploys the live website automatically.
   - New wording on screen must be logged in `docs/PROGRESS.md` (CLAUDE.md rule 8).
   - Log every decision and finished piece of work in `docs/PROGRESS.md` (newest entries at the end of "Decisions log").

## 2. Set up first

- **GitHub repository:** `aman66-web/MenuAi` (private).
- **Branch:** `main` (it now holds build 4, see section 6). Start each new piece of work on a new branch from `main`. The unfinished improvement pass is on
  `claude/menumacros-kit` (section 6). Old branches you can ignore: `mac-build`, `mac-backup`, `fix-1-4-1-sources` (merged), `claude/cross-shop-wip`.
- **On my Mac:** I already have the `MenuAi` folder (the earlier Mac sessions used it). In the desktop app, open that folder. If you need a fresh copy, clone it
  into a normal folder such as `Documents/MenuAi`: never inside `Library` or a hidden folder (the desktop app can't use those). Then `git checkout main && git pull`.
- **Install:** `cd web && npm ci` (Node 22+; the Mac has Node 26, which works). Python 3 is used by the data tools. Xcode 26.6 with the iPhone 17 Pro simulator.
- **Read first, in this order:** `CLAUDE.md` (the rules and where everything is), `docs/PROGRESS.md` (the whole history; read the last ten entries closely, plus
  "Known issues" and "Founder to-do"), `docs/APP_BUILD.md` (how the iPhone app is built), `docs/STORE.md` (App Store text, privacy answers, App Review notes),
  `web/AGENTS.md` (Next.js 16 differs from what you know: read its docs in `web/node_modules/next/dist/docs/` before using a Next API).
- **Checks the project uses:** `./scripts/test.sh --unit` (data checks, website unit tests and the Swift tests), `./scripts/test.sh` (adds the UI tests),
  `cd web && npx tsc --noEmit -p . && npx eslint app lib tests` and `npm run build`. Browser tests: `web/e2e/README.md`.

## 3. The project in short

Numbite is a free UK iPhone app and website (https://numbite.com) for people who count calories or protein:
- **Eat out:** full nutrition for menu items at about 241 UK restaurant chains, copied by script from each chain's own published guide.
- **Shop:** nine UK supermarkets' products with their own prices and photos, a barcode scanner, a compare tool and a shareable shopping list.
- **Cook:** 117 recipes built from real Sainsbury's products, every figure worked out from the labels.
- **Also:** daily targets worked out in onboarding, a Home log of meals and water, reminders (local notifications), short food articles, and optional accounts
  (Apple, Google or an email code) with sync and Community friends.

It is built as a **web app** (`web/`, Next.js 16, TypeScript) **packed inside a small iPhone app** (`MenuMacros/`, SwiftUI with a web view):
`scripts/build_app_web.sh` makes `MenuMacros/Resources/WebApp.bundle` (about 160 MB, not in git), and the app serves it on `app://menumath/`.
The app also reads newer menus, the logo take-down list and the API from numbite.com.

- **Live now:** numbite.com runs `main`. On the App Store, version 1.0 was **rejected** on 30 October (section 6). Build 4 with the fix is ready on `main` but
  **not yet uploaded**.
- **Only on a branch:** the improvement pass (`claude/menumacros-kit`, unfinished).

## 4. Accounts and services (never write a secret anywhere; this list says where each one lives)

| Service | What it's for | Account / project | Where its secrets live |
|---|---|---|---|
| GitHub | the code | repo `aman66-web/MenuAi` | — |
| Vercel (Pro plan) | the website, API and domain | project `menumacros` (root folder `web`, Production branch `main`); domain `numbite.com` bought on Vercel in my name (renews 12 Oct 2027), `www` redirects to it; `menumacros.vercel.app` is an alias | Vercel › menumacros › Settings › Environment Variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `IP_HASH_SALT`, `CRON_SECRET`, `NEXT_PUBLIC_SUPPORT_EMAIL` (Production + Preview), `NEXT_PUBLIC_SHOW_SAMPLE_DATA=1` (Preview only, never Production); possibly `RESEND_API_KEY`, `REPORT_ALERT_TO/FROM`, `APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY` (not yet checked) |
| Supabase (free plan) | database and sign-in | project `menumacros`, ref `rbbalkfkpacazzhsqfzz`, org "Aman's Org", us-east-1 | the secret key is only in Vercel; Google and Apple sign-in settings are in Supabase › Authentication › Providers |
| Resend | sign-in code emails from noreply@numbite.com | domain `numbite.com` (Ireland); DNS records in Vercel DNS | a sending-only key in Supabase's custom SMTP settings |
| Apple Developer / App Store Connect | the iPhone app | team `S7G6ZHHK59` (CLARIFO DEVELOPERS LTD); bundle ID `com.amanmarwaha.MenuMacros`; app "Numbite: Calories & Protein"; Sign in with Apple Services ID `com.amanmarwaha.numbite.web`, key ID `X374U6N8FP` | the `.p8` key file is mine (wherever I saved it). The Sign in with Apple client secret made from it is in Supabase and **expires 11 April 2027** (reminder in my Outlook for 29 March 2027; `tools/auth/apple_client_secret.py` makes the next one) |
| Google Cloud | Continue with Google | project "Numbite": Web and iOS OAuth clients | the web client's secret is in Supabase › Authentication › Google |
| OpenFreeMap, postcodes.io, Open Food Facts | the map, typed postcodes, community grocery data | no account | — |

**Do not touch:** the Vercel account `aman-moneysave` (a different account a cloud connector once saw), my older Supabase account (its free plan is full with
other projects), and my other apps and projects on this Mac (ReadFluent, CaseSpar / interview prep, and anything else outside `MenuAi`).

**Support email:** my personal address `aman66@hotmail.co.uk` is the public support contact for now (on the site and in the app). A `support@numbite.com` forwarding
address is still on my to-do list.

## 5. What's been done (short history)

- **5–9 Oct:** web app built (milestones W0–W10), UK menu data from official sources only, logos and item photos (my accepted risk, CLAUDE.md rule 2), groceries.
- **10–12 Oct:** recipes, mascot Pip, onboarding, diet filters (vegan, halal, pescatarian, allergies), 241 chains. **Free launch decision:** Pro off, AI recipes off.
  Renamed to **Numbite**; numbite.com bought; the iPhone app is the web app packed inside.
- **13–14 Oct:** optional sign-in and sync (Apple, Google, email code via Resend); the database migration applied.
- **14–17 Oct:** Home redesign, water, reminders (local notifications), shared shopping-list links, Community (friends by code, send a list, report and block; its
  migration applied 17 Oct), Christmas recipes, English only.
- **18 Oct:** a Mac session compiled the app (62 Swift tests pass), added Associated Domains and the `numbite://` link type, and archived. **Build 3 was submitted
  to App Review.** I answered Content Rights "Yes" myself (my decision, see CLAUDE.md rule 2).
- **29 Oct:** a cloud session made an **improvement pass** (about 28 bug fixes and four small features). It isn't finished (section 6).
- **30 Oct:** **Apple rejected build 3** under Guideline 1.4.1 (Safety: Physical Harm): "the app includes medical information but does not include citations".
  Apple's screenshot was Settings › Daily targets. My choices: add citations in the app (option A); build 4 = `main` + this fix only; keep the GLP-1 meal size,
  labelled as Numbite's own setting.
- **30–31 Oct:** the fix was built: a "Where these numbers come from" sheet and page listing three sources, each read and checked (the Mifflin-St Jeor equation
  on PubMed, the NHS "Understanding calories" page, and the International Society of Sports Nutrition protein position stand). It also says which starting points
  are Numbite's own. It is linked beside Settings › Daily targets, the GLP-1 note, the onboarding targets step and Settings › About. No number changed. Build number is
  now 4. Independently reviewed and fixed; all checks pass. Merged to `main`. Details: the 2026-10-31 entry in `docs/PROGRESS.md`.

## 6. Where we left off

- **Finished and on `main`:** the 1.4.1 fix and build number 4, plus the hand-over prompt `docs/CLAUDE_DESKTOP_BUILD4_PROMPT.md`.
- **Waiting (you can do most of it, I just sign in):** build 4 is **not yet archived, uploaded or resubmitted**. The rejected submission in App Store Connect is
  still open (submission ID `396dfb5d-7738-4aa0-ac84-6e93d16747d4`). Don't reply to Apple until build 4 is attached.
- **Half done, on branch `claude/menumacros-kit` (commit 62114fe), not to be shipped yet:** the improvement pass. Its unit tests pass, but 19 review findings are
  open (`docs/IMPROVEMENT_PASS_REVIEW.md`). Its production build and browser tests haven't been run, and its PROGRESS entry isn't written. It must take in `main`
  first.
- **On my Mac, from the earlier Claude desktop chat:** an uncommitted `docs/REJECTION_REPORT.md` in my MenuAi folder (its content is now in PROGRESS: you may
  delete it with my OK), and possibly Apple's screenshot in my Downloads folder.

## 7. What's next, in order

1. **Resubmit build 4** (you, with me signing in). Follow `docs/CLAUDE_DESKTOP_BUILD4_PROMPT.md` exactly:
   - pull `main`, pack the web app and run the tests;
   - check the new sources sheet in the simulator, including on an iPad (Apple reviewed on one);
   - archive; then upload: **I click Distribute App › Upload** in Xcode's Organizer if your tools are blocked (last time the upload command was blocked);
   - swap build 3 for build 4 on the rejected submission, paste the reply that's in that file, and resubmit. Release stays manual.
2. **Wait for App Review** (usually one or two days). If Apple objects again, read the message in App Store Connect and tell me before changing anything.
   Fallbacks already in the app: `web/app-content.json` switches (`appLogos`, `menuPhotos`, `shops`) and `web/public/logos/hidden.json` (takes a logo or photo down
   with no app update).
3. **When approved:** I press Release. Then set `NEXT_PUBLIC_APP_STORE_URL` in Vercel to the App Store address and redeploy (me or you, with my OK).
4. **Real-iPhone checks** (needs my phone): barcode scanner, Sign in with Apple, Google, email code, a reminder ringing on the lock screen, a shared list link, and a
   two-account Friends test.
5. **Finish the improvement pass** for version 1.0.1 (you): merge `main` into `claude/menumacros-kit`, fix the findings in `docs/IMPROVEMENT_PASS_REVIEW.md`
   (ask me about findings 6 and 7), run every check and browser suite, write the PROGRESS entry, then ask me before merging and making build 5.
6. **My to-dos** (from PROGRESS "Founder to-do"): a support@numbite.com address, a UK trade mark search for "Numbite", the Midjourney recipe pictures
   (`docs/MIDJOURNEY_CHROME_PROMPT.md`), and the Vercel environment-variable check (`docs/CHROME_PROMPT_LAUNCH.md` part 2).

## 8. Known problems and warnings

- **App Review:** the logos, chain photos and supermarket lists are third-party material I chose to use (accepted risk). Apple didn't raise it this time, but might.
  Never claim to Apple that we have the brands' permission.
- **Uploads:** `xcodebuild`/`altool` uploads were blocked by the permission system on 18 October, so plan for me to click Upload in Xcode.
- **Disk:** the Mac ran out of disk space during an archive on 18 October. Check `df -h /` first; a build plus archive needs about 5–6 GB. On 30 October there was 11 GB
  free after a cleanup; Downloads (about 24 GB) and Photos are the big ones and are mine to decide.
- **Claude desktop on my Mac:** last time its own shell failed ("device_bash failed") and it worked from a copy of the repo. Its browser pane crashed once (click
  Ignore, not Report).
- **Builds:** `npm run build:app` writes into `web/.next`, so it breaks a running `npm start` test server: run the packed-app test last.
  `./scripts/build_app_web.sh` needs `NEXT_PUBLIC_SUPPORT_EMAIL=aman66@hotmail.co.uk` and refuses placeholders.
- **A new iPhone build always needs a new build number** (App Store Connect refuses a number it has seen). The next one after 4 is 5
  (`CURRENT_PROJECT_VERSION`, two lines in `MenuMacros.xcodeproj/project.pbxproj`).
- **Never break the live site or API while a build is in review or live:** the app reads menus, `hidden.json` and `/api/v1/*` from numbite.com, and CORS allows only
  `app://menumath` (`web/lib/cors.ts`).
- **Sync:** only the last 2 days of the food log sync to a second device. Water and reminders never sync (by design). Each synced store is capped at 1 MB.
- **Data rules:** robots.txt and blocks are honoured, never worked round. Some sites block automated visits, and the Overpass map server times out on big batches.
- **Sources:** the NHS page we cite is past its own review date (April 2026). Re-check the three source links before each release.
- **Tests:** the Near me "location refused" browser step always times out in headless Chromium (a known limit, not a bug).
- **Free plans:** Supabase is on the free plan (project pausing, limits); Vercel is Pro.

**Start here:** please begin by telling me, in 2 or 3 plain lines, the state of the project and what you will do first.
