"""Reader for Shah's Halal Food UK's own product pages (shahshalalfood.co.uk, a WooCommerce site). Used by shahs_halal_food.py.

Every menu product has a server-rendered page https://shahshalalfood.co.uk/our-menu/<slug>/ (listed in the site's product sitemap,
https://shahshalalfood.co.uk/wp-sitemap-posts-product-1.xml, 31 URLs on 2026-10-08). A page has:
  * <h1 class="product_title ...">Name</h1>, then <span>498.2 Cal / per serving</span> (or "44 kcal / per can"): the headline;
  * for most food (not sauces, drinks, pita, the build-your-own salad) a "Nutrition Summary" accordion in the plain HTML: one panel
    (<div class="col-sm-12">, sometimes headed <h6>Per Serving</h6>) or two (<div class="col-sm-6"> headed "Per Serving" and
    "Per Container"). A panel has four big counts (Calories, Total Carbs, Total Fat, Protein) and a list of "Title: value" rows.
Values keep the page's own text ("498.2 Cal.", "55.34g", "927.48mg", "~560.3 kcal", "<1g"); nothing is converted here.
"""
from __future__ import annotations
import html
import re
import time
import urllib.request
from pathlib import Path

HOST = "https://shahshalalfood.co.uk"
SITEMAP_URL = HOST + "/wp-sitemap-posts-product-1.xml"
MENU_URL = HOST + "/menu/"
ALLERGEN_URL = HOST + "/allergen-infromation/"  # the site's own spelling
# robots.txt (read 2026-10-08): "User-agent: *" disallows /wp-content/uploads/wc-logs/, .../woocommerce_transient_files/,
# .../woocommerce_uploads/, "/*?add-to-cart=", "/*?*add-to-cart=" and /wp-admin/ (allowing /wp-admin/admin-ajax.php). Product pages,
# the sitemap, /menu/ and the allergen page are allowed. We never use a query string and wait 1.1 s between requests.
DELAY = 1.1
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"


def fetch(url: str, dest: Path) -> None:
    """One polite download: sleeps first, normal browser User-Agent, no query strings (robots.txt)."""
    if "?" in url:
        raise SystemExit("refusing a URL with a query string (robots.txt disallows add-to-cart queries): " + url)
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.read())


def check_robots(text: str) -> None:
    """Stop if robots.txt no longer matches what was read on 2026-10-08 (read it again before fetching)."""
    sys_path = Path(__file__).parent
    import sys
    if str(sys_path) not in sys.path:
        sys.path.insert(0, str(sys_path))
    import robots_rfc
    rules = robots_rfc.parse(text)
    for path in ["/our-menu/chicken-gyro/", "/wp-sitemap-posts-product-1.xml", "/menu/", "/allergen-infromation/"]:
        if not robots_rfc.allowed(rules, path):
            raise SystemExit("robots.txt now disallows " + path + ": read it before fetching anything")


def product_urls(sitemap_xml: str) -> list[str]:
    urls = re.findall(r"<loc>([^<]+)</loc>", sitemap_xml)
    return [u.strip() for u in urls]


def slug_of(url: str) -> str:
    m = re.match(re.escape(HOST) + r"/our-menu/([a-z0-9-]+)/$", url)
    if not m:
        raise SystemExit("unexpected product URL: " + url)
    return m.group(1)


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment)).replace("\xa0", " ")).strip()


def _panel(block: str, where: str) -> dict:
    """One panel -> {'label': 'Per Serving' or None, 'big': {Calories, Total Carbs, Total Fat, Protein}, 'rows': {title: value}}."""
    label = re.search(r"<h6>(.*?)</h6>", block, re.S)
    big = {}
    for count, title in re.findall(r'<span class="count">(.*?)</span><span class="title">(.*?)</span></div>', block, re.S):
        title = _text(title)
        if title in big:
            raise SystemExit(where + ": panel prints " + repr(title) + " twice")
        big[title] = _text(count)
    rows = {}
    for title, count in re.findall(r'<span class="title">([^<]*?)</span><span class="count">(.*?)</span>', block, re.S):
        title = _text(title).rstrip(":").strip()
        if title in rows:
            raise SystemExit(where + ": panel prints " + repr(title) + " twice")
        rows[title] = _text(count)
    return {"label": _text(label.group(1)) if label else None, "big": big, "rows": rows}


def read_product(text: str, where: str) -> dict:
    """{'name', 'headline' (the text beside the name, e.g. '498.2 Cal / per serving'), 'category', 'panels': [panel...]} ."""
    name = re.search(r'<h1 class="product_title entry-title">(.*?)</h1>', text, re.S)
    if not name:
        raise SystemExit(where + ": product title not found")
    # Between the title and the "Category:" line: the heading span ("460 Cal / per serving"), then the description. Some pages wrap the
    # span in an extra <div class="text">, so both are found inside this one block instead of by exact markup.
    about = text[text.index("</h1>") + 5:text.index('<div class="product_meta">')] if '<div class="product_meta">' in text else ""
    head = re.search(r"<span>([^<]*?/\s*per [^<]*?)</span>", about)
    desc_html = about.replace(head.group(0), "") if head else about
    cat = re.search(r'<span class="posted_in">Category:\s*<a [^>]*>(.*?)</a>', text, re.S)
    out = {"name": _text(name.group(1)), "headline": _text(head.group(1)) if head else "",
           "category": _text(cat.group(1)) if cat else "", "description": _text(desc_html), "panels": []}
    i = text.find('<div class="prod-nutri-info">')
    if i < 0:
        return out
    j = text.find('id="allergen-summary"', i)
    k = text.find('id="nutri-summary"', i)
    if j < 0 or k < 0 or k > j:
        raise SystemExit(where + ": nutrition accordion layout changed")
    seg = text[k:j]
    blocks = re.split(r'<div class="col-sm-(?:6|12)">', seg)[1:]
    if len(blocks) not in (1, 2):
        raise SystemExit(where + ": expected 1 or 2 nutrition panels, found " + str(len(blocks)))
    out["panels"] = [_panel(b, where) for b in blocks]
    return out


def read_allergen_matrix(text: str) -> dict:
    """{ITEM NAME: {column: mark}} from the allergen page's table (marks: '✓' contains, 'M' may contain, 'R', 'GM', 'C'). Only used
    to compare with the product pages: allergens are not published for this chain (the two sources disagree)."""
    i = text.find("<table")
    j = text.find("</table>", i)
    tb = re.sub(r"<noscript>.*?</noscript>", "", text[i:j], flags=re.S)
    cols = ["none", "celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "peanuts", "nuts",
            "sesame", "soya", "sulphites"]
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)
    if len(re.findall(r"<th[^>]*>", rows[0])) != 16:
        raise SystemExit("allergen table: expected 16 header cells")
    out = {}
    for r in rows[1:]:
        cells = re.findall(r"<td([^>]*)>(.*?)</td>", r, re.S)
        if not cells or "colspan" in cells[0][0]:
            continue
        if len(cells) != 16:
            raise SystemExit("allergen table row has " + str(len(cells)) + " cells: " + _text(cells[0][1]))
        out[_text(cells[0][1])] = {c: _text(v) for c, (_, v) in zip(cols, cells[1:]) if _text(v)}
    return out
