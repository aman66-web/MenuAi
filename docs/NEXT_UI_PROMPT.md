# Prompt: finish the UI of the web app (run this in the Mac terminal session)

Paste this into Claude Code running in `~/MenuAi` (branch `claude/menumacros-kit`), or just say: "git pull, then read docs/NEXT_UI_PROMPT.md and do it".

---

You are finishing the UI of Menu Math (working name, `AppConfig.appName`), a web app for UK people who count calories or protein: full macros for every item at popular restaurant chains (free), plus "Best for you" ranked orders and an order builder (Pro). The web app lives in `web/` (Next.js 16, React 19, Tailwind v4) at `/app`; the data is built by `tools/build_menus.py` from `data/source/` into `web/public/menus/`. It currently has 72 real UK chains (about 12,900 items) plus two fictional sample chains.

## First, read (in this order, then stop reading and start working)
1. `CLAUDE.md` (non-negotiable rules), `docs/PROGRESS.md` (state and decisions log: read the last five decisions carefully), `web/AGENTS.md`
   (this Next.js has breaking changes: read the relevant page in `web/node_modules/next/dist/docs/` before writing Next-specific code).
2. `docs/WEB_BUILD_PLAN.md`, the part of `docs/SPEC.md` a screen cites, `docs/UK_DATA_STATUS.md` (what is thin or limited in the data), `web/e2e/README.md`.
3. The design language is in `web/app/globals.css` ("ember": black base with a warm glow, glass cards, one sun-coloured pill per screen, Plus Jakarta Sans + Playfair italic accents, light and dark). Keep it. Components: `web/app/app/_components/`.

## Ground rules (these override your own ideas)
- **Never invent or estimate nutrition numbers** and never edit `web/public/menus/` by hand: change `data/source/` and run `./scripts/publish_menus.sh --web-only`.
- **Do not change copy that `docs/SPEC.md` gives exactly, ranking constants, prices or limits** (CLAUDE.md rule 8). If you think copy should change, list it in `docs/PROGRESS.md` under "Flagged for the founder" and leave the text alone. New copy that the spec doesn't cover is fine: British spelling, plain words, no medical claims, never call food good/bad/healthy.
- **No restaurant brand colours, mascots or logos we draw ourselves, no food photos.** Logos and item photos are NOT installed: every chain's terms (11 of 11 checked, quotes in `docs/IMAGE_TERMS.md`) forbid reuse without written permission, and the founder decided to keep the conservative option. The mechanisms (`web/lib/mm/logos.ts`, `ItemPhoto.tsx`, `images.csv`) stay; do not install anything into `web/public/logos/` or `web/public/menu-images/`, and make sure every screen looks complete and good with NO photos and NO logos.
- **No new dependencies** without asking me. No accounts, no analytics beyond the existing interface, **never put a Supabase key in client code or commit any secret**. Do not run `supabase db push` or touch production data.
- Work on branch `claude/menumacros-kit` (the cloud session is paused while you work). Commit small and push after each finished step. Never force-push. Do not open a pull request.
- Text sizes use the existing scale; numbers are `app-numbers` (tabular); tap targets at least 44 px; VoiceOver/aria labels on nutrient rows; Dark Mode and light both work; works at 200% text size with no horizontal scroll at 360 px wide.

## Set up and verify the baseline
```bash
cd web && npm install && npm test && npx tsc --noEmit && npm run lint
NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 npm run build && npm start -- -p 3101   # production build: the service worker only exists here
```
Browser tests live in `web/e2e/` and need Playwright outside `package.json` (see its README): `cd web/e2e && npm init -y && npm i playwright-core axe-core`, then
`BASE=http://localhost:3101 CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node smoke.mjs` (also `extra`, `a11y`, `largetext`, `share`, `offline`; `prodmode` needs a build WITHOUT `NEXT_PUBLIC_SHOW_SAMPLE_DATA`).
Everything passes today (smoke 22, extra 9, a11y 0 violations, offline 13). Keep it that way and add checks for what you build. Take screenshots with Playwright at 390x844 (and 360 wide), dark and light, and LOOK at them.

## The work (in this order; finish and push each before the next)

### 1. Make the app good with 72 chains and long menus (the real data exposed these)
- **Home** (`app/app/page.tsx`): "Popular" then "More restaurants" A to Z. Add a way to browse by type using the manifest's `cuisine` (Burgers, Pizza, Coffee, Chicken, Mexican, Italian, Asian, Bakery, Pubs and so on: derive the groups from the data, merge near-duplicates sensibly, never invent a cuisine), as horizontally scrolling chips that filter the list. Add an A-to-Z jump (letters) if it helps on a phone. A search box at the top that goes to the Search tab. Show the honest count ("72 UK restaurants").
- **Chain page** (`chain/ChainScreen.tsx`): some menus have 400-670 items (Puccino's 654, Coffee #1 598, Zizzi 429). Add: a sticky row of category chips that jump to sections, a search-within-this-menu field, collapsible sections or windowed rendering so it stays smooth on an older phone, sticky "Best for you" call to action, the chain's `note` shown prominently near the top (it is a limit of the data and users must see it), the source and "checked on" date, and the "Not affiliated with {chain}" line (keep what exists). Items that are not `rankable` (drinks, sauces, parts) should read as such without clutter.
- **Search** (`search/page.tsx`): uses the compact index (`menus-search.json`, 758 KB). Check typing speed on a throttled CPU, grouping (chains first, then items), highlight of the match, recent searches kept locally, and the empty and "we don't cover this yet" states. Search must not feel slow while the index loads: show a skeleton.
- **Item page**: with no photo it must look finished. Make the hero card carry the item beautifully (name, serving, big kcal, protein/carbs/fat, salt etc.), with the "not published" rows honest. Where an item notes that values exclude something (the chain's `note`), show it. Keep the share, save, log, customise actions.
- **Filters**: the "no pork / no beef / vegetarian" preferences only know what a chain's guide states. Where a filter is on, show one short line explaining "We only know what each restaurant publishes, so this can't promise a dish is pork-free" (calm, not alarming; halal users care). Put it where the filter is set and where results are filtered.
- **Performance and size**: menus are 5 MB across 72 files. Check that the first screen loads only the manifest, a chain loads only its own file, the offline warm-up stays capped (`MAX_WARM_CHAINS`), and the service worker still behaves. Measure with Lighthouse in Chrome DevTools (mobile) and fix what is cheap: target Performance 90+, Accessibility 100.

### 2. Finish the rest of the screens
Walk every screen as a first-time user on a phone, then as a returning user, writing down anything clumsy and fixing it: onboarding (welcome), Today (progress ring, log), Saved, Settings (and `settings/numbers`), the paywall, the builder, Best for you, empty and error states, loading skeletons, the offline page, the share card. Look for: inconsistent spacing, text that wraps badly, buttons below 44 px, missing focus rings, flashes of unstyled content, anything that jumps when data arrives, tab bar overlapping content at the bottom (add bottom padding where needed), keyboard covering inputs on iOS Safari.
Add small, tasteful motion (the `.rise` entrance exists; respect `prefers-reduced-motion`) and haptic-free polish: pressed states, smooth sheet transitions.

### 3. The app's own identity (this is ours, not a restaurant's)
- The placeholder `M` icon (`web/public/icons/`, `web/app/icon.png`, `apple-icon.png`, `manifest.webmanifest`) should become a proper original icon: simple, bold, readable at 16 px, using the "sun" gradient from `globals.css`; no food photos, no restaurant references. Produce SVG source plus the PNG sizes the manifest needs (192, 512, maskable, 180 apple-touch, favicon). Show me the result in a screenshot.
- Open Graph / social image for the marketing site (`app/(site)/`), made from our own design.
- Update the marketing site (`app/(site)/page.tsx`) with the true numbers ("72 UK restaurants", "about 13,000 items") **without changing wording the spec fixes**; keep it honest: "from each restaurant's own published nutrition information".

### 4. Quality gates (do not skip)
- `npm test`, `npx tsc --noEmit`, `npm run lint`, production build, then all e2e scripts above, plus a new e2e for Home browse-by-type, in-menu search and category chips. Add unit tests for any pure logic you add in `web/lib/mm/` (for example the cuisine grouping).
- axe: 0 violations in light and dark on every screen. No horizontal overflow at 100/150/200% text. Dark-mode contrast: muted text meets WCAG AA.
- Update `docs/PROGRESS.md` (what you did, decisions, "Flagged for the founder" for copy you didn't change) and `docs/WEB_BUILD_PLAN.md` if behaviour changed.

## Definition of done
Every screen reviewed on 390x844 and 360 wide in both themes with screenshots you actually looked at; all checks green; pushed to `claude/menumacros-kit`; and a final message to me, under 200 words, listing what changed, what you chose not to do and why, and anything you need from me. If something is ambiguous, ask me one short question rather than guessing, but keep going on the parts that don't depend on the answer.
