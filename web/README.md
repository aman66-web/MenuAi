# Website + API (Next.js on Vercel)

Landing page with waitlist, privacy policy, terms, support form, **the web app at `/app`**, menu data
hosting (`public/menus/`), and the small API the apps use. Contract and security model: `../docs/BACKEND.md`.
First-time setup: `../docs/SETUP_VERCEL_SUPABASE.md`.

This is Next.js 16: read `AGENTS.md` before changing framework code (the bundled docs in
`node_modules/next/dist/docs/` are the reference).

```bash
npm install
cp .env.example .env.local   # fill in values (see the comments)
npm run dev                  # http://localhost:3000
npm test                     # API handler tests (no network or database needed)
npm run build                # production build + type check
```

| Path | What |
|---|---|
| `site.config.ts` | App name, tagline, support email, App Store link |
| `app/(site)/page.tsx` | Landing page (waitlist until `NEXT_PUBLIC_APP_STORE_URL` is set, then an App Store button) |
| `app/(site)/privacy`, `terms`, `support` | Pages Apple requires links to |
| `app/app/**` | **The web app** (screens, `_components`, `_lib`). Chain/item/builder are static shells reading ids from the query string, so they work offline |
| `lib/mm/**` | The web app's domain logic: pure TypeScript with tests (nutrients, ranking, order calculator, targets, search, outbox, menu loading) |
| `public/sw.js` | Service worker: precaches every page shell + its scripts, caches menus, shows `/app/offline` for unknown pages |
| `public/menus-sample/` | FICTIONAL sample chains (`../scripts/build_web_samples.sh`); loaded only when samples are enabled |
| `app/api/v1/*` | App endpoints: reports, chain-requests, support |
| `app/api/waitlist` | Website waitlist |
| `app/api/cron/cleanup` | Daily job (vercel.json) that clears old IP hashes |
| `lib/handlers.ts` | All request logic (pure, tested) |
| `lib/store-supabase.ts` | The only file that talks to Supabase (server-only, secret key) |
| `public/menus/` | Published menu JSON (`../scripts/publish_menus.sh` writes it) |

## The web app

Docs: `../docs/WEB_BUILD_PLAN.md` (what differs from the iPhone spec and why). No third-party dependencies were added.

| Variable | Where | Meaning |
|---|---|---|
| `NEXT_PUBLIC_SHOW_SAMPLE_DATA=1` | Vercel **Preview** (and automatically in `npm run dev`) | Load the fictional sample chains and show the "Pro preview" testing toggle. **Never set on Production** once real menus are published |
| `NEXT_PUBLIC_PRO_PREVIEW=1` | optional | Treat everyone as Pro (testing only) |

Production without either variable shows "Menus are coming soon" and a request-a-chain button until real menu data is
published with `../scripts/publish_menus.sh`.

Browser tests used while building (not in the repo because they need Playwright): onboarding → chain → paywall → builder → save/log
→ settings flow, a real-offline test (server stopped), an axe-core accessibility pass in light and dark, and a text-size
overflow check. Unit tests: `npm test` (domain logic runs against the same golden fixtures as the Python oracle).
