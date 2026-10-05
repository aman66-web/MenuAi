#!/usr/bin/env bash
# MenuMacros test runner.
#   ./scripts/test.sh             pipeline + data checks, then all Xcode tests (unit + UI)
#   ./scripts/test.sh --unit      ...but only the MenuMacrosTests unit tests (fast; use after each step)
#   ./scripts/test.sh --skip-ios  pipeline + data checks only
#   IOS_VERSION=17 ./scripts/test.sh --unit   run on an iOS 17.x simulator (deployment target check)
set -euo pipefail
cd "$(dirname "$0")/.."

SCHEME="${SCHEME:-MenuMacros}"
MODE="${1:-all}"

echo "▸ Menu pipeline tests"
python3 -m unittest discover -s tools/tests -q

echo "▸ Data checks"
TMP_OUT="$(mktemp -d)"
trap 'rm -rf "$TMP_OUT"' EXIT
python3 tools/build_menus.py --out "$TMP_OUT" --quiet
python3 tools/reference_ranking.py --check
echo "  ✓ ranking fixtures match the sample data"

if [ -f MenuMacros/Resources/Menus/menus-manifest.json ]; then
  python3 - "$TMP_OUT/menus-manifest.json" MenuMacros/Resources/Menus/menus-manifest.json <<'PY'
import json, sys
fresh_chains = json.load(open(sys.argv[1]))["chains"]
fresh = {c["id"]: c["contentHash"] for c in fresh_chains}
samples = {c["id"] for c in fresh_chains if c["sample"]}
bundled = {c["id"]: c["contentHash"] for c in json.load(open(sys.argv[2]))["chains"]}
stale = sorted(cid for cid in bundled if fresh.get(cid) != bundled[cid])
missing = sorted(cid for cid in fresh if cid not in bundled and cid not in samples)  # release bundles omit samples
if stale or missing:
    print(f"  ✗ bundled menus are out of date (changed: {stale or '-'}, not bundled: {missing or '-'})")
    print("    Run: python3 tools/build_menus.py --bundle-into MenuMacros/Resources/Menus  (release: add --no-samples --out dist/release)")
    sys.exit(1)
print("  ✓ bundled menus match data/source")
PY
fi
if [ -d MenuMacrosTests/Fixtures ]; then
  if ! diff -rq data/fixtures MenuMacrosTests/Fixtures >/dev/null; then
    echo "  ✗ MenuMacrosTests/Fixtures differs from data/fixtures. Run: cp data/fixtures/* MenuMacrosTests/Fixtures/"
    exit 1
  fi
  echo "  ✓ test fixtures are in sync"
fi

if [ -d web/node_modules ]; then
  echo "▸ Website/API tests"
  (cd web && npx vitest run --reporter=dot)
fi

if [ "$MODE" = "--skip-ios" ]; then echo "✓ Pipeline and data checks passed (iOS tests skipped)"; exit 0; fi
if ! ls -d ./*.xcodeproj >/dev/null 2>&1; then
  echo "✓ Pipeline and data checks passed (no Xcode project yet, iOS tests skipped)"; exit 0
fi

echo "▸ Picking a simulator"
UDID="$(xcrun simctl list devices available -j | IOS_VERSION="${IOS_VERSION:-}" python3 -c '
import json, os, re, sys
data = json.load(sys.stdin)["devices"]
want = os.environ.get("IOS_VERSION", "")
def ver(rt):
    m = re.search(r"iOS-(\d+)-(\d+)", rt)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)
runtimes = sorted((r for r in data if "iOS" in r), key=ver, reverse=True)
if want:
    runtimes = [r for r in runtimes if str(ver(r)[0]) == want]
for rt in runtimes:
    phones = [d for d in data[rt] if d.get("isAvailable") and d["name"].startswith("iPhone")]
    if phones:
        booted = [d for d in phones if d["state"] == "Booted"]
        print((booted or phones)[0]["udid"]); break
')"
if [ -z "$UDID" ]; then
  echo "No available iPhone simulator${IOS_VERSION:+ for iOS $IOS_VERSION}. Install one in Xcode › Settings › Components."; exit 1
fi
echo "  using $UDID"

ONLY=()
if [ "$MODE" = "--unit" ]; then ONLY=(-only-testing:MenuMacrosTests); fi
echo "▸ xcodebuild test ($SCHEME${ONLY:+, unit tests only})"
mkdir -p build
xcodebuild test -scheme "$SCHEME" -destination "id=$UDID" -derivedDataPath build/DerivedData -quiet \
  ${ONLY[@]+"${ONLY[@]}"} -resultBundlePath "build/TestResults-$(date +%Y%m%d-%H%M%S).xcresult"
echo "✓ All tests passed"
