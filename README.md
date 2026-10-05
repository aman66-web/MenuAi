# MenuMacros starter kit for Claude Code

Everything Claude Code needs to build the MenuMacros iPhone app: a project memory file, the full
spec, a milestone plan with acceptance tests, the menu-data pipeline (tested), sample data, golden
test cases for the ranking engine, project skills that run each milestone the same way, and a
ready-to-deploy backend: a Vercel website + API (`web/`) and a Supabase database (`supabase/`).

## What's inside

```
CLAUDE.md                      Project memory Claude reads every session (rules, commands, map of docs)
.claude/settings.json          Pre-approved safe commands (xcodebuild, simctl, pipeline, git read-only); blocks git push
.claude/skills/milestone/      /milestone M3 → plan, build, test, check in simulator, update progress
.claude/skills/verify/         /verify → tests + run the app + check a flow (Claude also uses it on its own)
.claude/skills/menu-data/      Rules Claude follows whenever menu data is involved
.claude/agents/spec-reviewer   Read-only agent that checks code against the spec
docs/SPEC.md                   The product + technical spec (screens, rules, exact copy, algorithms)
docs/BUILD_PLAN.md             Milestones M0–M10 with acceptance criteria
docs/PROGRESS.md               Living status file Claude updates after each milestone
docs/DATA.md                   Menu data contract (CSV → pipeline → JSON → app)
docs/STORE.md                  App Store copy, privacy answers, release checklist
docs/MenuMacros_App_Blueprint.pdf   The full business blueprint
data/source/                   One folder per chain (CSV). _template/ + two FICTIONAL sample chains
data/schema/                   JSON Schemas for the app's menu files
data/fixtures/ranking-golden.json   Expected "Best for you" results the Swift code must match
tools/build_menus.py           Menu pipeline: checks, builds candidates, writes JSON (+ tests)
tools/reference_ranking.py     Python reference of the ranking algorithm (the oracle)
scripts/test.sh                One command to run every test (pipeline, data, website/API, iOS)
scripts/publish_menus.sh       Release menu data → website (Vercel) + app bundle
web/                           Next.js site for Vercel: landing + waitlist, privacy, terms, support, menu hosting, API
supabase/                      Database migrations (locked-down tables, private photo bucket) + security test
docs/BACKEND.md                How the backend works + the API contract the app uses
docs/SETUP_VERCEL_SUPABASE.md  Step-by-step Vercel + Supabase setup (do this first)
```

**The app name:** the website uses "Menu Math" (`web/site.config.ts`); the Xcode project and docs
say MenuMacros. The project name never shows to users, so it can stay. If you pick a different name,
change `web/site.config.ts` and `docs/STORE.md`.

## Order of setup

1. **Backend first (about 45 minutes):** unzip the kit to e.g. `~/Developer/MenuMacros`, then follow
   `docs/SETUP_VERCEL_SUPABASE.md` (it starts with `git init` and pushing to a private GitHub repo).
   You get a live site collecting waitlist emails while you build the app.
2. **Then the iPhone app (below).** Because the kit folder already exists, create the Xcode project
   in a temporary place (e.g. Desktop, *without* "Create Git repository") and move
   `MenuMacros.xcodeproj`, `MenuMacros/`, `MenuMacrosTests/` and `MenuMacrosUITests/` into the kit
   folder so `MenuMacros.xcodeproj` sits next to `CLAUDE.md`. (If you'd rather start with the app,
   use the steps below exactly as written.)

## App setup (about 15 minutes)

You need a Mac with Xcode, an iPhone simulator installed, Python 3 (`python3 --version`), and Claude Code.
If you want the live iOS Simulator pane in **Claude Code Desktop** (recommended), use Xcode 26.x;
the pane doesn't support Xcode 27 yet.

1. **Create the Xcode project.** Xcode › File › New › Project › iOS › App.
   - Product Name: `MenuMacros` · Interface: SwiftUI · Language: Swift
   - Storage: **None** (Claude sets up SwiftData itself) · Testing System: Swift Testing with XCTest UI Tests
   - Organization Identifier: your reverse domain, e.g. `com.amanapps`
   - Save it somewhere like `~/Developer/MenuMacros` and tick **Create Git repository**.
2. **Copy the kit in** next to `MenuMacros.xcodeproj` (the `.claude` folder is hidden; this copies it too):
   ```bash
   cp -R ~/Downloads/menumacros-kit/. ~/Developer/MenuMacros/
   cd ~/Developer/MenuMacros && ./scripts/test.sh --skip-ios    # ends with "✓ Pipeline and data checks passed"
   git add -A && git commit -m "Add MenuMacros starter kit"
   ```
3. **Open Claude Code in that folder.** Desktop: Code tab → choose the `MenuMacros` folder.
   Terminal: `cd ~/Developer/MenuMacros && claude`. Accept the workspace trust prompt so the project
   settings and skills load. Run `/context` once to confirm `CLAUDE.md` and `PROGRESS.md` are loaded.
4. **Start building:** type `/milestone M0`. Tell Claude your bundle ID prefix when it asks. M0 also
   has a few Xcode clicks only you can do (iPhone-only destination, iOS 17 minimum, App Groups /
   HealthKit / In-App Purchase capabilities, a shared scheme); Claude walks you through them.

## The loop (repeat for M0 → M10)

1. `/milestone M<n>` — Claude reads the plan and spec, shows a plan, and waits.
2. Read the plan. Push back on anything odd. Approve.
3. Claude builds in small steps, running `./scripts/test.sh --unit` after each and the full suite at
   the end, then checks the app in the simulator.
4. Try it yourself in the simulator. Ask for fixes in plain English.
5. Claude updates `docs/PROGRESS.md` and proposes a commit message → you commit.
6. `/clear` and start the next milestone. (A fresh session per milestone keeps Claude sharp;
   `PROGRESS.md` carries the memory.)

Useful extras:
- `Shift+Tab` cycles permission modes (including plan mode) if you want to think before any edits.
- "Use the spec-reviewer agent to check M5 against the spec."
- "/verify the order builder: open Bowl & Co., customise the chicken bowl, double the chicken, remove cheese."
- "Something in the spec is wrong: … Update SPEC.md and log the decision in PROGRESS.md."

## Things only you can do (Claude will remind you)

- Apple Developer Program enrolment, signing team, App Store Connect app record.
- In Xcode › target › Signing & Capabilities: **+ App Groups**, **+ HealthKit**, **+ In-App Purchase**
  when Claude asks (it needs your Apple account).
- Subscription products and the 7-day trial in App Store Connect (local testing works without them,
  via the `.storekit` file Claude creates in M8).
- **Real menu data.** Type each chain into `data/source/<chain>/` from its official nutrition guide
  (copy `_template/`; save as "CSV UTF-8"), then `python3 tools/build_menus.py --bundle-into MenuMacros/Resources/Menus`
  and read `dist/menus/check-report.md`. Claude can help you structure and check it, but the numbers
  must come from the source. Start this in week 1; it's the slowest part (about 2–3 hours per chain).
- Vercel + Supabase accounts and setup (`docs/SETUP_VERCEL_SUPABASE.md`), a domain, a support email,
  the app icon, screenshots. Upgrade Vercel to Pro ($20/month) before the site is public (its free plan
  is non-commercial only).

## Important

- The two sample chains (**Bowl & Co.**, **Cluck House**) and every number in them are **fictional**,
  for development only. Keep their folders (tests and previews use them). To publish real data run
  `./scripts/publish_menus.sh` and push (it never includes samples); the app also hides sample chains
  in Release builds.
- Pre-approved commands live in `.claude/settings.json`. Anything else still asks you first.
  `git push` is blocked on purpose (pushing deploys the website); `supabase db push` always asks.
- The Supabase secret key goes only into Vercel's environment variables and `web/.env.local`
  (git-ignored, and Claude is blocked from reading it). Never into the app.
