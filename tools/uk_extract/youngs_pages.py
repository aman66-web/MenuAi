"""Readers for Young's pubs' own menu pages (used by tools/uk_extract/youngs.py).

Young's pubs run on two kinds of site (tools/uk_extract/youngs_fetch.py downloads them):

1. "Headless" sites (Next.js, built by Propeller). The page's data is in the React flight payload (`self.__next_f.push([1,"..."])`):
       "menus":[{"acf":{"menuCategoryName":"Food","menuPdf":false,"menuTitle":"A La Carte","menuCategories":[
           {"categoryTitle":"Starters","menuItems":[{"title":"Soup of the Day (vg)","description":"Campaillou","price":"7.5",
             "calories":"281","dietary":["ve"], ...}]}]}}]
   every menu tab (A La Carte, Sunday, Pudding, Children's...) is in the payload, whichever tab is open. `title` is the bold dish name as
   printed (marks such as (v), (vg), (gf) are part of it), `description` is what comes with it, `calories` is the figure the page shows
   beside the dish ("454", sometimes "1157Kcal"), `dietary` is the page's own filter mark ("v" vegetarian, "ve" vegan).
2. Older WordPress sites (propcom template): `<div class="category">` blocks with `<span class="name ...">` and
   `<p class="description ...">` where the calories are written inside the description ("/ 910 kcals", "(616Kcal)").
Standard library only; runs on Python 3.9.
"""
from __future__ import annotations
import html as htmllib
import json
import re
import urllib.parse

def _text(fragment: str) -> str:
    t = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", htmllib.unescape(t)).strip()


_PUSH = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')


def flight_text(page: str) -> str:
    """The page's React flight payload as one string ('' when the page is not a headless site)."""
    parts = []
    for m in _PUSH.finditer(page):
        try:
            parts.append(json.loads(m.group(1)))
        except ValueError:
            raise SystemExit("a flight chunk is not valid JSON: the site's page format changed, re-check youngs_pages.py")
    return "".join(parts)


def headless_menus(page: str) -> list:
    """-> [{'group': 'Food', 'menu': 'A La Carte', 'pdf': False|url, 'categories': [{'title', 'items': [dict]}]}], or [] when the page has no
    menus block. Raises when the block is there but not in the shape this reader knows."""
    blob = flight_text(page)
    i = blob.find('"menus":[{"acf":')
    if i < 0:
        return []
    dec = json.JSONDecoder()
    try:
        arr, _ = dec.raw_decode(blob[i + len('"menus":'):])
    except ValueError:
        raise SystemExit("the menus block is not plain JSON: the site's page format changed, re-check youngs_pages.py")
    out = []
    for m in arr:
        acf = m.get("acf") if isinstance(m, dict) else None
        if not isinstance(acf, dict) or "menuTitle" not in acf:
            raise SystemExit(f"a menus entry has an unknown shape: {str(m)[:120]}")
        cats = []
        for c in acf.get("menuCategories") or []:
            items = []
            for it in c.get("menuItems") or []:
                if not isinstance(it, dict) or "title" not in it:
                    raise SystemExit(f"a menu item has an unknown shape: {str(it)[:120]}")
                items.append({"title": _text(it.get("title") or ""), "description": _text(it.get("description") or ""), "calories": _text(str(it.get("calories") or "")),
                              "dietary": list(it.get("dietary") or []), "price": str(it.get("price") or ""),
                              "multi": bool(it.get("multiplePrices")) or bool(it.get("prices"))})
            cats.append({"title": c.get("categoryTitle") or "", "items": items})
        out.append({"group": acf.get("menuCategoryName") or "", "menu": acf.get("menuTitle") or "", "pdf": acf.get("menuPdf") or False,
                    "categories": cats})
    return out


# ---------------------------------------------------------------- legacy (propcom) sites
def legacy_menus(page: str) -> list:
    """Same shape as headless_menus for the older sites (the menu names come from the tab buttons, matched by data-menu-id). Calories are NOT
    split off here: they sit inside `description` (and sometimes in the name); the caller reads them with calories_in_text()."""
    page = re.sub(r"\s+", " ", page)
    names = {m.group(1): _text(m.group(2)) for m in
             re.finditer(r'<a [^>]*class="menu-trigger js-menu-trigger"[^>]*data-menu-id="(\d+)"[^>]*>(.*?)</a>', page, re.S)}
    out = []
    parts = re.split(r'<div class="menu js-menu[^"]*"[^>]*data-menu-id="(\d+)"[^>]*>', page)
    for k in range(1, len(parts), 2):
        mid, blk = parts[k], parts[k + 1]
        cats = []
        for cat in re.split(r'<div class="category">', blk)[1:]:
            ch = re.search(r'<h2[^>]*>(.*?)</h[26]>', cat, re.S)
            note = re.search(r'<div class="category__header">.*?<p[^>]*>(.*?)</p>', cat, re.S)
            items = []
            for it in re.split(r'<div class="item">', cat)[1:]:
                nm = re.search(r'<span class="name[^"]*"[^>]*>(.*?)</span>', it, re.S)
                ds = re.search(r'<p class="description[^"]*"[^>]*>(.*?)</p>', it, re.S)
                if not nm:
                    continue
                items.append({"title": _text(nm.group(1)), "description": _text(ds.group(1)) if ds else "", "calories": "", "dietary": [],
                              "price": "", "multi": len(re.findall(r'<li[^>]*class="item__price\b', it)) > 1})
            cats.append({"title": _text(ch.group(1)) if ch else "", "note": _text(note.group(1)) if note else "", "items": items})
        out.append({"group": "", "menu": names.get(mid, "(menu " + mid + ")"), "pdf": False, "categories": cats})
    return out


# ---------------------------------------------------------------- which page holds a pub's menus
# The page that lists a pub's menus is one of a few first-level paths on the pub's own site ("/food-drink", "/food-and-drink", "/menus"...).
# Sub-paths (/food-drink/sunday on the older sites, /menus/wine-list/... on the newer) show the same data or one PDF, so they are not read.
MENU_PATH = re.compile(r"^/(?:food[-_]?(?:and|&|n)?[-_]?drinks?|food|foodanddrink|menus?|our[-_]?menus?|eat|eat[-_]?(?:and|&|n)?[-_]?drinks?|dining|"
                       r"kitchen|the[-_]menus?|food[-_]menus?|food[-_]and[-_]drink[-_]menus?)$", re.I)
# a custom first-level page that is plainly the pub's food-and-drink page ("/the-bulls-head-pub-food-drink-in-barnes"): used only when no plain
# path above was found, and never for an event, offer or seasonal page
MENU_PATH_LOOSE = re.compile(r"^/[a-z0-9-]*(?:food[-_]?(?:and|&|n)?[-_]?drinks?|[-_]menus?)[a-z0-9-]*$", re.I)
NOT_MENU_PATH = re.compile(r"christmas|festive|xmas|party|parties|sunday|roast|wine|cocktail|kids|gift|offer|event|wedding|campaign|film|"
                           r"launch|boxing|easter|valentine|mother|father|halloween|bonfire|new-?year|afternoon-tea|brunch|breakfast|quiz|live", re.I)


def menu_page_urls(home: str, final_url: str) -> list:
    """Same-host first-level menu pages for a pub, from its home page (links in the HTML, then addresses written inside the page's data),
    plain paths first, in the order first seen (https only, no fragment/query)."""
    p0 = urllib.parse.urlsplit(final_url)
    host = re.sub(r"^www\.", "", p0.netloc.lower())
    cands = []
    for href in re.findall(r'href="([^"#?]+)"', home):
        cands.append(urllib.parse.urljoin(final_url, htmllib.unescape(href)))
    # addresses inside the page's JSON data (escaped slashes), e.g. "https:\\/\\/www.pub.com\\/food-drink"
    flat = home.replace("\\/", "/")
    for m in re.finditer(r'https?://([a-z0-9.-]+)(/[A-Za-z0-9_-]+/?)(?=["\'<\\\s,)])', flat):
        cands.append(f"https://{m.group(1)}{m.group(2)}")
    plain, loose = [], []
    for u in cands:
        p = urllib.parse.urlsplit(u)
        if p.scheme not in ("http", "https") or re.sub(r"^www\.", "", p.netloc.lower()) != host:
            continue
        path = p.path.rstrip("/")
        url = f"https://{p.netloc}{p.path}"
        if MENU_PATH.match(path):
            if url.rstrip("/") not in [x.rstrip("/") for x in plain]:
                plain.append(url)
        elif MENU_PATH_LOOSE.match(path) and not NOT_MENU_PATH.search(path):
            if url.rstrip("/") not in [x.rstrip("/") for x in loose]:
                loose.append(url)
    return plain or loose


# ---------------------------------------------------------------- calories and marks
_KCAL = re.compile(r"(?<![\d.,])(\d{1,2},\d{3}|\d{2,4})\s*(?:k\s?cals?|calories|cals?)\b|\b(?:k\s?cals?|calories|cals?)\s*[:=]?\s*(\d{1,2},\d{3}|\d{2,4})(?![\d.]*\s*(?:g|mg)\b)", re.I)
_BARE = re.compile(r"^\s*(\d{1,2},\d{3}|\d{2,4})\s*$")
_EMPTY_BRACKETS = re.compile(r"\(\s*[/,&+\-]*\s*\)")


def kcal_figures(*texts: str) -> list:
    """Every calorie figure written with a unit ('616Kcal', '(131 Kcal)', 'kcal 377') in the texts, as ints, in order."""
    out = []
    for t in texts:
        for m in _KCAL.finditer(t or ""):
            out.append(int((m.group(1) or m.group(2)).replace(",", "")))
    return out


def strip_kcal(text: str) -> str:
    """The text with calorie figures (and the brackets or slash that held them) taken out, spaces tidied."""
    t = _KCAL.sub(" ", text or "")
    t = _EMPTY_BRACKETS.sub(" ", t)
    t = re.sub(r"(?:^|\s)[/|\-\u2013\u2014]\s*(?=$|\s*[/|\-\u2013\u2014]|\s*\))", " ", t)
    t = re.sub(r"\s+([,.;:)])", r"\1", t)
    t = re.sub(r"\(\s+", "(", t)
    t = re.sub(r"\s+", " ", t).strip(" /|-,;:\u2013\u2014")
    return t.strip()


def print_calories(title: str, description: str, field: str) -> tuple:
    """-> (kcal or None, problem). One dish print's calories from the three places the pages put them (the page's calories field, the
    name, the description). Two different figures, or a field that is not a plain figure, is a problem: the print is not used."""
    figs = set(kcal_figures(title, description))
    field = (field or "").strip()
    if field:
        f2 = kcal_figures(field)
        if f2:
            if len(f2) > 1 and len(set(f2)) > 1:
                return None, f"calories field {field!r} holds several figures"
            figs.add(f2[0])
        else:
            m = _BARE.match(field)
            if m:
                figs.add(int(m.group(1).replace(",", "")))
            else:
                return None, f"calories field {field!r} is not a single figure"
    if not figs:
        return None, ""
    if len(figs) > 1:
        return None, f"different calorie figures in one print: {sorted(figs)}"
    return next(iter(figs)), ""


_MARKS = re.compile(r"\(([A-Za-z]{1,4}(?:\s*[/,&+]\s*[A-Za-z]{1,4})*)\)")
VEG_MARKS = {"v", "vg", "ve", "veg"}


def title_marks(title: str) -> set:
    """The chain's own diet marks written in brackets in a name: '(vg/gf)' -> {'vg', 'gf'}."""
    out = set()
    for m in _MARKS.finditer(title or ""):
        for tok in re.split(r"\s*[/,&+]\s*", m.group(1).lower()):
            out.add(tok)
    return out
