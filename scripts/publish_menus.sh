#!/usr/bin/env bash
# Build release menu data ONCE and publish it to the website (Vercel serves it at /menus/)
# and to the app bundle, so both share the same dataVersion and SHA-256s.
#
#   ./scripts/publish_menus.sh             # release data (no fictional samples) → web + app bundle
#   ./scripts/publish_menus.sh --web-only  # update the website only (app bundle untouched)
#
# Then commit and push: Vercel redeploys automatically and the app picks up changes on its next sync.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 tools/build_menus.py --no-samples --out dist/release --quiet

if ! ls dist/release/chain-*.json >/dev/null 2>&1; then
  echo "No real chains yet (fictional samples are never published). Add chains in data/source/ first."
  exit 1
fi

copy_to() {
  mkdir -p "$1"
  rm -f "$1"/*.json
  cp dist/release/menus-manifest.json dist/release/chain-*.json "$1"/
}

copy_to web/public/menus
[ "${1:-}" = "--web-only" ] || copy_to MenuMacros/Resources/Menus

COUNT=$(ls dist/release/chain-*.json | wc -l | tr -d ' ')
VERSION=$(python3 -c 'import json; print(json.load(open("dist/release/menus-manifest.json"))["dataVersion"])')
echo "✓ Published $COUNT chains (dataVersion $VERSION) to web/public/menus/$([ "${1:-}" = "--web-only" ] || echo ' and MenuMacros/Resources/Menus/')"
echo "  Check dist/release/check-report.md for warnings, then:"
echo "  git add -A && git commit -m \"Menu data update\" && git push   # Vercel redeploys automatically"
