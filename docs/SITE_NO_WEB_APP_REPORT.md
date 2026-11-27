# numbite.com no longer runs the web app (27 November 2026)

Founder's ask: people should use only the phone apps, so nobody can open the web app on the website.
Branch `claude/site-no-web-app`, on top of `claude/site-download-buttons` (the store badges). **Not live.** Both go live together when the founder merges
`claude/site-no-web-app` into `main`.

## What changes on numbite.com

- **Every `/app` and `/app/...` address goes to the homepage's store badges** (`/#get-the-app`) with a **307 temporary redirect**. Browsers don't keep a 307,
  so the redirect can be undone. Any query is kept: `/app/item?chain=nandos&item=x` lands on `/?chain=nandos&item=x#get-the-app`, which shows the
  normal homepage.
- **The switch is Vercel's own `VERCEL=1`.** Vercel sets it when it builds a deployment, production and previews (`web/lib/webAppClosed.ts`, used by
  `web/next.config.ts`). So the redirect is only on the deployed website. Local `npm run dev` and `next start`, the e2e scripts and the store-screenshot
  scripts still open `/app`. The phone apps' static export (`APP_BUILD=1`) has no redirects at all.
- **No website link opens the web app:**
  - Header: "Open app" is now **"Get the app"**, pointing at the homepage badges.
  - Homepage: the "Open the web app" button is gone. The FAQ no longer mentions a web version.
  - Restaurant pages (`/chains/...`): "Open {chain} in Numbite" is now a line, "See the whole {chain} menu in the Numbite app.", plus both badges. The
    per-dish "See the full numbers and a Smart Swap in Numbite" links are gone.
  - Shared list (`/l`) and friend invite (`/f`): the badges, plus "I have Numbite: open the list / add them" (opens the installed app). "Read it in your
    browser" is gone.
  - 404 and error pages: on the website they go to the homepage.
  - The badges are one shared component (`web/app/components/StoreBadges.tsx`), with the same rules as before (`web/public/badges/SOURCES.md`).
- **Service worker and install:**
  - `web/public/sw.js` is now a retiring worker. A browser that had the old one gets it on its next visit; it deletes every cache and unregisters itself.
  - Every website page also removes any old worker and its caches (`web/lib/retireServiceWorker.ts`).
  - The install manifest (`web/app/manifest.ts`) is deleted, so browsers no longer offer "Install" or "Add to Home Screen" as an app.
  - The phone apps never registered a worker, and their packs already leave `sw.js` out (`scripts/pack_app_web.py`), so they are not affected.
- **Privacy and terms (website and Android copy):**
  - They now say the website no longer runs the web app (it was at /app until 27 November 2026).
  - What a former web app user's browser still holds, and that clearing the browser's data for numbite.com removes it.
  - That the website now deletes the old offline copy.
  - The privacy date is **27 November 2026** (`privacyLastUpdatedAndroid` in `web/site.config.ts`).
  - The iPhone app's packed copy keeps its 21 November text word for word. This was checked by building the iPhone export from the old and new code and
    comparing the pages.

## What still works (each checked)

1. **The packed phone apps:** they are built with `APP_BUILD=1`, which has no redirects, and they never use the service worker. The iPhone export's privacy,
   terms, support and 404 pages are identical to before. The only export difference is on two pages the apps never open: the homepage (the pack replaces it)
   and `/f`.
2. **Sign-in, all of `/api`:** both apps open `/api/v1/auth/{google|apple}/start?mode=app&challenge=…` in a browser sheet. Supabase sends it back to
   `/auth/callback?m=app`. Every ending goes to `numbite://auth?code=…` or `numbite://auth?error=…`, never to an `/app` page. Traced on a Vercel-style build:
   - start goes to Supabase, with the callback `?m=app`;
   - cancelled → `numbite://auth?error=cancelled`;
   - cookie run out → `error=expired`;
   - failed exchange → `error=failed`;
   - the success ending is covered by `tests/auth.test.ts`.

   The email code, native Apple, exchange, refresh, sync and the other API routes are JSON under `/api`, which the rule can't match.
3. **Files the apps load:** `/menus`, `/menu-images`, `/recipe-images`, `/grocery-images`, `/groceries`, `/branches`, `/logos` (and `logos/hidden.json`),
   `/app-switches.json`, `/.well-known/*`, `/apple-icon.png`. All answer 200 on the Vercel-style build. The rule matches only the first path segment `app`
   exactly, so `/app-switches.json` and `/apple-icon.png` are safe. (`app-content.json` is a build file in `web/`, not served.)
4. **`/l` and `/f`:** the badges and the installed app, as above. The apps' own handling of these links is unchanged (the iPhone's Universal Links file in
   `.well-known` lists them; Android has no verified app links yet, so there they open this page).
5. **`/privacy`, `/terms`, `/support`, `/chains`:** 200, with no link into `/app`.

## How it was checked

- `npm test`: 187 files passed, 3 skipped (4,237 tests passed, 22 skipped).
  - New `tests/webAppClosed.test.ts`: the rule, matched as the Next server matches it; next.config.ts on Vercel, off Vercel and in the app export; no
    website link to `/app`.
  - New `tests/retireServiceWorker.test.ts`.
  - The service worker tests in `tests/secondPassOffline.test.ts` now test the retiring worker.
- `npm run lint`: 0 errors. 4 warnings, all in e2e scripts this change didn't touch.
- `npm run typecheck`: clean.
- `npm run build`: passes. Without `VERCEL`, `/app` answers 200. With `VERCEL=1`, the routes manifest has the two 307 rules and `next start` answers as above.
- A browser check (Playwright) at 320, 390 and 1280 px on the `VERCEL=1` build:
  - `/app/today` lands on `/#get-the-app`, with the badges on screen.
  - No link into `/app` on the homepage, `/l`, `/f`, `/chains/nandos`, `/privacy`, `/terms`, `/support`, `/chains` or the 404.
  - Axe found no violations; no sideways scroll.
  - Service worker: the old worker was installed with its caches, then upgraded to the retiring one, which removed itself and every cache. A second old
    worker was removed by simply opening a website page.
- e2e scripts updated for the new `/l` and `/f` buttons (`e2e/sharelist.mjs`, `e2e/community-friends.mjs`).

## How to undo

- **All of it:** `git revert` the commit "numbite.com: close the web app" on `main`, then let Vercel deploy. This brings back the links, the offline service
  worker (browsers register it again on their next `/app` visit) and the manifest.
- **Only reopen `/app` quickly:** delete the `redirects()` block in `web/next.config.ts` and deploy. The pages would work again, but without offline use
  and without links to them.

## Preview

The branch's Vercel preview is `https://menumacros-git-claude-site-no-web-app-aman-moneysave.vercel.app` (behind Vercel login, like the other previews).
Try `/app`, `/app/today`, `/l`, `/f`, `/chains/nandos` and `/privacy` there.

## For the founder to decide

1. **Going live:** say when, and merge `claude/site-no-web-app` into `main`. That also brings the store badges branch.
2. **People who used the web app:** they keep their account. Signing in to the iPhone or Android app with the same account (Apple, Google or the same
   email) brings back what syncs: goal, targets and settings, diet and allergies, favourites, saved meals and recipes, shopping lists, store-cupboard
   items, the comparison list and today's log (about the last two days). The rest stays only in that browser, and the website can no longer show it: older
   food diary days, the meal plan, reminders, water and recently viewed dishes. The same goes for everything of anyone who used it signed out. Nothing is
   deleted on our side.
   - Options: leave it (as built); or email the people we can reach. We have no list of web app users, only accounts.
3. **Dish links shared from the apps:** the Truth card's WhatsApp message links to `numbite.com/app/item?chain=…&item=…` (`lib/mm/truth/shareTruth.ts`).
   These now land on the homepage badges.
   - Options: leave it (as built); or send `/app/item?chain=X` to the public restaurant page `/chains/X` (one more redirect rule, small); or change the link
     in the next app builds.
4. **Anyone who added the web app to their Home Screen:** the icon now opens the homepage. They can delete it themselves; we can't remove it for them.
5. **The Android app's next build** will carry the new privacy and terms text (dated 27 November). The iPhone app's copy is unchanged. No App Store or Play
   privacy answer needs changing: the website now collects less, and nothing new.
6. **Small, optional:**
   - The iPhone and Android packs still copy `public/badges` and `public/screens` (homepage files, about 1.2 MB, never shown in the apps). Adding them to
     `ALWAYS_OUT` in `scripts/pack_app_web.py` would leave them out.
   - Other docs still describe the web app at `/app` (`docs/WEB_BUILD_PLAN.md`, `docs/APP_BUILD.md`, `docs/BACKEND.md`). The web app's code stays, because
     both phone apps are built from it.
