# Claude desktop: build, upload and resubmit Numbite 1.0 (build 4) (paste everything below the line)

HOW TO USE: on your Mac, open a NEW chat in Claude desktop with access to your Mac turned on. Be signed in to App Store Connect in your browser and to Xcode with your
Apple account. Paste EVERYTHING below the line. You authorised this on 31 October ("do it all for me"): it builds, tests, archives, uploads build 4, swaps it onto the
rejected submission, posts the reply to App Review and resubmits. It stops and asks you if anything unexpected appears. Bring its final report back to the cloud session.

--------------------------------------------------------------------------------------------------------------

You are Claude desktop on the founder's Mac with access to the computer, Terminal, Xcode and the founder's browser. The founder (Aman) has authorised you to finish the
App Store resubmission of their iPhone app Numbite end to end. Do ONLY what is written, in order, and report after each step.

BACKGROUND (enough to do the job; the full story is in the repo's docs/PROGRESS.md, entry 2026-10-31):
- Numbite is a free UK calories/protein app: the web app in web/ (Next.js) packed inside a SwiftUI/WKWebView app. Repo folder MenuAi on this Mac (GitHub
  aman66-web/MenuAi). Xcode project MenuMacros.xcodeproj, scheme MenuMacros, bundle ID com.amanmarwaha.MenuMacros, team S7G6ZHHK59 (CLARIFO DEVELOPERS LTD).
- Apple rejected version 1.0 build 3 on 30 October 2026 under Guideline 1.4.1 (Safety: Physical Harm): no citations for the health information (the suggested daily
  calories, protein, carbs and fat). Submission ID 396dfb5d-7738-4aa0-ac84-6e93d16747d4.
- The fix is now on `main`: a "Where these numbers come from" screen that cites three sources with links (Mifflin-St Jeor 1990 on PubMed, NHS "Understanding calories",
  ISSN protein position stand 2017) and says which starting points are Numbite's own. It is linked beside Settings > Daily targets, the GLP-1 goal note, the targets
  step of onboarding and Settings > About. The build number in the project is already 4 (version stays 1.0). Nothing else changed.

GROUND RULES
- Never change code, settings, signing, capabilities or App Store Connect fields other than what a step says. Never push to git. Never delete anything except
  build/ folders and Xcode DerivedData if disk space is short.
- Never print, copy or type a password, key or token. If a sign-in, two-factor code, CAPTCHA, payment, licence agreement or any prompt you did not expect appears,
  STOP and ask the founder to handle it, then continue.
- If a test or build fails, stop and report the exact error. Do not try to fix the app.
- The reply to Apple below is the only text you send to Apple. Do not add to it.

STEP 1 - GET THE CODE
  cd to the MenuAi folder. `git status` (if there are uncommitted changes, do NOT discard them: note them in your report and use `git stash -u` only if `git pull` refuses;
  say so). `git checkout main && git pull`. Confirm the latest commits mention "Build 4" and "1.4.1". Check `grep -n "CURRENT_PROJECT_VERSION" MenuMacros.xcodeproj/project.pbxproj`
  shows 4 twice. `df -h /`: at least 6 GB free; if less, delete only build/DerivedData, build/*.xcarchive older than build 3's, and ~/Library/Developer/Xcode/DerivedData/MenuMacros-*.

STEP 2 - PACK THE WEB APP AND TEST
  `NEXT_PUBLIC_SUPPORT_EMAIL=aman66@hotmail.co.uk ./scripts/build_app_web.sh` (report the size of MenuMacros/Resources/WebApp.bundle).
  `./scripts/test.sh --unit` must pass (website tests and the Swift tests).

STEP 3 - CHECK THE FIX IN THE SIMULATOR (iPhone 17 Pro)
  `xcodebuild -scheme MenuMacros -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build/DerivedData build`, install and launch it (erase the simulator's
  Numbite first if it is there, so onboarding runs). In onboarding go to "Your daily targets" (Skip the questions is fine) and check the "Where these numbers come from" link
  opens a sheet listing three sources with links. Finish onboarding. Open the gear (Settings) > Daily targets > "Where these numbers come from": same sheet. Tap one source link:
  Safari must open on that page (PubMed, NHS or PMC). Settings > About > "Where these numbers come from" opens the page. Take screenshots of the sheet and the page into
  build/screens/ (not committed). Also open the app on an iPad simulator (iPad Air 11-inch (M3) if installed; Apple reviewed on one) and check the same sheet opens and reads well.

STEP 4 - ARCHIVE AND UPLOAD
  `xcodebuild -scheme MenuMacros -destination 'generic/platform=iOS' -configuration Release -archivePath build/Numbite-build4.xcarchive -allowProvisioningUpdates archive`.
  Confirm in the archive's Info.plist: CFBundleShortVersionString 1.0, CFBundleVersion 4.
  Upload it: in Xcode, Window > Organizer > Archives > the new Numbite 1.0 (4) archive > Distribute App > App Store Connect > Upload, accept the defaults (automatic signing).
  If your tools cannot click this, ask the founder to click Distribute App themselves and wait for them. Report "Upload successful" or the exact error.

STEP 5 - WAIT FOR PROCESSING
  In App Store Connect > Apps > Numbite: Calories & Protein > TestFlight (or the version page's Build section), wait until build 1.0 (4) shows as processed (no "Processing").
  This can take 5-30 minutes; check every few minutes. If it says "Missing Compliance", answer the export question exactly as for build 3 (the app uses no encryption beyond
  Apple's own; ITSAppUsesNonExemptEncryption is NO, so normally nothing is asked).

STEP 6 - SWAP THE BUILD ON THE REJECTED SUBMISSION
  App Store Connect > Numbite > App Review (or "View App Review Issues & Messages") > the submission of October 18. In "Items Submitted", the iOS App 1.0 row > Edit (or open the
  iOS 1.0 version page). In the Build section remove build 3 and add build 1.0 (4). Save. Do not change any other field (description, screenshots, privacy, age rating,
  review notes, release option: it stays "Manually release this version").

STEP 7 - REPLY TO APP REVIEW (paste exactly, nothing added)
  On the submission page, under Apple's message, "Reply to App Review" (or reply in the Messages thread), paste:

  Hello, and thank you for the review. In build 4 the suggested daily targets now come with their sources. In Settings > Daily targets (the screen in your screenshot), next to the GLP-1 goal note, on the targets step when the app is first opened, and in Settings > About there is a "Where these numbers come from" link. It opens a screen that lists each source with a link: the Mifflin-St Jeor equation for resting energy expenditure (American Journal of Clinical Nutrition, 1990, on PubMed), the NHS page "Understanding calories", and the International Society of Sports Nutrition position stand on protein and exercise (2017). Where a starting point is Numbite's own rather than taken from a source, the screen says so. Every suggested number can be changed by the person, and the app states that it does not give medical advice. Thank you.

  Send it.

STEP 8 - RESUBMIT
  Click "Resubmit to App Review" (or "Add for Review" then "Submit for Review" if the page shows those). Confirm the status changes to "Waiting for Review". Release stays manual.

STEP 9 - REPORT
  A table of steps 1-8 with OK / STOPPED and what you saw (sizes, test counts, build number in the archive, upload result, final status), the paths of the screenshots, and
  anything the founder had to do by hand. Add a dated line to docs/PROGRESS.md ONLY if the founder asks; do not commit.
