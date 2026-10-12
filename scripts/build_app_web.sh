#!/usr/bin/env bash
# Builds the copy of the web app that goes inside the iPhone app (docs/APP_BUILD.md):
#   1. a static export of web/ for the app (Pro and Pip's AI recipe maker off, no sample data, menu photos as web/app-content.json says);
#   2. copied to build/ios-web/ with only what the app needs (scripts/pack_app_web.py).
# Xcode's "Copy web app" build phase puts build/ios-web/ into the app as one folder. Run this before building the app in Xcode.
#   NEXT_PUBLIC_REMOTE_BASE=https://your-domain ./scripts/build_app_web.sh     (default: https://menumacros.vercel.app)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here/web"
unset NEXT_PUBLIC_SHOW_SAMPLE_DATA NEXT_PUBLIC_PRO NEXT_PUBLIC_PRO_PREVIEW
photos=$(python3 -c 'import json; print("1" if json.load(open("app-content.json")).get("menuPhotos", True) else "0")')
rm -rf .next-app
APP_BUILD=1 NEXT_PUBLIC_MENU_PHOTOS="$photos" NEXT_PUBLIC_REMOTE_BASE="${NEXT_PUBLIC_REMOTE_BASE:-https://menumacros.vercel.app}" npx next build
python3 "$here/scripts/pack_app_web.py" .next-app "$here/build/ios-web" app-content.json
