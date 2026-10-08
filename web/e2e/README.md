# Browser tests for the web app

These drive the real app in Chromium (Playwright) the way a person would. They are what verified the web app while it
was built; they are **not** part of `npm test` because they need Playwright and a Chromium, which are not project
dependencies (CLAUDE.md: ask before adding dependencies). Install them locally, outside `package.json`:

```bash
cd web/e2e
npm init -y && npm i playwright-core axe-core        # local to this folder (git-ignored)
export CHROMIUM_PATH=/path/to/chromium                # optional: omit if Playwright's own browser is installed
```

Run against a **production build** (the service worker only exists in production builds):

```bash
cd web
NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 npm run build && npm start -- -p 3101 &     # samples on: fictional chains + Pro preview toggle
cd e2e
BASE=http://localhost:3101 node smoke.mjs        # onboarding → chain → paywall → Best for you → builder → save/log → settings
node extra.mjs                                    # shared-link onboarding, menus-unreachable error, undo, save-changes, search rules
node a11y.mjs                                     # axe-core on every screen, light and dark (expects 0 violations)
node largetext.mjs                                # no horizontal overflow at 100/150/200% text
node share.mjs                                    # share card downloads as a 1080×1350 PNG
node browse.mjs                                   # Home browse by type + A-Z jump, long-menu search/section chips, filter caution, recent searches
node calories.mjs                                  # chains that publish calories only: badge, filter, "not published", no ordering tools (stubbed chain)
node map.mjs                                      # Nearby: location, typed postcode/town, filters, list; checks the location never appears in a request
node groceries-photos.mjs                          # grocery photos: stored copy -> shop's picture -> Open Food Facts -> "no photo", each credited correctly
node offline.mjs                                  # stops and restarts the server: real offline (takes ~1.5 min)
node shoot.mjs home=/app "chain=/app/chain?id=kfc" # screenshots for review (THEME=light, WIDTH=360, FULL=1, PRO=1)
node brand.mjs                                    # re-render the app icon + social card from web/design/ (after a name change too)
```

`prodmode.mjs` is for the **production default** (no sample data): build without `NEXT_PUBLIC_SHOW_SAMPLE_DATA`, start on port 3102
(`BASE=http://localhost:3102 node prodmode.mjs`). It checks that only real chains show, the honest empty state (with an empty manifest), and that Pro cannot be unlocked.

Screenshots land in `e2e/shots/` (git-ignored).
