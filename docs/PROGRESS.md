# Progress

Claude: update this file at the end of every milestone session — tick what's done, note
decisions that differ from the spec (and why), and list known issues. Keep it short.

## Web app (current focus: web first, see docs/WEB_BUILD_PLAN.md)

| Milestone | Status | Notes |
|---|---|---|
| W0 Plan, sample menus for web | done | `web/public/menus-sample/`, `scripts/build_web_samples.sh` |
| W1 Domain core (TypeScript) | not started | |
| W2 Client state + menu store | not started | |
| W3 Shell, onboarding, Home, Search | not started | |
| W4 Chain page, item detail | not started | |
| W5 Order builder | not started | |
| W6 Best for you, paywall, gating | not started | |
| W7 Saved, Today, Settings | not started | |
| W8 Reports, requests, contact, share card | not started | |
| W9 PWA, privacy page, verification | not started | |

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
- 2026-10-05 — Supabase: the founder's free plan allows 2 active projects and both are used (revise,
  readfluent), so the `menumacros` project could not be created yet. Vercel project `menumacros` exists
  (root `web`, linked to aman66-web/MenuAi).
- 2026-10-05 — User-facing name comes from `AppConfig.appName` (currently "Menu Math") — name not final.

## Known issues

- none yet

## Founder to-do (things Claude can't do)

- [ ] Real bundle ID prefix, Team, App Group ID in Xcode signing and `AppConfig.swift`
- [ ] Xcode: iPhone-only destination, iOS 17.0 minimum, capabilities (App Groups, HealthKit, In-App Purchase), shared scheme
- [ ] App Store Connect: app record, subscription group, both products, 7-day trial offer
- [ ] Vercel + Supabase set up (docs/SETUP_VERCEL_SUPABASE.md) → put the URLs in `AppConfig`
- [ ] Supabase: free a slot (pause or delete an unused project) or upgrade to Pro, then ask Claude to create the `menumacros` project and apply the migrations
- [ ] Payments for the web app (Stripe or RevenueCat Web Billing: both add a dependency/account; needs your decision)
- [ ] Domain + support email; Vercel Pro before the site is public
- [ ] Read the live /privacy and /terms pages and confirm every statement is true
- [ ] Real chain data in `data/source/` (keep the two sample folders; release builds use `--no-samples`)
- [ ] App icon and screenshots
