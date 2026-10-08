"""Fetch and parse Simmons Bakers' own nutrition pages (helper for simmons_bakers.py).

Site: https://www.simmonsbakers.com/nutritional-information lists every product in two tabs:
  * "Made in store" (MO): pages /nutritional-information/<id>. The page's static numbers are only placeholders; the nutrition shown to a
    customer is worked out by the page's own JavaScript after the customer picks the options (bread, butter and salad, cheese, milk...):
    it POSTs the picked option ids to /ingredientoptionslookup, gets one row per component (the filling itself + one row per option) and
    adds the rows up. `lookup()` makes that same request (ONE request per product, with every option id of the product: the answer is
    one independent row per option), and `total()` adds the rows up exactly as the page does (same order, same rounding).
  * "From the bakery" (RM): pages /nutritional-information-rm/<id>: static tables "Per <unit>" and "Per 100g", allergens and dietary advice.
Politeness: one request per page (a GET), plus one POST per made-in-store product; at least 1.1 s between requests; a normal browser
User-Agent; robots.txt read with robots_rfc (the site serves none: /robots.txt redirects to its home page, so no rules apply). A block
(401/403/429) stops the run; an HTTP 500 on one page is recorded and that product is left out.
"""
from __future__ import annotations
import hashlib
import html
import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402

BASE = "https://www.simmonsbakers.com"
LISTING = "/nutritional-information"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
DELAY = 1.1
# The page script's row fields -> our names (per serving, as the page sums them).
FIELDS = [("energyKj", "energy_kj"), ("energyKcal", "calories"), ("fat", "fat_g"), ("saturates", "sat_fat_g"),
          ("carbohydrates", "carbs_g"), ("sugars", "sugar_g"), ("fibre", "fiber_g"), ("protein", "protein_g"), ("salt", "salt_g")]


# ---------------------------------------------------------------- fetching
_last = [0.0]


def _wait() -> None:
    gap = DELAY - (time.time() - _last[0])
    if gap > 0:
        time.sleep(gap)
    _last[0] = time.time()


def _curl(args: list[str], dest: Path) -> tuple[int, str]:
    """Run curl once; returns (HTTP status, final URL). Same-host redirects are followed (the site redirects a few made-in-store URLs)."""
    _wait()
    cmd = ["curl", "-sS", "-L", "--max-redirs", "2", "--compressed", "-A", UA, "-o", str(dest), "-w", "%{http_code} %{url_effective}", *args]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.split(" ", 1)
    return int(out[0]), out[1].strip()


def _check(status: int, url: str, body: Path) -> None:
    if status in (401, 403, 429) or (status == 200 and b"captcha" in body.read_bytes()[:20000].lower()):
        raise SystemExit(f"BLOCKED ({status}) at {url}: do not work round it; the founder should download the page himself.")


def robots_ok(cache: Path) -> list[str]:
    """Reads /robots.txt once and checks every path this script requests. The site publishes none (the URL redirects to its home page,
    which is HTML, not a robots file), so there are no rules; if one is ever published, the script obeys it exactly (RFC 9309)."""
    f = cache / "robots.txt"
    if not f.exists():
        _curl([BASE + "/robots.txt"], f)
    text = f.read_text(encoding="utf-8", errors="replace")
    if "<html" in text[:500].lower() or "<!doctype" in text[:500].lower():
        return []
    rules = robots_rfc.parse(text)
    for path in (LISTING, LISTING + "/1", "/nutritional-information-rm/1", "/ingredientoptionslookup"):
        if not robots_rfc.allowed(rules, path):
            raise SystemExit(f"robots.txt disallows {path}: stop and report")
    return [f"{k}: {v}" for k, v in rules]


def page_file(cache: Path, path: str) -> Path:
    return cache / "pages" / (path.strip("/").replace("/", "_") + ".html")


def fetch_page(cache: Path, path: str) -> Path | None:
    """One GET of `path` into the cache (skipped when cached). Returns None when the page answers HTTP 500 (recorded, not retried)."""
    f = page_file(cache, path)
    err = f.with_suffix(".http500")
    if f.exists() and f.stat().st_size:
        return f
    if err.exists():
        return None
    f.parent.mkdir(parents=True, exist_ok=True)
    status, final = _curl([BASE + "/" + path.lstrip("/")], f)
    if status == 500:
        f.unlink(missing_ok=True)
        err.write_text("HTTP 500\n")
        return None
    _check(status, final, f)
    if status != 200:
        raise SystemExit(f"{path}: HTTP {status} ({final}): the site changed, re-check the script")
    return f


def lookup(cache: Path, prod_id: str, option_ids: list[str]) -> list[dict]:
    """POST /ingredientoptionslookup (what the page's own script does after each pick) once for a product with all its option ids."""
    f = cache / "lookup" / f"{prod_id}.json"
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        args = ["-X", "POST", "-H", "X-Requested-With: XMLHttpRequest", "-H", f"Referer: {BASE}{LISTING}/{prod_id}",
                "--data-urlencode", f"prodId={prod_id}"]
        for o in option_ids:
            args += ["--data-urlencode", f"optionIds[]={o}"]
        status, final = _curl(args + [BASE + "/ingredientoptionslookup"], f)
        _check(status, final, f)
        if status != 200:
            f.unlink(missing_ok=True)
            raise SystemExit(f"POST lookup for {prod_id}: HTTP {status}")
    return json.loads(f.read_text(encoding="utf-8"))


def sha256_text(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def cache_digest(cache: Path) -> str:
    """One SHA-256 over every cached product page and lookup answer (sorted by file name, each as 'name:sha256')."""
    lines = [f"{f.relative_to(cache)}:{sha256_text(f)}" for f in sorted((cache / "pages").glob("*.html")) + sorted((cache / "lookup").glob("*.json"))]
    return hashlib.sha256("\n".join(lines).encode()).hexdigest() + f" ({len(lines)} files)"


# ---------------------------------------------------------------- parsing
def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", s)).split())


def parse_listing(text: str) -> list[dict]:
    """[{tab: MO|RM, category, id, path, name}] in page order."""
    mo, rm = text.index('id="moCategory"'), text.index('id="rmCategory"')
    rows = []
    for tab, seg in (("MO", text[mo:rm]), ("RM", text[rm:])):
        cat = None
        for m in re.finditer(r'<h3 class="Clamshell-title">(.*?)</h3>|<a href="(nutritional-information(?:-rm)?/(\d+))" class="redLink">(.*?)</a>', seg, re.S):
            if m.group(1) is not None:
                cat = clean(m.group(1))
            else:
                rows.append({"tab": tab, "category": cat, "id": m.group(3), "path": m.group(2), "name": clean(m.group(4))})
    return rows


def parse_product(text: str) -> dict:
    """Either {kind: 'mo', title, id, panels, base_html} or {kind: 'static', title, unit, serving{}, hundred{}, allergens, dietary, ingredients}."""
    if 'id="shortDescription"' in text and "ingredientOptionPanel_" in text:
        title = clean(re.search(r'<h2 id="shortDescription"[^>]*>(.*?)</h2>', text, re.S).group(1))
        pid = re.search(r'id="productId"[^>]*value="(\d+)"', text).group(1)
        panels = []
        for m in re.finditer(r'<div id="ingredientOptionPanel_(\w+)" class="ingredientOptionPanel[^"]*">(.*?)(?=<div id="ingredientOptionPanel_|<div class="ingredientsMadeToOrderInfo)', text, re.S):
            if m.group(1) == "final":
                continue
            head = clean(re.search(r'<div class="selectionHeader">(.*?)</div>', m.group(2), re.S).group(1))
            head = re.sub(r"^Tell us about your ", "", head)
            head = re.sub(r" choice$", "", head)
            opts = [{"id": o.group(1), "label": clean(o.group(3))} for o in
                    re.finditer(r'<div class="ingredientOption" data-id="([^"]+)" data-next="([^"]+)" data-value="([^"]*)"', m.group(2))]
            panels.append({"header": head, "options": opts})
        base = re.search(r'For allergens, see ingredients in <span class="bold">bold</span>\.</p>\s*<p class="textSummary">(.*?)</p>', text, re.S)
        return {"kind": "mo", "title": title, "id": pid, "panels": panels, "base_html": base.group(1) if base else None}
    title = clean(re.search(r'<h2 class="biggerTitle--deep">(.*?)</h2>', text, re.S).group(1))
    unit = re.search(r'<th class="rightText"><span class="u-mobile-serving">(.*?)</span>', text, re.S)
    ser, hun = {}, {}
    for key, _ in FIELDS:
        a = re.search(r'<span id="%sServing">(.*?)</span>' % key, text)
        b = re.search(r'<span id="%s">(.*?)</span>' % key, text)
        ser[key], hun[key] = (clean(a.group(1)) if a else None), (clean(b.group(1)) if b else None)
    al = re.search(r'<p id="allergenList"[^>]*>(.*?)</p>', text, re.S)
    di = re.search(r'<p id="dietaryAdvice"[^>]*>(.*?)</p>', text, re.S)
    ing = re.search(r'<p id="optionIngredients"[^>]*>(.*?)</p>', text, re.S)
    return {"kind": "static", "title": title, "unit": clean(unit.group(1)) if unit else "", "serving": ser, "hundred": hun,
            "allergens": clean(al.group(1)) if al else None, "dietary": clean(di.group(1)) if di else None,
            "ingredients_html": ing.group(1) if ing else None}


def bold_words(fragment: str | None) -> list[str]:
    """The words the page prints in bold (its allergen marks) in an ingredients paragraph."""
    return [clean(m) for m in re.findall(r"<u><b>(.*?)</b></u>", fragment or "", re.S)]


# ---------------------------------------------------------------- the page's own sum
def _round_half_up(x: float) -> int:
    import math
    return int(math.floor(x + 0.5))


def total(rows: list[dict]) -> dict:
    """The per-serving totals the page shows for these component rows (base row first, then the picked options in panel order):
    sequential float sums, kJ and kcal rounded to whole numbers (JavaScript Math.round), the rest printed with two decimals (toFixed(2)).
    Raises when a row lacks a value (the page would print NaN)."""
    sums = {k: 0.0 for k, _ in FIELDS}
    for r in rows:
        for k, _ in FIELDS:
            if r.get(k) is None or r.get(k) == "":
                raise ValueError(f"row {r.get('shortDescription')!r} has no {k}")
            sums[k] += float(r[k])
    out = {}
    for k, ours in FIELDS:
        out[ours] = str(_round_half_up(sums[k])) if k in ("energyKj", "energyKcal") else "%.2f" % sums[k]
    return out
