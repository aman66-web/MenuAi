# Backend: Vercel + Supabase

The iPhone app stays account-free and works offline. Around it, two hosted services do four jobs:

| Job | Where | Who uses it |
|---|---|---|
| Website: landing page + waitlist, privacy policy, terms, support | Vercel (`web/`, Next.js) | Visitors from your videos; Apple's required URLs |
| Menu data hosting (`/menus/menus-manifest.json`, `/menus/chain-<id>.json`) | Vercel CDN (`web/public/menus/`) | The app's menu sync (docs/DATA.md) |
| API for "Report a number", "Request a chain", support messages, waitlist | Vercel functions (`web/app/api/`) | The app and the website |
| Database + photo storage | Supabase (`supabase/migrations/`) | Only the Vercel API (secret key) and you (dashboard) |

```
iPhone app ──GET /menus/*──────────────▶ Vercel CDN (static JSON)
iPhone app ──anonymous usage counts────▶ TelemetryDeck (analytics; no personal data)
iPhone app ──POST /api/v1/*──┐
Website ─────POST /api/*─────┴─────────▶ Vercel functions ──secret key──▶ Supabase (Postgres + Storage)
You ─────────────────────────────────────────────────────── Supabase dashboard (Table Editor / SQL)
```

## Security model (non-negotiable)

- **The app never talks to Supabase and never contains a Supabase key.** For its own data it only calls
  the Vercel API (besides Apple's services and the anonymous analytics SDK, TelemetryDeck).
- The Supabase **secret key** (`sb_secret_…`) lives only in Vercel's environment variables. It bypasses
  all database rules; if it leaks, roll it in Supabase › Project Settings › API Keys.
- Every table has Row Level Security on with **no policies**, and anon/authenticated privileges are
  revoked, so the public (publishable/anon) key can read or write nothing. `supabase/tests/security_and_constraints.sql`
  proves it (safe to run on production; it rolls back).
- The report-photo bucket is private. The app uploads via a 2-hour signed URL the API hands out.
- Spam control: input validation (zod + database constraints), a honeypot field on web forms, and
  per-caller rate limits using a salted SHA-256 of the IP address. Those hashes are cleared after 30
  days by a daily Vercel Cron job (`/api/cron/cleanup`).
- No user accounts, no tracking. The privacy policy (`web/app/privacy/page.tsx`) describes exactly this.

## API contract (for the iOS app)

Base URL: `AppConfig.apiBaseURL` = `https://<your-domain>/api/v1/` (with the trailing slash; build
request URLs relative to it: `reports`, `chain-requests`, `support`). JSON in, JSON out.
Send `Content-Type: application/json`. Bodies over 16 KB (UTF-8 bytes) are rejected.

| Status | Body | App behaviour |
|---|---|---|
| 200 / 201 | `{"ok": true}` or `{"id": …}` | Mark sent; show the confirmation copy |
| 400 | `{"error": "invalid_request", "issues": [{"path", "message"}]}` or `{"error": "invalid_json"}` | Bug in the app: log it, don't retry |
| 413 | `{"error": "too_large"}` | Don't retry |
| 429 | `{"error": "rate_limited"}` | Keep queued; retry later (SPEC §12 outbox rules) |
| 500 / network error | `{"error": "server_error"}` | Keep queued; retry later (SPEC §12 outbox rules) |

### POST /api/v1/reports — "Report a number"

```json
{ "chainId": "bowl-and-co", "itemId": "chicken-bowl", "itemName": "Chicken bowl",
  "field": "calories", "shownValue": 655, "reportedValue": 640,
  "note": "Board says 640", "dataVersion": 20261201100000, "appVersion": "1.0 (12)",
  "photoContentType": "image/jpeg" }
```
- `field`: `calories | protein | carbs | fat | saturatedFat | sodium | sugar | fiber | other`.
- `chainId`, `itemId`: ids from the menu JSON. Values 0–99,999. `note` ≤ 1,000 chars. All but
  `chainId`, `itemId`, `field` are optional.
- `photoContentType` (optional, `image/jpeg` | `image/png` | `image/heic`): include only if the user
  attached a photo. The response then contains:
```json
{ "id": "uuid", "photoUpload": { "url": "https://…/storage/v1/object/upload/sign/report-photos/2026-12/uuid.jpg?token=…",
  "method": "PUT", "headers": { "Content-Type": "image/jpeg" }, "expiresInSeconds": 7200 } }
```
  Upload the image bytes with exactly that method and header (resize to ≤ 1,600 px, JPEG quality ~0.7,
  must be < 5 MB). If the upload fails, the report is still saved; don't resend the report.

### POST /api/v1/chain-requests — "Request a chain"
`{ "name": "Raising Cane's", "appVersion": "1.0 (12)" }` → 201. Name 2–80 chars.

### POST /api/v1/support — in-app "Contact us"
`{ "message": "…", "email": "optional@example.com", "source": "app", "appVersion": "1.0 (12)" }` → 201.
Message 5–4,000 chars; email optional (needed only if the user wants a reply).

### Website-only
- `POST /api/waitlist` `{ "email", "source"?, "website"? }` — answers `{"ok": true}` for any valid email,
  whether or not it was already on the list (so nobody can test which addresses are signed up);
  400 for an invalid email, 429 after 5 sign-ups an hour from one caller. `source` comes from `?ref=` or
  `utm_source=` on the landing-page link, e.g. `https://<domain>/?ref=tiktok`.
- `GET /api/health` → `{"ok": true, "time": "<ISO date>"}` (uptime checks; doesn't touch the database).

### Rate limits (per caller per hour)
Reports 30 · chain requests 30 · support 5 · waitlist 5. Constants: `web/lib/handlers.ts`.

## Database (Supabase)

Tables (all in `public`, see the migration for every column and constraint):
`waitlist`, `number_reports` (status `open | fixed | rejected | duplicate`), `chain_requests`,
`support_messages` (status `open | answered | closed`). Views for you: `open_reports` (oldest first,
with `hours_open`) and `chain_request_counts` (votes per normalised name).

Change the schema only with a new file in `supabase/migrations/` (`supabase migration new <name>`),
never by clicking in the dashboard, so the repo stays the source of truth. Apply with `supabase db push`.

## Your weekly routine (10 minutes)

- **Reports** (target: 48 hours): Table Editor › `open_reports`. Check the source, fix the CSV, run
  `./scripts/publish_menus.sh`, push, then set the report's `status` to `fixed` (or `rejected`),
  `resolved_at` to now, and a short `founder_note`. Photos: Storage › `report-photos`.
- **Chain requests**: `chain_request_counts` decides which chains to add next.
- **Support**: `support_messages` where `status = 'open'`; reply by email, mark `answered`.
- **Waitlist**: on launch day, Table Editor › `waitlist` › Export to CSV, send the one launch email
  (that's all the site promises), then delete the rows. Delete any address sooner if someone asks.

## Plans and costs

| Service | Free tier | When to pay |
|---|---|---|
| Vercel | Hobby: free, **non-commercial use only** | A site promoting a paid app is commercial: switch to **Pro ($20/month)** before the site is public. |
| Supabase | Free: 2 projects, 500 MB database, 1 GB storage, 5 GB egress; **paused after 1 week of inactivity** | Free is fine for building. Consider **Pro ($25/month)** at launch for daily backups and no pausing. |

Prices from vercel.com/pricing and supabase.com/pricing (checked 5 October 2026). Update the running-cost
line in the blueprint when you upgrade.

## Tests

- `cd web && npm test` — API handler tests (validation, honeypot, rate limits, photo upload, cron auth).
- `cd web && npm run build` — type-checks and builds the site.
- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_and_constraints.sql` (or paste into
  the SQL Editor) — lockdown and constraints; prints `ALL CHECKS PASSED`.
