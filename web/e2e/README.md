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
node offline.mjs                                  # stops and restarts the server: real offline (takes ~1.5 min)
```

`prodmode.mjs` is for the **production default** (no sample data): build without `NEXT_PUBLIC_SHOW_SAMPLE_DATA`, start on port 3102
(`BASE=http://localhost:3102 node prodmode.mjs`). It checks the honest empty state and that Pro cannot be unlocked.

Screenshots land in `e2e/shots/` (git-ignored).
