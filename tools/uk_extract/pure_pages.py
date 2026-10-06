"""Read Pure's official menu pages (https://www.pure.co.uk/menus/<page>/) into the items each page shows.

Used by tools/uk_extract/pure.py. Standard library only. Numbers are returned exactly as the page prints them
(text such as "500", "15.9", "<0.5"): nothing is converted, rounded or estimated here.

Where the data comes from: every menu page is a static, server-rendered WordPress page. The visible grid lists the page's
items under <h3> section headings (each tile links to /menu-item/<slug>/), and a hidden block further down holds one
<article class="menu-item-details"> per item with its name, V / VG marks, and one or more "Nutritional Information" tables
(columns "Per portion" and "Per 100g"). An item with several tables labels each one with an <h5> (Regular / Large,
Dressed / Undressed, Organic Dairy Milk / Oat Milk). A tile is matched to its article by the item's /menu-item/ URL.
Only the "Per portion" column is read here.

Pages that hold the menu: PAGES below (one request per page; robots.txt asks for a 10 second crawl delay). Save each
once into a folder as <page>.html and give that folder to pure.py. The Catering and Events Packages pages are not read.
"""
import html
import re
from pathlib import Path

PAGES = ["hot-lunch", "hot-drinks", "salads-grain-bowls", "cold-breakfast", "hot-breakfast", "breads", "sides-desserts",
         "snacks-treats", "cold-drinks"]
SEASON_PAGE = "new-this-season"  # re-lists items that sit on the pages above (plus catering): used only as a cross-check
URL = "https://www.pure.co.uk/menus/{}/"
ROW_LABELS = {  # the page's own row label -> our key
    "Energy (KCal)": "kcal", "Energy (KJ)": "kj", "Fat (G)": "fat", "Of which is saturates (G)": "sat",
    "Carbohydrate (G)": "carbs", "Of which sugars (G)": "sugars", "Fibre (G)": "fibre", "Protein (G)": "protein", "Salt (G)": "salt",
}
FIXED_H5 = {"Nutritional Information", "Allergen Info", "Dietary Preferences", "Full Ingredients List"}


def text(s: str) -> str:
    """Tags removed, entities decoded, whitespace collapsed (a no-break space becomes a plain space)."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def read_page(path: Path, strict: bool = True) -> list[dict]:
    """Items of one page in the page's own order. Each: page, section, name, slug, marks (set of the page's own V/VG titles),
    ingredients (text), tables [(label, {key: (per portion text, per 100g text)})]. `marks` holds the page's own "Vegetarian" /
    "Vegan" marks, from either place the page puts them."""
    h = Path(path).read_text(encoding="utf-8")
    cut = h.find("<div hidden>")
    if cut == -1:
        raise ValueError(f"{path}: no hidden item-details block: the layout changed")
    start = h.rfind("</nav>", 0, cut)
    grid = h[start:cut]
    # visible grid: section headings and tiles in order
    tiles: list[tuple[str, str, str]] = []  # (section, slug, tile title)
    section = ""
    for m in re.finditer(r'<h3[^>]*>(.*?)</h3>|<a href="/menu-item/([^"/]+)/" title="([^"]*)" itemprop="url">', grid, re.S):
        if m.group(1) is not None:
            section = text(m.group(1))
        else:
            tiles.append((section, m.group(2), text(m.group(3))))
    articles = {}
    for a in re.findall(r'<article class="menu-item-details".*?</article>', h[cut:], re.S):
        um = re.search(r'<meta itemprop="url" content="/menu-item/([^"/]+)/?"', a)
        if not um:
            raise ValueError(f"{path}: an item-details article has no url")
        if um.group(1) in articles:
            raise ValueError(f"{path}: two articles for {um.group(1)}")
        articles[um.group(1)] = a
    tile_urls = {t[1] for t in tiles}
    if len(tile_urls) != len(tiles) or not tile_urls <= set(articles) or (strict and tile_urls != set(articles)):
        raise ValueError(f"{path}: {len(tiles)} tiles but {len(articles)} articles, or their urls differ: the layout changed")
    out = []
    for section, slug, tile_title in tiles:
        a = articles[slug]
        name = text(re.search(r'<h2 itemprop="name">(.*?)</h2>', a, re.S).group(1))
        # the page marks diets twice: V / VG abbreviations by the name, and Vegetarian / Vegan entries in the tag lists
        marks = {m for m in re.findall(r'<abbr title="([^"]*)"', a)}
        for ul in re.findall(r'<ul class="tags".*?</ul>', a, re.S):
            marks |= {t for t in (text(x) for x in re.findall(r"<li><a>(.*?)</a></li>", ul, re.S)) if t in ("Vegetarian", "Vegan")}
        nut = re.search(r'<div itemprop="nutrition".*?</table>\s*</div>|<div itemprop="nutrition"[^>]*>\s*</div>', a, re.S)
        nut_html = nut.group(0) if nut else ""
        # one <h5> label before each table inside the nutrition block (the first, "Nutritional Information", is the default)
        tables = []
        for label_html, tbl in re.findall(r"<h5>(.*?)</h5>\s*(<table.*?</table>)", nut_html, re.S):
            rows = {}
            for tr in re.findall(r"<tr>(.*?)</tr>", tbl, re.S):
                th = re.search(r'<th scope="row">(.*?)</th>', tr, re.S)
                if not th:
                    continue
                key = ROW_LABELS.get(text(th.group(1)))
                if key is None:
                    raise ValueError(f"{path}: {name!r} has an unknown row label {text(th.group(1))!r}")
                tds = [text(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
                if len(tds) != 2 or key in rows:
                    raise ValueError(f"{path}: {name!r} row {key} has {len(tds)} cells or repeats")
                rows[key] = (tds[0], tds[1])
            if set(rows) != set(ROW_LABELS.values()):
                raise ValueError(f"{path}: {name!r} table has rows {sorted(rows)}")
            heads = [text(x) for x in re.findall(r"<thead>.*?</thead>", tbl, re.S)[0:1] for x in re.findall(r"<th[^>]*>(.*?)</th>", x, re.S)]
            if [x for x in heads if x] != ["Per portion", "Per 100g"]:
                raise ValueError(f"{path}: {name!r} table columns are {heads}, not Per portion / Per 100g")
            label = text(label_html)
            tables.append(("" if label == "Nutritional Information" else label, rows))
        n_tables = len(re.findall(r"<table", nut_html))
        if n_tables != len(tables):
            raise ValueError(f"{path}: {name!r} has {n_tables} tables but {len(tables)} were read")
        ing = re.search(r"<h5>Full Ingredients List</h5>\s*<div>(.*?)</div>", a, re.S)
        out.append({"page": Path(path).stem, "section": section, "name": name, "slug": slug, "tile": tile_title,
                    "marks": marks, "ingredients": text(ing.group(1)) if ing else "", "tables": tables})
    return out


def read_pages(folder: Path) -> list[dict]:
    items = []
    for page in PAGES:
        items.extend(read_page(Path(folder) / f"{page}.html"))
    return items


def read_season(folder: Path) -> list[dict]:
    return read_page(Path(folder) / f"{SEASON_PAGE}.html", strict=False)
