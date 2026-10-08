"""Read Pret A Manger UK's official product nutrition data (the data its own website pages load).

Used by tools/uk_extract/pret.py. Pret does not publish one nutrition PDF: its Allergen Guide PDF has allergens only.
The per-serving nutrition table of every product is on the website's product-category pages
(https://www.pret.co.uk/en-GB/products/categories/<slug>), which the site builds from the server-side data at
https://www.pret.co.uk/_next/data/<buildId>/en-GB/products/categories/<slug>.json (public, no login, no key).
`<buildId>` is read from the site's own HTML each run because it changes whenever the site is redeployed.

Numbers are returned exactly as printed (strings such as "29.3", "<0.5") so nothing is converted or estimated here.
Politeness: one request per category, at most one per second, a normal browser user-agent.

Allergens: each product record carries an `allergens` list (labels such as "Wheat", "Milk", "Pine Nuts"); the barista-drink
variants (milk / decaf) carry none of their own. `fetch()` also saves the site's Allergen Guide page (ALLERGEN_PAGE), which
links the current Allergen Guide PDF, and the PDF itself (ALLERGEN_PDF_FILE; one request, after reading the PDF host's robots.txt
with robots_rfc), which prints every barista drink in each milk choice (tools/uk_extract/pret_allergen_pdf.py reads it).
"""
from __future__ import annotations
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402

BASE = "https://www.pret.co.uk"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ENTRY_PAGE = BASE + "/en-GB/products/categories/hot-drinks"
ALLERGEN_PAGE = BASE + "/en-GB/allergenguide"
ALLERGEN_PAGE_FILE = "allergenguide.html"
ALLERGEN_PDF_FILE = "allergen-guide.pdf"

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
    time.sleep(1.0)
    (outdir / ALLERGEN_PAGE_FILE).write_bytes(_get(ALLERGEN_PAGE))
    pdfs = allergen_guide_pdfs(outdir) or []
    if len(pdfs) != 1:
        raise SystemExit(f"The Allergen Guide page links {len(pdfs)} guide PDFs ({pdfs}), expected exactly one: re-check by hand.")
    time.sleep(1.0)
    (outdir / ALLERGEN_PDF_FILE).write_bytes(fetch_allowed(pdfs[0]))
    return paths


def fetch_allowed(url: str) -> bytes:
    """One polite GET of `url` after reading its host's robots.txt (RFC 9309 matching; a missing robots.txt allows everything)."""
    parts = urllib.parse.urlsplit(url)
    try:
        rules = robots_rfc.parse(_get(f"{parts.scheme}://{parts.netloc}/robots.txt").decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise SystemExit(f"robots.txt of {parts.netloc} answered HTTP {e.code}: not fetching {url}.")
        rules = []
    path = parts.path + (f"?{parts.query}" if parts.query else "")
    if not robots_rfc.allowed(rules, path):
        raise SystemExit(f"robots.txt of {parts.netloc} disallows {path}: not fetching it.")
    time.sleep(1.0)
    return _get(url)


def allergen_guide_pdfs(rawdir: Path) -> list[str] | None:
    """The Allergen Guide PDF links on the saved Allergen Guide page (None if the page was not saved)."""
    p = rawdir / ALLERGEN_PAGE_FILE
    if not p.exists():
        return None
    html = p.read_text(encoding="utf-8", errors="replace")
    return sorted({"https:" + u for u in re.findall(r'"(?:https:)?(//assets\.ctfassets\.net/[^"]*Allergen_Guide[^"]*\.pdf)"', html)})


def load(rawdir: Path) -> list[tuple[str, dict]]:
    """[(category slug, pageProps)] for every saved category file, in CATEGORY_SLUGS order."""
    out = []
    for slug in CATEGORY_SLUGS:
        p = rawdir / f"{slug}.json"
        if not p.exists():
            raise SystemExit(f"{p} is missing: run with --fetch first.")
        out.append((slug, json.loads(p.read_text(encoding="utf-8"))["pageProps"]))
    return out
