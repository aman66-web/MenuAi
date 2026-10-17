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
| iPhone features | `MenuMacros/Services/`, `Features/WebApp/NativeBridge.swift`, `web/lib/mm/native.ts` | The iPhone's own barcode scanner (VisionKit), location (Core Location, one prompt), share sheet and reminder notifications (local, scheduled by the phone: "Reminders (local notifications)" below). On the website and in any web view without the bridge (the Xcode preview shell, Safari) the page opens its own full-screen camera and reads the barcode itself (`web/lib/mm/barcode.ts`, `Groceries/Scanner.tsx`); the web view needs `allowsInlineMediaPlayback` and a camera usage description |
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
   - the app opens on its welcome screen ("Get started") with the Mac's network turned off;
   - Settings, a saved order and the shopping list are still there after quitting and reopening the app (localStorage on `app://`);
   - Safari › Develop › Simulator › the app: `window.isSecureContext` and `!!crypto.subtle` (if false, menus still load, without the
     file check; that's acceptable);
   - with network on, a "Request a restaurant" from Eat out reaches the API (the request's Origin must be `app://menumath`; if WebKit
     sends something else, change `APP_ORIGIN` in `web/lib/cors.ts` to match and deploy the website);
   - Eat out › Near me › Use my location shows one iPhone prompt and then nearby branches (Features › Location in the simulator);
   - a link to a chain's own allergen page opens Safari; "Email instead" opens Mail.
5. On the founder's iPhone (Xcode › Run): Groceries › Scan a barcode opens the iPhone's scanner and finds a product; Share list opens the
   share sheet; an order's Share card shares the picture.
6. Shared lists (15 October 2026, written without a compiler): build and run `MenuMacrosTests/SharedListLinkTests.swift` (fix compile errors in
   `SharedListLink.swift`, `MenuMacrosApp.swift`, `RootView.swift`, `WebAppView.swift`, `AppEnvironment.swift`); then in the simulator, with a list shared
   from the web app, `xcrun simctl openurl booted "numbite://l#<code>"` (add the URL Type first, see "Shared shopping lists" below) must open the shared
   list inside the app, both when the app is running and when it was closed (cold start), and a first-time launch must go through the questions and land on
   the list. `https://numbite.com/l#…` links need the Associated Domains capability and are tested on a real iPhone (a simulator can open them with
   `xcrun simctl openurl booted "https://numbite.com/l#<code>"` only after the app is installed with the capability).

## Steps for the founder (things only you can do)

1. **Decide** which supermarkets go in (web/app-content.json; food photos are in), or tell Claude.
2. **Domain: numbite.com is bought** (12 October 2026, on Vercel, in your name). In Vercel › Project menumacros › Settings › Domains check it
   shows "Valid Configuration" (add `www.numbite.com` redirecting to it). The website and the app use https://numbite.com by default
   (`web/site.config.ts`, `NEXT_PUBLIC_REMOTE_BASE` in `scripts/build_app_web.sh`), so no setting is needed. Still to do: **Vercel Pro**, and a
   support address on the domain (a free forwarding service sends support@numbite.com to your inbox; then set `NEXT_PUBLIC_SUPPORT_EMAIL` and
   redeploy). Optional: numbite.co.uk from a UK registrar (Vercel doesn't sell .uk), added in Vercel › Domains with the DNS records it shows,
   set to redirect to numbite.com.
3. **Read** /privacy, /terms and /support on the live site and confirm every sentence is true.
4. **Check the name:** a UK trade mark search for "Numbite": gov.uk › "Search for a trade mark" (classes 9 and 42 for apps), and consider
   filing it (numbite.com is already yours).
5. **App Store Connect** (appstoreconnect.apple.com) › Apps › + › New App: iOS, name "Numbite: Calories & Protein" (or your choice),
   primary language English (UK), bundle ID `com.amanmarwaha.MenuMacros`, SKU `numbite-ios`. Then:
   - Pricing and Availability: Free; United Kingdom.
   - App Privacy: answer from docs/STORE.md "App Privacy"; Privacy Policy URL `https://numbite.com/privacy`.
   - Age Rating: from docs/STORE.md "Age rating".
   - App Information: category Food & Drink, secondary Health & Fitness; Support URL `https://numbite.com/support`.
   - Version 1.0: description, keywords, promotional text and review notes from docs/STORE.md; screenshots from `web/e2e/shots/store/`.
6. **Xcode** › Product › Archive (scheme MenuMacros, "Any iOS Device") › Distribute App › App Store Connect › Upload. Then in App Store
   Connect › TestFlight, install it on your iPhone and try: first launch with Wi-Fi and data off, a restaurant, an item, Groceries, a
   recipe, Scan a barcode, Near me, Share list.
7. **Submit for Review** with "Manually release this version".

## Shared shopping lists: opening a link in the app (founder steps, 15 October 2026)

Shopping list › Share sends a message with the list and a link, `https://numbite.com/l#<list>` (the list is inside the link after the "#", which no
server ever sees: nothing is stored, no account needed). A friend who opens it sees the website page `/l`: how many things, from which shops, and
"Get Numbite on the App Store" / "I have Numbite: open the list" / "Or read the list in your browser". The Swift that opens the list inside the app is
written (`MenuMacros/Features/WebApp/SharedListLink.swift`, `MenuMacros/App/MenuMacrosApp.swift`, tests in `MenuMacrosTests/SharedListLinkTests.swift`) but
**not compiled here: the Mac session builds it**. Three things only you can do:

1. **Associated Domains** (so a tap on the https link opens the app when it is installed): Xcode › project MenuMacros › target MenuMacros ›
   Signing & Capabilities › + Capability › **Associated Domains** › + › `applinks:numbite.com`. The site already serves the matching file at
   https://numbite.com/.well-known/apple-app-site-association (team S7G6ZHHK59, `com.amanmarwaha.MenuMacros`, path `/l`); after the website deploy,
   check it opens in a browser and shows that JSON (Apple fetches it itself; changes can take a while to reach phones).
2. **URL scheme** (so the page's "I have Numbite: open the list" button works): target MenuMacros › Info › URL Types › + › Identifier
   `com.amanmarwaha.MenuMacros.link`, URL Schemes `numbite`, Role Viewer. (Sign-in with Google already returns on `numbite://auth`, which the sign-in
   sheet handles on its own; the app only opens `numbite://l…` links and ignores every other address.)
3. **The App Store address**: once the app has an App Store page, set `NEXT_PUBLIC_APP_STORE_URL` (Vercel › Project menumacros › Settings › Environment
   Variables, Production, e.g. `https://apps.apple.com/gb/app/numbite/id<number>`) and redeploy. Until then the page says the iPhone app is coming
   soon and offers "View the list" (the list opens in the browser version, which works today). The same variable shows the App Store button on the
   home page.

Check on a real iPhone with the app installed: send yourself a shared list in Messages and tap the link (it should open the app on the list; on a
phone that has never opened Numbite it goes through the questions first and then lands on the list). **What can't be done without a third-party service:**
a friend who doesn't have the app yet goes to the App Store and, after installing, has to tap the link in the message again (or open Numbite › Shopping list ›
"Got a list from a friend?" and paste it): iOS gives an app no way to know which link led to its install. The page says so under "After you've installed it".

**Friend invites use the same two settings (16 October 2026).** Community › Friends › Share invite sends `https://numbite.com/f#<friend code>` (8 characters; the code is after the "#",
which no server sees from the link itself). The website page `/f` says what it is and offers the same three choices as `/l`; on the iPhone the Swift that opens it is in the same
file (`FriendInviteLink` in `MenuMacros/Features/WebApp/SharedListLink.swift`, tests in `MenuMacrosTests/FriendInviteLinkTests.swift`; **not compiled here**) and it opens the packed app's
Friends page with the code filled in (nothing is sent until the person taps Add friend). The Associated Domains setup above already covers it: the site's
`apple-app-site-association` file now lists the path `/f` as well as `/l`, and the `numbite` URL type opens `numbite://f#<code>`. After setting `NEXT_PUBLIC_APP_STORE_URL`, the invite
page offers the App Store button too. As with shopping lists, a friend who installs the app *because of* the invite taps the link again afterwards (or types the code under Community ›
Friends). A first-time visitor goes through the questions first and lands on Friends with the code in its box. Friends and the inbox need the database tables from
`supabase/migrations/20261016120000_community.sql` (applied by the founder in Supabase's SQL editor, docs/BACKEND.md "Community"); until then set `NEXT_PUBLIC_COMMUNITY_FRIENDS=0` for
the build to hide the Friends and Shared with you cards, the Send to a friend button and the tab badge (the food articles stay); the Friends and inbox screens then go back to Community if an old link opens them, nothing asks the Community routes, and the website's invite page says friends aren't switched on yet.

## Reminders (local notifications)

Home has a **Reminders** section (16 October 2026; web side: `web/lib/mm/reminders.ts`, `web/app/app/_lib/reminderSync.ts`). The person makes their own
reminders (a name they type, an optional note, a repeat and one time) and, inside this app, **the iPhone itself rings them** as local notifications.
Nothing leaves the phone: no server, no push, no account, nothing synced (CLAUDE.md rule 4). On the website there is no bridge, so the screens say
reminders ring in the iPhone app. Numbite suggests no medicine, dose, day or time, and the notification says only what the person typed.

**Nothing to switch on in Xcode or at Apple:** local notifications need no capability, entitlement, Info.plist key or usage string (iOS shows its own
fixed "Allow notifications?" prompt). Do not add any. The new Swift files join the target by themselves (synchronized folders); `project.pbxproj` is
not touched.

### How it works

| Part | Where | What it does |
|---|---|---|
| The plan | `web/lib/mm/reminders.ts` `planNotifications` | Works out WHAT rings and WHEN: `{ id, title, body, hour, minute, weekdays?, fireAt? }` per reminder (weekdays in iOS numbers, 1 = Sunday; `fireAt` = the next dates of an "every few days" reminder). At most 60 notifications in all; disabled reminders are not in it |
| The bridge | `web/lib/mm/native.ts` `native.*`, `Features/WebApp/BridgeMessages.swift`, `NativeBridge.swift` | Four messages: `notifications.requestPermission` (reply `{permission}`), `notifications.status` (`{permission}`, never asks), `notifications.syncReminders` with `{ items }` (reply `{done:true}`), `notifications.openSettings` (`{done:true}`). `permission` is `granted`, `denied` or `notDetermined` (the page treats the last as "nothing to report") |
| Checking | `Services/ReminderPlanItem.swift` | The web view's JSON is never trusted: every field is checked (hour 0-23, minute 0-59, weekdays 1-7, id letters/digits/`-`/`_`, date text exactly `YYYY-MM-DDTHH:MM`), a bad entry is ignored, a weekday or date that is wrong refuses its whole reminder, text is cut to 100 (name) and 200 (note) characters, at most 50 entries and 20 dates each, and an `items` that is not a list is ignored altogether (a garbled message never cancels the reminders; an empty list does, on purpose) |
| Scheduling | `Services/UserNotificationScheduler.swift` | Turns the checked plan into at most 60 notifications (a reminder that doesn't fit is left out whole) and applies it |
| Showing | `Services/ReminderNotificationDelegate.swift` | Installed once in `MenuMacrosApp.init()`; without it a reminder that comes due while the app is open shows nothing |
| Fakes | `Services/FakeNotificationScheduler.swift` | `FakeNotificationScheduler` (previews, bridge tests) and `FakeNotificationCenter` (an in-memory notification centre with the system rules that matter, for the scheduler tests) |

### The iOS rules that shape it

- **Permission** is asked once, when the person saves their first reminder (never at launch). After a "no" iOS never asks again, so the page shows its
  line with an "Open Settings" button (`UIApplication.openNotificationSettingsURLString`). Authorized, provisional and ephemeral all count as granted.
  Reminders are scheduled whatever the answer: one made while notifications are off rings if the person switches them on later.
- **Replace everything**: every notification Numbite schedules has an identifier starting `mm.reminder.` (`mm.reminder.<id>.daily`, `.wd<1-7>`, `.at<date>`).
  A plan is applied by adding everything first (an identifier already pending is replaced) and then removing the `mm.reminder.` identifiers that are no
  longer wanted, so there is never a moment with nothing scheduled and the same plan sent twice changes nothing. Notifications already on the lock
  screen for a reminder that no longer exists are removed too (this is how "Clear data" and Delete also clear the lock screen). Plans are applied one at a
  time. The web side sends the whole plan when reminders change, when the app starts and when it comes back to the front.
- **64 pending per app**: the plan stays under 60. Every day = 1, certain days = 1 per weekday, every few days = 1 per date.
- **Repeating** (every day, certain days) uses `UNCalendarNotificationTrigger(repeats: true)` with hour/minute (and weekday); these survive the app being
  closed or force-quit and the phone restarting, and follow the phone's clock and time zone. **Every few days** can't repeat on iOS, so it is a run of
  one-off dates (up to 20, fewer when many reminders share the 60) that the app writes again each time it opens or comes to the front. A person who doesn't
  open Numbite for longer than the last date gets no more rings from that reminder until they do. The add sheet says so under "First day" ("Numbite sets
  these reminders up each time you open it. If you don't open Numbite for a while, this one can stop ringing."), and a reminder the phone has no room for
  at all (more than 60 notifications in all) is marked "Won't ring" on Home and on /app/reminders. When room is freed by leaving whole reminders out, the
  dates cut from the every-few-days runs are given back (shortest run first).
- One-off dates are written on the phone's clock (Gregorian "YYYY-MM-DD", whatever calendar the phone shows) and turned into the phone's own calendar and
  time zone for the trigger; dates already past are dropped (a past one-off can't be scheduled). The zone and calendar are `autoupdatingCurrent` (never the
  `current` snapshot), so a time-zone change while the app is still running is followed; the page also sends the plan again whenever the app comes to the front.
- **Lock-screen text**: the title is the name and the body is the note (or the neutral line). `ReminderPlanItem.clean` turns only real control characters
  (category Cc) and line/paragraph separators into spaces; the invisible joiners and direction marks (category Cf: U+200C, U+200D, U+200E, U+200F) are kept,
  because Persian, Urdu and Indic words and emoji need them (the web side keeps them too).
- **Ordinary notifications**: a Focus, Do Not Disturb or Scheduled Summary the person set up can hold or silence them, and their lock-screen preview
  setting decides whether the name shows. "Time Sensitive" delivery would need a capability that only you can add; it is not used.
- No badge, no actions, no categories: tapping a reminder just opens the app. Sound is the default sound.
- Logging (`Logger`, subsystem = the bundle ID, category `reminders`) writes counts only, never a name or note.

### What the Mac session must check

1. **It compiles** (written without a compiler). Fix any Swift 6 concurrency or API errors in place, keeping the behaviour, and say what changed. The new
   files: `NotificationScheduling.swift`, `ReminderPlanItem.swift`, `UserNotificationScheduler.swift`, `ReminderNotificationDelegate.swift`,
   `FakeNotificationScheduler.swift`; edited: `BridgeMessages.swift`, `NativeBridge.swift`, `AppEnvironment.swift`, `WebAppView.swift`, `MenuMacrosApp.swift`,
   `MenuMacrosTests/WebAppTests.swift` (the `notifications:` argument). Places most likely to need a touch: the `nonisolated` markings on the data types and
   on the delegate (the module's default isolation is the main actor), the `@Sendable` completion handlers in `SystemNotificationCenter`, and the
   delegate's `willPresent`.
2. **Tests**: `MenuMacrosTests/ReminderNotificationTests.swift` (decoding and refusing bad JSON, caps, the notifications a plan makes, replace-by-prefix
   against the in-memory centre, the permission prompt shown once, the bridge messages) and the existing `WebAppTests.swift`. In the Xcode console
   filter by category `reminders` to see "Reminders scheduled: n of m, k old removed" after each plan.
3. **On a real iPhone** (notification sound and the lock screen can't be checked in the simulator):
   - Add a reminder one minute ahead with the app **in the background**: it rings at that minute with the name as the title and the note (or the neutral
     "Tap to open Numbite" line) as the text; tapping it opens the app.
   - Add one a minute ahead and **stay in the app**: a banner with sound appears (the delegate), and it is in Notification Center afterwards.
   - **Deny** the permission (the first prompt, or later in Settings › Numbite › Notifications): Home and Reminders show "Notifications are off for Numbite..."
     with **Open Settings**, which opens Numbite's notification settings; after switching them on and coming back the line goes away.
   - Pause and delete a reminder: it stops ringing. **Settings › Clear data on this device** cancels every reminder and clears their rings from the lock screen.
   - Every day, certain days and every few days (start today, a minute ahead): each rings when it should; two reminders at the same minute both ring.
   - **Restart the phone** with a daily reminder a few minutes ahead and don't open Numbite: it still rings after the restart (repeating triggers persist).
   - Change the time zone (Settings › General › Date & Time, off "Set Automatically"): a daily 08:00 follows the phone's clock. Do it once **with the app
     left running** in the background (no relaunch), bring it to the front, and check an every-few-days reminder is still at its local time.
   - Give a reminder a Persian or Urdu name with a zero-width joiner (e.g. می‌خواهم) and a family emoji: the lock screen shows them unchanged.
4. Note the answers in docs/PROGRESS.md.

### Founder steps

None in Xcode, App Store Connect or the Apple Developer site for this feature. Try it on your iPhone once the Mac session has built it (list above).
The App Privacy answers don't change (reminders never leave the phone); the age-rating and review-note lines for reminders are in docs/STORE.md.

## What comes after approval (updates)

Pro and subscriptions (`PRO_ENABLED`, StoreKit), Pip's AI recipe maker (`AI_RECIPES_ENABLED`, needs an API key and a privacy update),
Apple Health, the photo or shop decisions above, and the native screens of docs/BUILD_PLAN.md if wanted. Each update goes through App Review.

## What goes inside the app: the three switches (web/app-content.json)

- `menuPhotos` (default true): the chains' own item photos (91 MB of the app). `false` leaves them out and shrinks the app by about 56%.
- `appLogos` (default true): the chains' and supermarkets' own logo files. `false` leaves them out (cuisine icons and plain shop names show
  instead). **App Review 5.2.1** (third-party trademarks and copyrighted material used without permission) is the biggest rejection risk
  found in the 14 October 2026 guideline review; photos and logos are in only because of the founder's accepted-risk decisions (CLAUDE.md rule 2).
- `shops`: which supermarkets' product lists are packed in.

After changing a switch: `NEXT_PUBLIC_SUPPORT_EMAIL=<the address the live site shows> ./scripts/build_app_web.sh`, which refuses to run without a real
contact address and fails if a placeholder ends up inside the app.
