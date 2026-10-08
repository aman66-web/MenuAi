"""Reader for Brunning & Price's own per-pub menu pages (www.brunningandprice.co.uk), used by tools/uk_extract/brunning_and_price.py.

Source: each pub's menu pages, e.g. https://www.brunningandprice.co.uk/rakehall/menus/daily-menu/ (server-rendered HTML, no login). robots.txt
(read with the RFC 9309 matcher in robots_rfc.py) disallows only /downloads/newsletter/. One request per page, at most one every 1.1 s, a
normal browser User-Agent. The list of pubs is the "Other Pubs" drop-down in the footer of every page; the list of a pub's menus is the
menu navigation near the top of its pages.

What a dish line prints (all of it is copied, nothing converted):
    <p class="has-milk has-gluten ... may-egg ... dish259781 mb-1">
      <span class="font-weight-bold">Cauliflower and blue cheese soup,</span>   the dish name (absent for an add-on line)
      <span class="dishdesc">warm seeded roll</span>                              what comes with it (optional)
      <span class="dishsuitability">(v, gfa)</span>                               the chain's own marks: v, vg, gf, gfa (optional)
      <span class="dishcalories">621 kcal</span>                                  calories for the dish as served (absent for most drinks)
      <span class="ml-3">7.45</span>                                              the price (never read)
      <span class="dish-allergen-str">Contains: Milk / Lactose, Celery, ...</span>  (absent when the dish has none of the 14)
      <span class="dish-allergen-str">May contain: Eggs</span>                      (absent when none)
The class list holds the same allergens as the page's own allergen filter (has-<allergen> for "Contains", may-<allergen> for "May contain");
parse_page() stops the run if the printed text and the class list disagree for any dish.
Standard library only; runs on Python 3.9.
"""
from __future__ import annotations
import html
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402

SITE = "https://www.brunningandprice.co.uk"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
DELAY = 1.1
START_PUB = "rakehall"

# The pub's everyday menus we read (slug in /<pub>/menus/<slug>/). One-off event menus (curry week, pie week, buffets, murder-mystery
# evenings, Christmas Day, afternoon tea...) and the drinks list (prints no calories) are not read.
KIDS_SLUGS = ["childrens-menu", "kids-menu", "childrens-sunday-menu", "childrens-sunday", "sunday-childrens-menu", "childrens-menu-sunday",
              "the-red-lion-sunday-childrens-menu", "childrens-day-menu"]
SUNDAY_SLUGS = ["sunday-menu", "sunday-daily-menu", "sunday"]
PUDDING_SLUGS = ["pudding-menu", "puddings-cheese", "puddings-and-cheese", "puddings-menu", "pudding-and-cheese-menu", "pudding-cheese",
                 "desserts", "puddings", "desserts-and-coffees"]
BREAKFAST_SLUGS = ["breakfast-menu", "brunch-menu"]
READ_SLUGS = ["daily-menu"] + KIDS_SLUGS + SUNDAY_SLUGS + PUDDING_SLUGS + BREAKFAST_SLUGS

# printed allergen name -> the page filter's class suffix
FILTER_CLASS = {
    "Milk / Lactose": "milk", "Celery": "celery", "Cereals Containing Gluten": "gluten", "Sulphur Dioxide / Sulphites": "sulphites",
    "Eggs": "egg", "Fish": "fish", "Mustard": "mustard", "Soybeans": "soya", "Sesame": "sesame", "Peanuts": "peanuts",
    "Tree nuts": "treenuts", "Crustaceans": "crustaceans", "Molluscs": "molluscs", "Lupin": "lupin",
}
SPAN_CLASSES = {"font-weight-bold", "dishdesc", "dishsuitability", "dishcalories", "ml-3", "ml-2", "pr-3", "dish-allergen-str"}  # ml-2/ml-3 = price, pr-3 = a comma between flavours


def page_name(pub: str, slug: str) -> str:
    return f"{pub}__menus__{slug}.html"


def fetch_bytes(url: str, tries: int = 3) -> tuple:
    """(status, bytes). Retries only dropped connections; any HTTP status is returned to the caller (403/429 stop the run there)."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, b""
        except OSError:
            if attempt == tries - 1:
                raise
            time.sleep(5)
    raise AssertionError("unreachable")


class Fetcher:
    """Polite downloader: robots.txt first, every path checked against it, files already in `cache` are kept."""

    def __init__(self, cache: Path):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        robots = self.cache / "robots.txt"
        if not robots.exists():
            status, data = fetch_bytes(SITE + "/robots.txt")
            if status != 200:
                raise SystemExit(f"robots.txt answered HTTP {status}: stop and ask the founder")
            robots.write_bytes(data)
            time.sleep(DELAY)
        self.rules = robots_rfc.parse(robots.read_text(encoding="utf-8", errors="replace"))
        self.requests = 0

    def page(self, pub: str, slug: str) -> str:
        """The saved page text, downloading it first when it is not in the cache. '' when the site has no such page (HTTP 404)."""
        path = f"/{pub}/menus/{slug}/"
        f = self.cache / page_name(pub, slug)
        if f.exists():
            return f.read_text(encoding="utf-8")
        if not robots_rfc.allowed(self.rules, path):
            raise SystemExit(f"robots.txt disallows {path}: stop and ask the founder")
        status, data = fetch_bytes(SITE + path)
        self.requests += 1
        time.sleep(DELAY)
        if status == 404:
            return ""
        if status != 200:
            raise SystemExit(f"{SITE + path} answered HTTP {status}: do not work round it; stop and report the URL")
        f.write_bytes(data)
        return data.decode("utf-8")


def pub_list(page: str) -> list:
    """[(pub slug, printed name)] from the footer's 'Other Pubs' drop-down (the pub the page belongs to is not in it)."""
    i = page.find('id="property-dropdown"')
    j = page.find("</select>", i)
    if i < 0 or j < 0:
        raise SystemExit("the pub drop-down is no longer in the page footer: re-check the reader")
    pubs = [(m.group(1).strip("/"), html.unescape(re.sub(r"\s*\([\d.]+ miles\)$", "", m.group(2)))) for m in
            re.finditer(r'<option value="(/[^"/]+)">([^<]*)</option>', page[i:j])]
    return pubs


def menu_links(page: str, pub: str) -> list:
    """Slugs of the menus the pub's navigation lists, in order, without repeats."""
    top = page[: page.find('class="foodmenu')] if 'class="foodmenu' in page else page
    out = []
    for m in re.finditer(r'href="/' + re.escape(pub) + r'/menus/([^"/#]+)/"', top):
        if m.group(1) not in out:
            out.append(m.group(1))
    return out


def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


def parse_page(page: str, where: str) -> list:
    """Every dish line of a menu page: dicts with section, name, desc, suitability (list of marks), kcal (int or None), contains and may
    (lists of printed allergen names), classes. Stops when the markup is not what this reader knows."""
    i = page.find('class="foodmenu')
    if i < 0:
        return []
    body = page[i:]
    dishes, section, seen_p = [], None, 0
    for m in re.finditer(r"<h4[^>]*>(.*?)</h4>|<p class=\"([^\"]*)\">(.*?)</p>", body, flags=re.S):
        if m.group(1) is not None:
            section = _text(m.group(1))
            continue
        cls, inner = m.group(2), m.group(3)
        if not re.search(r"\bdish\d+\b", cls):
            continue
        seen_p += 1
        if section is None or section in ("Subscribe to our mailing list...", "Find us..."):
            raise SystemExit(f"{where}: a dish line outside any menu section")
        spans = re.findall(r'<span class="([^"]*)">(.*?)</span>', inner, flags=re.S)
        for c, _ in spans:
            if c.strip() not in SPAN_CLASSES and not c.startswith("font-italic small dishcalories") and not c.startswith("small dishsuitability") \
                    and not c.startswith("dish-allergen-str"):
                raise SystemExit(f"{where}: unknown span class {c!r} in a dish line")
        by = {"name": [], "desc": [], "suit": [], "kcal": [], "allergen": []}
        for c, t in spans:
            if "font-weight-bold" in c:
                by["name"].append(_text(t))
            elif "dishdesc" in c:
                by["desc"].append(_text(t))
            elif "dishsuitability" in c:
                by["suit"].append(_text(t))
            elif "dishcalories" in c:
                by["kcal"].append(_text(t))
            elif "dish-allergen-str" in c:
                by["allergen"].append(_text(t))
        if len(by["name"]) > 1 or len(by["desc"]) > 1 or len(by["suit"]) > 1 or len(by["kcal"]) > 1:
            raise SystemExit(f"{where}: a dish line with more than one name/description/mark/calorie span: {_text(inner)[:120]!r}")
        if not by["name"] and not by["desc"]:
            raise SystemExit(f"{where}: a dish line with neither a name nor a description")
        kcal = None
        if by["kcal"]:
            km = re.fullmatch(r"(\d+) kcal", by["kcal"][0])
            if not km:
                raise SystemExit(f"{where}: calories printed as {by['kcal'][0]!r}, not 'N kcal'")
            kcal = int(km.group(1))
        suit = []
        if by["suit"]:
            sm = re.fullmatch(r"\(([a-z]+(?:, [a-z]+)*)\)", by["suit"][0])
            if not sm:
                raise SystemExit(f"{where}: unknown suitability marks {by['suit'][0]!r}")
            suit = sm.group(1).split(", ")
            if not set(suit) <= {"v", "vg", "gf", "gfa"}:
                raise SystemExit(f"{where}: unknown suitability mark in {by['suit'][0]!r}")
        contains, may = [], []
        for a in by["allergen"]:
            am = re.fullmatch(r"(Contains|May contain): (.+)", a)
            if not am:
                raise SystemExit(f"{where}: allergen line {a!r} is neither 'Contains:' nor 'May contain:'")
            words = [w.strip() for w in am.group(2).split(",")]
            for w in words:
                if w not in FILTER_CLASS:
                    raise SystemExit(f"{where}: unknown allergen word {w!r} (add it to the reader and to common._A if it is one of the 14)")
            target = contains if am.group(1) == "Contains" else may
            if target:
                raise SystemExit(f"{where}: two '{am.group(1)}' lines in one dish")
            target.extend(words)
        # the page's own allergen filter must say the same
        has = {c[4:] for c in cls.split() if c.startswith("has-")} - {"allergens", "maycontains"}
        mays = {c[4:] for c in cls.split() if c.startswith("may-")} - {"allergens", "maycontains"}
        if has != {FILTER_CLASS[w] for w in contains} or mays != {FILTER_CLASS[w] for w in may}:
            raise SystemExit(f"{where}: printed allergens and the filter classes disagree for {_text(inner)[:100]!r}")
        dishes.append({"section": section, "name": by["name"][0] if by["name"] else "", "desc": by["desc"][0] if by["desc"] else "",
                       "suit": suit, "kcal": kcal, "contains": contains, "may": may})
    if len(dishes) != seen_p:
        raise SystemExit(f"{where}: parsed {len(dishes)} of {seen_p} dish lines")
    return dishes
