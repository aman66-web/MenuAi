#!/usr/bin/env bash
# Builds the copy of the web app that goes inside the iPhone app (docs/APP_BUILD.md):
#   1. a static export of web/ for the app (no sample data, menu photos as web/app-content.json says);
#   2. copied into MenuMacros/Resources/WebApp.bundle/ with only what the app needs (scripts/pack_app_web.py). Xcode copies a .bundle folder
#      into the app whole (its folders kept), so no build phase is needed. The folder is git-ignored: run this before building in Xcode.
#   NEXT_PUBLIC_SUPPORT_EMAIL=you@yourdomain ./scripts/build_app_web.sh
#   NEXT_PUBLIC_REMOTE_BASE=https://your-domain ./scripts/build_app_web.sh     (default: https://numbite.com)
#
# The 1.1 line (Premium through Apple In-App Purchase, Scan your food and Make it at home) is the default: NEXT_PUBLIC_IAP=1 and NEXT_PUBLIC_PHOTO_RECIPES=1
# (packing without them gave an app with nothing to buy, which App Review rejects as "In-App Purchase not found"). Anything left in the shell from testing is
# cleared, so the pack is the same whoever runs it; each switch can still be set on purpose with a PACK_ name:
#   PACK_IAP=0 / PACK_PHOTO_RECIPES=0          a free build without purchases or the photo features
#   PACK_SIGN_IN_REQUIRED=0                     optional sign-in (the App Review 5.1.1(v) fallback; the live switch file can also do it without a new build)
#   PACK_TELEMETRY_APP_ID=<id>                  anonymous setup counts (only after the App Privacy answers say so)
#   PACK_ENTITLEMENT_PUBLIC_JWK='<json>'        another key than the committed web/lib/payments/entitlement-public-key.json (never for the App Store)
# The version line (Settings, reports) is read from the Xcode project: MARKETING_VERSION and CURRENT_PROJECT_VERSION, e.g. "iPhone 1.1 (9)".
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here/web"
# next build reads these files on its own and would pack whatever they hold (a test key, a local address, optional sign-in) into the App Store app, past the
# clearing below (the meeting of 21 November 2026, Cal). Only .env.example may be here.
for f in .env .env.local .env.production .env.production.local; do
  if [ -e "$f" ]; then
    echo "Remove web/$f first: next build would read it into the app." >&2
    exit 1
  fi
done
# The address people can write to: shown in Settings › Contact us, the privacy policy, terms and support pages inside the app. A local build
# does not get the website's Vercel value, so it must be given here, and it must not be a placeholder or a test address (App Review: guideline 1.5).
if [ -z "${NEXT_PUBLIC_SUPPORT_EMAIL:-}" ] || [[ "$NEXT_PUBLIC_SUPPORT_EMAIL" == *example.com* ]] || [[ "$NEXT_PUBLIC_SUPPORT_EMAIL" == test@* ]]; then
  echo "Set NEXT_PUBLIC_SUPPORT_EMAIL to a real address people can write to (the one the live site shows), then run this again." >&2
  exit 1
fi
export NEXT_PUBLIC_SUPPORT_EMAIL

# Nothing from a test shell: sample chains, the old Pro test switch and preview, a test key, optional sign-in, telemetry, Community, Pip's pick, a local site address.
unset NEXT_PUBLIC_SHOW_SAMPLE_DATA NEXT_PUBLIC_PRO NEXT_PUBLIC_PRO_PREVIEW NEXT_PUBLIC_SIGN_IN_REQUIRED NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK NEXT_PUBLIC_TELEMETRY_APP_ID \
  NEXT_PUBLIC_COMMUNITY NEXT_PUBLIC_COMMUNITY_FRIENDS NEXT_PUBLIC_COMPARE_PICK NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_WEB_PRO NEXT_PUBLIC_APP_PREMIUM NEXT_PUBLIC_APP_VERSION
export NEXT_PUBLIC_IAP="${PACK_IAP:-1}"
export NEXT_PUBLIC_PHOTO_RECIPES="${PACK_PHOTO_RECIPES:-1}"
[ -n "${PACK_SIGN_IN_REQUIRED:-}" ] && export NEXT_PUBLIC_SIGN_IN_REQUIRED="$PACK_SIGN_IN_REQUIRED"
[ -n "${PACK_TELEMETRY_APP_ID:-}" ] && export NEXT_PUBLIC_TELEMETRY_APP_ID="$PACK_TELEMETRY_APP_ID"
[ -n "${PACK_ENTITLEMENT_PUBLIC_JWK:-}" ] && export NEXT_PUBLIC_ENTITLEMENT_PUBLIC_JWK="$PACK_ENTITLEMENT_PUBLIC_JWK"

# The app's version and build, from the Xcode project (both configurations must agree).
pbx="$here/MenuMacros.xcodeproj/project.pbxproj"
marketing=$(sed -nE 's/^[[:space:]]*MARKETING_VERSION = "?([^";]+)"?;/\1/p' "$pbx" | sort -u)
build=$(sed -nE 's/^[[:space:]]*CURRENT_PROJECT_VERSION = "?([^";]+)"?;/\1/p' "$pbx" | sort -u)
if [ -z "$marketing" ] || [ -z "$build" ] || [ "$(printf '%s\n' "$marketing" | wc -l | tr -d ' ')" != "1" ] || [ "$(printf '%s\n' "$build" | wc -l | tr -d ' ')" != "1" ]; then
  echo "MARKETING_VERSION ($marketing) or CURRENT_PROJECT_VERSION ($build) is missing or differs between Debug and Release in $pbx." >&2
  exit 1
fi
export NEXT_PUBLIC_APP_VERSION="$marketing ($build)"
echo "Packing Numbite $NEXT_PUBLIC_APP_VERSION: In-App Purchase ${NEXT_PUBLIC_IAP}, photo features ${NEXT_PUBLIC_PHOTO_RECIPES}, sign-in required ${NEXT_PUBLIC_SIGN_IN_REQUIRED:-yes}."

photos=$(python3 -c 'import json; print("1" if json.load(open("app-content.json")).get("menuPhotos", True) else "0")')
logos=$(python3 -c 'import json; print("1" if json.load(open("app-content.json")).get("appLogos", True) else "0")')
# "remoteImages": true leaves the dish, recipe and product photos out of the app (about 125 MB) and loads each from the live site when it is first shown
remote=$(python3 -c 'import json; print("1" if json.load(open("app-content.json")).get("remoteImages", False) else "0")')
rm -rf .next-app
APP_BUILD=1 NEXT_PUBLIC_MENU_PHOTOS="$photos" NEXT_PUBLIC_APP_LOGOS="$logos" NEXT_PUBLIC_APP_REMOTE_IMAGES="$remote" NEXT_PUBLIC_REMOTE_BASE="${NEXT_PUBLIC_REMOTE_BASE:-https://numbite.com}" npx next build
bundle="$here/MenuMacros/Resources/WebApp.bundle"
python3 "$here/scripts/pack_app_web.py" .next-app "$bundle" app-content.json

# Belt and braces: the pack must be the one meant for the App Store.
fail() { echo "Not safe to submit: $1" >&2; exit 1; }
grep -rlF "support@example.com" "$bundle" > /dev/null 2>&1 && fail "the packed app still contains the placeholder support@example.com."
grep -rlF "test@numbite.com" "$bundle" > /dev/null 2>&1 && fail "the packed app contains the test address test@numbite.com."
if [ "${NEXT_PUBLIC_SIGN_IN_REQUIRED:-1}" != "0" ] && grep -qF "Accounts (optional)" "$bundle/terms.html"; then
  fail "terms.html says accounts are optional, but this build makes everyone sign in."
fi
if [ "$NEXT_PUBLIC_IAP" = "1" ]; then
  grep -rlF "Restore purchases" "$bundle/_next/static/chunks" > /dev/null 2>&1 || fail "no part of the app has Restore purchases: In-App Purchase is missing."
fi
grep -rlF "$NEXT_PUBLIC_APP_VERSION" "$bundle/_next/static/chunks" > /dev/null 2>&1 || fail "the version $NEXT_PUBLIC_APP_VERSION isn't in the app's files."
echo "Packed $NEXT_PUBLIC_APP_VERSION into $bundle."
