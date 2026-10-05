# Web app build plan (web first, iPhone app later)

The founder chose to ship a **web app first**. It lives in `web/` at `/app`, next to the marketing
site (`/`), and uses the same menu data, the same SPEC rules and the same backend (Vercel + Supabase).
The native iPhone plan (`docs/BUILD_PLAN.md`, M0–M10) stays valid for later: the TypeScript domain code
in `web/lib/mm/` is tested against the same golden fixtures as the Python oracle, so it doubles as a
second reference for the Swift port.

## What is the same as the spec

Everything in SPEC §4 (free vs Pro), §6 (domain maths), §7 (screens), §8 (onboarding copy), §9 (paywall
copy), §12 (data trust), §15 (design), §16 (privacy). Menus are static JSON from the pipeline. **No
accounts; personal data stays in the browser** (`localStorage`); only what the user chooses to send
(reports, chain requests, support messages) goes through `/api/v1/*`.

## What differs on the web (decisions, also logged in PROGRESS.md)

| Spec item | Web version |
|---|---|
| Nearby chains (MapKit) | **Not in v1.** Browsers have no POI search that keeps location on the device. Home always shows "Popular" (all chains A–Z, first 10). Revisit if a privacy-safe option appears. |
| Apple Health | Not available on the web. "Log" saves to the device only. |
| StoreKit subscriptions | **Not wired.** `lib/mm/entitlements.ts` is the seam. In production the paywall is honest ("Pro isn't on the web yet", email capture to the waitlist). Pro can be previewed with `NEXT_PUBLIC_PRO_PREVIEW=1` or the Settings toggle shown in non-production builds. Real payments need a founder decision (new dependency/account). |
| Trial reminder notification | Skipped (depends on payments). |
| TelemetryDeck | Analytics interface only (console in dev, nothing in production) until the founder picks a tool. |
| Offline | Service worker caches the app shell and menus (`public/sw.js`). |
| Share card | Canvas image + Web Share API (download fallback). |
| Menu hosting before real data | `web/public/menus/menus-manifest.json` is a valid manifest with zero chains (lowest allowed `dataVersion`) so clients get a clean 200 instead of a 404; `./scripts/publish_menus.sh` replaces it with the real set. |
| Sample chains "DEBUG only" | Samples load from `/menus-sample/` only when `NEXT_PUBLIC_SHOW_SAMPLE_DATA=1` or the build is not production. Real chains come from `/menus/` (empty until the founder publishes real data). |

## Milestones

| | Scope | Done when |
|---|---|---|
| W0 | Plan, decisions, `web/public/menus-sample/` + `scripts/build_web_samples.sh`, test.sh check | `./scripts/test.sh --skip-ios` passes |
| W1 | `web/lib/mm/` domain: nutrients + formatting, targets, meal budget, ranking, order calculator + naming, search. Vitest incl. every golden case and every sample variation | all golden cases + all variations match |
| W2 | Client stores (settings, favourites, saved, log, outbox), menu store, entitlements, analytics seam | store tests pass |
| W3 | App shell + tab bar, onboarding (§8), Home (§7.2), Search (§7.3) | onboarding → home → search works in a browser |
| W4 | Chain page (§7.4) + item detail (§7.5): sort, filter, tags, source footer, sample badge | free tier fully usable offline |
| W5 | Order builder (§7.6) for component and item lines, save/log/share actions | every sample variation reproduces in the UI |
| W6 | Best for you block (all four modes), paywall (§9), gating at every trigger | gating matrix test passes |
| W7 | Saved (§7.7), Today (§7.8), Settings (§7.9), left-today on Home | log three meals → correct remaining |
| W8 | Report a number, Request a chain, Contact us (outbox), share card | submissions queue offline and send on retry |
| W9 | PWA (manifest, icons, service worker), privacy page update, accessibility pass, spec-reviewer, browser smoke test | `npm test && npm run build` clean; smoke test screenshots reviewed |

## Rules that still apply

CLAUDE.md "Non-negotiable rules" (no invented numbers, no logos/brand colours, no medical claims,
no Supabase key in the browser, no new dependencies without asking, exact copy from SPEC). The web app
adds **no** third-party dependencies.
