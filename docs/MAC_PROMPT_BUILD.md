# Claude Code on your Mac: build, fix and test the iPhone app (paste everything below the line)

HOW TO USE: on your Mac, open Terminal, `cd` into the MenuAi folder, run `claude`, and paste EVERYTHING below the line as one message.
You need Xcode installed (with the iPhone 17 Pro simulator), Node 22 and Python 3. It works on its own branch `mac-build` and never pushes `main`.
It does not touch signing or capabilities: those are your clicks, and it ends with a click-by-click list of them. Bring its final report back to the cloud session.
The Chrome prompt for the database is separate (`docs/CHROME_PROMPT_LAUNCH.md`, already done).

--------------------------------------------------------------------------------------------------------------

You are Claude Code on the founder's Mac, in the repository MenuAi (iPhone app "Numbite", Xcode project MenuMacros.xcodeproj, bundle com.amanmarwaha.MenuMacros). The iPhone app is the web app
packed inside a web view. All its Swift was written WITHOUT a compiler in a cloud session, so your job is to make it build, pass its tests, and run correctly in the iOS Simulator, fixing only what
is broken. Read CLAUDE.md first, then docs/APP_BUILD.md (sections "Steps for Claude on the founder's Mac", "Shared shopping lists", "Reminders (local notifications)").

GROUND RULES
- Work on a new branch `mac-build` from the latest `main`. Never push to `main`. Push only `mac-build`, and only at the end.
- Fix Swift 6 strict-concurrency and API errors in place, keeping behaviour. Do not redesign anything. Do not change user-facing copy, menu data, prices, ranking constants or anything under web/public.
- Do NOT change signing, capabilities, entitlements, schemes or targets, and do not add an Info.plist file. project.pbxproj: only minimal build-setting edits if a step says so. Anything needing the Apple
  account or Xcode capability clicks goes into your final report as click-by-click steps for the founder.
- No new third-party dependencies. No force unwraps (except AppConfig constants), no print (use Logger), no DispatchQueue unless an API demands it.
- Never print, copy or commit a secret (API keys, tokens, the Apple private key). If something asks for one, stop and tell me.
- If a step fails in a way you cannot fix without changing behaviour, stop and tell me exactly what you saw. Do not guess.

STEP 1 - SET UP
1. git checkout main && git pull, then git checkout -b mac-build. Note the commit.
2. Check tools: xcodebuild -version (Xcode 16 or newer expected), node -v (22), python3 --version. In web/ run npm ci.
3. NEXT_PUBLIC_SUPPORT_EMAIL=aman66@hotmail.co.uk ./scripts/build_app_web.sh  (it refuses placeholders; the address is the one the live site shows). Do NOT set NEXT_PUBLIC_COMMUNITY_FRIENDS: the
   Community tables now exist, so Friends stays on. Report the size of MenuMacros/Resources/WebApp.bundle.

STEP 2 - PROJECT CHECK (look, do not change signing)
4. Open MenuMacros.xcodeproj (or use xcodebuild -list). Confirm Resources/WebApp.bundle is ONE item in the MenuMacros target's Copy Bundle Resources, not flattened into files. If flattened, use the
   fallback in docs/APP_BUILD.md (a "Copy web app" Run Script phase) and say so.
5. Confirm the build settings (both Debug and Release): UIUserInterfaceStyle = Light, camera and location usage strings, export compliance, and that PrivacyInfo.xcprivacy is in the target.
   Confirm Config/MenuMacros.entitlements has Sign in with Apple. Report anything missing; do not add capabilities yourself.

STEP 3 - BUILD AND UNIT TESTS
6. Build for the simulator: xcodebuild -scheme MenuMacros -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build/DerivedData build. Fix every error. The files most likely to need
   a touch (concurrency and API): MenuMacros/Features/WebApp/*.swift, MenuMacros/Services/*.swift (AppleSignInService, WebSignInService, BarcodeScanner, LocationService, ShareService,
   NotificationScheduling, ReminderPlanItem, UserNotificationScheduler, ReminderNotificationDelegate, FakeNotificationScheduler), MenuMacros/App/*.swift. Typical fixes: nonisolated markings
   (the app target defaults to MainActor isolation), @Sendable closures, Sendable conformances. Say what you changed and why after each batch.
7. ./scripts/test.sh --unit until it passes (it also runs the pipeline and data checks). The Swift tests are MenuMacrosTests/AppConfigTests, WebAppTests, ReminderNotificationTests,
   SharedListLinkTests and FriendInviteLinkTests. If a test is wrong rather than the code, fix the test and explain. Never skip, delete or weaken a test to make it pass.
8. Then ./scripts/test.sh (full, with UI tests) and report the result.

STEP 4 - RUN IT IN THE SIMULATOR (iPhone 17 Pro) AND CHECK
9. Install and launch. Check and write the answers in docs/PROGRESS.md under a new dated entry:
   a. With the Mac's network OFF, the app opens on the welcome screen ("Get started").
   b. Finish onboarding, save a restaurant order and add a shopping-list item; quit and reopen: they are still there.
   c. Safari > Develop > Simulator > the app: window.isSecureContext and !!crypto.subtle (if false, menus still load without the file check; acceptable, report it).
   d. Network ON: Eat out > "Request a restaurant" reaches the API. The request's Origin must be app://menumath; if WebKit sends something else, change APP_ORIGIN in web/lib/cors.ts to match,
      run the web tests, and tell me (the website must be redeployed).
   e. Eat out > Near me > Use my location: ONE iPhone prompt, then nearby branches (Simulator > Features > Location > a UK location).
   f. A restaurant's allergen link opens Safari; "Email instead" opens Mail.
   g. Reminders: add one two minutes ahead, background the app: a notification appears (simulator supports this); Settings > Clear data cancels it.
   h. Shared list: share a list from the app, then xcrun simctl openurl booted "numbite://l#<code>" (the URL Type must be added first: if the open does nothing, that is the missing founder step,
      not a bug; report it). Also try numbite://f#ABCDEFGH for Friends invite (needs the URL Type too).
   i. Dark mode: turn the simulator to dark appearance: the app stays light (status bar text dark).
10. Take screenshots of the welcome screen, Home, Recipes (open the Occasion list: Christmas is offered until 6 January), a recipe and Groceries; save them in build/screens/ (not committed).

STEP 5 - ARCHIVE DRY RUN (do not upload anything)
11. xcodebuild -scheme MenuMacros -destination 'generic/platform=iOS' -configuration Release -archivePath build/Numbite.xcarchive archive. Report whether it succeeds. If it fails on signing,
    capabilities or provisioning, do NOT change them: copy the exact error into your report.

STEP 6 - FINISH
12. Commit your fixes on mac-build in small commits (message says what and why), update docs/PROGRESS.md and the "Native iPhone app" row, run ./scripts/test.sh --unit once more, and push mac-build.
13. Final report: a table of steps (1-11) with OK / FIXED / STOP and what you saw, the list of Swift files you changed, anything you could not do, and a numbered, click-by-click list of what the
    founder must do next in Xcode and App Store Connect (docs/APP_BUILD.md "Steps for the founder"), including: Associated Domains capability (applinks:numbite.com), URL Type numbite,
    and the real-iPhone checks (barcode scanner, share sheet, Sign in with Apple, Google sign-in, email code, reminders ringing on the lock screen, full-screen map).
