#!/usr/bin/env bash
# Builds the copy of the web app that goes inside the iPhone app (docs/APP_BUILD.md):
#   1. a static export of web/ for the app (Pro and Pip's AI recipe maker off, no sample data, menu photos as web/app-content.json says);
#   2. copied into MenuMacros/Resources/WebApp.bundle/ with only what the app needs (scripts/pack_app_web.py). Xcode copies a .bundle folder
#      into the app whole (its folders kept), so no build phase is needed. The folder is git-ignored: run this before building in Xcode.
#   NEXT_PUBLIC_REMOTE_BASE=https://your-domain ./scripts/build_app_web.sh     (default: https://numbite.com)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here/web"
# The address people can write to: shown in Settings › Contact us, the privacy policy, terms and support pages inside the app. A local build
# does not get the website's Vercel value, so it must be given here, and it must not be a placeholder (App Review: guideline 1.5).
#   NEXT_PUBLIC_SUPPORT_EMAIL=you@yourdomain ./scripts/build_app_web.sh
if [ -z "${NEXT_PUBLIC_SUPPORT_EMAIL:-}" ] || [[ "$NEXT_PUBLIC_SUPPORT_EMAIL" == *example.com* ]]; then
  echo "Set NEXT_PUBLIC_SUPPORT_EMAIL to a real address people can write to (the one the live site shows), then run this again." >&2
  exit 1
fi
export NEXT_PUBLIC_SUPPORT_EMAIL
unset NEXT_PUBLIC_SHOW_SAMPLE_DATA NEXT_PUBLIC_PRO NEXT_PUBLIC_PRO_PREVIEW
photos=$(python3 -c 'import json; print("1" if json.load(open("app-content.json")).get("menuPhotos", True) else "0")')
logos=$(python3 -c 'import json; print("1" if json.load(open("app-content.json")).get("appLogos", True) else "0")')
rm -rf .next-app
APP_BUILD=1 NEXT_PUBLIC_MENU_PHOTOS="$photos" NEXT_PUBLIC_APP_LOGOS="$logos" NEXT_PUBLIC_REMOTE_BASE="${NEXT_PUBLIC_REMOTE_BASE:-https://numbite.com}" npx next build
python3 "$here/scripts/pack_app_web.py" .next-app "$here/MenuMacros/Resources/WebApp.bundle" app-content.json
# Belt and braces: nothing placeholder may end up inside the app.
if grep -rl "support@example.com" "$here/MenuMacros/Resources/WebApp.bundle" > /dev/null 2>&1; then
  echo "The packed app still contains the placeholder support@example.com: not safe to submit." >&2
  exit 1
fi
