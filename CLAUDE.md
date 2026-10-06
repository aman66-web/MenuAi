# MenuMacros

iPhone app (SwiftUI, iOS 17+) for US users who count calories or protein: full macros for every
item at popular restaurant chains (free), plus "Best for you" ranked orders and an order builder
(Pro subscription). Solo founder; launch target Monday 4 January 2027.

## Where things are (read on demand — don't load everything)

| Need | Read |
|---|---|
| What to build, exact rules and copy | `docs/SPEC.md` (numbered sections; read only the ones your task cites) |
| Order of work, acceptance criteria | `docs/BUILD_PLAN.md` (milestones M0–M10) |
| Menu JSON contract, pipeline, data rules | `docs/DATA.md`, `data/schema/*.json` |
| Ranking oracle + golden cases | `tools/reference_ranking.py`, `data/fixtures/` (golden cases + the sample chain JSON they use) |
| App Store copy, release checklist, privacy answers | `docs/STORE.md` |
| Backend (Vercel site + API, Supabase), API contract for the app | `docs/BACKEND.md`; code in `web/` and `supabase/` |
| The web app (built first; how it differs from the iPhone spec) | `docs/WEB_BUILD_PLAN.md`; code in `web/app/app/` and `web/lib/mm/` |
| Founder's Vercel/Supabase setup steps | `docs/SETUP_VERCEL_SUPABASE.md` |
| Business context (rarely needed) | `docs/MenuMacros_App_Blueprint.pdf` — where it differs from SPEC, SPEC wins |

Current state of the build (always loaded):
@docs/PROGRESS.md

## Commands

```bash
./scripts/test.sh --unit               # quick: pipeline/data checks + unit tests (run after every step)
./scripts/test.sh                      # full: + UI tests (run before calling a milestone done)
python3 tools/build_menus.py --bundle-into MenuMacros/Resources/Menus   # rebuild + bundle dev menu JSON
python3 tools/reference_ranking.py --write-fixture                       # regenerate golden ranking cases
xcodebuild -scheme MenuMacros -destination 'platform=iOS Simulator,name=<device>' -derivedDataPath build/DerivedData build
./scripts/publish_menus.sh             # release menu data → web/public/menus + app bundle (then git push)
cd web && npm test && npm run build    # website/API tests and build (Next.js 16: read web/AGENTS.md first)
```
Scheme: `MenuMacros`. Tests: Swift Testing (`import Testing`, `@Test`, `#expect`) in `MenuMacrosTests`.

## Non-negotiable rules

1. **Never invent or estimate nutrition numbers.** Menu data comes only from the pipeline JSON.
   Missing optional nutrients display "not published". Don't hand-edit files in `Resources/Menus/`;
   change `data/source/` and rerun the pipeline.
2. **No restaurant brand colours, mascots, or logos/pictures we make ourselves** (no drawn, redrawn, generated or edited
   food images). The chain's name is always plain text. Founder's decision (2026-10-05, nominative use): a chain's **official logo file, unmodified**, may appear small next
   to its name in lists and headers purely to identify the restaurant (`web/lib/mm/logos.ts`, `web/public/logos/`). Never
   recreate or redraw a logo; never recolour, crop or distort one; never use one as the app's own icon or branding or on
   marketing as if the chain were a partner; files come only from the chain's own website (its brand/press page if it has one,
   otherwise the logo file its own site serves, saved byte for byte), with source and terms noted in `web/public/logos/SOURCES.md`;
   take one down the day its owner asks. Founder's decision (2026-10-06): logos are installed even where a chain's site terms
   restrict reuse of its marks (the founder's accepted risk); photos still need the per-chain go-ahead below. Show "Not affiliated with {chain}" where
   the spec says. Founder's decision (2026-10-06, they checked they may): an item may show **the chain's own photo of it**,
   resized only (never cropped in the file, recoloured, retouched or generated), taken only from the chain's own official
   menu/nutrition pages or feeds (never third parties, aggregators or stock), attached only when that page names the item
   exactly, stored in `web/public/menu-images/` with `images.csv` + `web/public/menu-images/SOURCES.md` recording the page;
   fetched politely (robots.txt honoured, never round a block); captioned "Photo from the {chain} website"; never in marketing,
   the share card, the app icon or store screenshots; a chain's photos come down the day it asks (delete its folder + `images.csv`). Founder's decision (2026-10-06, "make sure to add
   them"): photos are installed for every chain even where its terms restrict reuse (the founder's accepted risk); the agent still
   reads the terms and quotes the clause in its report and `docs/IMAGE_TERMS.md`.
3. **No medical claims.** GLP-1 copy is "smaller, protein-first orders". Never call food good/bad/healthy.
4. **Privacy:** no accounts, no personal data off the device (except what the user chooses to send
   through the API: reports, chain requests, support messages). **Never put a Supabase key in the
   app**; the app only calls the Vercel API (`AppConfig.apiBaseURL`). Never run `supabase db push`
   or change production data without the founder's go-ahead; schema changes are new migration files.
   location used on device only, Health is write-only and never used for anything else.
5. **Sample chains are fictional** (`sample: true`): visible in DEBUG only, never in Release.
6. **No new third-party dependencies** without asking the founder (TelemetryDeck in M9 and MapLibre GL for the web Nearby map, approved 2026-10-06, are pre-approved).
7. Use the exact user-facing copy from `docs/SPEC.md` §8, §9, §12 when it's given.
8. Don't change ranking constants, prices, limits or copy without asking; if the spec is unclear or
   wrong, ask, then log the decision in `docs/PROGRESS.md`.

## Code conventions

- Swift 6 language mode, strict concurrency. `@Observable` (not ObservableObject). `@MainActor` for UI state.
- Business logic in `Domain/` and `MenuData/`: pure, no SwiftUI imports, fully unit-tested.
- System access (location, MapKit, HealthKit, StoreKit, notifications, network, analytics, mail)
  behind protocols in `Services/`, injected via `AppEnvironment`; fakes for tests and previews.
- Every view has a `#Preview` using the sample chains and fake services.
- No force unwraps outside `AppConfig` constants; no `print` (use `Logger`); no `DispatchQueue` unless an API demands it.
- Text uses system text styles (Dynamic Type); numbers `.monospacedDigit()`; 44 pt minimum tap targets;
  VoiceOver labels on nutrient rows; works in Dark Mode.
- Keep files small and named after their main type. Folder layout: `docs/SPEC.md` §5.
- Xcode uses synchronized folders: create files on disk in the right folder and they join the target.
- `project.pbxproj`: only minimal, surgical build-setting edits (e.g. `INFOPLIST_KEY_*` privacy
  strings, Swift settings), then build immediately. Never add an Info.plist file. Signing,
  capabilities, schemes and new targets: give the founder click-by-click steps instead.

## How to work

- One milestone per session: `/milestone M<n>`. Plan first, then implement in small steps.
- Write tests first for anything in `Domain/` or `MenuData/`.
- After each step: `./scripts/test.sh --unit`. Before saying a milestone is done: `./scripts/test.sh`,
  run the app in the simulator, check the screens you changed (light + dark, large text), and use `/verify`.
- Ask the `spec-reviewer` agent to compare your work with the spec at the end of each milestone.
- End every milestone by updating `docs/PROGRESS.md` and proposing a commit message. Don't push.
- Things only the founder can do (signing, App Store Connect, capabilities that need an Apple account,
  real data, icons): add them to "Founder to-do" in `docs/PROGRESS.md` and tell them.
