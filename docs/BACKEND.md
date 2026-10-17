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
(The web app sends `source: "web"` and `appVersion: "web 1.0"`; the iPhone app sends `source: "app"`.)
`{ "message": "…", "email": "optional@example.com", "source": "app", "appVersion": "1.0 (12)" }` → 201.
Message 5–4,000 chars; email optional (needed only if the user wants a reply).

### Accounts and sync (optional; docs/ACCOUNTS_SYNC.md)

Sign-in is Supabase Auth behind our own API: the app and the website never talk to Supabase, and the keys stay on the server. All answer
`Cache-Control: no-store`. The iPhone app's pages (`app://menumath`) may call all of them (CORS allows `GET, POST, PUT, DELETE` and the
`Authorization` header, only for that origin) and keep the session they are given, sent as `Authorization: Bearer <access token>`; the website
uses two http-only cookies (`nb_at` on `/api/v1`, `nb_rt` on `/api/v1/auth`) and, for anything that changes data, the request's `Origin` must be
this site.

| Route | What it does |
|---|---|
| `POST /api/v1/auth/apple` `{ idToken, nonce? }` | Native Sign in with Apple: Apple's identity token from the iPhone's own sheet → `{ session }` |
| `GET /api/v1/auth/google/start`, `/apple/start` `?mode=web&next=/app/...` or `?mode=app&challenge=<S256>` | Starts Google/Apple in the browser (PKCE cookie `nb_flow`), 302 to Supabase |
| `GET /auth/callback` (outside `/api`) | Supabase's return address (on its Redirect URLs list). Web: sets the session cookies, 302 to `next?signin=ok`. App: 302 to `numbite://auth?code=<sealed one-time code>` |
| `POST /api/v1/auth/exchange` `{ code, verifier }` | The app swaps the one-time code (AES-GCM sealed, 2 minutes, bound to its PKCE challenge) for `{ session }` |
| `POST /api/v1/auth/email/start` `{ email }` | Emails a 6-digit code (Resend via Supabase SMTP); the same answer for every address |
| `POST /api/v1/auth/email/verify` `{ email, code, mode }` | `mode "web"`: cookies, `{ user }`; `mode "token"` (app only): `{ session }` |
| `POST /api/v1/auth/refresh` `{ refreshToken }` | The app renews its session |
| `GET /api/v1/auth/session` | Who is signed in (renews the website's cookies when the access token has run out): `{ user }` or `{ user: null }` |
| `POST /api/v1/auth/signout` | Ends the session and clears the cookies |
| `DELETE /api/v1/account` `{ confirm: true }` | Deletes the account; the database cascade removes every `user_data` row in the same step |
| `GET /api/v1/sync` | Every store the person has synced: `{ stores: { saved: <state>, ... } }` |
| `PUT /api/v1/sync/<store>` `{ state }` | Merges the device's copy into the stored one (rules in `web/lib/mm/syncMerge.ts`, shared with the browser) and returns the merged state |

A `session` is `{ accessToken, refreshToken, expiresAt, user: { id, email } }`. Stores: `settings` (one value, newest write wins) and
`favorites`, `saved`, `log`, `shopping`, `savedRecipes`, `myRecipes`, `cupboard`, `compare` (items by id with the time each was last changed,
plus deletions kept 90 days). Limits: 2,000 items and about 900 KB per store, 16 KB per item; the log syncs only entries from the last two days.
Rate limits are in memory per server instance (like Pip's recipe limiter): email codes 3 per address and 8 per caller per 10 minutes, code
guesses 6 per address and 15 per caller, sign-in starts 30, sync 300 per person per 10 minutes. No new environment variables: the sealed code's
key is derived from `SUPABASE_SECRET_KEY`.

### Community (friends and shopping lists sent to a friend; founder 16 October 2026)

Community is the one place that needs an account (docs/ACCOUNTS_SYNC.md for how sign-in works). Everything below needs a signed-in caller (cookie or
`Authorization: Bearer`); without one every route answers `401 { "error": "unauthorized" }` before it reads anything. The iPhone app's pages may call all of
them (the same CORS as the sync routes). All answer `Cache-Control: no-store`. Code: `web/lib/community/` (pure handlers behind a `CommunityStore` port, tested in
`tests/community.test.ts`), `web/lib/store-supabase-community.ts` (the Supabase adapter), `web/app/api/v1/community/*` (thin routes).

**Community data is separate from sync.** It lives in its own tables, is never in `user_data`, never in `SYNC_STORES`, and never in the browser's synced stores
(tests/community.test.ts fails if that changes). The app keeps at most a small local cache of the last friend list and inbox count for offline display.

**What other people see.** Only a username. Never an email, a user id or a friend code (other than the code a person chose to share). Every id in these
routes is the id of the *row that connects two people* (a friendship, an inbox item, a block), never a person: `friendId` means **the friendship row's id**
(`friends[].id`, `incoming[].id`, `outgoing[].id`), `listId` is an inbox item's id and `blockId` a block's id. Every handler loads that row and checks the caller is
a party to it, so a stranger's id is answered exactly like an id that doesn't exist (`404 not_found`).

**Errors** are `{ "error": "<code>", "message": "<English fallback>", ...extras }`. The app shows its own translated text chosen by `error` (and `reason`);
`message` is only a fallback for logs and for tools. `400 invalid_request` (the body isn't in the expected shape, with `issues`), `400 invalid_json`, `413 too_large`
(body over 16 KB), `401 unauthorized`, `429 rate_limited`, `500 server_error`.

| Route | What it does |
|---|---|
| `GET /api/v1/community/me` | My profile (`null` until I choose a username) and the badge numbers: `{ ok, profile: null \| { username, friendCode, createdAt }, counts: { unread, friendRequests } }`. Cheap (two counts): this is what the tab badge polls |
| `PUT /api/v1/community/me` `{ username }` | Choose a username, once. Makes the friend code. 201 `{ ok, profile }` |
| `GET /api/v1/community/friends` | `{ ok, friends, incoming, outgoing, limits: { maxFriends } }`, each entry `{ id, username, createdAt }` (`id` = friendship id). Friends A to Z; requests newest first |
| `POST /api/v1/community/friends/request` `{ code }` | Ask for a friendship with the owner of a friend code (typed any way: case, spaces and hyphens ignored) |
| `POST /api/v1/community/friends/respond` `{ id, accept }` | Accept or decline a request waiting for me (`id` from `incoming`) |
| `DELETE /api/v1/community/friends/{id}` | Remove a friend, take back a request I made, or turn down one made to me |
| `GET /api/v1/community/blocks` | The people I blocked: `{ ok, blocks: [{ id, username, createdAt }] }` |
| `POST /api/v1/community/blocks` `{ friendId }` or `{ listId }` | Block the person behind a friend, a request (either way) or an inbox item |
| `DELETE /api/v1/community/blocks/{id}` | Unblock. They are not friends again; they'd have to be asked for with their code |
| `POST /api/v1/community/report` `{ friendId \| listId \| blockId, reason, note?, block? }` | Report a person or a list they sent; `block: true` also blocks (after the report is saved) |
| `POST /api/v1/community/send-list` `{ friendId, payload }` | Send a shopping list to a friend |
| `GET /api/v1/community/inbox` | My inbox: `{ ok, items: [{ id, from: { username }, itemCount, payload, createdAt, readAt, expiresAt }], unread }`, newest first, at most 100 |
| `POST /api/v1/community/inbox/{id}/read` | Mark read (safe to repeat) |
| `DELETE /api/v1/community/inbox/{id}` | Delete one item |

**Usernames** (`web/lib/community/username.ts`: ONE function used by the API and the app, `validateUsername`; `checkUsernameShape` is the cheap no-word-list part).
3 to 20 characters of `a-z 0-9 _ .`, stored lower case (the API lower-cases and trims, and drops one leading `@`), starting and ending with a letter or digit,
never two `.`/`_` in a row. Reserved names (anything that could pass for us: `numbite`, `admin`, `support`, `moderator`, `staff`... also with look-alikes and
separators) and a small blocklist of abusive words (also disguised: `0/o`, `1/l/i`, `3/e`, `4/a`, `5/s`, `7/t`, `8/b`, `@`, `$`, separators, stretched letters; short
words only count as a whole part of the name, so `class`, `cumin`, `sussex` and `grapes` are fine) are refused. `400 invalid_username` has
`reason`: `empty | too_short | too_long | characters | edges | repeats | unavailable` (reserved and blocked are both `unavailable`: we never say which, or which word).
`409 username_taken`, `409 username_set` (already chosen; there is no change-username route). A person can try 10 times an hour.

**Friend codes** (`web/lib/community/friendCode.ts`): 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0 O 1 I L`), generated on the server with crypto
randomness, unique. Shown as `ABCD-EFGH`. The invite link is `https://numbite.com/f#<CODE>` (and `numbite://f#<CODE>`): the code sits after the `#`, so the link itself never
sends it to a server. `parseFriendCode` / `codeFromPasted` tidy what a person typed or pasted exactly as the API does.

**`POST friends/request`.** `201 { ok, status: "requested", id, username }` for a new request (`username` is the owner of the code, whom you were given the code by).
`200` with `status: "requested"` and the existing `id` when you had already asked (nothing changes), or `status: "friends"` when they had already asked you (that counts as a yes from
both). **Every other outcome is the same answer:** `404 { "error": "cannot_add", "message": "We couldn't add that code. Check it and try again." }` for a code that is unknown,
badly typed, your own, belongs to someone who blocked you or whom you blocked, is already your friend, **turned your request down in the last 30 days**, or already has 100 requests waiting:
same body, same status, the same database work. Nothing reveals which. Other refusals don't depend on the code: `409 no_username` (choose one first), `409 request_limit` (50 requests waiting),
`409 friend_limit` (you have 200 friends), `429 daily_limit` (20 friend-code tries a day, right or wrong: the tally is in the database, so a restart of the server, taking a request back or typing wrong codes gives
nothing back), `429 rate_limited` (too many in 10 minutes). There are no searches by username or email anywhere.

**`POST friends/respond`.** `200 { ok, status: "accepted" | "declined" }`; `404 not_found` if the request isn't waiting for *you* (your own requests, answered ones and strangers' all look alike);
`409 friend_limit` when *you* already have 200 friends and `409 cannot_accept` ("We couldn't accept that request. Try again later.") when the other person is full or the row changed meanwhile (it is not for you to know
how many friends someone else has). **Declining keeps the row, as `declined`, for 30 days** (the daily cron deletes it; no screen and no list ever shows it), so the person who was turned down can't ask again at
once; they get the neutral `cannot_add`, and taking the request back is not a way round it (`DELETE friends/{id}` answers `404` for a declined row, and a `DELETE` by the person a request was made *to* counts as declining it). The person who declined can still add the other: their old row makes way for the new request.

**Blocking** removes the friendship and every list between the two, in both directions, and hides each from the other: no request, no send, no listing. The blocked person is
never told; their view is the same as a removed friend. To keep evidence, **report first, or send `block: true` with the report** (the report copies the usernames and, for a
list, the code and the words typed into it, because the list itself is deleted by the block).

**Reports.** `reason`: `abusive_username | abusive_list | spam | harassment | impersonation | other`; `note` is optional, tidied and at most 500 whole characters (`400` beyond). Exactly one
of `friendId` (a friend, or a request made **to** the reporter: never a request the reporter made, so holding a stranger's friend code gives no way to report or block them), `listId` (the reporter must be
the *recipient*), `blockId`. `201 { ok, blocked }`. 10 reports a day (`429 daily_limit`, counted in the database). One open report per reporter, person and list: a second one while it is open adds nothing and
still answers `201`, and `block: true` still blocks. Reports survive the deletion of either account (see "The database").

**Shopping lists.** `payload` is the share-link code of `web/lib/mm/shareList.ts` (what `encodeEntries` makes; version 1, 6-character check, at most 6,000 characters and 100 lines): shop products
by id or barcode with a quantity, and typed-in words; **never a price, name or number of a product**. The server reads it with the same `decodePayload` the app uses, **then writes it again from
what it understood** (`encodeEntries`), so anything tucked into the code besides those references is dropped and the stored text is always well-formed; what the recipient gets in `payload` is
that re-written code (open it with `decodePayload`, exactly like a shared link; the app looks up names, pictures and prices itself). `itemCount` is the number of distinct lines. Typed words are
checked for strong abusive words (British food names such as "spotted dick" or "faggots" are fine) and are always shown as text, never run. `400 invalid_list` has `reason`:
`empty | version | cut | unreadable | too_large | unsuitable`. `201 { ok, id, sentTo, itemCount }`. Only to an accepted friend: a request still waiting, a stranger's friendship, a friend
who removed or blocked you and an id that doesn't exist all answer `404 not_found`. `409 inbox_full` when the friend already has 50 unread lists (the database refuses the 51st even when several arrive together) **or you have sent that friend 10 lists in the last day**, whether or not they
opened or deleted them, so a refusal tells the sender nothing about what the friend did. `429 daily_limit` after 30 lists in a day. A list waits 30 days (`expiresAt`);
expired lists are never shown or counted and the daily cleanup (`/api/cron/cleanup`) deletes them.

**Limits.** The server's in-memory limiter (per server instance, like the other routes) is only a quick first line: it starts again with every cold start. The three **daily** limits are kept in the
database (`community_attempts`: a row per friend-code try, list sent and report made, which nobody but the daily cron deletes, so taking a request back or the friend deleting a list gives nothing back).
It counts first (a person over the limit adds no rows), writes its own row, then counts again with that row in, so requests that arrive together can't all get through. The three **caps** that must hold under a
race (50 unread lists, 100 requests waiting, 200 friends) are also triggers in the migration, which take a per-person lock; the API checks them first and says something kind.

| Limit | Value | Answer |
|---|---|---|
| Friends | 200 (a trigger refuses the 201st answer) | `409 friend_limit` / `cannot_accept` |
| Friend-code tries (right or wrong) | 20 a day (database) | `429 daily_limit` |
| Requests waiting (made by me) | 50 | `409 request_limit` |
| Requests waiting for one person | 100 (a trigger refuses the 101st) | `404 cannot_add` |
| Lists sent | 30 a day, and 10 a day to one friend (database) | `429 daily_limit` / `409 inbox_full` |
| Unread in one inbox | 50 (a trigger refuses the 51st) | `409 inbox_full` |
| List size | 6,000 characters, 100 lines | `400 invalid_list` |
| Reports | 10 a day (database) | `429 daily_limit` |
| Username tries | 10 an hour | `429 rate_limited` |
| Reads / other writes | 300 / 120 per 10 minutes | `429 rate_limited` |

`GET friends` is bounded too: never declined rows, newest first, at most 500 rows (200 friends + 100 waiting + 50 asked fit with room to spare), so the project's row limit (`max_rows = 1000`) can never cut a list short.

**The database** (`supabase/migrations/20261016120000_community.sql`, test `supabase/tests/community.sql`): `community_profiles`, `friendships`, `community_blocks`, `community_reports`,
`community_lists`, `community_attempts` and the view `open_community_reports`, plus three trigger functions for the caps. Same security model as `user_data`: RLS on with no policies, nothing for
`anon`/`authenticated`, only the API (secret key) reads or writes. Every reference to `auth.users` is `ON DELETE CASCADE`, so **"Delete my account" removes the person's profile, friendships, blocks, lists (sent or
received) and tallies in the same step** with no extra code. **Reports are the one exception**: `community_reports.reporter` and `.reported` are `ON DELETE SET NULL`, so the report stays (it already
copies both usernames, the reason, the note and the words of a reported list) and deleting an account can't wipe a report about it. The daily cron deletes a report that is no longer open a year after it was made;
an open one stays until you close it. The migration is applied by the founder in Supabase's SQL editor (never by `supabase db push`); until it is, the Community routes answer `500`, the daily cleanup
skips Community (each Community step reports `null` in its answer and the rest still runs) and nothing else is affected.

**The daily cleanup** (`/api/cron/cleanup`) also deletes expired inbox lists, tallies older than 2 days, declined requests older than 30 days and closed reports older than a year, and answers with how many
reports are open (`openReports`, so the Vercel cron log shows it). **Optional daily nudge:** if the three server-only variables `RESEND_API_KEY`, `REPORT_ALERT_TO` and `REPORT_ALERT_FROM` are set in Vercel,
the cron emails you a **count only** (never a name or any words from a report) every day while any report is open (`web/lib/reportAlert.ts`; plain `fetch` to Resend, no package). Without them nothing is sent
and the weekly/daily check below is a calendar habit.

### Removing someone
Do **not** delete the person's account to remove them: that lets the same Apple, Google or email sign-in make a fresh account with a new username and no history. Instead:
1. Table Editor › `open_community_reports`: copy the `reported` user ID (it is empty if that person already deleted their account; the copied username is still there) and set the report's `status` to `actioned`.
2. **Ban the user**: Authentication › Users › the person › Ban user (forever; the API equivalent is `auth.admin.updateUserById(id, { ban_duration: '876000h' })`). A banned identity can't sign in or refresh
   its session, and it stays on record so it can't register again. *Not verified against the live project:* an access token the person already holds may keep working until it expires (up to an hour); check on
   first use that their Community calls stop, and say so if they don't.
3. Take them out of everyone's lists (SQL Editor; the profile row is left so the username stays taken):
   `delete from public.friendships where requester = '<id>' or addressee = '<id>'; delete from public.community_lists where sender = '<id>' or recipient = '<id>';`

### Website-only
- `POST /api/waitlist` `{ "email", "source"?, "website"? }` — answers `{"ok": true}` for any valid email,
  whether or not it was already on the list (so nobody can test which addresses are signed up);
  400 for an invalid email, 429 after 5 sign-ups an hour from one caller. `source` comes from `?ref=` or
  `utm_source=` on the landing-page link, e.g. `https://<domain>/?ref=tiktok`.
- `GET /api/health` → `{"ok": true, "time": "<ISO date>"}` (uptime checks; doesn't touch the database).
- `GET /api/v1/recipe` → `{"enabled": true|false}` (whether `ANTHROPIC_API_KEY` is set).
- `POST /api/v1/recipe` — Pip's recipe maker (web app; the iPhone app can use it later). Body: `{ shop, meal, servings (1-6), target
  {kcal, protein?, carbsMax?, fatMax?}, diet {vegetarianOnly?, veganOnly?, pescatarianOnly?, halalOnly?, noPork?, noBeef?, avoidAllergens?}, wish (≤100 chars),
  pantry [{key, label, unit, product, kcal, protein, carbs, fat, drained?}] }` (the browser builds the pantry from the shop's published list;
  the server keeps only pantry kinds the diet allows). → 200 `{ recipe: {name, blurb, servings, minutes, ingredients [{key, amount, role}],
  method[], extras[]} }`; the app works out every number from the product labels. 400 bad body, 403 not from our own pages (Origin), 422 not
  enough ingredients for the diet, 429 too many (5 per 10 minutes, 25 a day per caller, in memory per server instance), 502 no usable recipe,
  503 not switched on. Model: Claude Haiku 5.5 (`web/lib/recipeAi.ts`, founder's choice), medium effort, structured output.
  Nothing is stored. Cost: about a penny or two per recipe; set a monthly spend limit in the Anthropic console. The recipe maker is a Pro feature in the app;
  until payments exist there is no server-verified Pro, so the endpoint relies on the Origin check and the rate limits (add an entitlement check with payments).

### Rate limits (per caller per hour)
Reports 30 · chain requests 30 · support 5 · waitlist 5. Constants: `web/lib/handlers.ts`.

## Database (Supabase)

Tables (all in `public`, see the migration for every column and constraint):
`waitlist`, `number_reports` (status `open | fixed | rejected | duplicate`), `chain_requests`,
`support_messages` (status `open | answered | closed`), `user_data` (sync) and, for Community, `community_profiles`, `friendships`, `community_blocks`,
`community_reports`, `community_lists` and `community_attempts`. Views for you: `open_reports` (oldest first, with `hours_open`), `chain_request_counts` (votes per normalised name) and
`open_community_reports` (see the weekly routine).

Change the schema only with a new file in `supabase/migrations/` (`supabase migration new <name>`),
never by clicking in the dashboard, so the repo stays the source of truth. Apply with `supabase db push`.

## Your weekly routine (10 minutes)

- **Reports** (target: 48 hours): Table Editor › `open_reports`. Check the source, fix the CSV, run
  `./scripts/publish_menus.sh`, push, then set the report's `status` to `fixed` (or `rejected`),
  `resolved_at` to now, and a short `founder_note`. Photos: Storage › `report-photos`.
- **Community reports** (**every day**, and act within 24 hours: Apple expects objectionable-content reports to be acted on that fast; put a daily calendar reminder in, or set the optional alert variables above):
  Table Editor › `open_community_reports` (oldest first; usernames written out, the reason, the note and, for a reported list, `list_text` with the words typed into it). Decide: nothing to do, or act
  (see "Removing someone": ban, don't delete). Set the report's `status` to `actioned` or `dismissed` (`resolved_at`, `founder_note` are yours to fill). Closed reports are deleted by the daily cron a year after they were made.
- **Chain requests**: `chain_request_counts` decides which chains to add next.
- **Support**: `support_messages` where `status = 'open'`; reply by email, mark `answered`.
- **Waitlist**: on launch day, Table Editor › `waitlist` › Export to CSV, send the one launch email
  (that's all the site promises), then delete the rows. Delete any address sooner if someone asks.
  **Rows with `source = 'web-app-pro'`** signed up from the web app's Pro screen: keep them until Pro is ready on the web,
  send them one email then, and delete them. Don't delete them with the iPhone launch batch.

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
- `supabase/tests/user_data.sql` (prints `ALL USER_DATA CHECKS PASSED`) and `supabase/tests/community.sql` (prints `ALL COMMUNITY CHECKS PASSED`): the same, for sync and for Community, and
  that deleting an account removes everything of the person. Each runs in one transaction that is rolled back, so it is safe against the live database.
- `COMMUNITY_TEST_PG=host:port/scratchdb npx vitest run tests/communityAdapter.test.ts` runs the Supabase adapter and the handlers against a real scratch Postgres that has the migration applied
  (skipped when the variable is unset; it empties the Community tables and refuses a database whose name lacks "scratch" or "test"). A bare Postgres first needs
  `web/tests/helpers/scratch-supabase-stub.sql` (the roles and `auth.users` that Supabase provides).
