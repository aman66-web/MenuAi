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
NEXT_PUBLIC_SHOW_SAMPLE_DATA=1 NEXT_PUBLIC_PRO=1 npm run build && npm start -- -p 3101 &     # samples on; Pro and the paywall on (PRO_ENABLED)
cd e2e
BASE=http://localhost:3101 node smoke.mjs        # onboarding → chain → paywall → Best for you → builder → save/log → settings
node extra.mjs                                    # shared-link onboarding, menus-unreachable error, undo, save-changes, search rules
node a11y.mjs                                     # axe-core on every screen, light and dark (expects 0 violations)
node largetext.mjs                                # no horizontal overflow at 100/150/200% text
node share.mjs                                    # share card downloads as a 1080×1350 PNG
node browse.mjs                                   # Home browse by type + A-Z jump, long-menu search/section chips, filter caution, recent searches
node calories.mjs                                  # chains that publish calories only: badge, filter, "not published", no ordering tools (stubbed chain)
node numbers.mjs                                   # Eat out: find a restaurant by calories, protein, carbs, fat and allergies; the restaurant opens with them applied; numbers file missing; axe, 200% text
node done.mjs                                      # a Done button for the keyboard: in every search box while it is in use, inside Eat out's number boxes; tap, Return key, Tab, clear button beside it, RTL, 200% text, axe
node addfood.mjs                                   # Home's + on a meal opens the Add food sheet: type numbers, a recipe, a restaurant meal or saved meal, a supermarket product by weight (scan too); the entry stays in the meal tapped, Undo, calories-only restaurants left out, RTL, 200% text, axe (needs the test build: a free person gets the paywall)
node listphotos.mjs                                # Shopping list: each product's picture beside it (kept when added, looked up for older items), checked on the way in, taken-down shops, 360 px / 200% text / RTL, axe
node listadd.mjs                                   # Shopping list: 'Add more from {shop}' as the last row of each shop's card and 'Add from another shop' below them; Co-op and typed-only lists; 360 px / 200% text / RTL, axe
node water.mjs                                    # Home's Water section under Today's meals: the small bottle and round +, the Add water sheet (drag the bottle, arrow keys, typed amount, Glass/Bottle shortcuts), Undo, only today counts, the goal in Settings, Clear data, nothing sent, 360 px / 200% text / RTL, axe (the paywall step needs the test build)
node community.mjs                                 # Community, the fifth tab: tab order (Settings is Home's gear, Home's tab stays lit on Settings), the hub's latest three food blogs, the list (search with Done, topic chips, count), an article (title, read time, date, Numbite, Back), unknown id, 360 px / 200% text / RTL, axe
node reminders.mjs                                # Home's Reminders section under Water and /app/reminders: add every day / certain days / every few days, the messages next to a field, the phone's permission asked only on the first save, the exact plan handed to the (faked) iPhone bridge, the Done tick and its reset, Pause, Delete + Undo, the 12 limit, denied and website states, nothing sent to a server, Clear data, 360 px / 200% text / RTL, axe
node map.mjs                                      # Nearby: location, typed postcode/town, filters, list; checks the location never appears in a request
node groceries-photos.mjs                          # grocery photos: stored copy -> shop's picture -> "no photo", credited to the shop; Open Food Facts never asked
node account.mjs                                  # sign-in and sync: email code, two phones syncing through a fake backend that uses the real merge rules, offline, sign out, delete, welcome link, axe
node mapfs.mjs                                    # Nearby map full screen: button, gestures, card, Escape/Back, history, safe areas
node offline.mjs                                  # stops and restarts the server: real offline (takes ~1.5 min)
node shoot.mjs home=/app "chain=/app/chain?id=kfc" # screenshots for review (THEME=light, WIDTH=360, FULL=1, PRO=1)
node brand.mjs                                    # re-render the app icon + social card from web/design/ (after a name change too)
```

`prodmode.mjs` is for the **production default** as it ships for the free launch (no sample data, Pro and Pip's recipe maker off):
build without `NEXT_PUBLIC_SHOW_SAMPLE_DATA` and `NEXT_PUBLIC_PRO`, start on port 3102 (`BASE=http://localhost:3102 node prodmode.mjs`).
It checks that only real chains show, that every feature works with no paywall, that no screen or legal page mentions Pro, subscriptions,
purchases or the AI recipe maker, and the honest empty state (with an empty manifest).

`app-build.mjs` is for the **iPhone app's copy** (the static export packed inside the app), served the way the app serves it:
`npm run build:app && (PORT=3103 node e2e/serve-app.mjs .next-app &) && BASE=http://localhost:3103 node e2e/app-build.mjs`.
**`npm run build:app` also writes its working files into `.next`**, so it breaks a `npm start` server that is running from `.next`: run it
last, never while another suite is running, and build the test copy again before starting the test server.

Screenshots land in `e2e/shots/` (git-ignored).
