# See the app on your iPhone through Xcode (preview shell)

**What this is.** The real native iPhone app (BUILD_PLAN M0–M10) is not started yet; today the product is the web app
in `web/`. This is a tiny stand-in app, `MenuMacrosPreview`: an Xcode project whose only job is to open the
deployed web app full screen. Because it loads the live website, **every update we push appears the next time you
open it (or pull down to refresh)**, with nothing to reinstall. It has no accounts, no keys and no third-party code.
The real app (`MenuMacros/`, M0) replaces it later; nothing here is reused except what you learn about signing.

**What it is not.** It is not the App Store app, it doesn't work offline beyond what the website's own cache does, and
with a free Apple ID the install **expires after 7 days** (plug in and press Run again to renew; a paid Apple Developer
account, 99 USD/year, which you need for the App Store anyway, makes it last a year and enables TestFlight).

**Zero-setup alternative (do this too, it takes one minute).** On the iPhone, open Safari → your production address
(step 1) → Share → **Add to Home Screen**. Same live updates, no Xcode, never expires. It is the same web app.

---

## Step 1 — A public address that always shows the newest build (you, Vercel dashboard)

Right now Vercel's *Production* deployment is an old commit and newer pushes are *Previews*, which sit behind your
Vercel login (a phone app can't use them). Pick one:

- **Recommended:** Vercel → project **menumacros** → **Settings → Git** → set **Production Branch** to
  `claude/menumacros-kit` (in newer dashboards: **Settings → Environments → Production → Branch Tracking**).
  Every push then updates the public address. Environment variables for Production are already set; the sample
  chains stay hidden in Production (`NEXT_PUBLIC_SHOW_SAMPLE_DATA` is Preview-only, keep it that way).
- **Or one-off:** Deployments → open the newest one → **⋯ → Promote to Production**. Repeat when you want newer data.

Then copy the project's production domain (Project → **Domains**, e.g. `menumacros.vercel.app`). Your address is
`https://<that domain>/app`. Open it in Safari on your phone once to check it loads.

Notes: Vercel's free (Hobby) plan is meant for personal, non-commercial use; before the site is public/advertised
move to Pro (already on your to-do). The Production site is reachable by anyone who knows the address.

## Step 2 — Create the Xcode project (you, about 3 minutes)

1. Install **Xcode** from the Mac App Store if you haven't (large download), open it once and accept the licence.
2. **File → New → Project…** → **iOS** tab → **App** → Next.
3. Product Name: `MenuMacrosPreview`. Team: your Apple ID (if "None": **Add an Account…**, sign in; it appears as
   "Your Name (Personal Team)"). Organization Identifier: `com.<yourname>` (anything unique, lowercase).
   Interface: **SwiftUI**. Language: **Swift**. Storage: **None**. Untick *Include Tests*. Next.
4. Save it inside the repo's **`ios`** folder (`MenuAi/ios`; choose it in the file dialog, untick *Create Git
   repository*). Xcode creates `MenuAi/ios/MenuMacrosPreview/` containing `MenuMacrosPreview.xcodeproj`.

## Step 3 — Put our files in (Claude on your Mac, or you by hand)

Ask Claude Code on your Mac:

> Read docs/XCODE_PREVIEW_SHELL.md. Copy the four files in ios/PreviewSources/ into
> ios/MenuMacrosPreview/MenuMacrosPreview/, deleting the template's MenuMacrosPreviewApp.swift and ContentView.swift
> first. Set my site address in PreviewConfig.swift to <your address from step 1>. Then in the target build settings
> set iOS Deployment Target 17.0 and Supported Destinations to iPhone only (minimal surgical pbxproj edits, build
> straight after), add INFOPLIST_KEY_NSLocationWhenInUseUsageDescription = "Shows restaurants near you on the map.
> Your location stays on this phone." and build for an iPhone simulator with xcodebuild. Fix any compile errors
> (these files were written without a compiler). Don't touch signing.

(By hand: in Finder copy the four files over; delete the two template files in Xcode (Move to Trash); edit the address
in `PreviewConfig.swift`. Xcode 16+ picks up files from the folder automatically.)

## Step 4 — Run it on your iPhone (you)

1. In Xcode click the project (blue icon, top of the left list) → target **MenuMacrosPreview** → **Signing &
   Capabilities** → tick **Automatically manage signing**, Team = your Apple ID. If it says the bundle identifier is
   taken, add a few letters to it (e.g. `com.<yourname>.menumacrospreview2`).
2. **General** tab → *Minimum Deployments* iOS 17.0; *Supported Destinations*: remove iPad/Mac/Vision.
3. iPhone: **Settings → Privacy & Security → Developer Mode → On** (restarts the phone). Plug it in with the cable,
   unlock it, tap **Trust** on the phone.
4. Xcode top bar: choose your iPhone as the run destination → press **▶ Run**.
5. First launch says "Untrusted Developer": on the phone **Settings → General → VPN & Device Management** → your Apple
   ID → **Trust**. Press Run again. (Later you can run wirelessly: Xcode → Window → Devices and Simulators → tick
   *Connect via network*.)

The app opens the web app full screen. Pull down to refresh; swipe from the left edge to go back; links to other
websites open in Safari.

## Seeing updates while you're away

Claude's pushes to `claude/menumacros-kit` (with Step 1 set up) go live within a couple of minutes. Open the app, or
pull down to refresh; the web app's offline cache updates itself on the next online visit, so if you still see the
old version close the app fully and reopen it once. After 7 days with a free Apple ID the icon stops opening: plug in
and press Run once. The Add to Home Screen copy has no such limit.

## For the Mac session (Claude Code)

CLAUDE.md applies: no new dependencies, minimal pbxproj edits, don't touch signing/capabilities, no `print`. These
four files are written without a compiler (Swift 6, iOS 17): build them and fix whatever the compiler says.
Check on a simulator: the page fills the screen under the notch/Dynamic Island and above the home bar (the web app
handles safe areas itself via `viewport-fit=cover`), pull-to-refresh works, an external link opens Safari, and the
Nearby tab asks for location. Log the outcome in `docs/PROGRESS.md`.
