#!/usr/bin/env bash
# Rebuild the FICTIONAL sample chains for the web app (web/public/menus-sample/).
# The web app loads these only when samples are enabled (local dev, Vercel previews, or
# NEXT_PUBLIC_SHOW_SAMPLE_DATA=1). Real chains are published separately by ./scripts/publish_menus.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
python3 tools/build_menus.py --out "$OUT" --quiet

mkdir -p web/public/menus-sample
rm -f web/public/menus-sample/*.json
python3 - "$OUT" web/public/menus-sample <<'PY'
import json, shutil, sys
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
manifest = json.loads((src / "menus-manifest.json").read_text())
manifest["chains"] = [c for c in manifest["chains"] if c["sample"]]
for c in manifest["chains"]:
    shutil.copy(src / c["file"], dst / c["file"])
# the sample search index: the same compact index, limited to the sample chains
import hashlib
search = json.loads((src / manifest["search"]["file"]).read_text())
search["chains"] = [c for c in search["chains"] if c["sample"]]
search_bytes = (json.dumps(search, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
(dst / manifest["search"]["file"]).write_bytes(search_bytes)
manifest["search"]["sha256"] = hashlib.sha256(search_bytes).hexdigest()
(dst / "menus-manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
print(f"✓ {len(manifest['chains'])} sample chains → web/public/menus-sample (dataVersion {manifest['dataVersion']})")
PY
