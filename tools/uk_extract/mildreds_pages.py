"""Reader for Mildreds' own restaurant pages (www.mildreds.com/<site>/). Used by mildreds.py.

Each of the five London pages (Soho, Camden, Covent Garden, King's Cross, Victoria) is server-rendered HTML from the chain's web
platform. The menus sit in tabs: <section id="..." class="tabs-panel ..."> holds an <h2> (menu title) and, per heading, a
<section class="menu-section"> with <div class="menu-section__header"><h2>heading</h2>subtitle</div> and a <ul> of
<li class="menu-item"> entries:
    <p class="menu-item__heading--name">name</p>            (always)
    <p class="menu-item__details--description">text</p>     (optional)
    <p class="menu-item__details--price">...</p>            (optional; prices are not used)
    <p class="menu-item__details--addon">(444 kcal)</p>     (optional; calories, or the text of an add-on such as "add pita $ 3.90")
Nothing is read from images, scripts or by position. The reader stops if the page's structure is not the one described.
"""
from __future__ import annotations
import html
import re
import time
import urllib.request
from pathlib import Path

HOST = "https://www.mildreds.com"
# robots.txt (checked 2026-10-08): "user-agent: *" with no Disallow lines, and a sitemap. We still wait 1.2 s between requests.
SITES = [("soho", "Soho"), ("camden", "Camden"), ("covent-garden", "Covent Garden"), ("kings-cross", "King's Cross"), ("victoria", "Victoria")]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

_PANEL = re.compile(r'<section id="([^"]+)"\s+class="tabs-panel[^"]*"')
_TAB = re.compile(r'<a id="tab-([^"]+)"\s+class="btn btn-tabs[^"]*"')
_SECTION = re.compile(r'<section class="menu-section[^"]*">')
_ITEM = re.compile(r'<li class="menu-item[^"]*">(.*?)</li>', re.S)


def page_url(site: str) -> str:
    return f"{HOST}/{site}/"


def fetch(site: str, dest: Path) -> None:
    """One polite download of one location page."""
    time.sleep(1.2)
    req = urllib.request.Request(page_url(site), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())


def clean(s: str) -> str:
    """Tags out, entities decoded, white space collapsed (the text is otherwise as printed)."""
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s).replace("\xa0", " ")).strip()


def norm(s: str) -> str:
    """Key for comparing a printed name: lower case, curly quote straightened, white space collapsed. Accents are kept."""
    return re.sub(r"\s+", " ", s.lower().replace("’", "'")).strip()


def read_page(text: str, where: str) -> list[dict]:
    """Every menu item of one location page -> dicts: panel (tab id), menu (the tab's h2), section (heading), name, desc, price,
    addon (the add-on offers' text, '' if none), kcal (a list of integers when the item prints calories, else [])."""
    panels = [(m.start(), m.group(1)) for m in _PANEL.finditer(text)]
    tabs = [m.group(1) for m in _TAB.finditer(text)]
    if not panels or [p for _, p in panels] != tabs:
        raise SystemExit(f"{where}: the menu tabs and the menu panels do not match ({tabs} vs {[p for _, p in panels]}): the page layout changed")
    bounds = panels + [(len(text), None)]
    out = []
    for (start, pid), (end, _) in zip(bounds, bounds[1:]):
        chunk = text[start:end]
        h2 = re.search(r"<h2>(.*?)</h2>", chunk, re.S)
        if not h2:
            raise SystemExit(f"{where}: panel {pid} has no title")
        menu = clean(h2.group(1))
        secs = [m.start() for m in _SECTION.finditer(chunk)] + [len(chunk)]
        for a, b in zip(secs, secs[1:]):
            sec = chunk[a:b]
            header = re.search(r'<div class="menu-section__header">\s*<h2>(.*?)</h2>', sec, re.S)
            has_items = "<li" in sec
            if not header:
                if has_items:
                    raise SystemExit(f"{where}: panel {pid} has menu items outside a headed section")
                continue  # the plain-text footer section (service charge, allergy notice)
            heading = clean(header.group(1))
            for lm in _ITEM.finditer(sec):
                li = lm.group(1)

                def field(cls: str) -> str:
                    m = re.search(r'class="[^"]*%s[^"]*">(.*?)</p>' % re.escape(cls), li, re.S)
                    return clean(m.group(1)) if m else ""
                name = field("menu-item__heading--name")
                if not name:
                    raise SystemExit(f"{where}: an item in {pid} / {heading} has no name")
                # An item can carry several addon paragraphs: add-on offers ("add paratha $ 3.90") and, last, its calories.
                addons = [clean(m.group(1)) for m in re.finditer(r'class="[^"]*menu-item__details--addon[^"]*">(.*?)</p>', li, re.S)]
                kcal_lines = [a for a in addons if "kcal" in a.lower()]
                if len(kcal_lines) > 1:
                    raise SystemExit(f"{where}: {name!r} has {len(kcal_lines)} calorie lines {kcal_lines}")
                kcal = []
                if kcal_lines:
                    m = re.fullmatch(r"\((\d+) kcal(?:/(\d+) kcal)*\)", kcal_lines[0])
                    if m is None:
                        raise SystemExit(f"{where}: {name!r} has an unexpected calorie text {kcal_lines[0]!r}")
                    kcal = [int(x) for x in re.findall(r"(\d+) kcal", kcal_lines[0])]
                out.append(dict(panel=pid, menu=menu, section=heading, name=name, desc=field("menu-item__details--description"),
                                price=field("menu-item__details--price"),
                                addon=" | ".join(a for a in addons if "kcal" not in a.lower()), kcal=kcal))
    # Every list item must have been read, and every "kcal" on the page must sit in an item's addon paragraph.
    on_page = len(re.findall(r'<li class="menu-item', text))
    if on_page != len(out):
        raise SystemExit(f"{where}: {on_page} list items on the page but {len(out)} read")
    in_addons = sum(len(r["kcal"]) for r in out)
    mentions = len(re.findall("kcal", text, re.I))
    if in_addons != mentions:
        raise SystemExit(f"{where}: the page mentions calories {mentions} times but only {in_addons} are in item lines")
    return out
