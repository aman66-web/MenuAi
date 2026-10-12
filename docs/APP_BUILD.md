# The iPhone app (free launch): how it's built and shipped

Founder 2026-10-12: "make everything free right now, we dont add the ai features and we ship then after its on the app store then we add
those extra improvements". The first App Store version is **the web app packed inside an iPhone app**, with real iPhone features. It is
not a website in a frame (Apple rejects those under guideline 4.2): the app's pages and data are inside it and it works with no signal.

## How it works

| Part | Where | What it does |
|---|---|---|
| The web app's app build | `web/` with `APP_BUILD=1` (`npm run build:app`) | A static export of the same code as the website: Pro and Pip's AI recipe maker off, no sample data, no service worker |
| Packing | `scripts/build_app_web.sh` → `scripts/pack_app_web.py` | Copies the export into `MenuMacros/Resources/WebApp.bundle/` (git-ignored, about 155 MB) with only what web/app-content.json allows |
| The app | `MenuMacros/` (`MenuMacros.xcodeproj`, bundle `com.amanmarwaha.MenuMacros`) | A full-screen web view that loads the pages from inside the app on `app://menumath/…` (Features/WebApp/) |
| iPhone features | `MenuMacros/Services/`, `Features/WebApp/NativeBridge.swift`, `web/lib/mm/native.ts` | The iPhone's own barcode scanner (VisionKit), location (Core Location, one prompt) and share sheet |
| Live data | the website | When online the app reads newer menus and the taken-down logos list from the live site, and sends reports, restaurant requests and messages to its API (CORS allows only `app://menumath`, `web/lib/cors.ts`). Offline it uses what's packed inside |

What's **inside** the app: every page, the menus of all restaurants, the logos, the Near me branch list, the supermarket lists and
catalogue, the stored Sainsbury's photos and the chains' menu photos (all as web/app-content.json says). Supermarket photos that the
website shows from the shops' own servers still load from those servers when online.

## Decision still open: what goes into the App Store version

`web/app-content.json`. **Food photos: all in** (founder 2026-10-12: "yes i want all the food photos there"). Which supermarkets: all nine until the founder decides.

```json
{ "menuPhotos": true, "shops": ["sainsburys", "asda", "aldi", "lidl", "tesco", "waitrose", "morrisons", "iceland", "marks-and-spencer"] }
```

- `"menuPhotos": false` leaves the chains' food photos out of the app (they're also never requested).
- Removing a shop from `"shops"` leaves its list and catalogue out of the app; it disappears from the app's Groceries.
- The website keeps everything either way. Rebuild (`./scripts/build_app_web.sh`) after changing it.

## Logo safeguards (founder chose "Keep, with safeguards")

1. Logos are small, next to the plain-text name, with "Not affiliated with {chain}" (as before).
2. **Taking a logo down without an app update:** add the chain's id (or `shop:<id>` for a supermarket) to `web/public/logos/hidden.json`,
   commit and deploy the website. The website stops showing it at once; the app stops showing it the next time it's opened with signal.
   Then also remove the logo file and its line as usual (rule 2) so the next app version doesn't carry it.
3. App Review note: docs/STORE.md "Notes for App Review".
4. No logos or photos in the app's icon, name, keywords or screenshots (`web/e2e/store-shots.mjs` hides them all).
5. The app's welcome screen shows chain and shop **names** on its moving wall, not logos (the website keeps the logo wall).

## Steps for Claude on the founder's Mac (this cloud session can't run Xcode)

1. `git pull`, then `./scripts/build_app_web.sh` (needs Node and Python; about a minute).
2. Open `MenuMacros.xcodeproj`. Check that `Resources/WebApp.bundle` appears in the project navigator as **one item** (a bundle) and is
   in the MenuMacros target's "Copy Bundle Resources". If Xcode instead lists its files one by one (flattened), stop and tell the founder:
   the fallback is a "Copy web app" Run Script build phase (`rsync -a --delete "$SRCROOT/MenuMacros/Resources/WebApp.bundle/"
   "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/WebApp.bundle/"`) with the folder kept out of the synchronized group.
3. Build and run the tests: `./scripts/test.sh` (or `xcodebuild test -scheme MenuMacros -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`).
   The Swift in `MenuMacros/Features/WebApp/` and `MenuMacros/Services/` was written without a compiler: fix any Swift 6 concurrency or API
   errors in place, keeping the behaviour, and say what changed.
4. **Spike checks in the simulator** (note the answers in docs/PROGRESS.md):
   - the app opens on "Choose your language" with the Mac's network turned off;
   - Settings, a saved order and the shopping list are still there after quitting and reopening the app (localStorage on `app://`);
   - Safari › Develop › Simulator › the app: `window.isSecureContext` and `!!crypto.subtle` (if false, menus still load, without the
     file check; that's acceptable);
   - with network on, a "Request a restaurant" from Eat out reaches the API (the request's Origin must be `app://menumath`; if WebKit
     sends something else, change `APP_ORIGIN` in `web/lib/cors.ts` to match and deploy the website);
   - Eat out › Near me › Use my location shows one iPhone prompt and then nearby branches (Features › Location in the simulator);
   - a link to a chain's own allergen page opens Safari; "Email instead" opens Mail.
5. On the founder's iPhone (Xcode › Run): Groceries › Scan a barcode opens the iPhone's scanner and finds a product; Share list opens the
   share sheet; an order's Share card shares the picture.

## Steps for the founder (things only you can do)

1. **Decide** which supermarkets go in (web/app-content.json; food photos are in), or tell Claude.
2. **Domain (numbite.co.uk) + Vercel Pro**, and a support email on the domain (Vercel › Project menumacros › Settings › Domains; then set
   `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_SUPPORT_EMAIL`, and redeploy). Build the app with
   `NEXT_PUBLIC_REMOTE_BASE=https://<your-domain> ./scripts/build_app_web.sh` so it talks to the domain.
3. **Read** /privacy, /terms and /support on the live site and confirm every sentence is true.
4. **Register the domains and check the name:** numbite.co.uk (main), numbite.com and numbite.app; then a UK trade mark search for
   "Numbite": gov.uk › "Search for a trade mark" (classes 9 and 42 for apps), and consider filing it.
5. **App Store Connect** (appstoreconnect.apple.com) › Apps › + › New App: iOS, name "Numbite: Calories & Protein" (or your choice),
   primary language English (UK), bundle ID `com.amanmarwaha.MenuMacros`, SKU `numbite-ios`. Then:
   - Pricing and Availability: Free; United Kingdom.
   - App Privacy: answer from docs/STORE.md "App Privacy"; Privacy Policy URL `https://<your-domain>/privacy`.
   - Age Rating: from docs/STORE.md "Age rating".
   - App Information: category Food & Drink, secondary Health & Fitness; Support URL `https://<your-domain>/support`.
   - Version 1.0: description, keywords, promotional text and review notes from docs/STORE.md; screenshots from `web/e2e/shots/store/`.
6. **Xcode** › Product › Archive (scheme MenuMacros, "Any iOS Device") › Distribute App › App Store Connect › Upload. Then in App Store
   Connect › TestFlight, install it on your iPhone and try: first launch with Wi-Fi and data off, a restaurant, an item, Groceries, a
   recipe, Scan a barcode, Near me, Share list.
7. **Submit for Review** with "Manually release this version".

## What comes after approval (updates)

Pro and subscriptions (`PRO_ENABLED`, StoreKit), Pip's AI recipe maker (`AI_RECIPES_ENABLED`, needs an API key and a privacy update),
Apple Health, the photo or shop decisions above, and the native screens of docs/BUILD_PLAN.md if wanted. Each update goes through App Review.
