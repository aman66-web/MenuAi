"""Read Pret A Manger UK's official product nutrition data (the data its own website pages load).

Used by tools/uk_extract/pret.py. Pret does not publish one nutrition PDF: its Allergen Guide PDF has allergens only.
The per-serving nutrition table of every product is on the website's product-category pages
(https://www.pret.co.uk/en-GB/products/categories/<slug>), which the site builds from the server-side data at
https://www.pret.co.uk/_next/data/<buildId>/en-GB/products/categories/<slug>.json (public, no login, no key).
`<buildId>` is read from the site's own HTML each run because it changes whenever the site is redeployed.

Numbers are returned exactly as printed (strings such as "29.3", "<0.5") so nothing is converted or estimated here.
Politeness: one request per category, at most one per second, a normal browser user-agent.
"""
import json
import re
import time
import urllib.request
from pathlib import Path

BASE = "https://www.pret.co.uk"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ENTRY_PAGE = BASE + "/en-GB/products/categories/hot-drinks"

# The site's top-level product categories at extraction time. If the live site lists different ones, pret.py stops.
CATEGORY_SLUGS = [
    "hot-drinks",
    "hot-food",
    "breakfast",
    "sandwiches-baguettes-wraps-and-flatbreads",
    "cold-drinks",
    "super-plates-salads-and-protein-pots",
    "sweet-and-savoury-snacks",
    "fruit-and-fruit-pots",
    "little-pret-stars",
    "veggie-and-vegan-friendly",
    "pret-at-home",
]


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch(outdir: Path) -> dict[str, Path]:
    """Download each category's data once into outdir/<slug>.json (plus the entry page's buildId in build-id.txt)."""
    outdir.mkdir(parents=True, exist_ok=True)
    html = _get(ENTRY_PAGE).decode("utf-8", "replace")
    m = re.search(r'"buildId":"([^"]+)"', html)
    if not m:
        raise SystemExit("Could not find the site's buildId in " + ENTRY_PAGE + ": the site changed, re-check by hand.")
    build_id = m.group(1)
    (outdir / "build-id.txt").write_text(build_id + "\n", encoding="utf-8")
    paths: dict[str, Path] = {}
    for slug in CATEGORY_SLUGS:
        time.sleep(1.0)
        data = _get(f"{BASE}/_next/data/{build_id}/en-GB/products/categories/{slug}.json")
        json.loads(data)  # must be JSON
        p = outdir / f"{slug}.json"
        p.write_bytes(data)
        paths[slug] = p
    return paths


def load(rawdir: Path) -> list[tuple[str, dict]]:
    """[(category slug, pageProps)] for every saved category file, in CATEGORY_SLUGS order."""
    out = []
    for slug in CATEGORY_SLUGS:
        p = rawdir / f"{slug}.json"
        if not p.exists():
            raise SystemExit(f"{p} is missing: run with --fetch first.")
        out.append((slug, json.loads(p.read_text(encoding="utf-8"))["pageProps"]))
    return out
