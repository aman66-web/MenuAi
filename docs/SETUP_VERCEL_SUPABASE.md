# Set up Vercel + Supabase (do this first, ~45 minutes)

What you'll have at the end: your website live on Vercel with a working waitlist, privacy policy,
terms and support page; a locked-down Supabase database receiving submissions; and the URLs the
iPhone app needs. Background and the API contract: `docs/BACKEND.md`.

You need: a GitHub account, this repo on your Mac, and Node.js 22+ (`node --version`; install from
nodejs.org if missing).

---

## 1. Put the repo on GitHub (5 min)

Vercel deploys from GitHub. Create a **private** repo on github.com (no README), then in Terminal:

```bash
cd ~/Developer/MenuMacros            # where you unzipped the kit
git init -b main                     # skip if this folder is already a git repo (Xcode-first setup)
git config --global user.name "Your Name"            # once per Mac, if git has never been set up
git config --global user.email "you@example.com"
cd web && npm install && npm test && cd ..   # installs the website's packages; tests should pass
git add -A && git commit -m "Starter kit + website + backend"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2. Create the Supabase project (5 min)

1. Sign up at supabase.com (use "Continue with GitHub").
2. **New project** → name `menumacros` (or your app name) → region **East US (North Virginia)** (closest
   to US users) → generate a strong database password and **save it in your password manager** → Create.
3. Wait ~2 minutes for it to finish setting up.

## 3. Create the tables (5 min)

**Option A: Supabase CLI (recommended, keeps the repo and database in sync)**. Run from the repo's
top folder (the one containing `supabase/`):
```bash
npx supabase login                         # opens the browser once
npx supabase link --project-ref <ref>      # <ref> = the id in your project URL: https://<ref>.supabase.co
                                           # (asks for the database password from step 2)
npx supabase db push                       # applies everything in supabase/migrations/
```

**Option B: no CLI.** Supabase › SQL Editor → paste the contents of each file in `supabase/migrations/`
(oldest first) → Run.

**Then prove it's locked down:** paste `supabase/tests/security_and_constraints.sql` into the SQL Editor
→ Run → you should see `ALL CHECKS PASSED`. (It changes nothing; everything is rolled back.)

## 4. Copy two values from Supabase (2 min)

- **Project URL**: Project Settings › Data API → `https://<ref>.supabase.co`
- **Secret key**: Project Settings › API Keys → create a secret key if there isn't one → copy `sb_secret_…`

The secret key bypasses all security. Only ever paste it into Vercel (next step) or `web/.env.local`.
Never into the iPhone app, a chat, or a committed file.

## 5. Create the Vercel project (10 min)

1. Sign up at vercel.com with GitHub.
2. **Add New → Project** → import your repo.
3. **Root Directory: `web`** (important). Framework: Next.js (detected).
4. **Environment Variables** (generate the two random values with `openssl rand -hex 32` in Terminal):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_SECRET_KEY` | your `sb_secret_…` key |
   | `IP_HASH_SALT` | random value #1 |
   | `CRON_SECRET` | random value #2 |
   | `NEXT_PUBLIC_SUPPORT_EMAIL` | your support address |

   (`CRON_SECRET` is what lets Vercel run the daily cleanup; without it that job is refused.
   `NEXT_PUBLIC_APP_STORE_URL` is optional: add it after launch to swap the waitlist for an App Store button.)

5. **Deploy.** When it finishes, copy the URL Vercel shows (e.g. `https://<something>.vercel.app`), add
   `NEXT_PUBLIC_SITE_URL` = that URL (your domain later), and click **Redeploy**. Every `git push` to
   `main` redeploys automatically from now on.

## 6. Test it (5 min)

1. Open your `*.vercel.app` URL → join the waitlist with your own email.
2. Supabase › Table Editor › `waitlist` → your email is there. ✓
3. In Terminal (replace the URL):
```bash
B=https://<project>.vercel.app
curl -s $B/api/health
curl -s -X POST $B/api/v1/chain-requests -H 'Content-Type: application/json' -d '{"name":"Test chain"}'
curl -s -X POST $B/api/v1/reports -H 'Content-Type: application/json' \
  -d '{"chainId":"test-chain","itemId":"test-item","field":"calories","reportedValue":100,"note":"setup test"}'
```
   Each should answer `{"ok":true}` (health also shows the time) or `{"id":"…"}`; the rows show up in the
   `chain_request_counts` and `open_reports` views. Afterwards delete the test rows from the
   **tables** `waitlist`, `chain_requests` and `number_reports` (Table Editor › tick the rows › Delete;
   views can't be edited).
4. Vercel › Project › Settings › Cron Jobs: `/api/cron/cleanup` should be listed (runs daily).

## 7. Domain and email (15 min, can wait until you've picked the final name)

1. Buy the domain (e.g. `menumath.co` or `getmenumath.com`).
2. Vercel › Project › Settings › Domains → add it and follow the DNS instructions.
3. Change `NEXT_PUBLIC_SITE_URL` to `https://<your-domain>` → Deployments › Redeploy.
4. Set up `support@<your-domain>` (most registrars offer free email forwarding to your Gmail).
5. Update `NEXT_PUBLIC_SUPPORT_EMAIL` → redeploy.
6. Read `/privacy` and `/terms` on the live site and make sure every statement is true for you
   (they're written to match the spec; have a professional review them if you can).

## 8. Tell the app where everything is

The menu URL only works once real menu data is published: add at least one real chain in
`data/source/`, run `./scripts/publish_menus.sh`, commit and push. Until then the app simply uses
its bundled menus (sync is skipped while the URLs are placeholders, and a 404 is treated like
"no update").

In `MenuMacros/App/AppConfig.swift` (Claude creates it in M0; give it these values):

```swift
static let menuBaseURL = URL(string: "https://<your-domain>/menus/")!
static let apiBaseURL = URL(string: "https://<your-domain>/api/v1/")!
static let websiteURL = URL(string: "https://<your-domain>")!
static let privacyPolicyURL = URL(string: "https://<your-domain>/privacy")!
static let supportEmail = "support@<your-domain>"
```

Menu updates later: `./scripts/publish_menus.sh` then `git push`.

## 9. Before the site goes public: plans

- **Vercel Hobby is non-commercial only.** A page promoting a paid app counts as commercial, so upgrade
  the project's team to **Pro ($20/month)** before you share the link in videos.
- **Supabase free** pauses a project after a week with no activity. While building, just press
  **Restore** in the dashboard if that happens. Around launch, consider **Pro ($25/month)** for daily
  backups and no pausing; your waitlist is valuable.

## Optional: let Claude work with them directly

If you connect the **Supabase** and **Vercel** connectors in Claude, Claude can check your tables,
deployments and logs for you. Keep the secret key out of chat either way.

## Checklist

- [ ] Repo on GitHub (private)
- [ ] Supabase project created (East US), password saved
- [ ] Migrations applied; security test prints ALL CHECKS PASSED
- [ ] Vercel project with root `web`, environment variables set (six, plus the App Store URL after launch), deployed
- [ ] Waitlist, chain request and report tested; test rows deleted
- [ ] Cron job listed
- [ ] Domain + support email (when the name is final)
- [ ] Vercel Pro before sharing the site publicly
