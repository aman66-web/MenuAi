# Website + API (Next.js on Vercel)

Landing page with waitlist, privacy policy, terms, support form, menu data hosting (`public/menus/`),
and the small API the iPhone app uses. Contract and security model: `../docs/BACKEND.md`.
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
| `app/page.tsx` | Landing page (waitlist until `NEXT_PUBLIC_APP_STORE_URL` is set, then an App Store button) |
| `app/privacy`, `app/terms`, `app/support` | Pages Apple requires links to |
| `app/api/v1/*` | App endpoints: reports, chain-requests, support |
| `app/api/waitlist` | Website waitlist |
| `app/api/cron/cleanup` | Daily job (vercel.json) that clears old IP hashes |
| `lib/handlers.ts` | All request logic (pure, tested) |
| `lib/store-supabase.ts` | The only file that talks to Supabase (server-only, secret key) |
| `public/menus/` | Published menu JSON (`../scripts/publish_menus.sh` writes it) |
