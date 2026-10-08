"""Reader for Greenhalgh's Craft Bakery product pages (greenhalghs.com, WooCommerce), used by tools/uk_extract/greenhalghs.py.

Source: the shop's own product pages, listed in https://www.greenhalghs.com/product-sitemap.xml (robots.txt, read with the RFC 9309
matcher in robots_rfc.py, disallows only /wp-admin/ and some ?query-string paths). One request per page, at most one a second.

What a page prints about nutrition (all of it is copied, nothing converted):
  * a "Nutrition Information - Per 100g" table (kJ / kcal, fat, saturates, carbohydrate, sugars, fibre, protein, salt) on most food
    pages. It is PER 100 g, so it is never published here; it is read only to cross-check a per-unit calorie line.
  * on some pages one line of text in the product summary that gives the energy of ONE unit, pie, pasty or portion, for example
    "Calorie content per pie 605 kcals", "Cals per unit 333 kcal.", "693 kcal per pie (250g)", "505 kcal per 1/8 pie.". Only those lines
    are published (calories only). Every line that mentions kcal / cals / calories outside the per-100 g table must match one of UNIT_LINES
    (or be a sentence that repeats the same number); anything else stops the run.
Standard library only; runs on Python 3.9.
"""
from __future__ import annotations
import html
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402

SITE = "https://www.greenhalghs.com"
ROBOTS_URL = SITE + "/robots.txt"
SITEMAP_URL = SITE + "/product-sitemap.xml"
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")

# (compiled pattern, serving text, weight in grams or None). Group 1 is the calories. The text is matched against a whole line.
UNIT_LINES = [
    (re.compile(r"^Cals per unit (\d+) kcal\.?$", re.I), "per unit", None),
    (re.compile(r"^Calorie content per pie (\d+) kcals?\.?$", re.I), "per pie", None),
    (re.compile(r"^Calorie content per pudding (\d+) kcals?\.?$", re.I), "per pudding", None),
    (re.compile(r"^Calories per 1/4 portion pie (\d+) kcals?\.?$", re.I), "per 1/4 portion pie", None),
    (re.compile(r"^(\d+) kcal per pasty\.?$", re.I), "per pasty", None),
    (re.compile(r"^(\d+) kcal per pie \(250g\)\.?$", re.I), "per pie (250g)", "250"),
    (re.compile(r"^(\d+) kcal per 1/8 pie\.?$", re.I), "per 1/8 pie", None),
    (re.compile(r"^(\d+) kcal per 1/8\.?$", re.I), "per 1/8", None),
    (re.compile(r"^(\d+) kcal per 250g\.?$", re.I), "per 250g", "250"),
    (re.compile(r"^(\d+) kcal per 250g serving\.?$", re.I), "per 250g serving", "250"),
]
# Lines that print energy for 100 g: recognised so they can be left out on purpose (the product is not published).
PER_100G_LINE = re.compile(r"^(\d+) kcal per 100g\.?$", re.I)
# A sentence that repeats a unit figure inside the description ("With 505 kcal per 1/8 serving, this pie ..."): its number must agree.
SENTENCE = re.compile(r"\b(\d+) kcal per 1/8\b", re.I)
ENERGY_WORDS = re.compile(r"kcal|\bcals?\b|calorie", re.I)

NUTRITION_BLOCK = re.compile(r'<div class="mnlc-nutrition">.*?</table>', re.S)  # the page holds the same table twice (tabs and accordion)


def cache_name(url: str) -> str:
    path = "/" + url.split("greenhalghs.com/", 1)[1]
    return re.sub(r"[^a-z0-9]+", "_", path.strip("/")) or "root"


def fetch_text(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch_all(out_dir: Path) -> list:
    """Download robots.txt, the product sitemap and every product page it lists (skipping pages already in out_dir). One request per
    page, 1.1 s apart. Returns the product URLs in sitemap order. A page robots.txt disallows is not fetched (the run stops)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    robots = fetch_text(ROBOTS_URL)
    (out_dir / "robots.txt").write_bytes(robots)
    rules = robots_rfc.parse(robots.decode("utf-8", "replace"))
    time.sleep(1.1)
    if not robots_rfc.allowed(rules, "/product-sitemap.xml"):
        raise SystemExit("robots.txt disallows the product sitemap: stop and ask the founder")
    sitemap = fetch_text(SITEMAP_URL)
    (out_dir / "product-sitemap.xml").write_bytes(sitemap)
    urls = re.findall(r"<loc>([^<]+)</loc>", sitemap.decode("utf-8"))
    (out_dir / "urls.txt").write_text("\n".join(urls) + "\n", encoding="utf-8")
    for u in urls:
        path = "/" + u.split("greenhalghs.com/", 1)[1]
        if not robots_rfc.allowed(rules, path):
            raise SystemExit(f"robots.txt disallows {u}: stop and ask the founder")
        f = out_dir / (cache_name(u) + ".html")
        if f.exists() and f.stat().st_size > 10000:
            continue
        time.sleep(1.1)
        f.write_bytes(fetch_text(u))
    return urls


def _text(fragment: str) -> str:
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", fragment, flags=re.S)
    s = re.sub(r"<br\s*/?>|</p>|</li>|</tr>|</div>|</h\d>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    s = re.sub(r"[ \t\xa0]+", " ", s)
    return "\n".join(x.strip() for x in s.split("\n") if x.strip())


def parse_page(page: str, url: str) -> dict:
    """One product page -> {"url", "title", "sku", "crumbs", "unit" (None or {"kcal", "serving", "weight", "line"}), "per100_kcal"
    (the per-100 g table's kcal as printed, or None), "per100_caption", "per100_rows", "veg" (text of a 'suitable for' mark or ""),
    "ingredients" (text), "per_100g_only_line" (bool: the page says '<n> kcal per 100g')}."""
    m = re.search(r'<h1 class="product_title[^>]*>(.*?)</h1>', page, re.S)
    if not m:
        raise SystemExit(f"{url}: no product title: the page layout changed")
    title = _text(m.group(1))
    sku = re.search(r'<span class="sku">\s*([^<]*?)\s*</span>', page)
    crumbs = [_text(c) for c in re.findall(r'<span><a href="[^"]*">([^<]*)</a></span>', page.split('class="yoast-breadcrumb"', 1)[1].split("</div>", 1)[0])] \
        if 'class="yoast-breadcrumb"' in page else []
    page = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)  # JSON-LD and inline code repeat the numbers
    a = page.find('class="product_title')
    if a < 0:
        raise SystemExit(f"{url}: no product summary: the page layout changed")
    ends = [i for i in (page.find("reviews-row-section", a), page.find("<footer", a)) if i > a]  # the product summary and tabs end before the reviews
    region = page[a:min(ends)] if ends else page[a:]
    table = None
    tm = NUTRITION_BLOCK.search(region)
    per100_kcal, caption, rows = None, None, []
    if tm:
        block = tm.group(0)
        cap = re.search(r"<caption>(.*?)</caption>", block, re.S)
        caption = _text(cap.group(1)) if cap else None
        rows = [[_text(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)] for r in re.findall(r"<tr[^>]*>(.*?)</tr>", block, re.S)]
        for r in rows:
            if r and r[0] == "Energy" and len(r) > 1:
                km = re.search(r"/\s*(\d+)\s*kcal", r[1].replace("\n", " "))
                per100_kcal = km.group(1) if km else None
        region = NUTRITION_BLOCK.sub("\n", region)
    lines = _text(region).split("\n")
    unit, per100_line, found = None, False, []
    for ln in lines:
        if not ENERGY_WORDS.search(ln):
            continue
        if PER_100G_LINE.match(ln):
            per100_line = True
            continue
        hit = None
        for rx, serving, weight in UNIT_LINES:
            mm = rx.match(ln)
            if mm:
                hit = {"kcal": mm.group(1), "serving": serving, "weight": weight, "line": ln}
                break
        if hit:
            found.append(hit)
            continue
        sm = SENTENCE.search(ln)
        if sm:
            found.append({"sentence": sm.group(1), "line": ln})
            continue
        raise SystemExit(f"{url}: unrecognised energy wording {ln[:160]!r}: add it to UNIT_LINES (or PER_100G_LINE) after reading the page")
    structured = [f for f in found if "kcal" in f]
    if len({(f["kcal"], f["serving"]) for f in structured}) > 1:
        raise SystemExit(f"{url}: two different per-unit calorie lines: {[f['line'] for f in structured]}")
    if structured:
        unit = structured[0]
        for f in found:
            if "sentence" in f and f["sentence"] != unit["kcal"]:
                raise SystemExit(f"{url}: a sentence says {f['sentence']} kcal but the calorie line says {unit['kcal']}")
    elif any("sentence" in f for f in found):
        raise SystemExit(f"{url}: a sentence gives a calorie figure but there is no calorie line")
    text = _text(region)
    veg = ""
    vm = re.search(r"suitable for (vegetarians?|vegans?)", text, re.I)
    if vm:
        veg = vm.group(0)
    im = re.search(r"(?:Ingredients?:)(.*?)(?:\nAllergy advice|\nAllergy|\nAdvice|\nHeating|$)", text, re.S)
    ingredients = re.sub(r"\s+", " ", im.group(1)).strip() if im else ""
    return {"url": url, "title": title, "sku": sku.group(1) if sku else "", "crumbs": crumbs, "unit": unit, "per100_kcal": per100_kcal,
            "per100_caption": caption, "per100_rows": rows, "veg": veg, "ingredients": ingredients, "per_100g_only_line": per100_line}
